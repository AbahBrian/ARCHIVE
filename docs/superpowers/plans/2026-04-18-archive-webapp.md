# ARCHIVE Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal web app (ARCHIVE) to download YouTube videos as MP4s, store them on a Linux VPS, and stream/browse them from any device via a browser with a premium "Cinematic Archive" design.

**Architecture:** Single FastAPI monolith serving both the REST API and the pre-built React frontend as static files. `yt-dlp` runs as FastAPI background tasks. SQLite stores all metadata. MP4 files live in a `/videos/` directory on disk. React frontend uses Framer Motion for PlayerPage animations and follows the "Cinematic Archive" design system (warm bone/linen palette, no borders, Manrope font, glassmorphism nav).

**Tech Stack:** Python 3.11, FastAPI, yt-dlp, SQLite, React 18, TypeScript, Vite, react-router-dom, Framer Motion (motion package), Docker, Nginx.

---

## File Map

```
/
├── backend/
│   ├── config.py                  # Env-var settings (DB_PATH, VIDEOS_DIR)
│   ├── db.py                      # SQLite connection, write lock, schema init
│   ├── downloader.py              # yt-dlp wrapper background task
│   ├── main.py                    # FastAPI app, startup, router wiring, static mount
│   ├── requirements.txt
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── videos.py              # GET/PATCH/DELETE /api/videos
│   │   ├── download.py            # POST /api/download, GET /api/download/{id}/status
│   │   ├── tags.py                # GET /api/tags
│   │   └── stream.py              # GET /stream/{id} with HTTP range support
│   └── tests/
│       ├── conftest.py
│       ├── test_db.py
│       ├── test_videos.py
│       ├── test_tags.py
│       ├── test_download.py
│       └── test_stream.py
├── frontend/
│   ├── index.html
│   ├── vite.config.ts             # Proxy /api and /stream to :8000
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                # Router setup
│       ├── api.ts                 # All fetch calls + formatDuration/formatFileSize
│       ├── types.ts               # Video, DownloadJob interfaces
│       ├── index.css              # Global styles — Cinematic Archive design tokens
│       └── components/
│           ├── NavBar.tsx         # Glassmorphism nav, search, + Download trigger
│           ├── DownloadModal.tsx  # URL input → progress bar → tag input
│           ├── VideoCard.tsx      # Thumbnail, title, channel, duration, size, tags
│           ├── LibraryPage.tsx    # Tag pill filters + video grid
│           └── PlayerPage.tsx     # Framer Motion player + metadata + tag editor
├── Dockerfile                     # Multi-stage: Vite build → Python image
├── docker-compose.yml
├── nginx.conf
└── .gitignore
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `backend/config.py`
- Create: `backend/requirements.txt`
- Create: `backend/routers/__init__.py`
- Create: `.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p backend/routers backend/tests frontend
touch backend/routers/__init__.py
```

- [ ] **Step 2: Create `backend/requirements.txt`**

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
yt-dlp==2024.4.9
aiofiles==23.2.1
python-multipart==0.0.9
pytest==8.1.1
httpx==0.27.0
```

- [ ] **Step 3: Create `backend/config.py`**

```python
import os

DB_PATH = os.getenv("DB_PATH", "/data/library.db")
VIDEOS_DIR = os.getenv("VIDEOS_DIR", "/videos")
```

- [ ] **Step 4: Create `.gitignore`**

```
__pycache__/
*.pyc
.pytest_cache/
*.db
/videos/
frontend/node_modules/
frontend/dist/
.superpowers/
```

- [ ] **Step 5: Commit**

```bash
git add backend/ .gitignore
git commit -m "feat: project scaffold"
```

---

## Task 2: Database Layer

**Files:**
- Create: `backend/db.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_db.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_db.py`:

```python
import sqlite3
import config


def test_init_db_creates_all_tables():
    import db
    db.init_db()
    conn = sqlite3.connect(config.DB_PATH)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    conn.close()
    assert "videos" in tables
    assert "tags" in tables
    assert "video_tags" in tables
    assert "download_jobs" in tables


def test_get_db_returns_row_factory_connection():
    import db
    db.init_db()
    conn = db.get_db()
    conn.execute(
        "INSERT INTO videos (title, file_path, yt_url) VALUES (?, ?, ?)",
        ("t", "/f", "https://yt.com/1"),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM videos").fetchone()
    assert row["title"] == "t"
    conn.close()
```

Create `backend/tests/conftest.py`:

```python
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def patch_config(tmp_path, monkeypatch):
    import config
    db_path = str(tmp_path / "test.db")
    videos_dir = str(tmp_path / "videos")
    os.makedirs(videos_dir, exist_ok=True)
    monkeypatch.setattr(config, "DB_PATH", db_path)
    monkeypatch.setattr(config, "VIDEOS_DIR", videos_dir)
    import db
    db.init_db()


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def sample_video(patch_config):
    import config, db
    fake_file = os.path.join(config.VIDEOS_DIR, "test.mp4")
    with open(fake_file, "wb") as f:
        f.write(b"\x00" * 2048)
    conn = db.get_db()
    cur = conn.execute(
        """INSERT INTO videos
               (title, channel, duration, file_size, file_path, thumbnail, yt_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        ("Test Video", "Test Channel", 120, 2048, fake_file,
         "https://img.youtube.com/vi/test/0.jpg", "https://youtube.com/watch?v=test"),
    )
    conn.commit()
    video_id = cur.lastrowid
    conn.close()
    return {"id": video_id, "file_path": fake_file}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pip install -r requirements.txt
pytest tests/test_db.py -v
```

