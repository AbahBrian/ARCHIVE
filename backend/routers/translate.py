import os
import uuid
import asyncio
import tempfile
import subprocess
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

import db
import config

router = APIRouter(prefix="/api/translate", tags=["translate"])

_OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
_OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")


def _set_job(job_id: str, **kwargs) -> None:
    with db.write_lock:
        conn = db.get_db()
        try:
            sets = ", ".join(f"{k}=?" for k in kwargs)
            conn.execute(f"UPDATE translation_jobs SET {sets} WHERE id=?", (*kwargs.values(), job_id))
            conn.commit()
        finally:
            conn.close()


def _transcribe(file_path: str) -> str:
    from faster_whisper import WhisperModel
    model = WhisperModel("base", compute_type="int8")
    segments, _ = model.transcribe(file_path, beam_size=5)
    return " ".join(s.text.strip() for s in segments)


def _translate_text(text: str) -> str:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if _OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {_OLLAMA_API_KEY}"
    prompt = (
        "Translate the following text to Bahasa Indonesia. "
        "Output only the translation, no explanation:\n\n" + text
    )
    with httpx.Client(timeout=180) as client:
        resp = client.post(
            f"{_OLLAMA_BASE_URL}/api/generate",
            headers=headers,
            json={"model": _OLLAMA_MODEL, "prompt": prompt, "stream": False},
        )
        if resp.status_code == 401:
            raise RuntimeError("Ollama authentication failed — check OLLAMA_API_KEY.")
        resp.raise_for_status()
        return resp.json()["response"].strip()


async def _synthesize(text: str, output_path: str) -> None:
    import edge_tts
    communicate = edge_tts.Communicate(text, "id-ID-ArdiNeural")
    await communicate.save(output_path)


def run_translation(job_id: str, video_id: int) -> None:
    conn = db.get_db()
    try:
        row = conn.execute("SELECT file_path FROM videos WHERE id=?", (video_id,)).fetchone()
    finally:
        conn.close()

    if not row:
        _set_job(job_id, status="failed", error="Video not found")
        return

    file_path: str = row["file_path"]

    try:
        # Stage 1 — Transcribe
        _set_job(job_id, status="transcribing", stage="transcribing", progress=5)
        full_text = _transcribe(file_path)
        _set_job(job_id, progress=30)

        # Stage 2 — Translate
        _set_job(job_id, status="translating", stage="translating", progress=35)
        translated = _translate_text(full_text)
        _set_job(job_id, progress=60)

        # Stage 3 — Synthesize TTS
        _set_job(job_id, status="synthesizing", stage="synthesizing", progress=65)
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "tts.mp3")
            asyncio.run(_synthesize(translated, audio_path))
            _set_job(job_id, progress=80)

            # Stage 4 — Merge audio + video
            _set_job(job_id, status="merging", stage="merging", progress=82)
            stem = Path(file_path).stem
            output_path = os.path.join(config.VIDEOS_DIR, f"{stem}_id_{job_id[:8]}.mp4")
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", file_path,
                    "-i", audio_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-shortest",
                    output_path,
                ],
                capture_output=True,
                timeout=600,
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg error: {result.stderr.decode()[-500:]}")

        _set_job(job_id, status="done", stage="done", progress=100, output_path=output_path)

    except Exception as exc:
        _set_job(job_id, status="failed", error=str(exc)[:500])


@router.post("/{video_id}")
def start_translation(video_id: int, background_tasks: BackgroundTasks):
    conn = db.get_db()
    try:
        if not conn.execute("SELECT id FROM videos WHERE id=?", (video_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Video not found")
    finally:
        conn.close()

    job_id = str(uuid.uuid4())
    with db.write_lock:
        conn = db.get_db()
        try:
            conn.execute(
                "INSERT INTO translation_jobs (id, video_id, status, progress) VALUES (?, ?, 'pending', 0)",
                (job_id, video_id),
            )
            conn.commit()
        finally:
            conn.close()

    background_tasks.add_task(run_translation, job_id, video_id)
    return {"job_id": job_id}


@router.get("/{job_id}/status")
def get_translation_status(job_id: str):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT * FROM translation_jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return dict(row)
    finally:
        conn.close()


@router.get("/{job_id}/download")
def download_translated(job_id: str):
    conn = db.get_db()
    try:
        row = conn.execute(
            "SELECT status, output_path FROM translation_jobs WHERE id=?", (job_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        if row["status"] != "done":
            raise HTTPException(status_code=409, detail="Translation not complete")
        path = row["output_path"]
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Output file not found")
    finally:
        conn.close()
    return FileResponse(path, media_type="video/mp4", filename=Path(path).name)
