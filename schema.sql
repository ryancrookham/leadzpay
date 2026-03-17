-- WOML Database Schema for Neon PostgreSQL
-- Run this in your Neon SQL editor to set up the database
-- Last updated: 2026-03-17

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- USERS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('provider', 'buyer', 'admin')),

  -- Common fields
  display_name VARCHAR(255),
  phone VARCHAR(20),
  location VARCHAR(255),
  profile_picture_url VARCHAR(255),

  -- Provider-specific fields
  stripe_account_id VARCHAR(255),
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Provider payout fields
  payout_method VARCHAR(20),
  payout_venmo VARCHAR(255),
  payout_paypal VARCHAR(255),
  payout_cashapp VARCHAR(255),
  payout_bank_routing VARCHAR(255),
  payout_bank_account VARCHAR(255),

  -- Provider onboarding
  onboarding_step INTEGER DEFAULT 0,
  onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Buyer-specific fields
  business_name VARCHAR(255),
  business_type VARCHAR(50),
  licensed_states TEXT[],
  stripe_customer_id VARCHAR(255),
  buyer_stripe_setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_default_payment_method VARCHAR(255),
  stripe_payment_method_set_at TIMESTAMP WITH TIME ZONE,
  business_agreement_accepted_at TIMESTAMP WITH TIME ZONE,
  business_pin_hash TEXT,

  -- Auto-pay settings (buyer)
  auto_pay_enabled BOOLEAN DEFAULT FALSE,
  auto_pay_schedule VARCHAR(20) DEFAULT 'biweekly',
  review_window_days INTEGER DEFAULT 3,
  next_auto_pay_date TIMESTAMP WITH TIME ZONE,

  -- SMS lead alert settings (buyer)
  sms_alerts_enabled BOOLEAN DEFAULT FALSE,
  sms_alert_phone1 TEXT,
  sms_alert_phone2 TEXT,
  sms_agent_1_name TEXT,
  sms_agent_2_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  disabled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ===========================================
-- CONNECTIONS TABLE (Provider-Buyer relationships)
-- ===========================================
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status VARCHAR(30) NOT NULL DEFAULT 'pending_buyer_review'
    CHECK (status IN ('pending_buyer_review', 'pending_provider_accept', 'active', 'declined_by_provider', 'rejected_by_buyer', 'terminated')),

  -- Who initiated and optional message
  initiator VARCHAR(20) DEFAULT 'provider',
  message TEXT,

  -- Payment terms
  rate_per_lead DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing VARCHAR(20) NOT NULL DEFAULT 'per_lead'
    CHECK (payment_timing IN ('per_lead', 'weekly', 'biweekly', 'monthly')),

  -- Caps
  weekly_lead_cap INTEGER,
  monthly_lead_cap INTEGER,

  -- Terms
  termination_notice_days INTEGER DEFAULT 7,
  terms_updated_at TIMESTAMP WITH TIME ZONE,

  -- Invite reference
  invite_token_id UUID,
  required_fields JSONB,
  criteria_id UUID,

  -- Stats
  total_leads INTEGER DEFAULT 0,
  total_paid DECIMAL(12,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(provider_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_connections_buyer ON connections(buyer_id);

-- ===========================================
-- LEADS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id),
  buyer_id UUID REFERENCES users(id),
  connection_id UUID REFERENCES connections(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'converted', 'rejected', 'expired')),

  -- Customer info (encrypted)
  customer_data_encrypted TEXT NOT NULL,
  customer_data_iv VARCHAR(32) NOT NULL,

  -- Duplicate detection hashes
  customer_email_hash TEXT,
  customer_phone_hash TEXT,

  -- Searchable fields
  customer_state VARCHAR(2),
  vehicle_year INTEGER,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),

  -- Custom criteria fields data
  criteria_fields_data JSONB,

  -- Payment tracking
  payout_amount DECIMAL(10,2) NOT NULL,
  payout_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected')),
  stripe_payment_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),

  -- Rejection tracking
  rejection_reason TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES users(id),

  -- Pipeline / CRM tracking (business side)
  pipeline_status TEXT DEFAULT 'new',
  contact_type TEXT,
  contacted_sub_status TEXT,
  pipeline_notes TEXT,
  quote_completed BOOLEAN DEFAULT FALSE,
  dead_reason TEXT,
  assigned_to TEXT,
  follow_up_date DATE,

  -- Pipeline timestamps
  contacted_at TIMESTAMP WITH TIME ZONE,
  quoted_at TIMESTAMP WITH TIME ZONE,
  sold_at TIMESTAMP WITH TIME ZONE,
  dead_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  payout_completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_leads_provider ON leads(provider_id);
