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
