-- Add push_token column to users table for Expo push notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token text;

-- Index for querying users by company with push tokens
CREATE INDEX IF NOT EXISTS idx_users_company_push_token 
  ON users (company_id) 
  WHERE push_token IS NOT NULL;
