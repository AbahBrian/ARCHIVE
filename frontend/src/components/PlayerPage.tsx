import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getVideo, updateVideoTags, deleteVideo, streamUrl, formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

/* ─── spring preset ─────────────────────────────────────────────────── */
const spring = { type: 'spring', stiffness: 340, damping: 28 } as const;

/* ─── helper: format seconds → mm:ss ────────────────────────────────── */
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ─── PlayerPage ─────────────────────────────────────────────────────── */
export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoId = Number(id);

  /* video metadata */
  const [video, setVideo] = useState<Video | null>(null);
  const [notFound, setNotFound] = useState(false);

  /* player state */
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* sidebar scroll-picker state — populated in future tasks */
  const [pickerVideos] = useState<Video[]>([]);

  /* tag editor */
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagSaved, setTagSaved] = useState(false);

  /* delete confirm */
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* ── fetch metadata ─────────────────────────────────────────────── */
  useEffect(() => {
    getVideo(videoId)
      .then(v => { setVideo(v); setTagInput(v.tags.join(', ')); })
      .catch(() => setNotFound(true));
  }, [videoId]);

  /* ── auto-hide controls ─────────────────────────────────────────── */
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetControlsTimer]);

  /* ── video event handlers ───────────────────────────────────────── */
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  }

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  }

  function handlePlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  }

  function handleSkip(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    const val = Number(e.target.value);
    if (v) v.volume = val;
    setVolume(val);
    setMuted(val === 0);
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function handleFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  }

  /* ── tag save ───────────────────────────────────────────────────── */
  async function handleSaveTags() {
    if (!video) return;
    setSaving(true);
    try {
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const updated = await updateVideoTags(video.id, tags);
      setVideo(updated);
      setTagInput(updated.tags.join(', '));
      setTagSaved(true);
      setTimeout(() => setTagSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  /* ── delete ─────────────────────────────────────────────────────── */
  async function handleDelete() {
    if (!video) return;
    await deleteVideo(video.id);
    navigate('/');
  }

  /* ── not-found state ────────────────────────────────────────────── */
  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 52, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 24, fontWeight: 500 }}>Video not found on disk.</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate('/')}
            style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            ← Back to Library
          </motion.button>
        </motion.div>
      </div>
    );
  }

  /* ── loading state ──────────────────────────────────────────────── */
  if (!video) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
          style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}
        >
          Loading...
        </motion.div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const src = streamUrl(video.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => navigate('/')}
            style={{
              color: 'var(--red)', background: 'rgba(255,255,255,0.08)',
              borderRadius: '50%', width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          </motion.button>
          <span style={{
            fontFamily: 'var(--font)', fontSize: 22, fontWeight: 900,
            letterSpacing: '-0.04em', color: 'var(--red)',
          }}>
            ARCH:IVE
          </span>
        </div>

        <nav style={{ display: 'flex', gap: 36 }}>
          {['Library', 'Search'].map(label => (
            <a key={label} href="/"
              style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {label}
            </a>
          ))}
        </nav>

        <a
          href={src}
          download={`${video.title}.mp4`}
          style={{
            color: 'var(--red)', border: '1px solid rgba(229,9,20,0.35)',
            borderRadius: 9999, padding: '7px 18px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,9,20,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Download
        </a>
      </header>

      {/* ── Immersive Player ───────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }}>
        <div
          style={{ width: '100%', maxWidth: 1800, position: 'relative' }}
          onMouseMove={resetControlsTimer}
          onClick={handlePlayPause}
        >
          {/* Player container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.08 }}
            style={{
              position: 'relative',
              aspectRatio: '16/9',
              background: '#000',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.05)',
              maxHeight: '76vh',
            }}
          >
            {/* Video element */}
            <video
              ref={videoRef}
              src={src}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={e => e.stopPropagation()}
            />

            {/* Gradient overlays */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.75) 0%, transparent 50%)', pointerEvents: 'none' }} />

            {/* ── Centre controls ─────────────────────────────────── */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  key="centre-controls"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48,
                    zIndex: 20, pointerEvents: 'none',
                  }}
                >
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={e => { e.stopPropagation(); handleSkip(-10); }}
                    style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 40 }}>replay_10</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={e => { e.stopPropagation(); handlePlayPause(); }}
                    style={{
                      width: 88, height: 88,
                      borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)',
                      background: 'rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(8px)',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'auto',
                    }}
                  >
                    <span className={`material-symbols-outlined icon-filled`} style={{ fontSize: 54, marginLeft: playing ? 0 : 4 }}>
                      {playing ? 'pause' : 'play_arrow'}
                    </span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={e => { e.stopPropagation(); handleSkip(10); }}
                    style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 40 }}>forward_10</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── 3D Scroll Picker Sidebar ─────────────────────────── */}
            {pickerVideos.length > 1 && (
              <div style={{
                position: 'absolute', right: 48, top: 0, bottom: 0,
                width: 280, display: 'flex', alignItems: 'center',
                perspective: 2000, zIndex: 20,
                pointerEvents: 'none',
              }}>
                {/* Render surrounding cards from pickerVideos; placeholder if empty */}
              </div>
            )}

            {/* ── Video title overlay (bottom-left) ─────────────────── */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 40px 100px', zIndex: 10, pointerEvents: 'none' }}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.18 }}
                style={{ maxWidth: '55%' }}
              >
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                  {video.channel}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
                  <span>{new Date(video.downloaded_at).getFullYear()}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                  <span>{formatFileSize(video.file_size)}</span>
                  {video.tags.length > 0 && (
                    <>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
                      {video.tags.map(t => (
                        <span key={t} style={{ border: '1px solid rgba(255,255,255,0.35)', padding: '1px 6px', borderRadius: 3, fontSize: 10, letterSpacing: '0.05em' }}>
                          {t.toUpperCase()}
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <h1 style={{
                  fontSize: 'clamp(28px, 4vw, 56px)', fontWeight: 800,
                  letterSpacing: '-0.03em', lineHeight: 1.1,
                  color: '#fff', marginBottom: 16, textShadow: '0 2px 12px rgba(0,0,0,0.5)',
                }}>
                  {video.title}
                </h1>
              </motion.div>
            </div>

            {/* ── Bottom controls bar ──────────────────────────────── */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  key="bottom-bar"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '0 28px 20px', zIndex: 30,
                  }}
                >
                  {/* Time labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 600, marginBottom: 8, padding: '0 2px' }}>
                    <span>{fmtTime(currentTime)}</span>
                    <span>{fmtTime(duration)}</span>
                  </div>

                  {/* Seek bar */}
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 9999, overflow: 'hidden', position: 'relative' }}>
                      <motion.div
                        style={{
                          height: '100%', background: 'var(--red)',
                          borderRadius: 9999,
                          boxShadow: '0 0 10px rgba(229,9,20,0.7)',
                        }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.1, ease: 'linear' }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.5}
                      value={currentTime}
                      onChange={handleSeek}
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        opacity: 0, cursor: 'pointer',
                      }}
                    />
                  </div>

                  {/* Controls row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
                    {/* Left: play, volume */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      <motion.button
                        whileHover={{ color: 'rgba(255,255,255,0.7)' }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handlePlayPause}
                        style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                      >
                        <span className={`material-symbols-outlined icon-filled`} style={{ fontSize: 36 }}>
                          {playing ? 'pause' : 'play_arrow'}
                        </span>
                      </motion.button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={toggleMute}
                          style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
                            {muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                          </span>
                        </motion.button>
                        <input
                          type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                          onChange={handleVolume}
                          style={{ width: 80, accentColor: 'var(--red)', cursor: 'pointer' }}
                        />
                      </div>

                      <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginLeft: 8, display: 'none' }} className="title-md">
                        {video.title}
                      </span>
                    </div>

                    {/* Right: subtitles, pip, fullscreen */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <motion.button whileHover={{ opacity: 0.7 }} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>subtitles</span>
                      </motion.button>
                      <motion.button whileHover={{ opacity: 0.7 }} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>branding_watermark</span>
                      </motion.button>
                      <motion.button
                        whileHover={{ opacity: 0.7 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleFullscreen}
                        style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>fullscreen</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      {/* ── Metadata + Tag Panel ──────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.22 }}
        style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '0 24px 48px' }}
      >
        {/* Metadata row */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: '20px 28px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 20,
        }}>
          {[
            { label: 'Duration', value: formatDuration(video.duration) },
            { label: 'File Size', value: formatFileSize(video.file_size) },
            { label: 'Downloaded', value: new Date(video.downloaded_at).toLocaleDateString() },
            { label: 'Channel', value: video.channel || '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</p>
            </div>
          ))}
          <div>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>Original URL</p>
            <a href={video.yt_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--red)', wordBreak: 'break-all', lineHeight: 1.4 }}>
              {video.yt_url}
            </a>
          </div>
        </div>

        {/* Tag editor */}
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '20px 28px', marginBottom: 16 }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 14 }}>Tags</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTags(); }}
              placeholder="music, lofi, study"
              style={{
                flex: 1, background: 'var(--surface-high)', border: 'none', borderRadius: 9999,
                padding: '9px 18px', fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)',
                outline: 'none',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleSaveTags}
              disabled={saving}
              style={{
                background: 'var(--red)', color: '#fff', border: 'none',
                borderRadius: 9999, padding: '9px 22px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </motion.button>
          </div>

          <AnimatePresence>
            {tagSaved && (
              <motion.p
                key="saved"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ color: '#22c55e', fontSize: 13, fontWeight: 600, marginBottom: 10 }}
              >
                ✓ Tags saved
              </motion.p>
            )}
          </AnimatePresence>

          {video.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {video.tags.map(tag => (
                <span key={tag} className="chip active">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <AnimatePresence mode="wait">
            {!confirmDelete ? (
              <motion.button
                key="delete"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'var(--surface)', color: 'var(--text-muted)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 9999, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => ((e.target as HTMLButtonElement).style.color = 'var(--red)')}
                onMouseLeave={e => ((e.target as HTMLButtonElement).style.color = 'var(--text-muted)')}
              >
                Delete Video
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Delete permanently?</span>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleDelete}
                  style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Yes, delete
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmDelete(false)}
                  style={{ background: 'var(--surface-high)', color: 'var(--text)', border: 'none', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </motion.div>
  );
}
