// sync-rankings — Fetches keyword position data and updates keyword_rankings table
// Uses Google Custom Search API to check where the company ranks for each keyword
// Env vars: GOOGLE_PLACES_API_KEY (reused for Custom Search), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// POST { companyId }

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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

    // Get company info for matching
    const { data: company } = await supabase
      .from('companies')
      .select('name, website, city, state')
      .eq('id', companyId)
      .single()

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get tracked keywords
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

    // Build matching patterns for the company
    const companyDomain = company.website
      ? new URL(company.website.startsWith('http') ? company.website : `https://${company.website}`).hostname.replace('www.', '')
      : null
    const companyNameLower = company.name.toLowerCase()

    let updated = 0

    // Check each keyword using Google Custom Search JSON API
    // Note: This uses the Programmable Search Engine. If not set up,
    // we simulate rankings based on Google Maps local pack presence
    for (const kw of keywords) {
      try {
        // Use Places API text search as a proxy for local SEO ranking
        // This checks if the business appears in Google Maps results for the keyword
        const searchResp = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(kw.keyword)}&key=${apiKey}`
        )

        if (!searchResp.ok) continue

        const searchData = await searchResp.json()
        const results = searchData.results ?? []

        // Find our business in the results
        let position: number | null = null
        for (let i = 0; i < results.length; i++) {
          const name = (results[i].name || '').toLowerCase()
          const addr = (results[i].formatted_address || '').toLowerCase()

          // Match by name similarity
          if (name.includes(companyNameLower) || companyNameLower.includes(name)) {
            position = i + 1
            break
          }

          // Match by city if names are close
          if (company.city && addr.includes(company.city.toLowerCase())) {
            const nameWords = companyNameLower.split(/\s+/)
            const matchingWords = nameWords.filter(w => w.length > 2 && name.includes(w))
            if (matchingWords.length >= 2) {
              position = i + 1
              break
            }
          }
        }

        // Update the keyword ranking
        const { error: updateError } = await supabase
          .from('keyword_rankings')
          .update({
            previous_position: kw.position,
            position: position, // null means not found in top 20
            url: position && results[position - 1]
              ? `https://www.google.com/maps/search/${encodeURIComponent(kw.keyword)}`
              : kw.url,
            checked_at: new Date().toISOString(),
          })
          .eq('id', kw.id)

        if (!updateError) updated++

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200))
      } catch {
        // Skip individual keyword failures
        continue
      }
    }

    return new Response(JSON.stringify({
      success: true,
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
