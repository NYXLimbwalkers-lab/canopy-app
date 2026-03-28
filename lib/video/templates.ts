// Industry-specific video templates for tree service companies
// Each template defines pacing, style, and mood presets

import { VideoTemplate } from './types';

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'satisfying',
    name: 'Satisfying',
    emoji: '😌',
    description: 'Slow reveals, dramatic cuts',
    scenePacing: 'slow',
    captionStyle: 'bold',
    transitionDefault: 'fade',
    musicMood: 'cinematic',
    ambientSound: 'chainsaw',
  },
  {
    id: 'fast_cuts',
    name: 'Fast Cuts',
    emoji: '⚡',
    description: 'Quick energy, TikTok style',
    scenePacing: 'fast',
    captionStyle: 'bold',
    transitionDefault: 'cut',
    musicMood: 'energetic',
    ambientSound: null,
  },
  {
    id: 'educational',
    name: 'Educational',
    emoji: '🎓',
    description: 'Clear text, steady pace',
    scenePacing: 'medium',
    captionStyle: 'subtitle',
    transitionDefault: 'fade',
    musicMood: 'calm',
    ambientSound: 'nature',
  },
  {
    id: 'raw_authentic',
    name: 'Raw & Real',
    emoji: '📱',
    description: 'Unfiltered, behind-the-scenes',
    scenePacing: 'medium',
    captionStyle: 'minimal',
    transitionDefault: 'cut',
    musicMood: null,
    ambientSound: 'jobsite',
  },
  {
    id: 'urgent',
    name: 'Urgent',
    emoji: '🚨',
    description: 'Emergency/storm response feel',
    scenePacing: 'fast',
    captionStyle: 'bold',
    transitionDefault: 'cut',
    musicMood: 'dramatic',
    ambientSound: 'wind',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    emoji: '🎬',
    description: 'Long shots, epic feel',
    scenePacing: 'slow',
    captionStyle: 'minimal',
    transitionDefault: 'fade',
    musicMood: 'cinematic',
    ambientSound: 'nature',
  },
];

// ── Background music library (royalty-free from Pixabay) ────────────────────
// These are direct Pixabay audio CDN URLs — all royalty-free for commercial use

export const BACKGROUND_MUSIC: { id: string; name: string; mood: string; url: string }[] = [
  { id: 'energetic1', name: 'Upbeat Action', mood: 'energetic', url: 'https://cdn.pixabay.com/audio/2024/11/29/audio_e23e14be71.mp3' },
  { id: 'cinematic1', name: 'Epic Cinematic', mood: 'cinematic', url: 'https://cdn.pixabay.com/audio/2024/09/10/audio_6e1ebc2e4e.mp3' },
  { id: 'calm1', name: 'Gentle Acoustic', mood: 'calm', url: 'https://cdn.pixabay.com/audio/2024/10/07/audio_0f0b5e9bf1.mp3' },
  { id: 'dramatic1', name: 'Dramatic Tension', mood: 'dramatic', url: 'https://cdn.pixabay.com/audio/2024/09/18/audio_89fb2a5a8c.mp3' },
];

// ── Ambient sounds ──────────────────────────────────────────────────────────

export const AMBIENT_SOUNDS: { id: string; name: string; category: string; url: string }[] = [
  { id: 'chainsaw1', name: 'Chainsaw Running', category: 'chainsaw', url: 'https://cdn.pixabay.com/audio/2022/03/19/audio_c0c0a1e3c6.mp3' },
  { id: 'nature1', name: 'Forest Birds', category: 'nature', url: 'https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3' },
  { id: 'wind1', name: 'Strong Wind', category: 'wind', url: 'https://cdn.pixabay.com/audio/2022/10/30/audio_3b1dae6a2d.mp3' },
  { id: 'jobsite1', name: 'Construction Site', category: 'jobsite', url: 'https://cdn.pixabay.com/audio/2024/02/21/audio_8c5e364920.mp3' },
];
