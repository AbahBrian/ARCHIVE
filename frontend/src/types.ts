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

export interface TranslationJob {
  id: string;
  video_id: number;
  status: 'pending' | 'transcribing' | 'translating' | 'synthesizing' | 'merging' | 'done' | 'failed';
  stage: string | null;
  progress: number;
  error: string | null;
  output_path: string | null;
  created_at: string;
}
