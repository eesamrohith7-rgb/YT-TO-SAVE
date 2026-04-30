# YouTube Video Downloader — SPEC.md

## 1. Project Overview

- **Name**: yt-downloader
- **Type**: Full-stack web application (Express backend + vanilla HTML/CSS/JS frontend)
- **Core functionality**: Download YouTube videos by link in all available qualities (video+audio, video-only, audio-only)
- **Target users**: Anyone who wants to save YouTube videos offline

---

## 2. Technical Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Video processing | `yt-dlp` (active youtube-dl fork) |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Templating | EJS |
| Dev/build | `concurrently` to run server + livereload |

---

## 3. Visual & Rendering Specification

### Theme: Dark Neon
- **Background**: Deep charcoal `#0d0d0f` with subtle radial gradient overlay
- **Primary accent**: Electric cyan `#00e5ff`
- **Secondary accent**: Magenta pink `#ff2d78`
- **Card surface**: `#16161a` with `#1e1e24` hover
- **Text primary**: `#e8e8ec`
- **Text muted**: `#72727a`
- **Border**: `#2a2a32`

### Typography
- **Headings**: `Syne` (Google Fonts) — bold, geometric, futuristic
- **Body**: `DM Sans` — clean, readable
- **Monospace** (URLs, file info): `JetBrains Mono`

### Layout
- Single-page app. Hero section with downloader form. Below: results panel shows format selection + download progress.
- Centered column, max-width 760px
- Smooth entry animations, hover micro-interactions on all interactive elements
- Custom scrollbar

---

## 4. Features & Interactions

### Core Features
1. **URL Input** — Paste any YouTube video/shorts/playlist link
2. **Video Info Fetch** — On submit, fetch metadata: title, thumbnail, duration, available formats
3. **Format Selection** — Grid of quality options grouped by type:
   - `Video + Audio` (combined MP4/WebM)
   - `Video Only` (no audio track)
   - `Audio Only` (MP3/AAC/M4A)
   Each card shows: format label, quality (e.g. 1080p), file size estimate, codec
4. **Download** — Click a format card to start download. Progress bar shows real-time progress via Server-Sent Events (SSE)
5. **Auto-cleanup** — Downloaded temp files deleted after 10 minutes

### Interaction Details
- URL input: paste → auto-submit after 800ms debounce OR press Enter
- Loading state: spinner overlay on the format grid while fetching
- Error state: red banner with specific error message
- Format cards: glow on hover, selected state with cyan border
- Progress bar: animated gradient fill, percentage + speed + ETA

### Error Handling
- Invalid URL → "Please enter a valid YouTube URL"
- Video unavailable/private/deleted → "This video is unavailable or private"
- Network error → "Could not connect. Check your internet connection"
- yt-dlp error → Show the raw error message from yt-dlp

---

## 5. Backend API Design

### Endpoints

#### `POST /api/info`
Fetch video metadata and available formats.
- **Body**: `{ url: string }`
- **Response 200**:
  ```json
  {
    "id": "dQw4w9WgXcQ",
    "title": "Video Title",
    "thumbnail": "https://i.ytimg.com/...",
    "duration": 212,
    "channel": "Channel Name",
    "viewCount": "1.2M",
    "formats": [
      {
        "format_id": "137",
        "format_note": "1080p",
        "ext": "mp4",
        "filesize": "250MB",
        "type": "video",
        "vcodec": "avc1.640028",
        "acodec": null,
        "quality": "1080p"
      }
    ]
  }
  ```

#### `GET /api/download/:id/:format_id`
Start download, returns SSE stream for progress.
- **Response**: `Content-Type: text/event-stream`
  ```
  event: progress
  data: {"percent": 45, "speed": "2.5MB/s", "eta": "30s"}

  event: done
  data: {"filepath": "/tmp/yt-dlp/abc123.mp4"}

  event: error
  data: {"message": "Download failed"}
  ```

#### `GET /api/file/:filename`
Serve the downloaded file for browser download.

---

## 6. File Structure

```
yt-downloader/
├── SPEC.md
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## 7. Acceptance Criteria

- [ ] User can paste a YouTube URL and see video metadata
- [ ] User can select from multiple quality/format options
- [ ] Download starts with real-time progress bar
- [ ] Browser downloads the file when complete
- [ ] All errors display clear, actionable messages
- [ ] UI is fully responsive and visually polished
- [ ] Temp files are cleaned up automatically