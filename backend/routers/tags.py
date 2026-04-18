from fastapi import APIRouter
import db

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags():
    conn = db.get_db()
    try:
        rows = conn.execute("SELECT name FROM tags ORDER BY name").fetchall()
        return [row["name"] for row in rows]
    finally:
        conn.close()
