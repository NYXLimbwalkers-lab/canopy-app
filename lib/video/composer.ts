// Video Composition Engine — Turns AI script + footage into a scene-by-scene composition
// This is the "magic" — it breaks the script into timed scenes and matches each to footage

import { VideoComposition, VideoScene, createScene, createComposition } from './types';

interface ScriptData {
  hook: string;
  script: string;
  shotList: string[];
  hashtags: string[];
  caption: string;
}

interface PexelsClip {
  url: string;
  thumbnail: string | null;
  duration: number;
}

// ── Main composition builder ────────────────────────────────────────────────

/**
 * Build a full VideoComposition from an AI script and stock footage.
 * This is the core "Script → Video" automation.
 *
 * 1. Splits script into sentences
 * 2. Groups sentences into scenes (2-3 sentences per scene)
 * 3. Calculates timing for each scene based on word count
 * 4. Assigns footage clips to scenes
 * 5. Creates caption text from the grouped sentences
 */
export function composeFromScript(
  scriptData: ScriptData,
  clips: PexelsClip[],
  companyName: string,
  voiceoverUrl: string | null = null,
): VideoComposition {
  const comp = createComposition(companyName);
  comp.audio.voiceoverUrl = voiceoverUrl;

  // Split script into sentences
  const sentences = splitIntoSentences(scriptData.script);
  if (sentences.length === 0) return comp;

  // Group sentences into scenes (target: 2-3 sentences per scene, 5-10 seconds each)
  const sceneGroups = groupIntoScenes(sentences);

  // Calculate timing for each scene group
  const totalWords = sentences.join(' ').split(/\s+/).length;
  const totalDuration = Math.max(15, Math.min(90, Math.round(totalWords / 2.5)));

  // Build scenes
  sceneGroups.forEach((group, i) => {
    const groupWords = group.join(' ').split(/\s+/).length;
    const sceneDuration = Math.max(3, Math.round((groupWords / totalWords) * totalDuration));

    // Match footage — use shotList hints if available, otherwise round-robin clips
    const clip = clips[i % clips.length] ?? { url: '', thumbnail: null, duration: 10 };
    const shotHint = scriptData.shotList[i] ?? '';

    comp.scenes.push(createScene({
      clipUrl: clip.url,
      clipThumbnail: clip.thumbnail,
      duration: sceneDuration,
      trimStart: 0,
      caption: group.join(' '),
      searchQuery: extractSearchQuery(shotHint, group.join(' ')),
      transition: i === 0 ? 'cut' : 'fade',
    }));
  });

  return comp;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

function groupIntoScenes(sentences: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).length;
    current.push(sentence);
    currentWords += words;

    // Target ~15-25 words per scene (6-10 seconds of speech)
    if (currentWords >= 15 || current.length >= 3) {
      groups.push([...current]);
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) {
    // Merge with last group if too short
    if (groups.length > 0 && current.join(' ').split(/\s+/).length < 8) {
      groups[groups.length - 1].push(...current);
    } else {
      groups.push(current);
    }
  }

  return groups.length > 0 ? groups : [sentences];
}

/**
 * Extract a good Pexels search query from the shot description or caption text.
 * Prioritizes the shot list hint, falls back to extracting key nouns from caption.
 */
function extractSearchQuery(shotHint: string, captionText: string): string {
  if (shotHint && shotHint.length > 3) {
    // Shot list descriptions are already visual — use them directly
    return shotHint.slice(0, 50);
  }
  // Extract visual keywords from caption
  const text = captionText.toLowerCase();
  const treeKeywords = [
    'chainsaw', 'stump', 'crane', 'climbing', 'trunk', 'branches', 'limbs',
    'removal', 'trimming', 'pruning', 'chipping', 'mulch', 'firewood',
    'storm', 'damage', 'roof', 'power lines', 'backyard', 'property',
    'oak', 'pine', 'maple', 'palm', 'cedar', 'elm',
    'truck', 'equipment', 'crew', 'safety', 'helmet', 'harness',
  ];
  const found = treeKeywords.filter(k => text.includes(k));
  if (found.length > 0) return `tree service ${found.slice(0, 2).join(' ')}`;
  return 'tree service arborist outdoor work';
}

/**
 * Apply a template's pacing and style to an existing composition.
 * This lets users one-tap change the "feel" of their video.
 */
export function applyTemplate(
  comp: VideoComposition,
  template: { scenePacing: 'fast' | 'medium' | 'slow'; captionStyle: string; transitionDefault: string },
): VideoComposition {
  const paceMultiplier = template.scenePacing === 'fast' ? 0.7 : template.scenePacing === 'slow' ? 1.4 : 1.0;

  return {
    ...comp,
    captionStyle: template.captionStyle as any,
    scenes: comp.scenes.map(scene => ({
      ...scene,
      duration: Math.max(2, Math.round(scene.duration * paceMultiplier)),
      transition: template.transitionDefault as any,
    })),
  };
}
