import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { listVideos, listTags } from '../api';
import type { Video } from '../types';
import DownloadModal from './DownloadModal';

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function HeroSection({ videos, onPlay }: { videos: Video[]; onPlay: (v: Video) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = videos.slice(0, 5);
  const video = slides[index];

  const go = useCallback((next: number) => {
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    timerRef.current = setInterval(() => go(index + 1), 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [index, paused, go, slides.length]);

  if (!video) return null;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: 'min(56vw, 600px)', minHeight: 280, overflow: 'hidden' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background slides */}
      <AnimatePresence mode="sync">
        <motion.div
          key={video.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt={video.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: '#1a1a1a' }} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gradients */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--bg) 0%, transparent 40%)' }} />

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={video.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.45 }}
          style={{
            position: 'absolute', bottom: 0, left: 0,
            padding: 'clamp(20px, 4vw, 60px)',
            maxWidth: 600,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 10 }}>
            Featured
          </p>
          <h1 style={{
            fontSize: 'clamp(20px, 3.5vw, 48px)', fontWeight: 800,
            lineHeight: 1.15, marginBottom: 12,
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            {video.title}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
            {video.channel} {video.duration > 0 && `· ${formatDuration(video.duration)}`}
          </p>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPlay(video)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'white', color: 'black',
              border: 'none', borderRadius: 6,
              padding: '10px 24px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            ▶ Play
          </motion.button>
        </motion.div>
      </AnimatePresence>

      {/* Prev / Next arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => go(index - 1)}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, background: 'rgba(0,0,0,0.5)', border: 'none',
              color: 'white', width: 38, height: 38, borderRadius: '50%',
              cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >‹</button>
          <button
            onClick={() => go(index + 1)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, background: 'rgba(0,0,0,0.5)', border: 'none',
              color: 'white', width: 38, height: 38, borderRadius: '50%',
              cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >›</button>
        </>
      )}

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 14, right: 20,
          display: 'flex', gap: 6, zIndex: 10,
        }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              style={{
                width: i === index ? 20 : 6,
                height: 6, borderRadius: 3,
                background: i === index ? 'var(--red)' : 'rgba(255,255,255,0.4)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'width 0.3s, background 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, onClick }: { video: Video; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.06, zIndex: 10 }}
      onClick={onClick}
      style={{
        position: 'relative', flexShrink: 0,
        width: 220, aspectRatio: '16/9',
        borderRadius: 6, overflow: 'hidden',
        cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Thumbnail */}
      {video.thumbnail ? (
        <img src={video.thumbnail} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#555' }}>▶</div>
      )}

      {/* Hover overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              padding: '10px 10px 12px',
            }}
          >
            <p style={{
              fontSize: 12, fontWeight: 700, color: 'white',
              lineHeight: 1.3, marginBottom: 4,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {video.title}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
              {video.channel}{video.duration > 0 && ` · ${formatDuration(video.duration)}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Carousel({ title, videos, onSelect }: { title: string; videos: Video[]; onSelect: (v: Video) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 'left' | 'right') {
    if (!rowRef.current) return;
    rowRef.current.scrollBy({ left: dir === 'right' ? 480 : -480, behavior: 'smooth' });
  }

  if (videos.length === 0) return null;

  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, paddingLeft: 'clamp(12px, 3vw, 48px)' }}>
        {title}
      </h2>
      <div style={{ position: 'relative' }}>
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 5, background: 'rgba(0,0,0,0.7)', border: 'none',
            color: 'white', width: 36, height: 60, borderRadius: '0 4px 4px 0',
            cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >‹</button>

        {/* Scrollable row */}
        <div
          ref={rowRef}
          style={{
            display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'visible',
            padding: '12px clamp(12px, 3vw, 48px)',
            scrollbarWidth: 'none',
          }}
        >
          {videos.map(v => (
            <VideoCard key={v.id} video={v} onClick={() => onSelect(v)} />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 5, background: 'rgba(0,0,0,0.7)', border: 'none',
            color: 'white', width: 36, height: 60, borderRadius: '4px 0 0 4px',
            cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >›</button>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [videos, setVideos] = useState<Video[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [allVideos, setAllVideos] = useState<Video[]>([]);

  const fetchAllVideos = useCallback(async () => {
    const v = await listVideos({});
    setAllVideos(v);
  }, []);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; tag?: string } = {};
      if (searchQuery) params.q = searchQuery;
      else if (activeTag) params.tag = activeTag;
      setVideos(await listVideos(params));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTag]);

  const fetchTags = useCallback(async () => {
    setTags(await listTags());
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);
  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { fetchAllVideos(); }, [fetchAllVideos]);

  function handleTagClick(tag: string) {
    setSearchQuery('');
    setActiveTag(prev => prev === tag ? null : tag);
  }

  function handleLibraryRefresh() {
    fetchVideos();
    fetchTags();
    fetchAllVideos();
  }

  const isFiltering = !!(searchQuery || activeTag);

  // Group videos by tag for carousels
  const tagGroups: { label: string; videos: Video[] }[] = tags.map(tag => ({
    label: tag,
    videos: allVideos.filter(v => v.tags.includes(tag)),
  })).filter(g => g.videos.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
        padding: 'clamp(8px, 2vw, 14px) clamp(10px, 3vw, 24px)',
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: 'clamp(6px, 2vw, 16px)',
        transition: 'background 0.3s',
      }}>
        <img
          src="/Logo.png"
          alt="ARCH:IVE"
          style={{ height: 'clamp(18px, 5vw, 28px)', width: 'auto', display: 'block', flexShrink: 0 }}
        />

        <input
          type="search"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setActiveTag(null); }}
          placeholder="Search videos..."
          style={{
            flex: 1, minWidth: 0,
            background: 'rgba(255,255,255,0.07)',
            border: 'none', borderRadius: 9999,
            padding: 'clamp(6px, 1.8vw, 9px) clamp(10px, 3vw, 18px)',
            fontSize: 'clamp(11px, 3vw, 14px)', color: 'var(--text)',
            fontFamily: 'var(--font)', outline: 'none',
            transition: 'box-shadow 0.15s',
          }}
          onFocus={e => (e.target.style.boxShadow = '0 0 0 2px rgba(229,9,20,0.35)')}
          onBlur={e => (e.target.style.boxShadow = 'none')}
        />

        <motion.button
          whileHover={{ opacity: 0.85 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowModal(true)}
          style={{
            color: 'var(--red)', border: '1px solid rgba(229,9,20,0.35)',
            borderRadius: 9999,
            padding: 'clamp(6px, 1.8vw, 8px) clamp(10px, 3vw, 20px)',
            fontSize: 'clamp(10px, 2.5vw, 12px)', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          {isMobile ? '+ DL' : '+ Download'}
        </motion.button>
      </header>

      {/* ── Download Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <DownloadModal
            key="download-modal"
            onClose={() => setShowModal(false)}
            onComplete={handleLibraryRefresh}
          />
        )}
      </AnimatePresence>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      {!isFiltering && allVideos.length > 0 && (
        <HeroSection videos={allVideos} onPlay={v => navigate(`/player/${v.id}`)} />
      )}

      {/* ── Filtered search results ─────────────────────────────────── */}
      {isFiltering && (
        <div style={{ paddingTop: isMobile ? 72 : 80 }}>
          {/* Tag chips */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            padding: isMobile ? '16px 12px' : '24px 48px',
          }}>
            <span className={`chip ${!activeTag && !searchQuery ? 'active' : ''}`} onClick={() => { setActiveTag(null); setSearchQuery(''); }}>All</span>
            {tags.map(tag => (
              <span key={tag} className={`chip ${activeTag === tag ? 'active' : ''}`} onClick={() => handleTagClick(tag)}>{tag}</span>
            ))}
          </div>

          {loading && <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>Loading...</p>}

          {!loading && videos.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 48, marginBottom: 16 }}>📭</p>
              <p style={{ fontSize: 17, fontWeight: 600 }}>No videos found.</p>
            </motion.div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: isMobile ? 10 : 16,
            padding: isMobile ? '0 12px 32px' : '0 48px 48px',
          }}>
            {videos.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                style={{ aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                onClick={() => navigate(`/player/${v.id}`)}
              >
                <VideoCard video={v} onClick={() => navigate(`/player/${v.id}`)} />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Carousels ───────────────────────────────────────────────── */}
      {!isFiltering && !loading && allVideos.length > 0 && (
        <div style={{ paddingTop: isMobile ? 60 : 24 }}>
          {/* Tag chips row */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            padding: isMobile ? '0 12px 20px' : '0 clamp(12px,3vw,48px) 24px',
          }}>
            <span className="chip active">All</span>
            {tags.map(tag => (
              <span key={tag} className="chip" onClick={() => handleTagClick(tag)}>{tag}</span>
            ))}
          </div>

          <Carousel title="All Videos" videos={allVideos} onSelect={v => navigate(`/player/${v.id}`)} />

          {tagGroups.map(g => (
            <Carousel key={g.label} title={g.label} videos={g.videos} onSelect={v => navigate(`/player/${v.id}`)} />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!loading && allVideos.length === 0 && !isFiltering && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: 'center', marginTop: isMobile ? 200 : 160, color: 'var(--text-muted)' }}
        >
          <p style={{ fontSize: 52, marginBottom: 16 }}>📭</p>
          <p style={{ fontSize: 17, fontWeight: 600 }}>No videos yet.</p>
          <p style={{ fontSize: 14, marginTop: 6 }}>Click "+ Download" to add one.</p>
        </motion.div>
      )}
    </div>
  );
}