CREATE INDEX IF NOT EXISTS idx_leads_buyer ON leads(buyer_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- ===========================================
-- TRANSACTIONS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  type VARCHAR(30) NOT NULL
    CHECK (type IN ('lead_payout', 'policy_commission', 'platform_fee', 'refund', 'adjustment')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),

  amount DECIMAL(12,2) NOT NULL,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,

  from_account_id UUID REFERENCES users(id),
  to_account_id UUID REFERENCES users(id),

  lead_id UUID REFERENCES leads(id),
  connection_id UUID REFERENCES connections(id),

  stripe_payment_id VARCHAR(255),
  stripe_transfer_id VARCHAR(255),

  description TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ===========================================
-- INVITE TOKENS TABLE (business invite links)
-- ===========================================
CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  label VARCHAR(255),
  channel_name VARCHAR(255),
  channel_description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  use_count INTEGER DEFAULT 0,
  max_uses INTEGER,
  expires_at TIMESTAMP WITH TIME ZONE,
  rate_per_lead DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing VARCHAR(20) DEFAULT 'per_lead',
  weekly_lead_cap INTEGER,
  monthly_lead_cap INTEGER,
  termination_notice_days INTEGER DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- INVITE TOKEN USES TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS invite_token_uses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_token_id UUID NOT NULL REFERENCES invite_tokens(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(invite_token_id, provider_id)
);

-- ===========================================
-- INVITES TABLE (SMS invites)
-- ===========================================
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(20),
  email VARCHAR(255),
  name VARCHAR(255),
  invite_token_id UUID REFERENCES invite_tokens(id),
  status VARCHAR(20) DEFAULT 'sent',
  accepted_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE
);

-- ===========================================
-- BUSINESS LEAD CRITERIA TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS business_lead_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Default',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- LEAD CRITERIA FIELDS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS lead_criteria_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  criteria_id UUID NOT NULL REFERENCES business_lead_criteria(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  is_required BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- PROVIDER CRITERIA ACKNOWLEDGMENT TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS provider_criteria_acknowledgment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES business_lead_criteria(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, criteria_id)
);

-- ===========================================
-- PROVIDER TERMS ACCEPTANCE TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS provider_terms_acceptance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES connections(id),
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, business_id)
);

-- ===========================================
-- BUSINESS LEAD CHASERS TABLE (SMS alert recipients)
-- ===========================================
CREATE TABLE IF NOT EXISTS business_lead_chasers (
  id SERIAL PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

-- ===========================================
-- LEAD ACTIVITY LOG TABLE (CRM audit trail)
-- ===========================================
CREATE TABLE IF NOT EXISTS lead_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_lead_id ON lead_activity_log(lead_id);

-- ===========================================
-- BUSINESS SETTINGS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS business_settings (
  business_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dead_lead_window_days INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- PLATFORM SETTINGS TABLE (admin key-value config)
-- ===========================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- PASSWORD RESET TOKENS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- PROCESSED WEBHOOKS TABLE (idempotency)
-- ===========================================
CREATE TABLE IF NOT EXISTS processed_webhooks (
  event_id VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===========================================
-- UPDATE TIMESTAMP TRIGGER
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
