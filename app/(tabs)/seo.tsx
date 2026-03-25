import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoreCard } from '@/components/ui/ScoreCard';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

interface GbpProfile {
  id: string;
  score: number;
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours_set: boolean;
  photos_count: number;
  reviews_count: number;
  avg_rating: number | null;
  last_synced_at: string | null;
}

interface KeywordRanking {
  id: string;
  keyword: string;
  position: number | null;
  previous_position: number | null;
  search_volume: number | null;
  updated_at: string;
}

interface Review {
  id: string;
  reviewer_name: string;
  rating: number;
  text: string | null;
  replied: boolean;
  created_at: string;
  source: string;
}

interface Citation {
  id: string;
  directory: string;
  claimed: boolean;
  url: string | null;
}

function GbpScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? Colors.success : score >= 50 ? Colors.warning : Colors.danger;
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs work';

  return (
    <View style={gaugeStyles.container}>
      <View style={[gaugeStyles.scoreCircle, { borderColor: color }]}>
        <Text style={[gaugeStyles.scoreNumber, { color }]}>{score}</Text>
        <Text style={gaugeStyles.scoreOf}>/100</Text>
      </View>
      <View style={gaugeStyles.scoreInfo}>
        <Text style={[gaugeStyles.scoreLabel, { color }]}>{label}</Text>
        <Text style={gaugeStyles.scoreDesc}>Google Business Profile score</Text>
        <View style={gaugeStyles.progressBar}>
          <View style={[gaugeStyles.progressFill, { width: `${score}%` as any, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.xl },
  scoreCircle: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreNumber: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.heavy, lineHeight: 28 },
  scoreOf: { fontSize: 10, color: Colors.textTertiary },
  scoreInfo: { flex: 1, gap: 4 },
  scoreLabel: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold },
  scoreDesc: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  progressBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3 },
});

function PositionChange({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null) return <Text style={rankStyles.noData}>—</Text>;
  if (previous == null) return <Text style={rankStyles.position}>{current}</Text>;

  const diff = previous - current; // positive = improved
  if (diff === 0) return (
    <View style={rankStyles.row}>
      <Text style={rankStyles.position}>{current}</Text>
      <Text style={rankStyles.unchanged}>—</Text>
    </View>
  );

  return (
    <View style={rankStyles.row}>
      <Text style={rankStyles.position}>{current}</Text>
      <Text style={diff > 0 ? rankStyles.improved : rankStyles.declined}>
        {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
      </Text>
    </View>
  );
}

const rankStyles = StyleSheet.create({
  row: { alignItems: 'flex-end' },
  position: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.text },
  noData: { fontSize: Theme.font.size.body, color: Colors.textTertiary },
  unchanged: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },
  improved: { fontSize: Theme.font.size.caption, color: Colors.success, fontWeight: Theme.font.weight.semibold },
  declined: { fontSize: Theme.font.size.caption, color: Colors.danger, fontWeight: Theme.font.weight.semibold },
});

function StarRating({ rating }: { rating: number }) {
  return (
    <Text style={{ fontSize: Theme.font.size.small }}>
      {Array.from({ length: 5 }, (_, i) => i < rating ? '★' : '☆').join('')}
    </Text>
  );
}

