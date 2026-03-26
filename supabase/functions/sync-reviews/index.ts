// sync-reviews — Pulls reviews from Google Places API and stores them
// Extracts Place ID from Google Maps URLs, resolves short links, or searches by name
// Env vars: GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Extract Place ID from various Google Maps URL formats
function extractPlaceIdFromUrl(url: string): string | null {
  if (!url) return null

  // Direct Place ID in URL: /place/...?...place_id=ChIJ...
  const placeIdParam = url.match(/[?&]place_id=(ChIJ[^&]+)/i)
  if (placeIdParam) return placeIdParam[1]

  // Data parameter format: !1sChIJ...
  const dataMatch = url.match(/!1s(ChIJ[^!&]+)/)
  if (dataMatch) return dataMatch[1]

  // Hex-encoded place ID in data: 0x...:0x...
  const hexMatch = url.match(/0x[\da-f]+:0x[\da-f]+/i)
  if (hexMatch) return null // Can't convert hex to Place ID without API

  // CID format: ?cid=12345
  const cidMatch = url.match(/[?&]cid=(\d+)/)
  if (cidMatch) return null // CID needs API lookup

  return null
}

// Resolve short URLs (maps.app.goo.gl) to full URLs
async function resolveShortUrl(url: string): Promise<string> {
  if (!url.includes('goo.gl') && !url.includes('g.co')) return url

  try {
    const resp = await fetch(url, { redirect: 'manual' })
    const location = resp.headers.get('location')
    if (location) return location

    // Some redirects need a second hop
    if (resp.status === 200) {
      const html = await resp.text()
      const metaRedirect = html.match(/content="0;url=(https?:\/\/[^"]+)"/i)
      if (metaRedirect) return metaRedirect[1]
    }
  } catch {
    // If redirect fails, try the original URL
  }
  return url
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

    // ── Step 1: Get Place ID ────────────────────────────────────────────────
    let placeId = gbp.gbp_id

    // If we already have a valid Place ID, skip extraction
    if (!placeId || !placeId.startsWith('ChI')) {
      // Try extracting from the stored URL/website
      const gbpUrl = gbp.website || ''

      if (gbpUrl) {
        // Resolve short links first
        const fullUrl = await resolveShortUrl(gbpUrl)
        placeId = extractPlaceIdFromUrl(fullUrl)
      }

      // If URL extraction failed, search by company name
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

        // Build a specific search query
        const parts = [company.name]
        if (company.address) parts.push(company.address)
        else if (company.city && company.state) parts.push(`${company.city}, ${company.state}`)
        const searchQuery = parts.join(' ')

        const searchResp = await fetch(
          `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${googleApiKey}`
        )

        if (!searchResp.ok) {
          throw new Error(`Places search failed: ${searchResp.status}`)
        }

        const searchData = await searchResp.json()
        if (!searchData.candidates?.length) {
          // Fallback to text search with looser matching
          const textSearchResp = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=establishment&key=${googleApiKey}`
          )
          const textData = await textSearchResp.json()
          if (!textData.results?.length) {
            return new Response(JSON.stringify({
              error: 'Could not find business on Google Maps. Try pasting the direct Google Maps link to your business.',
            }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          placeId = textData.results[0].place_id
        } else {
          placeId = searchData.candidates[0].place_id
        }
      }

      // Save Place ID for future syncs (no more searching needed)
      if (placeId) {
        await supabase
          .from('gbp_profiles')
          .update({ gbp_id: placeId })
          .eq('company_id', companyId)
      }
    }

    if (!placeId) {
      return new Response(JSON.stringify({ error: 'Could not determine Place ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Step 2: Fetch place details + reviews ───────────────────────────────
    const detailsResp = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,formatted_phone_number,website,opening_hours,photos&key=${googleApiKey}`
    )

    if (!detailsResp.ok) {
      throw new Error(`Places details failed: ${detailsResp.status}`)
    }

    const detailsData = await detailsResp.json()

    if (detailsData.status !== 'OK') {
      throw new Error(`Places API error: ${detailsData.status} — ${detailsData.error_message || ''}`)
    }

    const result = detailsData.result

    // ── Step 3: Update GBP profile with real data ───────────────────────────
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
        hours: result.opening_hours ? result.opening_hours : gbp.hours,
        completeness_score: completenessScore,
        last_synced_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)

    // ── Step 4: Sync reviews ────────────────────────────────────────────────
    const reviews = result.reviews ?? []

    if (reviews.length === 0) {
      return new Response(JSON.stringify({
        message: 'Profile synced but no reviews found',
        synced: 0,
        completenessScore,
        overallRating: result.rating,
        totalRatings: result.user_ratings_total,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let synced = 0
    for (const review of reviews) {
      const reviewDate = new Date(review.time * 1000).toISOString()

      // Dedup by reviewer + approximate date
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
      message: `Synced ${synced} new reviews`,
      synced,
      totalFromGoogle: reviews.length,
      overallRating: result.rating,
      totalRatings: result.user_ratings_total,
      completenessScore,
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