Expected: `ImportError: No module named 'db'`

- [ ] **Step 3: Create `backend/db.py`**

```python
import sqlite3
import threading
import config

write_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with write_lock:
        conn = get_db()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS videos (
                id            INTEGER PRIMARY KEY,
                title         TEXT NOT NULL,
                channel       TEXT,
                duration      INTEGER,
                file_size     INTEGER,
                file_path     TEXT NOT NULL,
                thumbnail     TEXT,
                yt_url        TEXT NOT NULL,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tags (
                id   INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS video_tags (
                video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
                PRIMARY KEY (video_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS download_jobs (
                id         TEXT PRIMARY KEY,
                yt_url     TEXT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'pending',
                progress   INTEGER DEFAULT 0,
                error      TEXT,
                video_id   INTEGER REFERENCES videos(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        conn.close()
```

- [ ] **Step 4: Create minimal `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db

app = FastAPI(title="ARCHIVE")


@app.on_event("startup")
def startup() -> None:
    init_db()
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pytest tests/test_db.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/db.py backend/main.py backend/tests/
git commit -m "feat: database layer with schema init"
```

---

## Task 3: Video Router

**Files:**
- Create: `backend/routers/videos.py`
- Create: `backend/tests/test_videos.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_videos.py`:

```python
import os
import config, db


def test_list_videos_empty(client):
    res = client.get("/api/videos")
    assert res.status_code == 200
    assert res.json() == []


def test_list_videos_returns_all(client, sample_video):
    res = client.get("/api/videos")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["title"] == "Test Video"
    assert data[0]["tags"] == []


def test_get_video(client, sample_video):
    res = client.get(f"/api/videos/{sample_video['id']}")
    assert res.status_code == 200
    v = res.json()
    assert v["title"] == "Test Video"
    assert v["channel"] == "Test Channel"
    assert v["duration"] == 120
    assert v["tags"] == []


def test_get_video_not_found(client):
    res = client.get("/api/videos/999")
    assert res.status_code == 404


def test_patch_tags(client, sample_video):
    res = client.patch(
        f"/api/videos/{sample_video['id']}/tags",
        json={"tags": ["music", "lofi"]},
    )
    assert res.status_code == 200
    assert set(res.json()["tags"]) == {"music", "lofi"}


def test_patch_tags_replaces_existing(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music"]})
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["cooking"]})
    res = client.get(f"/api/videos/{vid}")
    assert res.json()["tags"] == ["cooking"]


def test_patch_tags_not_found(client):
    res = client.patch("/api/videos/999/tags", json={"tags": ["x"]})
    assert res.status_code == 404


def test_delete_video(client, sample_video):
    res = client.delete(f"/api/videos/{sample_video['id']}")
    assert res.status_code == 204
    assert not client.get(f"/api/videos/{sample_video['id']}").json().get("id")


def test_delete_removes_file(client, sample_video):
    file_path = sample_video["file_path"]
    client.delete(f"/api/videos/{sample_video['id']}")
    assert not os.path.exists(file_path)


def test_delete_not_found(client):
    res = client.delete("/api/videos/999")
    assert res.status_code == 404


def test_search_by_title(client, sample_video):
    res = client.get("/api/videos?q=Test")
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_search_no_match(client, sample_video):
    res = client.get("/api/videos?q=zzznomatch")
    assert res.json() == []


def test_filter_by_tag(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music"]})
    res = client.get("/api/videos?tag=music")
    assert len(res.json()) == 1


def test_filter_by_tag_no_match(client, sample_video):
    res = client.get("/api/videos?tag=jazz")
    assert res.json() == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_videos.py -v
```

Expected: All fail with 404.

- [ ] **Step 3: Create `backend/routers/videos.py`**

