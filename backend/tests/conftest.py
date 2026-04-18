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
