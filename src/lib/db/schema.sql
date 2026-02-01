-- WOML Database Schema for Supabase/PostgreSQL
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- USERS TABLE
-- ===========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('provider', 'buyer', 'admin')),

  -- Common fields
  display_name VARCHAR(255),
  phone VARCHAR(20),
  location VARCHAR(255),
  avatar_url TEXT,

  -- Provider-specific fields (nullable for buyers)
  payout_method VARCHAR(20) CHECK (payout_method IN ('venmo', 'paypal', 'bank', 'stripe')),
  venmo_username VARCHAR(100),
  paypal_email VARCHAR(255),
  bank_account_last4 VARCHAR(4),
  bank_routing_last4 VARCHAR(4),
  stripe_account_id VARCHAR(255),
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Buyer-specific fields (nullable for providers)
  business_name VARCHAR(255),
  business_type VARCHAR(50),
  licensed_states TEXT[], -- Array of state codes
  npn VARCHAR(50), -- National Producer Number
  compliance_acknowledged BOOLEAN DEFAULT FALSE,

  -- Email verification
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_expires TIMESTAMP WITH TIME ZONE,

  -- Password reset
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_stripe_account ON users(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- ===========================================
-- SESSIONS TABLE
-- ===========================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for session lookups
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Auto-delete expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- CONNECTIONS TABLE (Provider-Buyer relationships)
-- ===========================================
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'terminated')),

  -- Payment terms (set by buyer)
  rate_per_lead DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing VARCHAR(20) NOT NULL DEFAULT 'per_lead'
    CHECK (payment_timing IN ('per_lead', 'weekly', 'biweekly', 'monthly')),

  -- Caps (optional)
  weekly_lead_cap INTEGER,
  monthly_lead_cap INTEGER,
  cap_strategy VARCHAR(20) DEFAULT 'pause'
    CHECK (cap_strategy IN ('pause', 'reject')),

  -- Allowed states
  allowed_states TEXT[],

  -- Stats (denormalized for quick access)
  total_leads INTEGER DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,
  leads_this_week INTEGER DEFAULT 0,
  leads_this_month INTEGER DEFAULT 0,

  -- Timestamps
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  terminated_at TIMESTAMP WITH TIME ZONE,
  terms_updated_at TIMESTAMP WITH TIME ZONE,

  -- Unique constraint
  UNIQUE(provider_id, buyer_id)
);

-- Indexes
CREATE INDEX idx_connections_provider ON connections(provider_id);
CREATE INDEX idx_connections_buyer ON connections(buyer_id);
CREATE INDEX idx_connections_status ON connections(status);

-- ===========================================
-- LEADS TABLE
-- ===========================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id),
  buyer_id UUID REFERENCES users(id),
  connection_id UUID REFERENCES connections(id),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'converted', 'rejected', 'expired')),

  -- Customer info (encrypted fields stored as encrypted JSON)
  customer_data_encrypted TEXT NOT NULL, -- AES-GCM encrypted JSON
  customer_data_iv VARCHAR(32) NOT NULL, -- Initialization vector

  -- Non-sensitive searchable fields
  customer_state VARCHAR(2),
  vehicle_year INTEGER,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),

  -- License extraction metadata
  license_extracted BOOLEAN DEFAULT FALSE,
  license_confidence VARCHAR(10) CHECK (license_confidence IN ('high', 'medium', 'low')),

  -- Quote info
  quote_type VARCHAR(20) DEFAULT 'standard'
    CHECK (quote_type IN ('asap', 'standard', 'comprehensive')),
  estimated_premium DECIMAL(10,2),
  selected_carrier VARCHAR(100),

  -- Payment tracking
  payout_amount DECIMAL(10,2) NOT NULL,
  payout_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id VARCHAR(255),

  -- CRM tracking
  crm_pushed BOOLEAN DEFAULT FALSE,
  crm_lead_id VARCHAR(255),
  crm_push_error TEXT,

  -- Policy binding (if converted)
  policy_number VARCHAR(100),
  policy_carrier VARCHAR(100),
  policy_bound_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  payout_completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_leads_provider ON leads(provider_id);
