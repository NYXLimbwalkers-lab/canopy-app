-- Add missing columns to keyword_rankings
ALTER TABLE keyword_rankings ADD COLUMN IF NOT EXISTS search_volume INT;
ALTER TABLE keyword_rankings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add title to content_posts
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS title TEXT;

-- Add account_name to ad_accounts
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS account_name TEXT;

-- Add social_connections table
CREATE TABLE IF NOT EXISTS social_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram', 'facebook')),
  connected BOOLEAN DEFAULT false,
  handle TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  UNIQUE(company_id, platform)
);

ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_connections_company_isolation" ON social_connections
  FOR ALL USING (company_id = get_my_company_id());

-- Add replied computed column to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS replied BOOLEAN GENERATED ALWAYS AS (responded_at IS NOT NULL) STORED;

-- Add text alias for reviews.body (for backwards compat)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS text TEXT GENERATED ALWAYS AS (body) STORED;
