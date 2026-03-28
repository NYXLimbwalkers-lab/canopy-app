// Canopy TTS — Text-to-speech using Google Translate TTS (free, no API key)
// Works by splitting text into chunks under 200 chars and playing them sequentially

import { Platform } from 'react-native';

// Split text into chunks at sentence boundaries for Google TTS (~200 char limit)
function splitForTTS(text: string, maxLen = 190): string[] {
  // Clean the text for speech — strip markdown, formatting, emojis used as bullets
  const cleaned = text
    .replace(/\*\*(.*?)\*\*/g, '$1')     // **bold** → bold
    .replace(/\*(.*?)\*/g, '$1')          // *italic* → italic
    .replace(/#{1,6}\s*/g, '')            // # headings
    .replace(/```[\s\S]*?```/g, '')       // code blocks
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/^[\s•\-–—]+/gm, '')         // bullet points
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[.!?;])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxLen) {
      if (current) chunks.push(current.trim());
      if (sentence.length > maxLen) {
        // Split long sentences by words
        const words = sentence.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if (wordChunk.length + word.length + 1 > maxLen) {
            if (wordChunk) chunks.push(wordChunk.trim());
            wordChunk = word;
          } else {
            wordChunk += (wordChunk ? ' ' : '') + word;
          }
        }
        current = wordChunk;
      } else {
        current = sentence;
      }
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [cleaned.slice(0, maxLen)];
}

// Active audio state for stop functionality
let currentAudio: HTMLAudioElement | null = null;
let audioQueue: string[] = [];
let isPlaying = false;
let stopRequested = false;

/** Speak text aloud using Google Translate TTS. Returns immediately — plays async. */
export function speak(text: string): void {
  if (Platform.OS !== 'web') return;
  stop(); // Stop any current playback

  const chunks = splitForTTS(text);
  if (chunks.length === 0) return;

  audioQueue = chunks.map(
    chunk => `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(chunk)}`
  );
  isPlaying = true;
  stopRequested = false;
  playNext();
}

function playNext(): void {
  if (stopRequested || audioQueue.length === 0) {
    isPlaying = false;
    currentAudio = null;
    return;
  }

  const url = audioQueue.shift()!;
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onended = () => playNext();
  audio.onerror = () => playNext(); // Skip failed chunks
  audio.play().catch(() => playNext());
}

/** Stop current TTS playback */
export function stop(): void {
  stopRequested = true;
  audioQueue = [];
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isPlaying = false;
}

/** Check if TTS is currently playing */
export function isSpeaking(): boolean {
  return isPlaying;
}

/** Speak a short prompt — useful for quick questions/alerts */
export function speakPrompt(text: string): void {
  if (Platform.OS !== 'web') return;
  stop();
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text.slice(0, 190))}`;
  const audio = new Audio(url);
  currentAudio = audio;
  isPlaying = true;
  audio.onended = () => { isPlaying = false; currentAudio = null; };
  audio.onerror = () => { isPlaying = false; currentAudio = null; };
  audio.play().catch(() => { isPlaying = false; currentAudio = null; });
}
