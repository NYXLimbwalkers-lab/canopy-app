-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- COMPANIES (Multi-tenant root — replaces "organizations")
-- ============================================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  service_radius_miles INT DEFAULT 25,
  services_offered TEXT[] DEFAULT '{}',
  -- Subscription
  plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'growth', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  -- Onboarding
  onboarding_step INT DEFAULT 1,
  onboarding_completed_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'crew_lead', 'estimator', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_company ON users(company_id);

-- ============================================================================
-- CRM
-- ============================================================================
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  service TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('google_ads', 'facebook_ads', 'website', 'phone', 'referral', 'manual', 'tiktok', 'yelp')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'booked', 'lost')),
  score INT DEFAULT 5 CHECK (score BETWEEN 1 AND 10),
  notes TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_status ON leads(company_id, status);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  customer_id UUID,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'quote_sent', 'booked', 'in_progress', 'complete', 'invoiced', 'paid')),
  service_type TEXT,
  address TEXT,
  scheduled_at TIMESTAMPTZ,
  crew_ids TEXT[] DEFAULT '{}',
  photos TEXT[] DEFAULT '{}',
  notes TEXT,
  revenue NUMERIC(10,2),
  cost NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(company_id, status);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  total_spent NUMERIC(10,2) DEFAULT 0,
  job_count INT DEFAULT 0,
  last_job_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_company ON customers(company_id);

CREATE TABLE estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id),
  customer_id UUID REFERENCES customers(id),
  line_items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_estimates_company ON estimates(company_id);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id),
  customer_id UUID REFERENCES customers(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'canceled')),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  stripe_payment_intent_id TEXT,
  payment_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_company ON invoices(company_id);

-- ============================================================================
-- ADVERTISING
-- ============================================================================
CREATE TABLE ad_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google', 'facebook', 'tiktok')),
  account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  sheet_id TEXT, -- Google Sheets ID for Google Ads bridge
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, platform)
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES ad_accounts(id),
  platform TEXT NOT NULL CHECK (platform IN ('google', 'facebook', 'tiktok')),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  budget_daily NUMERIC(10,2),
  spend_total NUMERIC(10,2) DEFAULT 0,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  leads_generated INT DEFAULT 0,
  cost_per_lead NUMERIC(10,2),
  campaign_type TEXT, -- 'search', 'performance_max', 'local_services', 'awareness', etc.
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_company ON campaigns(company_id);

CREATE TABLE ad_creatives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  headline TEXT,
  description TEXT,
  image_url TEXT,
  video_url TEXT,
  display_path TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'rejected')),
  clicks INT DEFAULT 0,
  impressions INT DEFAULT 0,
  leads INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ad_creatives_campaign ON ad_creatives(campaign_id);

-- ============================================================================
-- CONTENT
-- ============================================================================
CREATE TABLE content_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'instagram', 'facebook', 'all')),
  video_type TEXT, -- 'satisfying_removal', 'before_after', 'did_you_know', 'day_in_life', 'price_transparency', 'storm_damage'
  script TEXT,
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed')),
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT,
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  leads INT DEFAULT 0,
  thumbnail_url TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_posts_company ON content_posts(company_id);

-- ============================================================================
-- SEO
-- ============================================================================
CREATE TABLE gbp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gbp_id TEXT,
  google_access_token TEXT,
  google_refresh_token TEXT,
  completeness_score INT DEFAULT 0,
  name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  hours JSONB,
  photos TEXT[] DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  UNIQUE(company_id)
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google', 'facebook', 'yelp')),
  reviewer_name TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  response TEXT,
  response_draft TEXT,
  responded_at TIMESTAMPTZ,
  review_url TEXT,
  review_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_company ON reviews(company_id);

CREATE TABLE keyword_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INT,
  previous_position INT,
  url TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rankings_company ON keyword_rankings(company_id);

CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  directory_name TEXT NOT NULL,
  status TEXT DEFAULT 'unclaimed' CHECK (status IN ('unclaimed', 'claimed', 'verified', 'inconsistent')),
  url TEXT,
  listing_url TEXT,
  last_checked_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(company_id, directory_name)
);

