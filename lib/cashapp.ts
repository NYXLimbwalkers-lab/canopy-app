// Canopy Billing — Cash App Pay
// Single flat plan: $99/month, 7-day free trial, everything included

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

function getCashTag(): string {
  return process.env.EXPO_PUBLIC_CASHAPP_HANDLE ?? '$canopyapp';
}

export function getCashAppPaymentUrl(): string {
  const tag = getCashTag();
  return `https://cash.app/${tag}/${PLAN.price}`;
}

/** All features are available on trial or active plan */
export function canAccess(plan: string | undefined): boolean {
  return ['trial', 'pro', 'active', 'trialing'].includes(plan ?? 'trial');
}

/** Days remaining in trial */
export function trialDaysRemaining(trialEndsAt: string | undefined): number {
  if (!trialEndsAt) return PLAN.trialDays;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
