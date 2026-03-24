import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// Database connection - uses Neon serverless driver
// Lazy initialization to avoid errors when DATABASE_URL is not set
let sqlInstance: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!sqlInstance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

// Type definitions for database tables
export interface DbUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: 'provider' | 'buyer' | 'admin';
  display_name: string | null;
  phone: string | null;
  location: string | null;
  business_name: string | null;
  business_type: string | null;
  licensed_states: string[] | null;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  stripe_onboarding_complete: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Profile and payout fields
  profile_picture_url: string | null;
  payout_method: 'venmo' | 'paypal' | 'cashapp' | 'bank' | null;
  payout_venmo: string | null;
  payout_paypal: string | null;
  payout_cashapp: string | null;
  payout_bank_routing: string | null;
  payout_bank_account: string | null;
  // Onboarding fields
  onboarding_step: number;
  onboarding_complete: boolean;
  // Buyer Stripe setup
  buyer_stripe_setup_complete: boolean;
  stripe_default_payment_method: string | null;
  stripe_payment_method_set_at: string | null;
  business_agreement_accepted_at: string | null;
  disabled_at: string | null;
  // SMS lead alert settings (buyer only)
  sms_alerts_enabled: boolean;
  sms_alert_phone1: string | null;
  sms_alert_phone2: string | null;
}

export type ConnectionStatus =
  | 'pending_buyer_review'
  | 'pending_provider_accept'
  | 'active'
  | 'declined_by_provider'
  | 'rejected_by_buyer'
  | 'terminated';

export interface DbConnection {
  id: string;
  provider_id: string;
  buyer_id: string;
  status: ConnectionStatus;
  rate_per_lead: number;
  payment_timing: string;
  weekly_lead_cap: number | null;
  monthly_lead_cap: number | null;
  total_leads: number;
  total_paid: number;
  termination_notice_days: number;
  terms_updated_at: string | null;
  initiator: 'provider' | 'buyer';
  message: string | null;
  created_at: string;
  accepted_at: string | null;
  invite_token_id: string | null;
  required_fields: Record<string, string> | null;
  criteria_id: string | null;
}

export interface DbInviteToken {
  id: string;
  buyer_id: string;
  token: string;
  label: string | null;
  channel_name: string | null;
  channel_description: string | null;
  is_active: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  rate_per_lead: number;
  payment_timing: string;
  weekly_lead_cap: number | null;
  monthly_lead_cap: number | null;
  termination_notice_days: number;
  created_at: string;
  updated_at: string;
}

export interface DbLead {
  id: string;
  provider_id: string;
  buyer_id: string | null;
  connection_id: string | null;
  status: 'pending' | 'claimed' | 'converted' | 'rejected' | 'expired';
  customer_data_encrypted: string;
  customer_data_iv: string;
  customer_state: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  payout_amount: number;
  payout_status: 'pending' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected';
  stripe_payment_id: string | null;
  stripe_transfer_id: string | null;
  submitted_at: string;
  claimed_at: string | null;
  payout_completed_at: string | null;
  criteria_fields_data: Record<string, unknown>[] | null;
  quote_completed: boolean;
  pipeline_status: string | null;
  contact_type: string | null;
  pipeline_notes: string | null;
  contacted_at: string | null;
  quoted_at: string | null;
  sold_at: string | null;
  dead_at: string | null;
  contacted_sub_status: string | null;
  dead_reason: string | null;
  assigned_to: string | null;
  follow_up_date: string | null;
  rejection_reason: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  // Joined fields (from user table JOINs)
  provider_name?: string | null;
  provider_venmo?: string | null;
  buyer_name?: string | null;
  buyer_business_name?: string | null;
  provider_email?: string | null;
  provider_phone?: string | null;
}

export interface DbTransaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  from_account_id: string | null;
  to_account_id: string | null;
  lead_id: string | null;
  connection_id: string | null;
  stripe_payment_id: string | null;
  stripe_transfer_id: string | null;
  description: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================
// Lead Criteria types
// ============================================

export interface DbBusinessLeadCriteria {
  id: string;
  business_id: string;
  payout_per_lead: number;
  weekly_cap: number | null;
  monthly_cap: number | null;
  payment_timing: string | null;
  termination_notice_days: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbLeadCriteriaField {
  id: string;
  criteria_id: string;
  field_type: 'PHOTO' | 'TEXT' | 'BINARY';
  label: string;
  option_a: string | null;
  option_b: string | null;
  is_mandatory: boolean;
  sort_order: number;
}

export interface DbProviderTermsAcceptance {
  id: string;
  provider_id: string;
  business_id: string;
  criteria_id: string;
  accepted_at: string;
}

export interface DbProviderCriteriaAcknowledgment {
  id: string;
  provider_id: string;
  business_id: string;
  criteria_id: string;
  acknowledged_at: string;
}

// Helper to check if database is configured
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// Helper to safely get first result
function first<T>(result: Record<string, unknown>[]): T | null {
  return (result[0] as T) || null;
}

// User queries
export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
  `;
  return first<DbUser>(result);
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `;
  return first<DbUser>(result);
}

export async function createUser(user: {
  email: string;
  username: string;
  password_hash: string;
  role: 'provider' | 'buyer';
  display_name?: string;
  phone?: string;
  location?: string;
  business_name?: string;
  business_type?: string;
  licensed_states?: string[];
  profile_picture_url?: string;
  payout_method?: 'venmo' | 'paypal' | 'cashapp' | 'bank';
  payout_venmo?: string;
  payout_paypal?: string;
  payout_cashapp?: string;
  payout_bank_routing?: string;
  payout_bank_account?: string;
}): Promise<DbUser> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO users (
      email, username, password_hash, role, display_name, phone, location,
      business_name, business_type, licensed_states,
      profile_picture_url, payout_method, payout_venmo, payout_paypal, payout_cashapp,
      payout_bank_routing, payout_bank_account
    ) VALUES (
      ${user.email.toLowerCase()},
      ${user.username},
      ${user.password_hash},
      ${user.role},
      ${user.display_name || null},
      ${user.phone || null},
      ${user.location || null},
      ${user.business_name || null},
      ${user.business_type || null},
      ${user.licensed_states || null},
      ${user.profile_picture_url || null},
      ${user.payout_method || null},
      ${user.payout_venmo || null},
      ${user.payout_paypal || null},
      ${user.payout_cashapp || null},
      ${user.payout_bank_routing || null},
      ${user.payout_bank_account || null}
    )
    RETURNING *
  `;
  const newUser = first<DbUser>(result)!;

  // Buyers don't have a multi-step onboarding flow — mark complete immediately
  if (user.role === 'buyer') {
    await sql`UPDATE users SET onboarding_complete = TRUE WHERE id = ${newUser.id}`;
  }

  return newUser;
}

export async function updateUser(id: string, updates: Partial<DbUser>): Promise<DbUser | null> {
  const sql = getSql();

  const result = await sql`
    UPDATE users SET
      email = COALESCE(${updates.email}, email),
      display_name = COALESCE(${updates.display_name}, display_name),
      phone = COALESCE(${updates.phone}, phone),
      location = COALESCE(${updates.location}, location),
      business_name = COALESCE(${updates.business_name}, business_name),
      business_type = COALESCE(${updates.business_type}, business_type),
      stripe_account_id = COALESCE(${updates.stripe_account_id}, stripe_account_id),
      stripe_customer_id = COALESCE(${updates.stripe_customer_id}, stripe_customer_id),
      stripe_onboarding_complete = COALESCE(${updates.stripe_onboarding_complete}, stripe_onboarding_complete),
      is_active = COALESCE(${updates.is_active}, is_active),
      profile_picture_url = COALESCE(${updates.profile_picture_url}, profile_picture_url),
      payout_method = COALESCE(${updates.payout_method}, payout_method),
      payout_venmo = COALESCE(${updates.payout_venmo}, payout_venmo),
      payout_paypal = COALESCE(${updates.payout_paypal}, payout_paypal),
      payout_cashapp = COALESCE(${updates.payout_cashapp}, payout_cashapp),
      payout_bank_routing = COALESCE(${updates.payout_bank_routing}, payout_bank_routing),
      payout_bank_account = COALESCE(${updates.payout_bank_account}, payout_bank_account),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return first<DbUser>(result);
}

// Connection queries
export async function getConnectionsByUserId(userId: string, role: 'provider' | 'buyer'): Promise<DbConnection[]> {
  const sql = getSql();
  if (role === 'provider') {
    const result = await sql`
      SELECT * FROM connections WHERE provider_id = ${userId} ORDER BY created_at DESC
    `;
    return result as unknown as DbConnection[];
  } else {
    const result = await sql`
      SELECT * FROM connections WHERE buyer_id = ${userId} ORDER BY created_at DESC
    `;
    return result as unknown as DbConnection[];
  }
}

export async function getConnectionById(id: string): Promise<DbConnection | null> {
  const sql = getSql();
  const result = await sql`SELECT * FROM connections WHERE id = ${id} LIMIT 1`;
  return first<DbConnection>(result);
}

export async function getConnectionByProviderAndBuyer(providerId: string, buyerId: string): Promise<DbConnection | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM connections
    WHERE provider_id = ${providerId} AND buyer_id = ${buyerId}
    LIMIT 1
  `;
  return first<DbConnection>(result);
}

export async function getActiveConnectionForProvider(providerId: string): Promise<DbConnection | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM connections
    WHERE provider_id = ${providerId} AND status = 'active'
    LIMIT 1
  `;
  return first<DbConnection>(result);
}

export async function getPendingRequestsForBuyer(buyerId: string): Promise<DbConnection[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM connections
    WHERE buyer_id = ${buyerId} AND status = 'pending_buyer_review'
    ORDER BY created_at DESC
  `;
  return result as unknown as DbConnection[];
}

export async function getPendingTermsForProvider(providerId: string): Promise<DbConnection[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM connections
    WHERE provider_id = ${providerId} AND status = 'pending_provider_accept'
    ORDER BY created_at DESC
  `;
  return result as unknown as DbConnection[];
}

