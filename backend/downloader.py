import os
import shutil
from pathlib import Path
import yt_dlp
import config
import db

_DEFAULT_COOKIES = str(Path(__file__).resolve().parent / "cookies.txt")

_FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None


def run_download(job_id: str, url: str) -> None:
    output_path: str | None = None
    # Track two-pass download (video + audio) as halves of 0–100
    _file_index = [0]  # which file are we on (0=first, 1=second)
    _last_filename = [None]

    def _progress_hook(d: dict) -> None:
        nonlocal output_path
        if d["status"] == "downloading":
            filename = d.get("filename")
            if filename != _last_filename[0]:
                _last_filename[0] = filename
                _file_index[0] = min(_file_index[0] + (1 if _last_filename[0] else 0), 1)

            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            file_pct = (downloaded / total * 100) if total else 0
            # Each file contributes half of the total progress bar
            progress = min(int(_file_index[0] * 50 + file_pct / 2), 99)
            with db.write_lock:
                conn = db.get_db()
                conn.execute("UPDATE download_jobs SET progress=? WHERE id=?", (progress, job_id))
                conn.commit()
                conn.close()
        elif d["status"] == "finished":
            output_path = d.get("filename")

    if _FFMPEG_AVAILABLE:
        fmt = "bestvideo[height<=1080][protocol!=m3u8][protocol!=m3u8_native]+bestaudio[protocol!=m3u8][protocol!=m3u8_native]/bestvideo[height<=1080]+bestaudio/best"
    else:
        fmt = "best[height<=1080][ext=mp4][protocol!=m3u8][protocol!=m3u8_native]/best[ext=mp4]/best[ext=webm]/best"

    _cookies = os.environ.get("COOKIES_FILE") or (_DEFAULT_COOKIES if Path(_DEFAULT_COOKIES).exists() else None)

    ydl_opts = {
        "format": fmt,
        "outtmpl": os.path.join(config.VIDEOS_DIR, "%(id)s.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"node": {}},
        **({"cookiefile": _cookies} if _cookies else {}),
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
