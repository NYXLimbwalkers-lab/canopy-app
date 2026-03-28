import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Animated, Alert, LayoutAnimation,
  UIManager,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import {
  aiChat, isAIConfigured, generateAdCopy, generateVideoScript,
  scoreAndSuggestFollowUp, draftReviewResponse, generate30DayCalendar,
  generateMarketStrategy,
} from '@/lib/ai';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { crossAlert } from '@/lib/crossAlert';
import { speak, stop as stopTTS, isSpeaking } from '@/lib/tts';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Error Boundary for action data cards ──────────────────────────────────

class ActionCardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 12, backgroundColor: '#FEF3C7', borderRadius: 8, marginHorizontal: 16, marginTop: 4 }}>
          <Text style={{ color: '#92400E', fontSize: 13 }}>⚠️ Could not display this result card. The data may be in an unexpected format.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  suggestions?: string[];
  actionType?: 'ad_copy' | 'video_script' | 'lead_scores' | 'review_response' | 'content_calendar' | 'market_strategy';
  actionData?: any;
}

interface StoredConversation {
  id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

interface BusinessSnapshot {
  leadsThisWeek: number;
  leadsToday: number;
  activeCampaigns: number;
  adSpendThisWeek: number;
  avgCostPerLead: number | null;
  openJobs: number;
  reviewCount: number;
  avgRating: number | null;
  weekRevenue: number;
  topLeadSource: string | null;
}

// ─── Quick Actions (unified — best ~8 from all modes) ───────────────────────

interface QuickAction {
  icon: string;
  label: string;
  type: 'chat' | 'action';
  actionId?: string;
  prompt?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: '📊', label: 'Build Market Strategy', type: 'action', actionId: 'market_strategy' },
  { icon: '✍️', label: 'Write Ad Copy', type: 'action', actionId: 'ad_copy' },
  { icon: '🎬', label: 'Draft Video Script', type: 'action', actionId: 'video_script' },
  { icon: '📅', label: 'Content Calendar', type: 'action', actionId: 'content_calendar' },
  { icon: '🏷️', label: 'Score My Leads', type: 'action', actionId: 'lead_scores' },
  { icon: '💬', label: 'Draft Review Response', type: 'action', actionId: 'review_response' },
  { icon: '📈', label: 'Weekly Game Plan', type: 'chat', prompt: 'Based on everything you can see about my business right now, give me my top 5 priorities for this week ranked by impact. Be brutally honest.' },
  { icon: '⚡', label: 'Storm Ad Blitz', type: 'chat', prompt: 'A big storm is coming to my area. Give me a complete storm response marketing plan — ads to launch, posts to make, follow-up sequences, and how to capture emergency leads before my competitors.' },
];

// ─── Voice Input Hook (Web Speech API) ──────────────────────────────────────

function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (Platform.OS !== 'web') {
      Alert.alert('Voice Input', 'Voice input is available on the web version.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Alert.alert('Not Supported', 'Speech recognition is not supported in this browser. Try Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, startListening, stopListening, setTranscript };
}

// ─── Unified System Prompt Builder ──────────────────────────────────────────

const buildSystemPrompt = (
  companyName: string,
  city: string,
  state: string,
  services: string,
  radius: number,
  snapshot: BusinessSnapshot | null,
  ownerName: string,
  recentContextSummary?: string,
) => `You are the Chief Growth Officer at Canopy — a world-class marketing and advertising agency that has scaled over 500 home service companies from $0 to $10M+ in annual revenue. You specialize in tree service, landscaping, and outdoor service companies.

Your name is Canopy AI. You speak directly to ${ownerName}, the owner of ${companyName} in ${city}, ${state}.

EXPERTISE — you are an expert in ALL of these areas simultaneously:

STRATEGY & GROWTH:
- Overall business growth strategy, market positioning, competitive analysis, 30/60/90-day plans
- Specific budget allocations and ROI projections
- Seasonal strategy — storm chasing, spring/fall campaigns, slow season pivots
- Pricing & packaging — how to increase average ticket size

ADVERTISING:
- Google Ads (Search, LSA, Performance Max) for tree service — exact CPCs, conversion rates, budget allocations
- Facebook/Instagram lead generation ads — creative formulas that work for tree service
- TikTok organic & paid — video formats that go viral for tree crews
- Ad copy, targeting settings, budgets, and expected metrics with real CPC and CPL benchmarks

CONTENT & SOCIAL MEDIA:
- TikTok, Instagram Reels, YouTube Shorts, Facebook posts
- Exact scripts, hooks, shot lists, posting schedules, and hashtags
- What performs well for tree service companies specifically

SALES & LEAD MANAGEMENT:
- Speed to lead, follow-up sequences, objection handling, pricing strategies
- Upselling, close rate optimization
- Exact scripts and message templates for every scenario

EMERGENCY & STORM RESPONSE:
- Emergency/storm response marketing — capturing emergency leads, rapid ad deployment
- Storm chasing strategy, 24-hour action plans, capitalizing on weather events

REPUTATION & SEO:
- SEO & Google Business Profile optimization — every ranking factor
- Review generation, response strategies, reputation management

COMPANY CONTEXT:
- Company: ${companyName}
- Location: ${city}, ${state}
- Services: ${services}
- Service radius: ${radius} miles
${snapshot ? `
LIVE BUSINESS DATA (use this to give specific advice):
- Leads this week: ${snapshot.leadsThisWeek} | Today: ${snapshot.leadsToday}
- Active ad campaigns: ${snapshot.activeCampaigns}
- Ad spend this week: $${snapshot.adSpendThisWeek.toFixed(0)}
- Avg cost per lead: ${snapshot.avgCostPerLead ? '$' + snapshot.avgCostPerLead.toFixed(0) : 'N/A'}
- Open jobs: ${snapshot.openJobs}
- Google reviews: ${snapshot.reviewCount} | Avg rating: ${snapshot.avgRating?.toFixed(1) ?? 'N/A'}
- Revenue this week: $${snapshot.weekRevenue.toFixed(0)}
- Top lead source: ${snapshot.topLeadSource ?? 'N/A'}
` : ''}
${recentContextSummary ? `
RECENT CONVERSATION CONTEXT (from the past 10 days):
${recentContextSummary}
` : ''}
RULES:
1. Be direct, specific, and actionable. No fluff. Every answer should include a concrete next step.
2. Reference their actual data when giving advice. Don't be generic.
3. When recommending ad spend, give exact budget breakdowns with expected ROI.
4. When recommending content, give the exact hook, script, or copy — not vague advice.
5. Think like a partner who has skin in the game. Your success = their success.
6. Use real industry benchmarks: tree service Google Ads CPC ($15-45), LSA cost per lead ($25-75), Facebook lead ads ($8-25/lead), avg close rate 25-35%.
7. Be concise — busy owners read on their phone between jobs. Use bullet points.
8. If they ask something outside marketing/business, briefly answer but redirect to growth.
9. After your response, suggest 2-3 specific follow-up questions the user might want to ask. Format them on the LAST line as: SUGGESTIONS: ["question 1", "question 2", "question 3"]`;