export async function createConnection(data: {
  provider_id: string;
  buyer_id: string;
  initiator: 'provider' | 'buyer';
  message?: string;
  status?: ConnectionStatus;
  accepted_at?: string;
  rate_per_lead?: number;
  payment_timing?: string;
  weekly_lead_cap?: number | null;
  monthly_lead_cap?: number | null;
  termination_notice_days?: number;
  invite_token_id?: string;
  required_fields?: Record<string, string>;
  criteria_id?: string;
}): Promise<DbConnection> {
  const sql = getSql();
  await ensurePaymentTimingConstraintDropped();
  const status = data.status || (data.initiator === 'provider' ? 'pending_buyer_review' : 'pending_provider_accept');
  const result = await sql`
    INSERT INTO connections (
      provider_id, buyer_id, initiator, message, status, accepted_at,
      rate_per_lead, payment_timing, weekly_lead_cap, monthly_lead_cap, termination_notice_days,
      invite_token_id, required_fields, criteria_id
    ) VALUES (
      ${data.provider_id},
      ${data.buyer_id},
      ${data.initiator},
      ${data.message || null},
      ${status},
      ${data.accepted_at || null},
      ${data.rate_per_lead || 50},
      ${data.payment_timing || 'instant'},
      ${data.weekly_lead_cap ?? null},
      ${data.monthly_lead_cap ?? null},
      ${data.termination_notice_days || 7},
      ${data.invite_token_id || null},
      ${data.required_fields ? JSON.stringify(data.required_fields) : null},
      ${data.criteria_id || null}
    )
    RETURNING *
  `;
  return first<DbConnection>(result)!;
}

export async function updateConnection(id: string, updates: {
  status?: ConnectionStatus;
  rate_per_lead?: number;
  payment_timing?: string;
  weekly_lead_cap?: number | null;
  monthly_lead_cap?: number | null;
  termination_notice_days?: number;
  total_leads?: number;
  total_paid?: number;
  accepted_at?: string;
}): Promise<DbConnection | null> {
  console.log("[DB] updateConnection called:", { id, updates });

  const sql = getSql();

  // Build the update - we'll track if terms changed
  const termsChanged = updates.rate_per_lead !== undefined ||
                       updates.weekly_lead_cap !== undefined ||
                       updates.monthly_lead_cap !== undefined ||
                       updates.termination_notice_days !== undefined;

  try {
    const result = await sql`
      UPDATE connections SET
        status = COALESCE(${updates.status ?? null}, status),
        rate_per_lead = CASE WHEN ${updates.rate_per_lead !== undefined} THEN ${updates.rate_per_lead} ELSE rate_per_lead END,
        payment_timing = COALESCE(${updates.payment_timing ?? null}, payment_timing),
        weekly_lead_cap = CASE WHEN ${updates.weekly_lead_cap !== undefined} THEN ${updates.weekly_lead_cap ?? null} ELSE weekly_lead_cap END,
        monthly_lead_cap = CASE WHEN ${updates.monthly_lead_cap !== undefined} THEN ${updates.monthly_lead_cap ?? null} ELSE monthly_lead_cap END,
        termination_notice_days = CASE WHEN ${updates.termination_notice_days !== undefined} THEN ${updates.termination_notice_days} ELSE termination_notice_days END,
        total_leads = COALESCE(${updates.total_leads ?? null}, total_leads),
        total_paid = COALESCE(${updates.total_paid ?? null}, total_paid),
        accepted_at = COALESCE(${updates.accepted_at ?? null}, accepted_at),
        terms_updated_at = CASE WHEN ${termsChanged} THEN NOW() ELSE terms_updated_at END
      WHERE id = ${id}
      RETURNING *
    `;
    console.log("[DB] updateConnection result:", result);
    return first<DbConnection>(result);
  } catch (error) {
    console.error("[DB] updateConnection ERROR:", error);
    throw error;
  }
}

// User discovery queries
export async function getUsersByRole(role: 'provider' | 'buyer', excludeUserId?: string): Promise<DbUser[]> {
  const sql = getSql();
  if (excludeUserId) {
    const result = await sql`
      SELECT id, email, username, role, display_name, phone, location, business_name, business_type, licensed_states, profile_picture_url, payout_method, created_at
      FROM users
      WHERE role = ${role} AND is_active = true AND id != ${excludeUserId}
      ORDER BY created_at DESC
    `;
    return result as unknown as DbUser[];
  } else {
    const result = await sql`
      SELECT id, email, username, role, display_name, phone, location, business_name, business_type, licensed_states, profile_picture_url, payout_method, created_at
      FROM users
      WHERE role = ${role} AND is_active = true
      ORDER BY created_at DESC
    `;
    return result as unknown as DbUser[];
  }
}

// Transaction queries
export async function getTransactionsByUserId(userId: string, limit = 50): Promise<DbTransaction[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM transactions
    WHERE from_account_id = ${userId} OR to_account_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result as unknown as DbTransaction[];
}

export async function createTransaction(transaction: {
  type: string;
  status?: string;
  amount: number;
  fee_amount?: number;
  net_amount: number;
  from_account_id?: string | null;
  to_account_id?: string | null;
  lead_id?: string;
  connection_id?: string;
  stripe_payment_id?: string;
  description?: string;
}): Promise<DbTransaction> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO transactions (
      type, status, amount, fee_amount, net_amount, from_account_id, to_account_id,
      lead_id, connection_id, stripe_payment_id, description
    ) VALUES (
      ${transaction.type},
      ${transaction.status || 'pending'},
      ${transaction.amount},
      ${transaction.fee_amount || 0},
      ${transaction.net_amount},
      ${transaction.from_account_id || null},
      ${transaction.to_account_id || null},
      ${transaction.lead_id || null},
      ${transaction.connection_id || null},
      ${transaction.stripe_payment_id || null},
      ${transaction.description || null}
    )
    RETURNING *
  `;
  return first<DbTransaction>(result)!;
}

// Direct SQL execution for complex queries
export async function executeSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const sql = getSql();
  return sql(strings, ...values);
}

// ===========================================
// PASSWORD RESET TOKEN FUNCTIONS
// ===========================================

export interface DbPasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Create a password reset token for a user
 * @param userId The user's ID
 * @param tokenHash The SHA-256 hash of the token (store hashed, not plain)
 * @param expiresInHours How many hours until token expires (default 1)
 */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresInHours: number = 1
): Promise<DbPasswordResetToken> {
  const sql = getSql();

  // Calculate expiry time
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  // Invalidate any existing unused tokens for this user
  await sql`
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = ${userId} AND used_at IS NULL
  `;

  // Create new token
  const result = await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (
      ${userId},
      ${tokenHash},
      ${expiresAt}
    )
    RETURNING *
  `;

  return first<DbPasswordResetToken>(result)!;
}

/**
 * Get a valid (unexpired, unused) password reset token by its hash
 */
export async function getValidResetToken(tokenHash: string): Promise<(DbPasswordResetToken & { email: string }) | null> {
  const sql = getSql();
  const result = await sql`
    SELECT prt.*, u.email
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = ${tokenHash}
      AND prt.expires_at > NOW()
      AND prt.used_at IS NULL
    LIMIT 1
  `;
  return first<DbPasswordResetToken & { email: string }>(result);
}

/**
 * Mark a password reset token as used
 */
export async function markTokenUsed(tokenId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE id = ${tokenId}
  `;
}

/**
 * Update a user's password hash
 */
export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${userId}
  `;
}

// ============================================
// Lead queries
// ============================================

// ── Duplicate detection ───────────────────────────────────────────────────────
// We store SHA-256 hashes of normalised email and phone at insert time so we
// can detect duplicates without ever decrypting stored PII.
// The migration runs once (ALTER TABLE IF NOT EXISTS is idempotent in Postgres).

export async function ensureDuplicateCheckColumns(): Promise<void> {
  const sql = getSql();
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_email_hash TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_phone_hash TEXT`;
}

// ── SMS alert columns ─────────────────────────────────────────────────────────
// Idempotent migration: adds sms alert columns to users table if missing.

export async function ensureSmsAlertColumns(): Promise<void> {
  const sql = getSql();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_alerts_enabled BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_alert_phone1 TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_alert_phone2 TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_agent_1_name TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_agent_2_name TEXT`;
  await ensureLeadChasersTable();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_pin_hash TEXT`;
}

// Idempotent migration: adds payment method columns to users table if missing.
export async function ensurePaymentMethodColumns(): Promise<void> {
  const sql = getSql();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_default_payment_method VARCHAR(255)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payment_method_set_at TIMESTAMPTZ`;
}

// Drop the old payment_timing check constraint so new values (instant, manual, scheduled_*) are allowed.
export async function ensurePaymentTimingConstraintDropped(): Promise<void> {
  const sql = getSql();
  try {
    await sql`ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_payment_timing_check`;
  } catch {
    // Constraint may not exist — safe to ignore
  }
}

export async function updatePaymentMethodId(userId: string, paymentMethodId: string): Promise<void> {
  const sql = getSql();
  await ensurePaymentMethodColumns();
  await sql`
    UPDATE users
    SET stripe_default_payment_method = ${paymentMethodId},
        stripe_payment_method_set_at = NOW(),
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getPaymentMethodId(userId: string): Promise<string | null> {
  const sql = getSql();
  await ensurePaymentMethodColumns();
  const rows = await sql`
    SELECT stripe_default_payment_method FROM users WHERE id = ${userId}
  `;
  return rows[0]?.stripe_default_payment_method || null;
}

export async function clearPaymentMethodId(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users
    SET stripe_default_payment_method = NULL,
        stripe_payment_method_set_at = NULL,
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUserByStripeCustomerId(customerId: string): Promise<DbUser | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1`;
  return (rows[0] as DbUser) || null;
}

