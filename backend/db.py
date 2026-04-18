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
