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
    console.log('Running connections enhancement migration...\n');

    // Drop old constraint
    await sql`ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_status_check`;
    console.log('✓ Dropped old status constraint');

    // Add new constraint with workflow statuses
    await sql`
      ALTER TABLE connections
      ADD CONSTRAINT connections_status_check
      CHECK (status IN (
        'pending_buyer_review',
        'pending_provider_accept',
        'active',
        'declined_by_provider',
        'rejected_by_buyer',
        'terminated'
      ))
    `;
    console.log('✓ Added new status constraint');

    // Add termination_notice_days column
    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS termination_notice_days INTEGER DEFAULT 7`;
    console.log('✓ Added termination_notice_days column');

    // Add terms_updated_at column
    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ`;
    console.log('✓ Added terms_updated_at column');

    // Add initiator column
    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS initiator VARCHAR(20) DEFAULT 'provider'`;
    console.log('✓ Added initiator column');

    // Add message column
    await sql`ALTER TABLE connections ADD COLUMN IF NOT EXISTS message TEXT`;
    console.log('✓ Added message column');

    // Update any existing rows with old status values
    const updated1 = await sql`UPDATE connections SET status = 'pending_buyer_review' WHERE status = 'pending' RETURNING id`;
    const updated2 = await sql`UPDATE connections SET status = 'active' WHERE status = 'accepted' RETURNING id`;
    const updated3 = await sql`UPDATE connections SET status = 'rejected_by_buyer' WHERE status = 'declined' RETURNING id`;
    console.log(`✓ Migrated ${updated1.length + updated2.length + updated3.length} existing connections`);

    // Verify table structure
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'connections'
      ORDER BY ordinal_position
    `;
    console.log('\nConnections table columns:');
    columns.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));

    console.log('\n✓ Migration complete!');
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  }
}

runMigration();