export async function ensureLeadChasersTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS business_lead_chasers (
      id SERIAL PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    )
  `;
}

export async function getSmsAlertSettings(userId: string): Promise<{
  smsAlertsEnabled: boolean;
  leadChasers: { name: string; phone: string }[];
}> {
  await ensureSmsAlertColumns();
  const sql = getSql();

  const userRow = await sql`
    SELECT sms_alerts_enabled FROM users WHERE id = ${userId} LIMIT 1
  `;
  const smsAlertsEnabled = (userRow[0] as any)?.sms_alerts_enabled ?? false;

  const chasersResult = await sql`
    SELECT name, phone FROM business_lead_chasers
    WHERE business_id = ${userId}
    ORDER BY position ASC, id ASC
  `;

  let leadChasers: { name: string; phone: string }[] = chasersResult.map((r: any) => ({
    name: r.name,
    phone: r.phone,
  }));

  // Auto-migrate from old columns if new table is empty
  if (leadChasers.length === 0) {
    const oldRow = await sql`
      SELECT sms_alert_phone1, sms_alert_phone2, sms_agent_1_name, sms_agent_2_name
      FROM users WHERE id = ${userId} LIMIT 1
    `;
    const old = oldRow[0] as any;
    const migrated: { name: string; phone: string }[] = [];
    if (old?.sms_agent_1_name && old?.sms_alert_phone1) {
      migrated.push({ name: old.sms_agent_1_name, phone: old.sms_alert_phone1 });
    }
    if (old?.sms_agent_2_name && old?.sms_alert_phone2) {
      migrated.push({ name: old.sms_agent_2_name, phone: old.sms_alert_phone2 });
    }
    if (migrated.length > 0) {
      for (let i = 0; i < migrated.length; i++) {
        await sql`
          INSERT INTO business_lead_chasers (business_id, name, phone, position)
          VALUES (${userId}, ${migrated[i].name}, ${migrated[i].phone}, ${i})
        `;
      }
      leadChasers = migrated;
    }
  }

  return { smsAlertsEnabled, leadChasers };
}

export async function updateSmsAlertSettings(
  userId: string,
  settings: {
    smsAlertsEnabled: boolean;
    leadChasers: { name: string; phone: string }[];
  }
): Promise<void> {
  await ensureSmsAlertColumns();
  const sql = getSql();

  await sql`
    UPDATE users SET
      sms_alerts_enabled = ${settings.smsAlertsEnabled},
      sms_alert_phone1 = NULL,
      sms_alert_phone2 = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;

  await sql`DELETE FROM business_lead_chasers WHERE business_id = ${userId}`;
  for (let i = 0; i < settings.leadChasers.length; i++) {
    const c = settings.leadChasers[i];
    await sql`
      INSERT INTO business_lead_chasers (business_id, name, phone, position)
      VALUES (${userId}, ${c.name}, ${c.phone}, ${i})
    `;
  }
}

// ── Business PIN ────────────────────────────────────────────────────────────

export async function setBusinessPin(userId: string, pinHash: string): Promise<void> {
  await ensureSmsAlertColumns();
  const sql = getSql();
  await sql`UPDATE users SET business_pin_hash = ${pinHash}, updated_at = NOW() WHERE id = ${userId}`;
}

export async function getBusinessPinHash(userId: string): Promise<string | null> {
  await ensureSmsAlertColumns();
  const sql = getSql();
  const rows = await sql`SELECT business_pin_hash FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as any)?.business_pin_hash ?? null;
}

export async function resetPipelineData(): Promise<void> {
  const sql = getSql();
  await sql`TRUNCATE TABLE lead_activity_log`;
  await sql`
    UPDATE leads SET
      pipeline_status = 'new',
      follow_up_date = NULL,
      contacted_at = NULL,
      quoted_at = NULL,
      sold_at = NULL,
      dead_at = NULL,
      assigned_to = NULL
    WHERE 1=1
  `;
}

export async function getLeaderboardData(businessId: string): Promise<{
  rows: { actor_name: string; to_value: string; count: number }[];
  uniqueLeads: { actor_name: string; unique_leads: number }[];
}> {
  const sql = getSql();
  const [rows, uniqueLeads] = await Promise.all([
    sql`
      SELECT actor_name, to_value, COUNT(*)::int as count
      FROM lead_activity_log
      WHERE business_id = ${businessId}
        AND action = 'status_change'
        AND to_value IN ('contacted', 'quoted', 'sold', 'dead')
        AND actor_name NOT IN ('Unknown', '')
      GROUP BY actor_name, to_value
      ORDER BY actor_name
    `,
    sql`
      SELECT actor_name, COUNT(DISTINCT lead_id)::int as unique_leads
      FROM lead_activity_log
      WHERE business_id = ${businessId}
        AND action = 'status_change'
        AND actor_name NOT IN ('Unknown', '')
      GROUP BY actor_name
    `,
  ]);
  return {
    rows: rows as unknown as { actor_name: string; to_value: string; count: number }[],
    uniqueLeads: uniqueLeads as unknown as { actor_name: string; unique_leads: number }[],
  };
}

function normalise(value: string | undefined | null): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export async function hashIdentifier(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(normalise(value));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the matching lead ID if a duplicate is found, otherwise null.
 * Checks email hash and phone hash independently — a match on either is a duplicate.
 * Scope is platform-wide (all businesses), as per WOML policy.
 */
export async function checkDuplicateLead(
  emailHash: string | null,
  phoneHash: string | null,
): Promise<string | null> {
  if (!emailHash && !phoneHash) return null;
  const sql = getSql();

  if (emailHash && phoneHash) {
    const result = await sql`
      SELECT id FROM leads
      WHERE customer_email_hash = ${emailHash}
         OR customer_phone_hash = ${phoneHash}
      LIMIT 1
    `;
    return (result[0] as { id: string } | undefined)?.id ?? null;
  }
  if (emailHash) {
    const result = await sql`
      SELECT id FROM leads WHERE customer_email_hash = ${emailHash} LIMIT 1
    `;
    return (result[0] as { id: string } | undefined)?.id ?? null;
  }
  // phoneHash only
  const result = await sql`
    SELECT id FROM leads WHERE customer_phone_hash = ${phoneHash} LIMIT 1
  `;
  return (result[0] as { id: string } | undefined)?.id ?? null;
}

export async function createLead(data: {
  provider_id: string;
  buyer_id: string;
  connection_id: string;
  customer_data_encrypted: string;
  customer_data_iv: string;
  customer_email_hash?: string;
  customer_phone_hash?: string;
  customer_state?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  payout_amount: number;
  stripe_payment_id?: string;
  criteria_fields_data?: Record<string, unknown>[];
}): Promise<DbLead> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO leads (
      provider_id, buyer_id, connection_id,
      customer_data_encrypted, customer_data_iv,
      customer_email_hash, customer_phone_hash,
      customer_state, vehicle_year, vehicle_make, vehicle_model,
      payout_amount, stripe_payment_id, criteria_fields_data
    ) VALUES (
      ${data.provider_id}, ${data.buyer_id}, ${data.connection_id},
      ${data.customer_data_encrypted}, ${data.customer_data_iv},
      ${data.customer_email_hash || null}, ${data.customer_phone_hash || null},
      ${data.customer_state || null}, ${data.vehicle_year || null},
      ${data.vehicle_make || null}, ${data.vehicle_model || null},
      ${data.payout_amount}, ${data.stripe_payment_id || null},
      ${data.criteria_fields_data ? JSON.stringify(data.criteria_fields_data) : null}
    )
    RETURNING *
  `;
  return first<DbLead>(result)!;
}

export async function getLeadsByProviderId(providerId: string): Promise<DbLead[]> {
  const sql = getSql();
  const result = await sql`
    SELECT l.*, u.display_name as buyer_name, u.business_name as buyer_business_name
    FROM leads l
    LEFT JOIN users u ON l.buyer_id = u.id
    WHERE l.provider_id = ${providerId}
    ORDER BY l.submitted_at DESC
  `;
  return result as unknown as DbLead[];
}

export async function getLeadsByBuyerId(buyerId: string): Promise<DbLead[]> {
  const sql = getSql();
  const result = await sql`
    SELECT l.*, u.display_name as provider_name, u.payout_venmo as provider_venmo,
           u.email as provider_email, u.phone as provider_phone
    FROM leads l
    LEFT JOIN users u ON l.provider_id = u.id
    WHERE l.buyer_id = ${buyerId}
    ORDER BY l.submitted_at DESC
  `;
  return result as unknown as DbLead[];
}

export async function getLeadById(id: string): Promise<DbLead | null> {
  const sql = getSql();
  const result = await sql`SELECT * FROM leads WHERE id = ${id} LIMIT 1`;
  return first<DbLead>(result);
}

export async function getLeadsByConnectionId(connectionId: string): Promise<DbLead[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM leads WHERE connection_id = ${connectionId} ORDER BY submitted_at DESC
  `;
  return result as unknown as DbLead[];
}

export async function updateLeadPayoutStatus(
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<DbLead | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET
      payout_status = ${status},
      payout_completed_at = CASE WHEN ${status === 'completed'} THEN NOW() ELSE payout_completed_at END
    WHERE id = ${id}
    RETURNING *
  `;
  return first<DbLead>(result);
}

