// SceneEditor — Edit individual scene: caption, duration, footage, transition
// Opens when user taps a scene in the timeline

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Platform } from 'react-native';
import { VideoScene, formatDuration } from '@/lib/video/types';

interface SceneEditorProps {
  scene: VideoScene;
  sceneIndex: number;
  totalScenes: number;
  onUpdate: (updates: Partial<VideoScene>) => void;
  onDelete: () => void;
  onSwapFootage: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function SceneEditor({
  scene, sceneIndex, totalScenes,
  onUpdate, onDelete, onSwapFootage, onMoveUp, onMoveDown,
}: SceneEditorProps) {
  const [editingCaption, setEditingCaption] = useState(false);

  return (
    <View style={styles.container}>
      {/* Scene header */}
      <View style={styles.header}>
        <Text style={styles.sceneLabel}>SCENE {sceneIndex + 1} OF {totalScenes}</Text>
        <View style={styles.headerActions}>
          {sceneIndex > 0 && (
            <TouchableOpacity onPress={onMoveUp} style={styles.moveBtn}>
              <Text style={styles.moveBtnText}>▲</Text>
            </TouchableOpacity>
          )}
          {sceneIndex < totalScenes - 1 && (
            <TouchableOpacity onPress={onMoveDown} style={styles.moveBtn}>
              <Text style={styles.moveBtnText}>▼</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Clip preview with swap button */}
      <View style={styles.clipRow}>
        <View style={styles.clipPreview}>
          {scene.clipThumbnail ? (
            <Image source={{ uri: scene.clipThumbnail }} style={styles.clipImage} resizeMode="cover" />
          ) : (
            <View style={[styles.clipImage, styles.clipPlaceholder]}>
              <Text style={{ fontSize: 28 }}>🎥</Text>
            </View>
          )}
        </View>
        <View style={styles.clipActions}>
          <TouchableOpacity style={styles.swapBtn} onPress={onSwapFootage} activeOpacity={0.8}>
            <Text style={styles.swapBtnText}>🔄 Swap Footage</Text>
          </TouchableOpacity>
          <Text style={styles.clipHint}>Search new stock footage or upload your own</Text>
        </View>
      </View>

      {/* Caption editor */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CAPTION</Text>
        {editingCaption ? (
          <TextInput
            style={styles.captionInput}
            value={scene.caption}
            onChangeText={(text) => onUpdate({ caption: text })}
            onBlur={() => setEditingCaption(false)}
            multiline
            autoFocus
            placeholder="Enter caption text..."
            placeholderTextColor="#6B7280"
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingCaption(true)} style={styles.captionDisplay}>
            <Text style={styles.captionText}>{scene.caption || 'Tap to add caption'}</Text>
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Duration */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>DURATION</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={styles.durBtn}
            onPress={() => onUpdate({ duration: Math.max(2, scene.duration - 1) })}
          >
            <Text style={styles.durBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.durValue}>{formatDuration(scene.duration)}</Text>
          <TouchableOpacity
            style={styles.durBtn}
            onPress={() => onUpdate({ duration: Math.min(30, scene.duration + 1) })}
          >
            <Text style={styles.durBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transition */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRANSITION</Text>
        <View style={styles.transRow}>
          {(['cut', 'fade', 'slide'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.transPill, scene.transition === t && styles.transPillActive]}
              onPress={() => onUpdate({ transition: t })}
            >
              <Text style={[styles.transPillText, scene.transition === t && styles.transPillTextActive]}>
                {t === 'cut' ? '✂️ Cut' : t === 'fade' ? '◐ Fade' : '▶ Slide'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111B16',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#2D3F35',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sceneLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#F4A261',
    letterSpacing: 1.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  moveBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1A2820',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2D3F35',
  },
  moveBtnText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#2D1515',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F8717140',
  },
  deleteBtnText: {
    fontSize: 12,
    color: '#F87171',
    fontWeight: '700' as const,
  },
  clipRow: {
    flexDirection: 'row',
    gap: 12,
  },
  clipPreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  clipImage: {
    width: '100%',
    height: '100%',
  },
  clipPlaceholder: {
    backgroundColor: '#0A0F0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipActions: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  swapBtn: {
    backgroundColor: '#1A2820',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2D3F35',
    alignSelf: 'flex-start',
  },
  swapBtnText: {
    fontSize: 13,
    color: '#F9FAFB',
    fontWeight: '600' as const,
  },
  clipHint: {
    fontSize: 11,
    color: '#6B7280',
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  captionInput: {
    backgroundColor: '#0A0F0D',
    borderRadius: 10,
    padding: 12,
    color: '#F9FAFB',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#40916C',
    textAlignVertical: 'top' as const,
  },
  captionDisplay: {
    backgroundColor: '#0A0F0D',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#2D3F35',
    minHeight: 48,
  },
  captionText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  editIcon: {
    fontSize: 14,
    marginLeft: 8,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  durBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1A2820',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2D3F35',
  },
  durBtnText: {
    fontSize: 18,
    color: '#F9FAFB',
    fontWeight: '600' as const,
  },
  durValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#F9FAFB',
    minWidth: 40,
    textAlign: 'center' as const,
  },
  transRow: {
    flexDirection: 'row',
    gap: 8,
  },
  transPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A2820',
    borderWidth: 1,
    borderColor: '#2D3F35',
  },
  transPillActive: {
    backgroundColor: '#40916C20',
    borderColor: '#40916C',
  },
  transPillText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500' as const,
  },
  transPillTextActive: {
    color: '#40916C',
  },
});
