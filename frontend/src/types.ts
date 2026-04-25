export interface Video {
  id: number;
  title: string;
  channel: string;
  duration: number;      // seconds
  file_size: number;     // bytes
  thumbnail: string;
  yt_url: string;
  downloaded_at: string;
  tags: string[];
}

export interface DownloadJob {
  id: string;
  yt_url: string;
  status: 'pending' | 'downloading' | 'done' | 'failed';
  progress: number;
  error?: string;
  video_id?: number;
}

export interface CookiesStatus {
  configured: boolean;
  path: string;
  size: number;
}

export interface CookiesTestResult {
  ok: boolean;
  title?: string;
  extractor?: string;
}

export interface TranslateJob {
  id: string;
  video_id: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  error?: string;
}