export async function updateLeadQuoteCompleted(
  id: string,
  quoteCompleted: boolean
): Promise<DbLead | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET quote_completed = ${quoteCompleted}
    WHERE id = ${id}
    RETURNING *
  `;
  return first<DbLead>(result);
}

export async function updateLeadPipeline(
  id: string,
  fields: {
    pipeline_status?: string;
    contact_type?: string;
    pipeline_notes?: string;
    contacted_sub_status?: string | null;
    dead_reason?: string | null;
    assigned_to?: string | null;
    follow_up_date?: string | null;
  }
): Promise<DbLead | null> {
  const sql = getSql();

  // Apply pipeline_status with auto-timestamps
  if (fields.pipeline_status !== undefined) {
    const status = fields.pipeline_status;
    if (status === 'contacted') {
      await sql`UPDATE leads SET pipeline_status = ${status}, contacted_at = COALESCE(contacted_at, NOW()) WHERE id = ${id}`;
    } else if (status === 'quoted') {
      await sql`UPDATE leads SET pipeline_status = ${status}, contacted_at = COALESCE(contacted_at, NOW()), quoted_at = COALESCE(quoted_at, NOW()) WHERE id = ${id}`;
    } else if (status === 'sold') {
      await sql`UPDATE leads SET pipeline_status = ${status}, contacted_at = COALESCE(contacted_at, NOW()), quoted_at = COALESCE(quoted_at, NOW()), sold_at = COALESCE(sold_at, NOW()) WHERE id = ${id}`;
    } else if (status === 'dead') {
      await sql`UPDATE leads SET pipeline_status = ${status}, dead_at = COALESCE(dead_at, NOW()) WHERE id = ${id}`;
    } else if (status === 'new') {
      await sql`UPDATE leads SET pipeline_status = ${status}, contacted_at = NULL, quoted_at = NULL, sold_at = NULL, dead_at = NULL WHERE id = ${id}`;
    } else {
      await sql`UPDATE leads SET pipeline_status = ${status} WHERE id = ${id}`;
    }
  }

  if (fields.contact_type !== undefined) {
    await sql`UPDATE leads SET contact_type = ${fields.contact_type} WHERE id = ${id}`;
  }

  if (fields.pipeline_notes !== undefined) {
    await sql`UPDATE leads SET pipeline_notes = ${fields.pipeline_notes} WHERE id = ${id}`;
  }

  if (fields.contacted_sub_status !== undefined) {
    await sql`UPDATE leads SET contacted_sub_status = ${fields.contacted_sub_status} WHERE id = ${id}`;
  }

  if (fields.dead_reason !== undefined) {
    await sql`UPDATE leads SET dead_reason = ${fields.dead_reason} WHERE id = ${id}`;
  }

  if (fields.assigned_to !== undefined) {
    await sql`UPDATE leads SET assigned_to = ${fields.assigned_to} WHERE id = ${id}`;
  }

  if (fields.follow_up_date !== undefined) {
    await sql`UPDATE leads SET follow_up_date = ${fields.follow_up_date} WHERE id = ${id}`;
  }

  // Return the updated lead
  const result = await sql`SELECT * FROM leads WHERE id = ${id}`;
  return first<DbLead>(result);
}

// ============================================
// Activity Log functions
// ============================================

export interface ActivityLogEntry {
  id: string;
  lead_id: string;
  business_id: string;
  actor_name: string;
  action: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
}

export async function insertActivityLog(entry: {
  lead_id: string;
  business_id: string;
  actor_name: string;
  action: string;
  from_value?: string | null;
  to_value?: string | null;
  note?: string | null;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO lead_activity_log (lead_id, business_id, actor_name, action, from_value, to_value, note)
    VALUES (${entry.lead_id}, ${entry.business_id}, ${entry.actor_name}, ${entry.action}, ${entry.from_value ?? null}, ${entry.to_value ?? null}, ${entry.note ?? null})
  `;
}

export async function getActivityLog(leadId: string): Promise<ActivityLogEntry[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM lead_activity_log WHERE lead_id = ${leadId} ORDER BY created_at DESC
  `;
  return result as unknown as ActivityLogEntry[];
}

// ============================================
// Business Settings functions
// ============================================

export interface BusinessSettings {
  business_id: string;
  dead_lead_window_days: number;
  funnel_target_contacted: number;
  funnel_target_quoted: number;
  funnel_target_sold: number;
  funnel_target_dead: number;
}

export async function getBusinessSettings(businessId: string): Promise<BusinessSettings> {
  const sql = getSql();
  await sql`
    ALTER TABLE business_settings
      ADD COLUMN IF NOT EXISTS funnel_target_contacted integer NOT NULL DEFAULT 80,
      ADD COLUMN IF NOT EXISTS funnel_target_quoted integer NOT NULL DEFAULT 50,
      ADD COLUMN IF NOT EXISTS funnel_target_sold integer NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS funnel_target_dead integer NOT NULL DEFAULT 20
  `;
  const result = await sql`SELECT * FROM business_settings WHERE business_id = ${businessId}`;
  const row = first<BusinessSettings>(result);
  return row || {
    business_id: businessId,
    dead_lead_window_days: 30,
    funnel_target_contacted: 80,
    funnel_target_quoted: 50,
    funnel_target_sold: 30,
    funnel_target_dead: 20,
  };
}

export async function upsertBusinessSettings(
  businessId: string,
  settings: {
    dead_lead_window_days?: number;
    funnel_target_contacted?: number;
    funnel_target_quoted?: number;
    funnel_target_sold?: number;
    funnel_target_dead?: number;
  }
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO business_settings (
      business_id, dead_lead_window_days,
      funnel_target_contacted, funnel_target_quoted, funnel_target_sold, funnel_target_dead,
      updated_at
    )
    VALUES (
      ${businessId},
      ${settings.dead_lead_window_days ?? 30},
      ${settings.funnel_target_contacted ?? 80},
      ${settings.funnel_target_quoted ?? 50},
      ${settings.funnel_target_sold ?? 30},
      ${settings.funnel_target_dead ?? 20},
      NOW()
    )
    ON CONFLICT (business_id) DO UPDATE SET
      dead_lead_window_days = COALESCE(${settings.dead_lead_window_days ?? null}, business_settings.dead_lead_window_days),
      funnel_target_contacted = COALESCE(${settings.funnel_target_contacted ?? null}, business_settings.funnel_target_contacted),
      funnel_target_quoted = COALESCE(${settings.funnel_target_quoted ?? null}, business_settings.funnel_target_quoted),
      funnel_target_sold = COALESCE(${settings.funnel_target_sold ?? null}, business_settings.funnel_target_sold),
      funnel_target_dead = COALESCE(${settings.funnel_target_dead ?? null}, business_settings.funnel_target_dead),
      updated_at = NOW()
  `;
}

export async function sweepDeadLeads(businessId: string, windowDays: number): Promise<string[]> {
  const sql = getSql();
  const result = await sql`
    UPDATE leads
    SET pipeline_status = 'dead', dead_at = NOW()
    WHERE buyer_id = ${businessId}
      AND pipeline_status IN ('new', 'contacted', 'quoted')
      AND submitted_at < NOW() - (${windowDays} || ' days')::interval
    RETURNING id
  `;
  return (result as unknown as { id: string }[]).map(r => r.id);
}

// ============================================
// Batch operations
// ============================================

export async function getLeadsByIds(ids: string[]): Promise<DbLead[]> {
  if (ids.length === 0) return [];
  const sql = getSql();
  const result = await sql`SELECT * FROM leads WHERE id = ANY(${ids})`;
  return result as unknown as DbLead[];
}

export async function batchMarkLeadsPaid(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET payout_status = 'processing', payout_completed_at = NOW()
    WHERE id = ANY(${ids}) AND payout_status = 'pending'
    RETURNING id
  `;
  await sql`
    UPDATE transactions SET status = 'completed', completed_at = NOW()
    WHERE lead_id = ANY(${ids}) AND type = 'platform_fee' AND status = 'pending'
  `;
  return result.length;
}

// ============================================
// Admin / Platform stats queries
// ============================================

export async function getPlatformStats() {
  const sql = getSql();

  const [leadStats] = await sql`
    SELECT
      COUNT(*)::int as total_leads,
      COUNT(*) FILTER (WHERE payout_status = 'completed')::int as paid_leads,
      COUNT(*) FILTER (WHERE payout_status = 'processing')::int as processing_leads,
      COALESCE(SUM(payout_amount), 0)::numeric as total_lead_volume
    FROM leads
  `;

  const [txStats] = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'completed'), 0)::numeric as completed_revenue,
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'pending'), 0)::numeric as pending_revenue
    FROM transactions
  `;

  const [connectionStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int as active_connections
    FROM connections
  `;

  const [userStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE role = 'provider' AND is_active = true)::int as active_providers,
      COUNT(*) FILTER (WHERE role = 'buyer' AND is_active = true)::int as active_buyers
    FROM users
  `;

  return {
    totalLeads: leadStats.total_leads,
    paidLeads: leadStats.paid_leads,
    processingLeads: leadStats.processing_leads,
    totalLeadVolume: Number(leadStats.total_lead_volume),
    completedRevenue: Number(txStats.completed_revenue),
    pendingRevenue: Number(txStats.pending_revenue),
    activeConnections: connectionStats.active_connections,
    activeProviders: userStats.active_providers,
    activeBuyers: userStats.active_buyers,
  };
}

export async function getAdminPlatformHealth() {
  const sql = getSql();

  // Platform-wide funnel
  const [funnelStats] = await sql`
    SELECT
      COUNT(*)::int as total_leads,
      COUNT(*) FILTER (WHERE contacted_at IS NOT NULL)::int as total_contacted,
      COUNT(*) FILTER (WHERE quoted_at IS NOT NULL)::int as total_quoted,
      COUNT(*) FILTER (WHERE sold_at IS NOT NULL)::int as total_sold,
      COUNT(*) FILTER (WHERE dead_at IS NOT NULL)::int as total_dead
    FROM leads
  `;

  // 30-day trend
  const trendRows = await sql`
    SELECT
      DATE(submitted_at)::text as date,
      COUNT(*)::int as leads,
      COUNT(*) FILTER (WHERE contacted_at IS NOT NULL)::int as contacted,
      COUNT(*) FILTER (WHERE sold_at IS NOT NULL)::int as sold
    FROM leads
    WHERE submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(submitted_at)
    ORDER BY DATE(submitted_at) ASC
  `;

  // Per-business health
  const businessStats = await sql`
    SELECT
      u.id as business_id,
      u.display_name,
      u.business_name,
      u.email,
      u.is_active,
      u.disabled_at,
      COUNT(l.id)::int as total_leads,
      COUNT(l.id) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days')::int as leads_this_month,
      COUNT(l.id) FILTER (WHERE l.contacted_at IS NOT NULL)::int as contacted,
      COUNT(l.id) FILTER (WHERE l.quoted_at IS NOT NULL)::int as quoted,
      COUNT(l.id) FILTER (WHERE l.sold_at IS NOT NULL)::int as sold,
      COUNT(l.id) FILTER (WHERE l.dead_at IS NOT NULL)::int as dead,
      MAX(l.submitted_at)::text as last_lead_at
    FROM users u
    LEFT JOIN leads l ON l.buyer_id = u.id
    WHERE u.role = 'buyer'
    GROUP BY u.id, u.display_name, u.business_name, u.email, u.is_active, u.disabled_at
    ORDER BY leads_this_month DESC, total_leads DESC
  `;

  // Active chasers per business (separate query to avoid cross-join)
  const chaserStats = await sql`
    SELECT
      business_id,
      COUNT(DISTINCT actor_name)::int as active_chasers,
      MAX(created_at)::text as last_chaser_activity
    FROM lead_activity_log
    WHERE actor_name IS NOT NULL AND actor_name != ''
    GROUP BY business_id
  `;
  const chaserMap = new Map(chaserStats.map((r: any) => [r.business_id, { active_chasers: r.active_chasers, last_chaser_activity: r.last_chaser_activity }]));

  const businesses = businessStats.map((b: any) => ({
    ...b,
    active_chasers: chaserMap.get(b.business_id)?.active_chasers ?? 0,
    last_chaser_activity: chaserMap.get(b.business_id)?.last_chaser_activity ?? null,
  }));

  // Per-provider activity
  const providerStats = await sql`
    SELECT
      u.id as provider_id,
      u.display_name,
      u.email,
      u.is_active,
      u.disabled_at,
      COUNT(l.id)::int as total_leads,
      COUNT(l.id) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '30 days')::int as leads_this_month,
      COUNT(l.id) FILTER (WHERE l.submitted_at >= NOW() - INTERVAL '7 days')::int as leads_this_week,
      COALESCE(SUM(l.payout_amount) FILTER (WHERE l.payout_status != 'rejected'), 0)::numeric as gross_earnings,
      COALESCE(SUM(CASE WHEN l.payout_amount > 0 THEN ROUND(l.payout_amount * 0.0625 + 0.15, 2) ELSE 0 END) FILTER (WHERE l.payout_status != 'rejected'), 0)::numeric as fees_paid,
      COALESCE(SUM(CASE WHEN l.payout_amount > 0 THEN ROUND(l.payout_amount * 0.9375 - 0.15, 2) ELSE 0 END) FILTER (WHERE l.payout_status != 'rejected'), 0)::numeric as net_earnings,
      MAX(l.submitted_at)::text as last_submission
    FROM users u
    LEFT JOIN leads l ON l.provider_id = u.id
    WHERE u.role = 'provider'
    GROUP BY u.id, u.display_name, u.email, u.is_active, u.disabled_at
    ORDER BY leads_this_month DESC, total_leads DESC
  `;

  // Revenue breakdown
  const [revenueStats] = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'completed' AND created_at >= DATE_TRUNC('week', NOW())), 0)::numeric as revenue_this_week,
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'completed' AND created_at >= DATE_TRUNC('month', NOW())), 0)::numeric as revenue_this_month,
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'completed' AND created_at >= DATE_TRUNC('year', NOW())), 0)::numeric as revenue_this_year,
      COALESCE(SUM(amount) FILTER (WHERE type = 'platform_fee' AND status = 'completed'), 0)::numeric as revenue_all_time
    FROM transactions
  `;

  // Month-over-month growth
  const [growthStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE submitted_at >= DATE_TRUNC('month', NOW()))::int as leads_this_month,
      COUNT(*) FILTER (WHERE submitted_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND submitted_at < DATE_TRUNC('month', NOW()))::int as leads_last_month
    FROM leads
  `;

  return {
    funnel: funnelStats,
    trend: trendRows,
    businesses,
    providers: providerStats,
    revenue: revenueStats,
    growth: growthStats,
  };
}

