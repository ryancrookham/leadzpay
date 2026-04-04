// Reset admin password hash
// Usage: node scripts/reset-admin-password.mjs <new-password>

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';

// Load .env.local manually
try {
  const envContent = readFileSync('.env.local', 'utf-8');
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

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/reset-admin-password.mjs <new-password>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function resetPassword() {
  const email = 'womleads@outlook.com';

  // Check if admin exists
  const existing = await sql`SELECT id, email, role, is_active FROM users WHERE email = ${email}`;
  if (existing.length === 0) {
    console.error('Admin user not found! Run create-admin.mjs first.');
    process.exit(1);
  }

  console.log('Found admin user:', existing[0].id);
  console.log('  Role:', existing[0].role);
  console.log('  Active:', existing[0].is_active);

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 12);

  // Verify hash works
  const verified = await bcrypt.compare(password, passwordHash);
  console.log('  Hash verification:', verified ? 'PASS' : 'FAIL');

  // Update password
  await sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE email = ${email}`;

  console.log('Password updated successfully!');
  console.log('You can now log in at /admin with:', email);
}

resetPassword().catch(err => {
  console.error('Failed to reset password:', err);
  process.exit(1);
});