export default function SeoScreen() {
  const { company } = useAuthStore();
  const [gbp, setGbp] = useState<GbpProfile | null>(null);
  const [keywords, setKeywords] = useState<KeywordRanking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [contentModal, setContentModal] = useState(false);
  const [replyModal, setReplyModal] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [generatingReply, setGeneratingReply] = useState(false);

  const fetchData = useCallback(async () => {
    if (!company) return;
    const [gbpRes, kwRes, reviewRes, citRes] = await Promise.all([
      supabase.from('gbp_profiles').select('*').eq('company_id', company.id).maybeSingle(),
      supabase.from('keyword_rankings').select('*').eq('company_id', company.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('reviews').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('citations').select('*').eq('company_id', company.id).order('claimed', { ascending: false }),
    ]);
    setGbp(gbpRes.data ?? null);
    setKeywords(kwRes.data ?? []);
    setReviews(reviewRes.data ?? []);
    setCitations(citRes.data ?? []);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const generateContentIdea = async () => {
    const key = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
    if (!key || !company) {
      setGeneratedContent('Connect your OpenRouter API key in settings to use AI content generation.');
      setContentModal(true);
      return;
    }

    setGeneratingContent(true);
    setContentModal(true);
    setGeneratedContent(null);

    try {
      const resp = await globalThis.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          messages: [{
            role: 'user',
            content: `Generate a Google Business Profile post for ${company.name}, a tree service company in ${company.city ?? 'their area'}.

Write a short, engaging post (2-3 sentences) that:
- Highlights a tree service (removal, trimming, or stump grinding)
- Mentions local relevance or seasonal timing
- Ends with a clear call to action

Also suggest 3 relevant keywords to include. Keep the whole response under 150 words.`,
          }],
          max_tokens: 200,
        }),
      });
      const json = await resp.json();
      setGeneratedContent(json.choices?.[0]?.message?.content ?? 'Could not generate content. Try again.');
    } catch {
      setGeneratedContent('Error generating content. Check your connection and try again.');
    } finally {
      setGeneratingContent(false);
    }
  };

  const generateReply = async (review: Review) => {
    const key = process.env.EXPO_PUBLIC_OPENROUTER_KEY;
    if (!key || !company) {
      setReplyText('Thank you for your review! We appreciate your feedback and look forward to serving you again.');
      return;
    }

    setGeneratingReply(true);
    setReplyText('');

    try {
      const resp = await globalThis.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          messages: [{
            role: 'user',
            content: `Write a professional, warm response to this ${review.rating}-star Google review for ${company.name} (tree service company).

Review from ${review.reviewer_name}: "${review.text ?? '(No text provided)'}"

Keep it under 50 words. Be genuine, thank them by name, and invite them back or address any concern. Don't be overly formal.`,
          }],
          max_tokens: 100,
        }),
      });
      const json = await resp.json();
      setReplyText(json.choices?.[0]?.message?.content ?? '');
    } catch {
      setReplyText('Thank you for your review! We truly appreciate your feedback.');
    } finally {
      setGeneratingReply(false);
    }
  };

  const claimedCitations = citations.filter(c => c.claimed).length;
  const avgRating = gbp?.avg_rating ?? (reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
    >
      <Text style={styles.pageTitle}>SEO & Presence</Text>

      {/* GBP Score */}
      <Text style={styles.sectionTitle}>Google Business Profile</Text>
      {loading ? (
        <ActivityIndicator color={Colors.primary} />
      ) : gbp ? (
        <Card>
          <GbpScoreGauge score={gbp.score} />
          <View style={styles.gbpDetails}>
            {[
              { label: 'Phone', value: gbp.phone, icon: '📞', ok: !!gbp.phone },
              { label: 'Website', value: gbp.website, icon: '🌐', ok: !!gbp.website },
              { label: 'Hours', value: gbp.hours_set ? 'Set' : 'Missing', icon: '🕐', ok: gbp.hours_set },
              { label: 'Photos', value: `${gbp.photos_count}`, icon: '📷', ok: gbp.photos_count >= 5 },
            ].map(item => (
              <View key={item.label} style={styles.gbpDetailRow}>
                <Text style={styles.gbpDetailIcon}>{item.icon}</Text>
                <Text style={styles.gbpDetailLabel}>{item.label}</Text>
                <Text style={[styles.gbpDetailValue, !item.ok && styles.gbpDetailMissing]}>
                  {item.value ?? 'Not set'}
                </Text>
                <Text>{item.ok ? '✅' : '⚠️'}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : (
        <EmptyState
          icon="🔍"
          title="Connect your GBP"
          description="Connect your Google Business Profile to track your local SEO score and keyword rankings."
          actionLabel="Connect GBP"
          onAction={() => {}}
        />
      )}

      {/* Score summary row */}
      {!loading && (
        <View style={styles.scoreRow}>
          <ScoreCard
            label="Avg rating"
            value={avgRating != null ? avgRating.toFixed(1) : '—'}
            subtext={`${reviews.length} reviews`}
            color={avgRating && avgRating >= 4 ? Colors.success : Colors.warning}
          />
          <ScoreCard
            label="Citations"
            value={`${claimedCitations}/${citations.length}`}
            subtext="directories claimed"
            color={Colors.info}
          />
        </View>
      )}

      {/* Keyword rankings */}
      <Text style={styles.sectionTitle}>Keyword Rankings</Text>
      {loading ? (
        <ActivityIndicator color={Colors.primary} />
      ) : keywords.length === 0 ? (
        <EmptyState
          icon="🔑"
          title="No keywords tracked"
          description="Connect your Google Business Profile to start tracking your local keyword positions."
        />
      ) : (
        <Card padding={false}>
          <View style={styles.kwHeader}>
            <Text style={[styles.kwHeaderCell, { flex: 2 }]}>Keyword</Text>
            <Text style={styles.kwHeaderCell}>Position</Text>
            <Text style={styles.kwHeaderCell}>Volume</Text>
          </View>
          {keywords.map((kw, i) => (
            <View key={kw.id} style={[styles.kwRow, i < keywords.length - 1 && styles.kwBorder]}>
              <Text style={[styles.kwText, { flex: 2 }]}>{kw.keyword}</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <PositionChange current={kw.position} previous={kw.previous_position} />
              </View>
              <Text style={styles.kwVolume}>
                {kw.search_volume != null ? kw.search_volume.toLocaleString() : '—'}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {/* Reviews */}
      <Text style={styles.sectionTitle}>Reviews</Text>
      {loading ? (
        <ActivityIndicator color={Colors.primary} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="No reviews yet"
          description="Connect your Google Business Profile to pull in and respond to reviews."
        />
      ) : (
        <>
          {reviews.map((review, i) => (
            <Card key={review.id} style={i < reviews.length - 1 ? styles.reviewCard : undefined}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewLeft}>
                  <Text style={styles.reviewerName}>{review.reviewer_name}</Text>
                  <StarRating rating={review.rating} />
                </View>
                <View style={styles.reviewRight}>
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  {review.replied ? (
                    <Badge label="Replied" variant="success" />
                  ) : (
                    <TouchableOpacity
                      style={styles.replyBtn}
                      onPress={() => { setReplyModal(review); setReplyText(''); generateReply(review); }}
                    >
                      <Text style={styles.replyBtnText}>Reply</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {review.text && <Text style={styles.reviewText}>{review.text}</Text>}
            </Card>
          ))}
        </>
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Citation Tracker</Text>
          <Card padding={false}>
            {citations.map((citation, i) => (
              <View key={citation.id} style={[styles.citRow, i < citations.length - 1 && styles.kwBorder]}>
                <Text style={styles.citName}>{citation.directory}</Text>
                {citation.claimed ? (
                  <Badge label="Claimed" variant="success" />
                ) : (
                  <Badge label="Unclaimed" variant="warning" />
                )}
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Content generator */}
      <Text style={styles.sectionTitle}>GBP Post Generator</Text>
      <Card>
        <Text style={styles.contentGenDesc}>
          Generate an AI-written Google Business Profile post to keep your listing active and improve local rankings.
        </Text>
        <Button
          label="Generate GBP post"
          variant="ai"
          onPress={generateContentIdea}
          loading={generatingContent}
        />
      </Card>

      {/* Content modal */}
      <Modal visible={contentModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setContentModal(false)}>
        <View style={styles.contentModal}>
          <View style={styles.contentModalHeader}>
            <TouchableOpacity onPress={() => setContentModal(false)}>
              <Text style={styles.contentModalClose}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.contentModalTitle}>GBP Post</Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView contentContainerStyle={styles.contentModalBody}>
            {generatingContent ? (
              <View style={styles.generatingContainer}>
                <ActivityIndicator color={Colors.ai} size="large" />
                <Text style={styles.generatingText}>Writing your post...</Text>
              </View>
            ) : generatedContent ? (
              <>
                <View style={styles.aiLabelRow}>
                  <Text style={styles.aiLabel}>🤖 AI-generated</Text>
                </View>
                <Text style={styles.generatedText}>{generatedContent}</Text>
                <Button
                  label="Generate another"
                  variant="secondary"
                  onPress={generateContentIdea}
                  style={styles.regenBtn}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Reply modal */}
      <Modal visible={!!replyModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReplyModal(null)}>
        <KeyboardAvoidingView style={styles.replyModalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.contentModalHeader}>
            <TouchableOpacity onPress={() => setReplyModal(null)}>
              <Text style={styles.contentModalClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.contentModalTitle}>Reply to Review</Text>
            <TouchableOpacity onPress={() => setReplyModal(null)}>
              <Text style={styles.contentModalClose}>Send</Text>
            </TouchableOpacity>
          </View>
          {replyModal && (
            <ScrollView contentContainerStyle={styles.replyModalBody}>
              <View style={styles.originalReview}>
                <Text style={styles.reviewerName}>{replyModal.reviewer_name}</Text>
                <StarRating rating={replyModal.rating} />
                {replyModal.text && <Text style={styles.reviewText}>{replyModal.text}</Text>}
              </View>
              <Text style={styles.fieldLabel}>Your reply</Text>
              {generatingReply ? (
                <View style={styles.replyGenerating}>
                  <ActivityIndicator color={Colors.ai} size="small" />
                  <Text style={styles.generatingText}>Drafting reply...</Text>
                </View>
              ) : (
                <TextInput
                  style={styles.replyInput}
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  numberOfLines={5}
                  placeholder="Write your reply..."
                  placeholderTextColor={Colors.textTertiary}
                />
              )}
              {!generatingReply && (
                <Button
                  label="Re-draft with AI"
                  variant="ai"
                  size="sm"
                  onPress={() => replyModal && generateReply(replyModal)}
                  style={styles.redraftBtn}
                />
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40, paddingTop: 60 },
  pageTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  sectionTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  scoreRow: { flexDirection: 'row', gap: Theme.space.md },
  gbpDetails: { gap: 0, marginTop: Theme.space.md },
  gbpDetailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 8 },
  gbpDetailIcon: { fontSize: 16, width: 24 },
  gbpDetailLabel: { flex: 1, fontSize: Theme.font.size.body, color: Colors.textSecondary },
  gbpDetailValue: { fontSize: Theme.font.size.body, color: Colors.text, fontWeight: Theme.font.weight.medium },
  gbpDetailMissing: { color: Colors.danger },
  kwHeader: { flexDirection: 'row', paddingHorizontal: Theme.space.lg, paddingVertical: 8, backgroundColor: Colors.surfaceSecondary },
  kwHeaderCell: { flex: 1, fontSize: Theme.font.size.caption, fontWeight: Theme.font.weight.semibold, color: Colors.textTertiary, textTransform: 'uppercase', textAlign: 'center' },
  kwRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Theme.space.lg, paddingVertical: 12 },
  kwBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  kwText: { fontSize: Theme.font.size.body, color: Colors.text },
  kwVolume: { flex: 1, fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center' },
  reviewCard: { marginBottom: 0 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Theme.space.sm },
  reviewLeft: { gap: 2 },
  reviewerName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  reviewRight: { alignItems: 'flex-end', gap: 4 },
  reviewDate: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },
  reviewText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  replyBtn: { backgroundColor: Colors.primary + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Theme.radius.full },
  replyBtnText: { fontSize: Theme.font.size.small, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  citRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.space.lg, paddingVertical: 12 },
  citName: { fontSize: Theme.font.size.body, color: Colors.text },
  contentGenDesc: { fontSize: Theme.font.size.body, color: Colors.textSecondary, marginBottom: Theme.space.lg, lineHeight: 22 },
  contentModal: { flex: 1, backgroundColor: Colors.background },
  contentModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Theme.layout.screenPadding, paddingTop: Theme.space.xl,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  contentModalTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  contentModalClose: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  contentModalBody: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40 },
  generatingContainer: { alignItems: 'center', gap: Theme.space.lg, paddingTop: 60 },
  generatingText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  aiLabelRow: { alignSelf: 'flex-start' },
  aiLabel: { fontSize: Theme.font.size.caption, color: Colors.ai, fontWeight: Theme.font.weight.semibold, backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 3, borderRadius: Theme.radius.full },
  generatedText: {
    fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 26,
    backgroundColor: Colors.surface, borderRadius: Theme.radius.lg,
    padding: Theme.space.lg, ...Theme.shadow.sm,
  },
  regenBtn: { alignSelf: 'flex-start' },
  replyModalContainer: { flex: 1, backgroundColor: Colors.background },
  replyModalBody: { padding: Theme.layout.screenPadding, gap: Theme.space.md, paddingBottom: 40 },
  originalReview: {
    backgroundColor: Colors.surfaceSecondary, borderRadius: Theme.radius.lg,
    padding: Theme.space.lg, gap: 4,
  },
  fieldLabel: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.medium, color: Colors.textSecondary },
  replyGenerating: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.md, padding: Theme.space.lg },
  replyInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Theme.radius.md, padding: Theme.space.md,
    fontSize: Theme.font.size.body, color: Colors.text,
    minHeight: 120, textAlignVertical: 'top',
  },
  redraftBtn: { alignSelf: 'flex-start' },
});
