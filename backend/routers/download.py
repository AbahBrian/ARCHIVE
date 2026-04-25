import uuid

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend import db
from backend.cookies_manager import get_cookies_status, save_uploaded_cookies, test_youtube_cookies
from backend.downloader import get_available_resolutions, run_download

router = APIRouter(prefix="/api/download", tags=["download"])


class DownloadRequest(BaseModel):
    url: str
    resolution: int | None = None


class CookieTestRequest(BaseModel):
    url: str | None = None


@router.get("/resolutions")
def fetch_resolutions(url: str):
    try:
        heights = get_available_resolutions(url)
        return {"resolutions": heights}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("")
def start_download(body: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    with db.write_lock:
        conn = db.get_db()
        conn.execute(
            "INSERT INTO download_jobs (id, yt_url, status) VALUES (?, ?, 'pending')",
            (job_id, body.url),
        )
        conn.commit()
        conn.close()
    background_tasks.add_task(run_download, job_id, body.url, body.resolution)
    return {"job_id": job_id}


@router.get("/cookies/status")
def cookies_status():
    return get_cookies_status()


@router.post("/cookies/upload")
async def upload_cookies(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Cookies file is empty")
    return save_uploaded_cookies(content)


@router.post("/cookies/test")
def cookies_test(body: CookieTestRequest):
    try:
        return test_youtube_cookies(body.url or "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # test_youtube_cookies already produces human-readable messages for the
        # common failure modes; surface them directly.
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{job_id}/status")
def get_status(job_id: str):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT * FROM download_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)
    finally:
        conn.close()
