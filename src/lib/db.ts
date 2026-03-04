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
  payment_timing: 'per_lead' | 'weekly' | 'biweekly' | 'monthly';
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
  payout_status: 'pending' | 'processing' | 'completed' | 'failed';
  stripe_payment_id: string | null;
  stripe_transfer_id: string | null;
  submitted_at: string;
  claimed_at: string | null;
  payout_completed_at: string | null;
  // Joined fields (from user table JOINs)
  provider_name?: string | null;
  provider_venmo?: string | null;
  buyer_name?: string | null;
  buyer_business_name?: string | null;
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
  return first<DbUser>(result)!;
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
  payment_timing?: 'per_lead' | 'weekly' | 'biweekly' | 'monthly';
  weekly_lead_cap?: number | null;
  monthly_lead_cap?: number | null;
  termination_notice_days?: number;
  invite_token_id?: string;
  required_fields?: Record<string, string>;
}): Promise<DbConnection> {
  const sql = getSql();
  const status = data.status || (data.initiator === 'provider' ? 'pending_buyer_review' : 'pending_provider_accept');
  const result = await sql`
    INSERT INTO connections (
      provider_id, buyer_id, initiator, message, status, accepted_at,
      rate_per_lead, payment_timing, weekly_lead_cap, monthly_lead_cap, termination_notice_days,
      invite_token_id, required_fields
    ) VALUES (
      ${data.provider_id},
      ${data.buyer_id},
      ${data.initiator},
      ${data.message || null},
      ${status},
      ${data.accepted_at || null},
      ${data.rate_per_lead || 50},
      ${data.payment_timing || 'per_lead'},
      ${data.weekly_lead_cap ?? null},
      ${data.monthly_lead_cap ?? null},
      ${data.termination_notice_days || 7},
      ${data.invite_token_id || null},
      ${data.required_fields ? JSON.stringify(data.required_fields) : null}
    )
    RETURNING *
  `;
  return first<DbConnection>(result)!;
}

export async function updateConnection(id: string, updates: {
  status?: ConnectionStatus;
  rate_per_lead?: number;
  payment_timing?: 'per_lead' | 'weekly' | 'biweekly' | 'monthly';
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

export async function createLead(data: {
  provider_id: string;
  buyer_id: string;
  connection_id: string;
  customer_data_encrypted: string;
  customer_data_iv: string;
  customer_state?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  payout_amount: number;
  stripe_payment_id?: string;
}): Promise<DbLead> {
  const sql = getSql();
  const result = await sql`
    INSERT INTO leads (
      provider_id, buyer_id, connection_id,
      customer_data_encrypted, customer_data_iv,
      customer_state, vehicle_year, vehicle_make, vehicle_model,
      payout_amount, stripe_payment_id
    ) VALUES (
      ${data.provider_id}, ${data.buyer_id}, ${data.connection_id},
      ${data.customer_data_encrypted}, ${data.customer_data_iv},
      ${data.customer_state || null}, ${data.vehicle_year || null},
      ${data.vehicle_make || null}, ${data.vehicle_model || null},
      ${data.payout_amount}, ${data.stripe_payment_id || null}
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
    SELECT l.*, u.display_name as provider_name, u.payout_venmo as provider_venmo
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

  const settings: PlatformSettings = {
    fee_total: 2.0,
    fee_buyer: 1.0,
    fee_provider: 1.0,
    fee_type: 'flat',
    fee_percent: 0,
    fee_percent_buyer_share: 50,
    fee_mixed_flat: 0,
    fee_mixed_percent: 0,
    fee_mixed_buyer_share: 50,
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
      u.business_name, u.location, u.is_active, u.created_at,
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

export async function batchUpdateLeadStripeTransfer(leadIds: string[], stripeTransferId: string, payoutStatus: 'completed' | 'failed'): Promise<number> {
  if (leadIds.length === 0) return 0;
  const sql = getSql();
  const result = await sql`
    UPDATE leads SET
      stripe_transfer_id = ${stripeTransferId},
      payout_status = ${payoutStatus},
      payout_completed_at = CASE WHEN ${payoutStatus === 'completed'} THEN NOW() ELSE payout_completed_at END
    WHERE id = ANY(${leadIds})
    RETURNING id
  `;
  return result.length;
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
export async function hasWebhookBeenProcessed(eventId: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`
    SELECT 1 FROM processed_webhooks WHERE event_id = ${eventId} LIMIT 1
  `;
  return result.length > 0;
}

export async function markWebhookProcessed(eventId: string): Promise<void> {
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

