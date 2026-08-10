-- Migration 010: Business-configurable verified call destination phone
--
-- Currently, users.phone is used as the destination for Sinch verified calls
-- when no per-criteria override is set. That's a problem because users.phone
-- is also used for SMS login, invite SMS, and account notifications — so a
-- business owner who wants to route lead calls to an office/queue but keep
-- their personal cell as the account phone has no clean way to do that.
--
-- This migration adds a dedicated `verified_call_phone` column on users.
-- The Sinch fallback chain becomes:
--   1. criteria.call_phone_number  (per-criteria override, existing)
--   2. users.verified_call_phone   (business-level default, NEW)
--   3. users.phone                 (account phone, legacy fallback)
--   4. error

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verified_call_phone VARCHAR(50);

COMMENT ON COLUMN users.verified_call_phone IS
  'Business-configurable destination phone for Sinch verified calls. When set, takes precedence over users.phone for verified-call routing. Never used for SMS notifications or login.';