// ============================================
// User discovery (connection-scoped)
// ============================================

export async function getUsersByIds(ids: string[]): Promise<DbUser[]> {
  if (ids.length === 0) return [];
  const sql = getSql();
  const result = await sql`
    SELECT id, email, username, role, display_name, phone, location, business_name, business_type,
           licensed_states, profile_picture_url, payout_method, created_at
    FROM users
    WHERE id = ANY(${ids}::uuid[]) AND is_active = true
    ORDER BY created_at DESC
  `;
  return result as unknown as DbUser[];
}

// ============================================
// Multi-connection support for providers
// ============================================

export async function getActiveConnectionsForProvider(providerId: string): Promise<DbConnection[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM connections
    WHERE provider_id = ${providerId} AND status = 'active'
    ORDER BY accepted_at DESC
  `;
  return result as unknown as DbConnection[];
}

// ============================================
// Invite Token functions
// ============================================

export async function createInviteToken(data: {
  buyer_id: string;
  token: string;
  label?: string;
  channel_name?: string;
  channel_description?: string;
  max_uses?: number;
  expires_at?: string;
  rate_per_lead: number;
  payment_timing?: string;
  weekly_lead_cap?: number;
  monthly_lead_cap?: number;
  termination_notice_days?: number;
}): Promise<DbInviteToken> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO invite_tokens (
      buyer_id, token, label, channel_name, channel_description,
      max_uses, expires_at, rate_per_lead, payment_timing,
      weekly_lead_cap, monthly_lead_cap, termination_notice_days
    ) VALUES (
      ${data.buyer_id},
      ${data.token},
      ${data.label || null},
      ${data.channel_name || null},
      ${data.channel_description || null},
      ${data.max_uses || null},
      ${data.expires_at || null},
      ${data.rate_per_lead},
      ${data.payment_timing || 'per_lead'},
      ${data.weekly_lead_cap ?? null},
      ${data.monthly_lead_cap ?? null},
      ${data.termination_notice_days ?? 7}
    )
    RETURNING *
  `;
  return first<DbInviteToken>(result)!;
}

export async function getInviteTokensByBuyer(buyerId: string): Promise<DbInviteToken[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM invite_tokens
    WHERE buyer_id = ${buyerId}
    ORDER BY created_at DESC
  `;
  return result as unknown as DbInviteToken[];
}

export async function getInviteTokenByToken(token: string): Promise<DbInviteToken | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM invite_tokens WHERE token = ${token} LIMIT 1
  `;
  return first<DbInviteToken>(result);
}

export async function deactivateInviteToken(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE invite_tokens SET is_active = false, updated_at = NOW() WHERE id = ${id}
  `;
}

export async function deleteInviteTokenPermanently(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM invite_tokens WHERE id = ${id}`;
}

export async function incrementInviteTokenUseCount(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE invite_tokens SET use_count = use_count + 1, updated_at = NOW() WHERE id = ${id}
  `;
}

export async function createInviteTokenUse(
  inviteTokenId: string,
  providerId: string,
  connectionId: string
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO invite_token_uses (invite_token_id, provider_id, connection_id)
    VALUES (${inviteTokenId}, ${providerId}, ${connectionId})
    ON CONFLICT (invite_token_id, provider_id) DO NOTHING
  `;
}

export async function updateInviteToken(
  id: string,
  updates: {
    label?: string;
    channel_name?: string;
    channel_description?: string;
    is_active?: boolean;
  }
): Promise<DbInviteToken | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE invite_tokens SET
      label = COALESCE(${updates.label ?? null}, label),
      channel_name = COALESCE(${updates.channel_name ?? null}, channel_name),
      channel_description = COALESCE(${updates.channel_description ?? null}, channel_description),
      is_active = COALESCE(${updates.is_active ?? null}, is_active),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return first<DbInviteToken>(result);
}

export async function getRevenueByDay(days: number = 30) {
  const sql = getSql();
  const result = await sql`
    SELECT
      TO_CHAR(completed_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') as day,
      COALESCE(SUM(amount), 0)::numeric as revenue,
      COUNT(*)::int as tx_count
    FROM transactions
    WHERE type = 'platform_fee'
      AND status = 'completed'
      AND completed_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY TO_CHAR(completed_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')
    ORDER BY day ASC
  `;
  return result.map((r: any) => ({
    day: r.day,
    revenue: Number(r.revenue),
    txCount: r.tx_count,
  }));
}

export async function getAllLeadsForAdmin(limit: number = 20) {
  const sql = getSql();
  const result = await sql`
    SELECT l.*,
      p.display_name as provider_name,
      p.payout_venmo as provider_venmo,
      p.payout_method as provider_payout_method,
      b.display_name as buyer_name,
      b.business_name as buyer_business_name
    FROM leads l
    LEFT JOIN users p ON l.provider_id = p.id
    LEFT JOIN users b ON l.buyer_id = b.id
    ORDER BY l.submitted_at DESC
    LIMIT ${limit}
  `;
  return result as unknown as DbLead[];
}

export async function getLeadsPendingForwarding() {
  const sql = getSql();
  const result = await sql`
    SELECT l.*,
      p.display_name as provider_name,
      p.payout_venmo as provider_venmo,
      p.payout_method as provider_payout_method,
      b.display_name as buyer_name,
      b.business_name as buyer_business_name
    FROM leads l
    LEFT JOIN users p ON l.provider_id = p.id
    LEFT JOIN users b ON l.buyer_id = b.id
    WHERE l.payout_status = 'processing'
    ORDER BY l.submitted_at ASC
  `;
  return result as unknown as (DbLead & {
    provider_venmo: string | null;
    provider_payout_method: string | null;
  })[];
}

