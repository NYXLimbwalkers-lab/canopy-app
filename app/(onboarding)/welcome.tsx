import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/stores/authStore';

export default function WelcomeStep() {
  const { company, updateOnboardingStep } = useAuthStore();

  const handleNext = async () => {
    await updateOnboardingStep(2);
    router.push('/(onboarding)/company-info');
  };

  return (
    <View style={styles.container}>
      <View style={styles.progress}>
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <View key={i} style={[styles.dot, i === 1 && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.content}>
        <Text style={styles.emoji}>🌳</Text>
        <Text style={styles.title}>
          Let's get {company?.name ?? 'your company'} more customers.
        </Text>
        <Text style={styles.subtitle}>
          This takes about 10 minutes. We'll set up your ads, your Google profile, and your first campaign — all ready to launch.
        </Text>

        <View style={styles.highlights}>
          {['📣 Google & Facebook ads that actually work', '⭐ Manage your reviews in one place', '🤖 AI that writes your content for you', '📊 See all your leads in one inbox'].map(item => (
            <View key={item} style={styles.highlightRow}>
              <Text style={styles.highlightText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Let's go →" onPress={handleNext} size="lg" />
        <Text style={styles.trial}>14-day free trial · No credit card needed</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Theme.layout.screenPadding },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 60, paddingBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 24 },
  content: { flex: 1, justifyContent: 'center', gap: 20 },
  emoji: { fontSize: 72, textAlign: 'center' },
  title: { fontSize: Theme.font.size.display, fontWeight: Theme.font.weight.heavy, color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: Theme.font.size.bodyLg, color: Colors.textSecondary, textAlign: 'center', lineHeight: 26 },
  highlights: { gap: 12, backgroundColor: Colors.surface, padding: 20, borderRadius: Theme.radius.xl, ...Theme.shadow.sm },
  highlightRow: {},
  highlightText: { fontSize: Theme.font.size.body, color: Colors.text },
  footer: { gap: 12, paddingBottom: 40 },
  trial: { textAlign: 'center', color: Colors.textTertiary, fontSize: Theme.font.size.small },
});
