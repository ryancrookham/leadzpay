-- WOML Database Schema for Neon PostgreSQL
-- Run this in your Neon SQL editor to set up the database

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

  -- Provider-specific fields
  stripe_account_id VARCHAR(255),
  stripe_onboarding_complete BOOLEAN DEFAULT FALSE,

  -- Buyer-specific fields
  business_name VARCHAR(255),
  business_type VARCHAR(50),
  licensed_states TEXT[],

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

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

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'terminated')),

  -- Payment terms
  rate_per_lead DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing VARCHAR(20) NOT NULL DEFAULT 'per_lead'
    CHECK (payment_timing IN ('per_lead', 'weekly', 'biweekly', 'monthly')),

  -- Caps
  weekly_lead_cap INTEGER,
  monthly_lead_cap INTEGER,

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

  -- Searchable fields
  customer_state VARCHAR(2),
  vehicle_year INTEGER,
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),

  -- Payment tracking
  payout_amount DECIMAL(10,2) NOT NULL,
  payout_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'processing', 'completed', 'failed')),
  stripe_transfer_id VARCHAR(255),

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
