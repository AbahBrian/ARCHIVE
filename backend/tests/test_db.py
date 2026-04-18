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
