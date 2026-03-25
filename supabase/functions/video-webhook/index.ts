// video-webhook — Receives Creatomate render completion callback
// Updates generated_videos record with final video URL or failure reason

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // Creatomate sends POST with render result
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }

  try {
    const body = await req.json()

    // Creatomate render object shape:
    // { id, status, url, snapshot_url, metadata, error_message, ... }
    const { status, url, snapshot_url, metadata, error_message } = body

    // We stash videoId in metadata when kicking off the render
    let videoId: string | null = null
    try {
      videoId = JSON.parse(metadata ?? '{}').videoId ?? null
    } catch {
      // metadata may be empty or malformed — that's fine
    }

    if (!videoId) {
      // Nothing we can update — just ack
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
          thumbnail_url: snapshot_url ?? null,
        })
        .eq('id', videoId)
    } else if (status === 'failed') {
      await supabase
        .from('generated_videos')
        .update({
          status: 'failed',
          error_message: error_message ?? 'Render failed in Creatomate',
        })
        .eq('id', videoId)
    }
    // For 'planned' / 'rendering' intermediate statuses we just ack

    return new Response('ok', { status: 200 })
  } catch (_err) {
    // Always ack — Creatomate will not retry on 2xx
    return new Response('ok', { status: 200 })
  }
})
