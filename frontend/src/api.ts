import type { Video, DownloadJob, CookiesStatus, CookiesTestResult, TranslateJob } from './types';

const BASE = '/api';

export async function listVideos(params?: { q?: string; tag?: string }): Promise<Video[]> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.tag) query.set('tag', params.tag);
  const res = await fetch(`${BASE}/videos?${query}`);
  if (!res.ok) throw new Error('Failed to fetch videos');
  return res.json();
}

export async function getVideo(id: number): Promise<Video> {
  const res = await fetch(`${BASE}/videos/${id}`);
  if (!res.ok) throw new Error('Video not found');
  return res.json();
}

export async function updateVideoTags(id: number, tags: string[]): Promise<Video> {
  const res = await fetch(`${BASE}/videos/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error('Failed to update tags');
  return res.json();
}

export async function deleteVideo(id: number): Promise<void> {
  const res = await fetch(`${BASE}/videos/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete video');
}

export async function listTags(): Promise<string[]> {
  const res = await fetch(`${BASE}/tags`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

export async function fetchResolutions(url: string): Promise<{ resolutions: number[] }> {
  const res = await fetch(`${BASE}/download/resolutions?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Failed to fetch resolutions');
  return res.json();
}

export async function startDownload(url: string, resolution?: number): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, resolution: resolution ?? null }),
  });
  if (!res.ok) throw new Error('Failed to start download');
  return res.json();
}

export async function getDownloadStatus(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`${BASE}/download/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to get job status');
  return res.json();
}

export async function getCookiesStatus(): Promise<CookiesStatus> {
  const res = await fetch(`${BASE}/download/cookies/status`);
  if (!res.ok) throw new Error('Failed to get cookies status');
  return res.json();
}

export async function uploadCookies(file: File): Promise<CookiesStatus> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/download/cookies/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to upload cookies file');
  return res.json();
}

export async function testCookies(url?: string): Promise<CookiesTestResult> {
  const res = await fetch(`${BASE}/download/cookies/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to test cookies');
  return data;
}

export async function startTranslate(videoId: number): Promise<{ status: string; job_id: string | null; progress?: number }> {
  const res = await fetch(`${BASE}/videos/${videoId}/translate`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start translation');
  return res.json();
}

export async function getTranslateStatus(jobId: string): Promise<TranslateJob> {
  const res = await fetch(`${BASE}/translate/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to get translation status');
  return res.json();
}

export function subtitlesUrl(videoId: number): string {
  return `${BASE}/videos/${videoId}/subtitles.vtt`;
}

export function streamUrl(videoId: number): string {
  return `/stream/${videoId}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
