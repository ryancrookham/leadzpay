-- Migration 004: Invite Tokens for Private Channel Architecture
-- Creates the invite_tokens and invite_token_uses tables
-- and adds invite_token_id + required_fields columns to connections

CREATE TABLE invite_tokens (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token                   VARCHAR(64) NOT NULL UNIQUE,
  label                   VARCHAR(255),
  channel_name            VARCHAR(255),
  channel_description     TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  use_count               INTEGER NOT NULL DEFAULT 0,
  max_uses                INTEGER,
  expires_at              TIMESTAMP WITH TIME ZONE,
  rate_per_lead           DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  payment_timing          VARCHAR(20) NOT NULL DEFAULT 'per_lead',
  weekly_lead_cap         INTEGER,
  monthly_lead_cap        INTEGER,
  termination_notice_days INTEGER NOT NULL DEFAULT 7,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX idx_invite_tokens_buyer ON invite_tokens(buyer_id);

CREATE TABLE invite_token_uses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_token_id UUID NOT NULL REFERENCES invite_tokens(id) ON DELETE CASCADE,
  provider_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES connections(id),
  used_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(invite_token_id, provider_id)
);

ALTER TABLE connections ADD COLUMN IF NOT EXISTS invite_token_id UUID REFERENCES invite_tokens(id) ON DELETE SET NULL;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS required_fields JSONB;
-- required_fields shape: { "licenseImage": "required"|"optional"|"hidden", ... }
-- NULL = all fields required (backward compat with existing connections)
