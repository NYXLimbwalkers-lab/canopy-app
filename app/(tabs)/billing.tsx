import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, Modal, ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { PLAN, trialDaysRemaining } from '@/lib/stripe';
import { getCheckoutUrl } from '@/lib/stripe';
import { useAuthStore } from '@/lib/stores/authStore';

export default function BillingScreen() {
  const { company, profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentPlan = company?.plan ?? 'trial';
  const isActive = ['pro', 'active', 'trialing'].includes(currentPlan);
  const trialDays = trialDaysRemaining(company?.trial_ends_at);
  const isTrialing = currentPlan === 'trial' || currentPlan === 'trialing';

  const handleSubscribe = async () => {
    if (!company?.id || !profile?.email) {
      setError('Please log in to subscribe.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = await getCheckoutUrl(company.id, profile.email);
      if (url) {
        await Linking.openURL(url);
      } else {
        setError('Could not create checkout session. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Canopy Pro</Text>
      <Text style={styles.subtitle}>One plan. Everything included.</Text>

      {/* Trial / Status Banner */}
      {isTrialing && (
        <View style={[styles.banner, trialDays > 0 ? styles.bannerTrial : styles.bannerExpired]}>
          <Text style={styles.bannerTitle}>
            {trialDays > 0
              ? `\u23F0 ${trialDays} day${trialDays !== 1 ? 's' : ''} left in your free trial`
              : '\u26A0\uFE0F Your trial has ended'}
          </Text>
          <Text style={styles.bannerSub}>
            {trialDays > 0
              ? 'You have full access. Subscribe to keep it after your trial.'
              : 'Subscribe to continue using Canopy.'}
          </Text>
        </View>
      )}

      {isActive && (
        <View style={[styles.banner, styles.bannerActive]}>
          <Text style={styles.bannerTitle}>{'\u2705'} Canopy Pro — Active</Text>
          <Text style={styles.bannerSub}>You have full access to all features.</Text>
        </View>
      )}

      {/* Plan Card */}
      <View style={styles.planCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planEmoji}>{PLAN.emoji}</Text>
          <View>
            <Text style={styles.planName}>{PLAN.name}</Text>
            <Text style={styles.planDesc}>{PLAN.description}</Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>${PLAN.price}</Text>
          <Text style={styles.interval}>/month</Text>
          <View style={styles.trialBadge}>
            <Text style={styles.trialBadgeText}>7-day free trial</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.features}>
          {PLAN.features.map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.check}>{'\u2713'}</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {!isActive && (
          <TouchableOpacity
            style={[styles.subscribeBtn, loading && styles.subscribeBtnDisabled]}
            onPress={handleSubscribe}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.subscribeBtnText}>
                {isTrialing && trialDays > 0
                  ? `Subscribe now — $${PLAN.price}/mo after trial`
                  : `Subscribe — $${PLAN.price}/month`}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <Text style={styles.footer}>
        7-day free trial {'\u00B7'} Cancel anytime {'\u00B7'} Card or Cash App accepted
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 20, paddingTop: 60, paddingBottom: 60 },
  title: { fontSize: Theme.font.size.display, fontWeight: Theme.font.weight.heavy, color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', marginTop: -8 },
  banner: { padding: 16, borderRadius: Theme.radius.lg, gap: 4, borderLeftWidth: 4 },
  bannerTrial: { backgroundColor: Colors.warningBg, borderLeftColor: Colors.warning },
  bannerExpired: { backgroundColor: Colors.dangerBg, borderLeftColor: Colors.danger },
  bannerActive: { backgroundColor: Colors.successBg, borderLeftColor: Colors.success },
  bannerTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.text },
  bannerSub: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  planCard: { backgroundColor: Colors.surface, borderRadius: Theme.radius.xl, padding: 24, gap: 16, borderWidth: 2, borderColor: Colors.primary, ...Theme.shadow.md },
  planHeader: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  planEmoji: { fontSize: 40 },
  planName: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.heavy, color: Colors.text },
  planDesc: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { fontSize: 48, fontWeight: Theme.font.weight.heavy, color: Colors.primary, lineHeight: 56 },
  interval: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  trialBadge: { marginLeft: 8, backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full },
  trialBadgeText: { fontSize: Theme.font.size.caption, color: Colors.primary, fontWeight: Theme.font.weight.bold },
  divider: { height: 1, backgroundColor: Colors.border },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  check: { color: Colors.success, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.body, width: 16 },
  featureText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 22 },
  subscribeBtn: { backgroundColor: Colors.primary, padding: 16, borderRadius: Theme.radius.lg, alignItems: 'center', marginTop: 4 },
  subscribeBtnDisabled: { opacity: 0.7 },
  subscribeBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#fff' },
  errorText: { fontSize: Theme.font.size.small, color: Colors.danger, textAlign: 'center' },
  footer: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center' },
});
