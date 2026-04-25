import os

DB_PATH = os.getenv("DB_PATH", "/data/library.db")
VIDEOS_DIR = os.getenv("VIDEOS_DIR", "/videos")
SUBTITLES_DIR = os.getenv("SUBTITLES_DIR", "/data/subtitles")

YTDLP_BROWSER = os.getenv("YTDLP_BROWSER", "").strip()
YTDLP_BROWSER_PROFILE = os.getenv("YTDLP_BROWSER_PROFILE", "").strip()
YTDLP_BROWSER_KEYRING = os.getenv("YTDLP_BROWSER_KEYRING", "").strip()
YTDLP_BROWSER_CONTAINER = os.getenv("YTDLP_BROWSER_CONTAINER", "").strip()
YTDLP_PROXY = os.getenv("YTDLP_PROXY", "").strip()
