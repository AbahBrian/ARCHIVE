import os
import shutil
import tempfile
from pathlib import Path

import yt_dlp

from backend import config

COOKIES_DIR = Path(os.getenv("COOKIES_DIR", "/data/cookies"))
COOKIES_PATH = COOKIES_DIR / "youtube-cookies.txt"
LEGACY_COOKIES_PATH = Path(os.getenv("COOKIES_PATH", "/data/cookies.txt"))


def ensure_cookies_dir() -> None:
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)


def _path_has_content(path: Path) -> bool:
    try:
        return path.exists() and path.stat().st_size > 0
    except OSError:
        return False


def get_cookie_path() -> str | None:
    if _path_has_content(COOKIES_PATH):
        return str(COOKIES_PATH)
    if _path_has_content(LEGACY_COOKIES_PATH):
        return str(LEGACY_COOKIES_PATH)
    return None


def save_uploaded_cookies(content: bytes) -> dict:
    ensure_cookies_dir()
    COOKIES_PATH.write_bytes(content)
    try:
        os.chmod(COOKIES_PATH, 0o600)
    except OSError:
        pass
    try:
        LEGACY_COOKIES_PATH.write_bytes(content)
        os.chmod(LEGACY_COOKIES_PATH, 0o600)
    except OSError:
        pass
    return get_cookies_status()


def get_cookies_status() -> dict:
    active_path = get_cookie_path()
    size = os.path.getsize(active_path) if active_path and os.path.exists(active_path) else 0
    browser_source = get_browser_cookie_source()
    mode = "browser" if browser_source else ("file" if active_path and size > 0 else "none")
    return {
        "configured": bool(browser_source or (active_path and size > 0)),
        "mode": mode,
        "path": active_path or str(COOKIES_PATH),
        "size": size,
        "browser": browser_source,
        "primary_path": str(COOKIES_PATH),
        "legacy_path": str(LEGACY_COOKIES_PATH),
    }


def get_browser_cookie_source() -> tuple | None:
    browser = config.YTDLP_BROWSER
    if not browser:
        return None

    source = [browser]
    if config.YTDLP_BROWSER_PROFILE:
        source.append(config.YTDLP_BROWSER_PROFILE)
    if config.YTDLP_BROWSER_KEYRING:
        source.append(config.YTDLP_BROWSER_KEYRING)
    if config.YTDLP_BROWSER_CONTAINER:
        source.append(config.YTDLP_BROWSER_CONTAINER)
    return tuple(source)


def make_temp_cookiefile() -> str | None:
    source = get_cookie_path()
    if not source or not os.path.exists(source):
        return None

    with open(source, "rb") as src:
        with tempfile.NamedTemporaryFile(prefix="archive-cookies-", suffix=".txt", delete=False) as tmp:
            shutil.copyfileobj(src, tmp)
            return tmp.name


def get_yt_dlp_cookie_opts(temp_cookiefile: str | None = None) -> dict:
    browser_source = get_browser_cookie_source()
    if browser_source:
        return {"cookiesfrombrowser": browser_source}
    if temp_cookiefile:
        return {"cookiefile": temp_cookiefile}
    return {}


def cleanup_temp_cookiefile(path: str | None) -> None:
    if path and os.path.exists(path):
        os.remove(path)


def test_youtube_cookies(url: str = "https://www.youtube.com/watch?v=dQw4w9WgXcQ") -> dict:
    temp_cookiefile = make_temp_cookiefile()
    cookie_opts = get_yt_dlp_cookie_opts(temp_cookiefile)
    if not cookie_opts:
        raise FileNotFoundError("No cookie source configured")

    try:
        opts = {
            "quiet": True,
            "no_warnings": False,
            "cookiefile": temp_cookiefile,
            "skip_download": True,
            # No protocol filters: as of 2025 the YouTube web client requires a
            # PO token to return non-HLS formats; filtering out m3u8 leaves
            # nothing for the selector to match.  Use ios as primary (no PO
            # token needed) with web as fallback so the cookies file is still
            # exercised.
            "format": "bestvideo+bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["ios", "web", "tv_embedded"]}},
            "js_runtimes": {"node": {"path": "/usr/bin/node"}},
            "http_headers": {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/135.0.0.0 Safari/537.36"
                )
            },
            "socket_timeout": 30,
            "retries": 3,
            "fragment_retries": 3,
            **cookie_opts,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        return {
            "ok": True,
            "title": info.get("title"),
            "extractor": info.get("extractor_key"),
        }
    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc)
        lowered = msg.lower()
        if "sign in" in lowered or "bot" in lowered or "not a robot" in lowered:
            raise RuntimeError(
                "YouTube rejected the request as a bot — cookies are present but may be "
                "expired or from the wrong account. Export fresh cookies from a logged-in "
                "browser session and upload them."
            ) from exc
        if "requested format is not available" in lowered or "no video formats found" in lowered:
            raise RuntimeError(
                "yt-dlp could not find any playable format for the test video. "
                "This usually means the installed yt-dlp is outdated — rebuild the "
                "container to pull the latest version."
            ) from exc
        raise
    finally:
        cleanup_temp_cookiefile(temp_cookiefile)
