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
