# Canopy App — Build Log

## Status: Feature-Complete (Phase 4 Done)

---

## Phase 1 — Core Infrastructure
- **FFmpeg Render Server** (`render-server/`) — Self-hosted video composition on Render.com
- **Stripe Billing** (`supabase/functions/create-checkout/`, `billing-portal/`, `stripe-webhook/`) — $99/mo single tier
- **Video Generation** (`supabase/functions/generate-video/`) — Sends render jobs to FFmpeg server

## Phase 2 — SEO & Lead Management
- **Google Reviews Sync** (`supabase/functions/sync-reviews/`) — Place ID extraction, review upsert, completeness scoring
- **Lead Intake Webhook** (`supabase/functions/intake-webhook/`) — Standard, Facebook Lead Ads, and Google Ads formats
- **SMS Review Requests** (`supabase/functions/send-review-request/`) — Twilio SMS with auto-generated Google review links
- **Keyword Rankings** (`supabase/functions/sync-rankings/`) — Google Places Text Search as local SEO proxy

## Phase 3 — Social Media API Integrations
- **Meta/Facebook** (`lib/meta.ts`, `supabase/functions/meta-oauth/`) — OAuth, campaign creation, insights
- **TikTok** (`lib/tiktok.ts`) — OAuth, video publishing from URL, insights
- **YouTube** (`lib/youtube.ts`) — OAuth, Shorts upload (resumable), channel insights

## Phase 4 — Estimates & Notifications
- **PDF Estimate Generator** (`supabase/functions/generate-estimate-pdf/`) — Professional HTML estimates with company branding, line items, totals, signature lines, terms
- **Push Notifications** (`supabase/functions/send-push/`) — Expo Push API with batch sending and invalid token cleanup
- **Database Migration** (`supabase/migrations/002_push_token.sql`) — `push_token` column on users table

---

## Required Environment Variables

### Supabase Edge Functions (set via `supabase secrets set`)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Auto-set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_ID` | Stripe price ID for $99/mo plan |
| `RENDER_SERVER_URL` | FFmpeg render server URL (e.g. `https://canopy-render.onrender.com`) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number (E.164 format) |
| `GOOGLE_PLACES_API_KEY` | Google Places API key |
| `FACEBOOK_APP_ID` | Facebook app ID for Meta OAuth |
| `FACEBOOK_APP_SECRET` | Facebook app secret |

### Client-Side (Expo / `.env`)
| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID (YouTube) |
| `EXPO_PUBLIC_TIKTOK_CLIENT_KEY` | TikTok developer app client key |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` | Facebook app ID |

### Render.com (FFmpeg Server)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for storage uploads |

---

## Deployed Services
| Service | URL |
|---|---|
| Supabase | `muczzoqplswgjcinylsm.supabase.co` |
| Vercel (frontend) | `https://canopy-app-ten.vercel.app` |
| Render (video server) | `https://canopy-render.onrender.com` |

---

## Pending Setup (Requires User Action)
- TikTok developer app registration at `developers.tiktok.com`
- Facebook/Meta app review for ads_management permission
- YouTube OAuth consent screen configuration
- Twilio A2P 10DLC registration (in progress)
