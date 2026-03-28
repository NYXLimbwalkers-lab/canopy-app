// Tree-Service-Pro Video Engine — Core Types
// This is the single source of truth for video composition data.
// The editor manipulates it, the preview renders it, the server processes it.

export interface VideoScene {
  id: string;
  clipUrl: string;              // Pexels URL, user upload, or placeholder
  clipThumbnail: string | null; // Preview frame URL (from Pexels image field)
  duration: number;             // seconds this scene lasts
  trimStart: number;            // offset into the source clip
  caption: string;              // text overlay for this scene
  searchQuery: string;          // what Pexels query was used (for re-search)
  transition: 'cut' | 'fade' | 'slide';
}

export interface AudioTrack {
  voiceoverUrl: string | null;
  backgroundMusicUrl: string | null;
  backgroundMusicName: string | null;
  ambientSoundUrl: string | null;
  ambientSoundName: string | null;
  voiceoverVolume: number;      // 0-1
  musicVolume: number;          // 0-1
  ambientVolume: number;        // 0-1
}

export type CaptionStyle = 'bold' | 'minimal' | 'subtitle' | 'none';
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface VideoComposition {
  scenes: VideoScene[];
  audio: AudioTrack;
  watermark: { text: string; position: WatermarkPosition; enabled: boolean };
  captionStyle: CaptionStyle;
  settings: {
    width: number;
    height: number;
    fps: number;
    quality: 'draft' | 'standard' | 'hd';
  };
}

export interface VideoTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  scenePacing: 'fast' | 'medium' | 'slow';
  captionStyle: CaptionStyle;
  transitionDefault: 'cut' | 'fade' | 'slide';
  musicMood: string | null;
  ambientSound: string | null;
}

// ── Progress tracking ──────────────────────────────────────────────────────

export interface ProgressStep {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string; // e.g. "Scene 2 of 5"
}

// ── Helper functions ────────────────────────────────────────────────────────

let _id = 0;
export function genId(): string {
  return `scene_${Date.now()}_${++_id}`;
}

export function createScene(partial: Partial<VideoScene> = {}): VideoScene {
  return {
    id: genId(),
    clipUrl: '',
    clipThumbnail: null,
    duration: 5,
    trimStart: 0,
    caption: '',
    searchQuery: '',
    transition: 'cut',
    ...partial,
  };
}

export function createComposition(companyName: string): VideoComposition {
  return {
    scenes: [],
    audio: {
      voiceoverUrl: null,
      backgroundMusicUrl: null,
      backgroundMusicName: null,
      ambientSoundUrl: null,
      ambientSoundName: null,
      voiceoverVolume: 1.0,
      musicVolume: 0.15,
      ambientVolume: 0.1,
    },
    watermark: { text: companyName, position: 'top-left', enabled: true },
    captionStyle: 'bold',
    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      quality: 'standard',
    },
  };
}

export function getTotalDuration(comp: VideoComposition): number {
  return comp.scenes.reduce((sum, s) => sum + s.duration, 0);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}