export async function getAllUsers() {
  const sql = getSql();
  const result = await sql`
    SELECT
      u.id, u.email, u.username, u.role, u.display_name, u.phone,
      u.business_name, u.location, u.is_active, u.created_at,
      u.payout_method, u.payout_venmo,
      COALESCE(ps.total_leads, bs.total_leads, 0)::int as total_leads,
      COALESCE(ps.total_volume, bs.total_volume, 0)::numeric as total_volume
    FROM users u
    LEFT JOIN (
      SELECT provider_id, COUNT(*)::int as total_leads, COALESCE(SUM(payout_amount), 0)::numeric as total_volume
      FROM leads GROUP BY provider_id
    ) ps ON u.id = ps.provider_id AND u.role = 'provider'
    LEFT JOIN (
      SELECT buyer_id, COUNT(*)::int as total_leads, COALESCE(SUM(payout_amount), 0)::numeric as total_volume
      FROM leads GROUP BY buyer_id
    ) bs ON u.id = bs.buyer_id AND u.role = 'buyer'
    WHERE u.role IN ('provider', 'buyer')
    ORDER BY u.created_at DESC
  `;
  return result as unknown as (DbUser & { total_leads: number; total_volume: number })[];
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const sql = getSql();
  const result = await sql`
    UPDATE users SET is_active = ${isActive}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return first<DbUser>(result);
}

// ============================================
// Platform Settings queries
// ============================================

export interface PlatformSettings {
  fee_total: number;
  fee_buyer: number;
  fee_provider: number;
  fee_type: 'flat' | 'percent' | 'mixed';
  fee_percent: number;
  fee_percent_buyer_share: number;
  fee_mixed_flat: number;
  fee_mixed_percent: number;
  fee_mixed_buyer_share: number;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const sql = getSql();
  const result = await sql`SELECT key, value FROM platform_settings WHERE key LIKE 'fee_%'`;

  // Defaults: hybrid fee — $0.30 flat + 12.5% of lead value, split 50/50 between buyer and provider.
  // The $0.30 flat component offsets Stripe's per-transaction $0.30 processing fee.
  const settings: PlatformSettings = {
    fee_total: 0,
    fee_buyer: 0.0,
    fee_provider: 0.0,
    fee_type: 'mixed',
    fee_percent: 12.5,
    fee_percent_buyer_share: 50,
    fee_mixed_flat: 0.30,
    fee_mixed_percent: 12.5,
    fee_mixed_buyer_share: 50,  // 50% from buyer, 50% from provider — even split
  };

  for (const row of result) {
    switch (row.key) {
      case 'fee_total': settings.fee_total = Number(row.value); break;
      case 'fee_buyer': settings.fee_buyer = Number(row.value); break;
      case 'fee_provider': settings.fee_provider = Number(row.value); break;
      case 'fee_type': settings.fee_type = row.value as PlatformSettings['fee_type']; break;
      case 'fee_percent': settings.fee_percent = Number(row.value); break;
      case 'fee_percent_buyer_share': settings.fee_percent_buyer_share = Number(row.value); break;
      case 'fee_mixed_flat': settings.fee_mixed_flat = Number(row.value); break;
      case 'fee_mixed_percent': settings.fee_mixed_percent = Number(row.value); break;
      case 'fee_mixed_buyer_share': settings.fee_mixed_buyer_share = Number(row.value); break;
    }
  }

  return settings;
}

async function upsertSetting(sql: ReturnType<typeof getSql>, key: string, value: string) {
  await sql`INSERT INTO platform_settings (key, value, updated_at) VALUES (${key}, ${value}, NOW()) ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`;
}

export async function updatePlatformSettings(settings: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const sql = getSql();

  const entries: [string, string | undefined][] = [
    ['fee_total', settings.fee_total !== undefined ? String(settings.fee_total) : undefined],
    ['fee_buyer', settings.fee_buyer !== undefined ? String(settings.fee_buyer) : undefined],
    ['fee_provider', settings.fee_provider !== undefined ? String(settings.fee_provider) : undefined],
    ['fee_type', settings.fee_type],
    ['fee_percent', settings.fee_percent !== undefined ? String(settings.fee_percent) : undefined],
    ['fee_percent_buyer_share', settings.fee_percent_buyer_share !== undefined ? String(settings.fee_percent_buyer_share) : undefined],
    ['fee_mixed_flat', settings.fee_mixed_flat !== undefined ? String(settings.fee_mixed_flat) : undefined],
    ['fee_mixed_percent', settings.fee_mixed_percent !== undefined ? String(settings.fee_mixed_percent) : undefined],
    ['fee_mixed_buyer_share', settings.fee_mixed_buyer_share !== undefined ? String(settings.fee_mixed_buyer_share) : undefined],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined) {
      await upsertSetting(sql, key, value);
    }
  }

  return getPlatformSettings();
}

// ============================================
// Operating Costs queries
// ============================================

export interface OperatingCost {
  id: string;
  name: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'per_transaction';
  category: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getOperatingCosts(): Promise<OperatingCost[]> {
  const sql = getSql();
  const result = await sql`SELECT * FROM operating_costs WHERE is_active = true ORDER BY category, name`;
  return result as unknown as OperatingCost[];
}

export async function upsertOperatingCost(cost: {
  id?: string;
  name: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'per_transaction';
  category: string;
  description?: string;
}): Promise<OperatingCost> {
  const sql = getSql();
  if (cost.id) {
    const result = await sql`
      UPDATE operating_costs SET
        name = ${cost.name}, amount = ${cost.amount}, frequency = ${cost.frequency},
        category = ${cost.category}, description = ${cost.description || null}, updated_at = NOW()
      WHERE id = ${cost.id}
      RETURNING *
    `;
    return first<OperatingCost>(result)!;
  } else {
    const result = await sql`
      INSERT INTO operating_costs (name, amount, frequency, category, description)
      VALUES (${cost.name}, ${cost.amount}, ${cost.frequency}, ${cost.category}, ${cost.description || null})
      RETURNING *
    `;
    return first<OperatingCost>(result)!;
  }
}

export async function deleteOperatingCost(id: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE operating_costs SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
}

// ============================================
// Profitability queries
// ============================================

export async function getRevenueByPeriod(period: 'week' | 'month' | 'year') {
  const sql = getSql();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const result = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::numeric as completed_revenue,
      COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric as pending_revenue,
      COUNT(*) FILTER (WHERE status = 'completed')::int as completed_tx_count
    FROM transactions
    WHERE type = 'platform_fee'
      AND COALESCE(completed_at, created_at) >= NOW() - INTERVAL '1 day' * ${days}
  `;
  return {
    completedRevenue: Number(result[0].completed_revenue),
    pendingRevenue: Number(result[0].pending_revenue),
    completedTxCount: result[0].completed_tx_count,
  };
}

export async function getVenmoFeeCosts() {
  const sql = getSql();
  // Venmo receive fee (1.9% + $0.10) applies to the full buyer payment (payout_amount + buyer fee)
  // We calculate from completed leads where buyer has paid
  const result = await sql`
    SELECT
      COALESCE(SUM(payout_amount * 0.019 + 0.10), 0)::numeric as total_venmo_fees,
      COUNT(*)::int as tx_count
    FROM leads
    WHERE payout_status IN ('processing', 'completed')
  `;
  return {
    totalVenmoFees: Number(result[0].total_venmo_fees),
    txCount: result[0].tx_count,
  };
}

// ============================================
// Detailed user stats for Info tab
// ============================================

export async function getDetailedUserStats() {
  const sql = getSql();
  const result = await sql`
    SELECT
      u.id, u.email, u.username, u.role, u.display_name, u.phone,
      u.business_name, u.location, u.is_active, u.disabled_at, u.created_at,
      u.payout_method, u.payout_venmo,
      COALESCE(ls.total_leads, 0)::int as total_leads,
      COALESCE(ls.total_volume, 0)::numeric as total_volume,
      ls.last_lead_at,
      COALESCE(pf.total_platform_fees, 0)::numeric as platform_fees_earned,
      COALESCE(ye.yearly_earnings, 0)::numeric as yearly_earnings
    FROM users u
    LEFT JOIN (
      SELECT
        CASE WHEN u2.role = 'provider' THEN l.provider_id ELSE l.buyer_id END as user_id,
        u2.role,
        COUNT(*)::int as total_leads,
        COALESCE(SUM(l.payout_amount), 0)::numeric as total_volume,
        MAX(l.submitted_at) as last_lead_at
      FROM leads l
      JOIN users u2 ON (u2.id = l.provider_id AND u2.role = 'provider') OR (u2.id = l.buyer_id AND u2.role = 'buyer')
      GROUP BY CASE WHEN u2.role = 'provider' THEN l.provider_id ELSE l.buyer_id END, u2.role
    ) ls ON u.id = ls.user_id AND u.role = ls.role
    LEFT JOIN (
      SELECT
        CASE WHEN u3.role = 'provider' THEN l2.provider_id ELSE l2.buyer_id END as user_id,
        u3.role,
        COALESCE(SUM(t.amount), 0)::numeric as total_platform_fees
      FROM transactions t
      JOIN leads l2 ON t.lead_id = l2.id
      JOIN users u3 ON (u3.id = l2.provider_id AND u3.role = 'provider') OR (u3.id = l2.buyer_id AND u3.role = 'buyer')
      WHERE t.type = 'platform_fee'
      GROUP BY CASE WHEN u3.role = 'provider' THEN l2.provider_id ELSE l2.buyer_id END, u3.role
    ) pf ON u.id = pf.user_id AND u.role = pf.role
    LEFT JOIN (
      SELECT to_account_id,
        COALESCE(SUM(net_amount), 0)::numeric as yearly_earnings
      FROM transactions
      WHERE type = 'lead_payout' AND status = 'completed'
        AND EXTRACT(YEAR FROM completed_at) = EXTRACT(YEAR FROM NOW())
      GROUP BY to_account_id
    ) ye ON u.id = ye.to_account_id AND u.role = 'provider'
    WHERE u.role IN ('provider', 'buyer')
    ORDER BY u.created_at DESC
  `;
  return result as unknown as (DbUser & {
    total_leads: number;
    total_volume: number;
    last_lead_at: string | null;
    platform_fees_earned: number;
    yearly_earnings: number;
  })[];
}

// ============================================
// Stripe helper queries
// ============================================

export async function updateUserStripeAccount(userId: string, stripeAccountId: string, onboardingComplete: boolean): Promise<DbUser | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE users SET
      stripe_account_id = ${stripeAccountId},
      stripe_onboarding_complete = ${onboardingComplete},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return first<DbUser>(result);
}

export async function updateUserStripeCustomer(userId: string, stripeCustomerId: string): Promise<DbUser | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE users SET
      stripe_customer_id = ${stripeCustomerId},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return first<DbUser>(result);
}

export async function getProvidersByIds(ids: string[]): Promise<DbUser[]> {
  if (ids.length === 0) return [];
  const sql = getSql();
  const result = await sql`
    SELECT * FROM users WHERE id = ANY(${ids}) AND role = 'provider'
  `;
  return result as unknown as DbUser[];
}

export async function batchUpdateLeadStripeTransfer(leadIds: string[], stripeTransferId: string, payoutStatus: 'completed' | 'failed'): Promise<string[]> {
  if (leadIds.length === 0) return [];
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET
      stripe_transfer_id = ${stripeTransferId},
      payout_status = ${payoutStatus},
      payout_completed_at = CASE WHEN ${payoutStatus === 'completed'} THEN NOW() ELSE payout_completed_at END
    WHERE id = ANY(${leadIds}) AND payout_status IN ('pending', 'approved', 'processing')
    RETURNING id
  `;
  return result.map((r: any) => r.id as string);
}

export async function batchUpdateLeadPayoutStatus(leadIds: string[], payoutStatus: 'pending' | 'processing' | 'completed' | 'failed'): Promise<number> {
  if (leadIds.length === 0) return 0;
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET
      payout_status = ${payoutStatus},
      payout_completed_at = CASE WHEN ${payoutStatus === 'completed'} THEN NOW() ELSE payout_completed_at END
    WHERE id = ANY(${leadIds})
    RETURNING id
  `;
  return result.length;
}

