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
  Linking,
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

type AdPlatform = 'google' | 'facebook' | 'google_ads' | 'facebook_ads' | 'local_services' | 'other';
type CampaignStatus = 'active' | 'paused' | 'ended' | 'draft';
type CampaignType = 'search' | 'performance_max' | 'local_services' | 'awareness' | string;

interface Campaign {
  id: string;
  name: string;
  platform: AdPlatform;
  status: CampaignStatus;
  spend_total: number;
  leads_generated: number;
  budget_daily: number | null;
  campaign_type?: CampaignType;
  created_at: string;
}

interface AdConnection {
  platform: AdPlatform;
  connected: boolean;
  account_id: string | null;
  account_name: string | null;
}

interface LSAProfile {
  id?: string;
  company_id: string;
  connected: boolean;
  badge_status: 'active' | 'pending' | 'suspended' | 'none';
  weekly_budget: number | null;
  leads_this_week: number;
  spend_this_week: number;
  service_categories: string[];
  setup_checklist: {
    gbp_verified: boolean;
    background_check: boolean;
    insurance_uploaded: boolean;
    service_areas_set: boolean;
    budget_set: boolean;
  };
}

const DEFAULT_LSA_PROFILE: LSAProfile = {
  company_id: '',
  connected: false,
  badge_status: 'none',
  weekly_budget: null,
  leads_this_week: 0,
  spend_this_week: 0,
  service_categories: [],
  setup_checklist: {
    gbp_verified: false,
    background_check: false,
    insurance_uploaded: false,
    service_areas_set: false,
    budget_set: false,
  },
};

const PLATFORM_ICONS: Record<AdPlatform, string> = {
  google: '🔵',
  google_ads: '🔵',
  facebook: '📘',
  facebook_ads: '📘',
  local_services: '🛡️',
  other: '📣',
};

const PLATFORM_NAMES: Record<AdPlatform, string> = {
  google: 'Google Ads',
  google_ads: 'Google Ads',
  facebook: 'Facebook Ads',
  facebook_ads: 'Facebook Ads',
  local_services: 'Google Local Services',
  other: 'Other',
};

const STATUS_VARIANT: Record<CampaignStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  active: 'success',
  paused: 'warning',
  ended: 'neutral',
  draft: 'neutral',
};

const LSA_SIGNUP_URL = 'https://ads.google.com/local-services-ads/';

const LSA_TREE_SERVICE_CATEGORIES = [
  'Tree Trimming',
  'Tree Removal',
  'Stump Grinding',
  'Emergency Tree Service',
  'Arborist Consultation',
  'Land Clearing',
];

const LSA_SETUP_STEPS = [
  { key: 'gbp_verified' as const, label: 'Create & verify Google Business Profile', detail: 'Your GBP must be verified before you can enroll in LSA' },
  { key: 'background_check' as const, label: 'Pass Google\'s background check', detail: 'Google runs owner background checks through Pinkerton' },
  { key: 'insurance_uploaded' as const, label: 'Upload insurance & licensing', detail: 'General liability insurance and any required state licenses' },
  { key: 'service_areas_set' as const, label: 'Set service areas & job types', detail: 'Define where you work and what services you offer' },
  { key: 'budget_set' as const, label: 'Set your weekly budget', detail: 'Control spend with a weekly budget ($250-$1,000+ recommended)' },
];

function cpl(campaign: Campaign): string {
  if (!campaign.leads_generated || campaign.leads_generated === 0) return '—';
  return `$${(campaign.spend_total / campaign.leads_generated).toFixed(0)}`;
}

// ── LSA Setup Guide (shown when not connected) ──
function LSASetupGuide({
  checklist,
  onToggleStep,
  onOpenSignup,
  onSignIn,
}: {
  checklist: LSAProfile['setup_checklist'];
  onToggleStep: (key: keyof LSAProfile['setup_checklist']) => void;
  onOpenSignup: () => void;
  onSignIn: () => void;
}) {
  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalSteps = LSA_SETUP_STEPS.length;
  const allComplete = completedCount === totalSteps;

  return (
    <Card style={styles.lsaSetupCard}>
      {/* Header */}
      <View style={styles.lsaSetupHeader}>
        <View style={styles.lsaBadgeRow}>
          <View style={styles.googleGuaranteedBadge}>
            <Text style={styles.googleGuaranteedIcon}>🛡️</Text>
            <Text style={styles.googleGuaranteedText}>Google Guaranteed</Text>
          </View>
        </View>
        <Text style={styles.lsaSetupTitle}>Google Local Services Ads</Text>
        <Text style={styles.lsaSetupSubtitle}>
          Get the "Google Guaranteed" badge and appear at the very top of search results.
          Tree service leads typically cost $25-$75 each — and you only pay for valid leads.
        </Text>
      </View>

      {/* Why LSA for Tree Services */}
      <View style={styles.lsaWhyBox}>
        <Text style={styles.lsaWhyTitle}>Why tree services need LSA</Text>
        <View style={styles.lsaWhyList}>
          {[
            'Appear above regular Google Ads in search results',
            'Pay per lead, not per click — no wasted ad spend',
            'The Google Guaranteed badge builds instant trust',
            'Dispute invalid leads and get your money back',
            'Typical cost: $25-$75 per lead for tree services',
          ].map(item => (
            <View key={item} style={styles.lsaWhyItem}>
              <Text style={styles.lsaCheckMark}>✓</Text>
              <Text style={styles.lsaWhyText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Setup Checklist */}
      <View style={styles.lsaChecklistSection}>
        <View style={styles.lsaChecklistHeader}>
          <Text style={styles.lsaChecklistTitle}>Setup Checklist</Text>
          <Text style={styles.lsaChecklistProgress}>{completedCount}/{totalSteps}</Text>
        </View>
        <View style={styles.lsaProgressBarBg}>
          <View style={[styles.lsaProgressBarFill, { width: `${(completedCount / totalSteps) * 100}%` }]} />
        </View>

        {LSA_SETUP_STEPS.map(step => {
          const done = checklist[step.key];
          return (
            <TouchableOpacity
              key={step.key}
              style={styles.lsaChecklistItem}
              onPress={() => onToggleStep(step.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.lsaCheckbox, done && styles.lsaCheckboxDone]}>
                {done && <Text style={styles.lsaCheckboxCheck}>✓</Text>}
              </View>
              <View style={styles.lsaChecklistContent}>
                <Text style={[styles.lsaChecklistLabel, done && styles.lsaChecklistLabelDone]}>
                  {step.label}
                </Text>
                <Text style={styles.lsaChecklistDetail}>{step.detail}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Action Button — Sign In when ready, or Signup link when not */}
      <View style={styles.lsaSignupSection}>
        {allComplete ? (
          <>
            <Button
              label="✅ Sign In to Google LSA"
              onPress={onSignIn}
              size="lg"
            />
            <Text style={styles.lsaSignupNote}>
              Already set up — sign in to connect your LSA dashboard
            </Text>
          </>
        ) : (
          <>
            <Button
              label="Open Google LSA Signup"
              onPress={onOpenSignup}
              size="lg"
              variant="outline"
            />
            <Text style={styles.lsaSignupNote}>
              Complete the checklist above, then sign in to connect
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}

// ── LSA Dashboard (shown when connected) ──
function LSADashboard({
  profile,
  campaigns,
  onAdjustBudget,
  onDisputeLead,
  onViewLeads,
}: {
  profile: LSAProfile;
  campaigns: Campaign[];
  onAdjustBudget: () => void;
  onDisputeLead: () => void;
  onViewLeads: () => void;
}) {
  const lsaCampaigns = campaigns.filter(c => c.campaign_type === 'local_services');
  const weekCpl = profile.leads_this_week > 0
    ? (profile.spend_this_week / profile.leads_this_week).toFixed(0)
    : null;

  return (
    <Card style={styles.lsaDashboardCard}>
      {/* Header with badge */}
      <View style={styles.lsaDashHeader}>
        <View style={styles.lsaDashTitleRow}>
          <Text style={styles.lsaDashIcon}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.lsaDashTitle}>Google Local Services</Text>
            <Text style={styles.lsaDashSubtitle}>Google Guaranteed</Text>
          </View>
          <Badge
            label={profile.badge_status === 'active' ? 'Badge Active' : profile.badge_status === 'pending' ? 'Pending' : 'Suspended'}
            variant={profile.badge_status === 'active' ? 'success' : profile.badge_status === 'pending' ? 'warning' : 'danger'}
          />
        </View>
      </View>

      {/* Metrics row */}
      <View style={styles.lsaMetricsRow}>
        <View style={styles.lsaMetricItem}>
          <Text style={styles.lsaMetricValue}>
            {profile.weekly_budget != null ? `$${profile.weekly_budget}` : '—'}
          </Text>
          <Text style={styles.lsaMetricLabel}>Weekly budget</Text>
        </View>
        <View style={styles.lsaMetricDivider} />
        <View style={styles.lsaMetricItem}>
          <Text style={styles.lsaMetricValue}>{profile.leads_this_week}</Text>
          <Text style={styles.lsaMetricLabel}>Leads this week</Text>
        </View>
        <View style={styles.lsaMetricDivider} />
        <View style={styles.lsaMetricItem}>
          <Text style={styles.lsaMetricValue}>{weekCpl ? `$${weekCpl}` : '—'}</Text>
          <Text style={styles.lsaMetricLabel}>Cost / lead</Text>
        </View>
        <View style={styles.lsaMetricDivider} />
        <View style={styles.lsaMetricItem}>
          <Text style={styles.lsaMetricValue}>${profile.spend_this_week}</Text>
          <Text style={styles.lsaMetricLabel}>Spent this week</Text>
        </View>
      </View>

      {/* Service categories */}
      {profile.service_categories.length > 0 && (
        <View style={styles.lsaCategoriesSection}>
          <Text style={styles.lsaCategoriesTitle}>Service Categories</Text>
          <View style={styles.lsaCategoryChips}>
            {profile.service_categories.map(cat => (
              <View key={cat} style={styles.lsaCategoryChip}>
                <Text style={styles.lsaCategoryChipText}>{cat}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.lsaActionsRow}>
        <TouchableOpacity style={styles.lsaActionBtn} onPress={onAdjustBudget}>
          <Text style={styles.lsaActionIcon}>💰</Text>
          <Text style={styles.lsaActionLabel}>Adjust Budget</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.lsaActionBtn} onPress={onDisputeLead}>
          <Text style={styles.lsaActionIcon}>⚠️</Text>
          <Text style={styles.lsaActionLabel}>Dispute Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.lsaActionBtn} onPress={onViewLeads}>
          <Text style={styles.lsaActionIcon}>📋</Text>
          <Text style={styles.lsaActionLabel}>View Leads</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
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

  // LSA state
  const [lsaProfile, setLsaProfile] = useState<LSAProfile>({ ...DEFAULT_LSA_PROFILE });
  const [lsaBudgetModal, setLsaBudgetModal] = useState(false);
  const [lsaBudgetInput, setLsaBudgetInput] = useState('');

  const fetchData = useCallback(async () => {
    if (!company) return;
    const [campaignRes, connectionRes, lsaRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('ad_accounts').select('*').eq('company_id', company.id),
      supabase.from('lsa_profiles').select('*').eq('company_id', company.id).maybeSingle(),
    ]);
    if (campaignRes.error) console.error('Failed to fetch campaigns:', campaignRes.error.message);
    if (connectionRes.error) console.error('Failed to fetch ad accounts:', connectionRes.error.message);
    setCampaigns(campaignRes.data ?? []);
    const mappedConnections: AdConnection[] = (connectionRes.data ?? []).map(a => ({
      platform: a.platform as AdPlatform,
      connected: a.connected ?? true,
      account_id: a.account_id,
      account_name: a.account_name ?? null,
    }));
    setConnections(mappedConnections);

    // Load LSA profile if exists
    if (lsaRes.data) {
      setLsaProfile({
        id: lsaRes.data.id,
        company_id: lsaRes.data.company_id,
        connected: lsaRes.data.connected ?? false,
        badge_status: lsaRes.data.badge_status ?? 'none',
        weekly_budget: lsaRes.data.weekly_budget ?? null,
        leads_this_week: lsaRes.data.leads_this_week ?? 0,
        spend_this_week: lsaRes.data.spend_this_week ?? 0,
        service_categories: lsaRes.data.service_categories ?? [],
        setup_checklist: lsaRes.data.setup_checklist ?? DEFAULT_LSA_PROFILE.setup_checklist,
      });
    } else {
      setLsaProfile({ ...DEFAULT_LSA_PROFILE, company_id: company.id });
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
    // Validate format
    if ((connectingPlatform === 'google' || connectingPlatform === 'google_ads') && !/^\d{3}-\d{3}-\d{4}$/.test(trimmed) && !/^\d{10}$/.test(trimmed)) {
      setSaveError('Google Ads ID format: 123-456-7890 or 1234567890');
      return;
    }
    if ((connectingPlatform === 'facebook' || connectingPlatform === 'facebook_ads') && !/^(act_)?\d+$/.test(trimmed)) {
      setSaveError('Facebook Ads ID format: act_123456789 or 123456789');
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

  // ── LSA handlers ──
  const handleToggleLSAStep = async (key: keyof LSAProfile['setup_checklist']) => {
    if (!company) return;
    const updated = {
      ...lsaProfile,
      company_id: company.id,
      setup_checklist: {
        ...lsaProfile.setup_checklist,
        [key]: !lsaProfile.setup_checklist[key],
      },
    };
    setLsaProfile(updated);
    // Persist checklist to Supabase
    await supabase.from('lsa_profiles').upsert({
      company_id: company.id,
      setup_checklist: updated.setup_checklist,
      connected: updated.connected,
      badge_status: updated.badge_status,
      weekly_budget: updated.weekly_budget,
      service_categories: updated.service_categories,
    }, { onConflict: 'company_id' });
  };

  const handleOpenLSASignup = () => {
    Linking.openURL(LSA_SIGNUP_URL);
  };

  const handleLSASignIn = async () => {
    // Open the LSA dashboard, then mark as connected
    Linking.openURL(LSA_SIGNUP_URL);
    if (!company) return;
    const updated = {
      ...lsaProfile,
      connected: true,
      badge_status: 'pending' as const,
      company_id: company.id,
    };
    setLsaProfile(updated);
    await supabase.from('lsa_profiles').upsert({
      company_id: company.id,
      connected: true,
      badge_status: 'pending',
      setup_checklist: updated.setup_checklist,
      weekly_budget: updated.weekly_budget,
      service_categories: updated.service_categories,
    }, { onConflict: 'company_id' });
  };

  const handleAdjustBudget = () => {
    setLsaBudgetInput(lsaProfile.weekly_budget?.toString() ?? '');
    setLsaBudgetModal(true);
  };

  const handleSaveBudget = async () => {
    if (!company) return;
    const amount = parseInt(lsaBudgetInput, 10);
    if (isNaN(amount) || amount < 0) {
      crossAlert('Invalid Budget', 'Please enter a valid dollar amount.', [{ text: 'OK' }]);
      return;
    }
    const updated = { ...lsaProfile, weekly_budget: amount };
    setLsaProfile(updated);
    setLsaBudgetModal(false);
    await supabase.from('lsa_profiles').upsert({
      company_id: company.id,
      weekly_budget: amount,
      connected: updated.connected,
      badge_status: updated.badge_status,
      setup_checklist: updated.setup_checklist,
      service_categories: updated.service_categories,
    }, { onConflict: 'company_id' });
  };

  const handleDisputeLead = () => {
    crossAlert(
      'Dispute a Lead',
      'To dispute an invalid lead, open the Google Local Services Ads app or visit ads.google.com/local-services-ads and select the lead you want to dispute. Google reviews disputes within 2-3 business days.',
      [
        { text: 'Open Google LSA', onPress: () => Linking.openURL(LSA_SIGNUP_URL) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleViewLeads = () => {
    crossAlert(
      'View LSA Leads',
      'LSA leads appear in your Leads tab. Leads imported from Google Local Services are tagged with "LSA" so you can filter them easily.',
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

      {/* LSA Section — always prominent at top of platform list */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <>
          {lsaProfile.connected ? (
            <LSADashboard
              profile={lsaProfile}
              campaigns={campaigns}
              onAdjustBudget={handleAdjustBudget}
              onDisputeLead={handleDisputeLead}
              onViewLeads={handleViewLeads}
            />
          ) : (
            <LSASetupGuide
              checklist={lsaProfile.setup_checklist}
              onToggleStep={handleToggleLSAStep}
              onOpenSignup={handleOpenLSASignup}
              onSignIn={handleLSASignIn}
            />
          )}

          {/* Platform sections */}
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
              {campaigns.map((campaign, i) => {
                const isLSA = campaign.campaign_type === 'local_services';
                return (
                  <View key={campaign.id} style={[styles.campaignRow, i < campaigns.length - 1 && styles.campaignBorder]}>
                    <View style={styles.campaignLeft}>
                      <Text style={styles.campaignIcon}>
                        {isLSA ? '🛡️' : PLATFORM_ICONS[campaign.platform]}
                      </Text>
                      <View style={styles.campaignInfo}>
                        <View style={styles.campaignNameRow}>
                          <Text style={styles.campaignName}>{campaign.name}</Text>
                          {isLSA && (
                            <View style={styles.lsaInlineBadge}>
                              <Text style={styles.lsaInlineBadgeText}>Google Guaranteed</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.campaignMeta}>
                          <Badge label={campaign.status} variant={STATUS_VARIANT[campaign.status]} />
                          {isLSA && <Badge label="LSA" variant="success" />}
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
                );
              })}
            </Card>
          )}

          {/* Tips when no connections */}
          {connections.filter(c => c.connected).length === 0 && !lsaProfile.connected && (
            <Card style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Why connect your ad accounts?</Text>
              <View style={styles.tipsList}>
                {[
                  'See real cost-per-lead across platforms',
                  'Compare Google vs Facebook vs LSA performance',
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

    {/* ── LSA Budget Modal ── */}
    <Modal
      visible={lsaBudgetModal}
      transparent
      animationType="slide"
      onRequestClose={() => setLsaBudgetModal(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Adjust Weekly Budget</Text>
          <Text style={styles.modalSubtitle}>
            Set your weekly spend limit for Google Local Services Ads.
            For tree services, $250-$1,000/week is typical depending on your market size.
          </Text>
          <Input
            label="Weekly Budget ($)"
            placeholder="500"
            value={lsaBudgetInput}
            onChangeText={setLsaBudgetInput}
            keyboardType="numeric"
          />
          <Button
            label="Save Budget"
            onPress={handleSaveBudget}
            size="lg"
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setLsaBudgetModal(false)}
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

  // ── LSA Setup Guide ──
  lsaSetupCard: { borderWidth: 2, borderColor: Colors.primary, overflow: 'hidden' },
  lsaSetupHeader: { padding: Theme.space.lg, paddingBottom: Theme.space.md },
  lsaBadgeRow: { marginBottom: Theme.space.md },
  googleGuaranteedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  googleGuaranteedIcon: { fontSize: 16 },
  googleGuaranteedText: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.bold, color: Colors.successDark },
  lsaSetupTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text, marginBottom: 4 },
  lsaSetupSubtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },

  lsaWhyBox: {
    marginHorizontal: Theme.space.lg,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.space.lg,
    marginBottom: Theme.space.md,
  },
  lsaWhyTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.text, marginBottom: Theme.space.sm },
  lsaWhyList: { gap: 8 },
  lsaWhyItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lsaCheckMark: { color: Colors.primary, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.body, marginTop: 1 },
  lsaWhyText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, flex: 1, lineHeight: 20 },

  lsaChecklistSection: { paddingHorizontal: Theme.space.lg, paddingBottom: Theme.space.md },
  lsaChecklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lsaChecklistTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.text },
  lsaChecklistProgress: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.primary },
  lsaProgressBarBg: {
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    marginBottom: Theme.space.md,
    overflow: 'hidden',
  },
  lsaProgressBarFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  lsaChecklistItem: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
  lsaCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  lsaCheckboxDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  lsaCheckboxCheck: { color: Colors.textInverse, fontSize: 14, fontWeight: Theme.font.weight.bold },
  lsaChecklistContent: { flex: 1 },
  lsaChecklistLabel: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginBottom: 2 },
  lsaChecklistLabelDone: { textDecorationLine: 'line-through', color: Colors.textTertiary },
  lsaChecklistDetail: { fontSize: Theme.font.size.small, color: Colors.textTertiary, lineHeight: 18 },

  lsaSignupSection: { paddingHorizontal: Theme.space.lg, paddingBottom: Theme.space.lg, gap: 8 },
  lsaSignupNote: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center' },

  // ── LSA Dashboard ──
  lsaDashboardCard: { borderWidth: 2, borderColor: Colors.primary, overflow: 'hidden' },
  lsaDashHeader: { padding: Theme.space.lg, paddingBottom: Theme.space.md },
  lsaDashTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.md },
  lsaDashIcon: { fontSize: 28 },
  lsaDashTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.text },
  lsaDashSubtitle: { fontSize: Theme.font.size.small, color: Colors.successDark, fontWeight: Theme.font.weight.semibold },

  lsaMetricsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Theme.space.md,
    paddingHorizontal: Theme.space.lg,
  },
  lsaMetricItem: { flex: 1, alignItems: 'center' },
  lsaMetricValue: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  lsaMetricLabel: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, marginTop: 2, textAlign: 'center' },
  lsaMetricDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  lsaCategoriesSection: {
    paddingHorizontal: Theme.space.lg,
    paddingBottom: Theme.space.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Theme.space.md,
  },
  lsaCategoriesTitle: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: Colors.textSecondary, marginBottom: 8 },
  lsaCategoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lsaCategoryChip: {
    backgroundColor: Colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  lsaCategoryChipText: { fontSize: Theme.font.size.small, color: Colors.successDark, fontWeight: Theme.font.weight.medium },

  lsaActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Theme.space.md,
    paddingHorizontal: Theme.space.lg,
    gap: Theme.space.sm,
  },
  lsaActionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingVertical: Theme.space.md,
    borderRadius: Theme.radius.md,
  },
  lsaActionIcon: { fontSize: 20 },
  lsaActionLabel: { fontSize: Theme.font.size.caption, fontWeight: Theme.font.weight.semibold, color: Colors.text },

  // ── LSA inline badge for campaign list ──
  campaignNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lsaInlineBadge: {
    backgroundColor: Colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  lsaInlineBadgeText: { fontSize: 10, fontWeight: Theme.font.weight.bold, color: Colors.successDark },

  // ── Platform sections ──
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

  // ── Campaign list ──
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

  // ── Tips ──
  tipsCard: {},
  tipsTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text, marginBottom: Theme.space.md },
  tipsList: { gap: Theme.space.sm },
  tipItem: { flexDirection: 'row', gap: Theme.space.sm },
  tipDot: { color: Colors.primary, fontSize: Theme.font.size.body },
  tipText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, flex: 1 },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#142B1F', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  modalSubtitle: { fontSize: Theme.font.size.small, color: Colors.textSecondary, lineHeight: 20 },
});
