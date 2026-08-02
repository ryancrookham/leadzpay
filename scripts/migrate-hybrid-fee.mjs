/**
 * migrate-hybrid-fee.mjs
 *
 * Migrates WOML platform fee structure from percent-only (12.5%)
 * to hybrid ($0.30 flat + 12.5%), split 50/50 between buyer and provider.
 *
 * The $0.30 flat component offsets Stripe's per-transaction $0.30 processing fee,
 * protecting WOML's net margin — especially critical at low lead volumes or in instant mode.
 *
 * Run with:
 *   node scripts/migrate-hybrid-fee.mjs
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local without dotenv dependency
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
  // .env.local not found — rely on environment variables already set
}

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

async function upsert(key, value) {
  await sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
  console.log(`  ✓ ${key} = ${value}`);
}

async function main() {
  console.log("\n🔄 Migrating WOML fee structure → Hybrid ($0.30 flat + 12.5%)\n");

  await upsert("fee_type",             "mixed");
  await upsert("fee_mixed_flat",       "0.30");
  await upsert("fee_mixed_percent",    "12.5");
  await upsert("fee_mixed_buyer_share","50");

  // Verify
  const rows = await sql`SELECT key, value FROM platform_settings WHERE key LIKE 'fee_%' ORDER BY key`;
  console.log("\n✅ Current platform_settings:\n");
  for (const row of rows) {
    console.log(`  ${row.key.padEnd(28)} = ${row.value}`);
  }

  // Show impact at $10 lead rate
  const flat = 0.30;
  const pct  = 12.5;
  const rate = 10.00;
  const totalFee   = Math.round((flat + rate * pct / 100) * 100) / 100;
  const buyerFee   = Math.round(totalFee * 0.5 * 100) / 100;
  const providerFee = Math.round((totalFee - buyerFee) * 100) / 100;
  const buyerTotal  = Math.round((rate + buyerFee) * 100) / 100;
  const providerNet = Math.round((rate - providerFee) * 100) / 100;
  const stripeFee   = Math.round((0.029 * buyerTotal + 0.30) * 100) / 100;
  const womlNet     = Math.round((totalFee - stripeFee) * 100) / 100;

  console.log(`\n📊 Fee breakdown at $${rate.toFixed(2)}/lead:`);
  console.log(`  Business pays:   $${buyerTotal.toFixed(2)}`);
  console.log(`  Provider earns:  $${providerNet.toFixed(2)}`);
  console.log(`  WOML gross fee:  $${totalFee.toFixed(2)}`);
  console.log(`  Stripe fee:      $${stripeFee.toFixed(2)}`);
  console.log(`  WOML net:        $${womlNet.toFixed(2)}`);
  console.log(`\n  At 3,000 leads/month (weekly batch): ~$${(womlNet * 3000 - 120 * 0.30 * 0.029 * 10000 / 1000).toFixed(0)}/mo WOML net`);
  console.log("\nDone.\n");
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
