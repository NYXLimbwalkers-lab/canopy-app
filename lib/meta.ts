// Meta (Facebook/Instagram) API integration
// Handles OAuth, campaign creation, and insights retrieval
// Requires: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET (in Supabase secrets)

import { supabase } from './supabase';
import { Linking } from 'react-native';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

// ── OAuth Flow ─────────────────────────────────────────────────────────────────

export function startFacebookOAuth(redirectUri: string) {
  const appId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
  if (!appId) {
    throw new Error('EXPO_PUBLIC_FACEBOOK_APP_ID not set');
  }

  const scopes = [
    'ads_management',
    'ads_read',
    'leads_retrieval',
    'pages_show_list',
    'business_management',
  ].join(',');

  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code`;

  Linking.openURL(url);
}

// Exchange auth code for long-lived token and save to ad_accounts
export async function exchangeFacebookCode(
  code: string,
  redirectUri: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Exchange code for short-lived token via edge function (keeps app secret server-side)
    const { data, error } = await supabase.functions.invoke('meta-oauth', {
      body: { code, redirectUri, companyId },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Campaign Management ────────────────────────────────────────────────────────

export async function createFacebookCampaign(
  companyId: string,
  params: {
    name: string;
    objective?: string; // LEAD_GENERATION, OUTCOME_LEADS, etc
    dailyBudget: number; // in cents
    targetCity?: string;
    targetRadius?: number; // km
    adCopy: string;
    headline: string;
    linkUrl?: string;
  }
): Promise<{ success: boolean; campaignId?: string; error?: string }> {
  try {
    // Get stored access token
    const { data: account } = await supabase
      .from('ad_accounts')
      .select('access_token, account_id')
      .eq('company_id', companyId)
      .eq('platform', 'facebook')
      .single();

    if (!account?.access_token || !account?.account_id) {
      return { success: false, error: 'Facebook not connected. Go to Ads tab and connect your account.' };
    }

    const adAccountId = account.account_id.startsWith('act_')
      ? account.account_id
      : `act_${account.account_id}`;

    // Step 1: Create campaign
    const campaignResp = await fetch(`${GRAPH_API}/${adAccountId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: account.access_token,
        name: params.name,
        objective: params.objective || 'OUTCOME_LEADS',
        status: 'PAUSED', // Start paused so user can review
        special_ad_categories: ['NONE'],
      }),
    });

    const campaignData = await campaignResp.json();
    if (campaignData.error) {
      throw new Error(campaignData.error.message);
    }

    const campaignId = campaignData.id;

    // Save campaign to local DB
    await supabase.from('campaigns').insert({
      company_id: companyId,
      ad_account_id: account.account_id,
      platform: 'facebook',
      name: params.name,
      status: 'draft',
      budget_daily: params.dailyBudget / 100, // Convert cents to dollars
      campaign_type: params.objective || 'OUTCOME_LEADS',
    });

    return { success: true, campaignId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Insights ───────────────────────────────────────────────────────────────────

export interface FacebookInsights {
  spend: number;
  reach: number;
  impressions: number;
  leads: number;
  clicks: number;
  cpl: number;
  ctr: number;
}

export async function getFacebookInsights(
  companyId: string,
  dateRange: 'last_7d' | 'last_30d' | 'this_month' = 'last_7d',
): Promise<{ data?: FacebookInsights; error?: string }> {
  try {
    const { data: account } = await supabase
      .from('ad_accounts')
      .select('access_token, account_id')
      .eq('company_id', companyId)
      .eq('platform', 'facebook')
      .single();

    if (!account?.access_token || !account?.account_id) {
      return { error: 'Facebook not connected' };
    }

    const adAccountId = account.account_id.startsWith('act_')
      ? account.account_id
      : `act_${account.account_id}`;

    const resp = await fetch(
      `${GRAPH_API}/${adAccountId}/insights?access_token=${account.access_token}&fields=spend,reach,impressions,actions,clicks,ctr&date_preset=${dateRange}&level=account`
    );

    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);

    const row = json.data?.[0];
    if (!row) {
      return { data: { spend: 0, reach: 0, impressions: 0, leads: 0, clicks: 0, cpl: 0, ctr: 0 } };
    }

    const leads = (row.actions || [])
      .filter((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
      .reduce((sum: number, a: any) => sum + parseInt(a.value || '0'), 0);

    const spend = parseFloat(row.spend || '0');

    return {
      data: {
        spend,
        reach: parseInt(row.reach || '0'),
        impressions: parseInt(row.impressions || '0'),
        leads,
        clicks: parseInt(row.clicks || '0'),
        cpl: leads > 0 ? spend / leads : 0,
        ctr: parseFloat(row.ctr || '0'),
      },
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ── Check Connection ───────────────────────────────────────────────────────────

export async function isFacebookConnected(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from('ad_accounts')
    .select('access_token')
    .eq('company_id', companyId)
    .eq('platform', 'facebook')
    .single();

  return !!data?.access_token;
}
