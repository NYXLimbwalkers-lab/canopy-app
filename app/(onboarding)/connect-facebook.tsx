import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';

export default function ConnectFacebookStep() {
  const { updateOnboardingStep } = useAuthStore();

  const handleConnect = async () => {
    try { await updateOnboardingStep(5); } catch {}
    router.push('/(onboarding)/connect-tiktok');
  };

  const handleSkip = async () => {
    try { await updateOnboardingStep(5); } catch {}
    router.push('/(onboarding)/connect-tiktok');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 4 && styles.dotActive, i < 4 && styles.dotDone]} />
        ))}
      </View>

      <Text style={styles.step}>Step 4 of 9</Text>
      <Text style={styles.title}>Connect your Facebook account</Text>
      <Text style={styles.subtitle}>
        This lets Canopy run Facebook Lead Ads and automatically bring new leads into your CRM.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardIcon}>📘</Text>
        <Text style={styles.cardTitle}>What you get with Facebook connected:</Text>
        {[
          '✅ Facebook Lead Ads that flow directly into your CRM',
          '✅ Before/after photo ad creation from your job photos',
          '✅ Retargeting audiences built from your website visitors',
          '✅ A/B test automation to find your best-performing ads',
        ].map(item => (
          <Text key={item} style={styles.cardItem}>{item}</Text>
        ))}
      </View>

      <Button label="Connect Facebook Account →" onPress={handleConnect} size="lg" />
      <Button label="Skip for now" onPress={handleSkip} variant="ghost" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 16, paddingBottom: 40, paddingTop: 0 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 52, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
  dotDone: { backgroundColor: Colors.primaryLight },
  step: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  title: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 24 },
  card: { backgroundColor: Colors.surface, padding: 20, borderRadius: Theme.radius.xl, gap: 10, ...Theme.shadow.sm },
  cardIcon: { fontSize: 36 },
  cardTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  cardItem: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 24 },
});
