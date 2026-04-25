import os
import subprocess
import tempfile
from typing import Optional

from backend import config, db


def _fmt_vtt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def run_translate(job_id: str, video_id: int, file_path: str) -> None:
    def _update(progress: int, status: str = "running", error: Optional[str] = None):
        with db.write_lock:
            conn = db.get_db()
            conn.execute(
                "UPDATE translate_jobs SET status=?, progress=?, error=? WHERE id=?",
                (status, progress, error, job_id),
            )
            conn.commit()
            conn.close()

    tmp_audio: Optional[str] = None
    try:
        os.makedirs(config.SUBTITLES_DIR, exist_ok=True)

        # Step 1: Extract 16kHz mono WAV for Whisper
        _update(5)
        tmp_audio = tempfile.mktemp(suffix=".wav")
        subprocess.run(
            [
                "ffmpeg", "-i", file_path,
                "-vn", "-acodec", "pcm_s16le",
                "-ar", "16000", "-ac", "1",
                tmp_audio, "-y",
            ],
            check=True,
            capture_output=True,
        )
        _update(15)

        # Step 2: Transcribe with faster-whisper (lazy import, large dep)
        from faster_whisper import WhisperModel

        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments_iter, info = model.transcribe(tmp_audio, beam_size=5)
        total_dur = info.duration or 0
        segments = []
        for seg in segments_iter:
            segments.append(seg)
            if total_dur > 0:
                pct = 15 + int((seg.end / total_dur) * 50)
                _update(min(pct, 64))
        _update(65)

        # Step 3: Translate to Indonesian when source language differs
        source_lang = info.language
        texts = [seg.text for seg in segments]

        if source_lang != "id":
            from deep_translator import GoogleTranslator

            translator = GoogleTranslator(source="auto", target="id")
            translated: list[str] = []
            total = max(len(texts), 1)
            for i, text in enumerate(texts):
                try:
                    t = translator.translate(text)
                    translated.append(t if t else text)
                except Exception:
                    translated.append(text)
                if i % 5 == 0:
                    pct = 65 + int((i / total) * 25)
                    _update(min(pct, 89))
        else:
            translated = texts

        _update(90)

        # Step 4: Write WebVTT
        out_path = os.path.join(config.SUBTITLES_DIR, f"{video_id}.vtt")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for i, (seg, text) in enumerate(zip(segments, translated), 1):
                f.write(f"{i}\n")
                f.write(f"{_fmt_vtt_time(seg.start)} --> {_fmt_vtt_time(seg.end)}\n")
                f.write(f"{text.strip()}\n\n")

        _update(100, status="done")

    except Exception as exc:
        _update(0, status="failed", error=str(exc))
    finally:
        if tmp_audio and os.path.exists(tmp_audio):
            os.remove(tmp_audio)
