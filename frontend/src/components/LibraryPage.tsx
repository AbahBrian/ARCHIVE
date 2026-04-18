import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { listVideos, listTags } from '../api';
import type { Video } from '../types';
import DownloadModal from './DownloadModal';

export default function LibraryPage() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<Video[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

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

  function handleTagClick(tag: string) {
    setSearchQuery('');
    setActiveTag(prev => prev === tag ? null : tag);
  }

  function handleLibraryRefresh() {
    fetchVideos();
    fetchTags();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--red)', flexShrink: 0 }}>
          ARCH:IVE
        </span>

        {/* Search */}
        <input
          type="search"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setActiveTag(null); }}
          placeholder="Search videos..."
          style={{
            flex: 1, maxWidth: 420,
            background: 'rgba(255,255,255,0.07)',
            border: 'none', borderRadius: 9999,
            padding: '9px 18px',
            fontSize: 14, color: 'var(--text)',
            fontFamily: 'var(--font)', outline: 'none',
            transition: 'box-shadow 0.15s',
          }}
          onFocus={e => (e.target.style.boxShadow = '0 0 0 2px rgba(229,9,20,0.35)')}
          onBlur={e => (e.target.style.boxShadow = 'none')}
        />

        <div style={{ flex: 1 }} />

        <motion.button
          whileHover={{ opacity: 0.85 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowModal(true)}
          style={{
            color: 'var(--red)', border: '1px solid rgba(229,9,20,0.35)',
            borderRadius: 9999, padding: '8px 20px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          + Download
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

      {/* ── Main content ────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        {/* Tag chip filters */}
        {(tags.length > 0 || !loading) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            <span
              className={`chip ${!activeTag && !searchQuery ? 'active' : ''}`}
              onClick={() => { setActiveTag(null); setSearchQuery(''); }}
            >
              All
            </span>
            {tags.map(tag => (
              <span
                key={tag}
                className={`chip ${activeTag === tag ? 'active' : ''}`}
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 80, fontSize: 15 }}>
            Loading...
          </p>
        )}

        {/* Empty state */}
        {!loading && videos.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', marginTop: 100, color: 'var(--text-muted)' }}
          >
            <p style={{ fontSize: 52, marginBottom: 16 }}>📭</p>
            <p style={{ fontSize: 17, fontWeight: 600 }}>No videos yet.</p>
            <p style={{ fontSize: 14, marginTop: 6 }}>Click "+ Download" to add one.</p>
          </motion.div>
        )}

        {/* Video grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {videos.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.35, ease: 'easeOut' }}
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
              onClick={() => navigate(`/player/${v.id}`)}
              style={{
                background: 'var(--surface)', borderRadius: 10,
                overflow: 'hidden', cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
            >
              {/* Thumbnail */}
              <div style={{ aspectRatio: '16/9', background: 'var(--surface-high)', position: 'relative' }}>
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--text-muted)' }}>▶</div>
                )}
                {/* Gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 50%)', pointerEvents: 'none' }} />
              </div>

              {/* Card body */}
              <div style={{ padding: '12px 14px' }}>
                <p style={{
                  fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 5, lineHeight: 1.35,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {v.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: v.tags.length > 0 ? 8 : 0 }}>
                  {v.channel}
                </p>
                {v.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {v.tags.map(tag => (
                      <span
                        key={tag}
                        className="chip"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={e => { e.stopPropagation(); handleTagClick(tag); }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
