import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoreCard } from '@/components/ui/ScoreCard';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { crossAlert } from '@/lib/crossAlert';

type AdPlatform = 'google' | 'facebook' | 'other';
type CampaignStatus = 'active' | 'paused' | 'ended' | 'draft';

interface Campaign {
  id: string;
  name: string;
  platform: AdPlatform;
  status: CampaignStatus;
  spend_total: number;
  leads_generated: number;
  budget_daily: number | null;
  created_at: string;
}

interface AdConnection {
  platform: AdPlatform;
  connected: boolean;
  account_id: string | null;
  account_name: string | null;
}

const PLATFORM_ICONS: Record<AdPlatform, string> = {
  google: '🔵',
  facebook: '📘',
  other: '📣',
};

const PLATFORM_NAMES: Record<AdPlatform, string> = {
  google: 'Google Ads',
  facebook: 'Facebook Ads',
  other: 'Other',
};

const STATUS_VARIANT: Record<CampaignStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  active: 'success',
  paused: 'warning',
  ended: 'neutral',
  draft: 'neutral',
};

function cpl(campaign: Campaign): string {
  if (!campaign.leads_generated || campaign.leads_generated === 0) return '—';
  return `$${(campaign.spend_total / campaign.leads_generated).toFixed(0)}`;
}

function PlatformSection({
  platform,
  connection,
  campaigns,
  onConnect,
}: {
  platform: AdPlatform;
  connection: AdConnection | undefined;
  campaigns: Campaign[];
  onConnect: (platform: AdPlatform) => void;
}) {
  const isConnected = connection?.connected ?? false;
  const platformCampaigns = campaigns.filter(c => c.platform === platform);
  const totalSpend = platformCampaigns.reduce((s, c) => s + c.spend_total, 0);
  const totalLeads = platformCampaigns.reduce((s, c) => s + c.leads_generated, 0);
  const activeCampaigns = platformCampaigns.filter(c => c.status === 'active').length;

  return (
    <Card style={styles.platformCard}>
      <View style={styles.platformHeader}>
        <View style={styles.platformLeft}>
          <Text style={styles.platformIcon}>{PLATFORM_ICONS[platform]}</Text>
          <View>
            <Text style={styles.platformName}>{PLATFORM_NAMES[platform]}</Text>
            {isConnected && connection?.account_name && (
              <Text style={styles.platformAccount}>{connection.account_name}</Text>
            )}
          </View>
        </View>
        {isConnected ? (
          <Badge label="Connected" variant="success" />
        ) : (
          <Button label="Connect" onPress={() => onConnect(platform)} size="sm" />
        )}
      </View>

      {isConnected && (
        <View style={styles.platformMetrics}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{activeCampaigns}</Text>
            <Text style={styles.metricLabel}>Active</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>${totalSpend.toLocaleString()}</Text>
            <Text style={styles.metricLabel}>Total spend</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{totalLeads}</Text>
            <Text style={styles.metricLabel}>Leads</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>
              {totalLeads > 0 ? `$${(totalSpend / totalLeads).toFixed(0)}` : '—'}
            </Text>
            <Text style={styles.metricLabel}>CPL</Text>
          </View>
        </View>
      )}

      {!isConnected && (
        <View style={styles.connectPrompt}>
          <Text style={styles.connectPromptText}>
            {platform === 'google'
              ? 'Connect Google Ads to track spend, leads, and cost-per-lead automatically.'
              : 'Connect Facebook Ads to see campaign performance and lead quality in one place.'}
          </Text>
        </View>
      )}
    </Card>
  );
}

