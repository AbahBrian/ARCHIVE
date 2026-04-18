# Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal web app to download YouTube videos as MP4s, store them on a Linux VPS, and stream/browse them from any device via a browser.

**Architecture:** Single FastAPI monolith serving both the REST API and the pre-built React frontend as static files. `yt-dlp` runs as FastAPI background tasks. SQLite stores all metadata. MP4 files live in a `/videos/` directory on disk.

**Tech Stack:** Python 3.11, FastAPI, yt-dlp, SQLite (sqlite3), React 18, TypeScript, Vite, react-router-dom, Docker,Framer Motion, Nginx.

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
│       ├── conftest.py            # Fixtures: tmp DB, tmp videos dir, TestClient, sample_video
│       ├── test_db.py             # Schema creation
│       ├── test_videos.py         # Video CRUD + search + tag filter
│       ├── test_tags.py           # Tag list
│       ├── test_download.py       # Download job creation + status polling
│       └── test_stream.py         # Range-request streaming
├── frontend/
│   ├── index.html
│   ├── vite.config.ts             # Proxy /api and /stream to :8000
│   ├── package.json
│   └── src/
│       ├── main.tsx               # React entry point
│       ├── App.tsx                # Router setup
│       ├── api.ts                 # All fetch calls to FastAPI
│       ├── types.ts               # Video, DownloadJob TypeScript interfaces
│       ├── index.css              # Global styles (light theme, #ff4444 accent)
│       └── components/
│           ├── NavBar.tsx         # Logo, search bar, + Download button
│           ├── DownloadModal.tsx  # URL input → progress bar → tag input
│           ├── VideoCard.tsx      # Thumbnail, title, channel, duration, size, tags
│           ├── LibraryPage.tsx    # Tag pill filters + video grid
│           └── PlayerPage.tsx     # HTML5 player + metadata + tag editor + download btn
├── Dockerfile                     # Multi-stage: Vite build → Python image
├── docker-compose.yml             # app + nginx services with volumes
├── nginx.conf                     # Reverse proxy to app:8000
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

- [ ] **Step 1: Write the failing test**

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
    """Override DB_PATH and VIDEOS_DIR for every test."""
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
        (
            "Test Video",
            "Test Channel",
            120,
            2048,
            fake_file,
            "https://img.youtube.com/vi/test/0.jpg",
            "https://youtube.com/watch?v=test",
        ),
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
        conn.executescript(
            """
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
            """
        )
        conn.commit()
        conn.close()
```

- [ ] **Step 4: Also create a minimal `backend/main.py` so TestClient imports don't fail**

```python
from fastapi import FastAPI
from db import init_db

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pytest tests/test_db.py -v
```

Expected:
```
PASSED tests/test_db.py::test_init_db_creates_all_tables
PASSED tests/test_db.py::test_get_db_returns_row_factory_connection
```

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
- Modify: `backend/main.py` (add router)

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

Expected: All fail with 404 (no router registered yet).

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

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pytest tests/test_videos.py -v
```

Expected: All 13 tests PASS.

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
    assert res.status_code == 200
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

- [ ] **Step 4: Register router in `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos, tags

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pytest tests/test_tags.py -v
```

Expected: All 3 tests PASS.

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
from unittest.mock import patch, MagicMock
import db


