// video-webhook — Receives render completion callback from FFmpeg render server
// Updates generated_videos record with final video URL or failure reason

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
    // Verify webhook secret to prevent unauthorized calls
    const webhookSecret = Deno.env.get('VIDEO_WEBHOOK_SECRET')
    if (webhookSecret) {
      const authHeader = req.headers.get('x-webhook-secret') || req.headers.get('authorization')
      if (authHeader !== webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const body = await req.json()
    const { status, url, metadata, error_message } = body

    let videoId: string | null = null
    try {
      videoId = JSON.parse(metadata ?? '{}').videoId ?? null
    } catch {
      // metadata may be a plain string or malformed
      videoId = null
    }

    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Missing videoId in metadata' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (status === 'succeeded') {
      await supabase
        .from('generated_videos')
        .update({
          status: 'ready',
          video_url: url ?? null,
        })
        .eq('id', videoId)
    } else if (status === 'failed') {
      await supabase
        .from('generated_videos')
        .update({
          status: 'failed',
          error_message: error_message ?? 'Render failed',
        })
        .eq('id', videoId)
    }

    return new Response(JSON.stringify({ success: true }), {
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