```python
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db

router = APIRouter(prefix="/api/videos", tags=["videos"])


class TagsUpdate(BaseModel):
    tags: list[str]


def _video_with_tags(video_id: int, conn) -> dict:
    row = conn.execute("SELECT * FROM videos WHERE id=?", (video_id,)).fetchone()
    if not row:
        return None
    video = dict(row)
    tag_rows = conn.execute(
        """SELECT t.name FROM tags t
           JOIN video_tags vt ON t.id = vt.tag_id
           WHERE vt.video_id = ?
           ORDER BY t.name""",
        (video_id,),
    ).fetchall()
    video["tags"] = [r["name"] for r in tag_rows]
    return video


@router.get("")
def list_videos(q: Optional[str] = None, tag: Optional[str] = None):
    conn = db.get_db()
    try:
        if tag:
            rows = conn.execute(
                """SELECT v.id FROM videos v
                   JOIN video_tags vt ON v.id = vt.video_id
                   JOIN tags t ON vt.tag_id = t.id
                   WHERE t.name = ?
                   ORDER BY v.downloaded_at DESC""",
                (tag,),
            ).fetchall()
        elif q:
            rows = conn.execute(
                """SELECT id FROM videos
                   WHERE title LIKE ? OR channel LIKE ?
                   ORDER BY downloaded_at DESC""",
                (f"%{q}%", f"%{q}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM videos ORDER BY downloaded_at DESC"
            ).fetchall()
        return [_video_with_tags(row["id"], conn) for row in rows]
    finally:
        conn.close()


@router.get("/{video_id}")
def get_video(video_id: int):
    conn = db.get_db()
    try:
        video = _video_with_tags(video_id, conn)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        return video
    finally:
        conn.close()


@router.patch("/{video_id}/tags")
def update_tags(video_id: int, body: TagsUpdate):
    conn = db.get_db()
    try:
        if not conn.execute("SELECT id FROM videos WHERE id=?", (video_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Video not found")
    finally:
        conn.close()

    with db.write_lock:
        conn = db.get_db()
        try:
            conn.execute("DELETE FROM video_tags WHERE video_id=?", (video_id,))
            for name in body.tags:
                name = name.strip().lower()
                if not name:
                    continue
                conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
                tag_id = conn.execute(
                    "SELECT id FROM tags WHERE name=?", (name,)
                ).fetchone()["id"]
                conn.execute(
                    "INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)",
                    (video_id, tag_id),
                )
            conn.commit()
            return _video_with_tags(video_id, conn)
        finally:
            conn.close()


@router.delete("/{video_id}", status_code=204)
def delete_video(video_id: int):
    conn = db.get_db()
    try:
        row = conn.execute(
            "SELECT file_path FROM videos WHERE id=?", (video_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Video not found")
        file_path = row["file_path"]
    finally:
        conn.close()

    with db.write_lock:
        conn = db.get_db()
        try:
            conn.execute("DELETE FROM videos WHERE id=?", (video_id,))
            conn.commit()
        finally:
            conn.close()

    if os.path.exists(file_path):
        os.remove(file_path)
```

- [ ] **Step 4: Register router in `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos

app = FastAPI(title="ARCHIVE")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
```

- [ ] **Step 5: Run tests — expect all 14 PASS**

```bash
pytest tests/test_videos.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/videos.py backend/main.py backend/tests/test_videos.py
git commit -m "feat: video CRUD router with search and tag filtering"
```

---

## Task 4: Tags Router

**Files:**
- Create: `backend/routers/tags.py`
- Create: `backend/tests/test_tags.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_tags.py`:

```python
def test_list_tags_empty(client):
    res = client.get("/api/tags")
    assert res.status_code == 200
    assert res.json() == []


def test_list_tags_after_tagging(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music", "lofi"]})
    res = client.get("/api/tags")
    assert set(res.json()) == {"music", "lofi"}


def test_list_tags_sorted(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["zzz", "aaa", "mmm"]})
    tags = client.get("/api/tags").json()
    assert tags == sorted(tags)
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_tags.py -v
```

Expected: All fail with 404.

- [ ] **Step 3: Create `backend/routers/tags.py`**

```python
from fastapi import APIRouter
import db

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags():
    conn = db.get_db()
    try:
        rows = conn.execute("SELECT name FROM tags ORDER BY name").fetchall()
        return [row["name"] for row in rows]
    finally:
        conn.close()
```

- [ ] **Step 4: Update `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos, tags

app = FastAPI(title="ARCHIVE")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
```

- [ ] **Step 5: Run tests — expect 3 PASS**

```bash
pytest tests/test_tags.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/tags.py backend/main.py backend/tests/test_tags.py
git commit -m "feat: tags list router"
```

---

## Task 5: Downloader + Download Router

**Files:**
- Create: `backend/downloader.py`
- Create: `backend/routers/download.py`
- Create: `backend/tests/test_download.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_download.py`:

```python
import uuid
from unittest.mock import patch
import db


def _fake_run_download(job_id: str, url: str):
    import os, config
    fake_file = os.path.join(config.VIDEOS_DIR, f"{job_id}.mp4")
    with open(fake_file, "wb") as f:
        f.write(b"\x00" * 512)
    with db.write_lock:
        conn = db.get_db()
        cur = conn.execute(
            """INSERT INTO videos (title, channel, duration, file_size, file_path, thumbnail, yt_url)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            ("Downloaded Video", "Some Channel", 60, 512, fake_file, "", url),
        )
        video_id = cur.lastrowid
        conn.execute(
            "UPDATE download_jobs SET status='done', progress=100, video_id=? WHERE id=?",
            (video_id, job_id),
        )
        conn.commit()
        conn.close()


def test_start_download_returns_job_id(client):
    with patch("routers.download.run_download"):
        res = client.post("/api/download", json={"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"})
    assert res.status_code == 200
    data = res.json()
    assert "job_id" in data
    assert len(data["job_id"]) == 36


def test_job_status_pending(client):
    with patch("routers.download.run_download"):
        res = client.post("/api/download", json={"url": "https://youtube.com/watch?v=abc"})
    job_id = res.json()["job_id"]
    status = client.get(f"/api/download/{job_id}/status").json()
    assert status["status"] == "pending"
    assert status["progress"] == 0


def test_job_status_not_found(client):
    res = client.get(f"/api/download/{uuid.uuid4()}/status")
    assert res.status_code == 404


def test_job_status_done_has_video_id(client):
    with patch("routers.download.run_download", side_effect=_fake_run_download):
        res = client.post("/api/download", json={"url": "https://youtube.com/watch?v=xyz"})
    job_id = res.json()["job_id"]
    status = client.get(f"/api/download/{job_id}/status").json()
    assert status["status"] == "done"
    assert status["video_id"] is not None
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_download.py -v
```

