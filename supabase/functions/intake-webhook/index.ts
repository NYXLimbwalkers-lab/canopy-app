// intake-webhook — Receives leads from external sources (website forms, ad platforms, Zapier, etc.)
// POST with JSON body: { apiKey, companyId, name, phone?, email?, service?, source?, notes?, address? }
// Or Facebook Lead Ads format: { entry: [{ changes: [{ value: { ... } }] }] }
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Valid lead sources
const VALID_SOURCES = ['google_ads', 'facebook_ads', 'website', 'phone', 'referral', 'manual', 'tiktok', 'yelp']

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Facebook webhook verification (GET request with hub.challenge)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === Deno.env.get('FB_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json()

    // ── Facebook Lead Ads format ───────────────────────────────────────────
    if (body.entry && Array.isArray(body.entry)) {
      return await handleFacebookLeads(supabase, body)
    }

    // ── Google Ads webhook format (from Google Ads lead form extensions) ──
    if (body.google_key || body.lead_id) {
      return await handleGoogleAdsLead(supabase, body)
    }

    // ── Standard webhook format (website forms, Zapier, etc.) ─────────────
    const {
      apiKey,
      companyId,
      name,
      phone,
      email,
      service,
      source,
      notes,
      address,
    } = body

    if (!companyId || !name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: companyId, name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate that the company exists before creating a lead
    const { data: companyExists } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single()

    if (!companyExists) {
      return new Response(JSON.stringify({ error: 'Invalid companyId' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate source
    const leadSource = VALID_SOURCES.includes(source) ? source : 'website'

    // Insert the lead
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        company_id: companyId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        service: service?.trim() || null,
        source: leadSource,
        status: 'new',
        score: 5, // Default score — AI scoring happens client-side
        notes: notes?.trim() || null,
        address: address?.trim() || null,
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to create lead: ${insertError.message}`)
    }

    return new Response(JSON.stringify({
      success: true,
      leadId: lead.id,
      message: 'Lead created successfully',
    }), {
      status: 201,
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

// ── Facebook Lead Ads Handler ───────────────────────────────────────────────
async function handleFacebookLeads(
  supabase: ReturnType<typeof createClient>,
  body: any,
) {
  let created = 0

  for (const entry of body.entry) {
    for (const change of (entry.changes ?? [])) {
      if (change.field !== 'leadgen') continue

      const leadgenId = change.value?.leadgen_id
      const pageId = change.value?.page_id
      const adId = change.value?.ad_id

      if (!leadgenId) continue

      // Look up which company owns this Facebook page/ad account
      // Match by ad_account or fall back to first company with facebook connected
      const { data: adAccount } = await supabase
        .from('ad_accounts')
        .select('company_id')
        .eq('platform', 'facebook')
        .limit(1)
        .single()

      if (!adAccount) continue

      // Facebook Lead Ads don't include lead data in the webhook —
      // you need to fetch it from the Graph API using the leadgen_id.
      // For now, create a placeholder lead that can be enriched later.
      const { error } = await supabase
        .from('leads')
        .insert({
          company_id: adAccount.company_id,
          name: `Facebook Lead #${leadgenId}`,
          source: 'facebook_ads',
          status: 'new',
          score: 6,
          notes: `Facebook Lead ID: ${leadgenId}. Ad ID: ${adId || 'unknown'}. Enrich via Graph API.`,
        })

      if (!error) created++
    }
  }

  return new Response(JSON.stringify({ success: true, created }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Google Ads Lead Handler ─────────────────────────────────────────────────
async function handleGoogleAdsLead(
  supabase: ReturnType<typeof createClient>,
  body: any,
) {
  // Google Ads lead form extensions send: lead_id, campaign_id, user_column_data, etc.
  const {
    lead_id,
    campaign_id,
    gcl_id,
    user_column_data,
    api_version,
    google_key,
  } = body

  // Find company with Google Ads connected
  const { data: adAccount } = await supabase
    .from('ad_accounts')
    .select('company_id')
    .eq('platform', 'google')
    .limit(1)
    .single()

  if (!adAccount) {
    return new Response(JSON.stringify({ error: 'No Google Ads account connected' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Parse user_column_data if present (contains form field values)
  let name = `Google Ads Lead #${lead_id || 'unknown'}`
  let phone = null
  let email = null

  if (Array.isArray(user_column_data)) {
    for (const field of user_column_data) {
      const col = field.column_id?.toLowerCase() || ''
      const val = field.string_value || ''
      if (col.includes('name') || col.includes('full_name')) name = val
      if (col.includes('phone') || col.includes('phone_number')) phone = val
      if (col.includes('email')) email = val
    }
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      company_id: adAccount.company_id,
      name,
      phone,
      email,
      source: 'google_ads',
      status: 'new',
      score: 7, // Google Ads leads tend to be higher intent
      notes: `Campaign: ${campaign_id || 'unknown'}. GCLID: ${gcl_id || 'none'}`,
    })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true, leadId: lead.id }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
