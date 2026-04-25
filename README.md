# ARCH:IVE

A self-hosted video library. Download YouTube videos and store them on your own server — browse and play from any device on your network, no account required.

---

## Table of Contents

1. [What is ARCHIVE?](#what-is-archive)
2. [Architecture](#architecture)
3. [How Downloads Work End-to-End](#how-downloads-work-end-to-end)
4. [Cookie Handling Modes](#cookie-handling-modes)
5. [The YouTube Download Problem: Analysis & Countermeasures](#the-youtube-download-problem-analysis--countermeasures)
6. [Quick Start](#quick-start)
7. [Environment Variables](#environment-variables)
8. [Operational Guidance](#operational-guidance)
9. [Troubleshooting](#troubleshooting)
10. [Development](#development)

---

## What is ARCHIVE?

ARCHIVE is a self-hosted YouTube video archiver and media player. You paste a YouTube URL, ARCHIVE downloads the video at the highest available quality, stores it on your server, and makes it available through a Netflix-style web UI — library view, full-screen player, tag system, and an "Up Next" recommendations panel.

The server owns the files. Playback does not require a YouTube account or internet connection once a video is downloaded.

**Tech stack:** FastAPI (Python) · React + TypeScript · SQLite · yt-dlp · ffmpeg · Nginx · Docker

---

## Architecture

```
Browser
  │
  ▼
Nginx (:5163) ──► FastAPI app (:8000)
                        │
                 ┌──────┴──────────────┐
                 │                     │
              SQLite              /videos (Docker volume)
           (library.db)     (downloaded .mp4 files)
                 │
         download_jobs table
         videos table
         tags / video_tags tables
```

### Components

| Component | Description |
|-----------|-------------|
| **Nginx** | Reverse proxy. Handles HTTP range requests for video streaming with buffering disabled (`proxy_buffering off`). |
| **FastAPI** | Backend API and static file server. Serves the React SPA from `/frontend/dist` when it exists. |
| **SQLite** | Single-file database at `/data/library.db`. A `threading.Lock` serialises all writes; reads are concurrent. |
| **yt-dlp** | YouTube extraction and download engine. Runs in-process via Python bindings. |
| **ffmpeg** | Merges separate video and audio DASH streams into a single `.mp4`. Installed in the container. |
| **React SPA** | Built at image build time, served as static files. Pages: Library (hero + carousel), Player (range-streamed video + Up Next panel), Download modal, Cookies panel. |

### Docker layout

The multi-stage Dockerfile:

1. **Stage 1 (`node:20-alpine`)** — builds the React frontend with `npm run build`.
2. **Stage 2 (`python:3.11-slim`)** — installs Python deps, copies frontend dist, installs ffmpeg **and Node.js 20** from NodeSource.

Node.js is installed into the production image specifically to support yt-dlp's JavaScript runtime for YouTube's `n`-parameter throttling challenge (see below).

The `docker-compose.yml` adds an Nginx container and mounts:
- `videos` — named volume at `/videos` for downloaded files
- `db` — named volume at `/data` for the SQLite database
- `/home/ubuntu/yt-login-artifacts/youtube-cookies.txt` → `/yt-cookies/youtube-cookies.txt:ro` — host-side cookies file (read-only bind mount)

---

## How Downloads Work End-to-End

### 1. Submit

The frontend POSTs `{ url }` to `POST /api/download`. The backend creates a row in `download_jobs` with `status='pending'` and a UUID job ID, then enqueues `run_download(job_id, url)` as a FastAPI `BackgroundTask`.

### 2. Cookie resolution

`run_download` calls `make_temp_cookiefile()`, which copies the active cookies file to a temp path (to avoid race conditions if the file is replaced mid-download), then `get_yt_dlp_cookie_opts()` returns either:

- `{"cookiesfrombrowser": (browser, profile, ...)}` — if `YTDLP_BROWSER` is set (browser-backed mode), or
- `{"cookiefile": "/tmp/archive-cookies-XXXX.txt"}` — if a cookies file exists (file-based mode), or
- `{}` — no cookies (unauthenticated, public-only).

### 3. yt-dlp extraction

yt-dlp is invoked with:

```python
"extractor_args": {"youtube": {"player_client": ["android", "ios", "tv_embedded", "web"]}},
"js_runtimes": {"node": {"path": "/usr/bin/node"}},
"format": "bestvideo+bestaudio/best",   # with ffmpeg present
"merge_output_format": "mp4",
```

- **`android` client first** — the Android player client does not require a PO token for DASH streams. This is the primary workaround for the Proof-of-Origin token requirement that blocks the `web` client (see problem analysis below).
- **`ios` and `tv_embedded` as fallbacks** — HLS and alternate client formats if the Android client fails.
- **`web` as last resort** — unauthenticated web access, most restrictive.
- **Node.js JS runtime** — yt-dlp uses Node.js to execute YouTube's obfuscated JavaScript that computes the `n` parameter (throttling token). Without this, downloads complete successfully but at throttled speed, or stall entirely on some network paths.

### 4. Progress tracking

A `progress_hook` callback updates `download_jobs.progress` (0–99) as chunks arrive. Progress is computed as a weighted percentage across the two DASH streams (video + audio, 50% each). The frontend polls `GET /api/download/{job_id}/status` to show a progress bar.

### 5. Merge and register

When yt-dlp finishes, ffmpeg merges the video and audio streams into `{video_id}.mp4` in `/videos`. The backend then inserts a row into the `videos` table with metadata (title, channel, duration, file size, thumbnail URL, source URL) and updates `download_jobs` to `status='done', progress=100`.

### 6. Playback streaming

`GET /stream/{video_id}` implements byte-range streaming. It reads the `file_path` from the database, parses the `Range` header, and streams 1 MB chunks. The Nginx layer passes `Range` and `If-Range` headers through and has `proxy_buffering off`, so the browser's native `<video>` seek works correctly across the full file.

---

## Cookie Handling Modes

YouTube restricts downloads from server/datacenter IPs. Authenticated cookies tell YouTube the request comes from a real logged-in user, which reduces (but does not eliminate) bot detection. ARCHIVE supports two cookie modes.

### Mode 1: File-based (default operational mode)

A `cookies.txt` file in Netscape/Mozilla format is provided to yt-dlp via `--cookies`. The file can be:

1. **Uploaded through the UI** — the Cookies panel in the download modal lets you upload a `cookies.txt`. The backend saves it to `/data/cookies/youtube-cookies.txt` (primary) and `/data/cookies.txt` (legacy fallback).
2. **Mounted from the host** — the production `docker-compose.yml` bind-mounts `/home/ubuntu/yt-login-artifacts/youtube-cookies.txt` to `/yt-cookies/youtube-cookies.txt`. Set `COOKIES_DIR=/yt-cookies` and the backend reads this file automatically.

Every download copies the active cookies file to a temp path before passing it to yt-dlp, so replacing the file on disk mid-download is safe.

**Exporting cookies:**

- **Chrome/Edge:** [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox:** [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

Export from a browser that is actively logged into YouTube. Cookies expire after weeks or months; re-export when downloads start failing with "Sign in to confirm you're not a bot".

### Mode 2: Browser-backed (optional, host-browser required)

If the Docker host machine has a real browser profile logged into YouTube, you can tell yt-dlp to read cookies directly from that profile:

```env
YTDLP_BROWSER=chrome
YTDLP_BROWSER_PROFILE=Default
# YTDLP_BROWSER_KEYRING=basictext  # optional
# YTDLP_BROWSER_CONTAINER=Default  # Firefox containers only
```

This avoids manual cookie exports because the browser manages login state. **Limitations:**

- The browser profile must exist on the **host running Docker** (not inside the container).
- The profile must stay logged into YouTube; a logged-out profile is no better than no profile.
- Cloud/headless servers rarely have a real browser profile. On a VPS or CI runner this mode will fail.

When `YTDLP_BROWSER` is set it takes precedence over any uploaded file.

### Mode 3: No cookies (unauthenticated)

If neither a browser source nor a cookie file is configured, yt-dlp runs without authentication. Public videos usually work but are more likely to be blocked on datacenter IPs.

### Cookie status API

`GET /api/download/cookies/status` returns the active mode (`browser`, `file`, or `none`), the file path, and the file size.

`POST /api/download/cookies/test` runs a quick `extract_info` (no download) against a test video to verify the cookies are accepted by YouTube.

---

## The YouTube Download Problem: Analysis & Countermeasures

This section documents the real technical journey — what failed, why, and what was done about it.

### Background: why server downloads are harder than local downloads

yt-dlp works instantly on a home machine. The same command on a cloud VPS fails with one of:

```
Sign in to confirm you're not a bot.
This helps protect our community.
```
or silently downloads at 50–80 KB/s (throttled).

YouTube applies multiple overlapping defences against automated download from server infrastructure:

| Defence | Mechanism |
|---------|-----------|
| **IP reputation** | Datacenter ASNs (AWS, DigitalOcean, Hetzner, etc.) are flagged. Requests from these ranges receive stricter bot checks. |
| **`n` parameter throttle** | Every stream URL contains an `n` query parameter that YouTube's JS computes dynamically. If yt-dlp can't solve the same JS challenge, the server throttles the connection to ~50 KB/s. |
| **PO token (Proof of Origin)** | As of 2024–2025, YouTube's `web` player client requires a PO token for DASH format URLs. yt-dlp without a PO token falls back to HLS-only or returns an empty format list. |
| **Bot cookie check** | Even with cookies, if the IP is flagged, YouTube rejects the request unless the cookie session is from an active, trusted account. |

### Phase 1: Initial failure — bare yt-dlp on VPS

Downloads failed immediately after deployment with the bot-detection error. The VPS IP (DigitalOcean datacenter) was flagged at the ASN level.

**Fix:** Added `cookies.txt` support (`60cc00b`). yt-dlp was updated to pass `--cookies cookies.txt` using credentials exported from a local browser session.

### Phase 2: Cookie loading failures in Docker

Even with a cookies file present, yt-dlp still ran without authentication. Two separate issues were found:

1. **Working directory problem** — uvicorn launched from the project root, but the cookies path was resolved relative to `downloader.py`. The container's working directory (`/app`) did not match the expected relative path.

   **Fix:** Changed `.env` loading to use an absolute path relative to `__file__` (`813235a`). Added a fallback that auto-detected `cookies.txt` in the same directory as `downloader.py` (`90e2b69`).

2. **`.env` not loaded** — FastAPI started before `load_dotenv()` was called in some execution paths, so `COOKIES_FILE` was always empty.

   **Fix:** Moved `load_dotenv()` to the top of `main.py` with an absolute path (`a7c61ea`).

### Phase 3: Format selector errors

After cookies worked, downloads failed with:

```
ERROR: requested format is not available
```

The format string `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]` was filtering out everything YouTube returned for the `web` client, which now requires a PO token and only returns HLS (`m3u8`) formats without one.

Filtering `m3u8` left an empty format list. The selector failed even when video was available.

**Fix:** Relaxed the format selector to `bestvideo+bestaudio/best` (`4745de7`). With ffmpeg present, yt-dlp picks the best available stream regardless of container type and merges to MP4.

### Phase 4: `n`-parameter throttling — the Node.js fix

Downloads were completing, but speeds were throttled to unusable levels (~50–80 KB/s) on many videos. Large videos would stall and time out.

YouTube's `n`-parameter is an obfuscated JavaScript challenge embedded in the stream URL. yt-dlp must solve this JS locally to deobfuscate the `n` value and get the unthrottled URL. yt-dlp has a pure-Python JS interpreter for this, but for some newer obfuscation versions it falls back to an external JS runtime.

The Python interpreter was failing silently on these videos — the throttled URL was used instead of the solved one.

**Fixes (`47d7aec`, `ff4111c`):**
- Installed Node.js 20 in the Docker image (via NodeSource).
- Added `"js_runtimes": {"node": {"path": "/usr/bin/node"}}` to yt-dlp options.
- This allows yt-dlp to execute the JavaScript natively when the Python solver fails.

### Phase 5: PO token — the `android` client fix

Even with cookies and Node.js, some videos returned no DASH formats. The `web` client now requires a Proof-of-Origin (PO) token — a short-lived token tied to a browser session — to access DASH stream URLs. Generating a valid PO token from a server context is not reliably possible without a real browser.

**Fix (`ff4111c`):** Switched the primary player client to `android`:

```python
"extractor_args": {"youtube": {"player_client": ["android", "ios", "tv_embedded", "web"]}}
```

The Android YouTube client uses a different API path that does not require a PO token for DASH streams. yt-dlp impersonates this client and receives VP9/AV1/AVC DASH streams up to 4K without needing a token. The `web` client is kept as a last-resort fallback (exercised by the cookies, even if DASH is not available through it).

The earlier attempt used a hard-coded client override that capped formats at 1080p. Removing that override restored 4K format availability.

### Phase 6: `remote_components` causing 0% stall

Downloads would start (`status='downloading'`) but progress never advanced — stuck at 0% indefinitely.

The cause was a yt-dlp option that delegated format resolution to a remote component service. On this server's network path, the remote component requests were timing out silently before any bytes were transferred, so the download appeared to start but never progressed.

**Fix (`95bc4f9`):** Removed `remote_components` from yt-dlp options entirely. yt-dlp resolves formats locally. Downloads immediately started reporting progress.

### Current stable configuration

The combination of all the above countermeasures produces reliable downloads:

| Countermeasure | Solves |
|----------------|--------|
| `cookies.txt` from a real browser session | IP reputation / bot detection |
| `android` player client as primary | PO token requirement for DASH streams |
| Node.js 20 in container + `js_runtimes` | `n`-parameter throttling |
| `bestvideo+bestaudio/best` format string | Empty format list from web client |
| No `remote_components` | Progress stall at 0% |
| `retries=5, fragment_retries=5, socket_timeout=30` | Transient network errors |

---

## Quick Start

```bash
docker compose up -d
```

Open `http://localhost:5163` in your browser.

**Before downloading:** Upload a `cookies.txt` file via the Cookies panel in the download modal, or mount one from the host (see docker-compose.yml).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/data/library.db` | SQLite database path |
| `VIDEOS_DIR` | `/videos` | Directory where video files are stored |
| `COOKIES_DIR` | `/data/cookies` | Directory yt-dlp reads `youtube-cookies.txt` from |
| `COOKIES_PATH` | `/data/cookies.txt` | Legacy single-file cookies path (fallback) |
| `YTDLP_BROWSER` | *(none)* | Browser name for cookies-from-browser mode (`chrome`, `firefox`, etc.) |
| `YTDLP_BROWSER_PROFILE` | *(none)* | Browser profile name, e.g. `Default` |
| `YTDLP_BROWSER_KEYRING` | *(none)* | Optional keyring hint for browser cookie decryption |
| `YTDLP_BROWSER_CONTAINER` | *(none)* | Optional Firefox container hint |
| `YTDLP_PROXY` | *(none)* | Outbound proxy for yt-dlp, e.g. `http://user:pass@host:port` |

---

## Operational Guidance

### Cookies maintenance

Cookie files expire. When downloads start failing with bot-detection errors:

1. Open the download modal → Cookies panel → click **Test cookies**.
2. If the test fails with "YouTube rejected the request as a bot", export fresh cookies from a logged-in browser and re-upload (or replace the mounted file on the host).
3. Log into YouTube in the browser **before** exporting. Incognito/guest sessions produce cookies that expire immediately.

On the production server the cookies file lives at `/home/ubuntu/yt-login-artifacts/youtube-cookies.txt` and is bind-mounted read-only into the container. Replace this file on the host and the next download uses it automatically (no container restart needed).

### Rebuilding the container

yt-dlp is upgraded to the latest version on every `docker build` (`pip install --upgrade yt-dlp`). YouTube regularly changes its extraction logic; if downloads start failing in ways not related to cookies, rebuild:

```bash
docker compose build --no-cache && docker compose up -d
```

### Proxy

If the server IP is heavily flagged, add a residential or rotating proxy:

```env
YTDLP_PROXY=http://user:pass@proxy-host:port
```

Datacenter proxies are not significantly better than a VPS IP for YouTube. Residential proxies are more effective.

### Storage

Videos are stored in the `videos` Docker named volume (`/videos` inside the container). The volume persists across container restarts and rebuilds. To find where Docker stores it:

```bash
docker volume inspect archive_videos
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Sign in to confirm you're not a bot` | Cookies expired or absent, or IP flagged | Upload fresh cookies from a logged-in browser session |
| `No cookie source configured` | No cookies file and no `YTDLP_BROWSER` set | Upload cookies.txt via the UI or mount from host |
| `requested format is not available` | Outdated yt-dlp; format selector too strict | Rebuild the container to get the latest yt-dlp |
| Download stuck at 0% | Transient network issue or stale job | Check container logs: `docker compose logs app` |
| Download throttled (very slow) | Node.js `n`-challenge solver not working | Verify Node.js is installed: `docker compose exec app node --version` |
| Browser-backed cookies not working | No real browser profile on the host | Use file-based cookies instead; browser mode requires a real host browser session |
| Playback seek doesn't work | Nginx buffering or Range header not forwarded | Check nginx.conf has `proxy_buffering off` and Range headers forwarded |
| Video missing from library after download | ffmpeg merge failed, file empty | Check logs for merge errors; rebuild to get latest ffmpeg |

---

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies API requests to the backend. Set `VITE_API_URL` if the backend runs on a non-default port.

### API routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/download` | Start a download job |
| `GET` | `/api/download/{job_id}/status` | Poll job status and progress |
| `GET` | `/api/download/cookies/status` | Cookie configuration status |
| `POST` | `/api/download/cookies/upload` | Upload a cookies.txt file |
| `POST` | `/api/download/cookies/test` | Verify cookies against YouTube |
| `GET` | `/api/videos` | List all videos |
| `GET` | `/api/videos/{id}` | Get video metadata |
| `DELETE` | `/api/videos/{id}` | Delete video and file |
| `GET` | `/api/tags` | List tags |
| `GET` | `/stream/{video_id}` | Range-streaming video playback |
