import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function GoogleAdsScriptStep() {
  const { updateOnboardingStep, company } = useAuthStore();
  const [hasAds, setHasAds] = useState<'yes' | 'no' | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    try {
      // Save customer ID if provided
      if (customerId.trim() && company) {
        await supabase.from('ad_accounts').upsert({
          company_id: company.id,
          platform: 'google',
          account_id: customerId.replace(/-/g, '').trim(),
          connected: true,
        }, { onConflict: 'company_id,platform' });
      }
      await updateOnboardingStep(7);
    } catch {}
    setSaving(false);
    router.push('/(onboarding)/ai-strategy');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 6 && styles.dotActive, i < 6 && styles.dotDone]} />
        ))}
      </View>

      <Text style={styles.step}>Step 6 of 9</Text>
      <Text style={styles.title}>Do you run Google Ads?</Text>
      <Text style={styles.subtitle}>
        Google Ads is how most tree companies get calls from people searching "tree removal near me."
      </Text>

      {/* Yes / No choice */}
      <View style={styles.choiceRow}>
        <Button
          label="✅  Yes, I run Google Ads"
          onPress={() => setHasAds('yes')}
          variant={hasAds === 'yes' ? 'primary' : 'secondary'}
          style={styles.choiceBtn}
        />
        <Button
          label="❌  No / Not yet"
          onPress={() => setHasAds('no')}
          variant={hasAds === 'no' ? 'primary' : 'secondary'}
          style={styles.choiceBtn}
        />
      </View>

      {/* If YES — ask for Customer ID */}
      {hasAds === 'yes' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enter your Google Ads Customer ID</Text>
          <Text style={styles.cardDesc}>
            It's the 10-digit number at the top of your Google Ads dashboard. It looks like{' '}
            <Text style={styles.mono}>123-456-7890</Text>
          </Text>
          <View style={styles.findSteps}>
            {[
              'Go to ads.google.com',
              'Sign in to your account',
              'Look at the top-right corner — you\'ll see a number like 123-456-7890',
              'That\'s your Customer ID — type it below',
            ].map((step, i) => (
              <View key={i} style={styles.findRow}>
                <View style={styles.findNum}>
                  <Text style={styles.findNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.findText}>{step}</Text>
              </View>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={customerId}
            onChangeText={setCustomerId}
            placeholder="123-456-7890"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.handoffNote}>
            🙌 Once you enter this, our team connects your account and imports your campaigns automatically. No scripts needed.
          </Text>
        </View>
      )}

      {/* If NO — explain the value */}
      {hasAds === 'no' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No problem — we'll help you start</Text>
          <Text style={styles.cardDesc}>
            After setup, Canopy will walk you through launching your first Google Ads campaign. Tree removal ads typically cost $15–40 per lead.
          </Text>
          <View style={styles.statRow}>
            {[
              { label: 'Avg cost per lead', value: '$25' },
              { label: 'Typical close rate', value: '30%' },
              { label: 'Avg job revenue', value: '$800' },
            ].map(s => (
              <View key={s.label} style={styles.statItem}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {hasAds !== null && (
        <Button
          label={hasAds === 'yes' && customerId.trim() ? 'Save & continue →' : 'Continue →'}
          onPress={handleNext}
          loading={saving}
          size="lg"
        />
      )}
      <Button label="Skip for now" onPress={handleNext} variant="ghost" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 16, paddingBottom: 40 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 52, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
  dotDone: { backgroundColor: Colors.primaryLight },
  step: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  title: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 24 },
  choiceRow: { flexDirection: 'row', gap: 12 },
  choiceBtn: { flex: 1 },
  card: { backgroundColor: Colors.surface, padding: 20, borderRadius: Theme.radius.xl, gap: 14, ...Theme.shadow.sm },
  cardTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  cardDesc: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  mono: { fontFamily: 'monospace', color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  findSteps: { gap: 10 },
  findRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  findNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  findNumText: { color: Colors.textInverse, fontSize: 12, fontWeight: Theme.font.weight.bold },
  findText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 22 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: 14,
    fontSize: Theme.font.size.title,
    color: Colors.text,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  handoffNote: { fontSize: Theme.font.size.small, color: Colors.success, lineHeight: 20, backgroundColor: Colors.successBg, padding: 12, borderRadius: Theme.radius.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.heavy, color: Colors.primary },
  statLabel: { fontSize: Theme.font.size.caption, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },
});
