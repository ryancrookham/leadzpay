-- Migration 008: Add call_phone_number to business_lead_criteria
-- Businesses can specify exactly which phone number Sinch should call
-- when a provider initiates a verified call. Falls back to users.phone
-- if not set. Solves the multi-location problem.

ALTER TABLE business_lead_criteria
  ADD COLUMN IF NOT EXISTS call_phone_number VARCHAR(50);
