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
  rate_per_lead?: number;
  payment_timing?: 'per_lead' | 'weekly' | 'biweekly' | 'monthly';
  weekly_lead_cap?: number;
  monthly_lead_cap?: number;
  termination_notice_days?: number;
}): Promise<DbConnection> {
  const sql = getSql();
  const status = data.status || (data.initiator === 'provider' ? 'pending_buyer_review' : 'pending_provider_accept');
  const result = await sql`
    INSERT INTO connections (
      provider_id, buyer_id, initiator, message, status,
      rate_per_lead, payment_timing, weekly_lead_cap, monthly_lead_cap, termination_notice_days
    ) VALUES (
      ${data.provider_id},
      ${data.buyer_id},
      ${data.initiator},
      ${data.message || null},
      ${status},
      ${data.rate_per_lead || 50},
      ${data.payment_timing || 'per_lead'},
      ${data.weekly_lead_cap || null},
      ${data.monthly_lead_cap || null},
      ${data.termination_notice_days || 7}
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
// Admin / Platform stats queries
// ============================================

export async function getPlatformStats() {
  const sql = getSql();

  const [leadStats] = await sql`
    SELECT
      COUNT(*)::int as total_leads,
      COUNT(*) FILTER (WHERE payout_status = 'completed')::int as paid_leads,
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
    totalLeadVolume: Number(leadStats.total_lead_volume),
    completedRevenue: Number(txStats.completed_revenue),
    pendingRevenue: Number(txStats.pending_revenue),
    activeConnections: connectionStats.active_connections,
    activeProviders: userStats.active_providers,
    activeBuyers: userStats.active_buyers,
  };
}

export async function getRevenueByDay(days: number = 30) {
  const sql = getSql();
  const result = await sql`
    SELECT
      DATE(created_at) as day,
      COALESCE(SUM(amount), 0)::numeric as revenue,
      COUNT(*)::int as tx_count
    FROM transactions
    WHERE type = 'platform_fee'
      AND created_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY DATE(created_at)
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

