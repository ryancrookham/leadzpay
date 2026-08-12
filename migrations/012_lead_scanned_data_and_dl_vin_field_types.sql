-- Migration 012: leads.scanned_data + DL_SCAN / VIN_SCAN criteria field types
--
-- Two changes for the Options tracker-export feature:
--
-- 1. leads.scanned_data JSONB
--    Populated when providers use a DL or VIN scanner in their lead
--    submission flow. Structured payload like:
--      {
--        "dl": { "firstName", "middleName", "lastName", "dateOfBirth",
--                "street", "city", "state", "zip", "licenseNumber",
--                "expiration", "source": "barcode" | "ocr" },
--        "vin": { "number", "source": "barcode" | "ocr", "year", "make", "model" }
--      }
--    Chose JSONB over dedicated columns because the shape may evolve as we
--    add other scans (insurance card, registration, etc.) and we don't need
--    to index individual fields — the export just serializes them.
--
-- 2. Two new field types on business_lead_criteria: DL_SCAN and VIN_SCAN
--    Businesses that want provider scans to happen in the WOML lead form add
--    these as criteria fields (via the InviteTab criteria builder). The
--    provider lead form auto-renders the correct scanner UI for each type
--    and writes the extracted fields to leads.scanned_data.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS scanned_data JSONB;

COMMENT ON COLUMN leads.scanned_data IS
  'Structured payload from provider-side scanners (DL, VIN, etc.). See migration 012 for shape.';

-- Expand the field_type CHECK constraint to include DL_SCAN and VIN_SCAN
ALTER TABLE lead_criteria_fields
  DROP CONSTRAINT IF EXISTS lead_criteria_fields_field_type_check;

ALTER TABLE lead_criteria_fields
  ADD CONSTRAINT lead_criteria_fields_field_type_check
  CHECK (field_type IN ('PHOTO', 'TEXT', 'BINARY', 'PHONE_CALL', 'DL_SCAN', 'VIN_SCAN'));
