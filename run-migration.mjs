import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Load DATABASE_URL from .env.local
const envContent = readFileSync('.env.local', 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
if (!dbUrlMatch) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(dbUrlMatch[1].trim());

async function runMigration() {
  try {
    console.log('Running 004_invite_tokens migration...\n');

    // invite_tokens table
    await sql`
      CREATE TABLE IF NOT EXISTS invite_tokens (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        buyer_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token                   VARCHAR(64) NOT NULL UNIQUE,
        label                   VARCHAR(255),
        channel_name            VARCHAR(255),
        channel_description     TEXT,
        is_active               BOOLEAN NOT NULL DEFAULT TRUE,
        use_count               INTEGER NOT NULL DEFAULT 0,
        max_uses                INTEGER,
        expires_at              TIMESTAMP WITH TIME ZONE,
        rate_per_lead           DECIMAL(10,2) NOT NULL DEFAULT 50.00,
        payment_timing          VARCHAR(20) NOT NULL DEFAULT 'per_lead',
        weekly_lead_cap         INTEGER,
        monthly_lead_cap        INTEGER,
        termination_notice_days INTEGER NOT NULL DEFAULT 7,
        created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    console.log('✓ invite_tokens table created (or already exists)');

    await sql`CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invite_tokens_buyer ON invite_tokens(buyer_id)`;
    console.log('✓ invite_tokens indexes created');

    // invite_token_uses table
    await sql`
      CREATE TABLE IF NOT EXISTS invite_token_uses (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invite_token_id UUID NOT NULL REFERENCES invite_tokens(id) ON DELETE CASCADE,
        provider_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        connection_id   UUID REFERENCES connections(id),
        used_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(invite_token_id, provider_id)
      )
    `;
    console.log('✓ invite_token_uses table created (or already exists)');

    // Extend connections table
    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS invite_token_id UUID REFERENCES invite_tokens(id) ON DELETE SET NULL`;
    console.log('✓ connections.invite_token_id column added (or already exists)');

    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS required_fields JSONB`;
    console.log('✓ connections.required_fields column added (or already exists)');

    // Verify
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('invite_tokens', 'invite_token_uses')
    `;
    console.log('\nVerified tables:', tables.map(t => t.table_name).join(', '));

    console.log('\n✓ Migration 004 complete!');
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
}

runMigration();