export async function updateLeadStripePayment(leadId: string, stripePaymentId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE leads SET stripe_payment_id = ${stripePaymentId}
    WHERE id = ${leadId}
  `;
}

// ============================================
// Lead rejection
// ============================================

export async function rejectLead(leadId: string, buyerId: string, reason: string): Promise<DbLead | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET
      payout_status = 'rejected',
      rejection_reason = ${reason},
      rejected_at = NOW(),
      rejected_by = ${buyerId}
    WHERE id = ${leadId} AND buyer_id = ${buyerId} AND payout_status = 'pending'
    RETURNING *
  `;
  return first<DbLead>(result);
}

// ============================================
// Auto-pay functions
// ============================================

export async function autoApproveLeads(buyerId: string, reviewWindowDays: number): Promise<string[]> {
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET payout_status = 'approved'
    WHERE buyer_id = ${buyerId}
      AND payout_status = 'pending'
      AND submitted_at < NOW() - (${reviewWindowDays} || ' days')::interval
    RETURNING id
  `;
  return result.map((r: any) => r.id as string);
}

export async function getApprovedLeadsByBuyerId(buyerId: string): Promise<DbLead[]> {
  const sql = getSql();
  const result = await sql`
    SELECT l.*, u.display_name as provider_name, u.email as provider_email, u.phone as provider_phone
    FROM leads l
    LEFT JOIN users u ON l.provider_id = u.id
    WHERE l.buyer_id = ${buyerId} AND l.payout_status = 'approved'
    ORDER BY l.submitted_at DESC
  `;
  return result as unknown as DbLead[];
}

export async function getAutoPayBuyers(): Promise<Array<{id: string; auto_pay_schedule: string; review_window_days: number; next_auto_pay_date: string | null}>> {
  const sql = getSql();
  const result = await sql`
    SELECT id, auto_pay_schedule, review_window_days, next_auto_pay_date::text
    FROM users
    WHERE role = 'buyer' AND auto_pay_enabled = TRUE AND next_auto_pay_date <= NOW()
  `;
  return result as any[];
}

export async function updateNextAutoPayDate(userId: string, nextDate: Date): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET next_auto_pay_date = ${nextDate.toISOString()} WHERE id = ${userId}`;
}

export async function getAutoPaySettings(userId: string): Promise<{auto_pay_enabled: boolean; auto_pay_schedule: string; review_window_days: number; next_auto_pay_date: string | null}> {
  const sql = getSql();
  const result = await sql`
    SELECT auto_pay_enabled, auto_pay_schedule, review_window_days, next_auto_pay_date::text
    FROM users WHERE id = ${userId}
  `;
  const row = first<any>(result);
  return {
    auto_pay_enabled: row?.auto_pay_enabled ?? false,
    auto_pay_schedule: row?.auto_pay_schedule ?? 'biweekly',
    review_window_days: row?.review_window_days ?? 3,
    next_auto_pay_date: row?.next_auto_pay_date ?? null,
  };
}

export async function updateAutoPaySettings(userId: string, settings: {auto_pay_enabled: boolean; auto_pay_schedule: string; review_window_days: number; next_auto_pay_date: Date | null}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users SET
      auto_pay_enabled = ${settings.auto_pay_enabled},
      auto_pay_schedule = ${settings.auto_pay_schedule},
      review_window_days = ${settings.review_window_days},
      next_auto_pay_date = ${settings.next_auto_pay_date ? settings.next_auto_pay_date.toISOString() : null}
    WHERE id = ${userId}
  `;
}

// ============================================
// Invite queries
// ============================================

export interface DbInvite {
  id: string;
  buyer_id: string;
  invite_code: string;
  provider_email: string | null;
  provider_phone: string | null;
  provider_name: string | null;
  rate_per_lead: number;
  payment_timing: string;
  weekly_lead_cap: number | null;
  monthly_lead_cap: number | null;
  termination_notice_days: number;
  message: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  // Joined fields
  buyer_business_name?: string | null;
  buyer_display_name?: string | null;
}

export async function createInvite(data: {
  buyer_id: string;
  invite_code: string;
  provider_email?: string;
  provider_phone?: string;
  provider_name?: string;
  rate_per_lead?: number;
  payment_timing?: string;
  weekly_lead_cap?: number;
  monthly_lead_cap?: number;
  termination_notice_days?: number;
  message?: string;
}): Promise<DbInvite> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO invites (
      buyer_id, invite_code, provider_email, provider_phone, provider_name,
      rate_per_lead, payment_timing, weekly_lead_cap, monthly_lead_cap,
      termination_notice_days, message
    ) VALUES (
      ${data.buyer_id},
      ${data.invite_code},
      ${data.provider_email || null},
      ${data.provider_phone || null},
      ${data.provider_name || null},
      ${data.rate_per_lead || 50},
      ${data.payment_timing || 'per_lead'},
      ${data.weekly_lead_cap || null},
      ${data.monthly_lead_cap || null},
      ${data.termination_notice_days || 7},
      ${data.message || null}
    )
    RETURNING *
  `;
  return first<DbInvite>(result)!;
}

export async function getInviteByCode(code: string): Promise<DbInvite | null> {
  const sql = getSql();
  const result = await sql`
    SELECT i.*, u.business_name as buyer_business_name, u.display_name as buyer_display_name
    FROM invites i
    JOIN users u ON i.buyer_id = u.id
    WHERE i.invite_code = ${code}
    LIMIT 1
  `;
  return first<DbInvite>(result);
}

export async function getInvitesByBuyerId(buyerId: string): Promise<DbInvite[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM invites
    WHERE buyer_id = ${buyerId}
    ORDER BY created_at DESC
  `;
  return result as unknown as DbInvite[];
}

export async function markInviteAccepted(inviteId: string, userId: string): Promise<DbInvite | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE invites SET
      status = 'accepted',
      accepted_at = NOW(),
      accepted_by_user_id = ${userId}
    WHERE id = ${inviteId}
    RETURNING *
  `;
  return first<DbInvite>(result);
}

export async function cancelInvite(inviteId: string, buyerId: string): Promise<DbInvite | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE invites SET status = 'cancelled'
    WHERE id = ${inviteId} AND buyer_id = ${buyerId} AND status = 'pending'
    RETURNING *
  `;
  return first<DbInvite>(result);
}

// Webhook idempotency
let webhookTableEnsured = false;
async function ensureProcessedWebhooksTable(): Promise<void> {
  if (webhookTableEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      event_id VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  webhookTableEnsured = true;
}

export async function hasWebhookBeenProcessed(eventId: string): Promise<boolean> {
  await ensureProcessedWebhooksTable();
  const sql = getSql();
  const result = await sql`
    SELECT 1 FROM processed_webhooks WHERE event_id = ${eventId} LIMIT 1
  `;
  return result.length > 0;
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
  await ensureProcessedWebhooksTable();
  const sql = getSql();
  await sql`
    INSERT INTO processed_webhooks (event_id) VALUES (${eventId})
    ON CONFLICT (event_id) DO NOTHING
  `;
}

// Update transaction status by lead_id and type (for reversals)
export async function updateTransactionStatusByLeadId(
  leadId: string,
  type: string,
  status: string
): Promise<number> {
  const sql = getSql();
  const result = await sql`
    UPDATE transactions SET status = ${status}, updated_at = NOW()
    WHERE lead_id = ${leadId} AND type = ${type}
    RETURNING id
  `;
  return result.length;
}

// Get provider by their Stripe Connect account ID
export async function getProviderByStripeAccountId(stripeAccountId: string): Promise<DbUser | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM users WHERE stripe_account_id = ${stripeAccountId} LIMIT 1
  `;
  return first<DbUser>(result);
}

// Get leads in "processing" status for a provider (awaiting Stripe Connect onboarding)
export async function getProcessingLeadsByProviderId(providerId: string): Promise<DbLead[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM leads
    WHERE provider_id = ${providerId} AND payout_status = 'processing'
    ORDER BY created_at ASC
  `;
  return result as unknown as DbLead[];
}

// ============================================
// Business Lead Criteria functions
// ============================================

export async function getActiveBusinessCriteria(businessId: string): Promise<DbBusinessLeadCriteria | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM business_lead_criteria
    WHERE business_id = ${businessId} AND is_active = TRUE
    LIMIT 1
  `;
  return first<DbBusinessLeadCriteria>(result);
}

// Get a specific criteria snapshot by ID — used to validate leads against
// the criteria the provider originally agreed to, not the current live criteria.
export async function getCriteriaById(criteriaId: string): Promise<DbBusinessLeadCriteria | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM business_lead_criteria
    WHERE id = ${criteriaId}
    LIMIT 1
  `;
  return first<DbBusinessLeadCriteria>(result);
}

export async function createBusinessCriteria(data: {
  business_id: string;
  payout_per_lead: number;
  weekly_cap?: number | null;
  monthly_cap?: number | null;
  payment_timing?: string | null;
  termination_notice_days?: number | null;
}): Promise<DbBusinessLeadCriteria> {
  const sql = getSql();
  // Deactivate any existing active criteria first
  await sql`
    UPDATE business_lead_criteria SET is_active = FALSE, updated_at = NOW()
    WHERE business_id = ${data.business_id} AND is_active = TRUE
  `;
  const result = await sql`
    INSERT INTO business_lead_criteria (business_id, payout_per_lead, weekly_cap, monthly_cap, payment_timing, termination_notice_days)
    VALUES (${data.business_id}, ${data.payout_per_lead}, ${data.weekly_cap ?? null}, ${data.monthly_cap ?? null}, ${data.payment_timing ?? null}, ${data.termination_notice_days ?? null})
    RETURNING *
  `;
  return first<DbBusinessLeadCriteria>(result)!;
}

export async function updateBusinessCriteria(id: string, businessId: string, updates: {
  payout_per_lead?: number;
  weekly_cap?: number | null;
  monthly_cap?: number | null;
  payment_timing?: string | null;
  termination_notice_days?: number | null;
}): Promise<DbBusinessLeadCriteria | null> {
  const sql = getSql();
  const result = await sql`
    UPDATE business_lead_criteria SET
      payout_per_lead = CASE WHEN ${updates.payout_per_lead !== undefined} THEN ${updates.payout_per_lead} ELSE payout_per_lead END,
      weekly_cap = CASE WHEN ${updates.weekly_cap !== undefined} THEN ${updates.weekly_cap ?? null} ELSE weekly_cap END,
      monthly_cap = CASE WHEN ${updates.monthly_cap !== undefined} THEN ${updates.monthly_cap ?? null} ELSE monthly_cap END,
      payment_timing = CASE WHEN ${updates.payment_timing !== undefined} THEN ${updates.payment_timing ?? null} ELSE payment_timing END,
      termination_notice_days = CASE WHEN ${updates.termination_notice_days !== undefined} THEN ${updates.termination_notice_days ?? null} ELSE termination_notice_days END,
      updated_at = NOW()
    WHERE id = ${id} AND business_id = ${businessId}
    RETURNING *
  `;
  return first<DbBusinessLeadCriteria>(result);
}

export async function deactivateBusinessCriteria(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE business_lead_criteria SET is_active = FALSE, updated_at = NOW()
    WHERE id = ${id}
  `;
}

