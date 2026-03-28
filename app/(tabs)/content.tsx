import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Input } from '@/components/ui/Input';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { postToTikTok, isTikTokConnected } from '@/lib/tiktok';
import { uploadYouTubeShort, isYouTubeConnected } from '@/lib/youtube';
import { isFacebookConnected } from '@/lib/meta';

// ─── Web Video Player (uses native HTML5 <video> on web) ────────────────────
function WebVideoPlayer({ url, poster }: { url: string; poster?: string | null }) {
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    // Access the underlying DOM node for web
    const node = containerRef.current as unknown as HTMLDivElement;
    if (!node || !node.querySelector) return;
    // Clear and insert a <video> element
    node.innerHTML = '';
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.cssText = 'width:100%;height:100%;border-radius:12px;object-fit:contain;background:#000;';
    if (poster) video.poster = poster;
    node.appendChild(video);
  }, [url, poster]);

  return <View ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ─── Dark palette (not from Colors — this tab has its own rich dark theme) ───
const D = {
  bg:         '#0A0F0D',
  surface:    '#111B16',
  surfaceAlt: '#1A2820',
  border:     '#2D3F35',
  text:       '#F9FAFB',
  textSec:    '#9CA3AF',
  green:      '#40916C',
  gold:       '#F4A261',
  purple:     '#7C3AED',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContentPost {
  id: string;
  video_type: string | null;
  platform: string;
  scheduled_at: string | null;
  posted_at: string | null;
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  script: string | null;
}

interface SocialConnection {
  platform: string;
  connected: boolean;
  handle: string | null;
}

interface GeneratedVideo {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VIDEO_TYPES = [
  { key: 'satisfying_removal', emoji: '🌳', label: 'Satisfying Removal',  viralScore: 9.4 },
  { key: 'before_after',       emoji: '✨', label: 'Before & After',       viralScore: 8.8 },
  { key: 'did_you_know',       emoji: '🧠', label: 'Did You Know',         viralScore: 7.9 },
  { key: 'day_in_life',        emoji: '📸', label: 'Day in the Life',      viralScore: 8.2 },
  { key: 'price_transparency', emoji: '💰', label: 'Price Transparency',   viralScore: 9.1 },
  { key: 'storm_damage',       emoji: '⚡', label: 'Storm Damage',         viralScore: 9.6 },
];

const SOCIAL_PLATFORMS = [
  {
    key:       'tiktok',
    emoji:     '♪',
    label:     'TikTok',
    cardBg:    '#000000',
    cardBorder:'#2A2A2A',
    textColor: '#FFFFFF',
    tagline:   'Short-form viral video',
  },
  {
    key:       'instagram',
    emoji:     '◈',
    label:     'Instagram',
    cardBg:    '#1A0A2E',
    cardBorder:'#833AB4',
    textColor: '#E879F9',
    tagline:   'Reels & Stories',
  },
  {
    key:       'youtube',
    emoji:     '▶',
    label:     'YouTube',
    cardBg:    '#1A0000',
    cardBorder:'#FF0000',
    textColor: '#FF4444',
    tagline:   'Long-form & Shorts',
  },
];

// ─── Calendar helpers ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['S','M','T','W','T','F','S'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ─── Viral Score display ──────────────────────────────────────────────────────
function ViralScoreBadge({ score }: { score: number }) {
  const fires = score >= 9.3 ? 3 : score >= 8.5 ? 2 : 1;
  return (
    <View style={vs.wrap}>
      <Text style={vs.fires}>{'🔥'.repeat(fires)}</Text>
      <Text style={vs.score}>{score.toFixed(1)}</Text>
    </View>
  );
}
const vs = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fires: { fontSize: 11 },
  score: { fontSize: 12, fontWeight: '700', color: D.gold },
});