def _fake_run_download(job_id: str, url: str):
    """Simulate a successful download without calling yt-dlp."""
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
    with patch("routers.download.run_download") as mock_run:
        mock_run.return_value = None
        res = client.post(
            "/api/download", json={"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}
        )
    assert res.status_code == 200
    data = res.json()
    assert "job_id" in data
    assert len(data["job_id"]) == 36  # UUID


def test_job_status_pending(client):
    with patch("routers.download.run_download"):
        res = client.post(
            "/api/download", json={"url": "https://youtube.com/watch?v=abc"}
        )
    job_id = res.json()["job_id"]
    status = client.get(f"/api/download/{job_id}/status").json()
    assert status["status"] == "pending"
    assert status["progress"] == 0


def test_job_status_not_found(client):
    res = client.get(f"/api/download/{uuid.uuid4()}/status")
    assert res.status_code == 404


def test_job_status_done_has_video_id(client):
    with patch("routers.download.run_download", side_effect=_fake_run_download):
        res = client.post(
            "/api/download", json={"url": "https://youtube.com/watch?v=xyz"}
        )
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
    """Background task: download video via yt-dlp and update job status in SQLite."""
    output_path: str | None = None

    def _progress_hook(d: dict) -> None:
        nonlocal output_path
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            progress = int(downloaded / total * 100) if total else 0
            with db.write_lock:
                conn = db.get_db()
                conn.execute(
                    "UPDATE download_jobs SET progress=? WHERE id=?",
                    (progress, job_id),
                )
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
        conn.execute(
            "UPDATE download_jobs SET status='downloading' WHERE id=?", (job_id,)
        )
        conn.commit()
        conn.close()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        file_path = output_path or os.path.join(
            config.VIDEOS_DIR, f"{info['id']}.mp4"
        )
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        with db.write_lock:
            conn = db.get_db()
            cur = conn.execute(
                """INSERT INTO videos
                       (title, channel, duration, file_size, file_path, thumbnail, yt_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    info.get("title", "Unknown"),
                    info.get("uploader", ""),
                    info.get("duration", 0),
                    file_size,
                    file_path,
                    info.get("thumbnail", ""),
                    url,
                ),
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
        row = conn.execute(
            "SELECT * FROM download_jobs WHERE id=?", (job_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)
    finally:
        conn.close()
```

- [ ] **Step 5: Register router in `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos, tags, download

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
```

- [ ] **Step 6: Run tests and verify they pass**

```bash
pytest tests/test_download.py -v
```

Expected: All 4 tests PASS.

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
    # "bytes=1024-" means from 1024 to end
    res = client.get(
        f"/stream/{sample_video['id']}",
        headers={"range": "bytes=1024-"},
    )
    assert res.status_code == 206
    assert len(res.content) == 1024  # 2048 - 1024
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
        row = conn.execute(
            "SELECT file_path FROM videos WHERE id=?", (video_id,)
        ).fetchone()
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
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )
```

- [ ] **Step 4: Register router in `backend/main.py`**

```python
from fastapi import FastAPI
from db import init_db
from routers import videos, tags, download, stream

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
app.include_router(stream.router)
```

- [ ] **Step 5: Run tests and verify they pass**

```bash
pytest tests/test_stream.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Run full test suite to confirm nothing broken**

```bash
pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/stream.py backend/main.py backend/tests/test_stream.py
git commit -m "feat: HTTP range-request video streaming endpoint"
```

---

## Task 7: Finalize Backend — Static Mount

**Files:**
- Modify: `backend/main.py` (add static file mount for React dist)

> This task is intentionally small — the React build doesn't exist yet, so we guard the mount with `os.path.exists`. The mount is needed for the Docker production build.

- [ ] **Step 1: Update `backend/main.py`**

```python
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from db import init_db
from routers import download, stream, tags, videos

app = FastAPI(title="YouTube Library")


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
app.include_router(stream.router)

# Serve React frontend — must come last so API routes take precedence
_frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
```

- [ ] **Step 2: Verify full test suite still passes**

```bash
pytest tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: mount React dist as static files in production"
```

---

## Task 8: React Scaffold + Types + API Client

**Files:**
- Create: `frontend/` (Vite project)
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom
```

- [ ] **Step 2: Update `frontend/vite.config.ts` to proxy API calls**

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
  duration: number;      // seconds
  file_size: number;     // bytes
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

export async function listVideos(params?: {
  q?: string;
  tag?: string;
}): Promise<Video[]> {
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

export async function updateVideoTags(
  id: number,
  tags: string[]
): Promise<Video> {
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

export async function startDownload(
  url: string
): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to start download');
  return res.json();
}

export async function getDownloadStatus(
  jobId: string
): Promise<DownloadJob> {
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

- [ ] **Step 5: Create `frontend/src/index.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --accent: #ff4444;
  --accent-hover: #e03030;
  --bg: #f5f5f5;
  --card-bg: #ffffff;
  --text: #1a1a1a;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --radius: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

a { color: inherit; text-decoration: none; }

button {
  cursor: pointer;
  font-family: inherit;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 14px;
  transition: border-color 0.15s;
}
.btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

.tag-pill {
  display: inline-flex;
  align-items: center;
  background: #f0f0f0;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tag-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.tag-pill:hover:not(.active) { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 6: Verify Vite dev server starts**

```bash
cd frontend
npm run dev
```

Expected: `Local: http://localhost:5173/` — open in browser, see Vite default page.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: React/Vite scaffold with API client and types"
```

---

## Task 9: NavBar + DownloadModal

**Files:**
- Create: `frontend/src/components/NavBar.tsx`
- Create: `frontend/src/components/DownloadModal.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/DownloadModal.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { startDownload, getDownloadStatus, updateVideoTags } from '../api';
import type { DownloadJob } from '../types';

interface Props {
  onClose: () => void;
  onComplete: () => void;  // refresh library
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
    } catch (err) {
      setError('Failed to start download. Check the URL.');
      setSubmitting(false);
    }
  }

  async function handleSaveTags() {
    if (!job?.video_id) return;
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      await updateVideoTags(job.video_id, tags);
    }
    onComplete();
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 480,
        maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Download Video</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        {!job && (
          <form onSubmit={handleSubmit}>
            <input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14, marginBottom: 12,
              }}
            />
            {error && <p style={{ color: '#ff4444', fontSize: 13, marginBottom: 8 }}>{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Starting...' : 'Download'}
            </button>
          </form>
        )}

        {job && job.status !== 'done' && job.status !== 'failed' && (
          <div>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>
              Downloading... {job.progress}%
            </p>
            <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                background: '#ff4444', height: '100%',
                width: `${job.progress}%`, transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {job?.status === 'failed' && (
          <p style={{ color: '#ff4444', fontSize: 14 }}>
            Download failed: {job.error || 'Unknown error'}
          </p>
        )}

        {job?.status === 'done' && (
          <div>
            <p style={{ color: '#22c55e', fontWeight: 500, marginBottom: 16 }}>
              ✓ Download complete!
            </p>
            <label style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 6 }}>
              Add tags (comma-separated, optional)
            </label>
            <input
              type="text"
              placeholder="music, lofi, study"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14, marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleSaveTags} style={{ flex: 1 }}>
                Save to Library
              </button>
              <button className="btn-ghost" onClick={onClose}>Skip</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/NavBar.tsx`**

```tsx
import { useState } from 'react';
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
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <a href="/" style={{ fontWeight: 700, fontSize: 18, color: '#ff4444', flexShrink: 0 }}>
          ▶ MyTube
        </a>
        <input
          type="search"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          style={{
            flex: 1, maxWidth: 480, padding: '8px 14px',
            border: '1px solid #e5e7eb', borderRadius: 20,
            fontSize: 14, background: '#f5f5f5',
          }}
        />
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Download
        </button>
      </nav>
      {showModal && (
        <DownloadModal
          onClose={() => setShowModal(false)}
          onComplete={onLibraryRefresh}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `frontend/src/App.tsx`**

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

- [ ] **Step 4: Update `frontend/src/main.tsx`**

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

- [ ] **Step 5: Manually verify in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 — expected: nav bar with "▶ MyTube", search bar, and "+ Download" button. Clicking "+ Download" should open the modal. Close button should close it.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: NavBar and DownloadModal components"
```

---

## Task 10: VideoCard + LibraryPage

**Files:**
- Create: `frontend/src/components/VideoCard.tsx`
- Create: `frontend/src/components/LibraryPage.tsx`

- [ ] **Step 1: Create `frontend/src/components/VideoCard.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

interface Props {
  video: Video;
  onTagClick: (tag: string) => void;
}

export default function VideoCard({ video, onTagClick }: Props) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/player/${video.id}`)}
      style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#e5e7eb' }}>
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#9ca3af',
          }}>▶</div>
        )}
        <span style={{
          position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)',
          color: '#fff', fontSize: 11, padding: '2px 5px', borderRadius: 4,
        }}>
          {formatDuration(video.duration)}
        </span>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <p style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3, marginBottom: 4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {video.title}
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
          {video.channel} · {formatFileSize(video.file_size)}
        </p>
        {video.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {video.tags.map(tag => (
              <span
                key={tag}
                className="tag-pill"
                onClick={e => { e.stopPropagation(); onTagClick(tag); }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
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
      const data = await listVideos(params);
      setVideos(data);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTag]);

  const fetchTags = useCallback(async () => {
    const data = await listTags();
    setTags(data);
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

  function handleLibraryRefresh() {
    fetchVideos();
    fetchTags();
  }

  return (
    <>
      <NavBar
        searchQuery={searchQuery}
        onSearch={handleSearch}
        onLibraryRefresh={handleLibraryRefresh}
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        {/* Tag filter pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <span
            className={`tag-pill ${!activeTag && !searchQuery ? 'active' : ''}`}
            onClick={() => { setActiveTag(null); setSearchQuery(''); }}
          >
            All
          </span>
          {tags.map(tag => (
            <span
              key={tag}
              className={`tag-pill ${activeTag === tag ? 'active' : ''}`}
              onClick={() => handleTagClick(tag)}
            >
              {tag}
            </span>
          ))}
        </div>

        {loading && (
          <p style={{ color: '#6b7280', textAlign: 'center', marginTop: 48 }}>Loading...</p>
        )}

        {!loading && videos.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 80, color: '#6b7280' }}>
            <p style={{ fontSize: 48, marginBottom: 12 }}>📭</p>
            <p style={{ fontSize: 16 }}>No videos yet. Click "+ Download" to add one.</p>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 20,
        }}>
          {videos.map(video => (
            <VideoCard key={video.id} video={video} onTagClick={handleTagClick} />
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Manually verify in browser**

With backend running (`uvicorn main:app --reload` in `backend/`) and frontend dev server running (`npm run dev` in `frontend/`):

1. Open http://localhost:5173
2. Library page loads with "No videos yet" state
3. Tag pills area is present (empty)
4. Search input in nav filters videos live
5. "+ Download" opens modal

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/VideoCard.tsx frontend/src/components/LibraryPage.tsx
git commit -m "feat: VideoCard and LibraryPage with tag filter and search"
```

---

## Task 11: PlayerPage

**Files:**
- Create: `frontend/src/components/PlayerPage.tsx`

- [ ] **Step 1: Create `frontend/src/components/PlayerPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavBar from './NavBar';
import { getVideo, updateVideoTags, streamUrl, formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoId = Number(id);

  const [video, setVideo] = useState<Video | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getVideo(videoId)
      .then(v => {
        setVideo(v);
        setTagInput(v.tags.join(', '));
      })
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
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <>
        <NavBar searchQuery="" onSearch={() => {}} onLibraryRefresh={() => {}} />
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <p style={{ fontSize: 48 }}>⚠️</p>
          <p style={{ fontSize: 16, color: '#6b7280', marginTop: 12 }}>
            File not found on disk.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 20 }}
            onClick={() => navigate('/')}
          >
            Back to Library
          </button>
        </div>
      </>
    );
  }

  if (!video) {
    return (
      <>
        <NavBar searchQuery="" onSearch={() => {}} onLibraryRefresh={() => {}} />
        <p style={{ textAlign: 'center', marginTop: 80, color: '#6b7280' }}>Loading...</p>
      </>
    );
  }

  return (
    <>
      <NavBar searchQuery="" onSearch={() => navigate(`/?q=${encodeURIComponent('')}`)} onLibraryRefresh={() => {}} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', marginBottom: 16, fontSize: 14 }}
        >
          ← Back to Library
        </button>

        {/* Video player */}
        <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          <video
            controls
            autoPlay
            style={{ width: '100%', display: 'block', maxHeight: '60vh' }}
            src={streamUrl(video.id)}
          />
        </div>

        {/* Title + download */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>
              {video.title}
            </h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              {video.channel} · {formatDuration(video.duration)} · {formatFileSize(video.file_size)}
            </p>
          </div>
          <a
            href={streamUrl(video.id)}
            download={`${video.title}.mp4`}
            className="btn-primary"
            style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-block', textDecoration: 'none' }}
          >
            ↓ Download MP4
          </a>
        </div>

        {/* Metadata */}
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, fontSize: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={{ color: '#6b7280' }}>Downloaded</span>
              <p style={{ marginTop: 2 }}>{new Date(video.downloaded_at).toLocaleDateString()}</p>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Original URL</span>
              <p style={{ marginTop: 2 }}>
                <a href={video.yt_url} target="_blank" rel="noreferrer"
                  style={{ color: '#ff4444', wordBreak: 'break-all' }}>
                  {video.yt_url}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Tag editor */}
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, fontSize: 14 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Tags</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="music, lofi, study"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTags(); }}
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14,
              }}
            />
            <button className="btn-primary" onClick={handleSaveTags} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {video.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {video.tags.map(tag => (
                <span key={tag} className="tag-pill active">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Manually verify in browser**

With both backend and frontend running:
1. Download a real YouTube video via the modal
2. After download completes, add tags and click "Save to Library"
3. Video card appears in the library grid
4. Click the card — player page loads and video streams
5. Seeking works (scrub the progress bar)
6. Tag editor: edit tags, press Save — tags update
7. "↓ Download MP4" button downloads the file to your machine

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlayerPage.tsx
git commit -m "feat: PlayerPage with video player, metadata, and tag editor"
```

---

## Task 12: Docker + Nginx Deployment

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

# Install ffmpeg (required by yt-dlp for merging video+audio)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Copy built frontend into backend/frontend/dist so FastAPI can serve it
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

    # Large body for potential future upload endpoints
    client_max_body_size 0;

    location / {
        proxy_pass         http://app:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;

        # Required for video streaming — disable buffering so range requests work
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }
}
```

> **Note:** For HTTPS, install certbot on the VPS and run:
> `certbot --nginx -d yourdomain.com`
> Certbot will update nginx.conf automatically.

- [ ] **Step 4: Build and test locally with Docker**

```bash
docker compose build
docker compose up -d
```

Open http://localhost — expected: the full app loads and works. Download a video, verify it appears in the library and plays.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml nginx.conf
git commit -m "feat: Docker multi-stage build and Nginx reverse proxy"
```

---

## Deployment to VPS

After all tasks are complete, deploy to your Linux VPS:

```bash
# On your VPS
git clone <your-repo> youtube-library
cd youtube-library
docker compose up -d
```

For HTTPS (replace `yourdomain.com`):
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

The app will be available at `https://yourdomain.com`.
