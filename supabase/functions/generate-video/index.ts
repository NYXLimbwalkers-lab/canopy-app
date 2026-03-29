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

// Multiple search queries per type — picks randomly for variety
const VIDEO_TYPE_SEARCH: Record<string, string[]> = {
  satisfying_removal: ['tree cutting chainsaw lumber', 'tree falling timber', 'lumberjack cutting tree forest'],
  before_after:       ['overgrown yard garden cleanup', 'landscaping backyard transformation', 'tree trimming garden beautiful'],
  did_you_know:       ['tree roots forest closeup', 'oak tree bark texture nature', 'tree canopy sunlight leaves'],
  day_in_life:        ['lumberjack working forest', 'tree climbing rope harness', 'outdoor worker morning sunrise'],
  price_transparency: ['contractor talking customer outdoor', 'writing estimate clipboard outdoor', 'home improvement yard work'],
  storm_damage:       ['fallen tree storm damage', 'storm aftermath broken tree house', 'wind damage neighborhood trees'],
  crane_job:          ['crane lifting logs heavy', 'crane construction trees', 'heavy equipment outdoor work'],
  stump_grinding:     ['wood chips flying machine', 'tree stump ground forest', 'sawdust wood cutting closeup'],
  tree_health_tip:    ['tree bark fungus mushroom', 'dead tree leaves falling', 'arborist inspecting tree branches'],
  crew_spotlight:     ['workers outdoor team high five', 'hard hat safety vest crew', 'landscaping crew truck morning'],
  equipment_tour:     ['chainsaw closeup sharp blade', 'truck loaded equipment outdoor', 'power tools workshop garage'],
  seasonal_reminder:  ['autumn leaves falling golden', 'spring garden blooming trees', 'winter snow branches tree'],
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
    const { script, videoType, companyId, captionStyle, pacing, clipPrefix, textOnly, skipStockFootage } = await req.json()

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
  const typeQueries = VIDEO_TYPE_SEARCH[videoType] ?? ['tree service arborist outdoor work']
  return typeQueries[Math.floor(Math.random() * typeQueries.length)]
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
      // Use a specific high-quality male voice for tree service content
      // 'Josh' — deep, natural, conversational American male (great for blue-collar content)
      // Fallback: 'Adam' — another natural male voice
      let voiceId = 'TxGEqnHWrfWFTfGW9XjX' // Josh (default)
      try {
        const voicesResp = await fetchWithTimeout('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': elevenLabsKey },
        })
        if (voicesResp.ok) {
          const voicesData = await voicesResp.json()
          const voices = voicesData.voices ?? []
          // Prefer male voices with 'conversational' or 'narration' use case
          const goodVoice = voices.find((v: any) =>
            v.labels?.gender === 'male' && v.labels?.use_case?.includes('narrat')
          ) ?? voices.find((v: any) =>
            v.labels?.gender === 'male'
          ) ?? voices[0]
          if (goodVoice) voiceId = goodVoice.voice_id
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
            voice_settings: {
              stability: 0.5,           // Balanced — not robotic, not too varied
              similarity_boost: 0.8,    // High voice fidelity
              style: 0.35,             // More expressive conversational style
              use_speaker_boost: true,  // Enhanced clarity for mobile speakers
            },
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

  // Only search Pexels if: not text-only mode, not using own clips, and no clips found
  if (pexelsKey && videoClips.length === 0 && !textOnly && !skipStockFootage) {
    // Creatomate handles rendering — use more clips for variety
    const maxClips = pacing === 'fast' ? 6 : pacing === 'slow' ? 3 : 4

    // Extract visual keywords from the script for smarter search
    const scriptKeywords = extractVisualKeywords(spokenText, videoType)

    // Search with multiple queries for variety
    const queries = [
      scriptKeywords,
      (VIDEO_TYPE_SEARCH[videoType] ?? ['tree service arborist'])[Math.floor(Math.random() * (VIDEO_TYPE_SEARCH[videoType]?.length ?? 1))],
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
          // Use HD quality — Creatomate handles rendering so we want the best source footage
          const bestFile = video.video_files?.find((f: any) => f.quality === 'hd' && f.height >= 1080)
            ?? video.video_files?.find((f: any) => f.quality === 'hd')
            ?? video.video_files?.find((f: any) => f.quality === 'sd' && f.height >= 720)
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

  await updateProgress(supabase, videoId, 'Rendering video on local server...', 50)
  // ── Step 3: Render — Mac Mini first (fast, free, 1080p), Creatomate as backup ──
  let rendered = false

  // PRIMARY: Self-hosted render on Mac Mini (free, fast, full quality)
  if (renderServerUrl) {
    try {
      await renderViaSelfHosted(
        supabase, renderServerUrl, videoId, videoClips, audioUrl,
        spokenText, companyName, estimatedDuration, supabaseUrl,
      )
      rendered = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Local render failed, trying Creatomate:', msg)
    }
  }

  // BACKUP: Creatomate cloud (if local server is down)
  if (!rendered && creatomateKey) {
    try {
      await renderViaCreatomate(
        supabase, creatomateKey, videoId, videoClips, audioUrl,
        spokenText, companyName, estimatedDuration, supabaseUrl, captionStyle,
      )
      rendered = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Creatomate also failed:', msg)
    }
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
  // ═══════════════════════════════════════════════════════════════════════════
  // CINEMATIC VIDEO COMPOSITION — Professional-grade output
  // ═══════════════════════════════════════════════════════════════════════════

  const INTRO_DUR = 2.5    // Intro card duration
  const OUTRO_DUR = 3      // Outro card duration
  const FADE = 0.5         // Crossfade between clips
  const fullDuration = INTRO_DUR + totalDuration + OUTRO_DUR

  const clipDuration = videoClips.length > 0
    ? totalDuration / videoClips.length
    : totalDuration

  const elements: any[] = []

  // ── 1. INTRO CARD — Company name + video type with cinematic fade-in ────
  elements.push({
    type: 'composition',
    time: 0,
    duration: INTRO_DUR,
    elements: [
      // Dark gradient background
      {
        type: 'shape',
        path: 'M 0 0 L 1080 0 L 1080 1920 L 0 1920 Z',
        fill_color: '#0A0F0D',
      },
      // Company name — large, fades in
      {
        type: 'text',
        text: companyName.toUpperCase(),
        y: '42%',
        width: '80%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Montserrat',
        font_weight: '800',
        font_size: '10 vmin',
        fill_color: '#FFFFFF',
        letter_spacing: '0.5 vmin',
        enter: { effect: 'fade', duration: 0.8 },
      },
      // Accent line
      {
        type: 'shape',
        path: 'M 390 990 L 690 990',
        stroke_color: '#40916C',
        stroke_width: 4,
        enter: { effect: 'fade', duration: 0.5, delay: 0.4 },
      },
      // Tagline
      {
        type: 'text',
        text: 'Professional Tree Service',
        y: '55%',
        width: '80%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Inter',
        font_weight: '400',
        font_size: '4.5 vmin',
        fill_color: 'rgba(255,255,255,0.6)',
        letter_spacing: '0.8 vmin',
        enter: { effect: 'fade', duration: 0.6, delay: 0.6 },
      },
    ],
  })

  // ── 2. VIDEO CLIPS — Ken Burns zoom + crossfade transitions ─────────────
  videoClips.forEach((url, i) => {
    const clipStart = INTRO_DUR + (i * clipDuration)
    // Alternate between zoom-in and slight pan for cinematic feel
    const isZoomIn = i % 2 === 0
    const scaleFrom = isZoomIn ? '100%' : '115%'
    const scaleTo = isZoomIn ? '120%' : '100%'
    // Slight vertical drift
    const yFrom = isZoomIn ? '50%' : '45%'
    const yTo = isZoomIn ? '45%' : '52%'

    elements.push({
      type: 'video',
      source: url,
      time: clipStart,
      duration: clipDuration,
      trim_start: 0,
      trim_duration: clipDuration,
      // Fill the 9:16 frame — crop to fit, no letterboxing
      fit: 'cover',
      // Ken Burns: animate scale + position
      animations: [
        {
          easing: 'linear',
          type: 'scale',
          scope: 'element',
          start_scale: scaleFrom,
          end_scale: scaleTo,
          fade: false,
        },
      ],
      // Crossfade in (except first clip)
      enter: i > 0 ? { effect: 'crossfade', duration: FADE } : { effect: 'fade', duration: 0.3 },
    })
  })

  // ── 3. DARK GRADIENT OVERLAY (bottom) — Makes captions readable ─────────
  elements.push({
    type: 'shape',
    path: 'M 0 1400 L 1080 1400 L 1080 1920 L 0 1920 Z',
    fill_color: 'linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)',
    time: INTRO_DUR,
    duration: totalDuration,
  })

  // ── 4. ANIMATED CAPTIONS — Phrase-by-phrase with pop-in effect ──────────
  const sentences = spokenText.split(/(?<=[.!?])\s+/).filter(s => s.length > 5)
  const maxSegs = Math.min(sentences.length, 8)
  const segDuration = totalDuration / maxSegs

  const captionPresets: Record<string, any> = {
    bold: {
      font_family: 'Montserrat',
      font_weight: '800',
      font_size: '7 vmin',
      fill_color: '#ffffff',
      stroke_color: '#000000',
      stroke_width: '1.2 vmin',
    },
    minimal: {
      font_family: 'Inter',
      font_weight: '500',
      font_size: '5.5 vmin',
      fill_color: '#ffffff',
      stroke_color: 'rgba(0,0,0,0.5)',
      stroke_width: '0.6 vmin',
    },
    subtitle: {
      font_family: 'Inter',
      font_weight: '600',
      font_size: '5 vmin',
      fill_color: '#ffffff',
      background_color: 'rgba(0,0,0,0.75)',
      background_x_padding: '25%',
      background_y_padding: '12%',
      background_border_radius: '8%',
    },
  }
  const capStyle = captionPresets[captionStyle] ?? captionPresets.bold

  sentences.slice(0, maxSegs).forEach((text, i) => {
    const capText = text.length > 70 ? text.slice(0, 67) + '...' : text
    elements.push({
      type: 'text',
      text: capText,
      time: INTRO_DUR + (i * segDuration),
      duration: segDuration,
      y: '82%',
      width: '88%',
      x_alignment: '50%',
      y_alignment: '50%',
      line_height: '140%',
      ...capStyle,
      // Animated entrance/exit
      enter: { effect: 'text-slide', duration: 0.3, split: 'word' },
      exit: { effect: 'fade', duration: 0.2 },
    })
  })

  // ── 5. WATERMARK — Subtle company name, top-left ────────────────────────
  elements.push({
    type: 'text',
    text: companyName,
    time: INTRO_DUR,
    duration: totalDuration,
    x: '4%',
    y: '3%',
    font_family: 'Montserrat',
    font_weight: '600',
    font_size: '3.5 vmin',
    fill_color: 'rgba(255,255,255,0.5)',
    stroke_color: 'rgba(0,0,0,0.3)',
    stroke_width: '0.3 vmin',
  })

  // ── 6. OUTRO CARD — CTA with company name ──────────────────────────────
  elements.push({
    type: 'composition',
    time: INTRO_DUR + totalDuration,
    duration: OUTRO_DUR,
    elements: [
      {
        type: 'shape',
        path: 'M 0 0 L 1080 0 L 1080 1920 L 0 1920 Z',
        fill_color: '#0A0F0D',
      },
      {
        type: 'text',
        text: companyName.toUpperCase(),
        y: '38%',
        width: '80%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Montserrat',
        font_weight: '800',
        font_size: '9 vmin',
        fill_color: '#FFFFFF',
        enter: { effect: 'fade', duration: 0.6 },
      },
      {
        type: 'text',
        text: 'Call for a FREE Estimate',
        y: '52%',
        width: '80%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Montserrat',
        font_weight: '700',
        font_size: '6 vmin',
        fill_color: '#40916C',
        enter: { effect: 'fade', duration: 0.5, delay: 0.3 },
      },
      {
        type: 'text',
        text: '🌳 Licensed & Insured · Available 24/7',
        y: '62%',
        width: '80%',
        x_alignment: '50%',
        y_alignment: '50%',
        font_family: 'Inter',
        font_weight: '400',
        font_size: '4 vmin',
        fill_color: 'rgba(255,255,255,0.6)',
        enter: { effect: 'fade', duration: 0.5, delay: 0.6 },
      },
    ],
  })

  // ── 7. AUDIO — Voiceover (starts after intro) ──────────────────────────
  if (audioUrl) {
    elements.push({
      type: 'audio',
      source: audioUrl,
      time: INTRO_DUR, // Start after intro card
      duration: totalDuration,
      volume: '100%',
    })
  }

  const source = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: fullDuration,
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
    text: text.length > 40 ? text.slice(0, 37) + '...' : text,
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
      textOnly: textOnly || false,
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
