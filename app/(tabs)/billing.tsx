import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { PLANS, getCheckoutUrl, getBillingPortalUrl, trialDaysRemaining } from '@/lib/stripe';
import { useAuthStore } from '@/lib/stores/authStore';

export default function BillingScreen() {
  const { company, profile } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const currentPlan = company?.plan ?? 'trial';
  const trialDays = trialDaysRemaining(company?.trial_ends_at);

  const handleUpgrade = async (planId: keyof typeof PLANS) => {
    if (!company || !profile) return;
    setLoading(planId);
    try {
      const url = await getCheckoutUrl(planId, company.id, profile.email);
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Setup required', 'Add your Stripe keys to .env to enable billing. See .env.example for details.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!company?.stripe_customer_id) {
      Alert.alert('No subscription', 'You don\'t have an active subscription to manage.');
      return;
    }
    const url = await getBillingPortalUrl(company.stripe_customer_id);
    if (url) await Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose your plan</Text>

      {currentPlan === 'trial' && (
        <View style={styles.trialBanner}>
          <Text style={styles.trialTitle}>
            {trialDays > 0 ? `⏰ ${trialDays} days left in your free trial` : '⚠️ Your trial has ended'}
          </Text>
          <Text style={styles.trialSub}>
            {trialDays > 0 ? 'You have full access to all features. Upgrade to keep them.' : 'Choose a plan to continue using Canopy.'}
          </Text>
        </View>
      )}

      <View style={styles.plans}>
        {Object.values(PLANS).map(plan => {
          const isCurrent = currentPlan === plan.id;
          const isHighlight = plan.highlight;

          return (
            <View key={plan.id} style={[styles.planCard, isHighlight && styles.planCardHighlight]}>
              {isHighlight && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>⭐ Most Popular</Text>
                </View>
              )}

              <Text style={styles.planName}>{plan.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>${plan.price}</Text>
                <Text style={styles.interval}>/month</Text>
              </View>
              <Text style={styles.planDesc}>{plan.description}</Text>

              <View style={styles.features}>
                {plan.features.map(f => (
                  <View key={f} style={styles.featureRow}>
                    <Text style={styles.check}>✓</Text>
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.planBtn, isCurrent ? styles.planBtnCurrent : isHighlight ? styles.planBtnHighlight : styles.planBtnDefault]}
                onPress={() => !isCurrent && handleUpgrade(plan.id)}
                disabled={isCurrent || loading === plan.id}
              >
                <Text style={[styles.planBtnText, !isCurrent && isHighlight && styles.planBtnTextHighlight]}>
                  {loading === plan.id ? 'Opening...' : isCurrent ? 'Current plan' : `Upgrade to ${plan.name}`}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.cashApp}>
        <Text style={styles.cashAppTitle}>💸 Cash App Pay accepted</Text>
        <Text style={styles.cashAppDesc}>At checkout, select Cash App Pay as your payment method. All plans support it.</Text>
      </View>

      {currentPlan !== 'trial' && (
        <TouchableOpacity style={styles.manageBtn} onPress={handleManageBilling}>
          <Text style={styles.manageBtnText}>Manage subscription / Cancel</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>14-day free trial on all plans · Cancel anytime · Billed monthly</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Theme.layout.screenPadding, gap: 20, paddingTop: 60, paddingBottom: 60 },
  title: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.heavy, color: Colors.text, textAlign: 'center' },
  trialBanner: { backgroundColor: Colors.warningBg, padding: 16, borderRadius: Theme.radius.lg, gap: 6, borderLeftWidth: 4, borderLeftColor: Colors.warning },
  trialTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#92400E' },
  trialSub: { fontSize: Theme.font.size.small, color: '#92400E' },
  plans: { gap: 16 },
  planCard: { backgroundColor: Colors.surface, borderRadius: Theme.radius.xl, padding: 20, gap: 12, borderWidth: 1.5, borderColor: Colors.border, ...Theme.shadow.md },
  planCardHighlight: { borderColor: Colors.primary, borderWidth: 2 },
  popularBadge: { backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Theme.radius.full, alignSelf: 'flex-start' },
  popularBadgeText: { fontSize: Theme.font.size.caption, color: Colors.primary, fontWeight: Theme.font.weight.bold },
  planName: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  price: { fontSize: Theme.font.size.hero, fontWeight: Theme.font.weight.heavy, color: Colors.text },
  interval: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  planDesc: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  check: { color: Colors.success, fontWeight: Theme.font.weight.bold, fontSize: Theme.font.size.body },
  featureText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text },
  planBtn: { padding: 14, borderRadius: Theme.radius.lg, alignItems: 'center', marginTop: 4 },
  planBtnDefault: { backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border },
  planBtnHighlight: { backgroundColor: Colors.primary },
  planBtnCurrent: { backgroundColor: Colors.successBg },
  planBtnText: { fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body, color: Colors.text },
  planBtnTextHighlight: { color: Colors.textInverse },
  cashApp: { backgroundColor: '#F0FDF4', padding: 16, borderRadius: Theme.radius.lg, gap: 6, borderLeftWidth: 4, borderLeftColor: Colors.success },
  cashAppTitle: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.primaryDark },
  cashAppDesc: { fontSize: Theme.font.size.small, color: Colors.primaryDark },
  manageBtn: { padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Theme.radius.lg },
  manageBtnText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  footer: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center' },
});
