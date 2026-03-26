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

// Health check
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'canopy-render' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Main render endpoint
app.post('/render', async (req, res) => {
  const {
    videoId,
    audioUrl,
    videoClips,
    captionSegments,
    watermarkText,
    totalDuration,
    webhookUrl,
    supabaseUrl,
    supabaseKey,
  } = req.body;

  if (!videoId || !videoClips?.length) {
    return res.status(400).json({ error: 'Missing videoId or videoClips' });
  }

  // Respond immediately — render async
  res.json({ status: 'processing', videoId });

  const jobDir = path.join(TMP, videoId);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download all assets in parallel
    const downloads = [];

    // Download video clips
    const clipPaths = [];
    for (let i = 0; i < videoClips.length; i++) {
      const clipPath = path.join(jobDir, `clip_${i}.mp4`);
      clipPaths.push(clipPath);
      downloads.push(downloadFile(videoClips[i], clipPath));
    }

    // Download audio if available
    let audioPath = null;
    if (audioUrl) {
      audioPath = path.join(jobDir, 'voiceover.mp3');
      downloads.push(downloadFile(audioUrl, audioPath));
    }

    await Promise.all(downloads);

    // Step 1: Normalize all clips to same resolution/format and trim to equal duration
    const clipDuration = Math.max(3, Math.floor((totalDuration || 30) / clipPaths.length));
    const normalizedPaths = [];

    for (let i = 0; i < clipPaths.length; i++) {
      const normPath = path.join(jobDir, `norm_${i}.mp4`);
      normalizedPaths.push(normPath);
      await normalizeClip(clipPaths[i], normPath, clipDuration);
    }

    // Step 2: Create concat file for FFmpeg
    const concatFile = path.join(jobDir, 'concat.txt');
    const concatContent = normalizedPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    // Step 3: Concatenate clips
    const concatOutput = path.join(jobDir, 'concat.mp4');
    await concatClips(concatFile, concatOutput);

    // Step 4: Build FFmpeg filter for captions + watermark + audio
    const finalOutput = path.join(jobDir, `final_${videoId}.mp4`);
    await composeFinal(concatOutput, audioPath, captionSegments, watermarkText, totalDuration, finalOutput);

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
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        '-an',  // Strip audio from clips — we use voiceover
        '-preset', 'fast',
        '-crf', '23',
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
    let cmd = ffmpeg(videoPath);

    // Trim to total duration
    cmd = cmd.inputOptions([`-t ${totalDuration || 30}`]);

    // Add audio input if available
    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    // Build filter complex for captions + watermark
    const filters = [];
    let lastLabel = '0:v';

    // Add watermark text (top-left)
    if (watermarkText) {
      const escaped = watermarkText.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      filters.push(
        `[${lastLabel}]drawtext=text='${escaped}':fontsize=28:fontcolor=white@0.8:x=30:y=40:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:borderw=2:bordercolor=black@0.5[wm]`
      );
      lastLabel = 'wm';
    }

    // Add caption segments (centered bottom)
    if (captionSegments?.length) {
      captionSegments.forEach((seg, i) => {
        const escaped = seg.text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
        const startTime = seg.startTime || 0;
        const endTime = startTime + (seg.duration || 5);
        const outLabel = `cap${i}`;
        filters.push(
          `[${lastLabel}]drawtext=text='${escaped}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=h-200:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:borderw=3:bordercolor=black@0.7:enable='between(t,${startTime},${endTime})'[${outLabel}]`
        );
        lastLabel = outLabel;
      });
    }

    if (filters.length > 0) {
      cmd = cmd.complexFilter(filters, lastLabel);
    }

    // Output settings
    const outputOpts = [
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      `-t`, `${totalDuration || 30}`,
    ];

    if (audioPath) {
      outputOpts.push('-map', `${filters.length > 0 ? `[${lastLabel}]` : '0:v'}`, '-map', '1:a', '-shortest');
    } else if (filters.length > 0) {
      outputOpts.push('-map', `[${lastLabel}]`);
    }

    cmd
      .outputOptions(outputOpts)
      .videoCodec('libx264')
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Canopy render server running on port ${PORT}`);
});
