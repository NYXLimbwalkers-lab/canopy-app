// video-webhook — Receives render completion callback from FFmpeg render server
// Updates generated_videos record with final video URL or failure reason

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }

  try {
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
      return new Response('ok', { status: 200 })
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

    return new Response('ok', { status: 200 })
  } catch (_err) {
    return new Response('ok', { status: 200 })
  }
})
