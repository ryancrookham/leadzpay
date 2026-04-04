-- Migration: Create invites table for provider onboarding
-- Run this after 003_user_profile_and_payout.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(20) UNIQUE NOT NULL,
  provider_email VARCHAR(255),
  provider_phone VARCHAR(20),
  provider_name VARCHAR(255),
  rate_per_lead DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing VARCHAR(20) NOT NULL DEFAULT 'per_lead',
  weekly_lead_cap INTEGER,
  monthly_lead_cap INTEGER,
  termination_notice_days INTEGER DEFAULT 7,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_invites_buyer ON invites(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
