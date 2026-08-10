/**
 * Run migration 010: add users.verified_call_phone column.
 *
 * Usage: node scripts/run-migration-010.mjs
 * Requires DATABASE_URL in .env.local.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
} catch {
  // rely on already-set env
}

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function main() {
  console.log("\n🔄 Running migration 010 → users.verified_call_phone\n");

  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verified_call_phone VARCHAR(50)
  `;
  console.log("  ✓ Added verified_call_phone column");

  await sql`
    COMMENT ON COLUMN users.verified_call_phone IS
      'Business-configurable destination phone for Sinch verified calls. When set, takes precedence over users.phone for verified-call routing. Never used for SMS notifications or login.'
  `;
  console.log("  ✓ Added column comment");

  // Verify
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'verified_call_phone'
  `;
  console.log("\n📊 Column info:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(24)} ${c.data_type} ${c.is_nullable === "YES" ? "(nullable)" : "(NOT NULL)"}`);
  }

  console.log("\n✅ Migration 010 complete.\n");
}

main().catch((err) => {
  console.error("Migration 010 failed:", err);
  process.exit(1);
});
