// Canopy Stripe Billing
// Single plan: $99/month, 7-day free trial, everything included
// Uses Stripe Checkout for subscription management

export const PLAN = {
  id: 'pro' as const,
  name: 'Canopy Pro',
  price: 99,
  interval: 'month',
  trialDays: 7,
  description: 'Everything you need to grow your tree service business',
  features: [
    'Unlimited leads & CRM',
    'AI-powered Google & Facebook Ads',
    'Viral video script generator',
    'Content calendar & scheduling',
    'SEO + Google Business Profile tools',
    'Review request automation',
    'Storm alert & surge pricing intel',
    'AI daily briefing & strategy',
    'Weather intelligence',
    'Unlimited users',
  ],
  emoji: '🌳',
};

export const PLANS = { pro: PLAN } as const;
export type PlanId = 'pro';

/** All features are available on trial or active plan */
export function canAccess(plan: string | undefined): boolean {
  return ['trial', 'pro', 'active', 'trialing'].includes(plan ?? 'trial');
}

/** Get Stripe Checkout URL */
export async function getCheckoutUrl(companyId: string, email: string): Promise<string | null> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, email }),
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
  if (!trialEndsAt) return PLAN.trialDays;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