export default function AdsScreen() {
  const { company } = useAuthStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [connections, setConnections] = useState<AdConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectModal, setConnectModal] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<AdPlatform | null>(null);
  const [accountInput, setAccountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!company) return;
    const [campaignRes, connectionRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('ad_accounts').select('*').eq('company_id', company.id),
    ]);
    setCampaigns(campaignRes.data ?? []);
    const mappedConnections: AdConnection[] = (connectionRes.data ?? []).map(a => ({
      platform: a.platform as AdPlatform,
      connected: a.connected ?? true,
      account_id: a.account_id,
      account_name: a.account_name ?? null,
    }));
    setConnections(mappedConnections);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleConnect = (platform: AdPlatform) => {
    setConnectingPlatform(platform);
    setAccountInput('');
    setSaveError(null);
    setConnectModal(true);
  };

  const handleSaveConnection = async () => {
    if (!company || !connectingPlatform) return;
    const trimmed = accountInput.trim();
    if (!trimmed) {
      setSaveError('Please enter your account ID.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.from('ad_accounts').upsert({
      company_id: company.id,
      platform: connectingPlatform,
      account_id: trimmed,
      connected: true,
    }, { onConflict: 'company_id,platform' });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setConnectModal(false);
    setAccountInput('');
    setConnectingPlatform(null);
    await fetchData();
  };

  const handleNewCampaign = () => {
    crossAlert(
      'Add Campaign',
      'Campaign creation is managed through your Google Ads or Facebook Ads account. Connect your ad account above to automatically import your campaigns.',
      [{ text: 'OK' }]
    );
  };

  const getConnection = (platform: AdPlatform) => connections.find(c => c.platform === platform);

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const totalSpend = campaigns.reduce((s, c) => s + c.spend_total, 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads_generated, 0);
  const overallCpl = totalLeads > 0 ? totalSpend / totalLeads : null;

  return (
    <View style={styles.flex}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Ad Platforms</Text>
        <TouchableOpacity style={styles.newCampaignBtn} onPress={handleNewCampaign}>
          <Text style={styles.newCampaignText}>+ Campaign</Text>
        </TouchableOpacity>
      </View>

      {/* Summary score cards */}
      {!loading && campaigns.length > 0 && (
        <View style={styles.scoreRow}>
          <ScoreCard
            label="Active campaigns"
            value={String(activeCampaigns.length)}
            subtext={`of ${campaigns.length} total`}
            color={Colors.success}
          />
          <ScoreCard
            label="Overall CPL"
            value={overallCpl != null ? `$${overallCpl.toFixed(0)}` : '—'}
            subtext={`${totalLeads} leads total`}
            color={Colors.info}
          />
        </View>
      )}

      {/* Platform sections */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <>
          <PlatformSection
            platform="google"
            connection={getConnection('google')}
            campaigns={campaigns}
            onConnect={handleConnect}
          />
          <PlatformSection
            platform="facebook"
            connection={getConnection('facebook')}
            campaigns={campaigns}
            onConnect={handleConnect}
          />

          {/* Campaign list */}
          <Text style={styles.sectionTitle}>All Campaigns</Text>
          {campaigns.length === 0 ? (
            <EmptyState
              icon="📣"
              title="No campaigns yet"
              description="Connect Google Ads or Facebook Ads above to import your campaigns automatically."
              actionLabel="Connect Google Ads"
              onAction={() => handleConnect('google')}
            />
          ) : (
            <Card padding={false}>
              {campaigns.map((campaign, i) => (
                <View key={campaign.id} style={[styles.campaignRow, i < campaigns.length - 1 && styles.campaignBorder]}>
                  <View style={styles.campaignLeft}>
                    <Text style={styles.campaignIcon}>{PLATFORM_ICONS[campaign.platform]}</Text>
                    <View style={styles.campaignInfo}>
                      <Text style={styles.campaignName}>{campaign.name}</Text>
                      <View style={styles.campaignMeta}>
                        <Badge label={campaign.status} variant={STATUS_VARIANT[campaign.status]} />
                        {campaign.budget_daily != null && (
                          <Text style={styles.campaignBudget}>${campaign.budget_daily}/day</Text>
                        )}
                      </View>
                    </View>
                  </View>
                  <View style={styles.campaignStats}>
                    <Text style={styles.campaignStatValue}>${campaign.spend_total.toFixed(0)}</Text>
                    <Text style={styles.campaignStatLabel}>spent</Text>
                    <Text style={styles.campaignStatValue}>{campaign.leads_generated}</Text>
                    <Text style={styles.campaignStatLabel}>leads</Text>
                    <Text style={styles.campaignStatValue}>{cpl(campaign)}</Text>
                    <Text style={styles.campaignStatLabel}>CPL</Text>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {/* Tips when no connections */}
          {connections.filter(c => c.connected).length === 0 && (
            <Card style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Why connect your ad accounts?</Text>
              <View style={styles.tipsList}>
                {[
                  'See real cost-per-lead across platforms',
                  'Compare Google vs Facebook performance',
                  'Get AI suggestions to lower your CPL',
                  'Auto-import leads into your pipeline',
                ].map(tip => (
                  <View key={tip} style={styles.tipItem}>
                    <Text style={styles.tipDot}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>

    {/* ── Connect Ad Account Modal ── */}
    <Modal
      visible={connectModal}
      transparent
      animationType="slide"
      onRequestClose={() => setConnectModal(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>
            {connectingPlatform === 'google' ? 'Connect Google Ads' : 'Connect Facebook Ads'}
          </Text>
          <Text style={styles.modalSubtitle}>
            {connectingPlatform === 'google'
              ? 'Open Google Ads → click the question mark (?) at the top right → your Customer ID is shown (format: 123-456-7890).'
              : 'Open Meta Business Suite → Settings → Ad Accounts → copy the Account ID (format: act_XXXXXXXXXX).'}
          </Text>
          <Input
            label={connectingPlatform === 'google' ? 'Customer ID' : 'Ad Account ID'}
            placeholder={connectingPlatform === 'google' ? '123-456-7890' : 'act_XXXXXXXXXX'}
            value={accountInput}
            onChangeText={setAccountInput}
            autoCapitalize="none"
            autoCorrect={false}
            error={saveError ?? undefined}
          />
          <Button
            label={saving ? 'Saving…' : 'Save & Connect'}
            onPress={handleSaveConnection}
            size="lg"
            disabled={saving}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => { setConnectModal(false); setAccountInput(''); setSaveError(null); }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40, paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  newCampaignBtn: { backgroundColor: Colors.primary, paddingHorizontal: Theme.space.lg, paddingVertical: Theme.space.sm, borderRadius: Theme.radius.md },
  newCampaignText: { color: Colors.textInverse, fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.small },
  scoreRow: { flexDirection: 'row', gap: Theme.space.md },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  platformCard: { marginBottom: 0 },
  platformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Theme.space.lg },
  platformLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.md },
  platformIcon: { fontSize: 28 },
  platformName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  platformAccount: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  platformMetrics: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingVertical: Theme.space.md,
    paddingHorizontal: Theme.space.lg,
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  metricLabel: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, marginTop: 2 },
  metricDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  connectPrompt: { paddingHorizontal: Theme.space.lg, paddingBottom: Theme.space.lg },
  connectPromptText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, lineHeight: 20 },
  sectionTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  campaignRow: { flexDirection: 'row', alignItems: 'center', padding: Theme.space.lg, gap: Theme.space.md },
  campaignBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  campaignLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  campaignIcon: { fontSize: 20 },
  campaignInfo: { flex: 1, gap: 4 },
  campaignName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.medium, color: Colors.text },
  campaignMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campaignBudget: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },
  campaignStats: { alignItems: 'flex-end', gap: 2 },
  campaignStatValue: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  campaignStatLabel: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },
  tipsCard: {},
  tipsTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginBottom: Theme.space.md },
  tipsList: { gap: Theme.space.sm },
  tipItem: { flexDirection: 'row', gap: Theme.space.sm },
  tipDot: { color: Colors.primary, fontSize: Theme.font.size.body },
  tipText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, flex: 1 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#142B1F', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  modalSubtitle: { fontSize: Theme.font.size.small, color: Colors.textSecondary, lineHeight: 20 },
});
