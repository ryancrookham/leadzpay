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
  console.log("\n🔄 Running migration 011 → per-leg call verification\n");

  await sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS provider_answered BOOLEAN`;
  console.log("  ✓ Added provider_answered");
  await sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS provider_duration_seconds INTEGER`;
  console.log("  ✓ Added provider_duration_seconds");
  await sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS buyer_answered BOOLEAN`;
  console.log("  ✓ Added buyer_answered");
  await sql`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS buyer_duration_seconds INTEGER`;
  console.log("  ✓ Added buyer_duration_seconds");

  await sql`COMMENT ON COLUMN call_sessions.provider_answered IS 'True when provider leg reported ANSWERED via Sinch DiCE.'`;
  await sql`COMMENT ON COLUMN call_sessions.buyer_answered IS 'True when buyer leg reported ANSWERED via Sinch DiCE.'`;
  await sql`COMMENT ON COLUMN call_sessions.provider_duration_seconds IS 'Duration of the provider leg (from Sinch DiCE).'`;
  await sql`COMMENT ON COLUMN call_sessions.buyer_duration_seconds IS 'Duration of the buyer leg (from Sinch DiCE).'`;

  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='call_sessions' AND column_name IN
      ('provider_answered','provider_duration_seconds','buyer_answered','buyer_duration_seconds')
    ORDER BY column_name
  `;
  console.log("\n📊 New columns:");
  for (const c of cols) console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}`);

  console.log("\n✅ Migration 011 complete.\n");
}

main().catch((e) => { console.error("Migration 011 failed:", e); process.exit(1); });
