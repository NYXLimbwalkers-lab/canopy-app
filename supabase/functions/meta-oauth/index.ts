// meta-oauth — Exchanges Facebook auth code for long-lived token, saves to ad_accounts
// Env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GRAPH_API = 'https://graph.facebook.com/v19.0'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { code, redirectUri, companyId } = await req.json()

    if (!code || !redirectUri || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing code, redirectUri, or companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const appId = Deno.env.get('FACEBOOK_APP_ID')
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET')

    if (!appId || !appSecret) {
      return new Response(JSON.stringify({ error: 'Facebook app credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Exchange code for short-lived token
    const tokenResp = await fetch(
      `${GRAPH_API}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    )

    const tokenData = await tokenResp.json()
    if (tokenData.error) {
      throw new Error(`Token exchange failed: ${tokenData.error.message}`)
    }

    const shortToken = tokenData.access_token

    // Step 2: Exchange for long-lived token (60 days)
    const longResp = await fetch(
      `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    )

    const longData = await longResp.json()
    if (longData.error) {
      throw new Error(`Long-lived token exchange failed: ${longData.error.message}`)
    }

    const accessToken = longData.access_token
    const expiresIn = longData.expires_in // seconds

    // Step 3: Get user's ad accounts
    const accountsResp = await fetch(
      `${GRAPH_API}/me/adaccounts?fields=name,account_id,account_status&access_token=${accessToken}`
    )

    const accountsData = await accountsResp.json()
    const adAccounts = accountsData.data ?? []

    // Use the first active ad account
    const activeAccount = adAccounts.find((a: any) => a.account_status === 1) ?? adAccounts[0]

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Save to ad_accounts table
    const { error: upsertError } = await supabase
      .from('ad_accounts')
      .upsert({
        company_id: companyId,
        platform: 'facebook',
        account_id: activeAccount?.account_id || null,
        account_name: activeAccount?.name || null,
        access_token: accessToken,
        token_expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'company_id,platform' })

    if (upsertError) {
      throw new Error(`DB save failed: ${upsertError.message}`)
    }

    return new Response(JSON.stringify({
      success: true,
      accountName: activeAccount?.name,
      accountId: activeAccount?.account_id,
      adAccountCount: adAccounts.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
