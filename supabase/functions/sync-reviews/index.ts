// sync-reviews — Pulls reviews from Google Business Profile API (OAuth) or Places API (fallback)
// Env vars: GOOGLE_PLACES_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ── Refresh Google OAuth access token ─────────────────────────────────────
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret || !refreshToken) return null

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await resp.json()
  return data.access_token || null
}

// ── Sync reviews via Google Business Profile API (OAuth) ──────────────────
async function syncViaGbpApi(
  accessToken: string,
  locationName: string,
  companyId: string,
  supabase: ReturnType<typeof createClient>,
  gbp: Record<string, unknown>,
): Promise<Response> {
  // Fetch reviews from the Business Profile API
  // locationName format: "accounts/123/locations/456"
  const reviewsResp = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!reviewsResp.ok) {
    const errText = await reviewsResp.text()
    throw new Error(`GBP API reviews failed (${reviewsResp.status}): ${errText}`)
  }

  const reviewsData = await reviewsResp.json()
  const reviews = reviewsData.reviews ?? []
  const totalReviews = reviewsData.totalReviewCount ?? reviews.length
  const avgRating = reviewsData.averageRating ?? null

  // Also fetch location details for completeness score
  let completenessScore = gbp.completeness_score as number || 0
  try {
    const locResp = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=name,title,phoneNumbers,websiteUri,regularHours,media,storefrontAddress`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (locResp.ok) {
      const locData = await locResp.json()
      completenessScore = 0
      if (locData.title) completenessScore += 20
      if (locData.phoneNumbers?.primaryPhone) completenessScore += 20
      if (locData.websiteUri) completenessScore += 20
      if (locData.regularHours?.periods?.length) completenessScore += 20
      // Photos need a separate media call, give 20 if we got this far with OAuth
      completenessScore += 20

      await supabase
        .from('gbp_profiles')
        .update({
          name: locData.title || gbp.name,
          phone: locData.phoneNumbers?.primaryPhone || gbp.phone,
          website: locData.websiteUri || gbp.website,
          hours: locData.regularHours || gbp.hours,
          completeness_score: completenessScore,
          last_synced_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
    }
  } catch {
    // Non-fatal — we still have reviews
  }

  // Sync reviews into DB
  let synced = 0
  for (const review of reviews) {
    const reviewDate = review.createTime || review.updateTime || new Date().toISOString()
    const authorName = review.reviewer?.displayName || 'Anonymous'
    const rating = { FIVE: 5, FOUR: 4, THREE: 3, TWO: 2, ONE: 1 }[review.starRating as string] ?? 5

    // Dedup
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('company_id', companyId)
      .eq('platform', 'google')
      .eq('reviewer_name', authorName)
      .gte('review_date', new Date(new Date(reviewDate).getTime() - 86400000).toISOString())
      .lte('review_date', new Date(new Date(reviewDate).getTime() + 86400000).toISOString())
      .limit(1)

    if (existing && existing.length > 0) continue

    const { error: insertError } = await supabase
      .from('reviews')
      .insert({
        company_id: companyId,
        platform: 'google',
        reviewer_name: authorName,
        rating,
        body: review.comment || null,
        review_url: review.reviewReply ? null : null,
        review_date: reviewDate,
      })

    if (!insertError) synced++
  }

  return new Response(JSON.stringify({
    success: true,
    source: 'gbp_api',
    reviewsImported: synced,
    totalReviews,
    avgRating,
    completenessScore,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Extract Place ID from various Google Maps URL formats ─────────────────
function extractPlaceIdFromUrl(url: string): string | null {
  if (!url) return null
  const placeIdParam = url.match(/[?&]place_id=(ChIJ[^&]+)/i)
  if (placeIdParam) return placeIdParam[1]
  const dataMatch = url.match(/!1s(ChIJ[^!&]+)/)
  if (dataMatch) return dataMatch[1]
  return null
}

// ── Resolve short URLs ────────────────────────────────────────────────────
async function resolveShortUrl(url: string): Promise<string> {
  if (!url.includes('goo.gl') && !url.includes('g.co')) return url
  try {
    const resp = await fetch(url, { redirect: 'manual' })
    const location = resp.headers.get('location')
    if (location) return location
    if (resp.status === 200) {
      const html = await resp.text()
      const metaRedirect = html.match(/content="0;url=(https?:\/\/[^"]+)"/i)
      if (metaRedirect) return metaRedirect[1]
    }
  } catch { /* fallthrough */ }
  return url
}

// ── Sync reviews via Places API (fallback when no OAuth) ──────────────────
async function syncViaPlacesApi(
  companyId: string,
  supabase: ReturnType<typeof createClient>,
  gbp: Record<string, unknown>,
): Promise<Response> {
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get Place ID
  let placeId = (gbp.place_id || gbp.gbp_id) as string | null

  if (!placeId || !placeId.startsWith('ChI')) {
    const gbpUrl = (gbp.website || '') as string
    if (gbpUrl) {
      const fullUrl = await resolveShortUrl(gbpUrl)
      placeId = extractPlaceIdFromUrl(fullUrl)
    }

    if (!placeId) {
      const { data: company } = await supabase
        .from('companies')
        .select('name, city, state, address')
        .eq('id', companyId)
        .single()

      if (!company) {
        return new Response(JSON.stringify({ error: 'Company not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const parts = [company.name]
      if (company.address) parts.push(company.address)
      else if (company.city && company.state) parts.push(`${company.city}, ${company.state}`)
      const searchQuery = parts.join(' ')

      const searchResp = await fetch(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${googleApiKey}`
      )
      const searchData = await searchResp.json()

      if (searchData.candidates?.length) {
        placeId = searchData.candidates[0].place_id
      } else {
        const textSearchResp = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=establishment&key=${googleApiKey}`
        )
        const textData = await textSearchResp.json()
        if (!textData.results?.length) {
          return new Response(JSON.stringify({
            error: 'Could not find business on Google Maps. Connect your Google account for full access, or paste your Google Maps link.',
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        placeId = textData.results[0].place_id
      }
    }

    if (placeId) {
      await supabase.from('gbp_profiles').update({ gbp_id: placeId }).eq('company_id', companyId)
    }
  }

  if (!placeId) {
    return new Response(JSON.stringify({ error: 'Could not determine Place ID' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch place details + reviews
  const detailsResp = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,formatted_phone_number,website,opening_hours,photos&key=${googleApiKey}`
  )
  const detailsData = await detailsResp.json()

  if (detailsData.status !== 'OK') {
    throw new Error(`Places API error: ${detailsData.status} — ${detailsData.error_message || ''}`)
  }

  const result = detailsData.result

  // Update GBP profile
  let completenessScore = 0
  if (result.name) completenessScore += 20
  if (result.formatted_phone_number) completenessScore += 20
  if (result.website) completenessScore += 20
  if (result.opening_hours?.periods?.length) completenessScore += 20
  if (result.photos?.length) completenessScore += 20

  await supabase
    .from('gbp_profiles')
    .update({
      gbp_id: placeId,
      name: result.name || gbp.name,
      phone: result.formatted_phone_number || gbp.phone,
      website: result.website || gbp.website,
      hours: result.opening_hours || gbp.hours,
      completeness_score: completenessScore,
      last_synced_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)

  // Sync reviews
  const reviews = result.reviews ?? []
  let synced = 0

  for (const review of reviews) {
    const reviewDate = new Date(review.time * 1000).toISOString()
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('company_id', companyId)
      .eq('platform', 'google')
      .eq('reviewer_name', review.author_name)
      .gte('review_date', new Date(review.time * 1000 - 86400000).toISOString())
      .lte('review_date', new Date(review.time * 1000 + 86400000).toISOString())
      .limit(1)

    if (existing && existing.length > 0) continue

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

  return new Response(JSON.stringify({
    success: true,
    source: 'places_api',
    placeId,
    reviewsImported: synced,
    totalReviews: result.user_ratings_total,
    avgRating: result.rating,
    completenessScore,
    note: 'Places API limited to 5 reviews. Connect Google account for all reviews.',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Main handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json()
    const companyId = body.companyId || body.company_id

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    // ── Try GBP API first (OAuth) ─────────────────────────────────────────
    if (gbp.google_refresh_token && gbp.gbp_location_name) {
      try {
        let accessToken = gbp.google_access_token as string | null

        // Always refresh — access tokens expire in 1 hour
        const freshToken = await refreshAccessToken(gbp.google_refresh_token as string)
        if (freshToken) {
          accessToken = freshToken
          // Save refreshed token
          await supabase
            .from('gbp_profiles')
            .update({ google_access_token: freshToken })
            .eq('company_id', companyId)
        }

        if (accessToken) {
          return await syncViaGbpApi(accessToken, gbp.gbp_location_name as string, companyId, supabase, gbp)
        }
      } catch (gbpErr) {
        // GBP API failed — fall through to Places API
        console.warn('GBP API sync failed, falling back to Places API:', gbpErr)
      }
    }

    // ── Fallback: Places API ──────────────────────────────────────────────
    return await syncViaPlacesApi(companyId, supabase, gbp)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
