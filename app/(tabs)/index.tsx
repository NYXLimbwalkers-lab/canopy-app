import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { ScoreCard } from '@/components/ui/ScoreCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { AIChat } from '@/components/AIChat';
import { WeatherWidget } from '@/components/WeatherWidget';
import { generateDailyBriefing, isAIConfigured } from '@/lib/ai';

interface DashboardData {
  leadsToday: number;
  leadsWeek: number;
  adSpendToday: number;
  costPerLead: number | null;
  recentLeads: Array<{ id: string; name: string; service: string; source: string; created_at: string; score: number }>;
  activeCampaigns: number;
  openJobs: number;
  weekRevenue: number;
}

export default function DashboardScreen() {
  const { profile, company } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!company) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [leadsToday, leadsWeek, campaigns, jobs, recentLeads, invoices] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', today.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company.id).gte('created_at', weekAgo.toISOString()),
      supabase.from('campaigns').select('id, spend_total, leads_generated, status').eq('company_id', company.id).eq('status', 'active'),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', company.id).in('status', ['booked', 'in_progress']),
      supabase.from('leads').select('id, name, service, source, created_at, score').eq('company_id', company.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('invoices').select('amount').eq('company_id', company.id).eq('status', 'paid').gte('paid_at', weekAgo.toISOString()),
    ]);

    const spendTotal = campaigns.data?.reduce((s, c) => s + (c.spend_total ?? 0), 0) ?? 0;
    const totalLeads = campaigns.data?.reduce((s, c) => s + (c.leads_generated ?? 0), 0) ?? 0;
    const cpl = totalLeads > 0 ? spendTotal / totalLeads : null;
    const weekRevenue = invoices.data?.reduce((s, i) => s + (i.amount ?? 0), 0) ?? 0;

    setData({
      leadsToday: leadsToday.count ?? 0,
      leadsWeek: leadsWeek.count ?? 0,
      adSpendToday: spendTotal,
      costPerLead: cpl,
      recentLeads: recentLeads.data ?? [],
      activeCampaigns: campaigns.data?.length ?? 0,
      openJobs: jobs.count ?? 0,
      weekRevenue,
    });
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const fetchBriefing = useCallback(async (leadsToday = 0, adSpend = 0) => {
    if (!isAIConfigured() || !company) return;
    try {
      const text = await generateDailyBriefing(
        { name: company.name, city: company.city, state: company.state, services: company.services_offered },
        { leadsToday, adSpend }
      );
      setBriefing(text);
    } catch {}
  }, [company]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    if (data) fetchBriefing(data.leadsToday, data.adSpendToday);
  }, [company]); // eslint-disable-line react-hooks/exhaustive-deps

  const getHour = () => new Date().getHours();
  const greeting = getHour() < 12 ? 'Good morning' : getHour() < 17 ? 'Good afternoon' : 'Good evening';

  const sourceColor = (source: string): 'success' | 'info' | 'warning' | 'neutral' => {
    const map: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
      google_ads: 'success', facebook_ads: 'info', website: 'warning', phone: 'neutral',
    };
    return map[source] ?? 'neutral';
  };

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, {profile?.name?.split(' ')[0] ?? 'there'} 👋</Text>
          <Text style={styles.company}>{company?.name}</Text>
        </View>
        <TouchableOpacity style={styles.aiBtn} onPress={() => fetchBriefing(data?.leadsToday, data?.adSpendToday)}>
          <Text style={styles.aiBtnText}>🤖</Text>
        </TouchableOpacity>
      </View>

      {/* AI Briefing */}
      {briefing && (
        <View style={styles.briefingCard}>
          <Text style={styles.briefingLabel}>🤖 Daily briefing</Text>
          <Text style={styles.briefingText}>{briefing}</Text>
        </View>
      )}

      {/* Today at a glance */}
      <Text style={styles.sectionTitle}>Today at a glance</Text>
      <View style={styles.scoreRow}>
        <ScoreCard
          label="Leads today"
          value={loading ? '—' : String(data?.leadsToday ?? 0)}
          subtext={`${data?.leadsWeek ?? 0} this week`}
          trend={data && data.leadsToday > 0 ? 'up' : 'neutral'}
        />
        <ScoreCard
          label="Ad spend"
          value={loading ? '—' : data?.adSpendToday != null ? `$${data.adSpendToday.toFixed(0)}` : 'No ads'}
          subtext={data?.activeCampaigns ? `${data.activeCampaigns} active` : 'Connect ads'}
          color={Colors.warning}
        />
      </View>
      <View style={styles.scoreRow}>
        <ScoreCard
          label="Cost per lead"
          value={loading ? '—' : data?.costPerLead != null ? `$${data.costPerLead.toFixed(0)}` : '—'}
          subtext="from ads"
          color={Colors.info}
        />
        <ScoreCard
          label="Week revenue"
          value={loading ? '—' : `$${(data?.weekRevenue ?? 0).toLocaleString()}`}
          trend={data && data.weekRevenue > 0 ? 'up' : 'neutral'}
          color={Colors.success}
        />
      </View>

      {/* Open jobs */}
      {data && data.openJobs > 0 && (
        <TouchableOpacity style={styles.alertBanner} onPress={() => router.push('/(tabs)/leads')}>
          <Text style={styles.alertText}>🔨 {data.openJobs} job{data.openJobs !== 1 ? 's' : ''} in progress</Text>
          <Text style={styles.alertArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* Recent Leads */}
      {/* Weather / Storm Alert */}
      <WeatherWidget onStormDetected={(w) => setBriefing(w.alertMessage ?? null)} />

      <Text style={styles.sectionTitle}>Recent leads</Text>
      {!data || data.recentLeads.length === 0 ? (
        <EmptyState
          icon="📬"
          title="No leads yet"
          description="Connect your Google Ads or Facebook account to start getting leads, or add one manually."
          actionLabel="Set up ads"
          onAction={() => router.push('/(tabs)/ads')}
        />
      ) : (
        <Card padding={false}>
          {data.recentLeads.map((lead, i) => (
            <TouchableOpacity key={lead.id} style={[styles.leadRow, i < data.recentLeads.length - 1 && styles.leadBorder]}>
              <View style={styles.leadScore}>
                <Text style={styles.leadScoreText}>{lead.score}</Text>
              </View>
              <View style={styles.leadInfo}>
                <Text style={styles.leadName}>{lead.name}</Text>
                <Text style={styles.leadService}>{lead.service}</Text>
              </View>
              <Badge label={lead.source.replace('_', ' ')} variant={sourceColor(lead.source)} />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {/* Setup prompts for missing connections */}
      {!loading && data && data.activeCampaigns === 0 && (
        <Card style={styles.setupCard}>
          <Text style={styles.setupTitle}>⚡ Quick actions to get your first lead</Text>
          {[
            { icon: '📣', label: 'Set up Google Ads', route: '/(tabs)/ads' as const },
            { icon: '📘', label: 'Connect Facebook Ads', route: '/(tabs)/ads' as const },
            { icon: '🔍', label: 'Optimize Google Business Profile', route: '/(tabs)/seo' as const },
          ].map(action => (
            <TouchableOpacity key={action.label} style={styles.setupAction} onPress={() => router.push(action.route)}>
              <Text style={styles.setupActionText}>{action.icon} {action.label}</Text>
              <Text style={styles.setupArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}
    </ScrollView>
    <AIChat context={`Dashboard: ${data?.leadsToday ?? 0} leads today, $${data?.adSpendToday?.toFixed(0) ?? 0} ad spend, ${data?.activeCampaigns ?? 0} active campaigns.`} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  company: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  aiBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  aiBtnText: { fontSize: 22 },
  briefingCard: { backgroundColor: '#EDE9FE', padding: 14, borderRadius: Theme.radius.lg, gap: 4 },
  briefingLabel: { fontSize: Theme.font.size.caption, color: Colors.ai, fontWeight: Theme.font.weight.semibold, textTransform: 'uppercase' },
  briefingText: { fontSize: Theme.font.size.body, color: '#4C1D95', lineHeight: 22 },
  sectionTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  scoreRow: { flexDirection: 'row', gap: Theme.space.md },
  alertBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.warningBg, padding: 14, borderRadius: Theme.radius.lg, borderLeftWidth: 4, borderLeftColor: Colors.warning },
  alertText: { fontSize: Theme.font.size.body, color: '#92400E', fontWeight: Theme.font.weight.medium },
  alertArrow: { color: '#92400E', fontWeight: Theme.font.weight.bold },
  leadRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  leadBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  leadScore: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  leadScoreText: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  leadInfo: { flex: 1 },
  leadName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.medium, color: Colors.text },
  leadService: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  setupCard: { marginBottom: 8 },
  setupTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginBottom: 8 },
  setupAction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  setupActionText: { fontSize: Theme.font.size.body, color: Colors.text },
  setupArrow: { color: Colors.primary, fontWeight: Theme.font.weight.bold },
});
