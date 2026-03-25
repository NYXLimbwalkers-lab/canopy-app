import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

interface ContentPost {
  id: string;
  title: string;
  type: string;
  platform: string;
  scheduled_at: string | null;
  published_at: string | null;
  status: 'draft' | 'scheduled' | 'published';
  script: string | null;
}

interface SocialConnection {
  platform: string;
  connected: boolean;
  handle: string | null;
}

const VIDEO_TYPES = [
  { key: 'satisfying_removal', emoji: '🌳', label: 'Satisfying removal' },
  { key: 'before_after', emoji: '✨', label: 'Before & after' },
  { key: 'did_you_know', emoji: '🧠', label: 'Did you know' },
  { key: 'day_in_life', emoji: '📸', label: 'Day in the life' },
  { key: 'price_transparency', emoji: '💰', label: 'Price transparency' },
  { key: 'storm_damage', emoji: '⚡', label: 'Storm damage' },
];

const SOCIAL_PLATFORMS = [
  { key: 'tiktok', emoji: '🎵', label: 'TikTok' },
  { key: 'youtube', emoji: '▶️', label: 'YouTube' },
  { key: 'instagram', emoji: '📷', label: 'Instagram' },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function MiniCalendar({ posts }: { posts: ContentPost[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = now.getDate();

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const scheduledDays = new Set(
    posts
      .filter(p => p.scheduled_at)
      .map(p => new Date(p.scheduled_at!).getDate())
  );

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];

  return (
    <Card>
      <View style={calStyles.calHeader}>
        <Text style={calStyles.calMonth}>{MONTH_NAMES[month]} {year}</Text>
        <Text style={calStyles.calPostCount}>{posts.length} posts scheduled</Text>
      </View>
      <View style={calStyles.dayRow}>
        {DAY_NAMES.map((d, i) => (
          <Text key={i} style={calStyles.dayLabel}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, i) => (
          <View key={i} style={calStyles.cell}>
            {day != null && (
              <View style={[calStyles.dayCircle, day === today && calStyles.todayCircle, scheduledDays.has(day) && calStyles.scheduledCircle]}>
                <Text style={[calStyles.dayNum, day === today && calStyles.todayNum, scheduledDays.has(day) && calStyles.scheduledNum]}>
                  {day}
                </Text>
                {scheduledDays.has(day) && <View style={calStyles.dot} />}
              </View>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

const calStyles = StyleSheet.create({
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Theme.space.md },
  calMonth: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  calPostCount: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  dayRow: { flexDirection: 'row', marginBottom: Theme.space.sm },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: Theme.font.size.caption, color: Colors.textTertiary, fontWeight: Theme.font.weight.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: Colors.primary },
  scheduledCircle: { backgroundColor: Colors.primary + '20' },
  dayNum: { fontSize: 12, color: Colors.text },
  todayNum: { color: Colors.textInverse, fontWeight: Theme.font.weight.bold },
  scheduledNum: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary, position: 'absolute', bottom: 2 },
});

export default function ContentScreen() {
  const { company } = useAuthStore();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVideoType, setSelectedVideoType] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState(false);

  const fetchData = useCallback(async () => {
    if (!company) return;
    const [postsRes, connectionsRes] = await Promise.all([
      supabase
        .from('content_posts')
        .select('*')
        .eq('company_id', company.id)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('social_connections')
        .select('*')
        .eq('company_id', company.id),
    ]);
    setPosts(postsRes.data ?? []);
    setConnections(connectionsRes.data ?? []);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const generateScript = async (videoType: string) => {
    const key = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
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
          messages: [{
            role: 'user',
            content: `Write a 30-60 second TikTok/Instagram Reel script for a tree service company called "${company.name}" in ${company.city ?? 'their area'}.

Video type: ${videoTypeLabel}

Format the script with:
- Hook (first 3 seconds — must grab attention)
- Main content (what to show/say)
- Call to action (end with what to do next)

Keep it conversational, authentic, and specific to tree service. Include [ACTION] notes for what to film. Under 150 words total.`,
          }],
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

  const upcomingPosts = posts.filter(p => p.status === 'scheduled');
  const draftPosts = posts.filter(p => p.status === 'draft');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
    >
      <Text style={styles.pageTitle}>Content</Text>

      {/* Calendar */}
      <MiniCalendar posts={upcomingPosts} />

      {/* Upcoming posts */}
      <Text style={styles.sectionTitle}>Scheduled posts</Text>
      {loading ? (
        <ActivityIndicator color={Colors.primary} />
      ) : upcomingPosts.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No posts scheduled"
          description="Use the script generator below to create content, then schedule it to your platforms."
        />
      ) : (
        <Card padding={false}>
          {upcomingPosts.map((post, i) => (
            <View key={post.id} style={[styles.postRow, i < upcomingPosts.length - 1 && styles.postBorder]}>
              <View style={styles.postInfo}>
                <Text style={styles.postTitle}>{post.title}</Text>
                <View style={styles.postMeta}>
                  <Badge label={post.type.replace(/_/g, ' ')} variant="neutral" />
                  <Text style={styles.postDate}>
                    {post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unscheduled'}
                  </Text>
                </View>
              </View>
              <Text style={styles.postPlatformEmoji}>
                {SOCIAL_PLATFORMS.find(p => p.key === post.platform)?.emoji ?? '📱'}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Draft posts */}
      {draftPosts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Drafts</Text>
          <Card padding={false}>
            {draftPosts.map((post, i) => (
              <View key={post.id} style={[styles.postRow, i < draftPosts.length - 1 && styles.postBorder]}>
                <View style={styles.postInfo}>
                  <Text style={styles.postTitle}>{post.title}</Text>
                  <Badge label="draft" variant="warning" />
                </View>
                <Text style={styles.postPlatformEmoji}>
                  {SOCIAL_PLATFORMS.find(p => p.key === post.platform)?.emoji ?? '📱'}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Script generator */}
      <Text style={styles.sectionTitle}>AI Script Generator</Text>
      <Card>
        <Text style={styles.scriptGenSubtitle}>Tap a video type to generate a 30-60 second script</Text>
        <View style={styles.videoTypeGrid}>
          {VIDEO_TYPES.map(vt => (
            <TouchableOpacity
              key={vt.key}
              style={styles.videoTypeBtn}
              onPress={() => generateScript(vt.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.videoTypeEmoji}>{vt.emoji}</Text>
              <Text style={styles.videoTypeLbl}>{vt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Connected platforms */}
      <Text style={styles.sectionTitle}>Platforms</Text>
      <Card padding={false}>
        {SOCIAL_PLATFORMS.map((platform, i) => {
          const conn = connections.find(c => c.platform === platform.key);
          return (
            <View key={platform.key} style={[styles.platformRow, i < SOCIAL_PLATFORMS.length - 1 && styles.platformBorder]}>
              <Text style={styles.platformEmoji}>{platform.emoji}</Text>
              <View style={styles.platformInfo}>
                <Text style={styles.platformName}>{platform.label}</Text>
                {conn?.handle && <Text style={styles.platformHandle}>@{conn.handle}</Text>}
              </View>
              {conn?.connected ? (
                <Badge label="Connected" variant="success" />
              ) : (
                <Button label="Connect" size="sm" variant="secondary" onPress={() => {}} />
              )}
            </View>
          );
        })}
      </Card>

      {/* Script modal */}
      <Modal visible={scriptModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScriptModal(false)}>
        <View style={styles.scriptModal}>
          <View style={styles.scriptModalHeader}>
            <TouchableOpacity onPress={() => setScriptModal(false)}>
              <Text style={styles.scriptModalClose}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.scriptModalTitle}>
              {VIDEO_TYPES.find(v => v.key === selectedVideoType)?.label ?? 'Script'}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={styles.scriptScroll} contentContainerStyle={styles.scriptContent}>
            {generatingScript ? (
              <View style={styles.scriptLoading}>
                <ActivityIndicator color={Colors.ai} size="large" />
                <Text style={styles.scriptLoadingText}>Writing your script...</Text>
              </View>
            ) : script ? (
              <>
                <View style={styles.scriptAiBadge}>
                  <Text style={styles.scriptAiLabel}>🤖 AI-generated script</Text>
                </View>
                <Text style={styles.scriptText}>{script}</Text>
                <Button
                  label="Generate another"
                  variant="secondary"
                  onPress={() => selectedVideoType && generateScript(selectedVideoType)}
                  style={styles.regenBtn}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40, paddingTop: 60 },
  pageTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  sectionTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  postRow: { flexDirection: 'row', alignItems: 'center', padding: Theme.space.lg, gap: Theme.space.md },
  postBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  postInfo: { flex: 1, gap: 4 },
  postTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.medium, color: Colors.text },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postDate: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  postPlatformEmoji: { fontSize: 22 },
  scriptGenSubtitle: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginBottom: Theme.space.md },
  videoTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.space.md },
  videoTypeBtn: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  videoTypeEmoji: { fontSize: 24 },
  videoTypeLbl: { fontSize: 10, color: Colors.text, fontWeight: Theme.font.weight.medium, textAlign: 'center' },
  platformRow: { flexDirection: 'row', alignItems: 'center', padding: Theme.space.lg, gap: Theme.space.md },
  platformBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  platformEmoji: { fontSize: 26 },
  platformInfo: { flex: 1 },
  platformName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.medium, color: Colors.text },
  platformHandle: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  scriptModal: { flex: 1, backgroundColor: Colors.background },
  scriptModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  scriptModalTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  scriptModalClose: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  scriptScroll: { flex: 1 },
  scriptContent: { padding: Theme.layout.screenPadding, paddingBottom: 40, gap: Theme.space.lg },
  scriptLoading: { alignItems: 'center', gap: Theme.space.lg, paddingTop: 60 },
  scriptLoadingText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  scriptAiBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Theme.radius.full, alignSelf: 'flex-start' },
  scriptAiLabel: { fontSize: Theme.font.size.caption, color: Colors.ai, fontWeight: Theme.font.weight.semibold },
  scriptText: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 26,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    ...Theme.shadow.sm,
  },
  regenBtn: { alignSelf: 'flex-start' },
});
