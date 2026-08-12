-- Migration 013: Add ENUM field type to lead_criteria_fields
--
-- Migration 012 added DL_SCAN and VIN_SCAN. This adds ENUM so businesses
-- can offer single-select multi-choice questions like:
--   - Marital status: Single / Married / Divorced / Widowed
--   - Coverage type:  Liability Only / Full Coverage
--
-- Options are stored pipe-delimited in the existing option_a column
-- (e.g. "Single|Married|Divorced|Widowed"). The lead form renders these
-- as tap-target chips so mobile-first providers can pick with one tap.

ALTER TABLE lead_criteria_fields
  DROP CONSTRAINT IF EXISTS lead_criteria_fields_field_type_check;

ALTER TABLE lead_criteria_fields
  ADD CONSTRAINT lead_criteria_fields_field_type_check
  CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY', 'PHONE_CALL', 'DL_SCAN', 'VIN_SCAN', 'ENUM'));
