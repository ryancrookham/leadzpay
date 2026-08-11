/**
 * Diagnose what verified-call routing is currently configured for
 * businesses on WOML. Shows the fallback chain so we can tell exactly
 * which number Sinch will dial.
 *
 * Only prints LAST 3 digits of each phone (masked) so nothing sensitive
 * ends up in chat logs.
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
} catch {}

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

function mask(phone) {
  if (!phone) return "(none)";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 3) return "***";
  return `***-***-${digits.slice(-4)}`;
}

async function main() {
  console.log("\n📞 Verified-call routing diagnostic\n");

  // Get all business users + their phone chain
  const buyers = await sql`
    SELECT
      u.id,
      u.email,
      u.business_name,
      u.display_name,
      u.phone AS account_phone,
      u.verified_call_phone AS vcp,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'call_phone_number', c.call_phone_number,
          'require_verified_call', c.require_verified_call,
          'is_active', c.is_active
        ))
        FROM business_lead_criteria c
        WHERE c.business_id = u.id
      ) AS criteria
    FROM users u
    WHERE u.role = 'buyer'
    ORDER BY u.created_at DESC
  `;

  for (const b of buyers) {
    const name = b.business_name || b.display_name || b.email;
    console.log(`\n=== ${name} ===`);
    console.log(`  User ID:               ${b.id}`);
    console.log(`  Email:                 ${b.email}`);
    console.log(`  users.phone (account): ${mask(b.account_phone)}`);
    console.log(`  users.verified_call_phone (NEW): ${mask(b.vcp)}`);

    const criteria = b.criteria || [];
    console.log(`  Active criteria:       ${criteria.filter(c => c.is_active).length} (of ${criteria.length} total)`);
    for (const c of criteria) {
      if (!c.is_active) continue;
      console.log(`    - id=${c.id.slice(0,8)} require_call=${c.require_verified_call} call_phone=${mask(c.call_phone_number)}`);
    }

    // Simulate the actual fallback chain (matching sinch-voice/initiate/route.ts logic)
    const activeCriteria = criteria.filter(c => c.is_active && c.require_verified_call);
    console.log(`\n  🎯 Resolution when a verified call is triggered:`);
    if (activeCriteria.length > 0 && activeCriteria[0].call_phone_number) {
      console.log(`     → uses criteria phone: ${mask(activeCriteria[0].call_phone_number)}`);
    } else if (b.vcp) {
      console.log(`     → uses verified_call_phone (Settings tab): ${mask(b.vcp)}`);
    } else if (b.account_phone) {
      console.log(`     → falls back to account phone: ${mask(b.account_phone)}`);
    } else {
      console.log(`     → NO number available — call would fail`);
    }
  }

  // Show the last few call_sessions to see what actually happened recently
  console.log(`\n\n📜 Last 5 verified-call sessions:\n`);
  const sessions = await sql`
    SELECT
      cs.id, cs.status, cs.verified, cs.duration_seconds, cs.initiated_at,
      p.display_name AS provider_name,
      b.business_name AS buyer_name
    FROM call_sessions cs
    LEFT JOIN users p ON p.id = cs.provider_id
    LEFT JOIN users b ON b.id = cs.buyer_id
    ORDER BY cs.initiated_at DESC
    LIMIT 5
  `;
  for (const s of sessions) {
    console.log(`  ${s.initiated_at.toISOString()}  status=${s.status}  verified=${s.verified}  duration=${s.duration_seconds || 0}s`);
    console.log(`    provider=${s.provider_name}  buyer=${s.buyer_name}`);
  }

  console.log(`\n✅ Diagnostic complete.\n`);
}

main().catch((err) => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
