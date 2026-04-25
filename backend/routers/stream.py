import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from backend import db

router = APIRouter(tags=["stream"])
CHUNK_SIZE = 1024 * 1024  # 1 MB


@router.get("/stream/{video_id}")
def stream_video(video_id: int, request: Request):
    conn = db.get_db()
    try:
        row = conn.execute("SELECT file_path FROM videos WHERE id=?", (video_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Video not found")
        file_path = row["file_path"]
    finally:
        conn.close()

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(
            file_path,
            media_type="video/mp4",
            content_disposition_type="inline",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Cache-Control": "no-store, no-transform",
                "X-Accel-Buffering": "no",
                "Vary": "Range",
            },
        )

    raw = range_header.replace("bytes=", "").split("-")
    start = int(raw[0]) if raw[0] else 0
    end = int(raw[1]) if raw[1] else file_size - 1
    end = min(end, file_size - 1)
    length = end - start + 1

    def _iter_range():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        _iter_range(),
        status_code=206,
        media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
            "Vary": "Range",
        },
    )


@router.head("/stream/{video_id}")
def stream_video_head(video_id: int, request: Request):
    return stream_video(video_id, request)
