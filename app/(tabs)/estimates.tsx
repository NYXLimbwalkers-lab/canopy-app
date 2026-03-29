import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  Animated,
  Dimensions,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { aiChat, isAIConfigured } from '@/lib/ai';
import { speak, speakPrompt } from '@/lib/tts';
import { Toast } from '@/components/ui/Toast';
import { HelpTip, GuidanceCard } from '@/components/ui/HelpTip';
import { router } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined';

interface LineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
  costJustification?: string;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Estimate {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  line_items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  status: EstimateStatus;
  tax_rate: number;
  pdf_url: string | null;
  contract_url: string | null;
  created_at: string;
  customers: { name: string; email: string | null; phone: string | null } | null;
}

// ─── Tree Service Presets ────────────────────────────────────────────────────

const JOB_TYPES = [
  { label: 'Tree Removal', icon: '🪓', key: 'removal', configType: 'tree' },
  { label: 'Tree Trimming', icon: '✂️', key: 'trimming', configType: 'tree' },
  { label: 'Stump Grinding', icon: '🪵', key: 'stump', configType: 'stump' },
  { label: 'Pruning', icon: '🌿', key: 'pruning', configType: 'tree' },
  { label: 'Lot / Land Clearing', icon: '🏗️', key: 'clearing', configType: 'area' },
  { label: 'Hauling / Debris', icon: '🚛', key: 'hauling', configType: 'hauling' },
  { label: 'Cable & Bracing', icon: '🔗', key: 'cabling', configType: 'tree_simple' },
  { label: 'Forestry Mulching', icon: '🌲', key: 'mulching', configType: 'area' },
  { label: 'Storm / Emergency', icon: '⛈️', key: 'storm', configType: 'description' },
  { label: 'Crane Work', icon: '🏗️', key: 'crane', configType: 'description' },
  { label: 'Dead Wooding', icon: '🍂', key: 'deadwood', configType: 'tree' },
  { label: 'Hedge Trimming', icon: '🌳', key: 'hedge', configType: 'hedge' },
  { label: 'Root Removal', icon: '🪨', key: 'root', configType: 'stump' },
  { label: 'Consultation', icon: '📋', key: 'consult', configType: 'description' },
];

const STUMP_SIZES = [
  { label: 'Small (under 12")', key: 'small' },
  { label: 'Medium (12-24")', key: 'medium' },
  { label: 'Large (24"+)', key: 'large' },
];

const AREA_SIZES = [
  { label: 'Small Lot', key: 'small' },
  { label: 'Quarter Acre', key: 'quarter' },
  { label: 'Half Acre', key: 'half' },
  { label: 'Acre+', key: 'acre' },
];

const DENSITY_OPTIONS = [
  { label: 'Light', key: 'light' },
  { label: 'Medium', key: 'medium' },
  { label: 'Heavy', key: 'heavy' },
];

const HAUL_MATERIALS = [
  { label: 'Brush', key: 'brush' },
  { label: 'Logs', key: 'logs' },
  { label: 'Debris', key: 'debris' },
  { label: 'Mixed', key: 'mixed' },
];

const PAYMENT_PREFS = [
  { label: 'Cash', key: 'cash' },
  { label: 'Check', key: 'check' },
  { label: 'Card', key: 'card' },
  { label: 'Invoice', key: 'invoice' },
];

// Item added during the estimate wizard
interface EstimateItem {
  jobType: string;
  jobLabel: string;
  config: Record<string, any>;
  summary: string; // Human-readable one-liner
}

const TREE_TYPES = [
  { label: 'Oak', icon: '🌳', wood: 'hardwood' },
  { label: 'Maple', icon: '🍁', wood: 'hardwood' },
  { label: 'Pine', icon: '🌲', wood: 'softwood' },
  { label: 'Cedar', icon: '🌲', wood: 'softwood' },
  { label: 'Elm', icon: '🌳', wood: 'hardwood' },
  { label: 'Birch', icon: '🌳', wood: 'hardwood' },
  { label: 'Spruce', icon: '🌲', wood: 'softwood' },
  { label: 'Ash', icon: '🌳', wood: 'hardwood' },
  { label: 'Willow', icon: '🌳', wood: 'softwood' },
  { label: 'Palm', icon: '🌴', wood: 'softwood' },
  { label: 'Hickory', icon: '🌳', wood: 'hardwood' },
  { label: 'Walnut', icon: '🌳', wood: 'hardwood' },
];

const TREE_SIZES = [
  { label: 'Small (under 15ft)', key: 'small', range: '< 15ft' },
  { label: 'Medium (15–30ft)', key: 'medium', range: '15-30ft' },
  { label: 'Large (30–60ft)', key: 'large', range: '30-60ft' },
  { label: 'XL (60–80ft)', key: 'xl', range: '60-80ft' },
  { label: 'XXL (80ft+)', key: 'xxl', range: '80ft+' },
];

const HAZARD_FACTORS = [
  { label: 'Near Power Lines', icon: '⚡', key: 'powerlines' },
  { label: 'Near Structure', icon: '🏠', key: 'structure' },
  { label: 'Steep Slope', icon: '⛰️', key: 'slope' },
  { label: 'Limited Access', icon: '🚧', key: 'access' },
  { label: 'Over Fence', icon: '🔲', key: 'fence' },
  { label: 'Diseased / Dead', icon: '☠️', key: 'diseased' },
  { label: 'Leaning / Risky', icon: '↗️', key: 'leaning' },
  { label: 'None / Open Area', icon: '✅', key: 'none' },
];

const CLEANUP_OPTIONS = [
  { label: 'Full Cleanup & Haul', icon: '🧹', key: 'full' },
  { label: 'Chip on Site', icon: '🪵', key: 'chip' },
  { label: 'Stack Firewood', icon: '🪓', key: 'firewood' },
  { label: 'Leave Logs', icon: '🪵', key: 'leave' },
  { label: 'No Cleanup', icon: '🚫', key: 'none' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EstimateStatus, { label: string; bg: string; text: string; icon: string }> = {
  draft: { label: 'Draft', bg: Colors.surfaceSecondary, text: Colors.textSecondary, icon: '📝' },
  sent: { label: 'Sent', bg: Colors.infoBg, text: '#1D4ED8', icon: '📤' },
  accepted: { label: 'Accepted', bg: Colors.successBg, text: '#15803D', icon: '✅' },
  declined: { label: 'Declined', bg: Colors.dangerBg, text: '#DC2626', icon: '❌' },
};

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: config.bg }]}>
      <Text style={badgeStyles.icon}>{config.icon}</Text>
      <Text style={[badgeStyles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.full,
    alignSelf: 'flex-start',
  },
  icon: { fontSize: 11 },
  text: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.semibold,
  },
});

// ─── Voice Recording Hook (Web Speech API) ──────────────────────────────────

function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (Platform.OS !== 'web') {
      Alert.alert('Voice Input', 'Voice input is available on the web version.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Alert.alert('Not Supported', 'Speech recognition is not supported in this browser. Try Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, startListening, stopListening, setTranscript };
}

// ─── Estimate Card ───────────────────────────────────────────────────────────

