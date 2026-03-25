import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function ConnectTikTokStep() {
  const { updateOnboardingStep, company } = useAuthStore();
  const [modal, setModal] = useState(false);
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = async () => {
    try { await updateOnboardingStep(6); } catch {}
    router.push('/(onboarding)/google-ads-script');
  };

  const handleConnect = () => {
    setUsername('');
    setError(null);
    setModal(true);
  };

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) { setError('Please enter your TikTok username.'); return; }
    if (!company) { await advance(); return; }
    setSaving(true);
    setError(null);
    const { error: dbErr } = await supabase.from('social_connections').upsert({
      company_id: company.id,
      platform: 'tiktok',
      handle: trimmed,
      connected: true,
    }, { onConflict: 'company_id,platform' });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    setModal(false);
    await advance();
  };

  const handleSkip = async () => {
    await advance();
  };

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.progress}>
          {[1,2,3,4,5,6,7,8,9].map(i => (
            <View key={i} style={[styles.dot, i === 5 && styles.dotActive, i < 5 && styles.dotDone]} />
          ))}
        </View>

        <Text style={styles.step}>Step 5 of 9</Text>
        <Text style={styles.title}>Connect your TikTok account</Text>
        <Text style={styles.subtitle}>
          Tree service videos go viral on TikTok. Connect your account and Canopy will help you turn job footage into leads.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardIcon}>🎵</Text>
          <Text style={styles.cardTitle}>What you get with TikTok connected:</Text>
          {[
            '✅ Auto-post job clips as TikTok videos after each job',
            '✅ TikTok Lead Generation ads synced to your CRM',
            '✅ Trending audio suggestions for your before/after reels',
            '✅ Analytics showing which videos drive the most calls',
          ].map(item => (
            <Text key={item} style={styles.cardItem}>{item}</Text>
          ))}
        </View>

        <Button label="Connect TikTok Account →" onPress={handleConnect} size="lg" />
        <Button label="Skip for now" onPress={handleSkip} variant="ghost" />
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Connect TikTok</Text>
            <Text style={styles.modalHint}>
              Your TikTok username (e.g. @limbwalkertrees)
            </Text>
            <Input
              label="TikTok username"
              placeholder="@limbwalkertrees"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              error={error ?? undefined}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save & Continue'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setModal(false); setError(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#142B1F', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, paddingBottom: 44 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  modalHint: { fontSize: Theme.font.size.small, color: Colors.textSecondary, lineHeight: 20 },
  saveBtn: { backgroundColor: '#22C55E', borderRadius: Theme.radius.lg, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: '#FFFFFF' },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
});