Expected: All fail with 404/ImportError.

- [ ] **Step 3: Create `backend/downloader.py`**

```python
import os
import yt_dlp
import config
import db


def run_download(job_id: str, url: str) -> None:
    output_path: str | None = None

    def _progress_hook(d: dict) -> None:
        nonlocal output_path
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            progress = int(downloaded / total * 100) if total else 0
            with db.write_lock:
                conn = db.get_db()
                conn.execute("UPDATE download_jobs SET progress=? WHERE id=?", (progress, job_id))
                conn.commit()
                conn.close()
        elif d["status"] == "finished":
            output_path = d.get("filename")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": os.path.join(config.VIDEOS_DIR, "%(id)s.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
    }

    with db.write_lock:
        conn = db.get_db()
        conn.execute("UPDATE download_jobs SET status='downloading' WHERE id=?", (job_id,))
        conn.commit()
        conn.close()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        file_path = output_path or os.path.join(config.VIDEOS_DIR, f"{info['id']}.mp4")
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        with db.write_lock:
            conn = db.get_db()
            cur = conn.execute(
                """INSERT INTO videos (title, channel, duration, file_size, file_path, thumbnail, yt_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (info.get("title", "Unknown"), info.get("uploader", ""),
                 info.get("duration", 0), file_size, file_path,
                 info.get("thumbnail", ""), url),
            )
            video_id = cur.lastrowid
            conn.execute(
                "UPDATE download_jobs SET status='done', progress=100, video_id=? WHERE id=?",
                (video_id, job_id),
            )
            conn.commit()
            conn.close()

    except Exception as exc:
        if output_path and os.path.exists(output_path):
            os.remove(output_path)
        with db.write_lock:
            conn = db.get_db()
            conn.execute(
                "UPDATE download_jobs SET status='failed', error=? WHERE id=?",
                (str(exc), job_id),
            )
            conn.commit()
            conn.close()
```

- [ ] **Step 4: Create `backend/routers/download.py`**

```python
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import db
from downloader import run_download

router = APIRouter(prefix="/api/download", tags=["download"])


class DownloadRequest(BaseModel):
    url: str


@router.post("")
def start_download(body: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    with db.write_lock:
        conn = db.get_db()
        conn.execute(
            "INSERT INTO download_jobs (id, yt_url, status) VALUES (?, ?, 'pending')",
            (job_id, body.url),
        )
        conn.commit()
        conn.close()
    background_tasks.add_task(run_download, job_id, body.url)
    return {"job_id": job_id}


@router.get("/{job_id}/status")
def get_status(job_id: str):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT * FROM download_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)
    finally:
        conn.close()
```

- [ ] **Step 5: Update `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos, tags, download

app = FastAPI(title="ARCHIVE")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
```

- [ ] **Step 6: Run tests — expect 4 PASS**

```bash
pytest tests/test_download.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/downloader.py backend/routers/download.py backend/main.py backend/tests/test_download.py
git commit -m "feat: yt-dlp downloader and download job router"
```

---

## Task 6: Stream Router

**Files:**
- Create: `backend/routers/stream.py`
- Create: `backend/tests/test_stream.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_stream.py`:

```python
def test_stream_full_file(client, sample_video):
    res = client.get(f"/stream/{sample_video['id']}")
    assert res.status_code == 200
    assert res.headers["content-type"] == "video/mp4"
    assert res.headers["accept-ranges"] == "bytes"
    assert len(res.content) == 2048


def test_stream_not_found(client):
    res = client.get("/stream/999")
    assert res.status_code == 404


def test_stream_range_request(client, sample_video):
    res = client.get(
        f"/stream/{sample_video['id']}",
        headers={"range": "bytes=0-511"},
    )
    assert res.status_code == 206
    assert res.headers["content-range"] == "bytes 0-511/2048"
    assert res.headers["content-length"] == "512"
    assert len(res.content) == 512


def test_stream_range_open_end(client, sample_video):
    res = client.get(
        f"/stream/{sample_video['id']}",
        headers={"range": "bytes=1024-"},
    )
    assert res.status_code == 206
    assert len(res.content) == 1024
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_stream.py -v
```

Expected: All fail with 404.

- [ ] **Step 3: Create `backend/routers/stream.py`**

```python
import os
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import db

router = APIRouter(tags=["stream"])
CHUNK_SIZE = 1024 * 1024  # 1 MB


@router.get("/stream/{video_id}")
def stream_video(video_id: int, request: Request):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT file_path FROM videos WHERE id=?", (video_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Video not found")
        file_path = row["file_path"]
    finally:
        conn.close()

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
        raw = range_header.replace("bytes=", "").split("-")
        start = int(raw[0])
        end = int(raw[1]) if raw[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        def _iter_range():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            _iter_range(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
            },
        )

    def _iter_full():
        with open(file_path, "rb") as f:
            while chunk := f.read(CHUNK_SIZE):
                yield chunk

    return StreamingResponse(
        _iter_full(),
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
    )
```

