import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  for (const line of env.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const i = t.indexOf("=");
      if (i > 0) {
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[k] = v;
      }
    }
  }
} catch { /* rely on env */ }

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function main() {
  console.log("\n🔄 Running migration 012 → leads.scanned_data + DL_SCAN / VIN_SCAN field types\n");

  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS scanned_data JSONB`;
  console.log("  ✓ Added leads.scanned_data (JSONB)");

  await sql`COMMENT ON COLUMN leads.scanned_data IS 'Structured payload from provider-side scanners (DL, VIN, etc.). See migration 012.'`;
  console.log("  ✓ Added column comment");

  await sql`ALTER TABLE lead_criteria_fields DROP CONSTRAINT IF EXISTS lead_criteria_fields_field_type_check`;
  await sql`ALTER TABLE lead_criteria_fields ADD CONSTRAINT lead_criteria_fields_field_type_check CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY', 'PHONE_CALL', 'DL_SCAN', 'VIN_SCAN'))`;
  console.log("  ✓ Expanded field_type CHECK to include DL_SCAN, VIN_SCAN");

  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'scanned_data'
  `;
  console.log("\n📊 New column:");
  for (const c of cols) console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}`);

  const constraint = await sql`
    SELECT check_clause FROM information_schema.check_constraints
    WHERE constraint_name = 'lead_criteria_fields_field_type_check'
  `;
  console.log("\n📋 Updated field_type CHECK:");
  for (const c of constraint) console.log(`  ${c.check_clause}`);

  console.log("\n✅ Migration 012 complete.\n");
}

main().catch((e) => { console.error("Migration 012 failed:", e); process.exit(1); });
