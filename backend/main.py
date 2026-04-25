from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv(Path(__file__).resolve().parent.parent / '.env')

from backend.cookies_manager import ensure_cookies_dir
from backend.db import init_db
from backend.routers import videos, tags, download, stream, translate


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_cookies_dir()
    init_db()
    yield


app = FastAPI(title='ARCHIVE', lifespan=lifespan)

app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
app.include_router(stream.router)
app.include_router(translate.router)
