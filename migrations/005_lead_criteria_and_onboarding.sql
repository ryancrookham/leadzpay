-- Migration 005: Lead Criteria Builder + Provider Onboarding
-- Adds business-defined lead requirements and 4-step provider onboarding gate

-- ===========================================
-- BUSINESS LEAD CRITERIA
-- ===========================================
CREATE TABLE business_lead_criteria (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payout_per_lead DECIMAL(10,2) NOT NULL,
  weekly_cap      INTEGER,
  monthly_cap     INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Max 1 active criteria per business
CREATE UNIQUE INDEX idx_business_lead_criteria_active
  ON business_lead_criteria(business_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_business_lead_criteria_business
  ON business_lead_criteria(business_id);

-- ===========================================
-- LEAD CRITERIA FIELDS
-- ===========================================
CREATE TABLE lead_criteria_fields (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  criteria_id UUID NOT NULL REFERENCES business_lead_criteria(id) ON DELETE CASCADE,
  field_type  VARCHAR(10) NOT NULL CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY')),
  label       VARCHAR(255) NOT NULL,
  option_a    VARCHAR(255),
  option_b    VARCHAR(255),
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_lead_criteria_fields_criteria
  ON lead_criteria_fields(criteria_id);

-- ===========================================
-- PROVIDER TERMS ACCEPTANCE
-- ===========================================
CREATE TABLE provider_terms_acceptance (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES business_lead_criteria(id) ON DELETE CASCADE,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, business_id)
);

-- ===========================================
-- PROVIDER CRITERIA ACKNOWLEDGMENT
-- ===========================================
CREATE TABLE provider_criteria_acknowledgment (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criteria_id     UUID NOT NULL REFERENCES business_lead_criteria(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, criteria_id)
);

-- ===========================================
-- COLUMN ADDITIONS
-- ===========================================

-- Users: onboarding tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Connections: link to criteria
ALTER TABLE connections ADD COLUMN IF NOT EXISTS criteria_id UUID REFERENCES business_lead_criteria(id) ON DELETE SET NULL;

-- Leads: store provider responses to custom criteria fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS criteria_fields_data JSONB;

-- ===========================================
-- GRANDFATHERING: existing providers skip onboarding
-- ===========================================
UPDATE users SET onboarding_complete = TRUE WHERE role = 'provider';

-- ===========================================
-- UPDATE TRIGGER for business_lead_criteria
-- ===========================================
DROP TRIGGER IF EXISTS business_lead_criteria_updated_at ON business_lead_criteria;
CREATE TRIGGER business_lead_criteria_updated_at
  BEFORE UPDATE ON business_lead_criteria
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
