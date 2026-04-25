import os
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from backend import config, db
from backend.translator import run_translate

router = APIRouter(prefix="/api", tags=["translate"])


@router.post("/videos/{video_id}/translate")
def start_translate(video_id: int, background_tasks: BackgroundTasks):
    conn = db.get_db()
    try:
        video = conn.execute("SELECT * FROM videos WHERE id=?", (video_id,)).fetchone()
    finally:
        conn.close()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # If subtitle file already exists, no need to re-translate
    vtt_path = os.path.join(config.SUBTITLES_DIR, f"{video_id}.vtt")
    if os.path.exists(vtt_path):
        return {"status": "done", "job_id": None}

    # Return any in-progress job for this video
    conn = db.get_db()
    try:
        existing = conn.execute(
            "SELECT * FROM translate_jobs WHERE video_id=? AND status IN ('pending', 'running')"
            " ORDER BY created_at DESC LIMIT 1",
            (video_id,),
        ).fetchone()
    finally:
        conn.close()

    if existing:
        return {
            "status": existing["status"],
            "job_id": existing["id"],
            "progress": existing["progress"],
        }

    job_id = str(uuid.uuid4())
    with db.write_lock:
        conn = db.get_db()
        conn.execute(
            "INSERT INTO translate_jobs (id, video_id, status) VALUES (?, ?, 'pending')",
            (job_id, video_id),
        )
        conn.commit()
        conn.close()

    background_tasks.add_task(run_translate, job_id, video_id, dict(video)["file_path"])
    return {"status": "pending", "job_id": job_id}


@router.get("/translate/{job_id}/status")
def translate_status(job_id: str):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT * FROM translate_jobs WHERE id=?", (job_id,)).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    return dict(row)


@router.get("/videos/{video_id}/subtitles.vtt")
def get_subtitles(video_id: int):
    vtt_path = os.path.join(config.SUBTITLES_DIR, f"{video_id}.vtt")
    if not os.path.exists(vtt_path):
        raise HTTPException(status_code=404, detail="Subtitles not available")
    return FileResponse(
        vtt_path,
        media_type="text/vtt",
        headers={"Content-Type": "text/vtt; charset=utf-8"},
    )
