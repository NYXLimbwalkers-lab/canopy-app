// generate-video — Orchestrates ElevenLabs TTS + Pexels footage + Creatomate cloud render
// Env vars required: ELEVENLABS_API_KEY, PEXELS_API_KEY, CREATOMATE_API_KEY
// Optional: RENDER_SERVER_URL (fallback to self-hosted FFmpeg server)
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

    // Process video synchronously — Deno Deploy kills dangling promises after response
    try {
      await processVideo(supabase, videoId, script, videoType)
    } catch (processErr: unknown) {
      const msg = processErr instanceof Error ? processErr.message : 'Processing failed'
      await supabase
        .from('generated_videos')
        .update({ status: 'failed', error_message: msg })
        .eq('id', videoId)
    }

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

// Strip stage directions, shot markers, and formatting from script so TTS only speaks natural words
function cleanScriptForTTS(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, '')
    .replace(/^(HOOK|CTA|INTRO|OUTRO|---)\s*:?\s*/gim, '')
    .replace(/---+/g, '')
    .replace(/\*\*.*?\*\*/g, '')
    .replace(/#+\s*/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\s+|\s+$/gm, '')
    .split('\n')
    .filter(line => line.length > 0)
    .join('. ')
    .replace(/\.\.\./g, ', ')
    .replace(/\.\s*\./g, '.')
    .trim()
}

