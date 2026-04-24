import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  getVideo,
  startTranslation,
  getTranslationStatus,
  translationDownloadUrl,
  formatDuration,
} from '../api';
import type { Video, TranslationJob } from '../types';

const STAGE_LABELS: Record<string, string> = {
  pending: 'Waiting to start...',
  transcribing: 'Transcribing audio...',
  translating: 'Translating to Bahasa Indonesia...',
  synthesizing: 'Synthesizing voice (Ardi Neural)...',
  merging: 'Merging audio & video...',
  done: 'Translation complete!',
  failed: 'Translation failed.',
};

const STAGE_ORDER = ['transcribing', 'translating', 'synthesizing', 'merging', 'done'];

function StageTrack({ status }: { status: string }) {
  const current = STAGE_ORDER.indexOf(status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
      {STAGE_ORDER.slice(0, -1).map((stage, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : undefined }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: done ? '#22c55e' : active ? 'var(--red)' : 'var(--surface-high)',
              boxShadow: active ? '0 0 8px rgba(229,9,20,0.6)' : undefined,
              transition: 'background 0.4s',
            }} />
            {i < 3 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? '#22c55e' : 'var(--surface-high)',
                transition: 'background 0.4s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TranslateSection({ video }: { video: Video }) {
  const [job, setJob] = useState<TranslationJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    if (!job) return;
    if (job.status === 'done' || job.status === 'failed') return;
    const timer = setInterval(async () => {
      try {
        const updated = await getTranslationStatus(job.id);
        setJob(updated);
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job]);

  async function handleStart() {
    setStarting(true);
    setStartError('');
    try {
      const { job_id } = await startTranslation(video.id);
      const j = await getTranslationStatus(job_id);
      setJob(j);
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : 'Failed to start translation');
    } finally {
      setStarting(false);
    }
  }

  function handleReset() {
    setJob(null);
    setStartError('');
  }

  const isActive = job && job.status !== 'done' && job.status !== 'failed';

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'rgba(229,9,20,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--red)' }}>translate</span>
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
            Translate Audio
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Bahasa Indonesia · Ardi Neural voice · Whisper + Ollama
          </p>
        </div>
      </div>

      {/* Idle state */}
      {!job && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Transcribes audio with Whisper, translates with Ollama, synthesizes with edge-tts,
            then merges back using ffmpeg. Supports videos up to 30 minutes.
          </p>
          <motion.button
            whileHover={{ opacity: 0.88 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleStart}
            disabled={starting}
            style={{
              background: 'var(--red)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 22px',
              fontSize: 13, fontWeight: 700,
              cursor: starting ? 'not-allowed' : 'pointer',
              opacity: starting ? 0.65 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {starting ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                Starting...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                Start Translation
              </>
            )}
          </motion.button>
          {startError && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 10, fontWeight: 600 }}>{startError}</p>
          )}
        </div>
      )}

      {/* Active / done / failed */}
      {job && (
        <AnimatePresence mode="wait">
          <motion.div
            key={job.status}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Stage track */}
            {job.status !== 'failed' && <StageTrack status={job.status} />}

            {/* Status label */}
            <p style={{
              fontSize: 13, fontWeight: 600,
              color: job.status === 'done' ? '#22c55e' : job.status === 'failed' ? 'var(--red)' : 'var(--text-muted)',
              marginBottom: isActive ? 10 : 14,
            }}>
              {STAGE_LABELS[job.status] ?? job.status}
            </p>

            {/* Progress bar */}
            {isActive && (
              <div style={{ background: 'var(--surface-high)', borderRadius: 9999, height: 6, overflow: 'hidden', marginBottom: 16 }}>
                <motion.div
                  animate={{ width: `${job.progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ height: '100%', background: 'var(--red)', borderRadius: 9999, boxShadow: '0 0 8px rgba(229,9,20,0.5)' }}
                />
              </div>
            )}

            {/* Error detail */}
            {job.status === 'failed' && job.error && (
              <p style={{ fontSize: 12, color: 'rgba(229,9,20,0.75)', marginBottom: 14, lineHeight: 1.5 }}>
                {job.error}
              </p>
            )}

            {/* Done: download link */}
            {job.status === 'done' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <a
                  href={translationDownloadUrl(job.id)}
                  download
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#22c55e', color: '#fff',
                    borderRadius: 8, padding: '8px 18px',
                    fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                  Download Translated Video
                </a>
              </div>
            )}

            {/* Retry / reset */}
            {(job.status === 'done' || job.status === 'failed') && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleReset}
                style={{
                  background: 'none', color: 'var(--text-muted)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '6px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {job.status === 'failed' ? 'Try Again' : 'Translate Again'}
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function SubtitleSection() {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 12, padding: '20px 24px',
      opacity: 0.45, pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: 'rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>closed_caption</span>
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Add Subtitles</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Coming soon — Issue #14</p>
        </div>
      </div>
    </div>
  );
}

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoId = Number(id);
  const [video, setVideo] = useState<Video | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getVideo(videoId)
      .then(setVideo)
      .catch(() => setNotFound(true));
  }, [videoId]);

  if (notFound) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text)',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center' }}
        >
          <p style={{ fontSize: 52, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 24 }}>Video not found.</p>
          <motion.button
            whileTap={{ scale: 0.96 }} onClick={() => navigate('/')}
            style={{
              background: 'var(--red)', color: '#fff', border: 'none',
              borderRadius: 9999, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ← Back to Library
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (!video) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          style={{ color: 'var(--text-muted)', fontSize: 15 }}
        >
          Loading...
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)' }}
    >
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <motion.button
          whileHover={{ x: -2 }} whileTap={{ scale: 0.92 }}
          onClick={() => navigate('/')}
          style={{
            color: 'var(--text-muted)', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        </motion.button>

        <img src="/Logo.png" alt="ARCH:IVE" style={{ height: 28, width: 'auto', display: 'block' }} />

        <div style={{ flex: 1 }} />

        <motion.button
          whileHover={{ opacity: 0.8 }} whileTap={{ scale: 0.96 }}
          onClick={() => navigate(`/player/${video.id}`)}
          style={{
            color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: 'none', cursor: 'pointer',
          }}
        >
          View Player
        </motion.button>
      </header>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 24px 72px' }}>
        {/* Video metadata */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            display: 'flex', gap: 20, marginBottom: 36, alignItems: 'flex-start',
            background: 'var(--surface)', borderRadius: 12, padding: '20px',
          }}
        >
          {video.thumbnail && (
            <img
              src={video.thumbnail}
              alt={video.title}
              style={{
                width: 160, aspectRatio: '16/9', objectFit: 'cover',
                borderRadius: 8, flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'var(--red)', marginBottom: 8,
            }}>
              Edit Workspace
            </p>
            <h1 style={{
              fontSize: 'clamp(15px, 2.2vw, 22px)', fontWeight: 800,
              lineHeight: 1.25, color: 'var(--text)', marginBottom: 8,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {video.title}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {video.channel} · {formatDuration(video.duration)}
            </p>
          </div>
        </motion.div>

        {/* Feature sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
          >
            <TranslateSection video={video} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.14 }}
          >
            <SubtitleSection />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
