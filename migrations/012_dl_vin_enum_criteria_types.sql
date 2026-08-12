-- Migration 012: Add DL_SCAN, VIN_SCAN, ENUM criteria field types
--
-- Providers submitting a lead after a verified call now capture:
--   - Driver's license scan (barcode + Vision OCR — structured extract)
--   - VIN scan (barcode + Vision OCR)
--   - Multiple-choice questions (marital status, coverage type, incidents)
--
-- All three are stored as criteria fields so businesses can add/remove them
-- via the existing Lead Criteria builder — no hardcoded per-lead schema.

ALTER TABLE lead_criteria_fields
  DROP CONSTRAINT IF EXISTS lead_criteria_fields_field_type_check;

ALTER TABLE lead_criteria_fields
  ADD CONSTRAINT lead_criteria_fields_field_type_check
  CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY', 'PHONE_CALL', 'DL_SCAN', 'VIN_SCAN', 'ENUM'));

COMMENT ON COLUMN lead_criteria_fields.field_type IS
  'Field type. PHOTO=raw photo upload. TEXT=free-form text. BINARY=yes/no. PHONE_CALL=verified call gate. DL_SCAN=DL photo + AAMVA barcode parse + Claude Vision OCR fallback (structured extract). VIN_SCAN=VIN barcode + Vision fallback. ENUM=single-select from option_a-provided list (pipe-delimited).';