async function processVideo(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  script: string,
  videoType: string,
) {
  const elevenLabsKey   = Deno.env.get('ELEVENLABS_API_KEY')
  const pexelsKey       = Deno.env.get('PEXELS_API_KEY')
  const creatomateKey   = Deno.env.get('CREATOMATE_API_KEY')
  const renderServerUrl = Deno.env.get('RENDER_SERVER_URL')
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!

  // Look up company name for watermark
  const { data: videoRow } = await supabase
    .from('generated_videos')
    .select('company_id')
    .eq('id', videoId)
    .single()
  let companyName = 'Canopy'
  if (videoRow?.company_id) {
    const { data: co } = await supabase
      .from('companies')
      .select('name')
      .eq('id', videoRow.company_id)
      .single()
    if (co?.name) companyName = co.name
  }

  const spokenText = cleanScriptForTTS(script)

  // ── Step 1: ElevenLabs voiceover ──────────────────────────────────────────
  let audioUrl: string | null = null

  if (elevenLabsKey) {
    try {
      const ttsResp = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/TxGEqnHWrfWFTfGW9XjX',
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.35,
              similarity_boost: 0.6,
              style: 0.15,
              use_speaker_boost: true,
            },
          }),
        },
      )

      if (ttsResp.ok) {
        const audioBuffer = await ttsResp.arrayBuffer()

        // Ensure the storage bucket exists
        await supabase.storage.createBucket('generated-videos', { public: true }).catch(() => {})

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
    } catch {
      // ElevenLabs failed — Creatomate TTS fallback will be used in the render step
    }
  }

  // ── Step 2: Pexels stock footage ──────────────────────────────────────────
  const videoClips: string[] = []

  if (pexelsKey) {
    const query = VIDEO_TYPE_SEARCH[videoType] ?? 'tree service arborist'
    const pexelsResp = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait&size=medium`,
      { headers: { Authorization: pexelsKey } },
    )

    if (pexelsResp.ok) {
      const pexelsData = await pexelsResp.json()
      for (const video of (pexelsData.videos ?? []).slice(0, 4)) {
        const hdFile = video.video_files?.find((f: any) => f.quality === 'hd')
          ?? video.video_files?.[0]
        if (hdFile?.link) videoClips.push(hdFile.link)
      }
    }
  }

  // Estimate total duration from spoken text (~2.5 words/sec for natural pacing)
  const wordCount = spokenText.split(/\s+/).length
  const estimatedDuration = Math.max(20, Math.min(60, Math.round(wordCount / 2.5)))

  // ── Step 3: Render via Creatomate (cloud) or fallback to self-hosted server ──
  if (creatomateKey) {
    await renderViaCreatomate(
      supabase, creatomateKey, videoId, videoClips, audioUrl,
      spokenText, companyName, estimatedDuration, supabaseUrl,
    )
  } else if (renderServerUrl) {
    await renderViaSelfHosted(
      supabase, renderServerUrl, videoId, videoClips, audioUrl,
      spokenText, companyName, estimatedDuration, supabaseUrl,
    )
  } else {
    throw new Error('No render backend configured. Set CREATOMATE_API_KEY or RENDER_SERVER_URL in Edge Function Secrets.')
  }
}

// ── Creatomate cloud rendering ──────────────────────────────────────────────
async function renderViaCreatomate(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  videoId: string,
  videoClips: string[],
  audioUrl: string | null,
  spokenText: string,
  companyName: string,
  totalDuration: number,
  supabaseUrl: string,
) {
  // Build a Creatomate source JSON (dynamic template)
  // 9:16 portrait video with stock clips, voiceover, captions, and watermark
  const clipDuration = videoClips.length > 0
    ? totalDuration / videoClips.length
    : totalDuration

  // Build elements array: video clips as composition, then text overlays
  const clipElements = videoClips.map((url, i) => ({
    type: 'video',
    source: url,
    trim_start: 0,
    trim_duration: clipDuration,
    // Each clip plays sequentially
    time: i * clipDuration,
    duration: clipDuration,
  }))

  // Caption: split into timed segments
  const sentences = spokenText.split(/(?<=[.!?])\s+/).filter(s => s.length > 5)
  const maxSegs = Math.min(sentences.length, 6)
  const segDuration = totalDuration / maxSegs
  const captionElements = sentences.slice(0, maxSegs).map((text, i) => ({
    type: 'text',
    text: text.length > 80 ? text.slice(0, 77) + '...' : text,
    time: i * segDuration,
    duration: segDuration,
    y: '85%',
    width: '90%',
    x_alignment: '50%',
    font_family: 'Montserrat',
    font_weight: '800',
    font_size: '7 vmin',
    fill_color: '#ffffff',
    stroke_color: '#000000',
    stroke_width: '1.5 vmin',
    background_color: 'rgba(0,0,0,0.4)',
    background_x_padding: '30%',
    background_y_padding: '15%',
    background_border_radius: '30%',
  }))

  // Watermark
  const watermarkElement = {
    type: 'text',
    text: companyName,
    time: 0,
    duration: totalDuration,
    x: '5%',
    y: '3%',
    font_family: 'Montserrat',
    font_weight: '700',
    font_size: '4 vmin',
    fill_color: 'rgba(255,255,255,0.8)',
    stroke_color: 'rgba(0,0,0,0.5)',
    stroke_width: '0.5 vmin',
  }

  const elements: any[] = [
    ...clipElements,
    watermarkElement,
    ...captionElements,
  ]

  // Add audio track — use ElevenLabs URL if available, otherwise Creatomate built-in TTS
  if (audioUrl) {
    elements.push({
      type: 'audio',
      source: audioUrl,
      time: 0,
      duration: totalDuration,
    })
  } else {
    // Fallback: Creatomate's built-in text-to-speech
    elements.push({
      type: 'audio',
      text: spokenText,
      voice: 'Matthew',  // Creatomate built-in voice
      time: 0,
      duration: totalDuration,
    })
  }

  const source = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    duration: totalDuration,
    elements,
  }

  const webhookUrl = `${supabaseUrl}/functions/v1/video-webhook`

  // Submit render to Creatomate
  // Creatomate expects `source` as a JSON string within the request body
  const renderResp = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: source,
      metadata: JSON.stringify({ videoId }),
      webhook_url: webhookUrl,
    }),
  })

  if (!renderResp.ok) {
    const errText = await renderResp.text()
    throw new Error(`Creatomate render failed (${renderResp.status}): ${errText}`)
  }

  const renderData = await renderResp.json()
  const renderId = renderData?.[0]?.id

  // Store the render ID for tracking
  if (renderId) {
    await supabase
      .from('generated_videos')
      .update({ creatomate_render_id: renderId })
      .eq('id', videoId)
  }

  // Creatomate will call our webhook when done — no need to wait here
}

// ── Self-hosted FFmpeg render server (fallback) ─────────────────────────────
async function renderViaSelfHosted(
  supabase: ReturnType<typeof createClient>,
  renderServerUrl: string,
  videoId: string,
  videoClips: string[],
  audioUrl: string | null,
  spokenText: string,
  companyName: string,
  totalDuration: number,
  supabaseUrl: string,
) {
  const webhookUrl = `${supabaseUrl}/functions/v1/video-webhook`
  const renderApiKey = Deno.env.get('RENDER_API_KEY') || ''

  // Build caption segments with timing
  const sentences = spokenText.split(/(?<=[.!?])\s+/).filter(s => s.length > 5)
  const maxSegs = Math.min(sentences.length, 6)
  const segDuration = totalDuration / maxSegs
  const captionSegments = sentences.slice(0, maxSegs).map((text, i) => ({
    text: text.length > 80 ? text.slice(0, 77) + '...' : text,
    startTime: i * segDuration,
    duration: segDuration,
  }))

  const renderResp = await fetch(`${renderServerUrl}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(renderApiKey ? { 'X-Api-Key': renderApiKey } : {}),
    },
    body: JSON.stringify({
      videoId,
      audioUrl,
      videoClips,
      captionSegments,
      watermarkText: companyName,
      totalDuration,
      webhookUrl,
      supabaseUrl,
      supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    }),
  })

  if (!renderResp.ok) {
    const errText = await renderResp.text()
    throw new Error(`Render server request failed: ${errText}`)
  }
}
