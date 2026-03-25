// generate-video — Orchestrates ElevenLabs TTS + Pexels footage + Creatomate render
// Env vars required: ELEVENLABS_API_KEY, PEXELS_API_KEY, CREATOMATE_API_KEY
// Env vars auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VIDEO_TYPE_SEARCH: Record<string, string> = {
  satisfying_removal: 'tree removal chainsaw',
  before_after:       'tree trimming garden transformation',
  did_you_know:       'forest trees nature',
  day_in_life:        'arborist tree climbing worker',
  price_transparency: 'tree service yard work estimate',
  storm_damage:       'storm damage fallen tree hurricane',
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { script, videoType, companyId } = await req.json()

    if (!script || !videoType || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing script, videoType, or companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create DB record immediately so client can subscribe to Realtime
    const { data: videoRecord, error: insertError } = await supabase
      .from('generated_videos')
      .insert({ company_id: companyId, script, video_type: videoType, status: 'processing' })
      .select()
      .single()

    if (insertError || !videoRecord) {
      throw new Error(`DB insert failed: ${insertError?.message}`)
    }

    const videoId: string = videoRecord.id

    // Fire-and-forget async processing — return videoId to client immediately
    processVideo(supabase, videoId, script, videoType).catch(async (err: Error) => {
      await supabase
        .from('generated_videos')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', videoId)
    })

    return new Response(JSON.stringify({ id: videoId }), {
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

async function processVideo(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  script: string,
  videoType: string,
) {
  const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY')
  const pexelsKey     = Deno.env.get('PEXELS_API_KEY')
  const creatomateKey = Deno.env.get('CREATOMATE_API_KEY')
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!

  if (!creatomateKey) {
    throw new Error(
      'CREATOMATE_API_KEY not set. Add it in Supabase Dashboard → Edge Functions → Secrets.',
    )
  }

  // ── Step 1: ElevenLabs voiceover ──────────────────────────────────────────
  let audioUrl: string | null = null

  if (elevenLabsKey) {
    // Adam voice — natural, confident, good for trades/services
    const ttsResp = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB',
      {
        method: 'POST',
        headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    )

    if (ttsResp.ok) {
      const audioBuffer = await ttsResp.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('generated-videos')
        .upload(`audio/${videoId}.mp3`, new Uint8Array(audioBuffer), {
          contentType: 'audio/mpeg',
          upsert: true,
        })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('generated-videos')
          .getPublicUrl(`audio/${videoId}.mp3`)
        audioUrl = publicUrl
      }
    }
  }

  // ── Step 2: Pexels stock footage ──────────────────────────────────────────
  const videoClips: string[] = []

  if (pexelsKey) {
    const query = VIDEO_TYPE_SEARCH[videoType] ?? 'tree service arborist'
    const pexelsResp = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait&size=medium`,
      { headers: { Authorization: pexelsKey } },
    )

    if (pexelsResp.ok) {
      const pexelsData = await pexelsResp.json()
      for (const video of (pexelsData.videos ?? []).slice(0, 3)) {
        const hdFile = video.video_files?.find((f: any) => f.quality === 'hd')
          ?? video.video_files?.[0]
        if (hdFile?.link) videoClips.push(hdFile.link)
      }
    }
  }

  // ── Step 3: Creatomate render ─────────────────────────────────────────────
  const webhookUrl = `${supabaseUrl}/functions/v1/video-webhook`

  // Build composition elements
  const elements: any[] = []

  if (videoClips.length > 0) {
    // Stack clips sequentially in track 1
    videoClips.forEach((src) => {
      elements.push({ type: 'video', source: src, fit: 'cover', track: 1 })
    })
  } else {
    // Fallback solid background when no footage available
    elements.push({
      type: 'rectangle',
      width: '100%',
      height: '100%',
      x_anchor: '50%',
      y_anchor: '50%',
      fill_color: '#1A3326',
      duration: 30,
      track: 1,
    })
  }

  // Voiceover in track 2
  if (audioUrl) {
    elements.push({ type: 'audio', source: audioUrl, track: 2 })
  }

  // Caption overlay: large readable white text with dark stroke
  elements.push({
    type: 'text',
    text: script.length > 220 ? script.slice(0, 220) + '…' : script,
    y: '72%',
    width: '88%',
    x_anchor: '50%',
    y_anchor: '0%',
    font_size: '4.8 vmin',
    font_weight: '700',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '0.4 vmin',
    text_align: 'center',
    background_color: 'rgba(0,0,0,0.45)',
    background_x_padding: '3 vmin',
    background_y_padding: '2 vmin',
    background_border_radius: '1.5 vmin',
    track: 3,
  })

  // Company name watermark top-left
  elements.push({
    type: 'text',
    text: '🌳 Canopy',
    x: '4%',
    y: '4%',
    x_anchor: '0%',
    y_anchor: '0%',
    font_size: '3.5 vmin',
    font_weight: '700',
    fill_color: '#FFFFFF',
    stroke_color: '#000000',
    stroke_width: '0.3 vmin',
    track: 3,
  })

  const composition = {
    output_format: 'mp4',
    width: 1080,
    height: 1920, // 9:16 vertical — TikTok / Reels / Shorts
    elements,
  }

  const renderResp = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creatomateKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: composition,
      webhook_url: webhookUrl,
      metadata: JSON.stringify({ videoId }),
    }),
  })

  if (!renderResp.ok) {
    const errText = await renderResp.text()
    throw new Error(`Creatomate render request failed: ${errText}`)
  }

  const renderData = await renderResp.json()
  const renderId: string | undefined = Array.isArray(renderData)
    ? renderData[0]?.id
    : renderData?.id

  if (renderId) {
    await supabase
      .from('generated_videos')
      .update({ creatomate_render_id: renderId })
      .eq('id', videoId)
  }
}
