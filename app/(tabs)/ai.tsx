import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  TouchableOpacity, Animated,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { aiChat, isAIConfigured } from '@/lib/ai';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
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

const EXPERT_SYSTEM_PROMPT = (
  companyName: string,
  city: string,
  state: string,
  services: string,
  radius: number,
  snapshot: BusinessSnapshot | null,
  ownerName: string,
) => `You are the Chief Growth Officer at Canopy — a world-class marketing and advertising agency that has scaled over 500 home service companies from $0 to $10M+ in annual revenue. You specialize in tree service, landscaping, and outdoor service companies.

Your name is Canopy AI. You speak directly to ${ownerName}, the owner of ${companyName} in ${city}, ${state}.

EXPERTISE:
- Google Ads (Search, LSA, Performance Max) for tree service — you know exact CPCs, conversion rates, and budget allocations
- Facebook/Instagram lead generation ads — you know the creative formulas that work for tree service
- TikTok organic & paid — you know which video formats go viral for tree crews
- SEO & Google Business Profile optimization — you know every ranking factor
- Sales follow-up systems — speed-to-lead, SMS/call cadences, close rates
- Reputation management — review generation, response strategies
- Content marketing — what to post, when, and why
- Seasonal strategy — storm chasing, spring/fall campaigns, slow season pivots
- Pricing & packaging — how to increase average ticket size

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

RULES:
1. Be direct, specific, and actionable. No fluff. Every answer should include a concrete next step.
2. Reference their actual data when giving advice. Don't be generic.
3. When recommending ad spend, give exact budget breakdowns with expected ROI.
4. When recommending content, give the exact hook, script, or copy — not vague advice.
5. Think like a partner who has skin in the game. Your success = their success.
6. Use real industry benchmarks: tree service Google Ads CPC ($15-45), LSA cost per lead ($25-75), Facebook lead ads ($8-25/lead), avg close rate 25-35%.
7. Be concise — busy owners read on their phone between jobs. Use bullet points.
8. If they ask something outside marketing/business, briefly answer but redirect to growth.`;

const QUICK_ACTIONS = [
  { emoji: '🔥', label: 'Audit my ads', prompt: 'Look at my current ad campaigns and tell me what\'s working, what\'s not, and exactly what I should change this week to get more leads for less money.' },
  { emoji: '📞', label: 'Why no calls?', prompt: 'I\'m not getting enough phone calls. Based on my current data, diagnose the problem and give me 3 things I can fix TODAY to start getting more calls.' },
  { emoji: '📱', label: 'What to post', prompt: 'Give me 3 specific video ideas I should film this week with exact hooks, scripts, and which platform to post them on. Make them scroll-stoppers.' },
  { emoji: '⛈️', label: 'Storm plan', prompt: 'A big storm is coming to my area. Give me a complete storm response marketing plan — ads to launch, posts to make, follow-up sequences, and how to capture emergency leads before my competitors.' },
  { emoji: '💰', label: 'Double revenue', prompt: 'I want to double my revenue in the next 90 days. Based on my current numbers, build me a specific plan with exact budget allocations, campaign types, and weekly milestones.' },
  { emoji: '⭐', label: 'Get more reviews', prompt: 'I need more Google reviews fast. Give me a proven system I can start using after every single job this week. Include exact text message templates and timing.' },
  { emoji: '🎯', label: 'Ad budget plan', prompt: 'I have $2,000/month for advertising. Give me the exact breakdown of where every dollar should go — Google Ads, Facebook, TikTok, LSA — with expected leads from each channel.' },
  { emoji: '📈', label: 'Weekly game plan', prompt: 'Based on everything you can see about my business right now, give me my top 5 priorities for this week ranked by impact. Be brutally honest about what I\'m doing wrong.' },
];

