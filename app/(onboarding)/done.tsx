import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';

export default function DoneStep() {
  const { company, updateCompany } = useAuthStore();

  const handleGoToDashboard = async () => {
    await updateCompany({ onboarding_completed_at: new Date().toISOString() });
    router.replace('/(tabs)/' as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, styles.dotDone]} />
        ))}
      </View>

      <View style={styles.hero}>
        <Text style={styles.checkmark}>✅</Text>
        <Text style={styles.title}>You're all set, {company?.name ?? 'your company'}!</Text>
        <Text style={styles.subtitle}>
          Your account is configured and your first campaign is drafted. Here's what's ready for you.
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🚀</Text>
          <Text style={styles.statValue}>Ready</Text>
          <Text style={styles.statLabel}>Ads ready to launch</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⭐</Text>
          <Text style={styles.statValue}>Improve it</Text>
          <Text style={styles.statLabel}>Profile score</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🤖</Text>
          <Text style={styles.statValue}>Active</Text>
          <Text style={styles.statLabel}>AI assistant</Text>
        </View>
      </View>

      <View style={styles.nextStepsList}>
        <Text style={styles.nextStepsTitle}>Your first 3 actions:</Text>
        {[
          { num: '1', text: 'Review and launch your Google Ads campaign' },
          { num: '2', text: 'Complete your Google Business Profile (takes 10 min)' },
          { num: '3', text: 'Send a review request after your next job' },
        ].map(item => (
          <View key={item.num} style={styles.nextStepRow}>
            <View style={styles.nextStepNum}>
              <Text style={styles.nextStepNumText}>{item.num}</Text>
            </View>
            <Text style={styles.nextStepText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <Button label="Go to my dashboard →" onPress={handleGoToDashboard} size="lg" />

      <Text style={styles.trialNote}>
        Your 7-day free trial started today. No charges until {
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        }.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 20, paddingBottom: 40 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 52, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotDone: { backgroundColor: Colors.primary },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  checkmark: { fontSize: 80 },
  title: { fontSize: Theme.font.size.display, fontWeight: Theme.font.weight.heavy, color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: Colors.surface, padding: 14, borderRadius: Theme.radius.xl, alignItems: 'center', gap: 4, ...Theme.shadow.sm },
  statIcon: { fontSize: 28 },
  statValue: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 16 },
  nextStepsList: { backgroundColor: Colors.surface, padding: 16, borderRadius: Theme.radius.xl, gap: 14, ...Theme.shadow.sm },
  nextStepsTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  nextStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nextStepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nextStepNumText: { color: Colors.textInverse, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.small },
  nextStepText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 24 },
  trialNote: { textAlign: 'center', fontSize: Theme.font.size.small, color: Colors.textTertiary, lineHeight: 20 },
});
