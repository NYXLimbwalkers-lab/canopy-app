// sync-rankings — Checks keyword rankings using Google Places API text search
// This checks local/map pack rankings for service-area businesses
// Env vars: GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Check ranking via Places API text search (local map pack results)
async function checkRankingViaPlaces(
  keyword: string,
  companyName: string,
  companyCity: string | null,
  companyState: string | null,
  companyPhone: string | null,
  apiKey: string,
): Promise<{ position: number | null; totalResults: number }> {
  // Add location context to keyword if not already present
  let query = keyword
  const keywordLower = keyword.toLowerCase()
  const hasLocation = companyCity && keywordLower.includes(companyCity.toLowerCase())
  const hasNearMe = keywordLower.includes('near me')

  // For "near me" queries, replace with actual city/state
  if (hasNearMe && companyCity) {
    query = keyword.replace(/near me/i, `${companyCity}${companyState ? ` ${companyState}` : ''}`)
  } else if (!hasLocation && !hasNearMe && companyCity) {
    // Already has city in keyword, use as-is
  }

  const resp = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`
  )
  if (!resp.ok) return { position: null, totalResults: 0 }

  const data = await resp.json()
  const results = data.results ?? []
  if (!results.length) return { position: null, totalResults: 0 }

  const nameLower = companyName.toLowerCase()
  const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length > 3)
  const phoneDigits = companyPhone?.replace(/\D/g, '') || ''

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const name = (result.name || '').toLowerCase()
    const addr = (result.formatted_address || '').toLowerCase()
    const placePhone = (result.formatted_phone_number || '').replace(/\D/g, '')

    // Exact name match
    if (name.includes(nameLower) || nameLower.includes(name)) {
      return { position: i + 1, totalResults: results.length }
    }

    // Phone number match
    if (phoneDigits && phoneDigits.length >= 10 && placePhone.includes(phoneDigits.slice(-10))) {
      return { position: i + 1, totalResults: results.length }
    }

    // Fuzzy match — at least 2 significant words from company name
    const matchingWords = nameWords.filter((w: string) => name.includes(w))
    if (matchingWords.length >= 2) {
      return { position: i + 1, totalResults: results.length }
    }

    // Fuzzy match with city context
    if (companyCity && addr.includes(companyCity.toLowerCase())) {
      if (matchingWords.length >= 1 && nameWords.length <= 2) {
        return { position: i + 1, totalResults: results.length }
      }
    }
  }

  return { position: null, totalResults: results.length }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { companyId } = await req.json()

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: company } = await supabase
      .from('companies')
      .select('name, website, city, state, phone')
      .eq('id', companyId)
      .single()

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: keywords } = await supabase
      .from('keyword_rankings')
      .select('*')
      .eq('company_id', companyId)

    if (!keywords?.length) {
      return new Response(JSON.stringify({ error: 'No keywords tracked. Add keywords in the SEO tab first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let updated = 0

    for (const kw of keywords) {
      try {
        const { position } = await checkRankingViaPlaces(
          kw.keyword, company.name, company.city, company.state, company.phone, apiKey
        )

        await supabase
          .from('keyword_rankings')
          .update({
            previous_position: kw.position,
            position,
            url: position
              ? `https://www.google.com/search?q=${encodeURIComponent(kw.keyword)}`
              : kw.url,
            checked_at: new Date().toISOString(),
          })
          .eq('id', kw.id)

        updated++

        // Rate limit delay
        await new Promise(r => setTimeout(r, 250))
      } catch {
        continue
      }
    }

    return new Response(JSON.stringify({
      success: true,
      method: 'places_api',
      keywordsChecked: keywords.length,
      keywordsUpdated: updated,
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
