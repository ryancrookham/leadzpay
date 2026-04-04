-- Migration 009: Terms Renegotiation
-- Allows businesses to propose updated terms to existing providers.
-- A proposal creates a new criteria snapshot; acceptance swaps connections.criteria_id.

CREATE TABLE IF NOT EXISTS connection_term_proposals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id         UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  proposed_criteria_id  UUID NOT NULL REFERENCES business_lead_criteria(id),
  proposed_by           UUID NOT NULL REFERENCES users(id),
  proposed_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  responded_at          TIMESTAMP WITH TIME ZONE,
  provider_note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_term_proposals_connection ON connection_term_proposals(connection_id);
CREATE INDEX IF NOT EXISTS idx_term_proposals_status ON connection_term_proposals(status);