-- ============================================================================
-- COMPANY SETTINGS
-- ============================================================================
CREATE TABLE company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  openrouter_key TEXT,
  weather_api_key TEXT,
  openweather_api_key TEXT,
  services_offered TEXT[] DEFAULT '{}',
  pricing_notes TEXT,
  competitors TEXT[] DEFAULT '{}',
  target_cpl_google NUMERIC(10,2) DEFAULT 50,
  target_cpl_facebook NUMERIC(10,2) DEFAULT 75,
  google_search_console_token TEXT,
  stripe_connect_id TEXT,
  tiktok_access_token TEXT,
  youtube_channel_id TEXT,
  notification_email TEXT,
  sms_number TEXT,
  review_request_delay_hours INT DEFAULT 24,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- WEATHER / INTELLIGENCE
-- ============================================================================
CREATE TABLE weather_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'storm', 'high_wind', 'ice', 'snow', 'heat'
  severity TEXT DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'severe', 'extreme')),
  location TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  response_triggered BOOLEAN DEFAULT false,
  ad_draft_created BOOLEAN DEFAULT false,
  content_draft_created BOOLEAN DEFAULT false
);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_events ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Companies: users can only see their own company
CREATE POLICY "company_isolation" ON companies
  FOR ALL USING (id = get_my_company_id());

-- Users: company members only
CREATE POLICY "users_company_isolation" ON users
  FOR ALL USING (company_id = get_my_company_id());

-- Leads
CREATE POLICY "leads_company_isolation" ON leads
  FOR ALL USING (company_id = get_my_company_id());

-- Jobs
CREATE POLICY "jobs_company_isolation" ON jobs
  FOR ALL USING (company_id = get_my_company_id());

-- Customers
CREATE POLICY "customers_company_isolation" ON customers
  FOR ALL USING (company_id = get_my_company_id());

-- Estimates
CREATE POLICY "estimates_company_isolation" ON estimates
  FOR ALL USING (company_id = get_my_company_id());

-- Invoices
CREATE POLICY "invoices_company_isolation" ON invoices
  FOR ALL USING (company_id = get_my_company_id());

-- Ad accounts
CREATE POLICY "ad_accounts_company_isolation" ON ad_accounts
  FOR ALL USING (company_id = get_my_company_id());

-- Campaigns
CREATE POLICY "campaigns_company_isolation" ON campaigns
  FOR ALL USING (company_id = get_my_company_id());

-- Ad creatives
CREATE POLICY "ad_creatives_company_isolation" ON ad_creatives
  FOR ALL USING (company_id = get_my_company_id());

-- Content posts
CREATE POLICY "content_posts_company_isolation" ON content_posts
  FOR ALL USING (company_id = get_my_company_id());

-- GBP profiles
CREATE POLICY "gbp_profiles_company_isolation" ON gbp_profiles
  FOR ALL USING (company_id = get_my_company_id());

-- Reviews
CREATE POLICY "reviews_company_isolation" ON reviews
  FOR ALL USING (company_id = get_my_company_id());

-- Keyword rankings
CREATE POLICY "keyword_rankings_company_isolation" ON keyword_rankings
  FOR ALL USING (company_id = get_my_company_id());

-- Citations
CREATE POLICY "citations_company_isolation" ON citations
  FOR ALL USING (company_id = get_my_company_id());

-- Company settings
CREATE POLICY "company_settings_isolation" ON company_settings
  FOR ALL USING (company_id = get_my_company_id());

-- Weather events
CREATE POLICY "weather_events_company_isolation" ON weather_events
  FOR ALL USING (company_id = get_my_company_id());

-- ============================================================================
-- SIGNUP TRIGGER: auto-create company + user record on auth signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_company_id UUID;
  company_name TEXT;
BEGIN
  -- Extract company name from metadata, default to "My Company"
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    split_part(NEW.email, '@', 1) || ' Tree Service'
  );

  -- Create the company record
  INSERT INTO companies (name, onboarding_step)
  VALUES (company_name, 1)
  RETURNING id INTO new_company_id;

  -- Create default settings for the company
  INSERT INTO company_settings (company_id)
  VALUES (new_company_id);

  -- Create the user record
  INSERT INTO users (id, company_id, email, name, role)
  VALUES (
    NEW.id,
    new_company_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_signup();

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER estimates_updated_at BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER content_posts_updated_at BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER company_settings_updated_at BEFORE UPDATE ON company_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
