# YouTube Library — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Overview

A personal, single-user web application for downloading YouTube videos as MP4s, storing them on a Linux VPS, and accessing them from any device via a browser. Features include in-browser streaming, local download, tagging, search, and full video metadata display.

## Architecture

Single monolith: a FastAPI application that serves both the REST API and the pre-built React frontend as static files. `yt-dlp` runs as FastAPI background tasks. SQLite stores all metadata. MP4 files are stored in a `/videos/` directory on disk.

```
[ Browser (React UI) ]
        ↕ HTTP/REST + video streaming
[ FastAPI App ]
    ├── /api/download     → yt-dlp background task queue
    ├── /api/videos       → video library CRUD
    ├── /api/tags         → tag management
    ├── /stream/{id}      → HTTP range-request video streaming
    └── /static           → serves built React app
        ↕
[ SQLite DB ]            [ /videos/ folder on disk ]
```

**Deployment:** Docker + docker-compose on a Linux VPS. Two containers: `app` (FastAPI + React, port 8000) and Nginx reverse proxy (port 80/443, SSL). Videos and SQLite DB stored in Docker volumes mapped to the host for persistence.

## UI Design

**Theme:** Light background, white cards, red accent color (`#ff4444`), clean and minimal.

**Pages:**

- **home** — tag pill filters across the top (All + each tag), video grid below. Each card shows thumbnail, title, channel, duration, file size, and tags. Clicking opens the player.
- **Player** — full-width HTML5 video player streaming from `/stream/{id}`. Below: title, channel, duration, file size, original YouTube URL, download date, tag editor, and a "Download MP4" button.
- **Download modal** — triggered by `+ Download` in the nav. Paste a YouTube URL, submit, watch live progress bar. On completion, add tags before the video is added to the library.

**Nav bar:** App name (left) | Search bar (center) | `+ Download` button (right).

## Components

### Backend (FastAPI)

| Module | Responsibility |
|---|---|
| `main.py` | App entry point, mounts static files, includes routers |
| `routers/videos.py` | GET /api/videos, GET /api/videos/{id}, PATCH /api/videos/{id}/tags, DELETE /api/videos/{id} |
| `routers/download.py` | POST /api/download, GET /api/download/{job_id}/status |
| `routers/tags.py` | GET /api/tags |
| `routers/stream.py` | GET /stream/{id} — range-request file streaming |
| `db.py` | SQLite connection, schema init |
| `models.py` | SQLAlchemy models |
| `downloader.py` | yt-dlp wrapper, runs as background task, updates job status |

### Frontend (React + Vite + Framer Motion)

| Component | Responsibility |
|---|---|
| `App.tsx` | Router setup (library / player routes) |
| `NavBar.tsx` | Search input, Download button, Download modal trigger |
| `LibraryPage.tsx` | Tag pill filters, video grid |
| `VideoCard.tsx` | Thumbnail, title, channel, duration, file size, tags |
| `PlayerPage.tsx` | Video player, metadata, tag editor, download button |
| `DownloadModal.tsx` | URL input, progress bar, tag input on completion |
| `api.ts` | All fetch calls to FastAPI |

## Database Schema

```sql
videos
  id            INTEGER PRIMARY KEY
  title         TEXT NOT NULL
  channel       TEXT
  duration      INTEGER        -- seconds
  file_size     INTEGER        -- bytes
  file_path     TEXT NOT NULL  -- absolute path on disk
  thumbnail     TEXT           -- YouTube thumbnail URL (stored as-is, not downloaded)
  yt_url        TEXT NOT NULL  -- original YouTube URL
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP

tags
  id    INTEGER PRIMARY KEY
  name  TEXT UNIQUE NOT NULL

video_tags
  video_id  INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
  PRIMARY KEY (video_id, tag_id)

download_jobs
  id         TEXT PRIMARY KEY     -- UUID
  yt_url     TEXT NOT NULL
  status     TEXT NOT NULL        -- pending | downloading | done | failed
  progress   INTEGER DEFAULT 0   -- 0–100
  error      TEXT
  video_id   INTEGER REFERENCES videos(id)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

## Data Flow

### Downloading a video
1. User pastes YouTube URL → POST `/api/download` → returns `job_id`
2. FastAPI background task runs `yt-dlp`, writes MP4 to `/videos/`
3. UI polls GET `/api/download/{job_id}/status` every 2 seconds, shows progress bar
4. On completion: metadata extracted and saved to SQLite, video appears in library
5. User optionally adds tags in the modal before dismissing

### Streaming a video
1. User clicks a video card → navigates to `/player/{id}`
2. GET `/api/videos/{id}` fetches metadata
3. HTML5 `<video src="/stream/{id}">` streams the file
4. FastAPI serves with HTTP range request support — seeking works natively

### Tagging
- Tags are free-text strings, stored in `tags` with a many-to-many join via `video_tags`
- Add/remove tags via PATCH `/api/videos/{id}/tags` (replaces full tag list)
- Filter library by tag: GET `/api/videos?tag=music`

### Search
- GET `/api/videos?q=searchterm` — SQLite `LIKE` search on `title` and `channel`

## Error Handling

| Scenario | Handling |
|---|---|
| Invalid YouTube URL | yt-dlp errors immediately; shown in download modal |
| Download fails mid-way | Job set to `failed`, error message shown, partial file deleted |
| Video file missing from disk | Player shows "File not found" with re-download option |
| Concurrent downloads | Allowed; each gets its own job ID and progress tracker |

## Development Setup

**Backend:**
```bash
pip install fastapi uvicorn yt-dlp sqlalchemy aiofiles
uvicorn main:app --reload
```

**Frontend:**
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install && npm run dev
# Vite proxies /api/* and /stream/* to http://localhost:8000
```

## Deployment

```yaml
# docker-compose.yml
services:
  app:
    build: .
    volumes:
      - videos:/videos
      - db:/data
    environment:
      - VIDEOS_DIR=/videos
      - DB_PATH=/data/library.db
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - certs:/etc/letsencrypt

volumes:
  videos:
  db:
  certs:
```
