import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getVideo, listVideos, updateVideoTags, deleteVideo, streamUrl, formatDuration, formatFileSize } from '../api';
import type { Video } from '../types';

const spring = { type: 'spring', stiffness: 340, damping: 28 } as const;

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 900);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoId = Number(id);
  const isMobile = useIsMobile();

  const [video, setVideo] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [notFound, setNotFound] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [tagSaved, setTagSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    getVideo(videoId)
      .then(v => { setVideo(v); setTagInput(v.tags.join(', ')); })
      .catch(() => setNotFound(true));
    listVideos().then(all => setRelated(all.filter(v => v.id !== videoId)));
  }, [videoId]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetControlsTimer]);

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

  async function handleDelete() {
    if (!video) return;
    await deleteVideo(video.id);
    navigate('/');
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 24 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 52, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 24 }}>Video not found.</p>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => navigate('/')}
            style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            ← Back to Library
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (!video) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4 }}
          style={{ color: 'var(--text-muted)', fontSize: 15 }}>Loading...</motion.div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const src = streamUrl(video.id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => navigate('/')}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            {!isMobile && 'Library'}
          </motion.button>
          <span style={{ fontFamily: 'var(--font)', fontSize: 20, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--red)' }}>
            ARCH:IVE
          </span>
        </div>

        {!isMobile && (
          <nav style={{ display: 'flex', gap: 32 }}>
            {['LIBRARY', 'SEARCH', 'PROFILE'].map(label => (
              <a key={label} href="/"
                style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                {label}
              </a>
            ))}
          </nav>
        )}

        <a href={src} download={`${video.title}.mp4`}
          style={{
            color: 'var(--red)', border: '1px solid rgba(229,9,20,0.4)',
            borderRadius: 4, padding: '6px 16px',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            transition: 'background 0.15s', whiteSpace: 'nowrap',
          }}>
          {isMobile ? '↓' : 'Download'}
        </a>
      </header>

      {/* ── Two-column layout ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 340px',
        gridTemplateRows: 'auto',
        maxWidth: 1600,
        margin: '0 auto',
        width: '100%',
        padding: isMobile ? 0 : '24px 24px 0',
        gap: isMobile ? 0 : 20,
        alignItems: 'start',
      }}>

        {/* ── LEFT: Player + info ─────────────────────────────────── */}
        <div>
          {/* Player */}
          <div
            style={{ position: 'relative', background: '#000', borderRadius: isMobile ? 0 : 10, overflow: 'hidden', aspectRatio: '16/9' }}
            onMouseMove={resetControlsTimer}
            onTouchStart={resetControlsTimer}
            onClick={handlePlayPause}
          >
            <video
              ref={videoRef}
              src={src}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              onTimeUpdate={() => { const v = videoRef.current; if (v) setCurrentTime(v.currentTime); }}
              onLoadedMetadata={() => { const v = videoRef.current; if (v) setDuration(v.duration); }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={e => e.stopPropagation()}
              playsInline
            />

            {/* Bottom gradient */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 35%, transparent 65%)', pointerEvents: 'none' }} />
            {/* Left gradient */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 45%)', pointerEvents: 'none' }} />

            {/* Title overlay — bottom left */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: 'absolute', bottom: 90, left: 28, right: isMobile ? 28 : '45%', zIndex: 10, pointerEvents: 'none' }}
                >
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 4, letterSpacing: '0.02em' }}>
                    {video.channel}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600 }}>
                      {new Date(video.downloaded_at).getFullYear()}
                    </span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', display: 'inline-block' }} />
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600 }}>
                      {formatFileSize(video.file_size)}
                    </span>
                    {video.tags.slice(0, 2).map(t => (
                      <span key={t} style={{ border: '1px solid rgba(255,255,255,0.3)', padding: '1px 6px', borderRadius: 3, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>
                        {t.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <h1 style={{
                    fontSize: isMobile ? 'clamp(20px, 5vw, 28px)' : 'clamp(22px, 2.8vw, 44px)',
                    fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1,
                    color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.6)',
                    fontFamily: 'var(--font)',
                  }}>
                    {video.title}
                  </h1>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Centre play/skip controls */}
            <AnimatePresence>
              {showControls && (
                <motion.div key="centre"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 32 : 52, zIndex: 20, pointerEvents: 'none' }}
                >
                  <motion.button whileTap={{ scale: 0.85 }} onClick={e => { e.stopPropagation(); handleSkip(-10); }}
                    style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 32 : 40 }}>replay_10</span>
                  </motion.button>

                  <motion.button whileTap={{ scale: 0.9 }} onClick={e => { e.stopPropagation(); handlePlayPause(); }}
                    style={{
                      width: isMobile ? 60 : 80, height: isMobile ? 60 : 80, borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.85)',
                      background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                      color: '#fff', cursor: 'pointer', pointerEvents: 'auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <span className="material-symbols-outlined icon-filled" style={{ fontSize: isMobile ? 36 : 48, marginLeft: playing ? 0 : 3 }}>
                      {playing ? 'pause' : 'play_arrow'}
                    </span>
                  </motion.button>

                  <motion.button whileTap={{ scale: 0.85 }} onClick={e => { e.stopPropagation(); handleSkip(10); }}
                    style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', pointerEvents: 'auto', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 32 : 40 }}>forward_10</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom controls bar */}
            <AnimatePresence>
              {showControls && (
                <motion.div key="bar"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                  onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: isMobile ? '0 12px 12px' : '0 24px 18px', zIndex: 30 }}
                >
                  {/* Time */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, marginBottom: 5, padding: '0 2px' }}>
                    <span>{fmtTime(currentTime)}</span>
                    <span>{fmtTime(duration)}</span>
                  </div>

                  {/* Seek */}
                  <div style={{ position: 'relative', marginBottom: isMobile ? 10 : 12 }}>
                    <div style={{ width: '100%', height: isMobile ? 3 : 5, background: 'rgba(255,255,255,0.18)', borderRadius: 9999, overflow: 'hidden' }}>
                      <motion.div style={{ height: '100%', background: 'var(--red)', borderRadius: 9999, boxShadow: '0 0 6px rgba(229,9,20,0.8)' }}
                        animate={{ width: `${progress}%` }} transition={{ duration: 0.1, ease: 'linear' }} />
                    </div>
                    <input type="range" min={0} max={duration || 100} step={0.5} value={currentTime} onChange={handleSeek}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                  </div>

                  {/* Buttons row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 18 }}>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={handlePlayPause}
                        style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined icon-filled" style={{ fontSize: isMobile ? 26 : 32 }}>
                          {playing ? 'pause' : 'play_arrow'}
                        </span>
                      </motion.button>
                      {!isMobile && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMute}
                            style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                              {muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                            </span>
                          </motion.button>
                          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolume}
                            style={{ width: 80, accentColor: 'var(--red)', cursor: 'pointer' }} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16 }}>
                      {!isMobile && (
                        <motion.button whileHover={{ opacity: 0.7 }}
                          style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>subtitles</span>
                        </motion.button>
                      )}
                      <motion.button whileTap={{ scale: 0.9 }} onClick={handleFullscreen}
                        style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 22 : 24 }}>fullscreen</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Info panel below player ──────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }}
            style={{ padding: isMobile ? '16px 16px 8px' : '20px 4px 8px' }}>

            {/* Title + channel */}
            <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, color: 'var(--text)', marginBottom: 6, fontFamily: 'var(--font)' }}>
              {video.title}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 14 }}>
              {video.channel} · {formatDuration(video.duration)} · {formatFileSize(video.file_size)}
            </p>

            {/* Tags row */}
            {video.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {video.tags.map(tag => <span key={tag} className="chip active" style={{ fontSize: 11 }}>{tag}</span>)}
              </div>
            )}

            {/* Expandable info */}
            <motion.button whileTap={{ scale: 0.98 }} onClick={() => setShowInfo(p => !p)}
              style={{ color: 'var(--text-muted)', background: 'var(--surface)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{showInfo ? 'expand_less' : 'expand_more'}</span>
              {showInfo ? 'Less info' : 'More info'}
            </motion.button>

            <AnimatePresence>
              {showInfo && (
                <motion.div key="info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '16px 20px', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 16 }}>
                    {[
                      { label: 'Duration', value: formatDuration(video.duration) },
                      { label: 'File Size', value: formatFileSize(video.file_size) },
                      { label: 'Downloaded', value: new Date(video.downloaded_at).toLocaleDateString() },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</p>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>Original URL</p>
                      <a href={video.yt_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--red)', wordBreak: 'break-all', fontWeight: 500 }}>{video.yt_url}</a>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tag editor */}
            <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 10 }}>Edit Tags</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveTags(); }}
                  placeholder="music, lofi, study"
                  style={{ flex: 1, background: 'var(--surface-high)', border: 'none', borderRadius: 9999, padding: '8px 14px', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', minWidth: 0 }} />
                <motion.button whileTap={{ scale: 0.96 }} onClick={handleSaveTags} disabled={saving}
                  style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  {saving ? '...' : 'Save'}
                </motion.button>
              </div>
              <AnimatePresence>
                {tagSaved && (
                  <motion.p key="saved" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ color: '#22c55e', fontSize: 12, fontWeight: 600, marginTop: 8 }}>✓ Tags saved</motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Delete */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: isMobile ? 32 : 40 }}>
              <AnimatePresence mode="wait">
                {!confirmDelete ? (
                  <motion.button key="del" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.95 }} onClick={() => setConfirmDelete(true)}
                    style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9999, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Delete Video
                  </motion.button>
                ) : (
                  <motion.div key="confirm" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Delete permanently?</span>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleDelete}
                      style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Yes, delete
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmDelete(false)}
                      style={{ background: 'var(--surface-high)', color: 'var(--text)', border: 'none', borderRadius: 9999, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* ── RIGHT: Recommendations ──────────────────────────────── */}
        {!isMobile && (
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.2 }}
            style={{ paddingBottom: 40 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
              Up Next
            </p>

            {related.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' }}>No other videos in library.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {related.map((v, i) => (
                <motion.div key={v.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.05 }}
                  whileHover={{ background: 'var(--surface-high)' }}
                  onClick={() => navigate(`/player/${v.id}`)}
                  style={{ display: 'flex', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                >
                  {/* Thumbnail */}
                  <div style={{ width: 120, flexShrink: 0, aspectRatio: '16/9', background: 'var(--surface-high)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 20 }}>▶</div>
                    }
                    {/* Duration badge */}
                    <span style={{
                      position: 'absolute', bottom: 4, right: 4,
                      background: 'rgba(0,0,0,0.8)', color: '#fff',
                      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                    }}>{formatDuration(v.duration)}</span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, marginBottom: 4,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {i + 1}. {v.title}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{v.channel}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Mobile recommendations — horizontal scroll below info */}
        {isMobile && related.length > 0 && (
          <div style={{ padding: '0 16px 32px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Up Next</p>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {related.map(v => (
                <motion.div key={v.id} whileTap={{ scale: 0.97 }} onClick={() => navigate(`/player/${v.id}`)}
                  style={{ flexShrink: 0, width: 160, cursor: 'pointer' }}>
                  <div style={{ aspectRatio: '16/9', background: 'var(--surface-high)', borderRadius: 6, overflow: 'hidden', marginBottom: 6, position: 'relative' }}>
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>▶</div>
                    }
                    <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3 }}>
                      {formatDuration(v.duration)}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {v.title}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
