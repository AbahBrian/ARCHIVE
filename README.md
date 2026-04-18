# ARCH:IVE

A self-hosted video library. Download YouTube videos and watch them from your own server.

---

## Features

- Download videos from YouTube via yt-dlp
- Browse and play your library from any device on your network
- Up Next panel with recommended videos while watching
- Docker deployment with persistent storage

---

## Quick Start (Docker)

```bash
docker compose up -d
```

Then open `http://localhost` in your browser.

---

## Passing Cookies to Fix YouTube Bot Detection

YouTube may block downloads on VPS/server environments with a *"Sign in to confirm you're not a bot"* error. Fix this by passing your browser cookies.

### Step 1 — Export cookies from your browser

Install a browser extension on your **local machine**:

- **Chrome/Edge:** [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox:** [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

1. Log into YouTube in your browser
2. Go to `youtube.com`
3. Click the extension icon → Export → Save as `cookies.txt`

### Step 2 — Upload to your VPS

```bash
scp cookies.txt user@your-vps:/path/to/cookies.txt
```

### Step 3 — Set the environment variable

Create a `.env` file next to `docker-compose.yml`:

```env
COOKIES_FILE=/path/to/cookies.txt
```

### Step 4 — Restart the container

```bash
docker compose up -d
```

The cookie file is mounted read-only into the container automatically.

### Troubleshooting

| Error | Fix |
|-------|-----|
| `Sign in to confirm you're not a bot` | Cookies not passed or expired — re-export and restart |
| `Could not copy Chrome cookie database` | Browser is open and locking the DB — use the extension export method instead |
| Downloads stop working after a while | Cookies expire — re-export every few weeks |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/data/library.db` | SQLite database path |
| `VIDEOS_DIR` | `/videos` | Directory where videos are stored |
| `COOKIES_FILE` | *(none)* | Path to Netscape-format cookies.txt for authenticated downloads |

---

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
