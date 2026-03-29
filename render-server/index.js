const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '10mb' }));

const TMP = '/tmp/renders';
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const RENDER_API_KEY = process.env.RENDER_API_KEY;

// API key auth middleware — skips health checks
function requireApiKey(req, res, next) {
  if (!RENDER_API_KEY) return next(); // skip if not configured (dev mode)
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (key !== RENDER_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

// Health check (no auth required)
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'canopy-render' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Main render endpoint
app.post('/render', requireApiKey, async (req, res) => {
  const {
    videoId,
    audioUrl,
    videoClips,
    captionSegments,
    watermarkText,
    totalDuration,
    textOnly,
    webhookUrl,
    supabaseUrl,
    supabaseKey,
  } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId' });
  }
  if (!textOnly && (!videoClips || !videoClips.length)) {
    return res.status(400).json({ error: 'Missing videoClips (set textOnly=true for black background mode)' });
  }

  // Respond immediately — render async
  res.json({ status: 'processing', videoId });

  const jobDir = path.join(TMP, videoId);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const progress = async (step, pct) => {
      try { await supabase.from('generated_videos').update({ progress_step: step, progress_percent: pct }).eq('id', videoId); } catch {}
      console.log(`[${videoId}] ${step} (${pct}%)`);
    };

    // Download audio if available
    let audioPath = null;
    if (audioUrl) {
      await progress('Downloading voiceover...', 55);
      audioPath = path.join(jobDir, 'voiceover.mp3');
      await downloadFile(audioUrl, audioPath);
    }

    let concatOutput;

    if (textOnly || !videoClips?.length) {
      // ── TEXT-ONLY MODE: Black background ──────────────────────────────
      await progress('Creating text background...', 60);
      concatOutput = path.join(jobDir, 'black.mp4');
      const { execFileSync } = require('child_process');
      execFileSync('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${totalDuration || 30}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p',
        concatOutput,
      ], { maxBuffer: 10 * 1024 * 1024 });
    } else {
      // ── CLIPS MODE: Download + process user clips ────────────────────
      await progress('Downloading footage clips...', 55);
      const downloads = [];
      const clipsToUse = videoClips.slice(0, 6);
      const clipPaths = [];

      for (let i = 0; i < clipsToUse.length; i++) {
        const clipPath = path.join(jobDir, `clip_${i}.mp4`);
        clipPaths.push(clipPath);
        downloads.push(downloadFile(clipsToUse[i], clipPath));
      }

      await Promise.all(downloads);
      await progress('Processing video clips...', 65);

      // Normalize all clips to same resolution/format
      const clipDuration = Math.max(3, Math.floor((totalDuration || 30) / clipPaths.length));
      const normalizedPaths = [];

      for (let i = 0; i < clipPaths.length; i++) {
        const normPath = path.join(jobDir, `norm_${i}.mp4`);
        normalizedPaths.push(normPath);
        await normalizeClip(clipPaths[i], normPath, clipDuration);
      }

      // Concatenate clips
      const concatFile = path.join(jobDir, 'concat.txt');
      const concatContent = normalizedPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      concatOutput = path.join(jobDir, 'concat.mp4');
      await concatClips(concatFile, concatOutput);
    }

    await progress('Adding captions and watermark...', 75);
    // Step 4: Build FFmpeg filter for captions + watermark + audio
    const finalOutput = path.join(jobDir, `final_${videoId}.mp4`);
    await composeFinal(concatOutput, audioPath, captionSegments, watermarkText, totalDuration, finalOutput);

    await progress('Uploading final video...', 90);
    // Step 5: Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(finalOutput);
    const storagePath = `videos/${videoId}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('generated-videos')
      .upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-videos')
      .getPublicUrl(storagePath);

    // Update DB
    await supabase
      .from('generated_videos')
      .update({ status: 'ready', video_url: publicUrl })
      .eq('id', videoId);

    // Notify webhook
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'succeeded',
          url: publicUrl,
          metadata: JSON.stringify({ videoId }),
        }),
      }).catch(() => {});
    }

    console.log(`[${videoId}] Render complete: ${publicUrl}`);
  } catch (err) {
    console.error(`[${videoId}] Render failed:`, err.message);

    // Update DB with failure
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from('generated_videos')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', videoId);
    } catch {}

    // Notify webhook of failure
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'failed',
          error_message: err.message,
          metadata: JSON.stringify({ videoId }),
        }),
      }).catch(() => {});
    }
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(jobDir, { recursive: true, force: true });
    } catch {}
  }
});

// ── Helper functions ──────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);

    const request = (url) => {
      proto.get(url, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          file.close();
          return reject(new Error(`Download failed: ${response.statusCode} for ${url}`));
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', (err) => {
        file.close();
        reject(err);
      });
    };

    request(url);
  });
}

function normalizeClip(input, output, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .inputOptions([`-t ${duration}`])
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        // Full 1080x1920 on local M4 Mac Mini — plenty of power
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        '-an',  // Strip audio from clips — we use voiceover
        '-preset', 'fast',
        '-crf', '26',  // Good quality, keeps file under 50MB for Supabase
      ])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function concatClips(concatFile, output) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function composeFinal(videoPath, audioPath, captionSegments, watermarkText, totalDuration, output) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');

    // Build filter chain for captions + watermark
    const filterParts = [];
    let lastLabel = '0:v';

    if (watermarkText) {
      const esc = watermarkText.replace(/'/g, '').replace(/\\/g, '');
      filterParts.push(`[${lastLabel}]drawtext=text='${esc}':fontsize=36:fontcolor=white:x=40:y=50:borderw=2:bordercolor=black[wm]`);
      lastLabel = 'wm';
    }

    if (captionSegments?.length) {
      captionSegments.forEach((seg, i) => {
        // Truncate to ~40 chars to prevent running off screen
        let text = seg.text.replace(/'/g, '').replace(/\\/g, '');
        if (text.length > 40) text = text.substring(0, 37) + '...';
        const st = seg.startTime || 0;
        const en = st + (seg.duration || 5);
        const out = `cap${i}`;
        filterParts.push(`[${lastLabel}]drawtext=text='${text}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-300:borderw=3:bordercolor=black:enable='between(t,${st},${en})'[${out}]`);
        lastLabel = out;
      });
    }

    // Build FFmpeg args directly — avoids fluent-ffmpeg mangling filters
    const args = ['-y', '-t', `${totalDuration || 30}`, '-i', videoPath];
    if (audioPath) args.push('-i', audioPath);

    if (filterParts.length > 0) {
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', `[${lastLabel}]`);
      if (audioPath) args.push('-map', '1:a', '-shortest');
    } else {
      if (audioPath) args.push('-map', '0:v', '-map', '1:a', '-shortest');
    }

    args.push(
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-b:v', '2M', '-maxrate', '3M', '-bufsize', '4M',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-t', `${totalDuration || 30}`,
      output
    );

    console.log(`[FFmpeg] Running: ffmpeg ${args.join(' ').substring(0, 200)}...`);
    execFile('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[FFmpeg stderr]', stderr?.substring(stderr.length - 500));
        reject(new Error(`ffmpeg failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Canopy render server running on port ${PORT}`);
});
