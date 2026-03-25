// Canopy Stripe Billing
// Uses Stripe Payment Links + Checkout for subscription management
// Cash App Pay is enabled as a payment method in the Stripe dashboard

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 49,
    interval: 'month',
    description: '1 user · Google Ads only · 50 leads/month',
    features: [
      '1 user account',
      'Google Ads Script setup',
      'Lead inbox (50 leads/month)',
      'AI ad copy generation',
      'Basic dashboard',
    ],
    priceId: process.env.EXPO_PUBLIC_STRIPE_STARTER_PRICE_ID ?? '',
    highlight: false,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 149,
    interval: 'month',
    description: '5 users · All ad platforms · Unlimited leads · AI content',
    features: [
      '5 user accounts',
      'Google + Facebook + TikTok ads',
      'Unlimited leads',
      'AI content calendar (30 days)',
      'AI video scripts',
      'SEO tools + GBP manager',
      'Review management',
      'Estimate builder',
    ],
    priceId: process.env.EXPO_PUBLIC_STRIPE_GROWTH_PRICE_ID ?? '',
    highlight: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 299,
    interval: 'month',
    description: 'Unlimited users · All features · Priority support',
    features: [
      'Unlimited users',
      'Everything in Growth',
      'White-glove onboarding call',
      'Custom AI strategy',
      'Priority support (2hr response)',
      'YouTube + cross-posting',
      'Invoice + Cash App Pay',
      'Weather storm alerts',
    ],
    priceId: process.env.EXPO_PUBLIC_STRIPE_PRO_PRICE_ID ?? '',
    highlight: false,
  },
} as const;

export type PlanId = keyof typeof PLANS;

/** Check if a company's plan allows a feature */
export function canAccess(plan: string | undefined, feature: 'ads_facebook' | 'ads_tiktok' | 'content_ai' | 'seo_full' | 'invoicing' | 'weather' | 'unlimited_leads'): boolean {
  const tier = plan ?? 'trial';
  const access: Record<string, string[]> = {
    trial: ['ads_facebook', 'content_ai', 'seo_full', 'unlimited_leads'], // Full access during trial
    starter: [],
    growth: ['ads_facebook', 'ads_tiktok', 'content_ai', 'seo_full', 'unlimited_leads'],
    pro: ['ads_facebook', 'ads_tiktok', 'content_ai', 'seo_full', 'invoicing', 'weather', 'unlimited_leads'],
  };
  return (access[tier] ?? []).includes(feature);
}

/** Get Stripe Checkout URL for a plan */
export async function getCheckoutUrl(planId: PlanId, companyId: string, email: string): Promise<string | null> {
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!stripeKey) return null;

  // In production: call your Supabase Edge Function which creates the Checkout session
  // Edge function URL: https://your-project.supabase.co/functions/v1/create-checkout
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, companyId, email, priceId: PLANS[planId].priceId }),
    });
    const data = await resp.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

/** Get billing portal URL to manage subscription */
export async function getBillingPortalUrl(customerId: string): Promise<string | null> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/billing-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
    const data = await resp.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

/** Days remaining in trial */
export function trialDaysRemaining(trialEndsAt: string | undefined): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
