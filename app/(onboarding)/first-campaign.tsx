import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function FirstCampaignStep() {
  const { company, updateOnboardingStep } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const city = company?.city ?? 'Your City';
  const topService = company?.services_offered?.[0] ?? 'Tree Removal';
  const campaignName = `${topService} in ${city}`;

  const keywords = [
    `"${topService.toLowerCase()} ${city.toLowerCase()}"`,
    `"emergency ${topService.toLowerCase()} ${city.toLowerCase()}"`,
    `"best ${topService.toLowerCase()} near me"`,
    `"affordable ${topService.toLowerCase()} ${city.toLowerCase()}"`,
  ];

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('campaigns').insert({
        company_id: company?.id,
        name: campaignName,
        platform: 'google',
        status: 'draft',
        daily_budget_cents: 2000,
        target_keywords: keywords,
        city: city,
        service_type: topService,
      });
      if (error) throw error;
      await updateOnboardingStep(9);
      router.push('/(onboarding)/done');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create campaign.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await updateOnboardingStep(9);
    router.push('/(onboarding)/done');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 8 && styles.dotActive, i < 8 && styles.dotDone]} />
        ))}
      </View>

      <Text style={styles.step}>Step 8 of 9</Text>
      <Text style={styles.title}>Your first campaign is ready</Text>
      <Text style={styles.subtitle}>
        We pre-filled everything based on your top service and location. Review it and launch when you're ready.
      </Text>

      <View style={styles.campaignCard}>
        <View style={styles.campaignHeader}>
          <Text style={styles.campaignPlatform}>🔍 Google Search</Text>
          <View style={styles.draftBadge}>
            <Text style={styles.draftBadgeText}>Draft</Text>
          </View>
        </View>

        <Text style={styles.campaignName}>{campaignName}</Text>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Daily budget</Text>
          <Text style={styles.detailValue}>$20 / day</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Bid strategy</Text>
          <Text style={styles.detailValue}>Target CPA</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Target area</Text>
          <Text style={styles.detailValue}>{city} + {company?.service_radius_miles ?? 25} mi radius</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.keywordsLabel}>Target keywords</Text>
        <View style={styles.keywordsList}>
          {keywords.map(kw => (
            <View key={kw} style={styles.keywordChip}>
              <Text style={styles.keywordText}>{kw}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.tip}>
        <Text style={styles.tipText}>
          💡 This campaign will be saved as a draft. You can review and launch it from your dashboard at any time.
        </Text>
      </View>

      <Button label="Looks good — create it!" onPress={handleCreate} loading={loading} size="lg" />
      <Button label="Skip for now" onPress={handleSkip} variant="ghost" />
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
  campaignCard: { backgroundColor: Colors.surface, padding: 20, borderRadius: Theme.radius.xl, gap: 12, ...Theme.shadow.sm },
  campaignHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  campaignPlatform: { fontSize: Theme.font.size.body, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  draftBadge: { backgroundColor: Colors.warning + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full },
  draftBadgeText: { fontSize: Theme.font.size.small, color: Colors.warning, fontWeight: Theme.font.weight.semibold },
  campaignName: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  detailValue: { fontSize: Theme.font.size.body, color: Colors.text, fontWeight: Theme.font.weight.medium },
  keywordsLabel: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5 },
  keywordsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keywordChip: { backgroundColor: Colors.primaryDark + '10', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Theme.radius.sm },
  keywordText: { fontSize: Theme.font.size.small, color: Colors.primary, fontFamily: 'monospace' },
  tip: { backgroundColor: Colors.warning + '15', padding: 14, borderRadius: Theme.radius.lg },
  tipText: { fontSize: Theme.font.size.small, color: Colors.text, lineHeight: 20 },
});
