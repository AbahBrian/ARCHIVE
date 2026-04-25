import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchResolutions, startDownload, getDownloadStatus, updateVideoTags } from '../api';
import type { DownloadJob } from '../types';
import CookiesPanel from './CookiesPanel';

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
  const [resolutions, setResolutions] = useState<number[] | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<number | 'best'>('best');
  const [loadingResolutions, setLoadingResolutions] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = window.innerWidth < 640;

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleFetchResolutions(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');
    setLoadingResolutions(true);
    try {
      const data = await fetchResolutions(url.trim());
      setResolutions(data.resolutions);
      setSelectedResolution('best');
    } catch {
      setError('Could not fetch resolutions. Check the URL and try again.');
    } finally {
      setLoadingResolutions(false);
    }
  }

  async function handleStartDownload() {
    setError('');
    setSubmitting(true);
    try {
      const resolution = selectedResolution === 'best' ? undefined : selectedResolution;
      const { job_id } = await startDownload(url.trim(), resolution);
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
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '0' : '20px',
      }}
    >
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: isMobile ? 80 : 32, scale: isMobile ? 1 : 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: isMobile ? 80 : 16, scale: isMobile ? 1 : 0.97 }}
        transition={spring}
        style={{
          background: 'var(--surface)',
          borderRadius: isMobile ? '16px 16px 0 0' : 16,
          padding: isMobile ? '24px 20px 32px' : '32px 32px 28px',
          width: '100%',
          maxWidth: isMobile ? '100%' : 480,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Handle bar on mobile */}
        {isMobile && (
          <div style={{
            width: 36, height: 4, borderRadius: 9999,
            background: 'rgba(255,255,255,0.15)',
            margin: '-8px auto 20px',
          }} />
        )}

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{
            fontFamily: 'var(--font)', fontSize: isMobile ? 18 : 20, fontWeight: 800,
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
              width: isMobile ? 36 : 32, height: isMobile ? 36 : 32, fontSize: 18,
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
          {!job && resolutions === null && (
            <motion.form
              key="url-form"
              onSubmit={handleFetchResolutions}
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
                autoFocus={!isMobile}
                placeholder="https://youtube.com/watch?v=..."
                style={{
                  width: '100%',
                  background: 'var(--surface-high)',
                  border: 'none',
                  borderRadius: 9999,
                  padding: isMobile ? '13px 20px' : '11px 20px',
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
                disabled={loadingResolutions}
                whileHover={{ opacity: 0.9 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%',
                  background: loadingResolutions ? 'var(--surface-high)' : 'var(--red)',
                  color: loadingResolutions ? 'var(--text-muted)' : '#fff',
                  border: 'none', borderRadius: 9999,
                  padding: isMobile ? '14px 0' : '12px 0',
                  fontSize: 14, fontWeight: 700,
                  fontFamily: 'var(--font)',
                  cursor: loadingResolutions ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                  letterSpacing: '0.02em',
                }}
              >
                {loadingResolutions ? 'Fetching resolutions...' : 'Next →'}
              </motion.button>

              <CookiesPanel />
            </motion.form>
          )}

          {/* ── State 2: Resolution picker ─────────────────────────── */}
          {!job && resolutions !== null && (
            <motion.div
              key="resolution-picker"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, wordBreak: 'break-all' }}>
                {url.length > 60 ? url.slice(0, 57) + '…' : url}
              </p>

              <label style={{
                display: 'block', fontSize: 11,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8,
              }}>
                Resolution
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedResolution('best')}
                  style={{
                    padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                    fontFamily: 'var(--font)', cursor: 'pointer',
                    border: selectedResolution === 'best' ? '2px solid var(--red)' : '2px solid rgba(255,255,255,0.1)',
                    background: selectedResolution === 'best' ? 'rgba(229,9,20,0.15)' : 'var(--surface-high)',
                    color: selectedResolution === 'best' ? 'var(--red)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  Best
                </motion.button>
                {resolutions.map(h => (
                  <motion.button
                    key={h}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedResolution(h)}
                    style={{
                      padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                      fontFamily: 'var(--font)', cursor: 'pointer',
                      border: selectedResolution === h ? '2px solid var(--red)' : '2px solid rgba(255,255,255,0.1)',
                      background: selectedResolution === h ? 'rgba(229,9,20,0.15)' : 'var(--surface-high)',
                      color: selectedResolution === h ? 'var(--red)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {h}p
                  </motion.button>
                ))}
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10, fontWeight: 500 }}
                >
                  {error}
                </motion.p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setResolutions(null); setError(''); }}
                  style={{
                    background: 'var(--surface-high)', color: 'var(--text-muted)',
                    border: 'none', borderRadius: 9999,
                    padding: isMobile ? '14px 18px' : '12px 18px',
                    fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  ← Back
                </motion.button>
                <motion.button
                  type="button"
                  disabled={submitting}
                  whileHover={{ opacity: 0.9 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleStartDownload}
                  style={{
                    flex: 1,
                    background: submitting ? 'var(--surface-high)' : 'var(--red)',
                    color: submitting ? 'var(--text-muted)' : '#fff',
                    border: 'none', borderRadius: 9999,
                    padding: isMobile ? '14px 0' : '12px 0',
                    fontSize: 14, fontWeight: 700,
                    fontFamily: 'var(--font)',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                    letterSpacing: '0.02em',
                  }}
                >
                  {submitting ? 'Starting...' : `Download${selectedResolution !== 'best' ? ` (${selectedResolution}p)` : ''}`}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── State 3: Downloading progress ─────────────────────── */}
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

          {/* ── State 4: Failed ────────────────────────────────────── */}
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
                onClick={() => { setJob(null); setUrl(''); setError(''); setResolutions(null); setSelectedResolution('best'); }}
                style={{
                  width: '100%', background: 'var(--surface-high)',
                  color: 'var(--text)', border: 'none', borderRadius: 9999,
                  padding: isMobile ? '14px 0' : '11px 0', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                Try Again
              </motion.button>
            </motion.div>
          )}

          {/* ── State 5: Done — add tags ────────────────────────────── */}
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
                  padding: isMobile ? '13px 20px' : '11px 20px',
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
                    padding: isMobile ? '14px 0' : '12px 0',
                    fontSize: 14, fontWeight: 700,
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
                    padding: isMobile ? '14px 18px' : '12px 18px',
                    fontSize: 14, fontWeight: 600,
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
