import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, Modal,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { PLAN, getCashAppPaymentUrl, trialDaysRemaining } from '@/lib/cashapp';
import { useAuthStore } from '@/lib/stores/authStore';

export default function BillingScreen() {
  const { company } = useAuthStore();
  const [confirmModal, setConfirmModal] = useState(false);
  const currentPlan = company?.plan ?? 'trial';
  const isActive = ['pro', 'active', 'trialing'].includes(currentPlan);
  const trialDays = trialDaysRemaining(company?.trial_ends_at);
  const isTrialing = currentPlan === 'trial';

  const handleOpenCashApp = async () => {
    const url = getCashAppPaymentUrl();
    await Linking.openURL(url);
    setConfirmModal(false);
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
              ? `⏰ ${trialDays} day${trialDays !== 1 ? 's' : ''} left in your free trial`
              : '⚠️ Your trial has ended'}
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
          <Text style={styles.bannerTitle}>✅ Canopy Pro — Active</Text>
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
              <Text style={styles.check}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {!isActive && (
          <TouchableOpacity style={styles.subscribeBtn} onPress={() => setConfirmModal(true)}>
            <Text style={styles.subscribeBtnText}>
              {isTrialing && trialDays > 0
                ? `Subscribe now — $${PLAN.price}/mo after trial`
                : `Subscribe — $${PLAN.price}/month`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* How it works */}
      <View style={styles.howCard}>
        <Text style={styles.howTitle}>💚 How to subscribe</Text>
        {[
          'Tap "Subscribe" above',
          `Cash App will open — send $${PLAN.price} to ${process.env.EXPO_PUBLIC_CASHAPP_HANDLE ?? '$canopyapp'}`,
          'Include your account email in the Cash App note',
          'We activate your plan within 1 hour',
        ].map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>
        7-day free trial · Cancel anytime by stopping payments · No contracts
      </Text>

      {/* Confirm modal */}
      <Modal visible={confirmModal} transparent animationType="slide" onRequestClose={() => setConfirmModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setConfirmModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Subscribe to Canopy Pro</Text>
            <Text style={styles.sheetAmount}>${PLAN.price}/month</Text>
            <Text style={styles.sheetInstructions}>
              This opens Cash App. Send ${PLAN.price} and include your email in the note — we'll activate your plan within 1 hour.
            </Text>
            <TouchableOpacity style={styles.cashAppBtn} onPress={handleOpenCashApp}>
              <Text style={styles.cashAppBtnText}>💚 Open Cash App → Send ${PLAN.price}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  subscribeBtn: { backgroundColor: '#00D632', padding: 16, borderRadius: Theme.radius.lg, alignItems: 'center', marginTop: 4 },
  subscribeBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#fff' },
  howCard: { backgroundColor: Colors.surface, padding: 20, borderRadius: Theme.radius.xl, gap: 14 },
  howTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#00D632', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNumText: { fontSize: 12, fontWeight: Theme.font.weight.bold, color: '#fff' },
  stepText: { flex: 1, fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  footer: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text, textAlign: 'center' },
  sheetAmount: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.heavy, color: '#00D632', textAlign: 'center' },
  sheetInstructions: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  cashAppBtn: { backgroundColor: '#00D632', padding: 16, borderRadius: Theme.radius.lg, alignItems: 'center' },
  cashAppBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#fff' },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
});
