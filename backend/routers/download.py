import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import db
from downloader import run_download

router = APIRouter(prefix="/api/download", tags=["download"])


class DownloadRequest(BaseModel):
    url: str


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
    background_tasks.add_task(run_download, job_id, body.url)
    return {"job_id": job_id}


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
