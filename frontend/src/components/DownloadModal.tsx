import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { startDownload, getDownloadStatus, updateVideoTags } from '../api';
import type { DownloadJob } from '../types';

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;

export default function DownloadModal({ onClose, onComplete }: Props) {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      const { job_id } = await startDownload(url.trim());
      pollRef.current = setInterval(async () => {
        const status = await getDownloadStatus(job_id);
        setJob(status);
        if (status.status === 'done' || status.status === 'failed') {
          clearInterval(pollRef.current!);
          setSubmitting(false);
        }
      }, 2000);
    } catch {
      setError('Failed to start download. Check the URL and try again.');
      setSubmitting(false);
    }
  }

  async function handleSaveTags() {
    if (!job?.video_id) return;
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) await updateVideoTags(job.video_id, tags);
    onComplete();
    onClose();
  }

  return (
    /* Backdrop */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={spring}
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '32px 32px 28px',
          width: '100%',
          maxWidth: 480,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{
            fontFamily: 'var(--font)', fontSize: 20, fontWeight: 800,
            letterSpacing: '-0.03em', color: 'var(--text)',
          }}>
            Download Video
          </h2>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none', borderRadius: '50%',
              width: 32, height: 32, fontSize: 18,
              color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </motion.button>
        </div>

        {/* Animated content states */}
        <AnimatePresence mode="wait">

          {/* ── State 1: URL input ─────────────────────────────────── */}
          {!job && (
            <motion.form
              key="url-form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
                autoFocus
                placeholder="https://youtube.com/watch?v=..."
                style={{
                  width: '100%',
                  background: 'var(--surface-high)',
                  border: 'none',
                  borderRadius: 9999,
                  padding: '11px 20px',
                  fontSize: 14,
                  color: 'var(--text)',
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  marginBottom: 12,
                  boxSizing: 'border-box',
                  transition: 'box-shadow 0.15s',
                }}
                onFocus={e => (e.target.style.boxShadow = '0 0 0 2px rgba(229,9,20,0.4)')}
                onBlur={e => (e.target.style.boxShadow = 'none')}
              />

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10, fontWeight: 500 }}
                >
                  {error}
                </motion.p>
              )}

              <motion.button
                type="submit"
                disabled={submitting}
                whileHover={{ opacity: 0.9 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%',
                  background: submitting ? 'var(--surface-high)' : 'var(--red)',
                  color: submitting ? 'var(--text-muted)' : '#fff',
                  border: 'none', borderRadius: 9999,
                  padding: '12px 0',
                  fontSize: 14, fontWeight: 700,
                  fontFamily: 'var(--font)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                  letterSpacing: '0.02em',
                }}
              >
                {submitting ? 'Starting...' : 'Download'}
              </motion.button>
            </motion.form>
          )}

          {/* ── State 2: Downloading progress ─────────────────────── */}
          {job && job.status !== 'done' && job.status !== 'failed' && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>
                  {job.status === 'pending' ? 'Queued...' : 'Downloading...'}
                </p>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {job.progress}%
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ background: 'var(--surface-high)', borderRadius: 9999, height: 6, overflow: 'hidden', marginBottom: 10 }}>
                <motion.div
                  style={{
                    height: '100%',
                    background: 'var(--red)',
                    borderRadius: 9999,
                    boxShadow: '0 0 8px rgba(229,9,20,0.6)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${job.progress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.4 }}
                />
              </div>

              {/* Pulse dots */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20 }}>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── State 3: Failed ────────────────────────────────────── */}
          {job?.status === 'failed' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
                <p style={{ fontSize: 28, marginBottom: 12 }}>⚠️</p>
                <p style={{ color: 'var(--red)', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Download failed
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                  {job.error || 'Unknown error occurred.'}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setJob(null); setUrl(''); setError(''); }}
                style={{
                  width: '100%', background: 'var(--surface-high)',
                  color: 'var(--text)', border: 'none', borderRadius: 9999,
                  padding: '11px 0', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                Try Again
              </motion.button>
            </motion.div>
          )}

          {/* ── State 4: Done — add tags ────────────────────────────── */}
          {job?.status === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ ...spring }}
            >
              {/* Success badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.05 }}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}
                >
                  ✓
                </motion.div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
                  Download complete!
                </p>
              </div>

              {/* Tag input */}
              <label style={{
                display: 'block', fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8,
              }}>
                Add Tags <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(comma-separated, optional)</span>
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveTags(); }}
                placeholder="music, lofi, study"
                style={{
                  width: '100%',
                  background: 'var(--surface-high)',
                  border: 'none', borderRadius: 9999,
                  padding: '11px 20px',
                  fontSize: 14, color: 'var(--text)',
                  fontFamily: 'var(--font)', outline: 'none',
                  marginBottom: 16, boxSizing: 'border-box',
                  transition: 'box-shadow 0.15s',
                }}
                onFocus={e => (e.target.style.boxShadow = '0 0 0 2px rgba(229,9,20,0.4)')}
                onBlur={e => (e.target.style.boxShadow = 'none')}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveTags}
                  style={{
                    flex: 1, background: 'var(--red)', color: '#fff',
                    border: 'none', borderRadius: 9999,
                    padding: '12px 0', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  Save to Library
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  style={{
                    background: 'var(--surface-high)', color: 'var(--text-muted)',
                    border: 'none', borderRadius: 9999,
                    padding: '12px 18px', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  Skip
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
