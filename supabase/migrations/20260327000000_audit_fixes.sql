-- Migration: 20260327_audit_fixes.sql
-- Audit fixes: create missing tables, add missing columns, fix constraints

-- ============================================================================
-- 1. Create lsa_profiles table (referenced in ads.tsx)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lsa_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connected BOOLEAN DEFAULT false,
  badge_status TEXT DEFAULT 'none' CHECK (badge_status IN ('active', 'pending', 'suspended', 'none')),
  weekly_budget NUMERIC(10,2),
  leads_this_week INT DEFAULT 0,
  spend_this_week NUMERIC(10,2) DEFAULT 0,
  cost_per_lead NUMERIC(10,2),
  total_spend NUMERIC(10,2) DEFAULT 0,
  service_categories TEXT[] DEFAULT '{}',
  setup_checklist JSONB DEFAULT '{
    "gbp_verified": false,
    "background_check": false,
    "insurance_uploaded": false,
    "service_areas_set": false,
    "budget_set": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_lsa_profiles_company ON lsa_profiles(company_id);

ALTER TABLE lsa_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lsa_profiles_company_isolation" ON lsa_profiles
    FOR ALL USING (company_id = get_my_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Create contract_settings table (referenced in contract-settings.tsx)
-- ============================================================================
CREATE TABLE IF NOT EXISTS contract_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_terms TEXT DEFAULT 'Payment is due upon completion of work unless otherwise agreed in writing.',
  deposit_required BOOLEAN DEFAULT false,
  deposit_percent NUMERIC(5,2) DEFAULT 50,
  warranty_text TEXT DEFAULT 'All work performed is guaranteed for 30 days from the date of completion.',
  warranty_days INT DEFAULT 30,
  cancellation_text TEXT DEFAULT 'Either party may cancel this agreement with 48 hours written notice.',
  cancellation_hours INT DEFAULT 48,
  liability_text TEXT DEFAULT 'Contractor maintains general liability insurance and workers compensation coverage.',
  cleanup_text TEXT DEFAULT 'All debris generated from the work will be removed and the work area will be left in a clean condition.',
  property_access_text TEXT DEFAULT 'Client agrees to provide clear access to the work area.',
  additional_clauses JSONB DEFAULT '[]'::jsonb,
  include_scope BOOLEAN DEFAULT true,
  include_schedule BOOLEAN DEFAULT true,
  include_payment BOOLEAN DEFAULT true,
  include_access BOOLEAN DEFAULT true,
  include_liability BOOLEAN DEFAULT true,
  include_cancellation BOOLEAN DEFAULT true,
  include_cleanup BOOLEAN DEFAULT true,
  include_warranty BOOLEAN DEFAULT true,
  include_additional BOOLEAN DEFAULT true,
  permit_clause BOOLEAN DEFAULT false,
  permit_text TEXT DEFAULT 'Client is responsible for obtaining any required permits unless otherwise agreed.',
  utility_clause BOOLEAN DEFAULT true,
  utility_text TEXT DEFAULT 'Contractor will exercise due care when working near utility lines.',
  stump_grinding_clause BOOLEAN DEFAULT true,
  stump_grinding_text TEXT DEFAULT 'Stump grinding depth is typically 6-12 inches below grade.',
  crane_clause BOOLEAN DEFAULT false,
  crane_text TEXT DEFAULT '',
  custom_terms TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_settings_company ON contract_settings(company_id);

ALTER TABLE contract_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "contract_settings_company_isolation" ON contract_settings
    FOR ALL USING (company_id = get_my_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. Add missing columns to estimates table
-- ============================================================================
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS contract_url TEXT;

-- ============================================================================
-- 4. Add gbp_location_name to gbp_profiles (if table exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gbp_profiles') THEN
    EXECUTE 'ALTER TABLE gbp_profiles ADD COLUMN IF NOT EXISTS gbp_location_name TEXT';
  END IF;
END $$;

-- ============================================================================
-- 5. Fix estimates status constraint to allow 'declined'
-- ============================================================================
DO $$
BEGIN
  -- Drop existing constraint (name may vary)
  ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
  -- Re-add with both 'rejected' and 'declined'
  ALTER TABLE estimates ADD CONSTRAINT estimates_status_check
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'declined', 'expired'));
EXCEPTION
  WHEN undefined_object THEN
    -- Constraint didn't exist under that name, try to add anyway
    BEGIN
      ALTER TABLE estimates ADD CONSTRAINT estimates_status_check
        CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'declined', 'expired'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ============================================================================
-- 6. Fix ad_accounts platform constraint to allow additional platforms
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE ad_accounts DROP CONSTRAINT IF EXISTS ad_accounts_platform_check;
  ALTER TABLE ad_accounts ADD CONSTRAINT ad_accounts_platform_check
    CHECK (platform IN ('google', 'facebook', 'tiktok', 'google_ads', 'facebook_ads', 'local_services'));
EXCEPTION
  WHEN undefined_object THEN
    BEGIN
      ALTER TABLE ad_accounts ADD CONSTRAINT ad_accounts_platform_check
        CHECK (platform IN ('google', 'facebook', 'tiktok', 'google_ads', 'facebook_ads', 'local_services'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
END $$;

-- Also fix campaigns platform constraint to match
DO $$
BEGIN
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_platform_check;
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_platform_check
    CHECK (platform IN ('google', 'facebook', 'tiktok', 'google_ads', 'facebook_ads', 'local_services'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Also drop the UNIQUE constraint on ad_accounts(company_id, platform) and re-add
-- since new platform values mean a company might have both 'google' and 'google_ads'
-- (no change needed to UNIQUE, just noting it)
