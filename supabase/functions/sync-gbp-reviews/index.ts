import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Extract Place ID from a Google Maps URL */
function extractPlaceId(url: string): string | null {
  // Standard place ID: !1sChIJ...
  const chijMatch = url.match(/!1s(ChIJ[^!&?]+)/);
  if (chijMatch) return decodeURIComponent(chijMatch[1]);

  // CID format: cid=1234567890
  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) return cidMatch[1];

  // place_id= param
  const pidMatch = url.match(/place_id=([^&]+)/);
  if (pidMatch) return decodeURIComponent(pidMatch[1]);

  return null;
}

/** Calculate GBP completeness score (0–100) */
function calcScore(data: {
  name?: string;
  phone?: string;
  website?: string;
  hours?: boolean;
  photos?: number;
}): number {
  let score = 0;
  if (data.name) score += 20;
  if (data.phone) score += 20;
  if (data.website) score += 20;
  if (data.hours) score += 20;
  if ((data.photos ?? 0) >= 3) score += 20;
  return score;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { company_id } = await req.json();
    if (!company_id) throw new Error('company_id is required');

    const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!placesKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get GBP profile for this company
    const { data: profile, error: profileErr } = await supabase
      .from('gbp_profiles')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile?.website) throw new Error('No GBP URL saved. Connect your Google Business Profile first.');

    // Try to extract Place ID from stored URL
    let placeId = profile.place_id ?? extractPlaceId(profile.website);

    // If still no Place ID, use Text Search to find it
    if (!placeId) {
      const { data: company } = await supabase
        .from('companies')
        .select('name, city')
        .eq('id', company_id)
        .single();

      if (company) {
        const query = encodeURIComponent(`${company.name} ${company.city ?? ''} tree service`);
        const searchRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${placesKey}`
        );
        const searchJson = await searchRes.json();
        placeId = searchJson.results?.[0]?.place_id ?? null;
      }
    }

    if (!placeId) throw new Error('Could not determine Place ID from the provided URL. Try pasting a full Google Maps URL.');

    // Fetch place details including reviews
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${placeId}` +
      `&fields=name,rating,user_ratings_total,reviews,formatted_phone_number,website,opening_hours,photos` +
      `&key=${placesKey}`
    );
    const details = await detailsRes.json();

    if (details.status !== 'OK') {
      throw new Error(`Places API error: ${details.status} — ${details.error_message ?? 'Unknown error'}`);
    }

    const place = details.result;
    const reviews: any[] = place.reviews ?? [];
    const hasHours = !!(place.opening_hours?.weekday_text?.length);
    const photoCount = place.photos?.length ?? 0;

    const completenessScore = calcScore({
      name: place.name,
      phone: place.formatted_phone_number,
      website: place.website,
      hours: hasHours,
      photos: photoCount,
    });

    // Update GBP profile
    await supabase
      .from('gbp_profiles')
      .update({
        name: place.name ?? profile.name,
        phone: place.formatted_phone_number ?? null,
        website: place.website ?? profile.website,
        hours: place.opening_hours ? { weekday_text: place.opening_hours.weekday_text } : null,
        photos: place.photos?.slice(0, 10).map((p: any) => p.photo_reference) ?? null,
        place_id: placeId,
        completeness_score: completenessScore,
        last_synced_at: new Date().toISOString(),
      })
      .eq('company_id', company_id);

    // Upsert reviews
    let importedCount = 0;
    for (const r of reviews) {
      const { error } = await supabase
        .from('reviews')
        .upsert(
          {
            company_id,
            platform: 'google',
            reviewer_name: r.author_name ?? 'Anonymous',
            rating: r.rating ?? 0,
            body: r.text ?? null,
            review_date: new Date(r.time * 1000).toISOString(),
          },
          { onConflict: 'company_id,platform,reviewer_name,review_date', ignoreDuplicates: true }
        );
      if (!error) importedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        placeId,
        reviewsImported: importedCount,
        totalReviews: place.user_ratings_total ?? 0,
        avgRating: place.rating ?? null,
        completenessScore,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