function EstimateCard({ estimate, onPress }: { estimate: Estimate; onPress: (e: Estimate) => void }) {
  const customerName = estimate.customers?.name || estimate.customer_name || 'Unknown Customer';
  const estimateNumber = estimate.id.slice(0, 8).toUpperCase();
  const lineItems: LineItem[] = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const itemCount = lineItems.length;
  const firstItem = lineItems[0]?.description || '';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(estimate)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardCustomer}>{customerName}</Text>
          <Text style={styles.cardNumber}>#{estimateNumber}</Text>
        </View>
        <StatusBadge status={estimate.status} />
      </View>

      {/* Preview of work */}
      {firstItem ? (
        <Text style={styles.cardPreview} numberOfLines={1}>
          {firstItem}{itemCount > 1 ? ` +${itemCount - 1} more` : ''}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{formatDate(estimate.created_at)}</Text>
        <Text style={styles.cardTotal}>{formatCurrency(estimate.total || 0)}</Text>
      </View>
      {(estimate.pdf_url || estimate.contract_url) && (
        <View style={styles.cardDocs}>
          {estimate.pdf_url && <Text style={styles.cardDocBadge}>📄 Estimate</Text>}
          {estimate.contract_url && <Text style={[styles.cardDocBadge, { backgroundColor: Colors.ai + '20', color: Colors.ai }]}>📋 Contract</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Preview Modal ──────────────────────────────────────────────────────────

function PreviewModal({
  visible,
  onClose,
  url,
  title,
  customerEmail,
  customerPhone,
}: {
  visible: boolean;
  onClose: () => void;
  url: string | null;
  title: string;
  onSend?: () => void;
  customerEmail?: string | null;
  customerPhone?: string | null;
}) {
  if (!url) return null;

  const handleEmail = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`Hi,\n\nPlease find your ${title.toLowerCase()} here:\n${url}\n\nThank you!`);
    const mailto = `mailto:${customerEmail || ''}?subject=${subject}&body=${body}`;
    Linking.openURL(mailto);
  };

  const handleSMS = () => {
    const body = encodeURIComponent(`Your ${title.toLowerCase()} is ready: ${url}`);
    const smsUrl = Platform.OS === 'ios' ? `sms:${customerPhone || ''}&body=${body}` : `sms:${customerPhone || ''}?body=${body}`;
    Linking.openURL(smsUrl);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `${title}: ${url}`, url });
    } catch {}
  };

  const handleCopyLink = async () => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(url);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={previewStyles.container}>
        <View style={previewStyles.header}>
          <TouchableOpacity onPress={onClose} style={previewStyles.headerBtnTouch}>
            <Text style={previewStyles.closeBtn}>Close</Text>
          </TouchableOpacity>
          <Text style={previewStyles.headerTitle}>{title}</Text>
          <View style={{ width: 60 }} />
        </View>

        {Platform.OS === 'web' ? (
          <View style={previewStyles.iframeContainer}>
            <iframe
              src={url}
              style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' } as any}
              title={title}
            />
          </View>
        ) : (
          <View style={previewStyles.linkContainer}>
            <Text style={previewStyles.linkText}>Document ready at:</Text>
            <TouchableOpacity onPress={() => Linking.openURL(url)}>
              <Text style={previewStyles.link}>{url}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={previewStyles.actions}>
          {customerEmail ? (
            <TouchableOpacity style={previewStyles.sendBtn} onPress={handleEmail}>
              <Text style={previewStyles.sendIcon}>📧</Text>
              <Text style={previewStyles.sendBtnText}>Email</Text>
            </TouchableOpacity>
          ) : null}
          {customerPhone ? (
            <TouchableOpacity style={[previewStyles.sendBtn, previewStyles.smsBtnStyle]} onPress={handleSMS}>
              <Text style={previewStyles.sendIcon}>💬</Text>
              <Text style={previewStyles.sendBtnText}>Text</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[previewStyles.sendBtn, previewStyles.shareBtnStyle]} onPress={handleShare}>
            <Text style={previewStyles.sendIcon}>📤</Text>
            <Text style={previewStyles.sendBtnText}>Share</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <TouchableOpacity style={[previewStyles.sendBtn, previewStyles.copyBtnStyle]} onPress={handleCopyLink}>
              <Text style={previewStyles.sendIcon}>🔗</Text>
              <Text style={[previewStyles.sendBtnText, { color: Colors.text }]}>Copy</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.layout.screenPadding,
    paddingTop: Theme.space.xl,
    paddingBottom: Theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerBtnTouch: { minWidth: 60 },
  headerTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  closeBtn: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  iframeContainer: { flex: 1, backgroundColor: '#fff' },
  linkContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  linkText: { fontSize: 16, color: Colors.textSecondary, marginBottom: 12 },
  link: { fontSize: 14, color: Colors.primary, textDecorationLine: 'underline' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: Theme.layout.screenPadding,
    paddingBottom: 32,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
  },
  smsBtnStyle: { backgroundColor: '#1D4ED8' },
  shareBtnStyle: { backgroundColor: Colors.ai },
  copyBtnStyle: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  sendIcon: { fontSize: 16 },
  sendBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: '#fff' },
});

// ─── Estimate Detail Modal ───────────────────────────────────────────────────

function EstimateDetailModal({
  estimate,
  visible,
  onClose,
  onStatusChange,
  onGeneratePdf,
  onGenerateContract,
  onPreview,
  onSend,
  generatingPdf,
  generatingContract,
}: {
  estimate: Estimate | null;
  visible: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: EstimateStatus) => void;
  onGeneratePdf: (id: string) => void;
  onGenerateContract: (id: string) => void;
  onPreview: (type: 'estimate' | 'contract', estimate: Estimate) => void;
  onSend: (type: 'estimate' | 'contract', estimate: Estimate) => void;
  generatingPdf: boolean;
  generatingContract: boolean;
}) {
  if (!estimate) return null;

  const customerName = estimate.customers?.name || estimate.customer_name || 'Unknown Customer';
  const customerEmail = estimate.customers?.email || estimate.customer_email || null;
  const customerPhone = estimate.customers?.phone || estimate.customer_phone || null;
  const estimateNumber = estimate.id.slice(0, 8).toUpperCase();
  const lineItems: LineItem[] = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={detailStyles.closeBtn}>Done</Text>
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle}>Estimate #{estimateNumber}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={detailStyles.scroll} contentContainerStyle={detailStyles.content}>
          {/* Customer info */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Customer</Text>
            <Text style={detailStyles.customerName}>{customerName}</Text>
            {customerEmail && (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${customerEmail}`)}>
                <Text style={detailStyles.customerLink}>📧 {customerEmail}</Text>
              </TouchableOpacity>
            )}
            {customerPhone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${customerPhone}`)}>
                <Text style={detailStyles.customerLink}>📱 {customerPhone}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Status */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Status</Text>
            <View style={detailStyles.statusRow}>
              {(['draft', 'sent', 'accepted', 'declined'] as EstimateStatus[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    detailStyles.statusBtn,
                    estimate.status === s && detailStyles.statusBtnActive,
                  ]}
                  onPress={() => onStatusChange(estimate.id, s)}
                >
                  <Text style={{ fontSize: 14 }}>{STATUS_CONFIG[s].icon}</Text>
                  <Text
                    style={[
                      detailStyles.statusBtnText,
                      estimate.status === s && detailStyles.statusBtnTextActive,
                    ]}
                  >
                    {STATUS_CONFIG[s].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Line items */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Work Items</Text>
            {lineItems.length === 0 ? (
              <Text style={detailStyles.emptyText}>No line items</Text>
            ) : (
              lineItems.map((item, i) => (
                <View key={i} style={detailStyles.lineItem}>
                  <View style={detailStyles.lineItemLeft}>
                    <Text style={detailStyles.lineItemDesc}>{item.description}</Text>
                    <Text style={detailStyles.lineItemMeta}>
                      {item.qty} x {formatCurrency(item.rate)}
                    </Text>
                    {item.costJustification && (
                      <Text style={detailStyles.lineItemJustification}>
                        💡 {item.costJustification}
                      </Text>
                    )}
                  </View>
                  <Text style={detailStyles.lineItemAmount}>{formatCurrency(item.amount)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Totals */}
          <View style={detailStyles.section}>
            <View style={detailStyles.totalRow}>
              <Text style={detailStyles.totalLabel}>Subtotal</Text>
              <Text style={detailStyles.totalValue}>{formatCurrency(estimate.subtotal || 0)}</Text>
            </View>
            <View style={detailStyles.totalRow}>
              <Text style={detailStyles.totalLabel}>Tax ({estimate.tax_rate || 0}%)</Text>
              <Text style={detailStyles.totalValue}>{formatCurrency(estimate.tax || 0)}</Text>
            </View>
            <View style={[detailStyles.totalRow, detailStyles.grandTotalRow]}>
              <Text style={detailStyles.grandTotalLabel}>Total</Text>
              <Text style={detailStyles.grandTotalValue}>{formatCurrency(estimate.total || 0)}</Text>
            </View>
          </View>

          {/* Notes */}
          {estimate.notes ? (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Notes</Text>
              <Text style={detailStyles.notesText}>{estimate.notes}</Text>
            </View>
          ) : null}

          {/* Documents section */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Documents</Text>

            {/* Estimate PDF */}
            <View style={detailStyles.docRow}>
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.docLabel}>📄 Estimate Document</Text>
                <Text style={detailStyles.docStatus}>
                  {estimate.pdf_url ? '✅ Ready' : '⏳ Not generated'}
                </Text>
              </View>
              {estimate.pdf_url ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={detailStyles.docBtn}
                    onPress={() => onPreview('estimate', estimate)}
                  >
                    <Text style={detailStyles.docBtnText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[detailStyles.docBtn, { backgroundColor: Colors.primary }]}
                    onPress={() => onSend('estimate', estimate)}
                  >
                    <Text style={[detailStyles.docBtnText, { color: '#fff' }]}>Send</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[detailStyles.docBtn, { backgroundColor: Colors.primary }]}
                  onPress={() => onGeneratePdf(estimate.id)}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[detailStyles.docBtnText, { color: '#fff' }]}>Generate</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Contract */}
            <View style={[detailStyles.docRow, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={detailStyles.docLabel}>📋 Contract</Text>
                <Text style={detailStyles.docStatus}>
                  {estimate.contract_url ? '✅ Ready' : '⏳ Not generated'}
                </Text>
              </View>
              {estimate.contract_url ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={detailStyles.docBtn}
                    onPress={() => onPreview('contract', estimate)}
                  >
                    <Text style={detailStyles.docBtnText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[detailStyles.docBtn, { backgroundColor: '#1a5c1a' }]}
                    onPress={() => onSend('contract', estimate)}
                  >
                    <Text style={[detailStyles.docBtnText, { color: '#fff' }]}>Send</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[detailStyles.docBtn, { backgroundColor: Colors.ai }]}
                  onPress={() => onGenerateContract(estimate.id)}
                  disabled={generatingContract}
                >
                  {generatingContract ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={[detailStyles.docBtnText, { color: '#fff' }]}>AI building...</Text>
                    </View>
                  ) : (
                    <Text style={[detailStyles.docBtnText, { color: '#fff' }]}>🤖 AI Generate</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Quick send */}
          {(estimate.pdf_url || estimate.contract_url) && (customerEmail || customerPhone) && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Quick Send</Text>
              {customerEmail && (
                <TouchableOpacity
                  style={detailStyles.quickSendBtn}
                  onPress={() => {
                    const url = estimate.contract_url || estimate.pdf_url;
                    const subject = encodeURIComponent(`Estimate #${estimateNumber}`);
                    const body = encodeURIComponent(`Hi ${customerName},\n\nPlease review your estimate here:\n${url}\n\nThank you!`);
                    Linking.openURL(`mailto:${customerEmail}?subject=${subject}&body=${body}`);
                  }}
                >
                  <Text style={detailStyles.quickSendIcon}>📧</Text>
                  <Text style={detailStyles.quickSendText}>Email to {customerEmail}</Text>
                </TouchableOpacity>
              )}
              {customerPhone && (
                <TouchableOpacity
                  style={detailStyles.quickSendBtn}
                  onPress={() => {
                    const url = estimate.contract_url || estimate.pdf_url;
                    const body = encodeURIComponent(`Hi ${customerName}, your estimate is ready: ${url}`);
                    const smsUrl = Platform.OS === 'ios' ? `sms:${customerPhone}&body=${body}` : `sms:${customerPhone}?body=${body}`;
                    Linking.openURL(smsUrl);
                  }}
                >
                  <Text style={detailStyles.quickSendIcon}>💬</Text>
                  <Text style={detailStyles.quickSendText}>Text to {customerPhone}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Voice Estimate Creator ─────────────────────────────────────────────────

function VoiceEstimateModal({
  visible,
  onClose,
  companyId,
  companyName,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  onCreated: (estimate: Estimate) => void;
}) {
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoiceInput();
  const [manualInput, setManualInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    lineItems: LineItem[];
    notes: string;
    taxRate: number;
    summary: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [missingInfo, setMissingInfo] = useState<string[] | null>(null);
  const [checkingInfo, setCheckingInfo] = useState(false);

  const inputText = transcript || manualInput;

  const resetAll = () => {
    setManualInput('');
    setTranscript('');
    setParsed(null);
    setMissingInfo(null);
  };

  const handleClose = () => {
    resetAll();
    if (isListening) stopListening();
    onClose();
  };

  // Smart pre-check: detect missing details before generating the estimate
  const handleSmartCheck = async () => {
    if (!inputText.trim()) {
      Alert.alert('Nothing to Parse', 'Describe the job first — speak or type.');
      return;
    }
    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings to use AI features.');
      return;
    }

    setCheckingInfo(true);
    setMissingInfo(null);
    try {
      const result = await aiChat([
        {
          role: 'system',
          content: `You are a tree service estimating assistant. Your job is to check if a job description has enough detail to create an accurate estimate. If critical details are missing, list them. If the description is good enough, say so.

CRITICAL details for an accurate tree estimate:
- Type of work (removal, trimming, stump grinding, etc.)
- Tree size or height (approximate)
- Tree species if known (affects difficulty and pricing)
- Location factors (near house, near power lines, backyard access, slope)
- Drop zone availability (where the tree can fall)
- Number of trees
- Cleanup expectations (haul away, leave wood, chip on site)
- Any hazards (dead tree, hanging limbs, storm damage)

NICE TO HAVE but not required:
- Customer name/contact
- Desired timeline
- Budget range`,
        },
        {
          role: 'user',
          content: `Check this job description for missing details that would affect pricing accuracy:

"${inputText}"

If important details are missing, return JSON: {"missing": ["short question about missing detail 1", "short question about missing detail 2"]}
If the description has enough detail for a reasonable estimate, return: {"missing": []}
Only flag things that would significantly change the price. Max 4 questions. Keep questions short and conversational, like you're asking a coworker.`,
        },
      ], { model: 'fast', maxTokens: 300, temperature: 0.2 });

      const match = result.match(/\{[\s\S]*\}/);
      if (match) {
        const data = JSON.parse(match[0]);
        const missing = data.missing || [];
        if (missing.length > 0) {
          setMissingInfo(missing);
          // Speak the first missing detail aloud
          const prompt = `Before I build this estimate, a couple quick questions. ${missing[0]}`;
          speakPrompt(prompt);
          return;
        }
      }
      // No missing info — go straight to parsing
      handleParse();
    } catch {
      // If the check fails, just go ahead and parse anyway
      handleParse();
    } finally {
      setCheckingInfo(false);
    }
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      Alert.alert('Nothing to Parse', 'Describe the job first — speak or type.');
      return;
    }

    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings to use AI features.');
      return;
    }

    setMissingInfo(null);
    setParsing(true);
    try {
      const result = await aiChat([
        {
          role: 'system',
          content: `You are a senior estimating assistant for "${companyName}", a professional tree service company. You have 20+ years of industry experience. Your job is to create detailed, professional estimates that help win bigger jobs by clearly communicating value and justifying costs.

INDUSTRY PRICING GUIDELINES (2024-2025 US averages):
- Tree Removal: Small (<15ft) $200-500, Medium (15-30ft) $500-1,500, Large (30-60ft) $1,500-3,500, XL (60-80ft) $3,500-6,000, XXL (80ft+) $6,000-15,000+
- Stump Grinding: $100-400 per stump based on diameter (small <12" $100-200, medium 12-24" $200-300, large 24"+ $300-500)
- Tree Trimming/Pruning: Small $150-400, Medium $400-800, Large $800-1,500, XL $1,500-3,000
- Lot Clearing: $1,500-5,000 per quarter acre depending on density
- Emergency/Storm Work: Add 25-50% surcharge for after-hours/emergency calls
- Crane Work: Add $500-2,000 per day for crane rental
- Hardwood trees (oak, maple, hickory) cost 20-30% more than softwood (pine, cedar) due to density and difficulty
- Hazard factors: Near power lines +20-30%, near structures +15-25%, limited access +10-20%, steep slope +15-25%, diseased/dead +10-20% (unpredictable)
- Cleanup & Haul: Usually included but $200-800 for large jobs, firewood splitting/stacking add $100-300

PRICING STRATEGY:
- Always break complex jobs into individual line items to show value
- Include cleanup, disposal, and hauling as separate items when significant
- Add a cost justification for each line item explaining WHY it costs what it does
- If the customer mentioned a price, use it but break it down professionally
- If no price mentioned, price based on industry averages for the described work
- Round to professional-looking numbers ($1,250 not $1,247.50)
- For large/complex jobs, consider adding: equipment mobilization, traffic control, permit costs
- Always think about upselling: if they want removal, suggest stump grinding too

Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Parse this job description into a detailed, professional estimate:

"${inputText}"

Return JSON:
{
  "customerName": "name if mentioned, otherwise empty string",
  "customerPhone": "phone if mentioned, otherwise empty string",
  "customerEmail": "email if mentioned, otherwise empty string",
  "lineItems": [
    {
      "description": "Professional, detailed description of the work item",
      "qty": 1,
      "rate": 0.00,
      "costJustification": "Brief explanation of why this costs what it does (e.g., 'Large hardwood near structure requires specialized rigging')"
    }
  ],
  "notes": "Professional notes including: job access considerations, recommended additional work, scheduling notes, anything the customer should know",
  "taxRate": 0,
  "summary": "One-paragraph professional summary of the entire job scope, written as if presenting to the customer. Mention key factors affecting price."
}

Rules:
- Break the job into 3-8 separate line items to show thorough, professional work
- Include separate items for: main work, cleanup/haul away, stump grinding (if applicable), equipment mobilization (for large jobs)
- Use professional descriptions (e.g., "Remove 40ft red oak — sectional dismantling with controlled rigging due to proximity to residence" not "remove tree")
- Include costJustification for every single line item
- If they mention a total price, distribute it across line items professionally
- If no price mentioned, use the industry pricing guidelines above
- Suggest additional work they should consider in the notes (e.g., "We recommend grinding the stump to prevent regrowth and tripping hazards")
- Set taxRate based on typical local rates (usually 6-10% if not mentioned, 0 if they seem tax-exempt)`,
        },
      ], { model: 'claude', maxTokens: 1500, temperature: 0.3 });

      const match = result.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Failed to parse AI response');

      const data = JSON.parse(match[0]);
      setParsed({
        customerName: data.customerName || '',
        customerEmail: data.customerEmail || '',
        customerPhone: data.customerPhone || '',
        lineItems: (data.lineItems || []).map((item: any) => ({
          description: item.description || '',
          qty: Number(item.qty) || 1,
          rate: Number(item.rate) || 0,
          amount: (Number(item.qty) || 1) * (Number(item.rate) || 0),
          costJustification: item.costJustification || '',
        })),
        notes: data.notes || '',
        taxRate: Number(data.taxRate) || 0,
        summary: data.summary || '',
      });
    } catch (err: any) {
      Alert.alert('Parse Error', 'AI could not understand the description. Try again with more detail.');
    } finally {
      setParsing(false);
    }
  };

  const subtotal = parsed ? parsed.lineItems.reduce((sum, item) => sum + item.amount, 0) : 0;
  const taxAmount = parsed ? subtotal * (parsed.taxRate / 100) : 0;
  const total = subtotal + taxAmount;

  const updateParsedItem = (index: number, field: keyof LineItem, value: string) => {
    if (!parsed) return;
    const updated = [...parsed.lineItems];
    const item = { ...updated[index] };
    if (field === 'description') item.description = value;
    else if (field === 'costJustification') item.costJustification = value;
    else if (field === 'qty') item.qty = parseFloat(value) || 0;
    else if (field === 'rate') item.rate = parseFloat(value) || 0;
    item.amount = item.qty * item.rate;
    updated[index] = item;
    setParsed({ ...parsed, lineItems: updated });
  };

  const addParsedItem = () => {
    if (!parsed) return;
    setParsed({ ...parsed, lineItems: [...parsed.lineItems, { description: '', qty: 1, rate: 0, amount: 0, costJustification: '' }] });
  };

  const removeParsedItem = (index: number) => {
    if (!parsed || parsed.lineItems.length <= 1) return;
    setParsed({ ...parsed, lineItems: parsed.lineItems.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!parsed || !parsed.lineItems.some(i => i.description.trim())) {
      Alert.alert('Missing Items', 'Add at least one line item.');
      return;
    }

    setSaving(true);
    try {
      let customerId = null;
      if (parsed.customerName.trim()) {
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            company_id: companyId,
            name: parsed.customerName.trim(),
            email: parsed.customerEmail.trim() || null,
            phone: parsed.customerPhone.trim() || null,
          })
          .select()
          .single();
        if (!custError && newCustomer) customerId = newCustomer.id;
      }

      const validItems = parsed.lineItems.filter(i => i.description.trim()).map(i => ({
        description: i.description.trim(),
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
        costJustification: i.costJustification || undefined,
      }));

      const notesWithSummary = [
        parsed.summary ? `Job Summary: ${parsed.summary}` : '',
        parsed.notes ? parsed.notes : '',
      ].filter(Boolean).join('\n\n');

      const { data: estimate, error } = await supabase
        .from('estimates')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          customer_name: parsed.customerName.trim() || null,
          customer_email: parsed.customerEmail.trim() || null,
          customer_phone: parsed.customerPhone.trim() || null,
          line_items: validItems,
          subtotal,
          tax: taxAmount,
          tax_rate: parsed.taxRate,
          total,
          notes: notesWithSummary || null,
          status: 'draft',
        })
        .select('*, customers(name, email, phone)')
        .single();

      if (error) throw error;
      if (estimate) {
        onCreated(estimate);
        handleClose();
        Toast.success(`Estimate saved! ${formatCurrency(total)} — ready to send.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save estimate');
    } finally {
      setSaving(false);
    }
  };

  // Pulsing animation for mic
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      ringAnim.setValue(0);
    }
  }, [isListening]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={voiceStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={voiceStyles.header}>
          <TouchableOpacity onPress={handleClose} style={{ minWidth: 60 }}>
            <Text style={voiceStyles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={voiceStyles.headerTitle}>
            {parsed ? 'Review Estimate' : 'New Estimate'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={voiceStyles.scroll} contentContainerStyle={voiceStyles.scrollContent} keyboardShouldPersistTaps="handled">
          {!parsed ? (
            <>
              {/* Voice input section */}
              <View style={voiceStyles.voiceSection}>
                {/* Outer ring animation */}
                {isListening && (
                  <Animated.View
                    style={[voiceStyles.micRing, {
                      opacity: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
                      transform: [{ scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
                    }]}
                  />
                )}
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <TouchableOpacity
                    style={[voiceStyles.micBtn, isListening && voiceStyles.micBtnActive]}
                    onPress={isListening ? stopListening : startListening}
                    activeOpacity={0.8}
                  >
                    <Text style={voiceStyles.micEmoji}>{isListening ? '🔴' : '🎙️'}</Text>
                  </TouchableOpacity>
                </Animated.View>
                <Text style={voiceStyles.voiceTitle}>
                  {isListening ? 'Listening...' : 'Describe the Job'}
                </Text>
                <Text style={voiceStyles.voiceSubtitle}>
                  {isListening
                    ? 'Speak naturally — tap the mic when done'
                    : 'Tap the mic and talk about the job. Include tree sizes, types, hazards, and your price if you have one.'}
                </Text>
              </View>

              {/* Live transcript */}
              {transcript ? (
                <View style={voiceStyles.transcriptBox}>
                  <Text style={voiceStyles.transcriptLabel}>What I heard:</Text>
                  <Text style={voiceStyles.transcriptText}>{transcript}</Text>
                </View>
              ) : null}

              {/* Divider */}
              <View style={voiceStyles.divider}>
                <View style={voiceStyles.dividerLine} />
                <Text style={voiceStyles.dividerText}>or type it out</Text>
                <View style={voiceStyles.dividerLine} />
              </View>

              {/* Manual text input */}
              <TextInput
                style={voiceStyles.textInput}
                value={transcript || manualInput}
                onChangeText={v => {
                  if (transcript) setTranscript(v);
                  else setManualInput(v);
                }}
                placeholder={`Example: "Mrs. Johnson has two large oaks in the backyard, about 50 feet tall, hardwood, near the fence line. Needs full removal, stump grinding on both, and complete cleanup. Her number is 555-0123."`}
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={6}
              />

              {/* Missing info prompts */}
              {missingInfo && missingInfo.length > 0 && (
                <View style={voiceStyles.missingCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 16 }}>💡</Text>
                    <Text style={voiceStyles.missingTitle}>A few details would improve this estimate:</Text>
                  </View>
                  {missingInfo.map((q, i) => (
                    <View key={i} style={voiceStyles.missingRow}>
                      <Text style={voiceStyles.missingBullet}>•</Text>
                      <Text style={voiceStyles.missingText}>{q}</Text>
                    </View>
                  ))}
                  <Text style={voiceStyles.missingHint}>
                    Add these details above, or tap "Build Anyway" to estimate with what you have.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[voiceStyles.parseBtn, { flex: 1, backgroundColor: '#40916C' }]}
                      onPress={handleParse}
                      disabled={parsing}
                    >
                      <Text style={voiceStyles.parseBtnText}>
                        {parsing ? 'Building...' : 'Build Anyway'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[voiceStyles.parseBtn, { flex: 1, backgroundColor: '#7C3AED' }]}
                      onPress={() => {
                        // Speak all missing questions
                        const allQ = missingInfo.join('. Also, ');
                        speakPrompt(`Quick questions: ${allQ}`);
                      }}
                    >
                      <Text style={voiceStyles.parseBtnText}>🔊 Hear Questions</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* AI Parse button */}
              <TouchableOpacity
                style={[voiceStyles.parseBtn, (!inputText.trim() || checkingInfo || parsing) && { opacity: 0.4 }]}
                onPress={handleSmartCheck}
                disabled={parsing || checkingInfo || !inputText.trim()}
              >
                {parsing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={voiceStyles.parseBtnText}>AI is building your estimate...</Text>
                  </View>
                ) : checkingInfo ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={voiceStyles.parseBtnText}>Checking for missing details...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 18 }}>🤖</Text>
                    <Text style={voiceStyles.parseBtnText}>Build Estimate with AI</Text>
                  </View>
                )}
              </TouchableOpacity>

              <GuidanceCard
                title="How to get an accurate estimate"
                icon="🌳"
                steps={[
                  'Say what work needs doing — "Remove a big oak" or "Trim three pines"',
                  'Mention the height — "About 40 feet tall" (this changes the price a LOT)',
                  'Note hazards — near the house? Power lines? Steep hill? Tight backyard?',
                  'Say where the tree can fall — open yard is cheaper, tight spaces cost more',
                  'Mention cleanup — haul away, leave wood, chip on site?',
                  'Say a price or let AI suggest one based on industry rates',
                ]}
              />
            </>
          ) : (
            <>
              {/* Job summary */}
              {parsed.summary ? (
                <View style={voiceStyles.summaryCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={voiceStyles.summaryTitle}>📋 Job Summary</Text>
                    {Platform.OS === 'web' && (
                      <TouchableOpacity
                        onPress={() => speak(`Here's your estimate summary. ${parsed.summary}. The total comes to $${total.toLocaleString()}.`)}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ fontSize: 18 }}>🔊</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={voiceStyles.summaryText}>{parsed.summary}</Text>
                </View>
              ) : null}

              {/* Customer */}
              <Text style={voiceStyles.sectionLabel}>Customer Info</Text>
              <View style={voiceStyles.fieldRow}>
                <TextInput
                  style={voiceStyles.fieldInput}
                  value={parsed.customerName}
                  onChangeText={v => setParsed({ ...parsed, customerName: v })}
                  placeholder="Customer name"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[voiceStyles.fieldInput, { flex: 1 }]}
                  value={parsed.customerPhone}
                  onChangeText={v => setParsed({ ...parsed, customerPhone: v })}
                  placeholder="Phone"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="phone-pad"
                />
                <TextInput
                  style={[voiceStyles.fieldInput, { flex: 1 }]}
                  value={parsed.customerEmail}
                  onChangeText={v => setParsed({ ...parsed, customerEmail: v })}
                  placeholder="Email"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Line Items */}
              <Text style={[voiceStyles.sectionLabel, { marginTop: 20 }]}>Work Breakdown</Text>
              {parsed.lineItems.map((item, i) => (
                <View key={i} style={voiceStyles.lineItemCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={voiceStyles.lineItemNum}>Item {i + 1}</Text>
                    {parsed.lineItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeParsedItem(i)}>
                        <Text style={{ color: Colors.danger, fontSize: 13, fontWeight: '600' as any }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={voiceStyles.fieldInput}
                    value={item.description}
                    onChangeText={v => updateParsedItem(i, 'description', v)}
                    placeholder="Description of work"
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                  />
                  {/* Cost justification */}
                  {item.costJustification ? (
                    <View style={voiceStyles.justificationBox}>
                      <Text style={voiceStyles.justificationText}>💡 {item.costJustification}</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={voiceStyles.miniLabel}>Qty</Text>
                      <TextInput
                        style={voiceStyles.numInput}
                        value={item.qty > 0 ? String(item.qty) : ''}
                        onChangeText={v => updateParsedItem(i, 'qty', v)}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={Colors.textTertiary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={voiceStyles.miniLabel}>Rate ($)</Text>
                      <TextInput
                        style={voiceStyles.numInput}
                        value={item.rate > 0 ? String(item.rate) : ''}
                        onChangeText={v => updateParsedItem(i, 'rate', v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={Colors.textTertiary}
                      />
                    </View>
                    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                      <Text style={voiceStyles.miniLabel}>Amount</Text>
                      <Text style={voiceStyles.amountDisplay}>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={voiceStyles.addItemBtn} onPress={addParsedItem}>
                <Text style={voiceStyles.addItemText}>+ Add Line Item</Text>
              </TouchableOpacity>

              {/* Notes */}
              <Text style={[voiceStyles.sectionLabel, { marginTop: 16 }]}>Notes & Recommendations</Text>
              <TextInput
                style={[voiceStyles.fieldInput, { minHeight: 80, textAlignVertical: 'top' }]}
                value={parsed.notes}
                onChangeText={v => setParsed({ ...parsed, notes: v })}
                placeholder="Additional notes, recommendations, scheduling..."
                placeholderTextColor={Colors.textTertiary}
                multiline
              />

              {/* Tax */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <Text style={voiceStyles.miniLabel}>Tax Rate (%)</Text>
                <TextInput
                  style={[voiceStyles.numInput, { width: 80 }]}
                  value={parsed.taxRate > 0 ? String(parsed.taxRate) : ''}
                  onChangeText={v => setParsed({ ...parsed, taxRate: parseFloat(v) || 0 })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              {/* Totals */}
              <View style={voiceStyles.totalsCard}>
                <View style={voiceStyles.totalRow}>
                  <Text style={voiceStyles.totalLabel}>Subtotal</Text>
                  <Text style={voiceStyles.totalValue}>{formatCurrency(subtotal)}</Text>
                </View>
                {parsed.taxRate > 0 && (
                  <View style={voiceStyles.totalRow}>
                    <Text style={voiceStyles.totalLabel}>Tax ({parsed.taxRate}%)</Text>
                    <Text style={voiceStyles.totalValue}>{formatCurrency(taxAmount)}</Text>
                  </View>
                )}
                <View style={[voiceStyles.totalRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 6 }]}>
                  <Text style={voiceStyles.grandTotalLabel}>Total</Text>
                  <Text style={voiceStyles.grandTotalValue}>{formatCurrency(total)}</Text>
                </View>
              </View>

              {/* Actions */}
              <View style={{ gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  style={voiceStyles.saveBtn}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={voiceStyles.saveBtnText}>Save Estimate</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={voiceStyles.redoBtn}
                  onPress={() => setParsed(null)}
                >
                  <Text style={voiceStyles.redoBtnText}>Start Over</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── POS-Style Estimate Builder (McDonald's register / kiosk) ───────────────

const WIZARD_STEPS = ['Customer', 'Service', 'Configure', 'Items', 'Review'];

function CreateEstimateModal({
  visible,
  onClose,
  companyId,
  companyName,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  onCreated: (estimate: Estimate) => void;
}) {
  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [paymentPref, setPaymentPref] = useState('');

  // Multi-item wizard
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [currentJobType, setCurrentJobType] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Record<string, any>>({});

  // Tree details
  const [selectedTreeTypes, setSelectedTreeTypes] = useState<string[]>([]);
  const [treeHeight, setTreeHeight] = useState(30);
  const [treeCount, setTreeCount] = useState(1);

  // Hazards & cleanup
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [selectedCleanup, setSelectedCleanup] = useState<string[]>([]);

  // AI results
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (visible && companyId) {
      supabase
        .from('customers')
        .select('id, name, email, phone')
        .eq('company_id', companyId)
        .order('name')
        .then(({ data }) => {
          if (data) setCustomers(data);
        });
    }
  }, [visible, companyId]);

  const resetForm = () => {
    setStep(0);
    setSelectedCustomerId(null);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerCity('');
    setCustomerState('');
    setPaymentPref('');
    setItems([]);
    setCurrentJobType(null);
    setCurrentConfig({});
    setSelectedTreeTypes([]);
    setTreeHeight(30);
    setTreeCount(1);
    setSelectedHazards([]);
    setSelectedCleanup([]);
    setLineItems([]);
    setNotes('');
    setTaxRate(0);
    setShowCustomerPicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerEmail(customer.email || '');
    setCustomerPhone(customer.phone || '');
    setShowCustomerPicker(false);
  };

  const filteredCustomers = customerName.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(customerName.toLowerCase()))
    : customers;

  // Height label helper
  const getHeightLabel = (h: number) => {
    if (h >= 100) return '100ft+';
    return `${h}ft`;
  };

  const getSizeCategory = (h: number) => {
    if (h < 15) return 'Small';
    if (h < 30) return 'Medium';
    if (h < 60) return 'Large';
    if (h < 80) return 'XL';
    return 'XXL';
  };

  // Custom slider component — tap-based for gloves
  const renderHeightSlider = () => {
    const stops = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
    return (
      <View style={createStyles.sliderContainer}>
        <View style={createStyles.sliderValueBox}>
          <Text style={createStyles.sliderValueText}>{getHeightLabel(treeHeight)}</Text>
          <Text style={createStyles.sliderSizeLabel}>{getSizeCategory(treeHeight)}</Text>
        </View>
        <View style={createStyles.sliderTrack}>
          {stops.map((val) => {
            const isActive = treeHeight >= val;
            const isSelected = treeHeight === val;
            return (
              <TouchableOpacity
                key={val}
                style={[
                  createStyles.sliderStop,
                  isActive && createStyles.sliderStopActive,
                  isSelected && createStyles.sliderStopSelected,
                ]}
                onPress={() => setTreeHeight(val)}
                activeOpacity={0.7}
              >
                <Text style={[
                  createStyles.sliderStopText,
                  isActive && createStyles.sliderStopTextActive,
                ]}>
                  {val}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Tree count +/- picker
  const renderTreeCountPicker = () => (
    <View style={createStyles.counterRow}>
      <Text style={createStyles.counterLabel}>How many trees?</Text>
      <View style={createStyles.counterControls}>
        <TouchableOpacity
          style={[createStyles.counterBtn, treeCount <= 1 && { opacity: 0.3 }]}
          onPress={() => setTreeCount(Math.max(1, treeCount - 1))}
          disabled={treeCount <= 1}
          activeOpacity={0.7}
        >
          <Text style={createStyles.counterBtnText}>-</Text>
        </TouchableOpacity>
        <View style={createStyles.counterDisplay}>
          <Text style={createStyles.counterValue}>{treeCount}</Text>
        </View>
        <TouchableOpacity
          style={createStyles.counterBtn}
          onPress={() => setTreeCount(treeCount + 1)}
          activeOpacity={0.7}
        >
          <Text style={createStyles.counterBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // AI Generate from selections
  const handleAIGenerate = async () => {
    if (items.length === 0) {
      Alert.alert('No Items', 'Go back and add at least one service item.');
      return;
    }

    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings to use AI features.');
      return;
    }

    setAiGenerating(true);
    try {
      const itemDescriptions = items.map(item => {
        const parts = [`${item.jobLabel}`];
        const c = item.config;
        if (c.treeTypes?.length) parts.push(`Species: ${c.treeTypes.join(', ')}`);
        if (c.treeHeight) parts.push(`Height: ${c.treeHeight}ft`);
        if (c.treeCount > 1) parts.push(`Count: ${c.treeCount}`);
        if (c.hazards?.length && !c.hazards.includes('none')) parts.push(`Hazards: ${c.hazards.join(', ')}`);
        if (c.cleanup?.length) parts.push(`Cleanup: ${c.cleanup.join(', ')}`);
        if (c.stumpSize) parts.push(`Size: ${c.stumpSize}`);
        if (c.areaSize) parts.push(`Area: ${c.areaSize}`);
        if (c.density) parts.push(`Density: ${c.density}`);
        if (c.material) parts.push(`Material: ${c.material}`);
        if (c.hedgeLength) parts.push(`Length: ${c.hedgeLength}`);
        if (c.description) parts.push(`Details: ${c.description}`);
        return parts.join(', ');
      }).join('\n');

      const prompt = `Generate professional tree service estimate line items for this job:

${itemDescriptions}

Use 2024-2025 industry-standard pricing. Return ONLY valid JSON array:
[
  { "description": "Professional description", "qty": 1, "rate": 0.00, "costJustification": "Why this costs what it does" }
]

Rules:
- 3-8 line items depending on complexity
- Factor in hardwood/softwood (hardwood costs 20-30% more)
- Factor in all hazard conditions with appropriate surcharges
- Include cleanup as a separate item when applicable
- Include stump grinding if job is removal (as separate item)
- Use realistic, competitive pricing
- Round to professional numbers`;

      const result = await aiChat([
        { role: 'system', content: `You are a pricing expert for "${companyName}", a professional tree service. Generate detailed, itemized estimates with industry-standard pricing.` },
        { role: 'user', content: prompt },
      ], { model: 'claude', maxTokens: 1000, temperature: 0.3 });

      const match = result.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Failed to parse');

      const parsedItems = JSON.parse(match[0]);
      const newItems: LineItem[] = parsedItems.map((item: any) => ({
        description: item.description || '',
        qty: Number(item.qty) || 1,
        rate: Number(item.rate) || 0,
        amount: (Number(item.qty) || 1) * (Number(item.rate) || 0),
        costJustification: item.costJustification || '',
      }));

      setLineItems(newItems);
      setTaxRate(7);
    } catch (err: any) {
      Alert.alert('AI Error', 'Could not generate pricing. Try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSave = async (generatePdf: boolean) => {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter a customer name.');
      return;
    }
    const validItems = lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      Alert.alert('Required', 'Please add at least one line item. Tap "Generate Pricing with AI" first.');
      return;
    }

    setSubmitting(true);
    if (generatePdf) setGeneratingPdf(true);

    try {
      let customerId = selectedCustomerId;
      if (!customerId) {
        const fullAddress = [customerAddress.trim(), customerCity.trim(), customerState.trim()].filter(Boolean).join(', ') || null;
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            company_id: companyId,
            name: customerName.trim(),
            email: customerEmail.trim() || null,
            phone: customerPhone.trim() || null,
            address: fullAddress,
          })
          .select()
          .single();
        if (custError) throw custError;
        customerId = newCustomer.id;
      }

      const itemsToSave = validItems.map(item => ({
        description: item.description.trim(),
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        costJustification: item.costJustification || undefined,
      }));

      const { data: estimate, error } = await supabase
        .from('estimates')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          line_items: itemsToSave,
          subtotal,
          tax: taxAmount,
          tax_rate: taxRate,
          total,
          notes: notes.trim() || null,
          status: 'draft',
        })
        .select('*, customers(name, email, phone)')
        .single();

      if (error) throw error;

      if (generatePdf && estimate) {
        try {
          await supabase.functions.invoke('generate-estimate-pdf', {
            body: { estimateId: estimate.id },
          });
        } catch (pdfErr: any) {
          Alert.alert('PDF Error', 'Estimate saved but PDF generation failed: ' + (pdfErr.message || 'Unknown error'));
        }
      }

      if (estimate) {
        onCreated(estimate);
        handleClose();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save estimate');
    } finally {
      setSubmitting(false);
      setGeneratingPdf(false);
    }
  };

  // Step validation
  const canGoNext = () => {
    if (step === 0) return customerName.trim().length > 0;
    if (step === 1) return true; // tapping a service auto-advances
    if (step === 2) return true; // config is optional
    if (step === 3) return items.length > 0;
    return true;
  };

  const goNext = () => {
    if (step < WIZARD_STEPS.length - 1) {
      const nextStep = step + 1;
      // When going from Configure (2) to Items (3), add the current item
      if (step === 2) {
        addCurrentItem();
        setStep(3);
        return;
      }
      // When going from Items (3) to Review (4), trigger AI
      if (step === 3) {
        setStep(4);
        if (lineItems.length === 0) {
          handleAIGenerate();
        }
        return;
      }
      setStep(nextStep);
    }
  };

  const goBack = () => {
    if (step === 3 && items.length === 0) {
      // If no items yet, go back to service selection
      setStep(1);
    } else if (step > 0) {
      setStep(step - 1);
    }
  };

  // ─── Big Grid Button ─────────────────────────────────────────────────────
  const renderGridButton = (
    key: string,
    label: string,
    icon: string,
    isSelected: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[createStyles.gridBtn, isSelected && createStyles.gridBtnSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={createStyles.gridBtnIcon}>{icon}</Text>
      <Text style={[createStyles.gridBtnLabel, isSelected && createStyles.gridBtnLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ─── Step Renders ────────────────────────────────────────────────────────

  const renderStep0Customer = () => (
    <View style={createStyles.stepBody}>
      <Text style={createStyles.stepTitle}>Who is this for?</Text>
      <Text style={createStyles.stepSubtitle}>Enter or pick a customer</Text>

      <View style={createStyles.inputGroup}>
        <Text style={createStyles.inputLabel}>Name *</Text>
        <TextInput
          style={createStyles.bigInput}
          value={customerName}
          onChangeText={v => {
            setCustomerName(v);
            setSelectedCustomerId(null);
            if (v.trim().length > 0 && customers.length > 0) {
              setShowCustomerPicker(true);
            } else {
              setShowCustomerPicker(false);
            }
          }}
          placeholder="Customer name"
          placeholderTextColor={Colors.textTertiary}
          autoFocus
        />
      </View>

      {showCustomerPicker && filteredCustomers.length > 0 && (
        <View style={createStyles.pickerDropdown}>
          {filteredCustomers.slice(0, 5).map(c => (
            <TouchableOpacity
              key={c.id}
              style={createStyles.pickerItem}
              onPress={() => selectCustomer(c)}
            >
              <Text style={createStyles.pickerItemName}>{c.name}</Text>
              {c.email && <Text style={createStyles.pickerItemSub}>{c.email}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={createStyles.inputGroup}>
        <Text style={createStyles.inputLabel}>Phone</Text>
        <TextInput
          style={createStyles.bigInput}
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder="(555) 123-4567"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="phone-pad"
        />
      </View>

      <View style={createStyles.inputGroup}>
        <Text style={createStyles.inputLabel}>Email</Text>
        <TextInput
          style={createStyles.bigInput}
          value={customerEmail}
          onChangeText={setCustomerEmail}
          placeholder="email@example.com"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={createStyles.inputGroup}>
        <Text style={createStyles.inputLabel}>Address</Text>
        <TextInput
          style={createStyles.bigInput}
          value={customerAddress}
          onChangeText={setCustomerAddress}
          placeholder="Street Address"
          placeholderTextColor={Colors.textTertiary}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 2 }}>
          <Text style={createStyles.inputLabel}>City</Text>
          <TextInput
            style={createStyles.bigInput}
            value={customerCity}
            onChangeText={setCustomerCity}
            placeholder="City"
            placeholderTextColor={Colors.textTertiary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={createStyles.inputLabel}>State</Text>
          <TextInput
            style={createStyles.bigInput}
            value={customerState}
            onChangeText={setCustomerState}
            placeholder="State"
            placeholderTextColor={Colors.textTertiary}
            maxLength={2}
            autoCapitalize="characters"
          />
        </View>
      </View>

      <Text style={createStyles.sectionHeading}>Payment Preference (optional)</Text>
      <View style={createStyles.gridContainer}>
        {PAYMENT_PREFS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[createStyles.gridBtn, { width: (SCREEN_WIDTH - 32 - 10) / 2 }, paymentPref === p.key && createStyles.gridBtnSelected]}
            onPress={() => setPaymentPref(paymentPref === p.key ? '' : p.key)}
            activeOpacity={0.7}
          >
            <Text style={[createStyles.gridBtnLabel, paymentPref === p.key && createStyles.gridBtnLabelSelected]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep1JobType = () => (
    <View style={createStyles.stepBody}>
      <Text style={createStyles.stepTitle}>What work needs done?</Text>
      <Text style={createStyles.stepSubtitle}>Tap one to configure it</Text>

      {items.length > 0 && (
        <View style={{ gap: 6, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '700' as any, color: Colors.textSecondary, letterSpacing: 1 }}>ITEMS ADDED ({items.length})</Text>
          {items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ flex: 1, fontSize: 14, color: Colors.text }}>{item.jobLabel}: {item.summary}</Text>
              <TouchableOpacity onPress={() => setItems(prev => prev.filter((_, j) => j !== i))}>
                <Text style={{ color: '#F87171', fontSize: 16, fontWeight: '700' as any }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={createStyles.gridContainer}>
        {JOB_TYPES.map(jt => (
          <TouchableOpacity
            key={jt.key}
            style={[createStyles.gridBtn]}
            onPress={() => {
              setCurrentJobType(jt.key);
              setCurrentConfig({});
              setStep(2);
            }}
            activeOpacity={0.7}
          >
            <Text style={createStyles.gridBtnIcon}>{jt.icon}</Text>
            <Text style={createStyles.gridBtnLabel}>{jt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const currentJobConfig = JOB_TYPES.find(j => j.key === currentJobType);

  const renderStep2Configure = () => {
    const configType = currentJobConfig?.configType ?? 'description';

    return (
      <View style={{ gap: 16 }}>
        <Text style={createStyles.stepTitle}>Configure: {currentJobConfig?.label}</Text>

        {/* Tree services: species, height, count, hazards, cleanup */}
        {configType === 'tree' && (
          <>
            <Text style={createStyles.sectionHeading}>Species</Text>
            <View style={createStyles.gridContainer}>
              {TREE_TYPES.map(tt => (
                <TouchableOpacity key={tt.label} style={[createStyles.gridBtn, selectedTreeTypes.includes(tt.label) && createStyles.gridBtnSelected]} onPress={() => toggleItem(selectedTreeTypes, tt.label, setSelectedTreeTypes)} activeOpacity={0.7}>
                  <Text style={createStyles.gridBtnIcon}>{tt.icon}</Text>
                  <Text style={[createStyles.gridBtnLabel, selectedTreeTypes.includes(tt.label) && createStyles.gridBtnLabelSelected]}>{tt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderHeightSlider()}
            {renderTreeCountPicker()}
            <Text style={createStyles.sectionHeading}>Hazards</Text>
            <View style={createStyles.gridContainer}>
              {HAZARD_FACTORS.map(h => (
                <TouchableOpacity key={h.key} style={[createStyles.gridBtn, selectedHazards.includes(h.key) && createStyles.gridBtnSelected]} onPress={() => toggleItem(selectedHazards, h.key, setSelectedHazards)} activeOpacity={0.7}>
                  <Text style={createStyles.gridBtnIcon}>{h.icon}</Text>
                  <Text style={[createStyles.gridBtnLabel, selectedHazards.includes(h.key) && createStyles.gridBtnLabelSelected]}>{h.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={createStyles.sectionHeading}>Cleanup</Text>
            <View style={createStyles.gridContainer}>
              {CLEANUP_OPTIONS.map(c => (
                <TouchableOpacity key={c.key} style={[createStyles.gridBtn, selectedCleanup.includes(c.key) && createStyles.gridBtnSelected]} onPress={() => { setSelectedCleanup([c.key]); }} activeOpacity={0.7}>
                  <Text style={createStyles.gridBtnIcon}>{c.icon}</Text>
                  <Text style={[createStyles.gridBtnLabel, selectedCleanup.includes(c.key) && createStyles.gridBtnLabelSelected]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Tree simple: just count + height */}
        {configType === 'tree_simple' && (
          <>
            {renderHeightSlider()}
            {renderTreeCountPicker()}
          </>
        )}

        {/* Stump: count + size */}
        {configType === 'stump' && (
          <>
            {renderTreeCountPicker()}
            <Text style={createStyles.sectionHeading}>Average Size</Text>
            <View style={createStyles.gridContainer}>
              {STUMP_SIZES.map(s => (
                <TouchableOpacity key={s.key} style={[createStyles.gridBtn, (currentConfig.stumpSize === s.key) && createStyles.gridBtnSelected]} onPress={() => setCurrentConfig(prev => ({ ...prev, stumpSize: s.key }))} activeOpacity={0.7}>
                  <Text style={[createStyles.gridBtnLabel, (currentConfig.stumpSize === s.key) && createStyles.gridBtnLabelSelected]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Area: size + density */}
        {configType === 'area' && (
          <>
            <Text style={createStyles.sectionHeading}>Area Size</Text>
            <View style={createStyles.gridContainer}>
              {AREA_SIZES.map(a => (
                <TouchableOpacity key={a.key} style={[createStyles.gridBtn, (currentConfig.areaSize === a.key) && createStyles.gridBtnSelected]} onPress={() => setCurrentConfig(prev => ({ ...prev, areaSize: a.key }))} activeOpacity={0.7}>
                  <Text style={[createStyles.gridBtnLabel, (currentConfig.areaSize === a.key) && createStyles.gridBtnLabelSelected]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={createStyles.sectionHeading}>Vegetation Density</Text>
            <View style={createStyles.gridContainer}>
              {DENSITY_OPTIONS.map(d => (
                <TouchableOpacity key={d.key} style={[createStyles.gridBtn, (currentConfig.density === d.key) && createStyles.gridBtnSelected]} onPress={() => setCurrentConfig(prev => ({ ...prev, density: d.key }))} activeOpacity={0.7}>
                  <Text style={[createStyles.gridBtnLabel, (currentConfig.density === d.key) && createStyles.gridBtnLabelSelected]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Hauling: loads + material */}
        {configType === 'hauling' && (
          <>
            {renderTreeCountPicker()}
            <Text style={createStyles.sectionHeading}>Material Type</Text>
            <View style={createStyles.gridContainer}>
              {HAUL_MATERIALS.map(m => (
                <TouchableOpacity key={m.key} style={[createStyles.gridBtn, (currentConfig.material === m.key) && createStyles.gridBtnSelected]} onPress={() => setCurrentConfig(prev => ({ ...prev, material: m.key }))} activeOpacity={0.7}>
                  <Text style={[createStyles.gridBtnLabel, (currentConfig.material === m.key) && createStyles.gridBtnLabelSelected]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Hedge: length + height */}
        {configType === 'hedge' && (
          <>
            <Text style={createStyles.sectionHeading}>Approximate Length</Text>
            <View style={createStyles.gridContainer}>
              {[{label:'Short (under 20ft)',key:'short'},{label:'Medium (20-50ft)',key:'medium'},{label:'Long (50ft+)',key:'long'}].map(h => (
                <TouchableOpacity key={h.key} style={[createStyles.gridBtn, (currentConfig.hedgeLength === h.key) && createStyles.gridBtnSelected]} onPress={() => setCurrentConfig(prev => ({ ...prev, hedgeLength: h.key }))} activeOpacity={0.7}>
                  <Text style={[createStyles.gridBtnLabel, (currentConfig.hedgeLength === h.key) && createStyles.gridBtnLabelSelected]}>{h.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {renderHeightSlider()}
          </>
        )}

        {/* Description only: storm, crane, consultation */}
        {configType === 'description' && (
          <>
            <Text style={createStyles.stepSubtitle}>Describe the work needed</Text>
            <TextInput
              style={[createStyles.bigInput, { minHeight: 100, textAlignVertical: 'top' }]}
              placeholder="e.g. Large oak fell on garage during last night's storm..."
              placeholderTextColor={Colors.textTertiary}
              value={currentConfig.description || ''}
              onChangeText={(t) => setCurrentConfig(prev => ({ ...prev, description: t }))}
              multiline
            />
          </>
        )}
      </View>
    );
  };

  const buildItemSummary = (): string => {
    const jt = JOB_TYPES.find(j => j.key === currentJobType);
    const ct = jt?.configType ?? 'description';
    const parts: string[] = [];

    if (ct === 'tree') {
      if (treeCount > 1) parts.push(`${treeCount}x`);
      if (selectedTreeTypes.length) parts.push(selectedTreeTypes.join(', '));
      parts.push(`${treeHeight}ft`);
      if (selectedHazards.length && !selectedHazards.includes('none')) parts.push(`(${selectedHazards.length} hazards)`);
    } else if (ct === 'stump') {
      parts.push(`${treeCount} stump${treeCount > 1 ? 's' : ''}`);
      if (currentConfig.stumpSize) parts.push(currentConfig.stumpSize);
    } else if (ct === 'area') {
      if (currentConfig.areaSize) parts.push(currentConfig.areaSize);
      if (currentConfig.density) parts.push(`${currentConfig.density} density`);
    } else if (ct === 'hauling') {
      parts.push(`${treeCount} load${treeCount > 1 ? 's' : ''}`);
      if (currentConfig.material) parts.push(currentConfig.material);
    } else if (ct === 'hedge') {
      if (currentConfig.hedgeLength) parts.push(currentConfig.hedgeLength);
      parts.push(`${treeHeight}ft tall`);
    } else if (ct === 'description') {
      if (currentConfig.description) parts.push(currentConfig.description.substring(0, 50));
    } else if (ct === 'tree_simple') {
      parts.push(`${treeCount} tree${treeCount > 1 ? 's' : ''}, ${treeHeight}ft`);
    }

    return parts.join(' \u00b7 ') || 'Configured';
  };

  const addCurrentItem = () => {
    const jt = JOB_TYPES.find(j => j.key === currentJobType);
    if (!jt) return;

    const newItem: EstimateItem = {
      jobType: currentJobType!,
      jobLabel: jt.label,
      config: {
        ...currentConfig,
        treeTypes: [...selectedTreeTypes],
        treeHeight,
        treeCount,
        hazards: [...selectedHazards],
        cleanup: [...selectedCleanup],
      },
      summary: buildItemSummary(),
    };

    setItems(prev => [...prev, newItem]);
    // Reset config for next item
    setCurrentJobType(null);
    setCurrentConfig({});
    setSelectedTreeTypes([]);
    setTreeHeight(30);
    setTreeCount(1);
    setSelectedHazards([]);
    setSelectedCleanup([]);
  };

  const renderStep3ItemAdded = () => (
    <View style={{ gap: 16 }}>
      <Text style={createStyles.stepTitle}>Item Added!</Text>
      <Text style={createStyles.stepSubtitle}>{items.length} item{items.length !== 1 ? 's' : ''} in this estimate</Text>

      {items.map((item, i) => (
        <View key={i} style={{ backgroundColor: Colors.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700' as any, color: Colors.text }}>{item.jobLabel}</Text>
            <TouchableOpacity onPress={() => setItems(prev => prev.filter((_, j) => j !== i))}>
              <Text style={{ color: '#F87171', fontWeight: '700' as any }}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 14, color: Colors.textSecondary }}>{item.summary}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={{ backgroundColor: Colors.surface, padding: 18, borderRadius: 14, borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', alignItems: 'center', gap: 4 }}
        onPress={() => setStep(1)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 18, color: Colors.primary, fontWeight: '700' as any }}>+ Add Another Item</Text>
        <Text style={{ fontSize: 13, color: Colors.textSecondary }}>Removal, trimming, stump grinding, etc.</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep4Review = () => {
    return (
      <View style={createStyles.stepBody}>
        <Text style={createStyles.stepTitle}>Review & Price</Text>

        {/* Selection summary */}
        <View style={createStyles.summaryCard}>
          <Text style={createStyles.summaryHeading}>Job Summary</Text>
          <View style={createStyles.summaryRow}>
            <Text style={createStyles.summaryLabel}>Customer</Text>
            <Text style={createStyles.summaryValue}>{customerName}</Text>
          </View>
          {customerAddress || customerCity ? (
            <View style={createStyles.summaryRow}>
              <Text style={createStyles.summaryLabel}>Address</Text>
              <Text style={createStyles.summaryValue}>{[customerAddress, customerCity, customerState].filter(Boolean).join(', ')}</Text>
            </View>
          ) : null}
          {items.map((item, i) => (
            <View key={i} style={createStyles.summaryRow}>
              <Text style={createStyles.summaryLabel}>{item.jobLabel}</Text>
              <Text style={createStyles.summaryValue}>{item.summary}</Text>
            </View>
          ))}
          {paymentPref ? (
            <View style={createStyles.summaryRow}>
              <Text style={createStyles.summaryLabel}>Payment</Text>
              <Text style={createStyles.summaryValue}>{paymentPref}</Text>
            </View>
          ) : null}
        </View>

        {/* AI pricing */}
        {aiGenerating ? (
          <View style={createStyles.aiLoadingBox}>
            <ActivityIndicator size="large" color={Colors.ai} />
            <Text style={createStyles.aiLoadingText}>AI is pricing this job...</Text>
          </View>
        ) : lineItems.length === 0 ? (
          <TouchableOpacity style={createStyles.aiGenerateBtn} onPress={handleAIGenerate}>
            <Text style={{ fontSize: 28 }}>🤖</Text>
            <Text style={createStyles.aiGenerateBtnText}>Generate Pricing with AI</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Line items */}
            <Text style={[createStyles.sectionHeading, { marginTop: 16 }]}>Work Breakdown</Text>
            {lineItems.map((item, i) => (
              <View key={i} style={createStyles.reviewItemCard}>
                <Text style={createStyles.reviewItemDesc}>{item.description}</Text>
                {item.costJustification ? (
                  <Text style={createStyles.reviewItemJustification}>💡 {item.costJustification}</Text>
                ) : null}
                <View style={createStyles.reviewItemBottom}>
                  <Text style={createStyles.reviewItemQty}>{item.qty} x {formatCurrency(item.rate)}</Text>
                  <Text style={createStyles.reviewItemAmount}>{formatCurrency(item.amount)}</Text>
                </View>
              </View>
            ))}

            {/* Totals */}
            <View style={createStyles.totalsCard}>
              <View style={createStyles.totalRow}>
                <Text style={createStyles.totalLabel}>Subtotal</Text>
                <Text style={createStyles.totalValue}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={createStyles.totalRow}>
                <Text style={createStyles.totalLabel}>Tax ({taxRate}%)</Text>
                <Text style={createStyles.totalValue}>{formatCurrency(taxAmount)}</Text>
              </View>
              <View style={[createStyles.totalRow, createStyles.grandTotalRow]}>
                <Text style={createStyles.grandTotalLabel}>TOTAL</Text>
                <Text style={createStyles.grandTotalValue}>{formatCurrency(total)}</Text>
              </View>
            </View>

            {/* Re-generate */}
            <TouchableOpacity style={createStyles.regenBtn} onPress={handleAIGenerate}>
              <Text style={createStyles.regenBtnText}>🤖 Re-generate Pricing</Text>
            </TouchableOpacity>

            {/* Save buttons */}
            <View style={createStyles.saveActions}>
              <TouchableOpacity
                style={createStyles.saveDraftBtn}
                onPress={() => handleSave(false)}
                disabled={submitting}
              >
                {submitting && !generatingPdf ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={createStyles.saveDraftText}>Save Draft</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={createStyles.savePdfBtn}
                onPress={() => handleSave(true)}
                disabled={submitting}
              >
                {generatingPdf ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={createStyles.savePdfText}>Save & Generate PDF</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  const stepContent = [renderStep0Customer, renderStep1JobType, renderStep2Configure, renderStep3ItemAdded, renderStep4Review];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={createStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header with step indicator */}
        <View style={createStyles.header}>
          <TouchableOpacity onPress={handleClose} style={createStyles.headerCancelTouch}>
            <Text style={createStyles.headerCancelText}>Cancel</Text>
          </TouchableOpacity>
          <View style={createStyles.headerCenter}>
            <Text style={createStyles.headerTitle}>New Estimate</Text>
            <Text style={createStyles.headerStep}>Step {step + 1} of {WIZARD_STEPS.length}</Text>
          </View>
          <View style={{ width: 70 }} />
        </View>

        {/* Step progress bar */}
        <View style={createStyles.progressBar}>
          {WIZARD_STEPS.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[
                createStyles.progressSegment,
                i <= step && createStyles.progressSegmentActive,
                i === step && createStyles.progressSegmentCurrent,
              ]}
              onPress={() => { if (i < step) setStep(i); }}
              activeOpacity={i < step ? 0.7 : 1}
            >
              <Text style={[
                createStyles.progressLabel,
                i <= step && createStyles.progressLabelActive,
              ]}>{i + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step name */}
        <View style={createStyles.stepNameBar}>
          <Text style={createStyles.stepNameText}>{WIZARD_STEPS[step]}</Text>
        </View>

        {/* Content */}
        <ScrollView
          style={createStyles.scroll}
          contentContainerStyle={createStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {stepContent[step]()}
        </ScrollView>

        {/* Bottom nav buttons */}
        {step < 4 && step !== 1 && (
          <View style={createStyles.bottomNav}>
            {step > 0 ? (
              <TouchableOpacity style={createStyles.backBtn} onPress={goBack} activeOpacity={0.7}>
                <Text style={createStyles.backBtnText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity
              style={[createStyles.nextBtn, !canGoNext() && { opacity: 0.35 }]}
              onPress={goNext}
              disabled={!canGoNext()}
              activeOpacity={0.7}
            >
              <Text style={createStyles.nextBtnText}>
                {step === 2 ? 'Add Item' : step === 3 ? 'Review & Price' : 'Next'}
              </Text>
              <Text style={createStyles.nextBtnArrow}>→</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EstimatesScreen() {
  const { company } = useAuthStore();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<EstimateStatus | 'all'>('all');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewEstimate, setPreviewEstimate] = useState<Estimate | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const fetchEstimates = useCallback(async () => {
    if (!company) return;
    const { data, error } = await supabase
      .from('estimates')
      .select('*, customers(name, email, phone)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('Failed to fetch estimates:', error.message); return; }
    // Normalize 'rejected' (DB legacy) to 'declined' (UI label)
    const normalized = (data ?? []).map(e => ({
      ...e,
      status: e.status === 'rejected' ? 'declined' : e.status,
    }));
    setEstimates(normalized);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchEstimates(); } catch { Toast.error('Failed to refresh estimates.'); }
    finally { setRefreshing(false); }
  }, [fetchEstimates]);

  useEffect(() => {
    fetchEstimates().finally(() => setLoading(false));
  }, [fetchEstimates]);

  const handleStatusChange = async (id: string, status: EstimateStatus) => {
    const prev = estimates.find(e => e.id === id)?.status;
    setEstimates(es => es.map(e => e.id === id ? { ...e, status } : e));
    setSelectedEstimate(e => e?.id === id ? { ...e, status } : e);

    const { error } = await supabase.from('estimates').update({ status }).eq('id', id);
    if (error && prev) {
      setEstimates(es => es.map(e => e.id === id ? { ...e, status: prev } : e));
      setSelectedEstimate(e => e?.id === id ? { ...e, status: prev } : e);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleGeneratePdf = async (id: string) => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-estimate-pdf', {
        body: { estimateId: id },
      });
      if (error) throw error;
      if (data?.pdfUrl) {
        setEstimates(es => es.map(e => e.id === id ? { ...e, pdf_url: data.pdfUrl } : e));
        setSelectedEstimate(e => e?.id === id ? { ...e, pdf_url: data.pdfUrl } : e);
        Alert.alert('Estimate Generated', 'Ready to preview and send.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleGenerateContract = async (id: string) => {
    const estimate = estimates.find(e => e.id === id);
    if (!estimate) return;

    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in settings to generate contracts.');
      return;
    }

    setGeneratingContract(true);
    try {
      const customerName = estimate.customers?.name || estimate.customer_name || 'Customer';
      const lineItems: LineItem[] = Array.isArray(estimate.line_items) ? estimate.line_items : [];
      const lineItemsText = lineItems
        .map(item => `- ${item.description}: ${item.qty} x $${item.rate.toFixed(2)} = $${item.amount.toFixed(2)}`)
        .join('\n');

      const contractSections = await aiChat([
        {
          role: 'system',
          content: `You are a contract writer for a professional tree service company called "${company?.name || 'the company'}". Generate a detailed scope of work and work schedule customized to the specific estimate. The other contract sections (payment, liability, etc.) are handled by saved settings. Focus on making the scope and schedule specific to the actual work being done. Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Generate the scope of work and schedule for this tree service estimate:

Customer: ${customerName}
Work items:
${lineItemsText}
Total: $${(estimate.total || 0).toFixed(2)}
Notes: ${estimate.notes || 'None'}

Return JSON with these keys:
{
  "scopeOfWork": "Detailed paragraph describing all the work to be performed, referencing each line item specifically. Be thorough about what's included and what's not.",
  "workSchedule": "Realistic scheduling details for this type of work (e.g., estimated duration, crew size, equipment needed, weather dependencies)",
  "additionalTerms": "Any additional terms specific to these work items that wouldn't be in standard contract settings (e.g., if there's crane work, hazard trees near structures, etc.). Leave empty string if nothing special."
}`,
        },
      ], { model: 'claude', maxTokens: 800, temperature: 0.4 });

      let sections;
      try {
        const match = contractSections.match(/\{[\s\S]*\}/);
        sections = match ? JSON.parse(match[0]) : null;
      } catch {
        sections = null;
      }

      if (!sections) {
        Alert.alert('Error', 'AI failed to generate contract content. Please try again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-contract', {
        body: { estimateId: id, sections },
      });

      if (error) throw error;
      if (data?.contractUrl) {
        setEstimates(es => es.map(e => e.id === id ? { ...e, contract_url: data.contractUrl } : e));
        setSelectedEstimate(e => e?.id === id ? { ...e, contract_url: data.contractUrl } : e);
        Alert.alert('Contract Generated', 'AI-customized contract is ready to preview and send.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate contract');
    } finally {
      setGeneratingContract(false);
    }
  };

  const handlePreview = (type: 'estimate' | 'contract', estimate: Estimate) => {
    const url = type === 'estimate' ? estimate.pdf_url : estimate.contract_url;
    if (!url) return;
    setPreviewUrl(url);
    setPreviewTitle(type === 'estimate' ? `Estimate #${estimate.id.slice(0, 8).toUpperCase()}` : 'Contract');
    setPreviewEstimate(estimate);
    setShowPreview(true);
  };

  const handleSend = (type: 'estimate' | 'contract', estimate: Estimate) => {
    handlePreview(type, estimate);
  };

  const handleEstimateCreated = (estimate: Estimate) => {
    setEstimates(prev => [estimate, ...prev]);
  };

  const handleOpenDetail = (estimate: Estimate) => {
    setSelectedEstimate(estimate);
    setShowDetail(true);
  };

  const filteredEstimates =
    activeFilter === 'all' ? estimates : estimates.filter(e => e.status === activeFilter);
  const countFor = (status: EstimateStatus) => estimates.filter(e => e.status === status).length;

  // Stats
  const totalValue = estimates.reduce((sum, e) => sum + (e.total || 0), 0);
  const acceptedValue = estimates.filter(e => e.status === 'accepted').reduce((sum, e) => sum + (e.total || 0), 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Estimates</Text>
          {estimates.length > 0 && (
            <Text style={styles.headerSubtitle}>
              {formatCurrency(acceptedValue)} won of {formatCurrency(totalValue)} total
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/(tabs)/contract-settings' as any)}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
          <Text style={styles.settingsBtnText}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'all' && styles.filterChipTextActive]}>
            All ({estimates.length})
          </Text>
        </TouchableOpacity>
        {(['draft', 'sent', 'accepted', 'declined'] as EstimateStatus[]).map(status => (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, activeFilter === status && styles.filterChipActive]}
            onPress={() => setActiveFilter(status)}
          >
            <Text style={{ fontSize: 12, marginRight: 2 }}>{STATUS_CONFIG[status].icon}</Text>
            <Text style={[styles.filterChipText, activeFilter === status && styles.filterChipTextActive]}>
              {STATUS_CONFIG[status].label} ({countFor(status)})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />
          }
        >
          {filteredEstimates.length === 0 ? (
            <EmptyState
              icon="📋"
              title={activeFilter === 'all' ? 'No estimates yet' : `No ${activeFilter} estimates`}
              description={
                activeFilter === 'all'
                  ? 'Create your first estimate — describe the job with your voice or build one manually.'
                  : `You have no estimates with ${activeFilter} status.`
              }
              actionLabel={activeFilter === 'all' ? 'Create estimate' : undefined}
              onAction={activeFilter === 'all' ? () => setShowVoice(true) : undefined}
            />
          ) : (
            filteredEstimates.map(estimate => (
              <EstimateCard key={estimate.id} estimate={estimate} onPress={handleOpenDetail} />
            ))
          )}
        </ScrollView>
      )}

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fabSecondary} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
          <Text style={styles.fabSecondaryIcon}>📋</Text>
          <Text style={styles.fabSecondaryText}>Manual</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => setShowVoice(true)} activeOpacity={0.85}>
          <Text style={styles.fabMicIcon}>🎙️</Text>
          <Text style={styles.fabLabel}>Voice Estimate</Text>
        </TouchableOpacity>
      </View>

      {/* Detail Modal */}
      <EstimateDetailModal
        estimate={selectedEstimate}
        visible={showDetail}
        onClose={() => {
          setShowDetail(false);
          setSelectedEstimate(null);
        }}
        onStatusChange={handleStatusChange}
        onGeneratePdf={handleGeneratePdf}
        onGenerateContract={handleGenerateContract}
        onPreview={handlePreview}
        onSend={handleSend}
        generatingPdf={generatingPdf}
        generatingContract={generatingContract}
      />

      {/* Voice Create Modal */}
      {company && (
        <VoiceEstimateModal
          visible={showVoice}
          onClose={() => setShowVoice(false)}
          companyId={company.id}
          companyName={company.name || 'our company'}
          onCreated={handleEstimateCreated}
        />
      )}

      {/* Manual Create Modal */}
      {company && (
        <CreateEstimateModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          companyId={company.id}
          companyName={company.name || 'our company'}
          onCreated={handleEstimateCreated}
        />
      )}

      {/* Preview Modal */}
      <PreviewModal
        visible={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewUrl(null);
          setPreviewEstimate(null);
        }}
        url={previewUrl}
        title={previewTitle}
        customerEmail={previewEstimate?.customers?.email || previewEstimate?.customer_email}
        customerPhone={previewEstimate?.customers?.phone || previewEstimate?.customer_phone}
      />
    </View>
  );
}

// ─── Detail Modal Styles ─────────────────────────────────────────────────────

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.layout.screenPadding,
    paddingTop: Theme.space.xl,
    paddingBottom: Theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  closeBtn: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  scroll: { flex: 1 },
  content: { padding: Theme.layout.screenPadding, gap: Theme.space.lg, paddingBottom: 40 },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    gap: Theme.space.sm,
    ...Theme.shadow.sm,
  },
  sectionTitle: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  customerName: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  customerDetail: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  customerLink: { fontSize: Theme.font.size.body, color: Colors.primary, marginTop: 2 },
  emptyText: { fontSize: Theme.font.size.body, color: Colors.textTertiary, fontStyle: 'italic' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  statusBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  statusBtnText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  statusBtnTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.bold },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineItemLeft: { flex: 1, marginRight: 12 },
  lineItemDesc: { fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 20 },
  lineItemMeta: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginTop: 2 },
  lineItemJustification: { fontSize: 12, color: Colors.ai, marginTop: 4, fontStyle: 'italic', lineHeight: 16 },
  lineItemAmount: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  totalValue: { fontSize: Theme.font.size.body, color: Colors.text },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Theme.space.sm,
    marginTop: Theme.space.xs,
  },
  grandTotalLabel: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  grandTotalValue: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  notesText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docLabel: { fontSize: Theme.font.size.body, color: Colors.text, fontWeight: Theme.font.weight.medium },
  docStatus: { fontSize: Theme.font.size.small, color: Colors.textTertiary, marginTop: 2 },
  docBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docBtnText: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  quickSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.primary + '15',
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    marginTop: 4,
  },
  quickSendIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  quickSendText: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.medium },
});

// ─── Voice Modal Styles ─────────────────────────────────────────────────────

const voiceStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Theme.layout.screenPadding,
    paddingTop: Theme.space.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  cancelBtn: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  scroll: { flex: 1 },
  scrollContent: { padding: Theme.layout.screenPadding, paddingBottom: 60 },
  // Voice section
  voiceSection: { alignItems: 'center', paddingVertical: 40, position: 'relative' },
  micRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: Colors.danger,
    top: 40 - 5,
  },
  micBtn: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.lg,
  },
  micBtnActive: { backgroundColor: Colors.danger },
  micEmoji: { fontSize: 42 },
  voiceTitle: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  voiceSubtitle: {
    marginTop: 8,
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  // Transcript
  transcriptBox: {
    backgroundColor: Colors.primary + '10',
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    marginBottom: 16,
  },
  transcriptLabel: {
    fontSize: 12,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  transcriptText: { fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 22 },
  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: Theme.font.size.small, color: Colors.textTertiary },
  // Text input
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    minHeight: 130,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  parseBtn: {
    backgroundColor: Colors.ai,
    paddingVertical: 18,
    borderRadius: Theme.radius.lg,
    alignItems: 'center',
    marginTop: 16,
    ...Theme.shadow.sm,
  },
  parseBtnText: { fontSize: 16, fontWeight: Theme.font.weight.bold, color: '#fff' },
  // Missing info card
  missingCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    borderWidth: 1,
    borderColor: '#F59E0B40',
  },
  missingTitle: { fontSize: 14, fontWeight: Theme.font.weight.semibold, color: '#92400E', flex: 1 },
  missingRow: { flexDirection: 'row', gap: 8, paddingLeft: 4, marginBottom: 4 },
  missingBullet: { fontSize: 14, color: '#B45309' },
  missingText: { fontSize: 14, color: '#78350F', flex: 1, lineHeight: 20 },
  missingHint: { fontSize: 12, color: '#92400E', fontStyle: 'italic' as const, marginTop: 6 },
  // Tips
  tipsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipsTitle: { fontSize: 14, fontWeight: Theme.font.weight.bold, color: Colors.text, marginBottom: 10 },
  tipItem: { fontSize: 13, color: Colors.textSecondary, lineHeight: 22 },
  // Summary card
  summaryCard: {
    backgroundColor: Colors.ai + '10',
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    borderWidth: 1,
    borderColor: Colors.ai + '30',
    marginBottom: 20,
  },
  summaryTitle: { fontSize: 14, fontWeight: Theme.font.weight.bold, color: Colors.ai, marginBottom: 8 },
  summaryText: { fontSize: Theme.font.size.body, color: Colors.text, lineHeight: 22 },
  // Parsed review
  sectionLabel: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  fieldRow: { marginBottom: 10 },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: Theme.space.md,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    marginBottom: 8,
  },
  lineItemCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.md,
    gap: 8,
    marginBottom: 10,
  },
  lineItemNum: { fontSize: 12, fontWeight: Theme.font.weight.semibold, color: Colors.textTertiary, textTransform: 'uppercase' },
  justificationBox: {
    backgroundColor: Colors.ai + '08',
    borderRadius: Theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.ai,
  },
  justificationText: { fontSize: 12, color: Colors.ai, lineHeight: 16, fontStyle: 'italic' },
  miniLabel: { fontSize: 11, color: Colors.textTertiary, marginBottom: 4 },
  numInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.sm,
    padding: Theme.space.sm,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    textAlign: 'center',
  },
  amountDisplay: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.primary,
    textAlign: 'center',
    paddingVertical: Theme.space.sm,
  },
  addItemBtn: {
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addItemText: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.medium },
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    marginTop: 16,
    gap: 4,
    ...Theme.shadow.sm,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  totalValue: { fontSize: Theme.font.size.body, color: Colors.text },
  grandTotalLabel: { fontSize: 20, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  grandTotalValue: { fontSize: 20, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: Theme.radius.lg,
    alignItems: 'center',
    ...Theme.shadow.sm,
  },
  saveBtnText: { fontSize: 16, fontWeight: Theme.font.weight.bold, color: '#fff' },
  redoBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
  },
  redoBtnText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
});

// ─── POS Create Modal Styles ─────────────────────────────────────────────────

const GRID_GAP = 10;
const GRID_COLS = 2;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 32 - GRID_GAP) / GRID_COLS; // 16px padding each side

const createStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 10,
    backgroundColor: Colors.primary,
  },
  headerCancelTouch: { width: 70 },
  headerCancelText: { fontSize: 16, fontWeight: '600' as any, color: '#fff' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' as any, color: '#fff' },
  headerStep: { fontSize: 13, fontWeight: '500' as any, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

  // Progress bar
  progressBar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.primaryDark,
  },
  progressSegment: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSegmentActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressSegmentCurrent: {
    backgroundColor: '#fff',
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '800' as any,
    color: 'rgba(255,255,255,0.5)',
  },
  progressLabelActive: {
    color: Colors.primaryDark,
  },

  // Step name bar
  stepNameBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepNameText: {
    fontSize: 14,
    fontWeight: '700' as any,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 30 },

  // Step body
  stepBody: { gap: 0 },
  stepTitle: {
    fontSize: 26,
    fontWeight: '800' as any,
    color: Colors.text,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700' as any,
    color: Colors.text,
    marginBottom: 10,
  },

  // Big grid buttons (McDonald's kiosk style)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridBtn: {
    width: GRID_ITEM_WIDTH,
    minHeight: 80,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 2.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  gridBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
    borderWidth: 3,
  },
  gridBtnIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  gridBtnLabel: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  gridBtnLabelSelected: {
    color: Colors.primaryDark,
  },

  // Height slider
  sliderContainer: {
    gap: 12,
  },
  sliderValueBox: {
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
  },
  sliderValueText: {
    fontSize: 36,
    fontWeight: '800' as any,
    color: Colors.primary,
  },
  sliderSizeLabel: {
    fontSize: 16,
    fontWeight: '600' as any,
    color: Colors.primaryDark,
    marginTop: 2,
  },
  sliderTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  sliderStop: {
    width: 56,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderStopActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary + '50',
  },
  sliderStopSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sliderStopText: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: Colors.textSecondary,
  },
  sliderStopTextActive: {
    color: '#fff',
  },

  // Tree count picker
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  counterLabel: {
    fontSize: 18,
    fontWeight: '700' as any,
    color: Colors.text,
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  counterBtn: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.sm,
  },
  counterBtnText: {
    fontSize: 32,
    fontWeight: '800' as any,
    color: '#fff',
    lineHeight: 36,
  },
  counterDisplay: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 36,
    fontWeight: '800' as any,
    color: Colors.text,
  },

  // Customer inputs
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigInput: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '500' as any,
    color: Colors.text,
  },

  // Customer picker dropdown
  pickerDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    borderRadius: 12,
    marginBottom: 14,
    marginTop: -8,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemName: { fontSize: 17, color: Colors.text, fontWeight: '600' as any },
  pickerItemSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

  // Review step
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  summaryHeading: {
    fontSize: 18,
    fontWeight: '800' as any,
    color: Colors.text,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600' as any,
    color: Colors.textTertiary,
    width: 80,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600' as any,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },

  // AI loading
  aiLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  aiLoadingText: {
    fontSize: 18,
    fontWeight: '700' as any,
    color: Colors.ai,
  },

  // AI generate button
  aiGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.ai,
    paddingVertical: 22,
    borderRadius: 14,
    ...Theme.shadow.md,
  },
  aiGenerateBtnText: {
    fontSize: 20,
    fontWeight: '800' as any,
    color: '#fff',
  },

  // Review line items
  reviewItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewItemDesc: {
    fontSize: 15,
    fontWeight: '600' as any,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  reviewItemJustification: {
    fontSize: 13,
    color: Colors.ai,
    fontStyle: 'italic',
    marginBottom: 6,
    lineHeight: 17,
  },
  reviewItemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  reviewItemQty: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  reviewItemAmount: {
    fontSize: 17,
    fontWeight: '800' as any,
    color: Colors.primary,
  },

  // Totals
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 18,
    marginTop: 12,
    gap: 4,
    borderWidth: 2,
    borderColor: Colors.primary + '25',
    ...Theme.shadow.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  totalLabel: { fontSize: 16, color: Colors.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '600' as any, color: Colors.text },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: Colors.primary + '30',
    paddingTop: 10,
    marginTop: 6,
  },
  grandTotalLabel: { fontSize: 24, fontWeight: '800' as any, color: Colors.primary },
  grandTotalValue: { fontSize: 24, fontWeight: '800' as any, color: Colors.primary },

  // Regen button
  regenBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: Colors.ai + '10',
    borderWidth: 1.5,
    borderColor: Colors.ai + '30',
  },
  regenBtnText: {
    fontSize: 15,
    fontWeight: '700' as any,
    color: Colors.ai,
  },

  // Save actions
  saveActions: {
    gap: 10,
    marginTop: 20,
  },
  saveDraftBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  saveDraftText: {
    fontSize: 18,
    fontWeight: '700' as any,
    color: Colors.text,
  },
  savePdfBtn: {
    paddingVertical: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    ...Theme.shadow.md,
  },
  savePdfText: {
    fontSize: 18,
    fontWeight: '800' as any,
    color: '#fff',
  },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  backBtn: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  backBtnText: {
    fontSize: 20,
    fontWeight: '700' as any,
    color: Colors.textSecondary,
  },
  nextBtn: {
    flex: 2,
    height: 64,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    ...Theme.shadow.md,
  },
  nextBtnText: {
    fontSize: 22,
    fontWeight: '800' as any,
    color: '#fff',
  },
  nextBtnArrow: {
    fontSize: 24,
    fontWeight: '700' as any,
    color: '#fff',
  },
});

// ─── Main Screen Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.layout.screenPadding,
    paddingTop: 60,
    paddingBottom: Theme.space.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsIcon: { fontSize: 14 },
  settingsBtnText: { fontWeight: Theme.font.weight.semibold, fontSize: 13, color: Colors.text },
  filterScroll: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterContent: { paddingHorizontal: Theme.layout.screenPadding, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Theme.radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: { backgroundColor: Colors.primary + '12', borderColor: Colors.primary },
  filterChipText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  filterChipTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  list: { flex: 1 },
  listContent: { padding: Theme.layout.screenPadding, gap: Theme.space.md, paddingBottom: 120 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    gap: Theme.space.sm,
    ...Theme.shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1 },
  cardCustomer: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  cardNumber: { fontSize: Theme.font.size.small, color: Colors.textTertiary, marginTop: 2 },
  cardPreview: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardDate: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  cardTotal: { fontSize: 18, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  cardDocs: { flexDirection: 'row', gap: 6, marginTop: 4 },
  cardDocBadge: {
    fontSize: 11,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.primary,
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  // FABs
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    alignItems: 'flex-end',
    gap: 12,
  },
  fabSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Theme.shadow.md,
  },
  fabSecondaryIcon: { fontSize: 16 },
  fabSecondaryText: { fontSize: 14, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.primary,
    ...Theme.shadow.lg,
  },
  fabMicIcon: { fontSize: 22 },
  fabLabel: { fontSize: 16, fontWeight: Theme.font.weight.bold, color: '#fff' },
});