- [ ] **Step 4: Update `backend/main.py`**

```python
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from db import init_db
from routers import videos, tags, download, stream

app = FastAPI(title="ARCHIVE")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
app.include_router(stream.router)

_frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
```

- [ ] **Step 5: Run full test suite — expect all PASS**

```bash
pytest tests/ -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/routers/stream.py backend/main.py backend/tests/test_stream.py
git commit -m "feat: HTTP range-request streaming + static mount"
```

---

## Task 7: React Scaffold + Design Tokens + API Client

**Files:**
- Create: `frontend/` (Vite project)
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/index.css`  ← Cinematic Archive design tokens

- [ ] **Step 1: Scaffold Vite project and install dependencies**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom
npm install motion
```

- [ ] **Step 2: Update `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/stream': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: Create `frontend/src/types.ts`**

```typescript
export interface Video {
  id: number;
  title: string;
  channel: string;
  duration: number;
  file_size: number;
  thumbnail: string;
  yt_url: string;
  downloaded_at: string;
  tags: string[];
}

export interface DownloadJob {
  id: string;
  yt_url: string;
  status: 'pending' | 'downloading' | 'done' | 'failed';
  progress: number;
  error?: string;
  video_id?: number;
}
```

- [ ] **Step 4: Create `frontend/src/api.ts`**

```typescript
import type { Video, DownloadJob } from './types';

const BASE = '/api';

export async function listVideos(params?: { q?: string; tag?: string }): Promise<Video[]> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.tag) query.set('tag', params.tag);
  const res = await fetch(`${BASE}/videos?${query}`);
  if (!res.ok) throw new Error('Failed to fetch videos');
  return res.json();
}

export async function getVideo(id: number): Promise<Video> {
  const res = await fetch(`${BASE}/videos/${id}`);
  if (!res.ok) throw new Error('Video not found');
  return res.json();
}

