import os
import shutil

import yt_dlp

from backend import config, db
from backend.cookies_manager import cleanup_temp_cookiefile, get_yt_dlp_cookie_opts, make_temp_cookiefile

_FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None


def get_available_resolutions(url: str) -> list[int]:
    """Return sorted-descending list of unique video heights available for the URL."""
    temp_cookiefile = make_temp_cookiefile()
    cookie_opts = get_yt_dlp_cookie_opts(temp_cookiefile)
    ydl_opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
        "extractor_args": {"youtube": {"player_client": ["tv", "web_embedded", "android", "ios", "web"]}},
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/135.0.0.0 Safari/537.36"
            )
        },
        "js_runtimes": {"node": {"path": "/usr/bin/node"}},
        **cookie_opts,
        **({"proxy": config.YTDLP_PROXY} if config.YTDLP_PROXY else {}),
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    finally:
        cleanup_temp_cookiefile(temp_cookiefile)
    formats = info.get("formats") or []
    heights = sorted(
        {f["height"] for f in formats if f.get("height") and f.get("vcodec") != "none"},
        reverse=True,
    )
    return heights


def run_download(job_id: str, url: str, resolution: int | None = None) -> None:
    output_path: str | None = None
    temp_cookiefile: str | None = None
    file_index = [0]
    last_filename = [None]

    def _progress_hook(d: dict) -> None:
        nonlocal output_path
        if d["status"] == "downloading":
            filename = d.get("filename")
            if filename != last_filename[0]:
                last_filename[0] = filename
                file_index[0] = min(file_index[0] + (1 if last_filename[0] else 0), 1)

            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            file_pct = (downloaded / total * 100) if total else 0
            progress = min(int(file_index[0] * 50 + file_pct / 2), 99)
            with db.write_lock:
                conn = db.get_db()
                conn.execute("UPDATE download_jobs SET progress=? WHERE id=?", (progress, job_id))
                conn.commit()
                conn.close()
        elif d["status"] == "finished":
            output_path = d.get("filename")

    if resolution:
        if _FFMPEG_AVAILABLE:
            fmt = (
                f"bestvideo[height<={resolution}]+bestaudio"
                f"/best[height<={resolution}]"
                f"/best"
            )
        else:
            fmt = (
                f"best[height<={resolution}][ext=mp4]"
                f"/best[height<={resolution}]"
                f"/best[ext=mp4]/best"
            )
    elif _FFMPEG_AVAILABLE:
        # 1. best video ≤1080p + best audio, merged to mp4
        # 2. fallback: best video ≤720p + best audio (if no 1080p stream exists)
        # 3. last resort: any single-file best
        fmt = (
            "bestvideo[height<=1080]+bestaudio/bestvideo[height<=720]+bestaudio/best"
        )
    else:
        fmt = "best[height<=1080][ext=mp4]/best[height<=720][ext=mp4]/best[ext=mp4]/best"

    temp_cookiefile = make_temp_cookiefile()
    cookie_opts = get_yt_dlp_cookie_opts(temp_cookiefile)

    ydl_opts = {
        "format": fmt,
        "outtmpl": os.path.join(config.VIDEOS_DIR, "%(id)s.%(ext)s"),
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook],
        "quiet": True,
        "no_warnings": True,
        # tv and web_embedded provide DASH up to 4K without a GVS PO token and are
        # not skipped when cookies are present (unlike android/ios which yt-dlp drops
        # when a cookiefile is configured).  android/ios kept as cookie-free fallback;
        # web is last resort (SABR-throttled to 360p without a GVS PO token).
        "extractor_args": {"youtube": {"player_client": ["tv", "web_embedded", "android", "ios", "web"]}},
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/135.0.0.0 Safari/537.36"
            )
        },
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "js_runtimes": {"node": {"path": "/usr/bin/node"}},
        **cookie_opts,
        **({"proxy": config.YTDLP_PROXY} if config.YTDLP_PROXY else {}),
    }

    with db.write_lock:
        conn = db.get_db()
        conn.execute("UPDATE download_jobs SET status='downloading' WHERE id=?", (job_id,))
        conn.commit()
        conn.close()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        video_id_str = info.get("id", job_id)
        mp4_path = os.path.join(config.VIDEOS_DIR, f"{video_id_str}.mp4")
        if os.path.exists(mp4_path):
            file_path = mp4_path
        elif output_path and os.path.exists(output_path):
            file_path = output_path
        else:
            file_path = next(
                (os.path.join(config.VIDEOS_DIR, f)
                 for f in os.listdir(config.VIDEOS_DIR)
                 if f.startswith(video_id_str)),
                mp4_path,
            )
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        if not file_size:
            raise RuntimeError("Download completed but output file is missing or empty")

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
    finally:
        cleanup_temp_cookiefile(temp_cookiefile)