// ─── Collapsible calendar ─────────────────────────────────────────────────────
function CollapsibleCalendar({ posts }: { posts: ContentPost[] }) {
  const [open, setOpen] = useState(false);
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth();
  const days     = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today    = now.getDate();

  const scheduledDays = new Set(
    posts.filter(p => p.scheduled_at).map(p => new Date(p.scheduled_at!).getDate())
  );

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <View style={cal.wrapper}>
      <TouchableOpacity style={cal.toggle} onPress={() => setOpen(o => !o)} activeOpacity={0.8}>
        <Text style={cal.toggleIcon}>📅</Text>
        <Text style={cal.toggleLabel}>View schedule</Text>
        <Text style={cal.toggleCount}>{posts.length} posts</Text>
        <Text style={cal.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={cal.body}>
          <View style={cal.calHeader}>
            <Text style={cal.calMonth}>{MONTH_NAMES[month]} {year}</Text>
          </View>
          <View style={cal.dayRow}>
            {DAY_NAMES.map((d, i) => (
              <Text key={i} style={cal.dayLabel}>{d}</Text>
            ))}
          </View>
          <View style={cal.grid}>
            {cells.map((day, i) => (
              <View key={i} style={cal.cell}>
                {day != null && (
                  <View style={[
                    cal.dayCircle,
                    day === today && cal.todayCircle,
                    scheduledDays.has(day) && cal.scheduledCircle,
                  ]}>
                    <Text style={[
                      cal.dayNum,
                      day === today && cal.todayNum,
                      scheduledDays.has(day) && cal.scheduledNum,
                    ]}>
                      {day}
                    </Text>
                    {scheduledDays.has(day) && <View style={cal.dot} />}
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const cal = StyleSheet.create({
  wrapper:        { backgroundColor: D.surface, borderRadius: Theme.radius.xl, borderWidth: 1, borderColor: D.border, overflow: 'hidden' },
  toggle:         { flexDirection: 'row', alignItems: 'center', padding: Theme.space.lg, gap: Theme.space.sm },
  toggleIcon:     { fontSize: 18 },
  toggleLabel:    { flex: 1, fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: D.text },
  toggleCount:    { fontSize: Theme.font.size.small, color: D.textSec },
  chevron:        { fontSize: 11, color: D.textSec, marginLeft: 4 },
  body:           { borderTopWidth: 1, borderTopColor: D.border, padding: Theme.space.lg },
  calHeader:      { marginBottom: Theme.space.md },
  calMonth:       { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  dayRow:         { flexDirection: 'row', marginBottom: Theme.space.sm },
  dayLabel:       { flex: 1, textAlign: 'center', fontSize: Theme.font.size.caption, color: D.textSec, fontWeight: Theme.font.weight.medium },
  grid:           { flexDirection: 'row', flexWrap: 'wrap' },
  cell:           { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCircle:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todayCircle:    { backgroundColor: D.green },
  scheduledCircle:{ backgroundColor: D.green + '30' },
  dayNum:         { fontSize: 12, color: D.textSec },
  todayNum:       { color: '#FFFFFF', fontWeight: Theme.font.weight.bold },
  scheduledNum:   { color: D.green, fontWeight: Theme.font.weight.semibold },
  dot:            { width: 4, height: 4, borderRadius: 2, backgroundColor: D.green, position: 'absolute', bottom: 2 },
});

// ─── Teleprompter modal ───────────────────────────────────────────────────────
interface TeleprompterProps {
  visible: boolean;
  script: string;
  videoTypeLabel: string;
  onClose: () => void;
}

function TeleprompterModal({ visible, script, videoTypeLabel, onClose }: TeleprompterProps) {
  const filmChecklist = [
    'Charge your phone — aim for full battery',
    'Film vertical (9:16) for TikTok and Reels',
    'Clean your lens with a soft cloth',
    'Find good natural light (golden hour is best)',
    'Record 3+ takes and pick the best',
    'Speak clearly and deliver your hook in the first 3 seconds',
    'Add captions in the platform editor before posting',
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={tp.container}>
        <View style={tp.header}>
          <TouchableOpacity style={tp.closeBtn} onPress={onClose}>
            <Text style={tp.closeText}>✕ Done</Text>
          </TouchableOpacity>
          <Text style={tp.headerTitle}>TELEPROMPTER</Text>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView style={tp.scroll} contentContainerStyle={tp.scrollContent}>
          <View style={tp.typeTag}>
            <Text style={tp.typeTagText}>{videoTypeLabel.toUpperCase()}</Text>
          </View>

          <Text style={tp.scriptText}>{script}</Text>

          <View style={tp.divider} />

          <Text style={tp.checklistTitle}>📋 FILMING CHECKLIST</Text>
          {filmChecklist.map((item, i) => (
            <View key={i} style={tp.checkRow}>
              <View style={tp.checkbox} />
              <Text style={tp.checkText}>{item}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const tp = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#000000' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  closeBtn:      { paddingVertical: 8, paddingHorizontal: 4 },
  closeText:     { fontSize: 15, color: D.gold, fontWeight: '600' },
  headerTitle:   { fontSize: 13, fontWeight: '800', color: '#555555', letterSpacing: 2 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60, gap: 24 },
  typeTag:       { backgroundColor: D.green + '25', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: D.green + '60' },
  typeTagText:   { fontSize: 11, fontWeight: '700', color: D.green, letterSpacing: 1.5 },
  scriptText:    { fontSize: 28, fontWeight: '600', color: '#FFFFFF', lineHeight: 44, letterSpacing: 0.3 },
  divider:       { height: 1, backgroundColor: '#1C1C1C' },
  checklistTitle:{ fontSize: 13, fontWeight: '700', color: '#666666', letterSpacing: 1.5 },
  checkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox:      { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#333333', marginTop: 2 },
  checkText:     { flex: 1, fontSize: 16, color: '#AAAAAA', lineHeight: 26 },
});

// ─── AI Video Generate Modal ──────────────────────────────────────────────────
interface VideoGenerateProps {
  visible: boolean;
  videoId: string | null;
  invokeError: string | null;
  onClose: () => void;
  onPostToSocial?: (videoUrl: string) => void;
}

const PROGRESS_STEPS = [
  { key: 'voice',   label: 'Generating voiceover',   icon: '🎙' },
  { key: 'footage', label: 'Finding stock footage',   icon: '🎬' },
  { key: 'render',  label: 'Rendering your video',    icon: '⚙️' },
];

function VideoGenerateModal({ visible, videoId, invokeError, onClose, onPostToSocial }: VideoGenerateProps) {
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible || !videoId) {
      setVideo(null);
      setStepIndex(0);
      return;
    }

    // Animate through progress steps every ~8 seconds while processing
    stepTimerRef.current = setInterval(() => {
      setStepIndex(i => (i < PROGRESS_STEPS.length - 1 ? i + 1 : i));
    }, 8000);

    // Poll DB immediately (status may already be set since edge function now awaits processing)
    const pollStatus = async () => {
      const { data } = await supabase
        .from('generated_videos')
        .select('*')
        .eq('id', videoId)
        .single();
      if (data && (data.status === 'ready' || data.status === 'failed')) {
        setVideo(data as GeneratedVideo);
        clearInterval(stepTimerRef.current!);
        setStepIndex(PROGRESS_STEPS.length - 1);
      }
    };
    pollStatus();

    // Also poll every 15s as a fallback in case Realtime misses an update
    const pollInterval = setInterval(pollStatus, 15000);

    // Timeout: if still processing after 3 minutes, show as failed
    const timeout = setTimeout(() => {
      setVideo(prev => {
        if (prev && (prev.status === 'ready' || prev.status === 'failed')) return prev;
        return { id: videoId, status: 'failed', error_message: 'Video generation timed out. The render server may be unavailable — please try again.' } as GeneratedVideo;
      });
      clearInterval(stepTimerRef.current!);
      setStepIndex(PROGRESS_STEPS.length - 1);
    }, 180000);

    // Subscribe to Realtime updates on this video row
    const channel = supabase
      .channel(`video-${videoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generated_videos', filter: `id=eq.${videoId}` },
        (payload) => {
          const updated = payload.new as GeneratedVideo;
          setVideo(updated);
          if (updated.status === 'ready' || updated.status === 'failed') {
            clearInterval(stepTimerRef.current!);
            clearInterval(pollInterval);
            clearTimeout(timeout);
            setStepIndex(PROGRESS_STEPS.length - 1);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      clearInterval(stepTimerRef.current!);
      clearInterval(pollInterval);
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [visible, videoId]);

  const handleShare = async () => {
    if (!video?.video_url) return;
    try {
      await Share.share({ url: video.video_url, message: 'Check out my tree service video!' });
    } catch {
      await Linking.openURL(video.video_url);
    }
  };

  const isReady   = video?.status === 'ready';
  const isFailed  = video?.status === 'failed' || (!videoId && !!invokeError);
  const isPending = !isReady && !isFailed;

  // Merge error sources
  const errorMessage = video?.error_message ?? invokeError ?? 'Something went wrong.';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={vg.container}>
        <View style={vg.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={vg.closeTxt}>Done</Text>
          </TouchableOpacity>
          <Text style={vg.headerTitle}>AI Video</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={vg.body}>
          {isPending && (
            <>
              <ActivityIndicator color={D.green} size="large" style={{ marginBottom: 24 }} />
              <Text style={vg.processingTitle}>Creating your video…</Text>
              <Text style={vg.processingSubtitle}>This takes about 60 seconds</Text>

              <View style={vg.stepList}>
                {PROGRESS_STEPS.map((step, i) => {
                  const done    = i < stepIndex;
                  const current = i === stepIndex;
                  return (
                    <View key={step.key} style={vg.stepRow}>
                      <View style={[vg.stepDot, done && vg.stepDotDone, current && vg.stepDotActive]}>
                        <Text style={vg.stepDotText}>
                          {done ? '✓' : current ? '◉' : '○'}
                        </Text>
                      </View>
                      <Text style={[vg.stepLabel, done && vg.stepLabelDone, current && vg.stepLabelActive]}>
                        {step.icon} {step.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={vg.tipCard}>
                <Text style={vg.tipTitle}>While you wait…</Text>
                <Text style={vg.tipText}>
                  Your video is 1080×1920 (9:16) — ready to post directly to TikTok, Instagram Reels, and YouTube Shorts.
                </Text>
              </View>
            </>
          )}

          {isReady && (
            <>
              <Text style={vg.readyEmoji}>🎉</Text>
              <Text style={vg.readyTitle}>Your video is ready!</Text>
              <Text style={vg.readySubtitle}>Tap share to post it to your socials</Text>

              {video?.video_url && (
                <View style={vg.thumbnailWrap}>
                  {Platform.OS === 'web' ? (
                    <WebVideoPlayer url={video.video_url} poster={video.thumbnail_url} />
                  ) : (
                    <TouchableOpacity style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', borderRadius: 12 }} onPress={() => Linking.openURL(video.video_url!)} activeOpacity={0.85}>
                      <Text style={{ fontSize: 48, opacity: 0.9 }}>▶</Text>
                      <Text style={{ color: '#fff', marginTop: 8, fontSize: 14 }}>Tap to play video</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity style={vg.shareBtn} onPress={handleShare} activeOpacity={0.85}>
                <Text style={vg.shareBtnText}>📤 Share Video</Text>
              </TouchableOpacity>

              {video?.video_url && onPostToSocial && (
                <TouchableOpacity
                  style={vg.postSocialBtn}
                  onPress={() => onPostToSocial(video.video_url!)}
                  activeOpacity={0.85}
                >
                  <Text style={vg.postSocialBtnText}>📱 Post to Social</Text>
                </TouchableOpacity>
              )}

              {video?.video_url && (
                <TouchableOpacity
                  style={vg.openBtn}
                  onPress={() => Linking.openURL(video.video_url!)}
                  activeOpacity={0.8}
                >
                  <Text style={vg.openBtnText}>Open in browser →</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {isFailed && (
            <>
              <Text style={vg.errorEmoji}>⚠️</Text>
              <Text style={vg.errorTitle}>Video generation failed</Text>
              <Text style={vg.errorMessage}>{errorMessage}</Text>

              <View style={vg.keysCard}>
                <Text style={vg.keysTitle}>Required API keys (Supabase → Edge Functions → Secrets):</Text>
                {['ELEVENLABS_API_KEY', 'PEXELS_API_KEY', 'RENDER_SERVER_URL'].map(k => (
                  <Text key={k} style={vg.keyItem}>• {k}</Text>
                ))}
              </View>

              <TouchableOpacity style={vg.retryBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={vg.retryBtnText}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const vg = StyleSheet.create({
  container:          { flex: 1, backgroundColor: D.bg },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.surface },
  closeTxt:           { fontSize: Theme.font.size.body, color: D.green, fontWeight: Theme.font.weight.semibold },
  headerTitle:        { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  body:               { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Theme.layout.screenPadding, gap: 16 },

  processingTitle:    { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: D.text, textAlign: 'center' },
  processingSubtitle: { fontSize: Theme.font.size.small, color: D.textSec, textAlign: 'center', marginTop: -8 },

  stepList:           { width: '100%', gap: 14, marginTop: 8 },
  stepRow:            { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot:            { width: 28, height: 28, borderRadius: 14, backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: D.border },
  stepDotActive:      { borderColor: D.green, backgroundColor: D.green + '25' },
  stepDotDone:        { borderColor: D.green, backgroundColor: D.green },
  stepDotText:        { fontSize: 11, color: D.textSec, fontWeight: '700' },
  stepLabel:          { fontSize: Theme.font.size.body, color: D.textSec },
  stepLabelActive:    { color: D.text, fontWeight: Theme.font.weight.medium },
  stepLabelDone:      { color: D.green },

  tipCard:            { backgroundColor: D.surface, borderRadius: Theme.radius.xl, padding: Theme.space.lg, borderWidth: 1, borderColor: D.border, width: '100%', gap: 6, marginTop: 8 },
  tipTitle:           { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.bold, color: D.gold },
  tipText:            { fontSize: Theme.font.size.small, color: D.textSec, lineHeight: 20 },

  readyEmoji:         { fontSize: 56, textAlign: 'center' },
  readyTitle:         { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: D.text, textAlign: 'center' },
  readySubtitle:      { fontSize: Theme.font.size.small, color: D.textSec, textAlign: 'center' },

  thumbnailWrap:      { width: '100%', aspectRatio: 9/16, maxHeight: 420, borderRadius: Theme.radius.xl, overflow: 'hidden' },
  thumbnailPlaceholder: { flex: 1, backgroundColor: D.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderRadius: Theme.radius.xl, borderWidth: 1, borderColor: D.border },
  thumbnailIcon:      { fontSize: 48, color: D.green },

  shareBtn:           { backgroundColor: D.green, width: '100%', paddingVertical: 16, borderRadius: Theme.radius.lg, alignItems: 'center' },
  shareBtnText:       { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
  postSocialBtn:      { backgroundColor: D.purple, width: '100%', paddingVertical: 16, borderRadius: Theme.radius.lg, alignItems: 'center' },
  postSocialBtnText:  { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
  openBtn:            { paddingVertical: 8 },
  openBtnText:        { fontSize: Theme.font.size.small, color: D.textSec },

  errorEmoji:         { fontSize: 48, textAlign: 'center' },
  errorTitle:         { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: '#F87171', textAlign: 'center' },
  errorMessage:       { fontSize: Theme.font.size.small, color: D.textSec, textAlign: 'center', lineHeight: 20 },
  keysCard:           { backgroundColor: D.surface, borderRadius: Theme.radius.lg, padding: Theme.space.lg, borderWidth: 1, borderColor: D.border, width: '100%', gap: 6 },
  keysTitle:          { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: D.text, marginBottom: 4 },
  keyItem:            { fontSize: Theme.font.size.small, color: D.textSec, fontFamily: 'monospace' } as any,
  retryBtn:           { width: '100%', paddingVertical: 14, borderRadius: Theme.radius.lg, alignItems: 'center', borderWidth: 1, borderColor: D.border },
  retryBtnText:       { fontSize: Theme.font.size.body, color: D.text },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ContentScreen() {
  const { company } = useAuthStore();
  const [posts,             setPosts]             = useState<ContentPost[]>([]);
  const [connections,       setConnections]       = useState<SocialConnection[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [selectedVideoType, setSelectedVideoType] = useState<string | null>(null);
  const [generatingScript,  setGeneratingScript]  = useState(false);
  const [script,            setScript]            = useState<string | null>(null);
  const [scriptModal,       setScriptModal]       = useState(false);
  const [teleprompterModal, setTeleprompterModal] = useState(false);
  const [videoModal,        setVideoModal]        = useState(false);
  const [videoJobId,        setVideoJobId]        = useState<string | null>(null);
  const [videoInvokeError,  setVideoInvokeError]  = useState<string | null>(null);
  const [generatingVideo,   setGeneratingVideo]   = useState(false);
  const [socialModal,       setSocialModal]       = useState(false);
  const [socialPlatform,    setSocialPlatform]    = useState<string | null>(null);
  const [socialInput,       setSocialInput]       = useState('');
  const [socialSaving,      setSocialSaving]      = useState(false);
  const [socialError,       setSocialError]       = useState<string | null>(null);

  // Post to Social modal state
  const [postSocialModal,   setPostSocialModal]   = useState(false);
  const [postSocialVideo,   setPostSocialVideo]   = useState<{ url: string; title: string; script: string } | null>(null);
  const [postSocialCaption, setPostSocialCaption] = useState('');
  const [postSocialTags,    setPostSocialTags]    = useState('');
  const [postSocialPlatforms, setPostSocialPlatforms] = useState<{ tiktok: boolean; youtube: boolean; facebook: boolean }>({ tiktok: false, youtube: false, facebook: false });
  const [postSocialConnected, setPostSocialConnected] = useState<{ tiktok: boolean; youtube: boolean; facebook: boolean }>({ tiktok: false, youtube: false, facebook: false });
  const [postSocialPosting,  setPostSocialPosting]  = useState(false);
  const [postSocialResults,  setPostSocialResults]  = useState<{ platform: string; success: boolean; message: string }[]>([]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!company) return;
    const postsRes = await supabase
      .from('content_posts')
      .select('*')
      .eq('company_id', company.id)
      .order('scheduled_at', { ascending: true });
    if (postsRes.error) console.error('Failed to fetch posts:', postsRes.error.message);
    setPosts(postsRes.data ?? []);
    try {
      const connectionsRes = await supabase
        .from('social_connections')
        .select('*')
        .eq('company_id', company.id);
      if (connectionsRes.error) console.error('Failed to fetch connections:', connectionsRes.error.message);
      setConnections(connectionsRes.data ?? []);
    } catch {
      setConnections([]);
    }
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // ── Script generation ──────────────────────────────────────────────────────
  const generateScript = async (videoType: string) => {
    const key = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
    if (!key || !company) {
      setScript('Connect your OpenRouter API key in settings to generate AI scripts.');
      setScriptModal(true);
      return;
    }

    setSelectedVideoType(videoType);
    setGeneratingScript(true);
    setScriptModal(true);
    setScript(null);

    const videoTypeLabel = VIDEO_TYPES.find(v => v.key === videoType)?.label ?? videoType;

    try {
      const resp = await globalThis.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          messages: [
            {
              role: 'system',
              content: `You write viral TikTok scripts that sound like a real person talking — not a commercial. Use contractions, natural pauses, filler words like "honestly" and "look". Think popular blue-collar TikTok creators. Never sound corporate.`,
            },
            {
              role: 'user',
              content: `Write a "${videoTypeLabel}" TikTok script for ${company.name} in ${company.city ?? 'their area'}.

Rules:
- Start with a scroll-stopping hook (under 10 words, curiosity or shock)
- Write ONLY the spoken words — no [SHOT] markers or stage directions
- 80-120 words total (30-45 seconds when spoken naturally)
- Sound like you're talking to a friend, not reading a script
- End with a natural, soft call to action

Format:
HOOK: (the first line)
---
(rest of the script as natural speech)`,
            },
          ],
          max_tokens: 300,
        }),
      });
      const json = await resp.json();
      setScript(json.choices?.[0]?.message?.content ?? 'Could not generate script. Try again.');
    } catch {
      setScript('Error generating script. Check your connection and try again.');
    } finally {
      setGeneratingScript(false);
    }
  };

  // ── AI video generation ────────────────────────────────────────────────────
  const generateVideo = async () => {
    if (!company || !script || !selectedVideoType) return;
    setGeneratingVideo(true);
    setScriptModal(false);
    setVideoInvokeError(null);
    setVideoJobId(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: { script, videoType: selectedVideoType, companyId: company.id },
      });
      if (error) throw error;
      setVideoJobId(data?.id ?? null);
    } catch (err: any) {
      setVideoInvokeError(
        err?.message?.includes('Failed to send')
          ? 'Edge function not deployed. Deploy generate-video in Supabase Dashboard → Edge Functions.'
          : (err?.message ?? 'Failed to start video generation. Check your Supabase Edge Function deployment.')
      );
    } finally {
      setGeneratingVideo(false);
      setVideoModal(true);
    }
  };

  // ── Social connect ─────────────────────────────────────────────────────────
  const handleSocialConnect = (platformKey: string) => {
    setSocialPlatform(platformKey);
    setSocialInput('');
    setSocialError(null);
    setSocialModal(true);
  };

  const handleSaveSocial = async () => {
    if (!company || !socialPlatform) return;
    const trimmed = socialInput.trim();
    if (!trimmed) {
      setSocialError('Please enter your username or handle.');
      return;
    }
    setSocialSaving(true);
    setSocialError(null);
    const { error } = await supabase.from('social_connections').upsert({
      company_id: company.id,
      platform: socialPlatform,
      handle: trimmed,
      connected: true,
    }, { onConflict: 'company_id,platform' });
    setSocialSaving(false);
    if (error) {
      setSocialError(error.message);
      return;
    }
    setSocialModal(false);
    setSocialInput('');
    setSocialPlatform(null);
    await fetchData();
  };

  // ── Post to Social ─────────────────────────────────────────────────────────
  const openPostSocialModal = async (videoUrl: string, title: string, scriptText: string) => {
    if (!company) return;
    setPostSocialVideo({ url: videoUrl, title, script: scriptText });
    setPostSocialCaption(title);
    setPostSocialTags('#treeservice, #treeremoval, #arborist, #treework, #treetrimming, #treecare');
    setPostSocialResults([]);
    setPostSocialPosting(false);

    // Check which platforms are connected
    let tiktok = false, youtube = false, facebook = false;
    try {
      [tiktok, youtube, facebook] = await Promise.all([
        isTikTokConnected(company.id).catch(() => false),
        isYouTubeConnected(company.id).catch(() => false),
        isFacebookConnected(company.id).catch(() => false),
      ]);
    } catch {
      // If all checks fail, all platforms show as disconnected
    }
    setPostSocialConnected({ tiktok, youtube, facebook });
    setPostSocialPlatforms({ tiktok, youtube, facebook: false });
    setPostSocialModal(true);
  };

  const handlePostToSocial = async () => {
    if (!company || !postSocialVideo) return;
    setPostSocialPosting(true);
    setPostSocialResults([]);

    const results: { platform: string; success: boolean; message: string }[] = [];
    const hashtags = postSocialTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (postSocialPlatforms.tiktok) {
      try {
        const res = await postToTikTok(company.id, {
          videoUrl: postSocialVideo.url,
          caption: postSocialCaption,
          hashtags,
        });
        results.push({
          platform: 'TikTok',
          success: res.success,
          message: res.success ? 'Posted successfully' : (res.error ?? 'Failed to post'),
        });
      } catch (err: any) {
        results.push({ platform: 'TikTok', success: false, message: err.message || 'Failed to post' });
      }
    }

    if (postSocialPlatforms.youtube) {
      try {
        const res = await uploadYouTubeShort(company.id, {
          videoUrl: postSocialVideo.url,
          title: postSocialCaption,
          description: `${postSocialCaption}\n\n${hashtags.join(' ')}`,
          tags: hashtags.map(h => h.replace(/^#/, '')),
          isShort: true,
        });
        results.push({
          platform: 'YouTube Shorts',
          success: res.success,
          message: res.success ? 'Uploaded successfully' : (res.error ?? 'Failed to upload'),
        });
      } catch (err: any) {
        results.push({ platform: 'YouTube Shorts', success: false, message: err.message || 'Failed to upload' });
      }
    }

    if (postSocialPlatforms.facebook) {
      results.push({
        platform: 'Facebook/Instagram',
        success: false,
        message: 'Coming soon — requires Meta app review. Connect on Settings page to be notified.',
      });
    }

    setPostSocialResults(results);
    setPostSocialPosting(false);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const postTitle = (p: ContentPost) =>
    p.video_type
      ? p.video_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Content Post';

  const upcomingPosts = posts.filter(p => p.status === 'scheduled');
  const draftPosts    = posts.filter(p => p.status === 'draft');

  const selectedVideoTypeLabel =
    VIDEO_TYPES.find(v => v.key === selectedVideoType)?.label ?? 'Script';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={D.green} />}
    >
      {/* ── Page header ── */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Content Studio</Text>
        <Text style={s.pageSubtitle}>Create viral videos for your tree service</Text>
      </View>

      {/* ── Scheduled posts ── */}
      <Text style={s.sectionTitle}>SCHEDULED POSTS</Text>
      {loading ? (
        <ActivityIndicator color={D.green} style={{ marginVertical: 20 }} />
      ) : upcomingPosts.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyIcon}>📅</Text>
          <Text style={s.emptyTitle}>No posts scheduled</Text>
          <Text style={s.emptyDesc}>
            Use the Viral Script Studio below to create content, then schedule it.
          </Text>
        </View>
      ) : (
        <View style={s.card}>
          {upcomingPosts.map((post, i) => (
            <View key={post.id} style={[s.postRow, i < upcomingPosts.length - 1 && s.postBorder]}>
              <View style={s.postInfo}>
                <Text style={s.postTitle}>{postTitle(post)}</Text>
                <View style={s.postMeta}>
                  <Badge label={(post.video_type ?? 'post').replace(/_/g, ' ')} variant="neutral" />
                  <Text style={s.postDate}>
                    {post.scheduled_at
                      ? new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Unscheduled'}
                  </Text>
                </View>
              </View>
              <Text style={s.postPlatformEmoji}>
                {SOCIAL_PLATFORMS.find(p => p.key === post.platform)?.emoji ?? '📱'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Drafts ── */}
      {draftPosts.length > 0 && (
        <>
          <Text style={s.sectionTitle}>DRAFTS</Text>
          <View style={s.card}>
            {draftPosts.map((post, i) => (
              <View key={post.id} style={[s.postRow, i < draftPosts.length - 1 && s.postBorder]}>
                <View style={s.postInfo}>
                  <Text style={s.postTitle}>{postTitle(post)}</Text>
                  <Badge label="draft" variant="warning" />
                </View>
                <Text style={s.postPlatformEmoji}>
                  {SOCIAL_PLATFORMS.find(p => p.key === post.platform)?.emoji ?? '📱'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Viral Script Studio ── */}
      <Text style={s.sectionTitle}>VIRAL SCRIPT STUDIO</Text>
      <View style={s.studioHeader}>
        <View style={s.aiPill}>
          <Text style={s.aiPillText}>✦ AI-Powered</Text>
        </View>
        <Text style={s.studioSubtitle}>
          Tap a video type to generate a 30–60 sec script. Higher 🔥 = more viral potential.
        </Text>
      </View>

      <View style={s.videoTypeGrid}>
        {VIDEO_TYPES.map(vt => (
          <TouchableOpacity
            key={vt.key}
            style={s.videoTypeCard}
            onPress={() => generateScript(vt.key)}
            activeOpacity={0.75}
          >
            <Text style={s.videoTypeEmoji}>{vt.emoji}</Text>
            <Text style={s.videoTypeLabel}>{vt.label}</Text>
            <ViralScoreBadge score={vt.viralScore} />
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Platforms ── */}
      <Text style={s.sectionTitle}>PLATFORMS</Text>
      <View style={s.platformsWrap}>
        {SOCIAL_PLATFORMS.map(platform => {
          const conn = connections.find(c => c.platform === platform.key);
          return (
            <View
              key={platform.key}
              style={[s.platformCard, { backgroundColor: platform.cardBg, borderColor: platform.cardBorder }]}
            >
              <View style={s.platformCardLeft}>
                <Text style={[s.platformEmoji, { color: platform.textColor }]}>{platform.emoji}</Text>
                <View style={s.platformTextGroup}>
                  <Text style={[s.platformName, { color: platform.textColor }]}>{platform.label}</Text>
                  <Text style={s.platformTagline}>{platform.tagline}</Text>
                  {conn?.handle && (
                    <Text style={[s.platformHandle, { color: platform.textColor + 'BB' }]}>
                      @{conn.handle}
                    </Text>
                  )}
                </View>
              </View>
              <View>
                {conn?.connected ? (
                  <View style={[s.connectedPill, { borderColor: platform.textColor + '60', backgroundColor: platform.textColor + '18' }]}>
                    <Text style={[s.connectedText, { color: platform.textColor }]}>● Connected</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.connectBtn}
                    onPress={() => handleSocialConnect(platform.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Collapsible calendar (bottom) ── */}
      <CollapsibleCalendar posts={upcomingPosts} />

      {/* ── Script modal ── */}
      <Modal
        visible={scriptModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setScriptModal(false)}
      >
        <View style={sm.container}>
          <View style={sm.header}>
            <TouchableOpacity onPress={() => setScriptModal(false)}>
              <Text style={sm.closeTxt}>Done</Text>
            </TouchableOpacity>
            <Text style={sm.headerTitle}>{selectedVideoTypeLabel}</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={sm.scroll} contentContainerStyle={sm.scrollContent}>
            {generatingScript ? (
              <View style={sm.loadingWrap}>
                <ActivityIndicator color={D.purple} size="large" />
                <Text style={sm.loadingTitle}>Writing your script...</Text>
                <Text style={sm.loadingSubtitle}>Claude is crafting something viral</Text>
              </View>
            ) : script ? (
              <>
                <View style={sm.aiBadge}>
                  <Text style={sm.aiBadgeText}>✦ AI-generated script</Text>
                </View>

                {selectedVideoType && (() => {
                  const vt = VIDEO_TYPES.find(v => v.key === selectedVideoType);
                  return vt ? (
                    <View style={sm.scoreRow}>
                      <Text style={sm.scoreLabel}>Viral score</Text>
                      <ViralScoreBadge score={vt.viralScore} />
                    </View>
                  ) : null;
                })()}

                <View style={sm.scriptBox}>
                  <Text style={sm.scriptText}>{script}</Text>
                </View>

                <View style={sm.actionRow}>
                  <Button
                    label="Regenerate"
                    variant="secondary"
                    size="sm"
                    onPress={() => selectedVideoType && generateScript(selectedVideoType)}
                    style={sm.regenBtn}
                  />
                </View>

                <View style={sm.makeVideoSection}>
                  <Text style={sm.makeVideoLabel}>MAKE THIS VIDEO</Text>

                  {/* Film yourself option */}
                  <TouchableOpacity
                    style={sm.filmBtn}
                    onPress={() => {
                      setScriptModal(false);
                      setTeleprompterModal(true);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={sm.filmBtnLeft}>
                      <Text style={sm.filmBtnIcon}>📱</Text>
                      <View>
                        <Text style={sm.filmBtnTitle}>Film It Yourself</Text>
                        <Text style={sm.filmBtnSubtitle}>Teleprompter + filming guide</Text>
                      </View>
                    </View>
                    <Text style={sm.filmBtnArrow}>›</Text>
                  </TouchableOpacity>

                  {/* AI generate option */}
                  <TouchableOpacity
                    style={[sm.aiVideoBtn, generatingVideo && { opacity: 0.6 }]}
                    onPress={generateVideo}
                    disabled={generatingVideo}
                    activeOpacity={0.85}
                  >
                    <View style={sm.filmBtnLeft}>
                      {generatingVideo ? (
                        <ActivityIndicator color="#FFFFFF" style={{ width: 28 }} />
                      ) : (
                        <Text style={sm.filmBtnIcon}>🎬</Text>
                      )}
                      <View>
                        <Text style={[sm.filmBtnTitle, { color: '#FFFFFF' }]}>
                          {generatingVideo ? 'Starting…' : 'Auto-Generate AI Video'}
                        </Text>
                        <Text style={[sm.filmBtnSubtitle, { color: 'rgba(255,255,255,0.6)' }]}>
                          ElevenLabs · Pexels · Creatomate
                        </Text>
                      </View>
                    </View>
                    {!generatingVideo && <Text style={[sm.filmBtnArrow, { color: '#FFFFFF' }]}>›</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Teleprompter modal ── */}
      {script && (
        <TeleprompterModal
          visible={teleprompterModal}
          script={script}
          videoTypeLabel={selectedVideoTypeLabel}
          onClose={() => setTeleprompterModal(false)}
        />
      )}

      {/* ── AI Video Generate modal ── */}
      <VideoGenerateModal
        visible={videoModal}
        videoId={videoJobId}
        invokeError={videoInvokeError}
        onClose={() => { setVideoModal(false); setVideoJobId(null); setVideoInvokeError(null); }}
        onPostToSocial={(videoUrl) => {
          openPostSocialModal(
            videoUrl,
            selectedVideoTypeLabel,
            script ?? '',
          );
        }}
      />
    </ScrollView>

    {/* ── Social Connect Modal ── */}
    <Modal
      visible={socialModal}
      transparent
      animationType="slide"
      onRequestClose={() => setSocialModal(false)}
    >
      <KeyboardAvoidingView
        style={s.socialModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.socialModalSheet}>
          <View style={s.socialModalHandle} />
          <Text style={s.socialModalTitle}>
            {socialPlatform === 'tiktok' && 'Connect TikTok'}
            {socialPlatform === 'instagram' && 'Connect Instagram'}
            {socialPlatform === 'youtube' && 'Connect YouTube'}
          </Text>
          <Input
            label={
              socialPlatform === 'youtube'
                ? 'YouTube channel URL or handle'
                : socialPlatform === 'instagram'
                ? 'Instagram handle'
                : 'TikTok username'
            }
            placeholder={
              socialPlatform === 'youtube'
                ? 'youtube.com/@limbwalkertrees'
                : '@limbwalkertrees'
            }
            value={socialInput}
            onChangeText={setSocialInput}
            autoCapitalize="none"
            autoCorrect={false}
            error={socialError ?? undefined}
          />
          <TouchableOpacity
            style={[s.socialSaveBtn, socialSaving && { opacity: 0.7 }]}
            onPress={handleSaveSocial}
            activeOpacity={0.85}
            disabled={socialSaving}
          >
            <Text style={s.socialSaveBtnText}>{socialSaving ? 'Saving…' : 'Save & Connect'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.socialCancelBtn}
            onPress={() => { setSocialModal(false); setSocialInput(''); setSocialError(null); }}
            activeOpacity={0.7}
          >
            <Text style={s.socialCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* ── Post to Social Modal ── */}
    <Modal
      visible={postSocialModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setPostSocialModal(false)}
    >
      <View style={ps.container}>
        <View style={ps.header}>
          <TouchableOpacity onPress={() => setPostSocialModal(false)}>
            <Text style={ps.closeTxt}>Cancel</Text>
          </TouchableOpacity>
          <Text style={ps.headerTitle}>Post to Social</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={ps.scroll} contentContainerStyle={ps.scrollContent}>
          {/* Platform toggles */}
          <Text style={ps.sectionLabel}>PLATFORMS</Text>

          <TouchableOpacity
            style={[ps.platformRow, !postSocialConnected.tiktok && ps.platformRowDisabled]}
            onPress={() => postSocialConnected.tiktok && setPostSocialPlatforms(p => ({ ...p, tiktok: !p.tiktok }))}
            activeOpacity={postSocialConnected.tiktok ? 0.7 : 1}
          >
            <View style={[ps.checkbox, postSocialPlatforms.tiktok && ps.checkboxChecked]}>
              {postSocialPlatforms.tiktok && <Text style={ps.checkmark}>✓</Text>}
            </View>
            <Text style={ps.platformIcon}>♪</Text>
            <View style={{ flex: 1 }}>
              <Text style={ps.platformName}>TikTok</Text>
              {!postSocialConnected.tiktok && <Text style={ps.notConnected}>Not connected</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ps.platformRow, !postSocialConnected.youtube && ps.platformRowDisabled]}
            onPress={() => postSocialConnected.youtube && setPostSocialPlatforms(p => ({ ...p, youtube: !p.youtube }))}
            activeOpacity={postSocialConnected.youtube ? 0.7 : 1}
          >
            <View style={[ps.checkbox, postSocialPlatforms.youtube && ps.checkboxChecked]}>
              {postSocialPlatforms.youtube && <Text style={ps.checkmark}>✓</Text>}
            </View>
            <Text style={ps.platformIcon}>▶</Text>
            <View style={{ flex: 1 }}>
              <Text style={ps.platformName}>YouTube Shorts</Text>
              {!postSocialConnected.youtube && <Text style={ps.notConnected}>Not connected</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ps.platformRow, ps.platformRowDisabled]}
            onPress={() => {
              if (postSocialConnected.facebook) {
                setPostSocialPlatforms(p => ({ ...p, facebook: !p.facebook }));
              }
            }}
            activeOpacity={postSocialConnected.facebook ? 0.7 : 1}
          >
            <View style={[ps.checkbox, postSocialPlatforms.facebook && ps.checkboxChecked]}>
              {postSocialPlatforms.facebook && <Text style={ps.checkmark}>✓</Text>}
            </View>
            <Text style={ps.platformIcon}>◈</Text>
            <View style={{ flex: 1 }}>
              <Text style={ps.platformName}>Facebook / Instagram</Text>
              <Text style={ps.notConnected}>Coming soon — requires Meta app review</Text>
            </View>
          </TouchableOpacity>

          {/* Caption field */}
          <Text style={ps.sectionLabel}>CAPTION</Text>
          <Input
            label=""
            placeholder="Write a caption..."
            value={postSocialCaption}
            onChangeText={setPostSocialCaption}
            multiline
            numberOfLines={3}
          />

          {/* Hashtags field */}
          <Text style={ps.sectionLabel}>HASHTAGS</Text>
          <Input
            label=""
            placeholder="#treeservice, #arborist, ..."
            value={postSocialTags}
            onChangeText={setPostSocialTags}
            autoCapitalize="none"
          />

          {/* Post button */}
          <TouchableOpacity
            style={[
              ps.postBtn,
              (postSocialPosting || (!postSocialPlatforms.tiktok && !postSocialPlatforms.youtube && !postSocialPlatforms.facebook)) && { opacity: 0.5 },
            ]}
            onPress={handlePostToSocial}
            disabled={postSocialPosting || (!postSocialPlatforms.tiktok && !postSocialPlatforms.youtube && !postSocialPlatforms.facebook)}
            activeOpacity={0.85}
          >
            {postSocialPosting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={ps.postBtnText}>Post Now</Text>
            )}
          </TouchableOpacity>

          {/* Results */}
          {postSocialResults.length > 0 && (
            <View style={ps.resultsCard}>
              <Text style={ps.resultsTitle}>Results</Text>
              {postSocialResults.map((r, i) => (
                <View key={i} style={ps.resultRow}>
                  <Text style={[ps.resultIcon, { color: r.success ? '#22C55E' : '#F87171' }]}>
                    {r.success ? '✓' : '✕'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={ps.resultPlatform}>{r.platform}</Text>
                    <Text style={ps.resultMessage}>{r.message}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

// ─── Main styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },
  content:   { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 48, paddingTop: 56 },

  pageHeader:   { gap: 4, marginBottom: 4 },
  pageTitle:    { fontSize: Theme.font.size.display, fontWeight: Theme.font.weight.heavy, color: D.text },
  pageSubtitle: { fontSize: Theme.font.size.small, color: D.textSec },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: D.gold,
    letterSpacing: 1.5,
    marginBottom: -4,
  },

  card:            { backgroundColor: D.surface, borderRadius: Theme.radius.xl, borderWidth: 1, borderColor: D.border, overflow: 'hidden' },
  postRow:         { flexDirection: 'row', alignItems: 'center', padding: Theme.space.lg, gap: Theme.space.md },
  postBorder:      { borderBottomWidth: 1, borderBottomColor: D.border },
  postInfo:        { flex: 1, gap: 6 },
  postTitle:       { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.medium, color: D.text },
  postMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postDate:        { fontSize: Theme.font.size.small, color: D.textSec },
  postPlatformEmoji: { fontSize: 22 },

  emptyCard:  { backgroundColor: D.surface, borderRadius: Theme.radius.xl, borderWidth: 1, borderColor: D.border, alignItems: 'center', padding: Theme.space.xxxl, gap: Theme.space.sm },
  emptyIcon:  { fontSize: 36 },
  emptyTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  emptyDesc:  { fontSize: Theme.font.size.small, color: D.textSec, textAlign: 'center', lineHeight: 20 },

  studioHeader:   { gap: 8, marginBottom: -4 },
  aiPill:         { backgroundColor: D.purple + '25', borderRadius: Theme.radius.full, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: D.purple + '50' },
  aiPillText:     { fontSize: 11, fontWeight: '700' as const, color: D.purple, letterSpacing: 0.5 },
  studioSubtitle: { fontSize: Theme.font.size.small, color: D.textSec, lineHeight: 20 },

  videoTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.space.md },
  videoTypeCard: {
    width: '47.5%',
    backgroundColor: D.surfaceAlt,
    borderRadius: Theme.radius.xl,
    borderWidth: 1,
    borderColor: D.border,
    padding: Theme.space.lg,
    gap: Theme.space.sm,
    minHeight: 110,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  videoTypeEmoji: { fontSize: 30 },
  videoTypeLabel: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: D.text, lineHeight: 18 },

  platformsWrap:    { gap: Theme.space.md },
  platformCard:     { borderRadius: Theme.radius.xl, borderWidth: 1.5, padding: Theme.space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  platformCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.md, flex: 1 },
  platformTextGroup:{ flex: 1 },
  platformEmoji:    { fontSize: 28, fontWeight: '900' as const },
  platformName:     { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold },
  platformTagline:  { fontSize: Theme.font.size.caption, color: '#666666', marginTop: 2 },
  platformHandle:   { fontSize: Theme.font.size.small, marginTop: 2 },
  connectedPill:    { borderWidth: 1, borderRadius: Theme.radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  connectedText:    { fontSize: 12, fontWeight: '700' as const },
  connectBtn:       { borderWidth: 1.5, borderColor: '#333333', borderRadius: Theme.radius.lg, paddingHorizontal: 16, paddingVertical: 8 },
  connectBtnText:   { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: '#FFFFFF' },
  // Social connect modal
  socialModalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  socialModalSheet:    { backgroundColor: '#142B1F', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, paddingBottom: 44 },
  socialModalHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: D.border, alignSelf: 'center', marginBottom: 8 },
  socialModalTitle:    { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: D.text },
  socialSaveBtn:       { backgroundColor: '#22C55E', borderRadius: Theme.radius.lg, paddingVertical: 16, alignItems: 'center' },
  socialSaveBtnText:   { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
  socialCancelBtn:     { paddingVertical: 10, alignItems: 'center' },
  socialCancelBtnText: { fontSize: Theme.font.size.body, color: D.textSec },
});

// ─── Script modal styles ──────────────────────────────────────────────────────
const sm = StyleSheet.create({
  container:     { flex: 1, backgroundColor: D.bg },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.surface },
  closeTxt:      { fontSize: Theme.font.size.body, color: D.green, fontWeight: Theme.font.weight.semibold },
  headerTitle:   { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  scroll:        { flex: 1 },
  scrollContent: { padding: Theme.layout.screenPadding, paddingBottom: 48, gap: Theme.space.lg },

  loadingWrap:     { alignItems: 'center', gap: Theme.space.lg, paddingTop: 72 },
  loadingTitle:    { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  loadingSubtitle: { fontSize: Theme.font.size.small, color: D.textSec },

  aiBadge:     { backgroundColor: D.purple + '25', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Theme.radius.full, alignSelf: 'flex-start', borderWidth: 1, borderColor: D.purple + '50' },
  aiBadgeText: { fontSize: Theme.font.size.caption, color: D.purple, fontWeight: Theme.font.weight.semibold },

  scoreRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreLabel: { fontSize: Theme.font.size.small, color: D.textSec },

  scriptBox:  { backgroundColor: D.surface, borderRadius: Theme.radius.xl, padding: Theme.space.xl, borderWidth: 1, borderColor: D.border },
  scriptText: { fontSize: Theme.font.size.body, color: D.text, lineHeight: 26 },

  actionRow:           { flexDirection: 'row', gap: Theme.space.md, flexWrap: 'wrap' },
  regenBtn:            { alignSelf: 'flex-start' },

  makeVideoSection:    { gap: Theme.space.sm },
  makeVideoLabel:      { fontSize: 10, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5 },

  filmBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: D.surfaceAlt, borderRadius: Theme.radius.lg, padding: Theme.space.lg, borderWidth: 1, borderColor: D.border },
  filmBtnLeft:         { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  filmBtnIcon:         { fontSize: 26 },
  filmBtnTitle:        { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: D.text },
  filmBtnSubtitle:     { fontSize: Theme.font.size.caption, color: D.textSec, marginTop: 2 },
  filmBtnArrow:        { fontSize: 22, color: D.textSec, fontWeight: '300' as const },

  aiVideoBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: D.green, borderRadius: Theme.radius.lg, padding: Theme.space.lg },
});

// ─── Post to Social modal styles ─────────────────────────────────────────────
const ps = StyleSheet.create({
  container:          { flex: 1, backgroundColor: D.bg },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.surface },
  closeTxt:           { fontSize: Theme.font.size.body, color: D.green, fontWeight: Theme.font.weight.semibold },
  headerTitle:        { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  scroll:             { flex: 1 },
  scrollContent:      { padding: Theme.layout.screenPadding, paddingBottom: 48, gap: Theme.space.md },
  sectionLabel:       { fontSize: 11, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5, marginTop: Theme.space.md },

  platformRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.surface, borderRadius: Theme.radius.lg, padding: Theme.space.lg, borderWidth: 1, borderColor: D.border },
  platformRowDisabled:{ opacity: 0.5 },
  checkbox:           { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: D.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:    { backgroundColor: '#22C55E', borderColor: '#22C55E' },
  checkmark:          { fontSize: 14, color: '#FFFFFF', fontWeight: '700' as const },
  platformIcon:       { fontSize: 22, width: 28, textAlign: 'center' },
  platformName:       { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: D.text },
  notConnected:       { fontSize: Theme.font.size.caption, color: '#6B7280', marginTop: 2 },

  postBtn:            { backgroundColor: '#22C55E', borderRadius: Theme.radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: Theme.space.md },
  postBtnText:        { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },

  resultsCard:        { backgroundColor: D.surface, borderRadius: Theme.radius.lg, padding: Theme.space.lg, borderWidth: 1, borderColor: D.border, gap: 12 },
  resultsTitle:       { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: D.text },
  resultRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  resultIcon:         { fontSize: 18, fontWeight: '700' as const, marginTop: 1 },
  resultPlatform:     { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: D.text },
  resultMessage:      { fontSize: Theme.font.size.small, color: D.textSec, marginTop: 2 },
});
