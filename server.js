const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', __dirname);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const TMP_DIR = path.join(__dirname, 'tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Cleanup old temp files every 10 minutes
setInterval(() => {
  const now = Date.now();
  fs.readdirSync(TMP_DIR).forEach(file => {
    const fpath = path.join(TMP_DIR, file);
    const stat = fs.statSync(fpath);
    if (now - stat.mtimeMs > 10 * 60 * 1000) {
      fs.unlinkSync(fpath);
    }
  });
}, 10 * 60 * 1000);

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
    return res.status(400).json({ error: 'Please enter a valid YouTube URL' });
  }

  try {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--flat-playlist',
      url
    ]);

    let data = '';
    let errorData = '';

    ytdlp.stdout.on('data', chunk => { data += chunk; });
    ytdlp.stderr.on('data', chunk => { errorData += chunk; });

    ytdlp.on('close', code => {
      if (code !== 0) {
        return res.status(400).json({
          error: errorData.includes('is unavailable') || errorData.includes('private')
            ? 'This video is unavailable or private'
            : errorData.includes('network')
            ? 'Could not connect. Check your internet connection'
            : errorData.trim() || 'Failed to fetch video info'
        });
      }

      try {
        const info = JSON.parse(data);
        const formats = groupFormats(info.formats || []);

        res.json({
          id: info.id,
          title: info.title || 'Unknown Title',
          thumbnail: info.thumbnail || '',
          duration: info.duration || 0,
          channel: info.channel || info.uploader || 'Unknown',
          viewCount: formatViewCount(info.view_count),
          formats
        });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse video information' });
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/download/:id/:format_id', (req, res) => {
  const { id, format_id } = req.params;
  const outputPath = path.join(TMP_DIR, `${id}_${format_id}.%(ext)s`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const ytdlp = spawn('yt-dlp', [
    '-f', format_id,
    '-o', outputPath,
    '--downloader=ffmpeg',
    `https://www.youtube.com/watch?v=${id}`,
    '--progress'
  ]);

  let errorData = '';

  ytdlp.stderr.on('data', chunk => {
    errorData += chunk.toString();
    const line = chunk.toString();
        if (!line.includes('[download]')) return;
        const progressMatch = line.match(/(\d+\.?\d*)%/);
        const speedPart = line.match(/at\s+(\S+)/);
        const etaMatch = line.match(/ETA\s+(\d+:\d+)/);

        if (progressMatch) {
          const pct = parseFloat(progressMatch[1]);
          const speed = speedPart ? speedPart[1] : '';
          const eta = etaMatch ? etaMatch[1] : '';
          res.write(`event: progress\ndata: ${JSON.stringify({ percent: Math.min(pct, 99), speed, eta })}\n\n`);
        }
      });

  ytdlp.on('close', code => {
    if (code === 0) {
      const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(`${id}_${format_id}.`));
      const filename = files.find(f => !f.endsWith('.part'));
      if (filename) {
        res.write(`event: done\ndata: ${JSON.stringify({ filename })}\n\n`);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ message: 'Download completed but output file not found' })}\n\n`);
      }
    } else {
      const errOut = errorData.trim() || `Download exited with code ${code}`;
      res.write(`event: error\ndata: ${JSON.stringify({ message: errOut })}\n\n`);
    }
    res.end();
  });

  ytdlp.on('error', err => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    ytdlp.kill();
    res.end();
  });
});

app.get('/api/file/:filename', (req, res) => {
  const filename = req.params.filename.replace(/\.\.\//g, '');
  const filepath = path.join(TMP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filepath, filename, err => {
    if (!err) {
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }, 5000);
    }
  });
});

function groupFormats(formats) {
  const grouped = { videoAudio: [], videoOnly: [], audioOnly: [] };

  formats.forEach(f => {
    const hasVideo = f.vcodec && f.vcodec !== 'none';
    const hasAudio = f.acodec && f.acodec !== 'none';
    const isAudioOnly = !hasVideo && hasAudio;

    if (isAudioOnly) {
      grouped.audioOnly.push(formatEntry(f, 'audio'));
    } else if (hasVideo && hasAudio) {
      grouped.videoAudio.push(formatEntry(f, 'video+audio'));
    } else if (hasVideo && !hasAudio) {
      grouped.videoOnly.push(formatEntry(f, 'video'));
    }
  });

  // Dedupe and sort
  for (const key of Object.keys(grouped)) {
    const seen = new Set();
    grouped[key] = grouped[key].filter(f => {
      if (seen.has(f.format_id)) return false;
      seen.add(f.format_id);
      return true;
    }).sort((a, b) => parseFloat(b.quality) - parseFloat(a.quality));
  }

  return grouped;
}

function formatEntry(f, type) {
  return {
    format_id: f.format_id,
    format_note: f.format_note || '',
    ext: f.ext || 'mp4',
    filesize: f.filesize ? formatFilesize(f.filesize) : null,
    type,
    vcodec: f.vcodec || null,
    acodec: f.acodec || null,
    quality: f.format_note || f.ext || 'unknown',
    resolution: f.width ? `${f.width}x${f.height}` : null
  };
}

function formatFilesize(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatViewCount(count) {
  if (!count) return '';
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B views`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M views`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K views`;
  return `${count} views`;
}

app.listen(PORT, () => {
  console.log(`YT Downloader running on port ${PORT}`);
});