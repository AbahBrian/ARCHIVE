import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from db import init_db
from routers import videos, tags, download, stream


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ARCHIVE", lifespan=lifespan)

app.include_router(videos.router)
app.include_router(tags.router)
app.include_router(download.router)
app.include_router(stream.router)

_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
