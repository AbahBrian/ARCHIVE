import { useEffect, useState } from 'react';
import { getCookiesStatus, testCookies, uploadCookies } from '../api';
import type { CookiesStatus } from '../types';

export default function CookiesPanel() {
  const [status, setStatus] = useState<CookiesStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refreshStatus() {
    try {
      setStatus(await getCookiesStatus());
    } catch {
      setError('Failed to load cookies status.');
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setMessage('');
    try {
      const next = await uploadCookies(file);
      setStatus(next);
      setMessage('cookies.txt uploaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload cookies.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleTest() {
    setTesting(true);
    setError('');
    setMessage('');
    try {
      const result = await testCookies();
      setMessage(result.title ? `Cookies valid, sample title: ${result.title}` : 'Cookies test passed.');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cookies test failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '14px 16px',
      display: 'grid',
      gap: 12,
      marginTop: 12,
    }}>
      <div>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>YouTube Cookies</div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          {status?.configured ? `Ready, ${(status.size / 1024).toFixed(1)} KB` : 'Not uploaded yet'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Upload a fresh <code>cookies.txt</code> exported from a logged-in Chrome/Firefox session.
          Helps with age-restricted and account-only content. Public videos work without cookies.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{
          background: 'var(--surface-high)',
          color: 'var(--text)',
          borderRadius: 9999,
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: uploading ? 'not-allowed' : 'pointer',
          opacity: uploading ? 0.7 : 1,
        }}>
          {uploading ? 'Uploading...' : 'Upload cookies.txt'}
          <input type="file" accept=".txt" hidden onChange={handleFileChange} disabled={uploading} />
        </label>

        <button
          onClick={handleTest}
          disabled={testing || !status?.configured}
          style={{
            background: testing || !status?.configured ? 'rgba(255,255,255,0.08)' : 'var(--red)',
            color: testing || !status?.configured ? 'var(--text-muted)' : '#fff',
            borderRadius: 9999,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: testing || !status?.configured ? 'not-allowed' : 'pointer',
          }}
        >
          {testing ? 'Testing...' : 'Test cookies'}
        </button>
      </div>

      {message && <div style={{ fontSize: 12, color: '#4ade80' }}>{message}</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}
