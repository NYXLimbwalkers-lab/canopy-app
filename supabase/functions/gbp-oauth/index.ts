// gbp-oauth — Google Business Profile OAuth: generates auth URL and exchanges code for tokens
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { action, code, redirectUri, companyId } = await req.json()

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Action: Get Auth URL ──────────────────────────────────────────────
    if (action === 'auth_url') {
      if (!redirectUri || !companyId) {
        return new Response(JSON.stringify({ error: 'Missing redirectUri or companyId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GBP_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state: companyId, // Pass companyId through state param
      })

      return new Response(JSON.stringify({ url: `${GOOGLE_AUTH_URL}?${params}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Action: Exchange Code ─────────────────────────────────────────────
    if (action === 'exchange') {
      if (!code || !redirectUri || !companyId) {
        return new Response(JSON.stringify({ error: 'Missing code, redirectUri, or companyId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Exchange authorization code for tokens
      const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenResp.json()
      if (tokenData.error) {
        throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`)
      }

      const accessToken = tokenData.access_token
      const refreshToken = tokenData.refresh_token
      const expiresIn = tokenData.expires_in // seconds

      // Fetch the user's GBP accounts to find their business
      const accountsResp = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const accountsData = await accountsResp.json()
      const accounts = accountsData.accounts ?? []

      // Find locations across all accounts
      let businessName: string | null = null
      let accountName: string | null = null
      let locationName: string | null = null // e.g. "accounts/123/locations/456"

      for (const account of accounts) {
        accountName = account.accountName || account.name
        const locResp = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,metadata`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const locData = await locResp.json()
        const locations = locData.locations ?? []

        if (locations.length > 0) {
          // Use the first location (most businesses have one)
          locationName = locations[0].name
          businessName = locations[0].title || null
          break
        }
      }

      // Save tokens to gbp_profiles
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )

      const updateData: Record<string, unknown> = {
        google_access_token: accessToken,
        google_refresh_token: refreshToken,
      }

      // Store the GBP account/location path for API calls
      if (locationName) {
        updateData.gbp_location_name = locationName
      }
      if (businessName) {
        updateData.name = businessName
      }

      // Check if gbp_profiles row exists, create if not
      const { data: existing } = await supabase
        .from('gbp_profiles')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('gbp_profiles')
          .update(updateData)
          .eq('company_id', companyId)
      } else {
        await supabase
          .from('gbp_profiles')
          .insert({ company_id: companyId, ...updateData })
      }

      return new Response(JSON.stringify({
        success: true,
        businessName,
        accountName,
        locationName,
        accountCount: accounts.length,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "auth_url" or "exchange".' }), {
      status: 400,
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