export async function updateVideoTags(id: number, tags: string[]): Promise<Video> {
  const res = await fetch(`${BASE}/videos/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error('Failed to update tags');
  return res.json();
}

export async function deleteVideo(id: number): Promise<void> {
  const res = await fetch(`${BASE}/videos/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete video');
}

export async function listTags(): Promise<string[]> {
  const res = await fetch(`${BASE}/tags`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

export async function startDownload(url: string): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to start download');
  return res.json();
}

export async function getDownloadStatus(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`${BASE}/download/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to get job status');
  return res.json();
}

export function streamUrl(videoId: number): string {
  return `/stream/${videoId}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
```

- [ ] **Step 5: Create `frontend/src/index.css` — Cinematic Archive design tokens**

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Cinematic Archive Palette */
  --surface:                #fff8f7;
  --surface-container-low:  #fff0ef;
  --surface-container-lowest: #ffffff;
  --surface-container-high: #f2e8e7;
  --on-surface:             #281716;
  --on-surface-variant:     #6b4b49;
  --outline-variant:        rgba(229, 189, 185, 0.15);

  /* Primary — deep cinematic red */
  --primary:                #ba061b;
  --primary-container:      #df2b31;
  --on-primary:             #ffffff;

  /* Typography scale */
  --font:                   'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
  --radius-sm:              0.5rem;
  --radius-md:              0.75rem;
  --radius-full:            9999px;

  /* Ambient shadow */
  --shadow-ambient:         0 8px 40px rgba(40, 23, 22, 0.06);
  --shadow-float:           0 16px 48px rgba(40, 23, 22, 0.08);
}

body {
  font-family: var(--font);
  background: var(--surface);
  color: var(--on-surface);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }
button { cursor: pointer; font-family: inherit; }

/* Primary CTA — gradient jewel pill */
.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  color: var(--on-primary);
  border: none;
  padding: 10px 22px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: opacity 0.15s, transform 0.15s;
}
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:active { transform: translateY(0); }

/* Secondary tonal */
.btn-secondary {
  background: var(--surface-container-high);
  color: var(--primary);
  border: none;
  padding: 9px 20px;
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-secondary:hover { background: var(--surface-container-low); }

/* Chip pills */
.chip {
  display: inline-flex;
  align-items: center;
  background: var(--surface-container-high);
  color: var(--on-surface-variant);
  border-radius: var(--radius-full);
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  letter-spacing: 0.02em;
}
.chip.active {
  background: var(--primary);
  color: var(--on-primary);
}
.chip:hover:not(.active) { background: var(--surface-container-low); color: var(--primary); }

/* Pill input */
.input-pill {
  width: 100%;
  padding: 10px 18px;
  border-radius: var(--radius-full);
  border: none;
  outline: none;
  background: var(--surface-container-low);
  color: var(--on-surface);
  font-family: var(--font);
  font-size: 14px;
  transition: background 0.15s, box-shadow 0.15s;
}
.input-pill:focus {
  background: var(--surface-container-lowest);
  box-shadow: 0 0 0 2px rgba(186, 6, 27, 0.2);
}
.input-pill::placeholder { color: var(--on-surface-variant); }
```

- [ ] **Step 6: Update `frontend/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LibraryPage from './components/LibraryPage';
import PlayerPage from './components/PlayerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Verify Vite dev server starts**

```bash
cd frontend && npm run dev
```

Expected: `Local: http://localhost:5173/` with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: React/Vite scaffold with Cinematic Archive design tokens"
```

---

## Task 8: NavBar (Glassmorphism) + DownloadModal

**Files:**
- Create: `frontend/src/components/NavBar.tsx`
- Create: `frontend/src/components/DownloadModal.tsx`

- [ ] **Step 1: Create `frontend/src/components/DownloadModal.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { startDownload, getDownloadStatus, updateVideoTags } from '../api';
import type { DownloadJob } from '../types';

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

export default function DownloadModal({ onClose, onComplete }: Props) {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      const { job_id } = await startDownload(url.trim());
      pollRef.current = setInterval(async () => {
        const status = await getDownloadStatus(job_id);
        setJob(status);
        if (status.status === 'done' || status.status === 'failed') {
          clearInterval(pollRef.current!);
          setSubmitting(false);
        }
      }, 2000);
    } catch {
      setError('Failed to start download. Check the URL.');
      setSubmitting(false);
    }
  }

  async function handleSaveTags() {
    if (!job?.video_id) return;
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) await updateVideoTags(job.video_id, tags);
    onComplete();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(40,23,22,0.45)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{
          background: 'var(--surface-container-lowest)',
          borderRadius: 20,
          padding: 32,
          width: 480,
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>
            Download Video
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-container-high)', border: 'none',
              borderRadius: '50%', width: 32, height: 32, fontSize: 16,
              color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        <AnimatePresence mode="wait">
          {!job && (
            <motion.form key="url-form" onSubmit={handleSubmit}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <input
                type="url"
                className="input-pill"
                placeholder="https://youtube.com/watch?v=..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
                style={{ marginBottom: 12 }}
              />
              {error && (
                <p style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 10 }}>{error}</p>
              )}
              <button type="submit" className="btn-primary" disabled={submitting}
                style={{ width: '100%', padding: '12px 0' }}>
                {submitting ? 'Starting...' : 'Download'}
              </button>
            </motion.form>
          )}

          {job && job.status !== 'done' && job.status !== 'failed' && (
            <motion.div key="progress"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', marginBottom: 12 }}>
                Downloading... {job.progress}%
              </p>
              <div style={{ background: 'var(--surface-container-high)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <motion.div
                  style={{ background: 'linear-gradient(90deg, var(--primary), var(--primary-container))', height: '100%' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          )}

          {job?.status === 'failed' && (
            <motion.p key="failed"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ color: 'var(--primary)', fontSize: 14 }}>
              Download failed: {job.error || 'Unknown error'}
            </motion.p>
          )}

          {job?.status === 'done' && (
            <motion.div key="done"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: 20, fontSize: 15 }}>
                ✓ Download complete!
              </p>
              <label style={{ fontSize: 12, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                Add Tags (comma-separated, optional)
              </label>
              <input
                type="text"
                className="input-pill"
                placeholder="music, lofi, study"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                style={{ marginBottom: 16 }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-primary" onClick={handleSaveTags} style={{ flex: 1, padding: '12px 0' }}>
                  Save to Library
                </button>
                <button className="btn-secondary" onClick={onClose}>Skip</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/NavBar.tsx`**

```tsx
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import DownloadModal from './DownloadModal';

interface Props {
  searchQuery: string;
  onSearch: (q: string) => void;
  onLibraryRefresh: () => void;
}

export default function NavBar({ searchQuery, onSearch, onLibraryRefresh }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,248,247,0.72)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--outline-variant)',
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <a href="/" style={{
          fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, var(--primary), var(--primary-container))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          flexShrink: 0,
        }}>
          ARCHIVE
        </a>

        <input
          type="search"
          className="input-pill"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}
        />

        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Download
        </button>
      </nav>

      <AnimatePresence>
        {showModal && (
          <DownloadModal
            key="download-modal"
            onClose={() => setShowModal(false)}
            onComplete={onLibraryRefresh}
          />
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 3: Verify in browser**

With `npm run dev` running:
1. Open http://localhost:5173 — nav shows gradient "ARCHIVE" wordmark, pill search bar, gradient "+ Download" button
2. Click "+ Download" — modal slides in with spring animation, backdrop blurs
3. Click outside modal or × — modal exits with fade

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/components/DownloadModal.tsx
git commit -m "feat: glassmorphism NavBar and animated DownloadModal"
```

---

## Task 9: VideoCard + LibraryPage

**Files:**
- Create: `frontend/src/components/VideoCard.tsx`
- Create: `frontend/src/components/LibraryPage.tsx`

- [ ] **Step 1: Create `frontend/src/components/VideoCard.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

interface Props {
  video: Video;
  onTagClick: (tag: string) => void;
  index: number;
}

export default function VideoCard({ video, onTagClick, index }: Props) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(40,23,22,0.10)' }}
      onClick={() => navigate(`/player/${video.id}`)}
      style={{
        background: 'var(--surface-container-lowest)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-ambient)',
        cursor: 'pointer',
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--surface-container-high)' }}>
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 36, color: 'var(--on-surface-variant)',
          }}>▶</div>
        )}
        {/* 20% gradient overlay for duration label legibility */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.20) 0%, transparent 50%)',
        }} />
        <span style={{
          position: 'absolute', bottom: 8, right: 8,
          background: 'rgba(40,23,22,0.75)',
          color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '3px 7px', borderRadius: 'var(--radius-sm)',
          letterSpacing: '0.02em',
        }}>
          {formatDuration(video.duration)}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px' }}>
        <p style={{
          fontWeight: 700, fontSize: 14, lineHeight: 1.35,
          color: 'var(--on-surface)', marginBottom: 5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          letterSpacing: '-0.01em',
        }}>
          {video.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginBottom: 10, fontWeight: 500 }}>
          {video.channel} · {formatFileSize(video.file_size)}
        </p>
        {video.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {video.tags.map(tag => (
              <span
                key={tag}
                className="chip"
                onClick={e => { e.stopPropagation(); onTagClick(tag); }}
                style={{ fontSize: 11, padding: '3px 10px' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/LibraryPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import NavBar from './NavBar';
import VideoCard from './VideoCard';
import { listVideos, listTags } from '../api';
import type { Video } from '../types';

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; tag?: string } = {};
      if (searchQuery) params.q = searchQuery;
      else if (activeTag) params.tag = activeTag;
      setVideos(await listVideos(params));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTag]);

  const fetchTags = useCallback(async () => {
    setTags(await listTags());
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  function handleTagClick(tag: string) {
    setSearchQuery('');
    setActiveTag(prev => (prev === tag ? null : tag));
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    setActiveTag(null);
  }

  return (
    <>
      <NavBar
        searchQuery={searchQuery}
        onSearch={handleSearch}
        onLibraryRefresh={() => { fetchVideos(); fetchTags(); }}
      />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* Tag chips */}
        {(tags.length > 0 || !loading) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            <span
              className={`chip ${!activeTag && !searchQuery ? 'active' : ''}`}
              onClick={() => { setActiveTag(null); setSearchQuery(''); }}
            >
              All
            </span>
            {tags.map(tag => (
              <span
                key={tag}
                className={`chip ${activeTag === tag ? 'active' : ''}`}
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {loading && (
          <p style={{ color: 'var(--on-surface-variant)', textAlign: 'center', marginTop: 64, fontSize: 15 }}>
            Loading...
          </p>
        )}

        {!loading && videos.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 100, color: 'var(--on-surface-variant)' }}>
            <p style={{ fontSize: 52, marginBottom: 16 }}>📭</p>
            <p style={{ fontSize: 17, fontWeight: 500 }}>No videos yet.</p>
            <p style={{ fontSize: 14, marginTop: 6 }}>Click "+ Download" to add one.</p>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 24,
        }}>
          {videos.map((video, i) => (
            <VideoCard key={video.id} video={video} index={i} onTagClick={handleTagClick} />
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Verify in browser**

1. Library loads with "No videos yet" empty state
2. Chip filter row shows "All" chip (active)
3. Cards stagger-animate in when videos exist
4. Search input in nav filters live (each keystroke re-fetches)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoCard.tsx frontend/src/components/LibraryPage.tsx
git commit -m "feat: animated VideoCard grid and LibraryPage with chip filters"
```

---

## Task 10: PlayerPage (Priority — Framer Motion)

**Files:**
- Create: `frontend/src/components/PlayerPage.tsx`

This is the priority page. All transitions use Framer Motion spring physics. Follow DESIGN.md strictly: no explicit borders, tonal surface shifts, ambient shadows, Manrope typography.

- [ ] **Step 1: Create `frontend/src/components/PlayerPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import NavBar from './NavBar';
import { getVideo, updateVideoTags, deleteVideo, streamUrl, formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

const spring = { type: 'spring', stiffness: 340, damping: 28 } as const;

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoId = Number(id);

  const [video, setVideo] = useState<Video | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagSaved, setTagSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getVideo(videoId)
      .then(v => { setVideo(v); setTagInput(v.tags.join(', ')); })
      .catch(() => setNotFound(true));
  }, [videoId]);

  async function handleSaveTags() {
    if (!video) return;
    setSaving(true);
    try {
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const updated = await updateVideoTags(video.id, tags);
      setVideo(updated);
      setTagInput(updated.tags.join(', '));
      setTagSaved(true);
      setTimeout(() => setTagSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!video) return;
    await deleteVideo(video.id);
    navigate('/');
  }

  if (notFound) {
    return (
      <>
        <NavBar searchQuery="" onSearch={() => {}} onLibraryRefresh={() => {}} />
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}
          style={{ textAlign: 'center', marginTop: 100 }}
        >
          <p style={{ fontSize: 52 }}>⚠️</p>
          <p style={{ fontSize: 16, color: 'var(--on-surface-variant)', marginTop: 16, fontWeight: 500 }}>
            File not found on disk.
          </p>
          <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/')}>
            Back to Library
          </button>
        </motion.div>
      </>
    );
  }

  if (!video) {
    return (
      <>
        <NavBar searchQuery="" onSearch={() => {}} onLibraryRefresh={() => {}} />
        <p style={{ textAlign: 'center', marginTop: 100, color: 'var(--on-surface-variant)' }}>Loading...</p>
      </>
    );
  }

  return (
    <>
      <NavBar searchQuery="" onSearch={q => navigate(`/?q=${encodeURIComponent(q)}`)} onLibraryRefresh={() => {}} />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ maxWidth: 980, margin: '0 auto', padding: '28px 24px' }}
      >
        {/* Back */}
        <motion.button
          whileHover={{ x: -3 }}
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', color: 'var(--on-surface-variant)',
            cursor: 'pointer', marginBottom: 20, fontSize: 14, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Library
        </motion.button>

        {/* Video player */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
          style={{
            background: 'var(--on-surface)',
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 28,
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <video
            controls
            autoPlay
            style={{ width: '100%', display: 'block', maxHeight: '58vh' }}
            src={streamUrl(video.id)}
          />
        </motion.div>

        {/* Title row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.25, marginBottom: 8 }}>
              {video.title}
            </h1>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, fontWeight: 500 }}>
              {video.channel}
              {video.channel && ' · '}
              {formatDuration(video.duration)}
              {' · '}
              {formatFileSize(video.file_size)}
            </p>
          </div>

          <a
            href={streamUrl(video.id)}
            download={`${video.title}.mp4`}
            className="btn-primary"
            style={{ flexShrink: 0, display: 'inline-block' }}
          >
            ↓ Download MP4
          </a>
        </motion.div>

        {/* Metadata card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.15 }}
          style={{
            background: 'var(--surface-container-low)',
            borderRadius: 'var(--radius-md)',
            padding: '20px 24px',
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 14 }}>
            <div>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: 4 }}>
                Downloaded
              </p>
              <p style={{ fontWeight: 500 }}>{new Date(video.downloaded_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant)', fontWeight: 600, marginBottom: 4 }}>
                Original URL
              </p>
              <a href={video.yt_url} target="_blank" rel="noreferrer"
                style={{ color: 'var(--primary)', wordBreak: 'break-all', fontWeight: 500, fontSize: 13 }}>
                {video.yt_url}
              </a>
            </div>
          </div>
        </motion.div>

        {/* Tag editor */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.2 }}
          style={{
            background: 'var(--surface-container-lowest)',
            borderRadius: 'var(--radius-md)',
            padding: '20px 24px',
            marginBottom: 20,
            boxShadow: 'var(--shadow-ambient)',
          }}
        >
          <h3 style={{ fontWeight: 700, marginBottom: 14, fontSize: 15, letterSpacing: '-0.01em' }}>Tags</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="input-pill"
              placeholder="music, lofi, study"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTags(); }}
            />
            <motion.button
              className="btn-primary"
              whileTap={{ scale: 0.96 }}
              onClick={handleSaveTags}
              disabled={saving}
              style={{ flexShrink: 0 }}
            >
              {saving ? 'Saving...' : 'Save'}
            </motion.button>
          </div>

          <AnimatePresence>
            {tagSaved && (
              <motion.p
                key="saved-msg"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ color: '#22c55e', fontSize: 13, fontWeight: 500, marginTop: 8 }}
              >
                ✓ Tags saved
              </motion.p>
            )}
          </AnimatePresence>

          {video.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {video.tags.map(tag => (
                <span key={tag} className="chip active">{tag}</span>
              ))}
            </div>
          )}
        </motion.div>

        {/* Danger zone */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'flex', justifyContent: 'flex-end' }}
        >
          <AnimatePresence mode="wait">
            {!confirmDelete ? (
              <motion.button
                key="delete-btn"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="btn-secondary"
                style={{ color: 'var(--primary)' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Video
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', gap: 10, alignItems: 'center' }}
              >
                <span style={{ fontSize: 14, color: 'var(--on-surface-variant)', fontWeight: 500 }}>
                  Delete permanently?
                </span>
                <button className="btn-primary" onClick={handleDelete}>Yes, delete</button>
                <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.main>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser end-to-end**

With backend running (`uvicorn main:app --reload` in `backend/`) and `npm run dev` in `frontend/`:
1. Download a real YouTube video via the modal
2. Video card appears with stagger animation
3. Click card → PlayerPage animates in (opacity + spring slide)
4. Video streams and seeking works
5. Edit tags, press Save → "✓ Tags saved" toast appears then fades
6. Delete button shows confirm flow with AnimatePresence transition
7. "← Back to Library" button slides left on hover

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlayerPage.tsx
git commit -m "feat: PlayerPage with Framer Motion spring animations and Cinematic Archive design"
```

---

## Task 11: Docker + Nginx Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `nginx.conf`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    volumes:
      - videos:/videos
      - db:/data
    environment:
      - VIDEOS_DIR=/videos
      - DB_PATH=/data/library.db
    expose:
      - "8000"

  nginx:
    image: nginx:1.25-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - certs:/etc/letsencrypt
    depends_on:
      - app

volumes:
  videos:
  db:
  certs:
```

- [ ] **Step 3: Create `nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 0;

    location / {
        proxy_pass         http://app:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

- [ ] **Step 4: Test Docker build locally**

```bash
docker compose build
docker compose up -d
```

Open http://localhost — full app loads. Download a video, verify it plays.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml nginx.conf
git commit -m "feat: Docker multi-stage build and Nginx reverse proxy"
```

---

## VPS Deployment

```bash
# On your Linux VPS
git clone https://github.com/AbahBrian/ARCHIVE.git
cd ARCHIVE
docker compose up -d

# For HTTPS
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```
