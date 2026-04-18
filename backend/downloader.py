import os
import shutil
import yt_dlp
import config
import db

_FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None


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

    if _FFMPEG_AVAILABLE:
        # Best quality: separate video+audio merged by ffmpeg (supports 2h+)
        fmt = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
    else:
        # No ffmpeg: must pick a pre-muxed single stream (video+audio combined)
        fmt = "best[ext=mp4]/best[ext=webm]/best"

    ydl_opts = {
        "format": fmt,
        "outtmpl": os.path.join(config.VIDEOS_DIR, "%(id)s.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
        **({"cookiefile": os.environ["COOKIES_FILE"]} if os.environ.get("COOKIES_FILE") else {}),
    }

    with db.write_lock:
        conn = db.get_db()
        conn.execute("UPDATE download_jobs SET status='downloading' WHERE id=?", (job_id,))
        conn.commit()
        conn.close()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        # After a merge the final file is always .mp4; the hook may have
        # captured the intermediate filename, so try mp4 first.
        video_id_str = info.get("id", job_id)
        mp4_path = os.path.join(config.VIDEOS_DIR, f"{video_id_str}.mp4")
        if os.path.exists(mp4_path):
            file_path = mp4_path
        elif output_path and os.path.exists(output_path):
            file_path = output_path
        else:
            # Fallback: find any file that starts with the video id
            file_path = next(
                (os.path.join(config.VIDEOS_DIR, f)
                 for f in os.listdir(config.VIDEOS_DIR)
                 if f.startswith(video_id_str)),
                mp4_path,
            )
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