CREATE INDEX idx_leads_buyer ON leads(buyer_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_submitted ON leads(submitted_at);
CREATE INDEX idx_leads_payout_status ON leads(payout_status);

-- ===========================================
-- TRANSACTIONS TABLE (Immutable audit trail)
-- ===========================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Transaction type
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('lead_payout', 'policy_commission', 'platform_fee', 'refund', 'adjustment')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),

  -- Amounts
  amount DECIMAL(12,2) NOT NULL,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,

  -- Parties
  from_account_id UUID REFERENCES users(id),
  to_account_id UUID REFERENCES users(id),

  -- References
  lead_id UUID REFERENCES leads(id),
  connection_id UUID REFERENCES connections(id),

  -- Stripe tracking
  stripe_payment_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),
  stripe_payout_id VARCHAR(255),

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamps (immutable - no updated_at)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Reversal tracking
  reversed_at TIMESTAMP WITH TIME ZONE,
  reversal_reason TEXT,
  reversal_transaction_id UUID REFERENCES transactions(id)
);

-- Indexes
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_from ON transactions(from_account_id);
CREATE INDEX idx_transactions_to ON transactions(to_account_id);
CREATE INDEX idx_transactions_lead ON transactions(lead_id);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_stripe_payment ON transactions(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
CREATE INDEX idx_transactions_stripe_transfer ON transactions(stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;

-- ===========================================
-- ACCOUNT BALANCES VIEW (computed from transactions)
-- ===========================================
CREATE OR REPLACE VIEW account_balances AS
SELECT
  u.id AS user_id,
  u.role AS account_type,
  COALESCE(SUM(CASE WHEN t.to_account_id = u.id AND t.status = 'completed' THEN t.net_amount ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN t.from_account_id = u.id AND t.status = 'completed' THEN t.net_amount ELSE 0 END), 0) AS available_balance,
  COALESCE(SUM(CASE WHEN t.to_account_id = u.id AND t.status = 'pending' THEN t.net_amount ELSE 0 END), 0) AS pending_balance,
  COALESCE(SUM(CASE WHEN t.to_account_id = u.id AND t.status = 'completed' THEN t.net_amount ELSE 0 END), 0) AS total_earnings,
  COALESCE(SUM(CASE WHEN t.from_account_id = u.id AND t.status = 'completed' THEN t.net_amount ELSE 0 END), 0) AS total_payouts
FROM users u
LEFT JOIN transactions t ON t.from_account_id = u.id OR t.to_account_id = u.id
GROUP BY u.id, u.role;

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data (service role bypasses this)
CREATE POLICY users_own_data ON users
  FOR ALL USING (auth.uid() = id);

-- Sessions: users can only see their own sessions
CREATE POLICY sessions_own_data ON sessions
  FOR ALL USING (user_id = auth.uid());

-- Connections: visible to both provider and buyer
CREATE POLICY connections_participants ON connections
  FOR SELECT USING (provider_id = auth.uid() OR buyer_id = auth.uid());

-- Leads: visible to provider who submitted or buyer who received
CREATE POLICY leads_participants ON leads
  FOR SELECT USING (provider_id = auth.uid() OR buyer_id = auth.uid());

-- Transactions: visible to from or to account
CREATE POLICY transactions_participants ON transactions
  FOR SELECT USING (from_account_id = auth.uid() OR to_account_id = auth.uid());

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Update user's updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update connection stats when lead is claimed
CREATE OR REPLACE FUNCTION update_connection_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'claimed' AND OLD.status = 'pending' THEN
    UPDATE connections
    SET
      total_leads = total_leads + 1,
      total_paid = total_paid + NEW.payout_amount,
      leads_this_week = leads_this_week + 1,
      leads_this_month = leads_this_month + 1
    WHERE id = NEW.connection_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_update_connection_stats
  AFTER UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_connection_stats();

-- ===========================================
-- INITIAL DATA
-- ===========================================

-- Insert platform account for fee collection (optional)
-- INSERT INTO users (id, email, username, password_hash, password_salt, role, display_name)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'platform@woml.com',
--   'platform',
--   'not_used_for_login',
--   'not_used',
--   'admin',
--   'WOML Platform'
-- );
