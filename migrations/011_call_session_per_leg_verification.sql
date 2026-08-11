-- Migration 011: Per-leg verification for Sinch verified calls
--
-- Prior behavior: `verified` was set as soon as ANY DiCE event reported
-- duration >= MIN_CALL_DURATION. That let a provider sit on the line for
-- 30 seconds while the buyer leg never answered — the provider's own leg
-- would fire DiCE and mark the session verified. Zero proof both parties
-- actually connected. Farming vector.
--
-- New behavior (see api/sinch-voice/webhook/route.ts): track each leg
-- separately. Only mark `verified = true` when BOTH provider AND buyer
-- legs reported ANSWERED and BOTH met the duration threshold.

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS provider_answered         BOOLEAN,
  ADD COLUMN IF NOT EXISTS provider_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS buyer_answered            BOOLEAN,
  ADD COLUMN IF NOT EXISTS buyer_duration_seconds    INTEGER;

COMMENT ON COLUMN call_sessions.provider_answered IS 'True when provider leg reported ANSWERED via Sinch DiCE.';
COMMENT ON COLUMN call_sessions.buyer_answered    IS 'True when buyer leg reported ANSWERED via Sinch DiCE.';
COMMENT ON COLUMN call_sessions.provider_duration_seconds IS 'Duration of the provider leg (from Sinch DiCE).';
COMMENT ON COLUMN call_sessions.buyer_duration_seconds    IS 'Duration of the buyer leg (from Sinch DiCE).';
