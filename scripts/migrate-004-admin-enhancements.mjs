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
  console.log('=== Phase 1A: Creating operating_costs table ===');
  await sql`
    CREATE TABLE IF NOT EXISTS operating_costs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('monthly', 'yearly', 'per_transaction')),
      category VARCHAR(100) DEFAULT 'general',
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('operating_costs table created.');

  console.log('\n=== Phase 1B: Seeding known operating costs ===');
  await sql`INSERT INTO operating_costs (name, amount, frequency, category, description)
    SELECT 'Claude API', 100.00, 'monthly', 'infrastructure', 'Anthropic Claude API for OCR and AI processing'
    WHERE NOT EXISTS (SELECT 1 FROM operating_costs WHERE name = 'Claude API')`;

  await sql`INSERT INTO operating_costs (name, amount, frequency, category, description)
    SELECT 'Claude Pro', 20.00, 'monthly', 'infrastructure', 'Claude Pro subscription'
    WHERE NOT EXISTS (SELECT 1 FROM operating_costs WHERE name = 'Claude Pro')`;

  await sql`INSERT INTO operating_costs (name, amount, frequency, category, description)
    SELECT 'Domain (womleads.com)', 15.00, 'yearly', 'infrastructure', 'Annual domain registration'
    WHERE NOT EXISTS (SELECT 1 FROM operating_costs WHERE name = 'Domain (womleads.com)')`;

  await sql`INSERT INTO operating_costs (name, amount, frequency, category, description)
    SELECT 'Venmo Receive Fee', 0.00, 'per_transaction', 'payment_processing', 'Venmo business receive fee: 1.9% + $0.10 per received payment. Calculated dynamically.'
    WHERE NOT EXISTS (SELECT 1 FROM operating_costs WHERE name = 'Venmo Receive Fee')`;

  const costs = await sql`SELECT * FROM operating_costs WHERE is_active = true`;
  console.log('Operating costs:', JSON.stringify(costs, null, 2));

  console.log('\n=== Phase 1C: Adding new platform_settings keys ===');
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_type', 'flat') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_percent', '0') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_percent_buyer_share', '50') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_mixed_flat', '0') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_mixed_percent', '0') ON CONFLICT (key) DO NOTHING`;
  await sql`INSERT INTO platform_settings (key, value) VALUES ('fee_mixed_buyer_share', '50') ON CONFLICT (key) DO NOTHING`;

  const settings = await sql`SELECT * FROM platform_settings ORDER BY key`;
  console.log('Platform settings:', JSON.stringify(settings, null, 2));

  console.log('\n=== Migration complete! ===');
}

run().catch(err => { console.error('Migration error:', err); process.exit(1); });
