// SceneTimeline — Horizontal scrollable strip of video scenes
// Inspired by CapCut's mobile timeline: tap to select, shows captions and duration

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { VideoComposition, VideoScene, formatDuration, getTotalDuration } from '@/lib/video/types';

interface SceneTimelineProps {
  composition: VideoComposition;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
}

export function SceneTimeline({ composition, selectedSceneId, onSelectScene, onAddScene }: SceneTimelineProps) {
  const totalDur = getTotalDuration(composition);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>TIMELINE</Text>
        <Text style={styles.duration}>{formatDuration(totalDur)} total</Text>
      </View>

      {/* Scene strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {composition.scenes.map((scene, i) => (
          <TouchableOpacity
            key={scene.id}
            style={[
              styles.sceneCard,
              selectedSceneId === scene.id && styles.sceneCardSelected,
            ]}
            onPress={() => onSelectScene(scene.id)}
            activeOpacity={0.8}
          >
            {/* Thumbnail */}
            <View style={styles.thumbnailWrap}>
              {scene.clipThumbnail ? (
                <Image source={{ uri: scene.clipThumbnail }} style={styles.thumbnail} resizeMode="cover" />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                  <Text style={styles.thumbnailIcon}>🎬</Text>
                </View>
              )}
              {/* Duration badge */}
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(scene.duration)}</Text>
              </View>
              {/* Scene number */}
              <View style={styles.sceneBadge}>
                <Text style={styles.sceneNum}>{i + 1}</Text>
              </View>
              {/* Transition indicator */}
              {i > 0 && scene.transition !== 'cut' && (
                <View style={styles.transitionBadge}>
                  <Text style={styles.transitionText}>
                    {scene.transition === 'fade' ? '◐' : '▶'}
                  </Text>
                </View>
              )}
            </View>

            {/* Caption preview */}
            <Text style={styles.captionPreview} numberOfLines={2}>
              {scene.caption || 'No caption'}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Add scene button */}
        <TouchableOpacity style={styles.addBtn} onPress={onAddScene} activeOpacity={0.7}>
          <Text style={styles.addIcon}>+</Text>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Audio tracks indicator */}
      <View style={styles.audioRow}>
        {composition.audio.voiceoverUrl && (
          <View style={[styles.audioChip, { backgroundColor: '#7C3AED22', borderColor: '#7C3AED' }]}>
            <Text style={styles.audioChipText}>🎙 Voiceover</Text>
          </View>
        )}
        {composition.audio.backgroundMusicName && (
          <View style={[styles.audioChip, { backgroundColor: '#F4A26122', borderColor: '#F4A261' }]}>
            <Text style={styles.audioChipText}>🎵 {composition.audio.backgroundMusicName}</Text>
          </View>
        )}
        {composition.audio.ambientSoundName && (
          <View style={[styles.audioChip, { backgroundColor: '#40916C22', borderColor: '#40916C' }]}>
            <Text style={styles.audioChipText}>🔊 {composition.audio.ambientSoundName}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#F4A261',
    letterSpacing: 1.5,
  },
  duration: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  strip: {
    gap: 10,
    paddingRight: 8,
  },
  sceneCard: {
    width: 110,
    borderRadius: 12,
    backgroundColor: '#1A2820',
    borderWidth: 1.5,
    borderColor: '#2D3F35',
    overflow: 'hidden',
  },
  sceneCardSelected: {
    borderColor: '#40916C',
    backgroundColor: '#40916C15',
  },
  thumbnailWrap: {
    width: '100%',
    height: 70,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: '#111B16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: {
    fontSize: 24,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
  sceneBadge: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneNum: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700' as const,
  },
  transitionBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transitionText: {
    fontSize: 10,
    color: '#FFFFFF',
  },
  captionPreview: {
    fontSize: 10,
    color: '#9CA3AF',
    padding: 6,
    lineHeight: 14,
  },
  addBtn: {
    width: 60,
    borderRadius: 12,
    backgroundColor: '#1A2820',
    borderWidth: 1.5,
    borderColor: '#2D3F35',
    borderStyle: 'dashed' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  addIcon: {
    fontSize: 24,
    color: '#40916C',
    fontWeight: '300' as const,
  },
  addText: {
    fontSize: 10,
    color: '#40916C',
    marginTop: 2,
  },
  audioRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  audioChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  audioChipText: {
    fontSize: 10,
    color: '#9CA3AF',
  },
});
