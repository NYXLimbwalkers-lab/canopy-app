// generate-video — Orchestrates ElevenLabs TTS + Pexels footage + Creatomate cloud render
// Env vars required: ELEVENLABS_API_KEY, PEXELS_API_KEY, CREATOMATE_API_KEY
// Optional: RENDER_SERVER_URL (fallback to self-hosted FFmpeg server)
// Env vars auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Fetch with timeout — prevents hanging on slow external APIs
function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Progress reporter — updates DB so client can show step-by-step progress
async function updateProgress(sb: any, id: string, step: string, pct: number) {
  try {
    await sb.from('generated_videos').update({ progress_step: step, progress_percent: pct }).eq('id', id)
  } catch {}
}

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
  crane_job:          'crane heavy lifting construction',
  stump_grinding:     'stump removal grinding wood chips',
  tree_health_tip:    'tree bark leaves nature closeup',
  crew_spotlight:     'construction worker team outdoor',
  equipment_tour:     'chainsaw tools equipment workshop',
  seasonal_reminder:  'autumn leaves spring garden season',
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
    const { script, videoType, companyId, captionStyle, pacing, clipPrefix } = await req.json()

    if (!script || !videoType || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing script, videoType, or companyId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const renderCaptionStyle = captionStyle ?? 'bold'
    const renderPacing = pacing ?? 'medium'

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
      await processVideo(supabase, videoId, script, videoType, renderCaptionStyle, renderPacing, clipPrefix)
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

// Strip stage directions, shot markers, formatting, hashtags, and labels so TTS only speaks natural words
function cleanScriptForTTS(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, '')                             // [stage directions]
    .replace(/^(HOOK|CTA|INTRO|OUTRO|SCRIPT|Caption)\s*:?\s*/gim, '') // Labels
    .replace(/---+/g, '')                                // Dividers
    .replace(/\*\*.*?\*\*/g, '')                         // Bold markers
    .replace(/#+\s*/g, '')                               // Headings
    .replace(/#\w+/g, '')                                // #hashtags
    .replace(/^Caption:.*$/gim, '')                      // Caption: lines
    .replace(/^\s*https?:\/\/\S+\s*$/gm, '')             // URLs on their own line
    .replace(/\n{2,}/g, '\n')
    .replace(/^\s+|\s+$/gm, '')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .join('. ')
    .replace(/\.\.\./g, ', ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Split text into chunks of ~200 chars at sentence boundaries for Google Translate TTS
function splitTextForGoogleTTS(text: string, maxLen = 190): string[] {
  const sentences = text.split(/(?<=[.!?,;])\s+/)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxLen) {
      if (current) chunks.push(current.trim())
      // If a single sentence exceeds maxLen, split it by words
      if (sentence.length > maxLen) {
        const words = sentence.split(/\s+/)
        let wordChunk = ''
        for (const word of words) {
          if (wordChunk.length + word.length + 1 > maxLen) {
            if (wordChunk) chunks.push(wordChunk.trim())
            wordChunk = word
          } else {
            wordChunk += (wordChunk ? ' ' : '') + word
          }
        }
        if (wordChunk) current = wordChunk
      } else {
        current = sentence
      }
    } else {
      current += (current ? ' ' : '') + sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)]
}

// Upload audio buffer to Supabase Storage and return the public URL
async function uploadAudioToStorage(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  audioBuffer: ArrayBuffer,
): Promise<string | null> {
  const filePath = `${videoId}/voiceover.mp3`
  const { error } = await supabase.storage
    .from('generated-videos')
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    console.error('Audio upload failed:', error.message)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('generated-videos')
    .getPublicUrl(filePath)

  return urlData?.publicUrl ?? null
}

// Extract visual keywords from script text to improve Pexels footage search
function extractVisualKeywords(script: string, videoType: string): string {
  const text = script.toLowerCase()

  // Map common tree service concepts to good stock footage search terms
  const conceptMap: Record<string, string[]> = {
    'chainsaw': ['chainsaw cutting wood'],
    'stump': ['stump grinding wood chips'],
    'crane': ['crane lifting heavy equipment'],
    'storm': ['storm damage fallen tree'],
    'roof': ['tree near house rooftop'],
    'climb': ['tree climbing arborist'],
    'truck': ['utility truck forestry'],
    'property': ['beautiful yard landscaping'],
    'dead tree': ['dead tree bark'],
    'pruning': ['tree pruning branch cutting'],
    'firewood': ['chopping firewood logs'],
    'roots': ['tree roots ground soil'],
    'oak': ['large oak tree'],
    'pine': ['pine tree forest'],
    'palm': ['palm tree tropical'],
    'emergency': ['emergency response urgent'],
    'crew': ['construction workers team outdoor'],
    'equipment': ['heavy equipment tools outdoor'],
    'mulch': ['wood chips mulch garden'],
    'safety': ['safety gear helmet worker'],
  }

  // Find concepts mentioned in the script
  const matches: string[] = []
  for (const [keyword, searches] of Object.entries(conceptMap)) {
    if (text.includes(keyword)) {
      matches.push(searches[0])
    }
  }

  // Return the best match or a contextual default
  if (matches.length > 0) return matches[0]
  return VIDEO_TYPE_SEARCH[videoType] ?? 'tree service outdoor work'
}

async function processVideo(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  script: string,
  videoType: string,
  captionStyle: string = 'bold',
  pacing: string = 'medium',
  clipPrefix: string | null = null,
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
  await updateProgress(supabase, videoId, 'Generating voiceover audio...', 10)

  // ── Step 1: Generate voiceover audio ─────────────────────────────────────
  let audioUrl: string | null = null

  // Ensure the storage bucket exists for audio uploads

  // Try ElevenLabs first (premium quality voice)
  if (elevenLabsKey) {
    try {
      // Fetch available voices from the user's account and pick one at random
      let voiceId = 'TxGEqnHWrfWFTfGW9XjX' // default fallback voice
      try {
        const voicesResp = await fetchWithTimeout('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': elevenLabsKey },
        })
        if (voicesResp.ok) {
          const voicesData = await voicesResp.json()
          const voices = voicesData.voices ?? []
          if (voices.length > 0) {
            const randomVoice = voices[Math.floor(Math.random() * voices.length)]
            voiceId = randomVoice.voice_id
          }
        }
      } catch {}

      const ttsResp = await fetchWithTimeout(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.35, similarity_boost: 0.6, style: 0.15, use_speaker_boost: true },
          }),
        },
      )
      if (ttsResp.ok) {
        audioUrl = await uploadAudioToStorage(supabase, videoId, await ttsResp.arrayBuffer())
      }
    } catch {}
  }

  // Fallback: Google Translate TTS (free, no API key needed)
  if (!audioUrl) {
    try {
      // Google TTS has a ~200 char limit per request — split into chunks
      const chunks = splitTextForGoogleTTS(spokenText)
      const audioChunks: ArrayBuffer[] = []

      for (const chunk of chunks) {
        const gResp = await fetchWithTimeout(
          `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(chunk)}`,
        )
        if (gResp.ok) {
          audioChunks.push(await gResp.arrayBuffer())
        }
      }

      if (audioChunks.length > 0) {
        // Concatenate all audio chunks into one buffer
        const totalLen = audioChunks.reduce((sum, buf) => sum + buf.byteLength, 0)
        const merged = new Uint8Array(totalLen)
        let offset = 0
        for (const buf of audioChunks) {
          merged.set(new Uint8Array(buf), offset)
          offset += buf.byteLength
        }
        audioUrl = await uploadAudioToStorage(supabase, videoId, merged.buffer)
      }
    } catch (gErr) {
      console.error('Google TTS fallback failed:', gErr instanceof Error ? gErr.message : gErr)
    }
  }

  // Log audio status for debugging
  if (!audioUrl) {
    console.warn(`[${videoId}] WARNING: No audio generated — video will be silent`)
    // Store a note in the DB so the user knows
    await supabase
      .from('generated_videos')
      .update({ error_message: 'Audio generation failed — video may be silent. ElevenLabs and Google TTS both unavailable.' })
      .eq('id', videoId)
  }

  await updateProgress(supabase, videoId, 'Finding matching footage...', 30)
  // ── Step 2: Pexels stock footage (smart multi-query search) ──────────────
  const videoClips: string[] = []

  // Check for user-uploaded footage clips (either at clipPrefix or videoId path)
  const clipPath = clipPrefix ? `${clipPrefix}/clips` : `${videoId}/clips`
  const { data: userClips } = await supabase.storage
    .from('generated-videos')
    .list(clipPath, { limit: 10 })
  if (userClips && userClips.length > 0) {
    for (const clip of userClips.filter(c => c.name.endsWith('.mp4'))) {
      const { data: urlData } = supabase.storage
        .from('generated-videos')
        .getPublicUrl(`${clipPath}/${clip.name}`)
      if (urlData?.publicUrl) videoClips.push(urlData.publicUrl)
    }
    console.log(`[${videoId}] Found ${videoClips.length} user-uploaded clips`)
  }

  if (pexelsKey && videoClips.length === 0) {
    // Limit clips — render server has 512MB RAM, can only handle 2-3 clips
    const maxClips = pacing === 'fast' ? 3 : 2

    // Extract visual keywords from the script for smarter search
    const scriptKeywords = extractVisualKeywords(spokenText, videoType)

    // Search with multiple queries for variety
    const queries = [
      scriptKeywords,
      VIDEO_TYPE_SEARCH[videoType] ?? 'tree service arborist',
    ]

    for (const query of queries) {
      if (videoClips.length >= maxClips) break
      const remaining = maxClips - videoClips.length
      const pexelsResp = await fetchWithTimeout(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${remaining + 2}&orientation=portrait&size=medium`,
        { headers: { Authorization: pexelsKey } },
      )

      if (pexelsResp.ok) {
        const pexelsData = await pexelsResp.json()
        for (const video of (pexelsData.videos ?? []).slice(0, remaining)) {
          const bestFile = video.video_files?.find((f: any) => f.quality === 'sd' && f.height >= 720)
            ?? video.video_files?.find((f: any) => f.quality === 'sd')
            ?? video.video_files?.find((f: any) => f.quality === 'hd')
            ?? video.video_files?.[0]
          if (bestFile?.link && !videoClips.includes(bestFile.link)) {
            videoClips.push(bestFile.link)
          }
        }
      }
    }
  }

  // Estimate total duration from spoken text (~2.5 words/sec for natural pacing)
  const wordCount = spokenText.split(/\s+/).length
  const estimatedDuration = Math.max(20, Math.min(60, Math.round(wordCount / 2.5)))

  await updateProgress(supabase, videoId, 'Rendering video...', 50)
  // ── Step 3: Render via Creatomate (cloud) → fallback to self-hosted FFmpeg ──
  let rendered = false

  if (creatomateKey) {
    try {
      await renderViaCreatomate(
        supabase, creatomateKey, videoId, videoClips, audioUrl,
        spokenText, companyName, estimatedDuration, supabaseUrl, captionStyle,
      )
      rendered = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Creatomate failed, falling back to self-hosted:', msg)
    }
  }

  if (!rendered && renderServerUrl) {
    await renderViaSelfHosted(
      supabase, renderServerUrl, videoId, videoClips, audioUrl,
      spokenText, companyName, estimatedDuration, supabaseUrl,
    )
    rendered = true
  }

  if (!rendered) {
    throw new Error('No render backend available. Creatomate credits exhausted and no RENDER_SERVER_URL configured.')
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
  captionStyle: string = 'bold',
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

  // Caption style presets
  const captionPresets: Record<string, Record<string, string>> = {
    bold: {
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
    },
    minimal: {
      font_family: 'Inter',
      font_weight: '500',
      font_size: '5 vmin',
      fill_color: 'rgba(255,255,255,0.9)',
      stroke_color: 'rgba(0,0,0,0.6)',
      stroke_width: '0.8 vmin',
    },
    subtitle: {
      font_family: 'Inter',
      font_weight: '600',
      font_size: '5.5 vmin',
      fill_color: '#ffffff',
      stroke_color: '#000000',
      stroke_width: '0.5 vmin',
      background_color: 'rgba(0,0,0,0.7)',
      background_x_padding: '20%',
      background_y_padding: '10%',
      background_border_radius: '10%',
    },
  }
  const capStyle = captionPresets[captionStyle] ?? captionPresets.bold

  const captionElements = sentences.slice(0, maxSegs).map((text, i) => ({
    type: 'text',
    text: text.length > 80 ? text.slice(0, 77) + '...' : text,
    time: i * segDuration,
    duration: segDuration,
    y: captionStyle === 'subtitle' ? '92%' : '85%',
    width: '90%',
    x_alignment: '50%',
    ...capStyle,
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

  // Add audio track if we have a voiceover URL
  if (audioUrl) {
    elements.push({
      type: 'audio',
      source: audioUrl,
      time: 0,
      duration: totalDuration,
    })
  }
  // No fallback — Creatomate doesn't support built-in TTS on audio elements
  // No fallback — Creatomate doesn't support built-in TTS on audio elements

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
  const renderResp = await fetchWithTimeout('https://api.creatomate.com/v1/renders', {
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
