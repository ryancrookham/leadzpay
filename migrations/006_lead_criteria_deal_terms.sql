-- 006: Add payment_timing and termination_notice_days to business_lead_criteria
-- These fields are moving from per-invite-token to business-wide criteria.

ALTER TABLE business_lead_criteria ADD COLUMN IF NOT EXISTS payment_timing VARCHAR(100);
ALTER TABLE business_lead_criteria ADD COLUMN IF NOT EXISTS termination_notice_days INTEGER;
