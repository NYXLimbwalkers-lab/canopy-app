import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { useAuthStore } from '@/lib/stores/authStore';
import { canAccess, trialDaysRemaining } from '@/lib/stripe';

interface Props {
  children: React.ReactNode;
}

export function UpgradeGate({ children }: Props) {
  const { company } = useAuthStore();
  const plan = company?.plan ?? 'trial';
  const trialDays = trialDaysRemaining(company?.trial_ends_at);
  const hasAccess = canAccess(plan);

  if (hasAccess) {
    return (
      <>
        {plan === 'trial' && trialDays <= 3 && trialDays > 0 && (
          <View style={styles.trialWarning}>
            <Text style={styles.trialWarningText}>⏰ Trial ends in {trialDays} day{trialDays !== 1 ? 's' : ''}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/billing' as any)}>
              <Text style={styles.upgradeLink}>Subscribe now →</Text>
            </TouchableOpacity>
          </View>
        )}
        {children}
      </>
    );
  }

  return (
    <View style={styles.gate}>
      <Text style={styles.lockEmoji}>🔒</Text>
      <Text style={styles.gateTitle}>Subscribe to access this</Text>
      <Text style={styles.gateDesc}>$99/month · 7-day free trial · Everything included.</Text>
      <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push('/(tabs)/billing' as any)}>
        <Text style={styles.upgradeBtnText}>View plan →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { padding: 32, alignItems: 'center', gap: 12, backgroundColor: Colors.surfaceSecondary, borderRadius: Theme.radius.xl, margin: 16 },
  lockEmoji: { fontSize: 40 },
  gateTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text, textAlign: 'center' },
  gateDesc: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center' },
  upgradeBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Theme.radius.lg, marginTop: 8 },
  upgradeBtnText: { color: Colors.textInverse, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.body },
  trialWarning: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.warningBg, padding: 10, borderRadius: Theme.radius.md, marginBottom: 8, marginHorizontal: 16 },
  trialWarningText: { fontSize: Theme.font.size.small, color: '#92400E', fontWeight: Theme.font.weight.medium },
  upgradeLink: { fontSize: Theme.font.size.small, color: Colors.primary, fontWeight: Theme.font.weight.bold },
});
