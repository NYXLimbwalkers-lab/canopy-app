# Canopy Database Schema

This directory contains the Supabase PostgreSQL schema for the Canopy SaaS platform — a multi-tenant app for tree service companies.

## How to Run

### Option 1: Supabase SQL Editor (recommended)

1. Go to your [Supabase project dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New query**
4. Open `schema.sql` and paste the entire contents into the editor
5. Click **Run** (or press `Cmd+Enter` / `Ctrl+Enter`)

### Option 2: Supabase CLI

```bash
supabase db push
```

Or run the file directly against your database:

```bash
psql "$DATABASE_URL" -f schema.sql
```

## What Gets Created

### Tables (17 total)

| Table | Purpose |
|---|---|
| `companies` | Multi-tenant root — one record per tree service company |
| `users` | Staff accounts linked to a company |
| `leads` | Inbound leads from ads, website, phone, etc. |
| `jobs` | Service jobs (quotes through completion) |
| `customers` | Customer records with lifetime value tracking |
| `estimates` | Line-item quotes with PDF support |
| `invoices` | Billing with Stripe payment link support |
| `ad_accounts` | Connected Google / Facebook / TikTok ad accounts |
| `campaigns` | Ad campaign performance tracking |
| `ad_creatives` | Ad creative assets and performance |
| `content_posts` | Social media content scheduling and analytics |
| `gbp_profiles` | Google Business Profile connection |
| `reviews` | Reviews from Google, Facebook, Yelp |
| `keyword_rankings` | SEO keyword position tracking |
| `citations` | Local directory listing status |
| `company_settings` | Per-company API keys and preferences |
| `weather_events` | Storm/weather detection for automated ad triggers |

### Row-Level Security

Every table has RLS enabled. The `get_my_company_id()` helper function looks up the authenticated user's company and all policies use it to enforce tenant isolation — Company A can never read or write Company B's data.

### Triggers

- **`on_auth_user_created`** — fires on every new Supabase Auth signup, automatically creates a `companies` record, a `company_settings` record, and a `users` record with `role = 'owner'`
- **`*_updated_at`** — automatically stamps `updated_at` on every UPDATE across all relevant tables

## Re-running the Schema

If you need to reset and re-run, drop all tables first or use Supabase's **Reset database** option in the dashboard (Project Settings > Database > Reset database). Then re-run `schema.sql`.

## Notes

- The schema uses `uuid-ossp` for UUID generation — this extension is enabled at the top of the file
- `company_settings` uses `company_id` as its primary key (one-to-one with `companies`)
- `gbp_profiles` enforces one profile per company via `UNIQUE(company_id)`
- `citations` enforces one entry per directory per company via `UNIQUE(company_id, directory_name)`
- `ad_accounts` enforces one account per platform per company via `UNIQUE(company_id, platform)`
