-- Migration 007: Verified Phone Call Feature
-- Adds the call_sessions table, PHONE_CALL field type support,
-- require_verified_call flag on criteria, and call_session_id on leads.

-- ===========================================
-- CALL SESSIONS
-- Tracks Sinch-bridged conference calls between providers and businesses.
-- A session is "verified" when both parties speak for >= 30 seconds.
-- ===========================================
CREATE TABLE IF NOT EXISTS call_sessions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id           UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  sinch_call_id_provider  VARCHAR(255),
  sinch_call_id_buyer     VARCHAR(255),
  status                  VARCHAR(50) NOT NULL DEFAULT 'initiated',
  duration_seconds        INTEGER,
  initiated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at            TIMESTAMP WITH TIME ZONE,
  verified                BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_provider ON call_sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_connection ON call_sessions(connection_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_sinch_provider ON call_sessions(sinch_call_id_provider);
CREATE INDEX IF NOT EXISTS idx_call_sessions_sinch_buyer ON call_sessions(sinch_call_id_buyer);

-- ===========================================
-- ADD require_verified_call TO business_lead_criteria
-- When TRUE, providers must complete a verified Sinch call before
-- they can submit a lead. Toggled by adding a PHONE_CALL field in
-- the Lead Criteria builder.
-- ===========================================
ALTER TABLE business_lead_criteria
  ADD COLUMN IF NOT EXISTS require_verified_call BOOLEAN NOT NULL DEFAULT FALSE;

-- ===========================================
-- EXPAND field_type CHECK TO INCLUDE PHONE_CALL
-- PHONE_CALL is a special field type — it has no label input,
-- is always mandatory, and always placed first. Adding it to
-- the criteria sets require_verified_call = TRUE on save.
-- ===========================================
ALTER TABLE lead_criteria_fields
  DROP CONSTRAINT IF EXISTS lead_criteria_fields_field_type_check;

ALTER TABLE lead_criteria_fields
  ADD CONSTRAINT lead_criteria_fields_field_type_check
  CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY', 'PHONE_CALL'));

-- ===========================================
-- ADD call_session_id TO leads
-- Links a submitted lead to the verified call session that
-- preceded it. NULL when no call was required.
-- ===========================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_call_session ON leads(call_session_id);
