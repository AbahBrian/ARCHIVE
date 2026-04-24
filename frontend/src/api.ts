import type { Video, DownloadJob, TranslationJob } from './types';

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

export async function startDownload(url: string): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to start download');
  return res.json();
}

export async function getDownloadStatus(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`${BASE}/download/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to get job status');
  return res.json();
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

export async function startTranslation(videoId: number): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/translate/${videoId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start translation');
  return res.json();
}

export async function getTranslationStatus(jobId: string): Promise<TranslationJob> {
  const res = await fetch(`${BASE}/translate/${jobId}/status`);
  if (!res.ok) throw new Error('Failed to get translation status');
  return res.json();
}

export function translationDownloadUrl(jobId: string): string {
  return `${BASE}/translate/${jobId}/download`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
