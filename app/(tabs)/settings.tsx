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
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { trialDaysRemaining, PLANS } from '@/lib/cashapp';

export default function SettingsScreen() {
  const { profile, company, signOut, fetchProfile } = useAuthStore();

  // Company fields
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');
  const [serviceRadius, setServiceRadius] = useState('');

  // Account fields
  const [userName, setUserName] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);

  // Populate fields from store
  useEffect(() => {
    if (company) {
      setCompanyName(company.name ?? '');
      setPhone(company.phone ?? '');
      setCity(company.city ?? '');
      setState(company.state ?? '');
      setAddress(company.address ?? '');
      setServiceRadius(company.service_radius_miles != null ? String(company.service_radius_miles) : '');
    }
    if (profile) {
      setUserName(profile.name ?? '');
    }
  }, [company, profile]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const errors: string[] = [];

      // Update company
      if (company) {
        const { error: companyError } = await supabase
          .from('companies')
          .update({
            name: companyName.trim(),
            phone: phone.trim(),
            city: city.trim(),
            state: state.trim().toUpperCase().slice(0, 2),
            address: address.trim(),
            service_radius_miles: serviceRadius ? Number(serviceRadius) : null,
          })
          .eq('id', company.id);

        if (companyError) errors.push(companyError.message);
      }

      // Update user name
      if (profile) {
        const { error: userError } = await supabase
          .from('users')
          .update({ name: userName.trim() })
          .eq('id', profile.id);

        if (userError) errors.push(userError.message);
      }

      if (errors.length > 0) {
        Alert.alert('Save failed', errors.join('\n'));
        return;
      }

      // Refresh store state
      await fetchProfile();

      // Show brief confirmation
      setSavedVisible(true);
      setTimeout(() => setSavedVisible(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [saving, company, profile, companyName, phone, city, state, address, serviceRadius, userName, fetchProfile]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  }, [signOut]);

  const currentPlan = company?.plan ?? 'trial';
  const trialDays = trialDaysRemaining(company?.trial_ends_at);

  const planLabel =
    currentPlan === 'trial'
      ? `Trial (${trialDays}d left)`
      : currentPlan === 'pro'
      ? PLANS.pro.name
      : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);

  const planBadgeStyle =
    currentPlan === 'trial'
      ? styles.badgeTrial
      : styles.badgePro;

  const planBadgeTextStyle =
    currentPlan === 'trial'
      ? styles.badgeTrialText
      : styles.badgeProText;

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
            <Text style={styles.saveBtnText}>Saved ✓</Text>
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
        {/* Company Info */}
        <Text style={styles.sectionHeader}>COMPANY INFO</Text>
        <View style={styles.card}>
          <InputRow
            label="Company name"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Acme Tree Service"
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
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St"
          />
          <Divider />
          <InputRow
            label="Service radius (mi)"
            value={serviceRadius}
            onChangeText={(t) => setServiceRadius(t.replace(/[^0-9]/g, ''))}
            placeholder="25"
            keyboardType="number-pad"
          />
        </View>

        {/* Account */}
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
              {profile?.email ?? '—'}
            </Text>
          </View>
        </View>

        {/* Billing */}
        <Text style={styles.sectionHeader}>BILLING</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current plan</Text>
            <View style={[styles.planBadge, planBadgeStyle]}>
              <Text style={[styles.planBadgeText, planBadgeTextStyle]}>{planLabel}</Text>
            </View>
          </View>
          <Divider />
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/(tabs)/billing')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowActionLabel}>Manage billing</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Danger */}
        <Text style={styles.sectionHeader}>ACCOUNT ACTIONS</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
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

function InputRow({ label, value, onChangeText, placeholder, keyboardType, maxLength }: InputRowProps) {
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

  // Section headers (iOS-style all-caps gray)
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
  badgeStarter: { backgroundColor: Colors.infoBg },
  badgeStarterText: { color: Colors.info },
  badgeGrowth: { backgroundColor: Colors.successBg },
  badgeGrowthText: { color: '#065F46' },
  badgePro: { backgroundColor: Colors.primary + '20' },
  badgeProText: { color: Colors.primaryDark },

  // Sign out
  signOutText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.medium,
    color: Colors.danger,
  },

  bottomPad: { height: 32 },
});
