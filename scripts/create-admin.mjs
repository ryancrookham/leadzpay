// One-time script to create the WOML admin user
// Usage: node scripts/create-admin.mjs <password>

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
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
  console.error('Usage: node scripts/create-admin.mjs <password>');
  console.error('Example: node scripts/create-admin.mjs MySecurePassword123');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function createAdmin() {
  const email = 'womleads@outlook.com';
  const username = 'womleads';
  const displayName = 'WOML Admin';

  // Check if already exists
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    console.log('Admin user already exists with id:', existing[0].id);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = randomUUID();

  await sql`
    INSERT INTO users (id, email, username, password_hash, role, display_name, is_active, created_at, updated_at)
    VALUES (${id}, ${email}, ${username}, ${passwordHash}, 'admin', ${displayName}, true, NOW(), NOW())
  `;

  console.log('Admin user created successfully!');
  console.log('  Email:', email);
  console.log('  Username:', username);
  console.log('  ID:', id);
  console.log('');
  console.log('You can now log in at /auth/login with this email and password.');
}

createAdmin().catch(err => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