export default function AIExpertScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { company, profile } = useAuthStore();
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse animation for thinking state
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0.4);
    }
  }, [loading]);

  // Fetch business snapshot for context
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

      // Find top lead source
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
    } catch (e) {
      // Silently fail — AI will work without snapshot
    }
  }, [company]);

  useEffect(() => { fetchSnapshot(); }, [fetchSnapshot]);

  const getSystemPrompt = () => {
    return EXPERT_SYSTEM_PROMPT(
      company?.name ?? 'a tree service company',
      company?.city ?? 'their city',
      company?.state ?? '',
      Array.isArray(company?.services_offered) ? company.services_offered.join(', ') : 'tree removal, trimming, stump grinding',
      company?.service_radius_miles ?? 25,
      snapshot,
      profile?.name?.split(' ')[0] ?? 'Boss',
    );
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    if (!isAIConfigured()) {
      setMessages(prev => [...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: '⚠️ AI not configured. Add your OpenRouter API key to enable your AI growth advisor.' },
      ]);
      setInput('');
      return;
    }

    const userMsg: Message = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const reply = await aiChat(
        [{ role: 'system', content: getSystemPrompt() }, ...history],
        { model: 'claude', maxTokens: 1200, temperature: 0.7 }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleQuickAction = (prompt: string) => {
    send(prompt);
  };

  const clearChat = () => {
    setMessages([]);
    fetchSnapshot(); // Refresh data on clear
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatar}>
            <Text style={styles.aiAvatarText}>🧠</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Canopy AI</Text>
            <Text style={styles.headerSub}>Your Growth Advisor</Text>
          </View>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clearChat} style={styles.clearBtn} activeOpacity={0.7}>
            <Text style={styles.clearBtnText}>New Chat</Text>
          </TouchableOpacity>
        )}
      </View>

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
              <Text style={styles.welcomeEmoji}>🧠</Text>
              <Text style={styles.welcomeTitle}>
                Hey {profile?.name?.split(' ')[0] ?? 'there'} 👋
              </Text>
              <Text style={styles.welcomeSubtitle}>
                I'm your dedicated growth advisor. I've helped scale 500+ tree service companies. Ask me anything — ads, leads, content, pricing, strategy.
              </Text>
            </View>

            {/* Live stats badge */}
            {snapshot && (
              <View style={styles.statsBadge}>
                <Text style={styles.statsBadgeTitle}>📊 Your Business Right Now</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{snapshot.leadsThisWeek}</Text>
                    <Text style={styles.statLabel}>Leads/wk</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>${snapshot.adSpendThisWeek.toFixed(0)}</Text>
                    <Text style={styles.statLabel}>Ad spend</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{snapshot.avgCostPerLead ? '$' + snapshot.avgCostPerLead.toFixed(0) : '—'}</Text>
                    <Text style={styles.statLabel}>CPL</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{snapshot.reviewCount}</Text>
                    <Text style={styles.statLabel}>Reviews</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Quick Actions Grid */}
            <Text style={styles.quickTitle}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.label}
                  style={styles.quickCard}
                  onPress={() => handleQuickAction(action.prompt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickCardEmoji}>{action.emoji}</Text>
                  <Text style={styles.quickCardLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            {messages.map((msg, i) => (
              <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                {msg.role === 'assistant' && (
                  <View style={styles.aiBubbleAvatar}>
                    <Text style={{ fontSize: 14 }}>🧠</Text>
                  </View>
                )}
                <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userBubbleText : styles.aiBubbleText]}>
                  {msg.content}
                </Text>
              </View>
            ))}

            {loading && (
              <View style={[styles.bubble, styles.aiBubble]}>
                <View style={styles.aiBubbleAvatar}>
                  <Text style={{ fontSize: 14 }}>🧠</Text>
                </View>
                <Animated.View style={{ opacity: pulseAnim, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={Colors.ai} />
                  <Text style={styles.aiBubbleText}>Analyzing your data...</Text>
                </Animated.View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your growth advisor..."
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.ai,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.ai,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  aiAvatarText: { fontSize: 22 },
  headerTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  headerSub: { fontSize: Theme.font.size.small, color: Colors.aiLight, marginTop: 1 },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.lg,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearBtnText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },

  // Messages area
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 24 },

  // Welcome screen
  welcome: { gap: 20 },
  welcomeHeader: { alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  welcomeEmoji: { fontSize: 48 },
  welcomeTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text, textAlign: 'center' },
  welcomeSubtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },

  // Stats badge
  statsBadge: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  statsBadgeTitle: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.semibold, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  statLabel: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },

  // Quick actions
  quickTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47%' as any,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickCardEmoji: { fontSize: 20 },
  quickCardLabel: { fontSize: Theme.font.size.body, color: Colors.text, fontWeight: Theme.font.weight.medium, flex: 1 },

  // Chat bubbles
  bubble: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', maxWidth: '88%', marginBottom: 12 },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
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
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: { fontSize: Theme.font.size.body, lineHeight: 22, flex: 1 },
  userBubbleText: { color: Colors.textInverse },
  aiBubbleText: { color: Colors.text },

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
