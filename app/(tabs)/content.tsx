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
import { generateVideoScript, isAIConfigured } from '@/lib/ai';
import { VideoComposition, createComposition, getTotalDuration, formatDuration } from '@/lib/video/types';
import { composeFromScript, applyTemplate } from '@/lib/video/composer';
import { VIDEO_TEMPLATES, BACKGROUND_MUSIC, AMBIENT_SOUNDS } from '@/lib/video/templates';
import { SceneTimeline } from '@/components/video/SceneTimeline';
import { SceneEditor } from '@/components/video/SceneEditor';
import { StepProgress } from '@/components/video/StepProgress';
import { Toast } from '@/components/ui/Toast';
import { GuidanceCard } from '@/components/ui/HelpTip';

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
interface VideoTypeItem {
  key: string;
  emoji: string;
  label: string;
  desc: string;
  viralScore: number;
}
interface VideoCategory {
  label: string;
  types: VideoTypeItem[];
}

const VIDEO_CATEGORIES: VideoCategory[] = [
  {
    label: 'SHOWCASE YOUR WORK',
    types: [
      { key: 'satisfying_removal', emoji: '🌳', label: 'Satisfying Removal', desc: 'Watch a massive tree come down safely', viralScore: 9.4 },
      { key: 'before_after',       emoji: '✨', label: 'Before & After',     desc: 'Dramatic property transformations', viralScore: 8.8 },
      { key: 'crane_job',          emoji: '🏗', label: 'Crane Job',          desc: 'Heavy equipment, high stakes', viralScore: 9.2 },
      { key: 'stump_grinding',     emoji: '💨', label: 'Stump Grinding',     desc: 'Oddly satisfying disappearing act', viralScore: 8.5 },
    ],
  },
  {
    label: 'EDUCATE & BUILD TRUST',
    types: [
      { key: 'did_you_know',       emoji: '🧠', label: 'Did You Know',       desc: 'Surprising tree facts that hook viewers', viralScore: 7.9 },
      { key: 'price_transparency', emoji: '💰', label: 'Price Breakdown',    desc: 'Show what tree work really costs', viralScore: 9.1 },
      { key: 'tree_health_tip',    emoji: '🩺', label: 'Tree Health Tip',    desc: 'Signs your tree needs attention', viralScore: 7.6 },
    ],
  },
  {
    label: 'BEHIND THE SCENES',
    types: [
      { key: 'day_in_life',        emoji: '📸', label: 'Day in the Life',    desc: 'Raw look at the daily grind', viralScore: 8.2 },
      { key: 'crew_spotlight',     emoji: '👷', label: 'Crew Spotlight',     desc: 'Introduce your team', viralScore: 7.8 },
      { key: 'equipment_tour',     emoji: '🔧', label: 'Equipment Tour',     desc: 'Show off your trucks and tools', viralScore: 7.5 },
    ],
  },
  {
    label: 'URGENCY & SEASONAL',
    types: [
      { key: 'storm_damage',       emoji: '⚡', label: 'Storm Damage',       desc: 'Emergency response content', viralScore: 9.6 },
      { key: 'seasonal_reminder',  emoji: '🍂', label: 'Seasonal Reminder',  desc: 'Timely tips that drive calls', viralScore: 8.0 },
    ],
  },
];

// Flat list for backward-compat lookups
const VIDEO_TYPES = VIDEO_CATEGORIES.flatMap(c => c.types);

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

const RENDER_STEPS = [
  { key: 'voice',   label: 'Generating voiceover audio' },
  { key: 'footage', label: 'Finding matching footage' },
  { key: 'render',  label: 'Rendering video' },
  { key: 'upload',  label: 'Uploading final video' },
  { key: 'done',    label: 'Complete' },
];

function mapProgressToSteps(progressStep: string | null, percent: number, status: string) {
  const stepMap: Record<string, number> = {
    'Generating voiceover audio...': 0,
    'Finding matching footage...': 1,
    'Rendering video...': 2,
    'Uploading final video...': 3,
  };

  const activeIdx = progressStep ? (stepMap[progressStep] ?? -1) : -1;

  return RENDER_STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    status: (status === 'ready' || status === 'failed')
      ? (status === 'failed' && i >= activeIdx && activeIdx >= 0 ? 'error' as const : 'done' as const)
      : i < activeIdx ? 'done' as const
      : i === activeIdx ? 'active' as const
      : 'pending' as const,
    detail: i === activeIdx && progressStep ? progressStep : undefined,
  }));
}