// ─── Typing Indicator Component ──────────────────────────────────────────────

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.aiBubbleAvatar}>
        <Text style={{ fontSize: 14 }}>🧠</Text>
      </View>
      <View style={styles.typingDots}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot, transform: [{ scale: dot }] }]} />
        ))}
      </View>
    </View>
  );
}

// ─── Inline Result Cards ─────────────────────────────────────────────────────

function AdCopyCard({ data }: { data: Array<{ headline: string; description: string; callToAction: string; variant: number }> }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>✍️</Text>
        <Text style={styles.resultCardTitle}>Ad Copy Variations</Text>
      </View>
      {data.map((ad, i) => (
        <View key={i} style={styles.adVariant}>
          <Text style={styles.adVariantLabel}>Variation {ad.variant} — {ad.variant === 1 ? 'Urgency' : ad.variant === 2 ? 'Social Proof' : 'Price Transparency'}</Text>
          <Text style={styles.adHeadline}>{ad.headline}</Text>
          <Text style={styles.adDescription}>{ad.description}</Text>
          <View style={styles.adCtaRow}>
            <View style={styles.adCtaBadge}>
              <Text style={styles.adCtaText}>{ad.callToAction}</Text>
            </View>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => {
                const text = `${ad.headline}\n${ad.description}\n${ad.callToAction}`;
                Clipboard.setStringAsync(text);
                crossAlert('Copied', 'Ad copy copied to clipboard');
              }}
            >
              <Text style={styles.copyBtnText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

function VideoScriptCard({ data }: { data: { hook: string; script: string; shotList: string[]; hashtags: string[]; caption: string } }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>🎬</Text>
        <Text style={styles.resultCardTitle}>Video Script</Text>
      </View>
      <View style={styles.scriptSection}>
        <Text style={styles.scriptLabel}>HOOK (First 3 seconds)</Text>
        <Text style={styles.scriptHook}>"{data.hook}"</Text>
      </View>
      <View style={styles.scriptSection}>
        <Text style={styles.scriptLabel}>FULL SCRIPT</Text>
        <Text style={styles.scriptBody}>{data.script}</Text>
      </View>
      <View style={styles.scriptSection}>
        <Text style={styles.scriptLabel}>SHOT LIST</Text>
        {data.shotList.map((shot, i) => (
          <Text key={i} style={styles.shotItem}>{i + 1}. {shot}</Text>
        ))}
      </View>
      <View style={styles.scriptSection}>
        <Text style={styles.scriptLabel}>CAPTION</Text>
        <Text style={styles.scriptBody}>{data.caption}</Text>
      </View>
      <View style={styles.hashtagRow}>
        {data.hashtags.map((tag, i) => (
          <View key={i} style={styles.hashtagBadge}>
            <Text style={styles.hashtagText}>{tag}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={styles.fullCopyBtn}
        onPress={() => {
          const text = `HOOK: ${data.hook}\n\nSCRIPT:\n${data.script}\n\nSHOT LIST:\n${data.shotList.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nCAPTION: ${data.caption}\n\n${data.hashtags.join(' ')}`;
          Clipboard.setStringAsync(text);
          crossAlert('Copied', 'Full video script copied to clipboard');
        }}
      >
        <Text style={styles.fullCopyBtnText}>Copy Full Script</Text>
      </TouchableOpacity>
    </View>
  );
}

function LeadScoresCard({ data }: { data: Array<{ name: string; score: number; reasoning: string; followUpMessage: string }> }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>🏷️</Text>
        <Text style={styles.resultCardTitle}>Lead Scores</Text>
      </View>
      {data.map((lead, i) => (
        <View key={i} style={styles.leadScoreItem}>
          <View style={styles.leadScoreHeader}>
            <Text style={styles.leadName}>{lead.name}</Text>
            <View style={[styles.scoreBadge, { backgroundColor: lead.score >= 7 ? Colors.success : lead.score >= 4 ? Colors.warning : Colors.danger }]}>
              <Text style={styles.scoreText}>{lead.score}/10</Text>
            </View>
          </View>
          <Text style={styles.leadReasoning}>{lead.reasoning}</Text>
          <View style={styles.followUpBox}>
            <Text style={styles.followUpLabel}>Suggested follow-up:</Text>
            <Text style={styles.followUpText}>{lead.followUpMessage}</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => {
                Clipboard.setStringAsync(lead.followUpMessage);
                crossAlert('Copied', 'Follow-up message copied');
              }}
            >
              <Text style={styles.copyBtnText}>Copy Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

function ReviewResponseCard({ data }: { data: { reviewerName: string; rating: number; body: string; response: string } }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>⭐</Text>
        <Text style={styles.resultCardTitle}>Review Response</Text>
      </View>
      <View style={styles.reviewOriginal}>
        <Text style={styles.reviewerName}>{data.reviewerName} — {'⭐'.repeat(data.rating)}</Text>
        <Text style={styles.reviewBody}>"{data.body}"</Text>
      </View>
      <View style={styles.reviewResponseBox}>
        <Text style={styles.reviewResponseLabel}>Your Response:</Text>
        <Text style={styles.reviewResponseText}>{data.response}</Text>
      </View>
      <TouchableOpacity
        style={styles.fullCopyBtn}
        onPress={() => {
          Clipboard.setStringAsync(data.response);
          crossAlert('Copied', 'Review response copied to clipboard');
        }}
      >
        <Text style={styles.fullCopyBtnText}>Copy Response</Text>
      </TouchableOpacity>
    </View>
  );
}

function ContentCalendarCard({ data }: { data: Array<{ day: number; videoType: string; hook: string; platform: string }> }) {
  const platformColors: Record<string, string> = {
    tiktok: '#FF0050',
    instagram: '#E1306C',
    youtube: '#FF0000',
    facebook: '#1877F2',
  };

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>📅</Text>
        <Text style={styles.resultCardTitle}>30-Day Content Calendar</Text>
      </View>
      {data.map((post, i) => (
        <View key={i} style={styles.calendarItem}>
          <View style={styles.calendarDay}>
            <Text style={styles.calendarDayText}>Day {post.day}</Text>
          </View>
          <View style={styles.calendarContent}>
            <View style={styles.calendarTopRow}>
              <View style={[styles.platformBadge, { backgroundColor: platformColors[post.platform] ?? Colors.ai }]}>
                <Text style={styles.platformText}>{post.platform}</Text>
              </View>
              <Text style={styles.videoTypeText}>{post.videoType.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.calendarHook}>"{post.hook}"</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity
        style={styles.fullCopyBtn}
        onPress={() => {
          const text = data.map(p => `Day ${p.day} [${p.platform}] ${p.videoType}: "${p.hook}"`).join('\n');
          Clipboard.setStringAsync(text);
          crossAlert('Copied', 'Content calendar copied to clipboard');
        }}
      >
        <Text style={styles.fullCopyBtnText}>Copy Calendar</Text>
      </TouchableOpacity>
    </View>
  );
}

function MarketStrategyCard({ data }: { data: any[] }) {
  // Safely convert each point to a string — AI sometimes returns objects instead of strings
  const safePoints: string[] = (data ?? []).map(point => {
    if (typeof point === 'string') return point;
    if (point && typeof point === 'object') {
      // Handle objects like {"🎯 Local SEO Push": "description"}
      const keys = Object.keys(point);
      return keys.map(k => `${k}: ${point[k]}`).join(' — ');
    }
    return String(point ?? '');
  });

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardHeader}>
        <Text style={styles.resultCardIcon}>📊</Text>
        <Text style={styles.resultCardTitle}>30-Day Market Strategy</Text>
      </View>
      {safePoints.map((point, i) => (
        <View key={i} style={styles.strategyItem}>
          <Text style={styles.strategyText}>{point}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={styles.fullCopyBtn}
        onPress={() => {
          Clipboard.setStringAsync(safePoints.join('\n\n'));
          crossAlert('Copied', 'Strategy copied to clipboard');
        }}
      >
        <Text style={styles.fullCopyBtnText}>Copy Strategy</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Day Separator Component ─────────────────────────────────────────────────

function DaySeparator({ date }: { date: string }) {
  // Use state to avoid hydration mismatch with date-dependent labels
  const [label, setLabel] = useState('');

  useEffect(() => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      setLabel('Today');
    } else if (d.toDateString() === yesterday.toDateString()) {
      setLabel('Yesterday');
    } else {
      setLabel(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    }
  }, [date]);

  if (!label) return null;

  return (
    <View style={styles.daySeparator}>
      <View style={styles.daySeparatorLine} />
      <Text style={styles.daySeparatorText}>{label}</Text>
      <View style={styles.daySeparatorLine} />
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AIExpertScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recentContext, setRecentContext] = useState<string>('');
  const [actionsCollapsed, setActionsCollapsed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { company, profile } = useAuthStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoiceInput();

  // When transcript changes, append to input
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Entrance animation
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // ─── Business Snapshot ───────────────────────────────────────────────

  const fetchSnapshot = useCallback(async () => {
    if (!company) return;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    try {
      const [leadsToday, leadsWeek, campaigns, jobs, reviews, invoices, leadSources] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', today.toISOString()),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', weekAgo.toISOString()),
        supabase.from('campaigns').select('id, spend_total, status').eq('company_id', company.id).eq('status', 'active'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', company.id).in('status', ['booked', 'in_progress']),
        supabase.from('reviews').select('rating').eq('company_id', company.id),
        supabase.from('invoices').select('amount').eq('company_id', company.id).eq('status', 'paid').gte('paid_at', weekAgo.toISOString()),
        supabase.from('leads').select('source').eq('company_id', company.id).gte('created_at', weekAgo.toISOString()),
      ]);

      const adSpend = (campaigns.data ?? []).reduce((s, c) => s + (c.spend_total ?? 0), 0);
      const leadsCount = leadsWeek.count ?? 0;
      const reviewData = reviews.data ?? [];
      const avgRating = reviewData.length > 0 ? reviewData.reduce((s, r) => s + r.rating, 0) / reviewData.length : null;
      const revenue = (invoices.data ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);

      const sources = (leadSources.data ?? []).reduce((acc: Record<string, number>, l) => {
        const src = l.source ?? 'unknown';
        acc[src] = (acc[src] ?? 0) + 1;
        return acc;
      }, {});
      const topSource = Object.entries(sources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      setSnapshot({
        leadsThisWeek: leadsCount,
        leadsToday: leadsToday.count ?? 0,
        activeCampaigns: (campaigns.data ?? []).length,
        adSpendThisWeek: adSpend,
        avgCostPerLead: leadsCount > 0 && adSpend > 0 ? adSpend / leadsCount : null,
        openJobs: jobs.count ?? 0,
        reviewCount: reviewData.length,
        avgRating,
        weekRevenue: revenue,
        topLeadSource: topSource,
      });
    } catch {
      // AI will work without snapshot
    }
  }, [company]);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  // ─── 10-Day Conversation Memory ────────────────────────────────────────

  const loadConversationHistory = useCallback(async () => {
    if (!company) return;
    try {
      // Load conversations from last 10 days
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const { data } = await supabase
        .from('ai_conversations')
        .select('id, messages, created_at, updated_at')
        .eq('company_id', company.id)
        .gte('updated_at', tenDaysAgo.toISOString())
        .order('updated_at', { ascending: false });

      if (!data || data.length === 0) return;

      // Collect all messages from all conversations, sorted by timestamp
      const allMessages: (Message & { conversationDate: string })[] = [];
      const seenIds = new Set<string>();

      for (const convo of data) {
        if (!convo.messages || !Array.isArray(convo.messages)) continue;
        for (const msg of convo.messages as Message[]) {
          if (msg.id && !seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            allMessages.push({
              ...msg,
              conversationDate: convo.updated_at || convo.created_at,
            });
          }
        }
      }

      // Sort by timestamp
      allMessages.sort((a, b) => a.timestamp - b.timestamp);

      // Load the most recent conversation as the active chat
      const latestConvo = data[0];
      if (latestConvo && latestConvo.messages && Array.isArray(latestConvo.messages) && latestConvo.messages.length > 0) {
        // Check if it was updated today — if so, continue it
        const latestDate = new Date(latestConvo.updated_at);
        const today = new Date();
        const isToday = latestDate.toDateString() === today.toDateString();

        if (isToday) {
          setConversationId(latestConvo.id);
          setMessages(latestConvo.messages as Message[]);
        }
      }

      // Build a context summary from the last ~20 messages across all conversations
      const contextMessages = allMessages.slice(-20);
      if (contextMessages.length > 0) {
        const summary = contextMessages
          .map(m => `[${m.role === 'user' ? 'User' : 'AI'}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`)
          .join('\n');
        setRecentContext(summary);
      }

      // Auto-prune conversations older than 10 days
      pruneOldConversations();
    } catch {
      // No previous conversation — start fresh
    }
  }, [company]);

  const pruneOldConversations = useCallback(async () => {
    if (!company) return;
    try {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      await supabase
        .from('ai_conversations')
        .delete()
        .eq('company_id', company.id)
        .lt('updated_at', tenDaysAgo.toISOString());
    } catch {
      // Silent — cleanup is best-effort
    }
  }, [company]);

  useEffect(() => { loadConversationHistory(); }, [loadConversationHistory]);

  const saveConversation = useCallback(async (msgs: Message[]) => {
    if (!company || msgs.length === 0) return;
    try {
      if (conversationId) {
        await supabase
          .from('ai_conversations')
          .update({ messages: msgs as any, mode: 'unified', updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      } else {
        const { data } = await supabase
          .from('ai_conversations')
          .insert({
            company_id: company.id,
            messages: msgs as any,
            mode: 'unified',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (data) setConversationId(data.id);
      }
    } catch {
      // Silently fail — conversation still works without persistence
    }
  }, [company, conversationId]);

  // ─── Company Context for AI Functions ─────────────────────────────────

  const getCompanyContext = useCallback(() => ({
    name: company?.name ?? 'your tree service',
    city: company?.city ?? '',
    state: company?.state ?? '',
    services: Array.isArray(company?.services_offered) ? company.services_offered : ['tree removal', 'trimming', 'stump grinding'],
    radiusMiles: company?.service_radius_miles ?? 25,
  }), [company]);

  // ─── Parse Suggestions from AI Response ───────────────────────────────

  const parseSuggestions = (text: string): { cleanText: string; suggestions: string[] } => {
    const suggestionsMatch = text.match(/SUGGESTIONS:\s*\[([^\]]+)\]/);
    if (!suggestionsMatch) return { cleanText: text, suggestions: [] };

    const cleanText = text.replace(/SUGGESTIONS:\s*\[([^\]]+)\]/, '').trim();
    try {
      const parsed = JSON.parse(`[${suggestionsMatch[1]}]`);
      return { cleanText, suggestions: parsed.filter((s: any) => typeof s === 'string') };
    } catch {
      return { cleanText, suggestions: [] };
    }
  };

  // ─── Unified System Prompt ─────────────────────────────────────────────

  const getSystemPrompt = useCallback(() => {
    return buildSystemPrompt(
      company?.name ?? 'your tree service',
      company?.city ?? '',
      company?.state ?? '',
      Array.isArray(company?.services_offered) ? company.services_offered.join(', ') : 'tree removal, trimming, stump grinding',
      company?.service_radius_miles ?? 25,
      snapshot,
      profile?.name?.split(' ')[0] ?? 'Boss',
      recentContext || undefined,
    );
  }, [company, snapshot, profile, recentContext]);

  // ─── Build AI Messages with Context ────────────────────────────────────

  const buildAIMessages = useCallback((currentMessages: Message[]) => {
    // Use last ~20 messages from current conversation as direct history
    const recentMsgs = currentMessages.slice(-20);
    const history = recentMsgs.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    return [{ role: 'system' as const, content: getSystemPrompt() }, ...history];
  }, [getSystemPrompt]);

  // ─── Quick Action Handlers ─────────────────────────────────────────────

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleActionAdCopy = async () => {
    if (!isAIConfigured()) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'AI is not configured yet. Go to Settings and enter your OpenRouter API key. Get one free at openrouter.ai', timestamp: Date.now() }]);
      return;
    }
    setLoading(true);
    const ctx = getCompanyContext();
    const service = ctx.services[0] ?? 'tree removal';

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Generate 3 ad copy variations for ${service} in ${ctx.city}.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const [v1, v2, v3] = await Promise.all([
        generateAdCopy(ctx, 'google_search', service, 1),
        generateAdCopy(ctx, 'facebook_image', service, 2),
        generateAdCopy(ctx, 'facebook_video', service, 3),
      ]);

      const actionData = [
        { ...v1, variant: 1 },
        { ...v2, variant: 2 },
        { ...v3, variant: 3 },
      ];

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Here are 3 ad copy variations for ${service} in ${ctx.city}. Each uses a different formula — urgency, social proof, and price transparency. Copy the ones you like and launch them today.`,
        timestamp: Date.now(),
        actionType: 'ad_copy',
        actionData,
        suggestions: [
          `Write Facebook ad copy for stump grinding`,
          `What budget should I set for these ads?`,
          `Write a Google LSA description`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error generating ad copy: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleActionVideoScript = async () => {
    if (!isAIConfigured()) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'AI is not configured yet. Go to Settings and enter your OpenRouter API key. You can get one free at openrouter.ai',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
      return;
    }

    setLoading(true);
    const ctx = getCompanyContext();

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Draft a viral video script for ${ctx.name}.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const script = await generateVideoScript(ctx, 'before_after_transformation', {
        what: 'large tree removal',
        where: ctx.city,
        duration: 'medium',
      });

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Here is your video script. Film this on your next big job — before/after transformations get 10x more views than static posts on TikTok and Instagram Reels.`,
        timestamp: Date.now(),
        actionType: 'video_script',
        actionData: script,
        suggestions: [
          `Write a script for a day-in-the-life video`,
          `What time should I post this?`,
          `Give me 5 more hook ideas`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error generating video script: ${e.message}\n\nMake sure your OpenRouter API key is valid in Settings.`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleActionLeadScores = async () => {
    if (!company) return;
    setLoading(true);

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Score my recent leads and suggest follow-ups.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, service, notes, source, created_at')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!leads || leads.length === 0) {
        const noLeadsMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: `No leads found in your pipeline yet. Once leads start coming in from your ads, website, or phone calls, I'll score each one and tell you exactly who to call first and what to say. In the meantime, let's work on getting leads flowing.`,
          timestamp: Date.now(),
          suggestions: [
            `How do I get my first 10 leads?`,
            `Set up a Facebook lead ad`,
            `What should my Google Ads budget be?`,
          ],
        };
        setMessages(prev => [...prev, noLeadsMsg]);
        setLoading(false);
        return;
      }

      const ctx = getCompanyContext();
      const scored = await Promise.all(
        leads.map(lead =>
          scoreAndSuggestFollowUp(ctx, {
            name: lead.name ?? 'Unknown',
            service: lead.service,
            notes: lead.notes,
            source: lead.source,
            createdAt: lead.created_at,
          }).then(result => ({ name: lead.name ?? 'Unknown', ...result }))
        )
      );

      scored.sort((a, b) => b.score - a.score);

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `I scored your ${scored.length} most recent leads. Call the highest-scored ones first — they have the most revenue potential. I've written a custom follow-up message for each.`,
        timestamp: Date.now(),
        actionType: 'lead_scores',
        actionData: scored,
        suggestions: [
          `Write a follow-up sequence for cold leads`,
          `How fast should I respond to new leads?`,
          `What's a good close rate for tree service?`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error scoring leads: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleActionReviewResponse = async () => {
    if (!company) return;
    setLoading(true);

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Draft a response to my latest review.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const { data: reviews } = await supabase
        .from('reviews')
        .select('id, reviewer_name, rating, body, responded_at')
        .eq('company_id', company.id)
        .is('responded_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!reviews || reviews.length === 0) {
        const noReviewMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: `All your reviews have been responded to — great job staying on top of reputation management! Keep requesting reviews after every completed job. Aim for 5+ new reviews per month to maintain strong Google Maps visibility${company.city ? ` in ${company.city}` : ''}.`,
          timestamp: Date.now(),
          suggestions: [
            `Write a review request text template`,
            `How do I get more 5-star reviews?`,
            `What do I say to a negative review?`,
          ],
        };
        setMessages(prev => [...prev, noReviewMsg]);
        setLoading(false);
        return;
      }

      const review = reviews[0];
      const ctx = getCompanyContext();
      const response = await draftReviewResponse(ctx, {
        rating: review.rating,
        body: review.body ?? '',
        reviewerName: review.reviewer_name ?? 'Customer',
      });

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Here's a professional response to your latest review. Copy it and post it on Google — responding within 24 hours shows potential customers you care.`,
        timestamp: Date.now(),
        actionType: 'review_response',
        actionData: {
          reviewerName: review.reviewer_name ?? 'Customer',
          rating: review.rating,
          body: review.body ?? '',
          response,
        },
        suggestions: [
          `Write responses for all my unresponded reviews`,
          `How do I handle a 1-star review?`,
          `Set up automated review requests`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error drafting review response: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleActionContentCalendar = async () => {
    if (!isAIConfigured()) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'AI is not configured yet. Go to Settings and enter your OpenRouter API key. Get one free at openrouter.ai', timestamp: Date.now() }]);
      return;
    }
    setLoading(true);
    const ctx = getCompanyContext();
    const month = new Date().getMonth();
    const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'fall' : 'winter';

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Generate a 30-day ${season} content calendar for ${ctx.name}.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const calendar = await generate30DayCalendar(ctx, season);

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Here's your 30-day ${season} content calendar. These are the highest-impact post types for tree service companies this time of year. Film at least 3 per week to build momentum.`,
        timestamp: Date.now(),
        actionType: 'content_calendar',
        actionData: calendar,
        suggestions: [
          `Write the full script for Day 1`,
          `What equipment do I need to film?`,
          `Best times to post on TikTok?`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error generating content calendar: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleActionMarketStrategy = async () => {
    if (!isAIConfigured()) {
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: 'AI is not configured yet. Go to Settings and enter your OpenRouter API key. Get one free at openrouter.ai', timestamp: Date.now() }]);
      return;
    }
    setLoading(true);
    const ctx = getCompanyContext();

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: `Build a 30-day market strategy for ${ctx.name} in ${ctx.city}, ${ctx.state}.`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const strategy = await generateMarketStrategy(ctx);

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Here's your custom 30-day market domination strategy. Execute these in order — each one builds on the last. Come back next week and I'll track your progress.`,
        timestamp: Date.now(),
        actionType: 'market_strategy',
        actionData: strategy,
        suggestions: [
          `Break down step 1 in more detail`,
          `What budget do I need for this plan?`,
          `Adjust this for a $1,000/month budget`,
        ],
      };

      setMessages(prev => {
        const newMsgs = [...prev, aiMsg];
        saveConversation(newMsgs);
        return newMsgs;
      });
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error generating market strategy: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.type === 'chat' && action.prompt) {
      send(action.prompt);
      return;
    }

    switch (action.actionId) {
      case 'ad_copy':
      case 'emergency_ad_copy':
        handleActionAdCopy();
        break;
      case 'video_script':
        handleActionVideoScript();
        break;
      case 'lead_scores':
        handleActionLeadScores();
        break;
      case 'review_response':
        handleActionReviewResponse();
        break;
      case 'content_calendar':
        handleActionContentCalendar();
        break;
      case 'market_strategy':
        handleActionMarketStrategy();
        break;
    }
  };

  // ─── Chat Send ─────────────────────────────────────────────────────────

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    // Stop voice if listening
    if (isListening) stopListening();
    setTranscript('');

    if (!isAIConfigured()) {
      const errMsgs: Message[] = [
        { id: generateId(), role: 'user', content: msg, timestamp: Date.now() },
        { id: generateId(), role: 'assistant', content: 'AI not configured. Add your OpenRouter API key in settings to enable your AI growth advisor.', timestamp: Date.now() },
      ];
      setMessages(prev => [...prev, ...errMsgs]);
      setInput('');
      return;
    }

    const userMsg: Message = { id: generateId(), role: 'user', content: msg, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const aiMessages = buildAIMessages(updatedMessages);
      const reply = await aiChat(
        aiMessages,
        { model: 'claude', maxTokens: 1500, temperature: 0.7 }
      );

      const { cleanText, suggestions } = parseSuggestions(reply);

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: cleanText,
        timestamp: Date.now(),
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };

      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);
      saveConversation(finalMessages);
    } catch (e: any) {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Error: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  // ─── Message Actions ───────────────────────────────────────────────────

  const handleMessagePress = (msg: Message) => {
    if (msg.role === 'assistant') {
      crossAlert(
        'Message Actions',
        '',
        [
          {
            text: 'Copy Text',
            onPress: () => {
              Clipboard.setStringAsync(msg.content);
              crossAlert('Copied', 'Message copied to clipboard');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  // ─── Clear Chat ────────────────────────────────────────────────────────

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
    fetchSnapshot();
  };

  // ─── Toggle Context Panel ──────────────────────────────────────────────

  const toggleContext = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setContextExpanded(!contextExpanded);
  };

  // ─── Toggle Actions Panel ──────────────────────────────────────────────

  const toggleActions = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActionsCollapsed(!actionsCollapsed);
  };

  // ─── Render Action Data ────────────────────────────────────────────────

  const renderActionData = (msg: Message) => {
    if (!msg.actionType || !msg.actionData) return null;

    try {
      switch (msg.actionType) {
        case 'ad_copy':
          return <AdCopyCard data={msg.actionData} />;
        case 'video_script':
          return <VideoScriptCard data={msg.actionData} />;
        case 'lead_scores':
          return <LeadScoresCard data={msg.actionData} />;
        case 'review_response':
          return <ReviewResponseCard data={msg.actionData} />;
        case 'content_calendar':
          return <ContentCalendarCard data={msg.actionData} />;
        case 'market_strategy':
          return <MarketStrategyCard data={msg.actionData} />;
        default:
          return null;
      }
    } catch {
      // If action data can't be rendered (e.g., malformed stored data), skip it
      return null;
    }
  };

  // ─── Group Messages by Day ─────────────────────────────────────────────

  const getMessageGroups = () => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: new Date(msg.timestamp).toISOString(), messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        {/* Header */}
        <LinearGradient
          colors={['#7C3AED', '#6D28D9', '#5B21B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.aiAvatar}>
                <Text style={styles.aiAvatarText}>🧠</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Canopy AI</Text>
                <Text style={styles.headerSub}>
                  Your Growth Expert
                </Text>
              </View>
            </View>
            {messages.length > 0 && (
              <TouchableOpacity onPress={clearChat} style={styles.clearBtn} activeOpacity={0.7}>
                <Text style={styles.clearBtnText}>New Chat</Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        {/* Context Panel */}
        {snapshot && (
          <TouchableOpacity
            style={styles.contextBar}
            onPress={toggleContext}
            activeOpacity={0.8}
          >
            <View style={styles.contextBarHeader}>
              <Text style={styles.contextBarTitle}>
                {contextExpanded ? '📊 What I Know About Your Business' : '📊 Business Context'}
              </Text>
              <Text style={styles.contextBarToggle}>{contextExpanded ? '▲' : '▼'}</Text>
            </View>
            {!contextExpanded && (
              <View style={styles.contextBarMini}>
                <Text style={styles.contextMiniText}>{snapshot.leadsThisWeek} leads</Text>
                <Text style={styles.contextMiniDot}>·</Text>
                <Text style={styles.contextMiniText}>${snapshot.adSpendThisWeek.toFixed(0)} spend</Text>
                <Text style={styles.contextMiniDot}>·</Text>
                <Text style={styles.contextMiniText}>{snapshot.reviewCount} reviews</Text>
                <Text style={styles.contextMiniDot}>·</Text>
                <Text style={styles.contextMiniText}>${snapshot.weekRevenue.toFixed(0)} rev</Text>
              </View>
            )}
            {contextExpanded && (
              <View style={styles.contextExpanded}>
                <View style={styles.contextGrid}>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.leadsThisWeek}</Text>
                    <Text style={styles.contextLabel}>Leads / Week</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.leadsToday}</Text>
                    <Text style={styles.contextLabel}>Leads Today</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>${snapshot.adSpendThisWeek.toFixed(0)}</Text>
                    <Text style={styles.contextLabel}>Ad Spend</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.avgCostPerLead ? '$' + snapshot.avgCostPerLead.toFixed(0) : '—'}</Text>
                    <Text style={styles.contextLabel}>Cost / Lead</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.activeCampaigns}</Text>
                    <Text style={styles.contextLabel}>Active Ads</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.openJobs}</Text>
                    <Text style={styles.contextLabel}>Open Jobs</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.reviewCount}</Text>
                    <Text style={styles.contextLabel}>Reviews</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.avgRating?.toFixed(1) ?? '—'}</Text>
                    <Text style={styles.contextLabel}>Avg Rating</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>${snapshot.weekRevenue.toFixed(0)}</Text>
                    <Text style={styles.contextLabel}>Revenue / Wk</Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextValue}>{snapshot.topLeadSource ?? '—'}</Text>
                    <Text style={styles.contextLabel}>Top Source</Text>
                  </View>
                </View>
                <Text style={styles.contextNote}>
                  This data is live from your Canopy account. The AI references it in every response.
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.welcome}>
              <View style={styles.welcomeHeader}>
                <Text style={styles.welcomeTitle}>
                  Hey {profile?.name?.split(' ')[0] ?? 'there'}
                </Text>
                <Text style={styles.welcomeSubtitle}>
                  I'm your all-in-one growth expert — strategy, ads, content, sales, and emergency response. Ask me anything or use a quick action below.
                </Text>
              </View>

              {/* Quick Actions */}
              <Text style={styles.quickTitle}>
                Quick Actions
              </Text>
              <View style={styles.quickGrid}>
                {QUICK_ACTIONS.map(action => (
                  <TouchableOpacity
                    key={action.label}
                    style={[
                      styles.quickCard,
                      action.type === 'action' && styles.quickCardAction,
                    ]}
                    onPress={() => handleQuickAction(action)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickCardEmoji}>{action.icon}</Text>
                    <View style={styles.quickCardBody}>
                      <Text style={styles.quickCardLabel}>{action.label}</Text>
                      {action.type === 'action' && (
                        <Text style={styles.quickCardBadge}>AI Action</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <>
              {/* Collapsible quick actions when chat has messages */}
              <TouchableOpacity onPress={toggleActions} style={styles.actionsToggle} activeOpacity={0.7}>
                <Text style={styles.actionsToggleText}>
                  {actionsCollapsed ? 'Show Quick Actions ▼' : 'Hide Quick Actions ▲'}
                </Text>
              </TouchableOpacity>

              {!actionsCollapsed && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.actionsScrollRow}
                  style={styles.actionsScroll}
                >
                  {QUICK_ACTIONS.map(action => (
                    <TouchableOpacity
                      key={action.label}
                      style={styles.quickChip}
                      onPress={() => handleQuickAction(action)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipEmoji}>{action.icon}</Text>
                      <Text style={styles.quickChipLabel}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Messages grouped by day */}
              {getMessageGroups().map((group, gi) => (
                <View key={gi}>
                  <DaySeparator date={group.date} />
                  {group.messages.map((msg) => (
                    <TouchableOpacity
                      key={msg.id}
                      activeOpacity={0.8}
                      onLongPress={() => handleMessagePress(msg)}
                      onPress={() => msg.role === 'assistant' ? handleMessagePress(msg) : undefined}
                    >
                      <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                        {msg.role === 'assistant' && (
                          <View style={styles.aiBubbleAvatar}>
                            <Text style={{ fontSize: 14 }}>🧠</Text>
                          </View>
                        )}
                        <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userBubbleText : styles.aiBubbleText]}>
                          {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                        </Text>
                        {msg.role === 'assistant' && Platform.OS === 'web' && (
                          <TouchableOpacity
                            style={styles.ttsBtn}
                            onPress={() => {
                              if (speakingMsgId === msg.id) {
                                stopTTS();
                                setSpeakingMsgId(null);
                              } else {
                                speak(msg.content);
                                setSpeakingMsgId(msg.id);
                                // Check periodically if TTS finished
                                const check = setInterval(() => {
                                  if (!isSpeaking()) {
                                    setSpeakingMsgId(null);
                                    clearInterval(check);
                                  }
                                }, 500);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.ttsBtnText}>
                              {speakingMsgId === msg.id ? '⏹' : '🔊'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Inline Action Data Cards */}
                      <ActionCardErrorBoundary>
                        {renderActionData(msg)}
                      </ActionCardErrorBoundary>

                      {/* Smart Suggestions */}
                      {msg.suggestions && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
                        <View style={styles.suggestionsRow}>
                          {msg.suggestions.map((suggestion, si) => {
                            const text = typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion);
                            return (
                              <TouchableOpacity
                                key={si}
                                style={styles.suggestionChip}
                                onPress={() => send(text)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.suggestionText}>{text}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {loading && <TypingIndicator />}
            </>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={[styles.micBtn, isListening && styles.micBtnActive]}
            onPress={isListening ? stopListening : startListening}
            activeOpacity={0.7}
          >
            <Text style={styles.micBtnText}>{isListening ? '🔴' : '🎙️'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={isListening ? 'Listening...' : 'Ask anything about growing your business...'}
            placeholderTextColor={Colors.textTertiary}
            multiline
            onSubmitEditing={() => send()}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  aiAvatarText: { fontSize: 22 },
  headerTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
  headerSub: { fontSize: Theme.font.size.small, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  clearBtnText: { fontSize: Theme.font.size.small, color: '#FFFFFF', fontWeight: Theme.font.weight.medium },

  // Context Panel
  contextBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  contextBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contextBarTitle: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.ai,
  },
  contextBarToggle: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  contextBarMini: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  contextMiniText: {
    fontSize: Theme.font.size.caption,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },
  contextMiniDot: {
    fontSize: 8,
    color: Colors.textTertiary,
  },
  contextExpanded: {
    marginTop: 12,
  },
  contextGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  contextItem: {
    width: '19%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contextValue: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
  },
  contextLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  contextNote: {
    fontSize: Theme.font.size.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Day separator
  daySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  daySeparatorText: {
    fontSize: Theme.font.size.caption,
    color: Colors.textTertiary,
    fontWeight: Theme.font.weight.medium,
  },

  // Actions toggle
  actionsToggle: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  actionsToggleText: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.medium,
  },
  actionsScroll: {
    marginBottom: 12,
  },
  actionsScrollRow: {
    gap: 8,
    paddingHorizontal: 4,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickChipEmoji: { fontSize: 14 },
  quickChipLabel: {
    fontSize: Theme.font.size.small,
    color: Colors.text,
    fontWeight: Theme.font.weight.medium,
  },

  // Messages area
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 24 },

  // Welcome
  welcome: { gap: 20 },
  welcomeHeader: { alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  welcomeTitle: {
    fontSize: Theme.font.size.headline,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  // Quick actions
  quickTitle: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.text,
    marginTop: 4,
  },
  quickGrid: { gap: 10 },
  quickCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickCardAction: {
    borderColor: Colors.ai,
    borderWidth: 1.5,
    backgroundColor: Colors.aiBg,
  },
  quickCardEmoji: { fontSize: 24 },
  quickCardBody: { flex: 1, gap: 2 },
  quickCardLabel: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    fontWeight: Theme.font.weight.semibold,
  },
  quickCardBadge: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.medium,
  },

  // Chat bubbles
  bubble: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    maxWidth: '88%',
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.ai,
    padding: 14,
    borderRadius: Theme.radius.xl,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: Theme.radius.xl,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiBubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.aiBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { fontSize: Theme.font.size.body, lineHeight: 22, flex: 1 },
  ttsBtn: { position: 'absolute' as const, top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  ttsBtnText: { fontSize: 14 },
  userBubbleText: { color: '#FFFFFF' },
  aiBubbleText: { color: Colors.text },

  // Typing indicator
  typingContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: Theme.radius.xl,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.ai,
  },

  // Smart Suggestions
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    marginTop: -4,
    paddingLeft: 36,
  },
  suggestionChip: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: '90%',
  },
  suggestionText: {
    fontSize: Theme.font.size.small,
    color: Colors.ai,
    fontWeight: Theme.font.weight.medium,
  },

  // Result Cards (shared)
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: 16,
    marginBottom: 16,
    marginLeft: 36,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: '88%',
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultCardIcon: { fontSize: 20 },
  resultCardTitle: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
  },

  // Ad copy card
  adVariant: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.lg,
    padding: 14,
    marginBottom: 10,
  },
  adVariantLabel: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.semibold,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  adHeadline: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  adDescription: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  adCtaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adCtaBadge: {
    backgroundColor: Colors.ai,
    borderRadius: Theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adCtaText: {
    fontSize: Theme.font.size.small,
    color: '#FFFFFF',
    fontWeight: Theme.font.weight.semibold,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  copyBtnText: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },

  // Video script card
  scriptSection: {
    marginBottom: 14,
  },
  scriptLabel: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  scriptHook: {
    fontSize: Theme.font.size.bodyLg,
    fontWeight: Theme.font.weight.bold,
    color: Colors.accent,
    fontStyle: 'italic',
  },
  scriptBody: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 22,
  },
  shotItem: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    paddingLeft: 8,
  },
  hashtagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  hashtagBadge: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hashtagText: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
  },
  fullCopyBtn: {
    backgroundColor: Colors.ai,
    borderRadius: Theme.radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  fullCopyBtnText: {
    fontSize: Theme.font.size.body,
    color: '#FFFFFF',
    fontWeight: Theme.font.weight.semibold,
  },

  // Lead scores card
  leadScoreItem: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.lg,
    padding: 14,
    marginBottom: 10,
  },
  leadScoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  leadName: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
  },
  scoreBadge: {
    borderRadius: Theme.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: {
    fontSize: Theme.font.size.small,
    color: '#FFFFFF',
    fontWeight: Theme.font.weight.bold,
  },
  leadReasoning: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  followUpBox: {
    backgroundColor: Colors.background,
    borderRadius: Theme.radius.md,
    padding: 10,
    gap: 6,
  },
  followUpLabel: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.semibold,
  },
  followUpText: {
    fontSize: Theme.font.size.small,
    color: Colors.text,
    lineHeight: 18,
  },

  // Review response card
  reviewOriginal: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.lg,
    padding: 12,
    marginBottom: 12,
  },
  reviewerName: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  reviewBody: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  reviewResponseBox: {
    padding: 12,
    marginBottom: 8,
  },
  reviewResponseLabel: {
    fontSize: Theme.font.size.caption,
    color: Colors.ai,
    fontWeight: Theme.font.weight.semibold,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  reviewResponseText: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 22,
  },

  // Content calendar card
  calendarItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  calendarDay: {
    backgroundColor: Colors.ai,
    borderRadius: Theme.radius.md,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  calendarDayText: {
    fontSize: Theme.font.size.caption,
    color: '#FFFFFF',
    fontWeight: Theme.font.weight.bold,
  },
  calendarContent: {
    flex: 1,
    gap: 4,
  },
  calendarTopRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  platformBadge: {
    borderRadius: Theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  platformText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: Theme.font.weight.bold,
    textTransform: 'uppercase',
  },
  videoTypeText: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
  },
  calendarHook: {
    fontSize: Theme.font.size.small,
    color: Colors.text,
    fontStyle: 'italic',
  },

  // Strategy card
  strategyItem: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.lg,
    padding: 14,
    marginBottom: 8,
  },
  strategyText: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 22,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'flex-end',
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  micBtnActive: {
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.danger,
  },
  micBtnText: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Theme.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.ai,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.ai,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: Theme.font.weight.bold },
});
