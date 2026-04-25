import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import db

router = APIRouter(prefix="/api/videos", tags=["videos"])


class TagsUpdate(BaseModel):
    tags: list[str]


def _video_with_tags(video_id: int, conn) -> dict | None:
    row = conn.execute("SELECT * FROM videos WHERE id=?", (video_id,)).fetchone()
    if not row:
        return None
    video = dict(row)
    tag_rows = conn.execute(
        """SELECT t.name FROM tags t
           JOIN video_tags vt ON t.id = vt.tag_id
           WHERE vt.video_id = ?
           ORDER BY t.name""",
        (video_id,),
    ).fetchall()
    video["tags"] = [r["name"] for r in tag_rows]
    return video


@router.get("")
def list_videos(q: Optional[str] = None, tag: Optional[str] = None):
    conn = db.get_db()
    try:
        if tag:
            rows = conn.execute(
                """SELECT v.id FROM videos v
                   JOIN video_tags vt ON v.id = vt.video_id
                   JOIN tags t ON vt.tag_id = t.id
                   WHERE t.name = ?
                   ORDER BY v.downloaded_at DESC""",
                (tag,),
            ).fetchall()
        elif q:
            rows = conn.execute(
                """SELECT id FROM videos
                   WHERE title LIKE ? OR channel LIKE ?
                   ORDER BY downloaded_at DESC""",
                (f"%{q}%", f"%{q}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM videos ORDER BY downloaded_at DESC"
            ).fetchall()
        return [_video_with_tags(row["id"], conn) for row in rows]
    finally:
        conn.close()


@router.get("/{video_id}")
def get_video(video_id: int):
    conn = db.get_db()
    try:
        video = _video_with_tags(video_id, conn)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        return video
    finally:
        conn.close()


@router.patch("/{video_id}/tags")
def update_tags(video_id: int, body: TagsUpdate):
    conn = db.get_db()
    try:
        if not conn.execute("SELECT id FROM videos WHERE id=?", (video_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Video not found")
    finally:
        conn.close()

    with db.write_lock:
        conn = db.get_db()
        try:
            conn.execute("DELETE FROM video_tags WHERE video_id=?", (video_id,))
            for name in body.tags:
                name = name.strip().lower()
                if not name:
                    continue
                conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
                tag_id = conn.execute(
                    "SELECT id FROM tags WHERE name=?", (name,)
                ).fetchone()["id"]
                conn.execute(
                    "INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)",
                    (video_id, tag_id),
                )
            conn.commit()
            return _video_with_tags(video_id, conn)
        finally:
            conn.close()


@router.delete("/{video_id}", status_code=204)
def delete_video(video_id: int):
    conn = db.get_db()
    try:
        row = conn.execute(
            "SELECT file_path FROM videos WHERE id=?", (video_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Video not found")
        file_path = row["file_path"]
    finally:
        conn.close()

    with db.write_lock:
        conn = db.get_db()
        try:
            conn.execute("DELETE FROM download_jobs WHERE video_id=?", (video_id,))
            conn.execute("DELETE FROM videos WHERE id=?", (video_id,))
            conn.commit()
        finally:
            conn.close()

    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass
