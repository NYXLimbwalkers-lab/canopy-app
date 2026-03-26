import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
} from 'react-native';

import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { trialDaysRemaining, PLANS } from '@/lib/stripe';
import { crossAlert } from '@/lib/crossAlert';
import { startFacebookOAuth, isFacebookConnected } from '@/lib/meta';
import { startTikTokOAuth, isTikTokConnected } from '@/lib/tiktok';
import { startYouTubeOAuth, isYouTubeConnected } from '@/lib/youtube';

const AI_KEY_STORAGE = 'EXPO_PUBLIC_OPENROUTER_API_KEY';
const AI_MODEL_STORAGE = 'CANOPY_AI_MODEL_PREF';

type AIModelPref = 'fast' | 'claude' | 'gpt4o';

interface AdAccount {
  id: string;
  platform: string;
  account_id: string;
  account_name?: string;
  status?: string;
}

interface SocialConnection {
  id: string;
  platform: string;
  handle: string;
  status?: string;
}

export default function SettingsScreen() {
  const { profile, company, signOut, fetchProfile } = useAuthStore();

  // Company fields
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [servicesOffered, setServicesOffered] = useState('');
  const [serviceRadius, setServiceRadius] = useState('');

  // Account fields
  const [userName, setUserName] = useState('');

  // AI fields
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState<AIModelPref>('fast');

  // Connected accounts
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]);

  // Connect modal
  const [connectModal, setConnectModal] = useState<{
    visible: boolean;
    platform: string;
    type: 'ad' | 'social';
    label: string;
  }>({ visible: false, platform: '', type: 'ad', label: '' });
  const [connectInput, setConnectInput] = useState('');
  const [connectSaving, setConnectSaving] = useState(false);

  // Social OAuth connection status
  const [fbConnected, setFbConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [ytConnected, setYtConnected] = useState(false);
  const [socialStatusLoading, setSocialStatusLoading] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);
  const [savingAI, setSavingAI] = useState(false);

  // Populate fields from store
  useEffect(() => {
    if (company) {
      setCompanyName(company.name ?? '');
      setPhone(company.phone ?? '');
      setWebsite(company.website ?? '');
      setCity(company.city ?? '');
      setState(company.state ?? '');
      setServicesOffered(company.services_offered?.join(', ') ?? '');
      setServiceRadius(
        company.service_radius_miles != null
          ? String(company.service_radius_miles)
          : ''
      );
    }
    if (profile) {
      setUserName(profile.name ?? '');
    }
  }, [company, profile]);

  // Load AI config from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const storedKey = await AsyncStorage.getItem(AI_KEY_STORAGE);
        if (storedKey) setOpenRouterKey(storedKey);
        const storedModel = await AsyncStorage.getItem(AI_MODEL_STORAGE);
        if (storedModel) setAiModel(storedModel as AIModelPref);
      } catch {}
    })();
  }, []);

  // Fetch connected accounts
  const fetchConnections = useCallback(async () => {
    if (!company) return;
    try {
      const { data: ads } = await supabase
        .from('ad_accounts')
        .select('*')
        .eq('company_id', company.id);
      if (ads) setAdAccounts(ads);

      const { data: socials } = await supabase
        .from('social_connections')
        .select('*')
        .eq('company_id', company.id);
      if (socials) setSocialConnections(socials);
    } catch {}
  }, [company]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Check OAuth social connection status
  useEffect(() => {
    if (!company) return;
    setSocialStatusLoading(true);
    Promise.all([
      isFacebookConnected(company.id),
      isTikTokConnected(company.id),
      isYouTubeConnected(company.id),
    ])
      .then(([fb, tt, yt]) => {
        setFbConnected(fb);
        setTiktokConnected(tt);
        setYtConnected(yt);
      })
      .catch(() => {})
      .finally(() => setSocialStatusLoading(false));
  }, [company]);

  const oauthRedirectUri = Linking.createURL('oauth-callback');

  const handleConnectFacebook = useCallback(() => {
    try {
      startFacebookOAuth(oauthRedirectUri);
    } catch (err: any) {
      crossAlert('Error', err.message);
    }
  }, [oauthRedirectUri]);

  const handleConnectTikTok = useCallback(() => {
    try {
      startTikTokOAuth(oauthRedirectUri);
    } catch (err: any) {
      crossAlert('Error', err.message);
    }
  }, [oauthRedirectUri]);

  const handleConnectYouTube = useCallback(() => {
    try {
      startYouTubeOAuth(oauthRedirectUri);
    } catch (err: any) {
      crossAlert('Error', err.message);
    }
  }, [oauthRedirectUri]);

  // Save company + profile
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const errors: string[] = [];

      if (company) {
        const servicesArray = servicesOffered
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const { error: companyError } = await supabase
          .from('companies')
          .update({
            name: companyName.trim(),
            phone: phone.trim(),
            website: website.trim(),
            city: city.trim(),
            state: state.trim().toUpperCase().slice(0, 2),
            services_offered: servicesArray.length > 0 ? servicesArray : null,
            service_radius_miles: serviceRadius ? Number(serviceRadius) : null,
          })
          .eq('id', company.id);

        if (companyError) errors.push(companyError.message);
      }

      if (profile) {
        const { error: userError } = await supabase
          .from('users')
          .update({ name: userName.trim() })
          .eq('id', profile.id);

        if (userError) errors.push(userError.message);
      }

      if (errors.length > 0) {
        crossAlert('Save failed', errors.join('\n'));
        return;
      }

      await fetchProfile();
      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    company,
    profile,
    companyName,
    phone,
    website,
    city,
    state,
    servicesOffered,
    serviceRadius,
    userName,
    fetchProfile,
  ]);

  // Save AI config
  const handleSaveAI = useCallback(async () => {
    setSavingAI(true);
    try {
      await AsyncStorage.setItem(AI_KEY_STORAGE, openRouterKey.trim());
      await AsyncStorage.setItem(AI_MODEL_STORAGE, aiModel);
      crossAlert('Saved', 'AI configuration saved.');
    } catch {
      crossAlert('Error', 'Failed to save AI configuration.');
    } finally {
      setSavingAI(false);
    }
  }, [openRouterKey, aiModel]);

  // Connect an account
  const handleConnect = useCallback(async () => {
    if (!company || !connectInput.trim()) return;
    setConnectSaving(true);
    try {
      if (connectModal.type === 'ad') {
        const { error } = await supabase.from('ad_accounts').insert({
          company_id: company.id,
          platform: connectModal.platform,
          account_id: connectInput.trim(),
          account_name: connectInput.trim(),
          connected: true,
        });
        if (error) {
          crossAlert('Error', error.message);
          return;
        }
      } else {
        const { error } = await supabase.from('social_connections').insert({
          company_id: company.id,
          platform: connectModal.platform,
          handle: connectInput.trim(),
          connected: true,
        });
        if (error) {
          crossAlert('Error', error.message);
          return;
        }
      }
      crossAlert('Connected', `${connectModal.label} connected successfully.`);
      setConnectModal({ visible: false, platform: '', type: 'ad', label: '' });
      setConnectInput('');
      await fetchConnections();
    } finally {
      setConnectSaving(false);
    }
  }, [company, connectInput, connectModal, fetchConnections]);

  // Disconnect an account
  const handleDisconnect = useCallback(
    (type: 'ad' | 'social', id: string, label: string) => {
      crossAlert('Disconnect', `Remove ${label} connection?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const table = type === 'ad' ? 'ad_accounts' : 'social_connections';
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) {
              crossAlert('Error', 'Failed to disconnect. Please try again.');
              return;
            }
            await fetchConnections();
          },
        },
      ]);
    },
    [fetchConnections]
  );

  const handleSignOut = useCallback(() => {
    crossAlert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  }, [signOut]);

  const handleChangePassword = useCallback(async () => {
    if (!profile?.email) return;
    crossAlert(
      'Change Password',
      'We will send a password reset link to your email address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Reset Link',
          onPress: async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(
              profile.email
            );
            if (error) {
              crossAlert('Error', error.message);
            } else {
              crossAlert('Sent', 'Check your email for the reset link.');
            }
          },
        },
      ]
    );
  }, [profile]);

  const handleDeleteAccount = useCallback(() => {
    crossAlert(
      'Delete Account',
      'Account deletion is permanent and cannot be undone. All company data, leads, and ad configurations will be lost. Please contact support@canopy.app to proceed with account deletion.',
      [{ text: 'OK', style: 'cancel' }]
    );
  }, []);

  // Helpers
  const currentPlan = company?.plan ?? 'trial';
  const trialDays = trialDaysRemaining(company?.trial_ends_at);
  const subStatus = company?.subscription_status ?? 'trialing';

  const planLabel =
    currentPlan === 'trial'
      ? `Trial (${trialDays}d left)`
      : currentPlan === 'pro'
      ? PLANS.pro.name
      : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);

  const planBadgeStyle =
    currentPlan === 'trial' ? styles.badgeTrial : styles.badgePro;
  const planBadgeTextStyle =
    currentPlan === 'trial' ? styles.badgeTrialText : styles.badgeProText;

  const subStatusLabel =
    subStatus === 'trialing'
      ? 'Trialing'
      : subStatus === 'active'
      ? 'Active'
      : subStatus === 'past_due'
      ? 'Past Due'
      : subStatus === 'canceled'
      ? 'Canceled'
      : subStatus;

  const subBadgeBg =
    subStatus === 'active'
      ? Colors.successBg
      : subStatus === 'trialing'
      ? Colors.warningBg
      : subStatus === 'past_due'
      ? Colors.dangerBg
      : Colors.dangerBg;
  const subBadgeText =
    subStatus === 'active'
      ? '#065F46'
      : subStatus === 'trialing'
      ? '#92400E'
      : Colors.danger;

  // Connection helpers
  const getAdAccount = (platform: string) =>
    adAccounts.find((a) => a.platform === platform);
  const getSocial = (platform: string) =>
    socialConnections.find((s) => s.platform === platform);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';

  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() +
      profile.role.slice(1).replace('_', ' ')
    : '--';

  const maskedKey =
    openRouterKey.length > 8
      ? openRouterKey.slice(0, 4) +
        '\u2022'.repeat(openRouterKey.length - 8) +
        openRouterKey.slice(-4)
      : '\u2022'.repeat(openRouterKey.length);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.textInverse} />
          ) : savedVisible ? (
            <Text style={styles.saveBtnText}>Saved</Text>
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── ACCOUNT ──────────────────────────────────── */}
        <Text style={styles.sectionHeader}>ACCOUNT</Text>
        <View style={styles.card}>
          <InputRow
            label="Your name"
            value={userName}
            onChangeText={setUserName}
            placeholder="Jane Smith"
          />
          <Divider />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValueReadOnly} numberOfLines={1}>
              {profile?.email ?? '--'}
            </Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Role</Text>
            <Text style={styles.rowValueReadOnly}>{roleLabel}</Text>
          </View>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={handleChangePassword}
            activeOpacity={0.7}
          >
            <Text style={styles.rowActionLabel}>Change password</Text>
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── COMPANY ──────────────────────────────────── */}
        <Text style={styles.sectionHeader}>COMPANY</Text>
        <View style={styles.card}>
          <InputRow
            label="Company name"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Acme Tree Service"
          />
          <Divider />
          <InputRow
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Springfield"
          />
          <Divider />
          <InputRow
            label="State"
            value={state}
            onChangeText={(t) => setState(t.toUpperCase().slice(0, 2))}
            placeholder="IL"
            maxLength={2}
          />
          <Divider />
          <InputRow
            label="Services offered"
            value={servicesOffered}
            onChangeText={setServicesOffered}
            placeholder="Tree removal, trimming, stump grinding"
          />
          <Divider />
          <InputRow
            label="Service radius (mi)"
            value={serviceRadius}
            onChangeText={(t) => setServiceRadius(t.replace(/[^0-9]/g, ''))}
            placeholder="25"
            keyboardType="number-pad"
          />
          <Divider />
          <InputRow
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 000-0000"
            keyboardType="phone-pad"
          />
          <Divider />
          <InputRow
            label="Website"
            value={website}
            onChangeText={setWebsite}
            placeholder="https://limbwalkers.com"
          />
        </View>

        {/* ── AI CONFIGURATION ─────────────────────────── */}
        <Text style={styles.sectionHeader}>AI CONFIGURATION</Text>
        <View style={styles.card}>
          <View style={styles.aiNote}>
            <Text style={styles.aiNoteText}>
              Enter your OpenRouter API key to enable AI-powered ad copy,
              content generation, lead scoring, and daily briefings. Get a key
              at openrouter.ai
            </Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>API Key</Text>
            <View style={styles.apiKeyContainer}>
              <TextInput
                style={[styles.input, styles.apiKeyInput]}
                value={showApiKey ? openRouterKey : maskedKey}
                onChangeText={setOpenRouterKey}
                placeholder="sk-or-..."
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showApiKey}
              />
              <TouchableOpacity
                onPress={() => setShowApiKey(!showApiKey)}
                style={styles.eyeBtn}
              >
                <Text style={styles.eyeBtnText}>
                  {showApiKey ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>AI Model</Text>
            <View style={styles.modelPicker}>
              {(['fast', 'claude', 'gpt4o'] as AIModelPref[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modelChip,
                    aiModel === m && styles.modelChipActive,
                  ]}
                  onPress={() => setAiModel(m)}
                >
                  <Text
                    style={[
                      styles.modelChipText,
                      aiModel === m && styles.modelChipTextActive,
                    ]}
                  >
                    {m === 'fast'
                      ? 'Fast'
                      : m === 'claude'
                      ? 'Claude'
                      : 'GPT-4o'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Divider />
          <TouchableOpacity
            style={[styles.row, styles.aiSaveRow]}
            onPress={handleSaveAI}
            activeOpacity={0.7}
            disabled={savingAI}
          >
            {savingAI ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.rowActionLabel}>Save AI settings</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── CONNECTED ACCOUNTS ───────────────────────── */}
        <Text style={styles.sectionHeader}>CONNECTED ACCOUNTS</Text>
        <View style={styles.card}>
          <ConnectionRow
            label="Google Ads"
            connection={getAdAccount('google')}
            onConnect={() =>
              setConnectModal({
                visible: true,
                platform: 'google',
                type: 'ad',
                label: 'Google Ads',
              })
            }
            onDisconnect={(id) => handleDisconnect('ad', id, 'Google Ads')}
          />
          <Divider />
          <ConnectionRow
            label="Facebook Ads"
            connection={getAdAccount('facebook')}
            onConnect={() =>
              setConnectModal({
                visible: true,
                platform: 'facebook',
                type: 'ad',
                label: 'Facebook Ads',
              })
            }
            onDisconnect={(id) => handleDisconnect('ad', id, 'Facebook Ads')}
          />
          <Divider />
          <ConnectionRow
            label="TikTok"
            connection={getSocial('tiktok')}
            onConnect={() =>
              setConnectModal({
                visible: true,
                platform: 'tiktok',
                type: 'social',
                label: 'TikTok',
              })
            }
            onDisconnect={(id) => handleDisconnect('social', id, 'TikTok')}
          />
          <Divider />
          <ConnectionRow
            label="Instagram"
            connection={getSocial('instagram')}
            onConnect={() =>
              setConnectModal({
                visible: true,
                platform: 'instagram',
                type: 'social',
                label: 'Instagram',
              })
            }
            onDisconnect={(id) => handleDisconnect('social', id, 'Instagram')}
          />
          <Divider />
          <ConnectionRow
            label="YouTube"
            connection={getSocial('youtube')}
            onConnect={() =>
              setConnectModal({
                visible: true,
                platform: 'youtube',
                type: 'social',
                label: 'YouTube',
              })
            }
            onDisconnect={(id) => handleDisconnect('social', id, 'YouTube')}
          />
        </View>

        {/* ── SOCIAL CONNECTIONS (OAuth) ──────────────── */}
        <Text style={styles.sectionHeader}>SOCIAL CONNECTIONS</Text>
        <View style={styles.card}>
          {socialStatusLoading ? (
            <View style={styles.socialLoadingRow}>
              <ActivityIndicator size="small" color={Colors.textTertiary} />
              <Text style={styles.socialLoadingText}>Checking connections...</Text>
            </View>
          ) : (
            <>
              {/* Facebook / Instagram */}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Facebook / Instagram</Text>
                {fbConnected ? (
                  <View style={styles.connectedBadge}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleConnectFacebook} style={styles.connectBtn}>
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Divider />
              {/* TikTok */}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>TikTok</Text>
                {tiktokConnected ? (
                  <View style={styles.connectedBadge}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleConnectTikTok} style={styles.connectBtn}>
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Divider />
              {/* YouTube */}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>YouTube</Text>
                {ytConnected ? (
                  <View style={styles.connectedBadge}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleConnectYouTube} style={styles.connectBtn}>
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── SUBSCRIPTION ─────────────────────────────── */}
        <Text style={styles.sectionHeader}>SUBSCRIPTION</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current plan</Text>
            <View style={[styles.planBadge, planBadgeStyle]}>
              <Text style={[styles.planBadgeText, planBadgeTextStyle]}>
                {planLabel}
              </Text>
            </View>
          </View>
          {currentPlan === 'trial' && (
            <>
              <Divider />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Trial remaining</Text>
                <Text
                  style={[
                    styles.rowValueReadOnly,
                    trialDays <= 2 && { color: Colors.danger },
                  ]}
                >
                  {trialDays} day{trialDays !== 1 ? 's' : ''}
                </Text>
              </View>
            </>
          )}
          <Divider />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Status</Text>
            <View
              style={[styles.planBadge, { backgroundColor: subBadgeBg }]}
            >
              <Text style={[styles.planBadgeText, { color: subBadgeText }]}>
                {subStatusLabel}
              </Text>
            </View>
          </View>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/(tabs)/billing')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowActionLabel}>Manage billing</Text>
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── APP ──────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>APP</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValueReadOnly}>{appVersion}</Text>
          </View>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <Text style={styles.deleteText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Connect Modal ──────────────────────────────── */}
      <Modal
        visible={connectModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setConnectModal({ visible: false, platform: '', type: 'ad', label: '' })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Connect {connectModal.label}
            </Text>
            <Text style={styles.modalDesc}>
              {connectModal.type === 'ad'
                ? `Enter your ${connectModal.label} account ID to connect.`
                : `Enter your ${connectModal.label} handle or username.`}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={connectInput}
              onChangeText={setConnectInput}
              placeholder={
                connectModal.type === 'ad'
                  ? 'Account ID (e.g. 123-456-7890)'
                  : '@yourhandle'
              }
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setConnectModal({
                    visible: false,
                    platform: '',
                    type: 'ad',
                    label: '',
                  });
                  setConnectInput('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConnectBtn,
                  connectSaving && styles.saveBtnDisabled,
                ]}
                onPress={handleConnect}
                disabled={connectSaving || !connectInput.trim()}
              >
                {connectSaving ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.modalConnectText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

interface InputRowProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'numeric';
  maxLength?: number;
}

function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
}: InputRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

interface ConnectionRowProps {
  label: string;
  connection?: { id: string; account_id?: string; handle?: string; account_name?: string } | undefined;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
}

function ConnectionRow({
  label,
  connection,
  onConnect,
  onDisconnect,
}: ConnectionRowProps) {
  const isConnected = Boolean(connection);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {isConnected ? (
        <View style={styles.connectedRow}>
          <View style={styles.connectedBadge}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
          <TouchableOpacity
            onPress={() => onDisconnect(connection!.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.disconnectText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={onConnect} style={styles.connectBtn}>
          <Text style={styles.connectBtnText}>Connect</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.layout.screenPadding,
    paddingTop: 56,
    paddingBottom: Theme.space.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Theme.font.size.title,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.lg,
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.textInverse,
  },

  // Section headers
  sectionHeader: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    marginTop: Theme.space.xxl,
    marginBottom: Theme.space.sm,
    marginHorizontal: Theme.layout.screenPadding,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    marginHorizontal: Theme.layout.screenPadding,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.md,
    minHeight: Theme.tapTarget.min,
  },
  rowLabel: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    width: 140,
    flexShrink: 0,
  },
  rowValueReadOnly: {
    flex: 1,
    fontSize: Theme.font.size.body,
    color: Colors.textTertiary,
    textAlign: 'right',
  },
  rowActionLabel: {
    flex: 1,
    fontSize: Theme.font.size.body,
    color: Colors.primary,
    fontWeight: Theme.font.weight.medium,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textTertiary,
    lineHeight: 22,
  },

  // Input
  input: {
    flex: 1,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    textAlign: 'right',
    paddingVertical: 0,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Theme.space.lg,
  },

  // Plan badge
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.full,
  },
  planBadgeText: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.bold,
  },
  badgeTrial: { backgroundColor: Colors.warningBg },
  badgeTrialText: { color: '#92400E' },
  badgePro: { backgroundColor: Colors.primary + '20' },
  badgeProText: { color: Colors.primaryDark },

  // Sign out / Delete
  signOutText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.medium,
    color: Colors.danger,
  },
  deleteText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.medium,
    color: Colors.danger,
    opacity: 0.8,
  },

  // AI section
  aiNote: {
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.md,
  },
  aiNoteText: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  apiKeyContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  apiKeyInput: {
    flex: 1,
    marginRight: 8,
  },
  eyeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eyeBtnText: {
    fontSize: Theme.font.size.small,
    color: Colors.primary,
    fontWeight: Theme.font.weight.medium,
  },
  modelPicker: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  modelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modelChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  modelChipText: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },
  modelChipTextActive: {
    color: Colors.primary,
    fontWeight: Theme.font.weight.bold,
  },
  aiSaveRow: {
    justifyContent: 'center',
  },

  // Connected accounts
  connectedRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.full,
    gap: 6,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  connectedText: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.bold,
    color: '#065F46',
  },
  disconnectText: {
    fontSize: Theme.font.size.small,
    color: Colors.danger,
    fontWeight: Theme.font.weight.medium,
  },
  connectBtn: {
    flex: 1,
    alignItems: 'flex-end',
  },
  connectBtnText: {
    fontSize: Theme.font.size.body,
    color: Colors.primary,
    fontWeight: Theme.font.weight.medium,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.layout.screenPadding,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.xxl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    marginBottom: Theme.space.sm,
  },
  modalDesc: {
    fontSize: Theme.font.size.small,
    color: Colors.textSecondary,
    marginBottom: Theme.space.lg,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Theme.radius.md,
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.md,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Theme.space.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.radius.lg,
  },
  modalCancelText: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },
  modalConnectBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Theme.radius.lg,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConnectText: {
    fontSize: Theme.font.size.body,
    color: Colors.textInverse,
    fontWeight: Theme.font.weight.semibold,
  },

  // Social connections loading
  socialLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.xl,
    gap: 10,
  },
  socialLoadingText: {
    fontSize: Theme.font.size.small,
    color: Colors.textTertiary,
  },

  bottomPad: { height: 32 },
});
