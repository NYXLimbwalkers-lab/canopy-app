// sync-rankings — Checks keyword rankings using Google Custom Search API
// Falls back to Places API text search if Custom Search isn't configured
// Env vars: GOOGLE_PLACES_API_KEY, GOOGLE_CSE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Check ranking via Google Custom Search JSON API (searches actual Google web results)
async function checkRankingViaCustomSearch(
  keyword: string,
  companyName: string,
  companyDomain: string | null,
  companyPhone: string | null,
  apiKey: string,
  cseId: string,
): Promise<number | null> {
  // Search first 20 results (2 pages of 10)
  for (let start = 1; start <= 11; start += 10) {
    const params = new URLSearchParams({
      key: apiKey,
      cx: cseId,
      q: keyword,
      start: String(start),
      num: '10',
    })

    const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
    if (!resp.ok) continue

    const data = await resp.json()
    const items = data.items ?? []
    const nameLower = companyName.toLowerCase()
    const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length > 3)

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const title = (item.title || '').toLowerCase()
      const snippet = (item.snippet || '').toLowerCase()
      const link = (item.link || '').toLowerCase()

      // Match by domain
      if (companyDomain && link.includes(companyDomain)) {
        return start + i
      }

      // Match by company name in title or snippet
      if (title.includes(nameLower) || snippet.includes(nameLower)) {
        return start + i
      }

      // Match by phone number
      if (companyPhone) {
        const phoneDigits = companyPhone.replace(/\D/g, '')
        const formatted1 = `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`
        const formatted2 = `${phoneDigits.slice(0,3)}-${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`
        if (snippet.includes(phoneDigits) || snippet.includes(formatted1) || snippet.includes(formatted2)) {
          return start + i
        }
      }

      // Fuzzy match — at least 2 significant words from company name
      const matchingWords = nameWords.filter((w: string) => title.includes(w) || snippet.includes(w))
      if (matchingWords.length >= 2) {
        return start + i
      }
    }
  }

  return null // Not found in top 20
}

// Fallback: Check ranking via Places API text search (local map pack)
async function checkRankingViaPlaces(
  keyword: string,
  companyName: string,
  companyCity: string | null,
  apiKey: string,
): Promise<number | null> {
  const resp = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(keyword)}&key=${apiKey}`
  )
  if (!resp.ok) return null

  const data = await resp.json()
  const results = data.results ?? []
  const nameLower = companyName.toLowerCase()
  const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length > 3)

  for (let i = 0; i < results.length; i++) {
    const name = (results[i].name || '').toLowerCase()
    const addr = (results[i].formatted_address || '').toLowerCase()

    if (name.includes(nameLower) || nameLower.includes(name)) {
      return i + 1
    }

    // Fuzzy match with city
    if (companyCity && addr.includes(companyCity.toLowerCase())) {
      const matchingWords = nameWords.filter((w: string) => name.includes(w))
      if (matchingWords.length >= 2) {
        return i + 1
      }
    }
  }

  return null
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

    const cseId = Deno.env.get('GOOGLE_CSE_ID')

    const companyDomain = company.website
      ? (() => {
          try {
            return new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`).hostname.replace('www.', '')
          } catch { return null }
        })()
      : null

    let updated = 0
    const method = cseId ? 'custom_search' : 'places_api'

    for (const kw of keywords) {
      try {
        let position: number | null = null

        if (cseId) {
          position = await checkRankingViaCustomSearch(
            kw.keyword, company.name, companyDomain, company.phone, apiKey, cseId
          )
        } else {
          position = await checkRankingViaPlaces(
            kw.keyword, company.name, company.city, apiKey
          )
        }

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
      method,
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