function VideoGenerateModal({ visible, videoId, invokeError, onClose, onPostToSocial }: VideoGenerateProps) {
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    if (!visible || !videoId) {
      setVideo(null);
      setProgressStep(null);
      setProgressPercent(0);
      return;
    }

    // Poll DB for real progress updates from the edge function
    const pollStatus = async () => {
      const { data } = await supabase
        .from('generated_videos')
        .select('*')
        .eq('id', videoId)
        .single();
      if (!data) return;

      // Update progress from DB
      if (data.progress_step) setProgressStep(data.progress_step);
      if (data.progress_percent) setProgressPercent(data.progress_percent);

      if (data.status === 'ready' || data.status === 'failed') {
        setVideo(data as GeneratedVideo);
        setProgressPercent(data.status === 'ready' ? 100 : progressPercent);
      }
    };
    pollStatus();
    const pollInterval = setInterval(pollStatus, 3000);

    // 5-minute timeout
    const timeout = setTimeout(() => {
      setVideo(prev => {
        if (prev && (prev.status === 'ready' || prev.status === 'failed')) return prev;
        return { id: videoId, status: 'failed', error_message: 'Video generation timed out. The render server may be warming up — please try again.' } as GeneratedVideo;
      });
    }, 300000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
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
              <Text style={vg.processingTitle}>Creating your video</Text>
              <Text style={vg.processingSubtitle}>
                {progressStep || 'Starting up...'}
              </Text>

              <View style={{ width: '100%', marginTop: 16 }}>
                <StepProgress
                  steps={mapProgressToSteps(progressStep, progressPercent, 'processing')}
                  accentColor={D.green}
                />
              </View>

              <View style={vg.tipCard}>
                <Text style={vg.tipTitle}>While you wait...</Text>
                <Text style={vg.tipText}>
                  Your video is 9:16 portrait — ready to post directly to TikTok, Instagram Reels, and YouTube Shorts.
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
  const [script,            setScript]            = useState<string | null>(null);       // clean spoken-only text for TTS
  const [scriptDisplay,     setScriptDisplay]     = useState<{ hook: string; body: string; hashtags: string[]; caption: string } | null>(null);
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
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  // Composition editor state
  const [composition, setComposition] = useState<VideoComposition | null>(null);
  const [compositionModal, setCompositionModal] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [buildingComposition, setBuildingComposition] = useState(false);

  // Customization state (pre-generation options)
  const [customizeModal,    setCustomizeModal]    = useState(false);
  const [scriptTone,        setScriptTone]        = useState<'casual' | 'professional' | 'hype' | 'funny'>('casual');
  const [scriptPlatform,    setScriptPlatform]    = useState<'tiktok' | 'youtube_shorts' | 'instagram_reels'>('tiktok');
  const [scriptDuration,    setScriptDuration]    = useState<'short' | 'medium' | 'long'>('medium');
  const [scriptContext,     setScriptContext]      = useState('');
  // Render style options
  const [captionStyle,      setCaptionStyle]      = useState<'bold' | 'minimal' | 'subtitle'>('bold');
  const [videoPacing,       setVideoPacing]       = useState<'fast' | 'medium' | 'slow'>('medium');
  // Footage options
  const [footageSource,     setFootageSource]     = useState<'stock' | 'upload'>('stock');
  const [uploadedClips,     setUploadedClips]     = useState<{ name: string; uri: string }[]>([]);
  const [uploadingClips,    setUploadingClips]    = useState(false);

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

  // ── Script generation (uses lib/ai.ts with type-specific prompts) ─────────
  const generateScript = async (videoType: string) => {
    if (!isAIConfigured() || !company) {
      setScript('Connect your OpenRouter API key in settings to generate AI scripts.');
      setScriptDisplay(null);
      setScriptModal(true);
      return;
    }

    setSelectedVideoType(videoType);
    setGeneratingScript(true);
    setScriptModal(true);
    setScript(null);
    setScriptDisplay(null);

    try {
      const result = await generateVideoScript(
        {
          name: company.name,
          city: company.city,
          state: company.state,
          services: company.services_offered,
        },
        videoType,
        {
          tone: scriptTone,
          platform: scriptPlatform,
          duration: scriptDuration,
          customContext: scriptContext || undefined,
        },
      );
      // Store the clean spoken-only script for TTS (this is what gets sent to the edge function)
      setScript(result.script);
      // Store structured display data for the UI
      setScriptDisplay({
        hook: result.hook,
        body: result.script,
        hashtags: result.hashtags,
        caption: result.caption,
      });
    } catch {
      Toast.error('Script generation failed. Check your internet connection and AI key in Settings.');
      setScript(null);
      setScriptDisplay(null);
    } finally {
      setGeneratingScript(false);
    }
  };

  // ── Build composition from script + stock footage ──────────────────────────
  const buildComposition = async () => {
    if (!company || !script || !scriptDisplay) return;
    setBuildingComposition(true);
    try {
      // Fetch Pexels footage for each shot in the shotList
      const shotList = scriptDisplay.hashtags.length > 0
        ? scriptDisplay.hashtags.map(t => t.replace('#', ''))
        : ['tree service', 'arborist', 'outdoor work'];

      // Search Pexels for relevant clips
      const clips: { url: string; thumbnail: string | null; duration: number }[] = [];
      const pexelsKey = ''; // Will be fetched from edge function, but for preview we use direct search
      // For now, create composition with empty clips — edge function fills them in during render
      const comp = composeFromScript(
        {
          hook: scriptDisplay.hook,
          script: scriptDisplay.body,
          shotList: shotList,
          hashtags: scriptDisplay.hashtags,
          caption: scriptDisplay.caption,
        },
        clips,
        company.name,
      );
      setComposition(comp);
      setCompositionModal(true);
      setScriptModal(false);
    } catch (err) {
      console.error('Failed to build composition:', err);
    } finally {
      setBuildingComposition(false);
    }
  };

  // ── Upload video clips ─────────────────────────────────────────────────────
  const handleUploadClips = async () => {
    if (Platform.OS !== 'web') return;
    // Create file input for web
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/webm';
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) return;
      setUploadingClips(true);
      const newClips: { name: string; uri: string }[] = [];
      for (let i = 0; i < Math.min(files.length, 4); i++) {
        const file = files[i];
        if (file.size > 50 * 1024 * 1024) continue; // skip files > 50MB
        newClips.push({ name: file.name, uri: URL.createObjectURL(file) });
      }
      setUploadedClips(prev => [...prev, ...newClips].slice(0, 4));
      setUploadingClips(false);
    };
    input.click();
  };

  // ── AI video generation ────────────────────────────────────────────────────
  const generateVideo = async () => {
    if (!company || !script || !selectedVideoType) return;
    setGeneratingVideo(true);
    setScriptModal(false);
    setCompositionModal(false);
    setVideoInvokeError(null);
    setVideoJobId(null);

    try {
      // Build composition if we don't have one yet (auto-generate path)
      const comp = composition ?? (scriptDisplay ? composeFromScript(
        {
          hook: scriptDisplay.hook,
          script: scriptDisplay.body,
          shotList: scriptDisplay.hashtags.map(t => t.replace('#', '')),
          hashtags: scriptDisplay.hashtags,
          caption: scriptDisplay.caption,
        },
        [],
        company.name,
      ) : null);

      // Upload user clips if needed
      let clipPrefix: string | null = null;
      if (footageSource === 'upload' && uploadedClips.length > 0) {
      // If user has uploaded clips, upload them to a temp staging path first
      // so the edge function can find them when it runs processVideo()
      let clipPrefix: string | null = null;
      if (footageSource === 'upload' && uploadedClips.length > 0) {
        // Use a temporary ID for staging — will be moved by the edge function
        clipPrefix = `staging-${Date.now()}`;
        await supabase.storage.createBucket('generated-videos', { public: true }).catch(() => {});
        for (let i = 0; i < uploadedClips.length; i++) {
          const clip = uploadedClips[i];
          try {
            const resp = await fetch(clip.uri);
            const blob = await resp.blob();
            await supabase.storage
              .from('generated-videos')
              .upload(`${clipPrefix}/clips/clip_${i}.mp4`, blob, {
                contentType: 'video/mp4',
                upsert: true,
              });
          } catch (uploadErr) {
            console.error('Clip upload failed:', uploadErr);
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          script,
          videoType: selectedVideoType,
          companyId: company.id,
          captionStyle: comp?.captionStyle ?? captionStyle,
          pacing: videoPacing,
          clipPrefix,
          composition: comp, // Send full composition to edge function
          captionStyle,
          pacing: videoPacing,
          clipPrefix, // Tell edge function where to find uploaded clips
        },
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
    setConnectingPlatform(platformKey);
    setSocialPlatform(platformKey);
    setSocialInput('');
    setSocialError(null);
    setSocialModal(true);
    setConnectingPlatform(null);
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
    // Facebook is disabled until Meta app review is complete
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
          Pick a video type, customize your style, and let AI write a viral script. Higher 🔥 = more viral potential.
        </Text>
      </View>

      <GuidanceCard
        title="How video creation works"
        icon="🎬"
        dark
        steps={[
          'Pick a video type below — each one is designed for tree service content',
          'Choose your tone (casual, pro, funny) and platform (TikTok, YouTube, Reels)',
          'AI writes a script — you can edit it or regenerate',
          'Open the Video Editor to customize scenes, music, and captions — or hit Auto-Generate for a quick video',
        ]}
      />

      {VIDEO_CATEGORIES.map(cat => (
        <View key={cat.label} style={s.categorySection}>
          <Text style={s.categoryLabel}>{cat.label}</Text>
          <View style={s.videoTypeGrid}>
            {cat.types.map(vt => (
              <TouchableOpacity
                key={vt.key}
                style={s.videoTypeCard}
                onPress={() => { setSelectedVideoType(vt.key); setCustomizeModal(true); }}
                activeOpacity={0.75}
              >
                <Text style={s.videoTypeEmoji}>{vt.emoji}</Text>
                <Text style={s.videoTypeLabel}>{vt.label}</Text>
                <Text style={s.videoTypeDesc}>{vt.desc}</Text>
                <ViralScoreBadge score={vt.viralScore} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

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
                    style={[s.connectBtn, connectingPlatform === platform.key && { opacity: 0.6 }]}
                    onPress={() => handleSocialConnect(platform.key)}
                    activeOpacity={0.8}
                    disabled={connectingPlatform === platform.key}
                  >
                    {connectingPlatform === platform.key ? (
                      <ActivityIndicator color={D.text} size="small" />
                    ) : (
                      <Text style={s.connectBtnText}>Connect</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Collapsible calendar (bottom) ── */}
      <CollapsibleCalendar posts={upcomingPosts} />

      {/* ── Customize Modal (pre-generation options) ── */}
      <Modal
        visible={customizeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCustomizeModal(false)}
      >
        <View style={cm.container}>
          <View style={cm.header}>
            <TouchableOpacity onPress={() => setCustomizeModal(false)}>
              <Text style={cm.closeTxt}>Cancel</Text>
            </TouchableOpacity>
            <Text style={cm.headerTitle}>
              {VIDEO_TYPES.find(v => v.key === selectedVideoType)?.emoji}{' '}
              {VIDEO_TYPES.find(v => v.key === selectedVideoType)?.label ?? 'Video'}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={cm.scroll} contentContainerStyle={cm.scrollContent}>
            {/* Tone */}
            <Text style={cm.optionLabel}>TONE</Text>
            <View style={cm.pillRow}>
              {([
                { key: 'casual', label: 'Casual', icon: '💬' },
                { key: 'professional', label: 'Pro', icon: '🎯' },
                { key: 'hype', label: 'Hype', icon: '🔥' },
                { key: 'funny', label: 'Funny', icon: '😂' },
              ] as const).map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[cm.pill, scriptTone === t.key && cm.pillActive]}
                  onPress={() => setScriptTone(t.key)}
                  activeOpacity={0.8}
                >
                  <Text style={cm.pillIcon}>{t.icon}</Text>
                  <Text style={[cm.pillText, scriptTone === t.key && cm.pillTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Platform */}
            <Text style={cm.optionLabel}>PLATFORM</Text>
            <View style={cm.pillRow}>
              {([
                { key: 'tiktok', label: 'TikTok', icon: '♪' },
                { key: 'youtube_shorts', label: 'YT Shorts', icon: '▶' },
                { key: 'instagram_reels', label: 'Reels', icon: '◈' },
              ] as const).map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[cm.pill, scriptPlatform === p.key && cm.pillActive]}
                  onPress={() => setScriptPlatform(p.key)}
                  activeOpacity={0.8}
                >
                  <Text style={cm.pillIcon}>{p.icon}</Text>
                  <Text style={[cm.pillText, scriptPlatform === p.key && cm.pillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Duration */}
            <Text style={cm.optionLabel}>LENGTH</Text>
            <View style={cm.pillRow}>
              {([
                { key: 'short', label: 'Short', sub: '15-30s' },
                { key: 'medium', label: 'Medium', sub: '30-60s' },
                { key: 'long', label: 'Long', sub: '60-90s' },
              ] as const).map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[cm.pill, cm.pillWide, scriptDuration === d.key && cm.pillActive]}
                  onPress={() => setScriptDuration(d.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[cm.pillText, scriptDuration === d.key && cm.pillTextActive]}>{d.label}</Text>
                  <Text style={[cm.pillSub, scriptDuration === d.key && cm.pillSubActive]}>{d.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom context */}
            <Text style={cm.optionLabel}>ADD DETAILS (OPTIONAL)</Text>
            <Input
              placeholder="e.g. We just took down a 60-foot oak next to a pool..."
              value={scriptContext}
              onChangeText={setScriptContext}
              multiline
              numberOfLines={3}
              style={cm.contextInput}
            />

            {/* Generate button */}
            <TouchableOpacity
              style={[cm.generateBtn, generatingScript && { opacity: 0.6 }]}
              onPress={() => {
                setCustomizeModal(false);
                if (selectedVideoType) generateScript(selectedVideoType);
              }}
              activeOpacity={0.85}
              disabled={generatingScript}
            >
              {generatingScript ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={cm.generateBtnText}>Generating…</Text>
                </View>
              ) : (
                <Text style={cm.generateBtnText}>✦ Generate Script</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

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
            ) : (script || scriptDisplay) ? (
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

                {scriptDisplay ? (
                  <>
                    {/* Hook — displayed prominently */}
                    <View style={sm.hookBox}>
                      <Text style={sm.hookLabel}>HOOK</Text>
                      <Text style={sm.hookText}>{scriptDisplay.hook}</Text>
                    </View>

                    {/* Spoken script body */}
                    <View style={sm.scriptBox}>
                      <Text style={sm.scriptBoxLabel}>SCRIPT</Text>
                      <Text style={sm.scriptText}>{scriptDisplay.body}</Text>
                    </View>

                    {/* Hashtags */}
                    {scriptDisplay.hashtags.length > 0 && (
                      <View style={sm.tagsRow}>
                        {scriptDisplay.hashtags.map((tag, i) => (
                          <View key={i} style={sm.tag}>
                            <Text style={sm.tagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Caption */}
                    {scriptDisplay.caption ? (
                      <View style={sm.captionBox}>
                        <Text style={sm.captionLabel}>CAPTION</Text>
                        <Text style={sm.captionText}>{scriptDisplay.caption}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={sm.scriptBox}>
                    <Text style={sm.scriptText}>{script}</Text>
                  </View>
                )}

                <View style={sm.actionRow}>
                  <Button
                    label={generatingScript ? 'Regenerating…' : 'Regenerate'}
                    variant="secondary"
                    size="sm"
                    onPress={() => selectedVideoType && generateScript(selectedVideoType)}
                    style={sm.regenBtn}
                    disabled={generatingScript}
                  />
                  {generatingScript && <ActivityIndicator color={D.purple} size="small" style={{ marginLeft: 8 }} />}
                </View>

                <View style={sm.makeVideoSection}>
                  <Text style={sm.makeVideoLabel}>VIDEO STYLE</Text>

                  {/* Caption style picker */}
                  <View style={sm.styleRow}>
                    <Text style={sm.styleLabel}>Captions</Text>
                    <View style={sm.stylePills}>
                      {([
                        { key: 'bold', label: 'Bold' },
                        { key: 'minimal', label: 'Minimal' },
                        { key: 'subtitle', label: 'Subtitle' },
                      ] as const).map(c => (
                        <TouchableOpacity
                          key={c.key}
                          style={[sm.stylePill, captionStyle === c.key && sm.stylePillActive]}
                          onPress={() => setCaptionStyle(c.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[sm.stylePillText, captionStyle === c.key && sm.stylePillTextActive]}>{c.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Pacing picker */}
                  <View style={sm.styleRow}>
                    <Text style={sm.styleLabel}>Pacing</Text>
                    <View style={sm.stylePills}>
                      {([
                        { key: 'fast', label: 'Fast cuts' },
                        { key: 'medium', label: 'Normal' },
                        { key: 'slow', label: 'Cinematic' },
                      ] as const).map(p => (
                        <TouchableOpacity
                          key={p.key}
                          style={[sm.stylePill, videoPacing === p.key && sm.stylePillActive]}
                          onPress={() => setVideoPacing(p.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[sm.stylePillText, videoPacing === p.key && sm.stylePillTextActive]}>{p.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Footage source */}
                  <Text style={sm.makeVideoLabel}>FOOTAGE</Text>
                  <View style={sm.styleRow}>
                    <Text style={sm.styleLabel}>Source</Text>
                    <View style={sm.stylePills}>
                      {([
                        { key: 'stock', label: 'AI Stock' },
                        { key: 'upload', label: 'My Clips' },
                      ] as const).map(f => (
                        <TouchableOpacity
                          key={f.key}
                          style={[sm.stylePill, footageSource === f.key && sm.stylePillActive]}
                          onPress={() => setFootageSource(f.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[sm.stylePillText, footageSource === f.key && sm.stylePillTextActive]}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {footageSource === 'upload' && (
                    <View style={sm.uploadSection}>
                      {uploadedClips.length > 0 ? (
                        <View style={sm.uploadedList}>
                          {uploadedClips.map((clip, i) => (
                            <View key={i} style={sm.uploadedClip}>
                              <Text style={sm.uploadedClipIcon}>🎥</Text>
                              <Text style={sm.uploadedClipName} numberOfLines={1}>{clip.name}</Text>
                              <TouchableOpacity onPress={() => setUploadedClips(prev => prev.filter((_, j) => j !== i))}>
                                <Text style={sm.uploadedClipRemove}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={[sm.uploadBtn, uploadingClips && { opacity: 0.6 }]}
                        onPress={handleUploadClips}
                        activeOpacity={0.85}
                        disabled={uploadingClips}
                      >
                        {uploadingClips ? (
                          <ActivityIndicator color={D.text} size="small" />
                        ) : (
                          <Text style={sm.uploadBtnIcon}>+</Text>
                        )}
                        <Text style={sm.uploadBtnText}>
                          {uploadingClips ? 'Uploading...' : 'Upload Video Clips'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={sm.uploadHint}>Upload 1-4 of your own clips. MP4, MOV, under 50MB each.</Text>
                    </View>
                  )}

                  <Text style={sm.makeVideoLabel}>MAKE THIS VIDEO</Text>

                  {/* Film yourself option */}
                  <TouchableOpacity
                    style={[sm.filmBtn, generatingVideo && { opacity: 0.5 }]}
                    onPress={() => {
                      setScriptModal(false);
                      setTeleprompterModal(true);
                    }}
                    activeOpacity={0.85}
                    disabled={generatingVideo}
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

                  {/* Edit in Video Editor — builds composition */}
                  <TouchableOpacity
                    style={[sm.filmBtn, { borderColor: D.purple + '60', backgroundColor: D.purple + '10' }, buildingComposition && { opacity: 0.6 }]}
                    onPress={buildComposition}
                    disabled={buildingComposition}
                    activeOpacity={0.85}
                  >
                    <View style={sm.filmBtnLeft}>
                      {buildingComposition ? (
                        <ActivityIndicator color={D.purple} style={{ width: 28 }} />
                      ) : (
                        <Text style={sm.filmBtnIcon}>🎨</Text>
                      )}
                      <View>
                        <Text style={[sm.filmBtnTitle, { color: D.purple }]}>
                          {buildingComposition ? 'Building...' : 'Open Video Editor'}
                        </Text>
                        <Text style={sm.filmBtnSubtitle}>Timeline, scenes, audio, templates</Text>
                      </View>
                    </View>
                    <Text style={[sm.filmBtnArrow, { color: D.purple }]}>›</Text>
                  </TouchableOpacity>

                  {/* AI generate option (quick — no editor) */}
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
                          {generatingVideo ? 'Starting...' : 'Auto-Generate AI Video'}
                        </Text>
                        <Text style={[sm.filmBtnSubtitle, { color: 'rgba(255,255,255,0.6)' }]}>
                          {footageSource === 'upload' && uploadedClips.length > 0
                            ? `Your clips · AI voice · captions`
                            : 'AI stock footage · AI voice · captions'}
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

    {/* ── Composition Editor Modal ── */}
    <Modal
      visible={compositionModal}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setCompositionModal(false)}
    >
      <View style={ce.container}>
        <View style={ce.header}>
          <TouchableOpacity onPress={() => setCompositionModal(false)}>
            <Text style={ce.closeTxt}>Back</Text>
          </TouchableOpacity>
          <Text style={ce.headerTitle}>Video Editor</Text>
          <TouchableOpacity
            onPress={() => {
              setCompositionModal(false);
              if (composition && company && script) {
                generateVideo();
              }
            }}
            style={ce.renderBtn}
          >
            <Text style={ce.renderBtnText}>Render</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={ce.scroll} contentContainerStyle={ce.scrollContent}>
          {composition && (
            <>
              {/* Timeline */}
              <SceneTimeline
                composition={composition}
                selectedSceneId={selectedSceneId}
                onSelectScene={setSelectedSceneId}
                onAddScene={() => {
                  const newScene = { id: `scene_${Date.now()}`, clipUrl: '', clipThumbnail: null, duration: 5, trimStart: 0, caption: '', searchQuery: 'tree service', transition: 'cut' as const };
                  setComposition(prev => prev ? { ...prev, scenes: [...prev.scenes, newScene] } : prev);
                }}
              />

              {/* Selected scene editor */}
              {selectedSceneId && (() => {
                const idx = composition.scenes.findIndex(s => s.id === selectedSceneId);
                const scene = composition.scenes[idx];
                if (!scene) return null;
                return (
                  <SceneEditor
                    scene={scene}
                    sceneIndex={idx}
                    totalScenes={composition.scenes.length}
                    onUpdate={(updates) => {
                      setComposition(prev => {
                        if (!prev) return prev;
                        const scenes = [...prev.scenes];
                        scenes[idx] = { ...scenes[idx], ...updates };
                        return { ...prev, scenes };
                      });
                    }}
                    onDelete={() => {
                      setComposition(prev => {
                        if (!prev) return prev;
                        return { ...prev, scenes: prev.scenes.filter(s => s.id !== selectedSceneId) };
                      });
                      setSelectedSceneId(null);
                    }}
                    onSwapFootage={() => {/* TODO: Pexels search modal */}}
                    onMoveUp={() => {
                      if (idx <= 0) return;
                      setComposition(prev => {
                        if (!prev) return prev;
                        const scenes = [...prev.scenes];
                        [scenes[idx - 1], scenes[idx]] = [scenes[idx], scenes[idx - 1]];
                        return { ...prev, scenes };
                      });
                    }}
                    onMoveDown={() => {
                      if (idx >= composition.scenes.length - 1) return;
                      setComposition(prev => {
                        if (!prev) return prev;
                        const scenes = [...prev.scenes];
                        [scenes[idx], scenes[idx + 1]] = [scenes[idx + 1], scenes[idx]];
                        return { ...prev, scenes };
                      });
                    }}
                  />
                );
              })()}

              {/* Template picker */}
              <View style={ce.section}>
                <Text style={ce.sectionLabel}>STYLE TEMPLATES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {VIDEO_TEMPLATES.map(tmpl => (
                    <TouchableOpacity
                      key={tmpl.id}
                      style={ce.templateCard}
                      onPress={() => {
                        setComposition(prev => prev ? applyTemplate(prev, tmpl) : prev);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={ce.templateEmoji}>{tmpl.emoji}</Text>
                      <Text style={ce.templateName}>{tmpl.name}</Text>
                      <Text style={ce.templateDesc}>{tmpl.description}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Audio controls */}
              <View style={ce.section}>
                <Text style={ce.sectionLabel}>AUDIO</Text>

                {/* Background music picker */}
                <Text style={ce.subLabel}>Background Music</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity
                    style={[ce.audioPill, !composition.audio.backgroundMusicUrl && ce.audioPillActive]}
                    onPress={() => setComposition(prev => prev ? { ...prev, audio: { ...prev.audio, backgroundMusicUrl: null, backgroundMusicName: null } } : prev)}
                  >
                    <Text style={[ce.audioPillText, !composition.audio.backgroundMusicUrl && ce.audioPillTextActive]}>None</Text>
                  </TouchableOpacity>
                  {BACKGROUND_MUSIC.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      style={[ce.audioPill, composition.audio.backgroundMusicUrl === m.url && ce.audioPillActive]}
                      onPress={() => setComposition(prev => prev ? { ...prev, audio: { ...prev.audio, backgroundMusicUrl: m.url, backgroundMusicName: m.name } } : prev)}
                    >
                      <Text style={[ce.audioPillText, composition.audio.backgroundMusicUrl === m.url && ce.audioPillTextActive]}>🎵 {m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Ambient sound picker */}
                <Text style={ce.subLabel}>Ambient Sounds</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity
                    style={[ce.audioPill, !composition.audio.ambientSoundUrl && ce.audioPillActive]}
                    onPress={() => setComposition(prev => prev ? { ...prev, audio: { ...prev.audio, ambientSoundUrl: null, ambientSoundName: null } } : prev)}
                  >
                    <Text style={[ce.audioPillText, !composition.audio.ambientSoundUrl && ce.audioPillTextActive]}>None</Text>
                  </TouchableOpacity>
                  {AMBIENT_SOUNDS.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[ce.audioPill, composition.audio.ambientSoundUrl === a.url && ce.audioPillActive]}
                      onPress={() => setComposition(prev => prev ? { ...prev, audio: { ...prev.audio, ambientSoundUrl: a.url, ambientSoundName: a.name } } : prev)}
                    >
                      <Text style={[ce.audioPillText, composition.audio.ambientSoundUrl === a.url && ce.audioPillTextActive]}>🔊 {a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Caption style */}
                <Text style={ce.subLabel}>Caption Style</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['bold', 'minimal', 'subtitle', 'none'] as const).map(cs => (
                    <TouchableOpacity
                      key={cs}
                      style={[ce.audioPill, composition.captionStyle === cs && ce.audioPillActive]}
                      onPress={() => setComposition(prev => prev ? { ...prev, captionStyle: cs } : prev)}
                    >
                      <Text style={[ce.audioPillText, composition.captionStyle === cs && ce.audioPillTextActive]}>{cs.charAt(0).toUpperCase() + cs.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Render button */}
              <TouchableOpacity
                style={ce.bigRenderBtn}
                onPress={() => {
                  setCompositionModal(false);
                  generateVideo();
                }}
                activeOpacity={0.85}
              >
                <Text style={ce.bigRenderBtnText}>🎬 Render Final Video</Text>
                <Text style={ce.bigRenderBtnSub}>
                  {composition.scenes.length} scenes · {formatDuration(getTotalDuration(composition))}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}

// ─── Composition editor styles ──────────────────────────────────────────────
const ce = StyleSheet.create({
  container:     { flex: 1, backgroundColor: D.bg },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.surface },
  closeTxt:      { fontSize: Theme.font.size.body, color: D.textSec, fontWeight: Theme.font.weight.semibold },
  headerTitle:   { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  renderBtn:     { backgroundColor: D.green, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Theme.radius.md },
  renderBtnText: { fontSize: 14, fontWeight: '700' as const, color: '#FFFFFF' },
  scroll:        { flex: 1 },
  scrollContent: { padding: Theme.layout.screenPadding, paddingBottom: 48, gap: Theme.space.xl },

  section:       { gap: Theme.space.sm },
  sectionLabel:  { fontSize: 10, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5 },
  subLabel:      { fontSize: 12, color: D.textSec, fontWeight: '600' as const, marginTop: 6 },

  templateCard:  { width: 100, backgroundColor: D.surfaceAlt, borderRadius: 12, padding: 10, gap: 4, borderWidth: 1, borderColor: D.border },
  templateEmoji: { fontSize: 24 },
  templateName:  { fontSize: 12, fontWeight: '700' as const, color: D.text },
  templateDesc:  { fontSize: 10, color: D.textSec, lineHeight: 14 },

  audioPill:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: D.surfaceAlt, borderWidth: 1, borderColor: D.border },
  audioPillActive:    { backgroundColor: D.green + '20', borderColor: D.green },
  audioPillText:      { fontSize: 12, color: D.textSec, fontWeight: '500' as const },
  audioPillTextActive:{ color: D.green },

  bigRenderBtn:     { backgroundColor: D.green, borderRadius: Theme.radius.lg, paddingVertical: 18, alignItems: 'center', gap: 4 },
  bigRenderBtnText: { fontSize: 18, fontWeight: '700' as const, color: '#FFFFFF' },
  bigRenderBtnSub:  { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
});

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

  categorySection: { gap: Theme.space.sm },
  categoryLabel:   { fontSize: 10, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5 },
  videoTypeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.space.md },
  videoTypeCard: {
    width: '47.5%',
    backgroundColor: D.surfaceAlt,
    borderRadius: Theme.radius.xl,
    borderWidth: 1,
    borderColor: D.border,
    padding: Theme.space.lg,
    gap: 4,
    minHeight: 130,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  videoTypeEmoji: { fontSize: 28 },
  videoTypeLabel: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: D.text, lineHeight: 18 },
  videoTypeDesc:  { fontSize: 11, color: D.textSec, lineHeight: 15 },

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

  hookBox:        { backgroundColor: D.gold + '15', borderRadius: Theme.radius.lg, padding: Theme.space.lg, borderWidth: 1, borderColor: D.gold + '40' },
  hookLabel:      { fontSize: 10, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5, marginBottom: 6 },
  hookText:       { fontSize: 20, fontWeight: '700' as const, color: '#FFFFFF', lineHeight: 28 },

  scriptBox:      { backgroundColor: D.surface, borderRadius: Theme.radius.xl, padding: Theme.space.xl, borderWidth: 1, borderColor: D.border },
  scriptBoxLabel: { fontSize: 10, fontWeight: '800' as const, color: D.textSec, letterSpacing: 1.5, marginBottom: 8 },
  scriptText:     { fontSize: Theme.font.size.body, color: D.text, lineHeight: 26 },

  tagsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:            { backgroundColor: D.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full, borderWidth: 1, borderColor: D.border },
  tagText:        { fontSize: 12, color: D.textSec, fontWeight: '500' as const },

  captionBox:     { backgroundColor: D.surfaceAlt, borderRadius: Theme.radius.lg, padding: Theme.space.md, borderWidth: 1, borderColor: D.border },
  captionLabel:   { fontSize: 10, fontWeight: '800' as const, color: D.textSec, letterSpacing: 1.5, marginBottom: 4 },
  captionText:    { fontSize: Theme.font.size.small, color: D.textSec, lineHeight: 20, fontStyle: 'italic' as const },

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

  styleRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  styleLabel:          { fontSize: Theme.font.size.small, color: D.textSec, fontWeight: Theme.font.weight.medium },
  stylePills:          { flexDirection: 'row', gap: 6 },
  stylePill:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Theme.radius.full, backgroundColor: D.surfaceAlt, borderWidth: 1, borderColor: D.border },
  stylePillActive:     { backgroundColor: D.green + '25', borderColor: D.green },
  stylePillText:       { fontSize: 12, color: D.textSec, fontWeight: '600' as const },
  stylePillTextActive: { color: D.green },

  uploadSection:       { gap: 8 },
  uploadedList:        { gap: 6 },
  uploadedClip:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: D.surfaceAlt, borderRadius: Theme.radius.md, padding: 10, borderWidth: 1, borderColor: D.border },
  uploadedClipIcon:    { fontSize: 16 },
  uploadedClipName:    { flex: 1, fontSize: 13, color: D.text },
  uploadedClipRemove:  { fontSize: 16, color: '#F87171', fontWeight: '700' as const, paddingHorizontal: 6 },
  uploadBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: D.surfaceAlt, borderRadius: Theme.radius.lg, padding: 14, borderWidth: 1.5, borderColor: D.green + '60', borderStyle: 'dashed' as const },
  uploadBtnIcon:       { fontSize: 20, color: D.green, fontWeight: '700' as const },
  uploadBtnText:       { fontSize: 14, color: D.green, fontWeight: '600' as const },
  uploadHint:          { fontSize: 11, color: D.textSec + '80', textAlign: 'center' as const },
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

// ─── Customize modal styles ──────────────────────────────────────────────────
const cm = StyleSheet.create({
  container:     { flex: 1, backgroundColor: D.bg },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl, borderBottomWidth: 1, borderBottomColor: D.border, backgroundColor: D.surface },
  closeTxt:      { fontSize: Theme.font.size.body, color: D.textSec, fontWeight: Theme.font.weight.semibold },
  headerTitle:   { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: D.text },
  scroll:        { flex: 1 },
  scrollContent: { padding: Theme.layout.screenPadding, paddingBottom: 48, gap: Theme.space.lg },

  optionLabel:   { fontSize: 10, fontWeight: '800' as const, color: D.gold, letterSpacing: 1.5, marginTop: 4 },

  pillRow:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Theme.radius.lg, backgroundColor: D.surfaceAlt, borderWidth: 1.5, borderColor: D.border },
  pillActive:    { backgroundColor: D.green + '20', borderColor: D.green },
  pillWide:      { flex: 1, justifyContent: 'center' },
  pillIcon:      { fontSize: 16 },
  pillText:      { fontSize: 14, fontWeight: '600' as const, color: D.textSec },
  pillTextActive:{ color: D.green },
  pillSub:       { fontSize: 11, color: D.textSec + '80', marginTop: 1 },
  pillSubActive: { color: D.green + 'AA' },

  contextInput:  { backgroundColor: D.surfaceAlt, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: D.border, color: D.text, padding: Theme.space.md, fontSize: 14, minHeight: 80, textAlignVertical: 'top' } as any,

  generateBtn:     { backgroundColor: D.green, borderRadius: Theme.radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: Theme.space.md },
  generateBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
});
