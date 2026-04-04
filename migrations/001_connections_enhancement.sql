-- Migration: Enhance connections table for full workflow
-- Run this in Neon SQL editor

-- Update status constraint to support full workflow
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_status_check;

ALTER TABLE connections
  ADD CONSTRAINT connections_status_check
  CHECK (status IN (
    'pending_buyer_review',
    'pending_provider_accept',
    'active',
    'declined_by_provider',
    'rejected_by_buyer',
    'terminated'
  ));

-- Add new columns for enhanced connection management
ALTER TABLE connections ADD COLUMN IF NOT EXISTS termination_notice_days INTEGER DEFAULT 7;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS initiator VARCHAR(20) DEFAULT 'provider';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS message TEXT;

-- Update existing rows to have valid status (if any exist with old status values)
UPDATE connections SET status = 'pending_buyer_review' WHERE status = 'pending';
UPDATE connections SET status = 'active' WHERE status = 'accepted';
UPDATE connections SET status = 'rejected_by_buyer' WHERE status = 'declined';
