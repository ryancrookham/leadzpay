-- Migration: Add profile picture and payout fields to users table
-- Run this after 002_password_reset_tokens.sql

-- Profile picture
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Payout method: 'venmo', 'paypal', 'cashapp', or 'bank'
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_method VARCHAR(20);

-- Payout details for each method
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_venmo VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_paypal VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_cashapp VARCHAR(100);

-- Bank account details (encrypted in production, plain for MVP)
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_bank_routing VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_bank_account VARCHAR(30);
