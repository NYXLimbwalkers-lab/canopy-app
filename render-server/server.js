const express = require('express');
const { execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Simple queue — max 1 concurrent render (free tier has limited RAM)
let rendering = false;
const queue = [];

function processQueue() {
  if (rendering || queue.length === 0) return;
  rendering = true;
  const job = queue.shift();
  renderVideo(job)
    .catch(err => callWebhook(job.webhookUrl, job.videoId, null, err.message))
    .finally(() => {
      cleanupDir(job.workDir);
      rendering = false;
      processQueue();
    });
}

app.get('/health', (req, res) => res.json({ ok: true, queue: queue.length, rendering }));

app.post('/render', (req, res) => {
  const job = req.body;
  if (!job.videoId) return res.status(400).json({ error: 'Missing videoId' });

  job.workDir = path.join('/tmp', `render-${job.videoId}`);
  queue.push(job);
  res.status(202).json({ status: 'queued', position: queue.length });
  processQueue();
});

async function renderVideo(job) {
  const {
    videoId, audioUrl, videoClips = [], captionSegments = [],
    watermarkText = '', totalDuration = 30,
    webhookUrl, supabaseUrl, supabaseKey,
  } = job;
  const dir = job.workDir;

  fs.mkdirSync(dir, { recursive: true });

  // Download assets
  const clipPaths = [];
  for (let i = 0; i < videoClips.length; i++) {
    const clipPath = path.join(dir, `clip${i}.mp4`);
    await downloadFile(videoClips[i], clipPath);
    clipPaths.push(clipPath);
  }

  let audioPath = null;
  if (audioUrl) {
    audioPath = path.join(dir, 'audio.mp3');
    await downloadFile(audioUrl, audioPath);
  }

  const outputPath = path.join(dir, 'output.mp4');

  // Build FFmpeg command
  const args = buildFFmpegArgs({
    clipPaths, audioPath, captionSegments, watermarkText,
    totalDuration, outputPath,
  });

  console.log(`[${videoId}] Starting FFmpeg render (${totalDuration}s, ${clipPaths.length} clips)`);
  await execFileAsync('ffmpeg', args, { timeout: 300000 }); // 5 min timeout
  console.log(`[${videoId}] Render complete`);

  // Upload to Supabase Storage
  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileBuffer = fs.readFileSync(outputPath);
  const storagePath = `videos/${videoId}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from('generated-videos')
    .upload(storagePath, fileBuffer, { contentType: 'video/mp4', upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('generated-videos')
    .getPublicUrl(storagePath);

  console.log(`[${videoId}] Uploaded: ${publicUrl}`);

  // Call webhook
  await callWebhook(webhookUrl, videoId, publicUrl, null);
}

function buildFFmpegArgs({ clipPaths, audioPath, captionSegments, watermarkText, totalDuration, outputPath }) {
  const args = ['-y'];
  const inputs = [];
  const hasClips = clipPaths.length > 0;

  if (hasClips) {
    for (const p of clipPaths) {
      args.push('-i', p);
      inputs.push('video');
    }
  } else {
    // Solid color background fallback
    args.push('-f', 'lavfi', '-i', `color=c=#1A3326:s=1080x1920:d=${totalDuration}:r=30`);
    inputs.push('color');
  }

  if (audioPath) {
    args.push('-i', audioPath);
    inputs.push('audio');
  }

  const audioInputIdx = audioPath ? inputs.length - 1 : -1;
  const filters = [];
  const clipCount = hasClips ? clipPaths.length : 1;
  const crossfade = 0.5;
  const clipDur = Math.round(totalDuration / clipCount) + (hasClips ? 1 : 0); // extra for crossfade overlap

  // Scale and trim each clip
  if (hasClips) {
    for (let i = 0; i < clipCount; i++) {
      filters.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,trim=duration=${clipDur},setpts=PTS-STARTPTS[v${i}]`
      );
    }
  } else {
    filters.push(`[0:v]setpts=PTS-STARTPTS[v0]`);
  }

  // Chain xfade transitions
  let lastLabel = 'v0';
  if (clipCount > 1) {
    let offset = clipDur - crossfade;
    for (let i = 1; i < clipCount; i++) {
      const outLabel = i === clipCount - 1 ? 'merged' : `xf${i - 1}`;
      filters.push(`[${lastLabel}][v${i}]xfade=transition=fade:duration=${crossfade}:offset=${offset.toFixed(2)}[${outLabel}]`);
      lastLabel = outLabel;
      offset += clipDur - crossfade;
    }
  } else {
    filters.push(`[v0]null[merged]`);
    lastLabel = 'merged';
  }

  // Caption overlays
  let capLabel = lastLabel;
  for (let i = 0; i < captionSegments.length; i++) {
    const seg = captionSegments[i];
    const escaped = seg.text.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:').replace(/\\/g, '\\\\');
    const endTime = seg.startTime + seg.duration;
    const outLabel = `cap${i}`;
    filters.push(
      `[${capLabel}]drawtext=text='${escaped}':enable='between(t,${seg.startTime.toFixed(2)},${endTime.toFixed(2)})':fontfile=${FONT}:fontsize=48:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.72[${outLabel}]`
    );
    capLabel = outLabel;
  }

  // Watermark
  if (watermarkText) {
    const escaped = watermarkText.replace(/[🌳]/g, '').trim().replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
    const outLabel = 'out';
    filters.push(
      `[${capLabel}]drawtext=text='${escaped}':fontfile=${FONT}:fontsize=28:fontcolor=white@0.85:borderw=2:bordercolor=black:x=40:y=40[${outLabel}]`
    );
    capLabel = outLabel;
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', `[${capLabel}]`);

  if (audioInputIdx >= 0) {
    args.push('-map', `${audioInputIdx}:a`);
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(totalDuration),
    '-movflags', '+faststart',
    '-shortest',
    outputPath
  );

  return args;
}

async function downloadFile(url, dest) {
  await execFileAsync('curl', ['-L', '-s', '-o', dest, url], { timeout: 60000 });
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    throw new Error(`Download failed: ${url}`);
  }
}

async function callWebhook(webhookUrl, videoId, url, errorMessage) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        url
          ? { status: 'succeeded', url, metadata: JSON.stringify({ videoId }) }
          : { status: 'failed', error_message: errorMessage, metadata: JSON.stringify({ videoId }) }
      ),
    });
  } catch (err) {
    console.error(`Webhook call failed for ${videoId}:`, err.message);
  }
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

app.listen(PORT, () => console.log(`Render server listening on port ${PORT}`));
