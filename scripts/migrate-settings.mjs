import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load .env.local
try {
  const envContent = readFileSync('/Users/ryancrookham/leadzpay/.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
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
} catch { /* ignore */ }

const sql = neon(process.env.DATABASE_URL);

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_total', '2.00') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_buyer', '1.00') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_provider', '1.00') ON CONFLICT (key) DO NOTHING`;

  const result = await sql`SELECT * FROM platform_settings`;
  console.log('Migration complete. Settings:', JSON.stringify(result, null, 2));
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