// ============================================
// Lead Criteria Fields functions
// ============================================

export async function getCriteriaFields(criteriaId: string): Promise<DbLeadCriteriaField[]> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM lead_criteria_fields
    WHERE criteria_id = ${criteriaId}
    ORDER BY sort_order ASC
  `;
  return result as unknown as DbLeadCriteriaField[];
}

export async function setCriteriaFields(criteriaId: string, fields: {
  field_type: 'PHOTO' | 'TEXT' | 'BINARY';
  label: string;
  option_a?: string | null;
  option_b?: string | null;
  is_mandatory: boolean;
  sort_order: number;
}[]): Promise<DbLeadCriteriaField[]> {
  const sql = getSql();
  // Delete existing fields
  await sql`DELETE FROM lead_criteria_fields WHERE criteria_id = ${criteriaId}`;
  // Insert new fields
  const results: DbLeadCriteriaField[] = [];
  for (const field of fields) {
    const result = await sql`
      INSERT INTO lead_criteria_fields (criteria_id, field_type, label, option_a, option_b, is_mandatory, sort_order)
      VALUES (${criteriaId}, ${field.field_type}, ${field.label}, ${field.option_a ?? null}, ${field.option_b ?? null}, ${field.is_mandatory}, ${field.sort_order})
      RETURNING *
    `;
    results.push(first<DbLeadCriteriaField>(result)!);
  }
  return results;
}

export async function getBusinessCriteriaWithFields(businessId: string): Promise<{
  criteria: DbBusinessLeadCriteria;
  fields: DbLeadCriteriaField[];
} | null> {
  const criteria = await getActiveBusinessCriteria(businessId);
  if (!criteria) return null;
  const fields = await getCriteriaFields(criteria.id);
  return { criteria, fields };
}

// ============================================
// Terminate Deal
// ============================================

export async function terminateDeal(businessId: string): Promise<{
  connectionsTerminated: number;
  payoutsFlagged: number;
}> {
  const sql = getSql();
  // Deactivate criteria
  await sql`
    UPDATE business_lead_criteria SET is_active = FALSE, updated_at = NOW()
    WHERE business_id = ${businessId} AND is_active = TRUE
  `;
  // Terminate all active connections
  const terminated = await sql`
    UPDATE connections SET status = 'terminated'
    WHERE buyer_id = ${businessId} AND status = 'active'
    RETURNING id
  `;
  // Flag pending payouts
  const flagged = await sql`
    UPDATE leads SET payout_status = 'failed'
    WHERE buyer_id = ${businessId} AND payout_status = 'pending'
    RETURNING id
  `;
  return {
    connectionsTerminated: terminated.length,
    payoutsFlagged: flagged.length,
  };
}

// ============================================
// Provider Onboarding functions
// ============================================

export async function getProviderOnboardingState(userId: string): Promise<{ step: number; complete: boolean } | null> {
  const sql = getSql();
  const result = await sql`
    SELECT onboarding_step, onboarding_complete FROM users
    WHERE id = ${userId} AND role = 'provider'
    LIMIT 1
  `;
  if (result.length === 0) return null;
  return {
    step: result[0].onboarding_step as number,
    complete: result[0].onboarding_complete as boolean,
  };
}

export async function updateProviderOnboardingStep(userId: string, step: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users SET onboarding_step = ${step}, updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function completeProviderOnboarding(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE users SET onboarding_complete = TRUE, updated_at = NOW()
    WHERE id = ${userId}
  `;
}

// ============================================
// Provider Terms & Criteria Acknowledgment
// ============================================

export async function createTermsAcceptance(data: {
  provider_id: string;
  business_id: string;
  criteria_id: string;
}): Promise<DbProviderTermsAcceptance> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO provider_terms_acceptance (provider_id, business_id, criteria_id)
    VALUES (${data.provider_id}, ${data.business_id}, ${data.criteria_id})
    ON CONFLICT (provider_id, business_id) DO UPDATE SET
      criteria_id = ${data.criteria_id},
      accepted_at = NOW()
    RETURNING *
  `;
  return first<DbProviderTermsAcceptance>(result)!;
}

export async function getTermsAcceptance(providerId: string, businessId: string): Promise<DbProviderTermsAcceptance | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM provider_terms_acceptance
    WHERE provider_id = ${providerId} AND business_id = ${businessId}
    LIMIT 1
  `;
  return first<DbProviderTermsAcceptance>(result);
}

export async function createCriteriaAcknowledgment(data: {
  provider_id: string;
  business_id: string;
  criteria_id: string;
}): Promise<DbProviderCriteriaAcknowledgment> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO provider_criteria_acknowledgment (provider_id, business_id, criteria_id)
    VALUES (${data.provider_id}, ${data.business_id}, ${data.criteria_id})
    ON CONFLICT (provider_id, criteria_id) DO UPDATE SET
      acknowledged_at = NOW()
    RETURNING *
  `;
  return first<DbProviderCriteriaAcknowledgment>(result)!;
}

export async function getCriteriaAcknowledgment(providerId: string, criteriaId: string): Promise<DbProviderCriteriaAcknowledgment | null> {
  const sql = getSql();
  const result = await sql`
    SELECT * FROM provider_criteria_acknowledgment
    WHERE provider_id = ${providerId} AND criteria_id = ${criteriaId}
    LIMIT 1
  `;
  return first<DbProviderCriteriaAcknowledgment>(result);
}

// ============================================
// Buyer Stripe Setup & Business Agreement
// ============================================

export async function ensureBuyerStripeColumns(): Promise<void> {
  const sql = getSql();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS buyer_stripe_setup_complete BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_agreement_accepted_at TIMESTAMPTZ`;
}

export async function setBuyerStripeSetupComplete(userId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET buyer_stripe_setup_complete = true, updated_at = NOW() WHERE id = ${userId}`;
}

export async function getBuyerStripeSetupComplete(userId: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`SELECT buyer_stripe_setup_complete FROM users WHERE id = ${userId} LIMIT 1`;
  return (result[0] as { buyer_stripe_setup_complete: boolean } | undefined)?.buyer_stripe_setup_complete ?? false;
}

export async function recordBusinessAgreementAccepted(userId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET business_agreement_accepted_at = NOW(), updated_at = NOW() WHERE id = ${userId}`;
}

// ============================================
// Account Disable (Soft Delete)
// ============================================

export async function ensureDisabledAtColumn(): Promise<void> {
  const sql = getSql();
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ DEFAULT NULL`;
}

export async function disableAccount(userId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET disabled_at = NOW(), updated_at = NOW() WHERE id = ${userId}`;
}

export async function enableAccount(userId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE users SET disabled_at = NULL, updated_at = NOW() WHERE id = ${userId}`;
}

// ============================================
// Hard Delete (permanent — admin only, pre-launch cleanup)
// ============================================

/**
 * Permanently deletes a user and all associated records from the database.
 * Must be called AFTER any external cleanup (e.g. Stripe account deletion).
 * Cascade order respects FK constraints.
 */
export async function hardDeleteUser(userId: string): Promise<void> {
  const sql = getSql();

  // 1. Child tables that reference leads / connections / users
  await sql`DELETE FROM lead_criteria_fields WHERE criteria_id IN (SELECT id FROM business_lead_criteria WHERE business_id = ${userId})`;
  await sql`DELETE FROM provider_criteria_acknowledgment WHERE provider_id = ${userId} OR business_id = ${userId}`;
  await sql`DELETE FROM provider_terms_acceptance WHERE provider_id = ${userId} OR business_id = ${userId}`;
  await sql`DELETE FROM transactions WHERE from_account_id = ${userId} OR to_account_id = ${userId} OR lead_id IN (SELECT id FROM leads WHERE provider_id = ${userId} OR buyer_id = ${userId})`;
  await sql`DELETE FROM leads WHERE provider_id = ${userId} OR buyer_id = ${userId}`;

  // 2. Invite-related tables
  await sql`DELETE FROM invite_token_uses WHERE provider_id = ${userId} OR invite_token_id IN (SELECT id FROM invite_tokens WHERE buyer_id = ${userId})`;
  await sql`DELETE FROM connections WHERE provider_id = ${userId} OR buyer_id = ${userId}`;
  await sql`DELETE FROM business_lead_criteria WHERE business_id = ${userId}`;
  await sql`DELETE FROM invite_tokens WHERE buyer_id = ${userId}`;
  await sql`DELETE FROM invites WHERE buyer_id = ${userId} OR accepted_by_user_id = ${userId}`;

  // 3. Auth helpers
  await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;

  // 4. Finally, the user row itself
  await sql`DELETE FROM users WHERE id = ${userId}`;
}

/**
 * Returns minimal user data needed for hard-delete (Stripe IDs, role, email).
 */
export async function getUserForDeletion(userId: string): Promise<{
  id: string;
  email: string;
  role: string;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
} | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, role, stripe_account_id, stripe_customer_id
    FROM users WHERE id = ${userId} LIMIT 1
  `;
  return (rows[0] as { id: string; email: string; role: string; stripe_account_id: string | null; stripe_customer_id: string | null; } | undefined) ?? null;
}

