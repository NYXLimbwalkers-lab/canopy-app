// sync-reviews — Pulls reviews from Google Places API and stores them
// Env vars: GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Call with POST { companyId } or schedule via cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the GBP profile for this company (has the Google Place ID or GBP URL)
    const { data: gbp } = await supabase
      .from('gbp_profiles')
      .select('*')
      .eq('company_id', companyId)
      .single()

    if (!gbp) {
      return new Response(JSON.stringify({ error: 'No GBP profile found. Connect Google Business Profile first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
    if (!googleApiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try to get Place ID — either stored directly or search by company name + address
    let placeId = gbp.gbp_id
    if (!placeId || !placeId.startsWith('ChI')) {
      // Search for the place using company info
      const { data: company } = await supabase
        .from('companies')
        .select('name, city, state')
        .eq('id', companyId)
        .single()

      if (!company) {
        return new Response(JSON.stringify({ error: 'Company not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const searchQuery = `${company.name} ${company.city || ''} ${company.state || ''}`.trim()

      // Use Places API Text Search to find the business
      const searchResp = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=establishment&key=${googleApiKey}`
      )

      if (!searchResp.ok) {
        throw new Error(`Places search failed: ${searchResp.status}`)
      }

      const searchData = await searchResp.json()
      if (!searchData.results?.length) {
        return new Response(JSON.stringify({ error: 'Could not find business on Google Maps. Check your company name and location.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      placeId = searchData.results[0].place_id

      // Save the place ID for future syncs
      await supabase
        .from('gbp_profiles')
        .update({ gbp_id: placeId })
        .eq('company_id', companyId)
    }

    // Fetch place details including reviews
    const detailsResp = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,name,rating,user_ratings_total&key=${googleApiKey}`
    )

    if (!detailsResp.ok) {
      throw new Error(`Places details failed: ${detailsResp.status}`)
    }

    const detailsData = await detailsResp.json()
    const reviews = detailsData.result?.reviews ?? []

    if (reviews.length === 0) {
      return new Response(JSON.stringify({ message: 'No reviews found', synced: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert reviews — use reviewer_name + review_date as a natural key to avoid duplicates
    let synced = 0
    for (const review of reviews) {
      const reviewDate = new Date(review.time * 1000).toISOString()

      // Check if review already exists (by platform + reviewer name + approximate date)
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', 'google')
        .eq('reviewer_name', review.author_name)
        .gte('review_date', new Date(review.time * 1000 - 86400000).toISOString())
        .lte('review_date', new Date(review.time * 1000 + 86400000).toISOString())
        .limit(1)

      if (existing && existing.length > 0) continue // Already synced

      const { error: insertError } = await supabase
        .from('reviews')
        .insert({
          company_id: companyId,
          platform: 'google',
          reviewer_name: review.author_name,
          rating: review.rating,
          body: review.text || null,
          review_url: review.author_url || null,
          review_date: reviewDate,
        })

      if (!insertError) synced++
    }

    // Update last_synced_at
    await supabase
      .from('gbp_profiles')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('company_id', companyId)

    return new Response(JSON.stringify({
      message: `Synced ${synced} new reviews`,
      synced,
      totalFromGoogle: reviews.length,
      overallRating: detailsData.result?.rating,
      totalRatings: detailsData.result?.user_ratings_total,
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
