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
  { label: 'Tree Removal', icon: '🪓', key: 'removal' },
  { label: 'Tree Trimming', icon: '✂️', key: 'trimming' },
  { label: 'Stump Grinding', icon: '🪵', key: 'stump' },
  { label: 'Pruning', icon: '🌿', key: 'pruning' },
  { label: 'Lot / Land Clearing', icon: '🏗️', key: 'clearing' },
  { label: 'Storm Damage', icon: '⛈️', key: 'storm' },
  { label: 'Hedge Trimming', icon: '🌳', key: 'hedge' },
  { label: 'Cable & Bracing', icon: '🔗', key: 'cabling' },
  { label: 'Dead Wooding', icon: '🍂', key: 'deadwood' },
  { label: 'Crane Work', icon: '🏗️', key: 'crane' },
];

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
  { label: 'Full Cleanup & Haul', key: 'full' },
  { label: 'Chip on Site', key: 'chip' },
  { label: 'Stack Firewood', key: 'firewood' },
  { label: 'Leave Logs for Customer', key: 'leave' },
  { label: 'No Cleanup (customer handles)', key: 'none' },
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

// ─── Chip Selector Component ─────────────────────────────────────────────────

function ChipSelector<T extends { label: string; key?: string }>({
  items,
  selected,
  onToggle,
  renderItem,
  multiSelect = true,
}: {
  items: T[];
  selected: string[];
  onToggle: (key: string) => void;
  renderItem?: (item: T, isSelected: boolean) => React.ReactNode;
  multiSelect?: boolean;
}) {
  return (
    <View style={chipStyles.container}>
      {items.map((item) => {
        const key = (item as any).key || item.label;
        const isSelected = selected.includes(key);
        if (renderItem) return <View key={key}>{renderItem(item, isSelected)}</View>;
        return (
          <TouchableOpacity
            key={key}
            style={[chipStyles.chip, isSelected && chipStyles.chipActive]}
            onPress={() => onToggle(key)}
            activeOpacity={0.7}
          >
            {(item as any).icon && <Text style={chipStyles.chipIcon}>{(item as any).icon}</Text>}
            <Text style={[chipStyles.chipText, isSelected && chipStyles.chipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Theme.radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  chipIcon: { fontSize: 14 },
  chipText: {
    fontSize: 13,
    fontWeight: Theme.font.weight.medium,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
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

  const inputText = transcript || manualInput;

  const resetAll = () => {
    setManualInput('');
    setTranscript('');
    setParsed(null);
  };

  const handleClose = () => {
    resetAll();
    if (isListening) stopListening();
    onClose();
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
        Alert.alert('Estimate Created!', `${formatCurrency(total)} estimate saved as draft. Generate a PDF to send to your customer.`);
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

              {/* AI Parse button */}
              <TouchableOpacity
                style={[voiceStyles.parseBtn, !inputText.trim() && { opacity: 0.4 }]}
                onPress={handleParse}
                disabled={parsing || !inputText.trim()}
              >
                {parsing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={voiceStyles.parseBtnText}>AI is building your estimate...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 18 }}>🤖</Text>
                    <Text style={voiceStyles.parseBtnText}>Build Estimate with AI</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={voiceStyles.tipsCard}>
                <Text style={voiceStyles.tipsTitle}>💡 Tips for better estimates</Text>
                <Text style={voiceStyles.tipItem}>• Mention the tree species (oak, pine, maple...)</Text>
                <Text style={voiceStyles.tipItem}>• Include the height or size</Text>
                <Text style={voiceStyles.tipItem}>• Note any hazards (power lines, structures, slopes)</Text>
                <Text style={voiceStyles.tipItem}>• Say if it's hardwood or softwood</Text>
                <Text style={voiceStyles.tipItem}>• Include cleanup preferences</Text>
                <Text style={voiceStyles.tipItem}>• Mention your price or let AI suggest one</Text>
              </View>
            </>
          ) : (
            <>
              {/* Job summary */}
              {parsed.summary ? (
                <View style={voiceStyles.summaryCard}>
                  <Text style={voiceStyles.summaryTitle}>📋 Job Summary</Text>
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

// ─── Manual Estimate Modal (with clickable presets) ─────────────────────────

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', qty: 1, rate: 0, amount: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Preset selections
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [selectedTreeTypes, setSelectedTreeTypes] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState<string[]>([]);
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [selectedCleanup, setSelectedCleanup] = useState<string[]>([]);
  const [treeCount, setTreeCount] = useState('1');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showPresets, setShowPresets] = useState(true);

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
    setSelectedCustomerId(null);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setLineItems([{ description: '', qty: 1, rate: 0, amount: 0 }]);
    setNotes('');
    setTaxRate('0');
    setShowCustomerPicker(false);
    setSelectedJobs([]);
    setSelectedTreeTypes([]);
    setSelectedSize([]);
    setSelectedHazards([]);
    setSelectedCleanup([]);
    setTreeCount('1');
    setShowPresets(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  // AI-generate line items from presets
  const handleAIFromPresets = async () => {
    if (selectedJobs.length === 0) {
      Alert.alert('Select Job Type', 'Pick at least one type of work to do.');
      return;
    }

    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings to use AI features.');
      return;
    }

    setAiGenerating(true);
    try {
      const jobLabels = selectedJobs.map(k => JOB_TYPES.find(j => j.key === k)?.label || k).join(', ');
      const treeLabels = selectedTreeTypes.map(t => TREE_TYPES.find(tr => tr.label === t)?.label || t).join(', ');
      const sizeLabel = selectedSize.map(s => TREE_SIZES.find(sz => sz.key === s)?.label || s).join(', ');
      const hazardLabels = selectedHazards.map(h => HAZARD_FACTORS.find(f => f.key === h)?.label || h).join(', ');
      const cleanupLabels = selectedCleanup.map(c => CLEANUP_OPTIONS.find(o => o.key === c)?.label || c).join(', ');

      const prompt = `Generate professional tree service estimate line items for this job:

Work type: ${jobLabels}
Tree species: ${treeLabels || 'Not specified'}
Tree size: ${sizeLabel || 'Not specified'}
Number of trees: ${treeCount || '1'}
Hazard factors: ${hazardLabels || 'None'}
Cleanup: ${cleanupLabels || 'Standard cleanup'}

Use 2024-2025 industry-standard pricing. Return ONLY valid JSON array:
[
  { "description": "Professional description", "qty": 1, "rate": 0.00, "costJustification": "Why this costs what it does" }
]

Rules:
- 3-8 line items depending on complexity
- Factor in hardwood/softwood (hardwood costs 20-30% more)
- Factor in all hazard conditions with appropriate surcharges
- Include cleanup as a separate item
- Include stump grinding if job is removal (as separate item)
- Use realistic, competitive pricing
- Round to professional numbers`;

      const result = await aiChat([
        { role: 'system', content: `You are a pricing expert for "${companyName}", a professional tree service. Generate detailed, itemized estimates with industry-standard pricing.` },
        { role: 'user', content: prompt },
      ], { model: 'claude', maxTokens: 1000, temperature: 0.3 });

      const match = result.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('Failed to parse');

      const items = JSON.parse(match[0]);
      const newItems: LineItem[] = items.map((item: any) => ({
        description: item.description || '',
        qty: Number(item.qty) || 1,
        rate: Number(item.rate) || 0,
        amount: (Number(item.qty) || 1) * (Number(item.rate) || 0),
        costJustification: item.costJustification || '',
      }));

      setLineItems(newItems);
      setShowPresets(false);
    } catch (err: any) {
      Alert.alert('AI Error', 'Could not generate pricing. Try again or enter manually.');
    } finally {
      setAiGenerating(false);
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') item.description = value;
      else if (field === 'qty') item.qty = parseFloat(value) || 0;
      else if (field === 'rate') item.rate = parseFloat(value) || 0;
      item.amount = item.qty * item.rate;
      updated[index] = item;
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: '', qty: 1, rate: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const taxRateNum = parseFloat(taxRate) || 0;
  const taxAmount = subtotal * (taxRateNum / 100);
  const total = subtotal + taxAmount;

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerEmail(customer.email || '');
    setCustomerPhone(customer.phone || '');
    setShowCustomerPicker(false);
  };

  const handleSave = async (generatePdf: boolean) => {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter a customer name.');
      return;
    }
    const validItems = lineItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      Alert.alert('Required', 'Please add at least one line item.');
      return;
    }

    setSubmitting(true);
    if (generatePdf) setGeneratingPdf(true);

    try {
      let customerId = selectedCustomerId;
      if (!customerId) {
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            company_id: companyId,
            name: customerName.trim(),
            email: customerEmail.trim() || null,
            phone: customerPhone.trim() || null,
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
          tax_rate: taxRateNum,
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

  const filteredCustomers = customerName.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(customerName.toLowerCase()))
    : customers;

  const hasPresetSelections = selectedJobs.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={createStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={createStyles.header}>
          <TouchableOpacity onPress={handleClose} style={{ minWidth: 60 }}>
            <Text style={createStyles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={createStyles.headerTitle}>Manual Estimate</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={createStyles.scroll} contentContainerStyle={createStyles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Customer section */}
          <Text style={createStyles.sectionLabel}>Customer</Text>

          <View style={createStyles.fieldRow}>
            <Text style={createStyles.fieldLabel}>Name *</Text>
            <TextInput
              style={createStyles.fieldInput}
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

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={createStyles.fieldLabel}>Email</Text>
              <TextInput
                style={createStyles.fieldInput}
                value={customerEmail}
                onChangeText={setCustomerEmail}
                placeholder="email@example.com"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={createStyles.fieldLabel}>Phone</Text>
              <TextInput
                style={createStyles.fieldInput}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Job builder presets */}
          {showPresets && (
            <>
              <Text style={[createStyles.sectionLabel, { marginTop: Theme.space.xl }]}>
                What work needs done?
              </Text>
              <Text style={createStyles.sectionHint}>Tap all that apply — AI will generate pricing</Text>

              <Text style={createStyles.presetGroupLabel}>Job Type *</Text>
              <ChipSelector
                items={JOB_TYPES}
                selected={selectedJobs}
                onToggle={k => toggleItem(selectedJobs, k, setSelectedJobs)}
              />

              <Text style={createStyles.presetGroupLabel}>Tree Species</Text>
              <ChipSelector
                items={TREE_TYPES}
                selected={selectedTreeTypes}
                onToggle={k => toggleItem(selectedTreeTypes, k, setSelectedTreeTypes)}
              />

              <Text style={createStyles.presetGroupLabel}>Tree Size</Text>
              <ChipSelector
                items={TREE_SIZES}
                selected={selectedSize}
                onToggle={k => {
                  // Single select for size
                  setSelectedSize(selectedSize.includes(k) ? [] : [k]);
                }}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4 }}>
                <Text style={createStyles.presetGroupLabel}>Number of Trees</Text>
                <TextInput
                  style={[createStyles.fieldInput, { width: 70, textAlign: 'center', marginBottom: 0 }]}
                  value={treeCount}
                  onChangeText={setTreeCount}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>

              <Text style={createStyles.presetGroupLabel}>Hazards & Conditions</Text>
              <ChipSelector
                items={HAZARD_FACTORS}
                selected={selectedHazards}
                onToggle={k => toggleItem(selectedHazards, k, setSelectedHazards)}
              />

              <Text style={createStyles.presetGroupLabel}>Cleanup</Text>
              <ChipSelector
                items={CLEANUP_OPTIONS}
                selected={selectedCleanup}
                onToggle={k => setSelectedCleanup(selectedCleanup.includes(k) ? [] : [k])}
              />

              {/* AI Generate from presets */}
              <TouchableOpacity
                style={[createStyles.aiBtn, !hasPresetSelections && { opacity: 0.4 }]}
                onPress={handleAIFromPresets}
                disabled={!hasPresetSelections || aiGenerating}
              >
                {aiGenerating ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={createStyles.aiBtnText}>AI is pricing this job...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 18 }}>🤖</Text>
                    <Text style={createStyles.aiBtnText}>Generate Pricing with AI</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Skip to manual */}
              <TouchableOpacity
                style={createStyles.skipBtn}
                onPress={() => setShowPresets(false)}
              >
                <Text style={createStyles.skipBtnText}>Skip — I'll enter items manually</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Line items (shown after presets or when skipped) */}
          {!showPresets && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Theme.space.xl }}>
                <Text style={createStyles.sectionLabel}>Line Items</Text>
                <TouchableOpacity onPress={() => setShowPresets(true)}>
                  <Text style={{ fontSize: 13, color: Colors.ai, fontWeight: '600' as any }}>🤖 Re-generate</Text>
                </TouchableOpacity>
              </View>

              {lineItems.map((item, index) => (
                <View key={index} style={createStyles.lineItemCard}>
                  <View style={createStyles.lineItemHeader}>
                    <Text style={createStyles.lineItemIndex}>Item {index + 1}</Text>
                    {lineItems.length > 1 && (
                      <TouchableOpacity onPress={() => removeLineItem(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={createStyles.removeBtn}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={createStyles.fieldInput}
                    value={item.description}
                    onChangeText={v => updateLineItem(index, 'description', v)}
                    placeholder="Description of work"
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                  />
                  {item.costJustification ? (
                    <View style={createStyles.justificationBox}>
                      <Text style={createStyles.justificationText}>💡 {item.costJustification}</Text>
                    </View>
                  ) : null}
                  <View style={createStyles.lineItemNumbers}>
                    <View style={createStyles.numberField}>
                      <Text style={createStyles.numberLabel}>Qty</Text>
                      <TextInput
                        style={createStyles.numberInput}
                        value={item.qty > 0 ? String(item.qty) : ''}
                        onChangeText={v => updateLineItem(index, 'qty', v)}
                        placeholder="1"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={createStyles.numberField}>
                      <Text style={createStyles.numberLabel}>Rate ($)</Text>
                      <TextInput
                        style={createStyles.numberInput}
                        value={item.rate > 0 ? String(item.rate) : ''}
                        onChangeText={v => updateLineItem(index, 'rate', v)}
                        placeholder="0.00"
                        placeholderTextColor={Colors.textTertiary}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={createStyles.numberField}>
                      <Text style={createStyles.numberLabel}>Amount</Text>
                      <Text style={createStyles.amountText}>{formatCurrency(item.amount)}</Text>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={createStyles.addItemBtn} onPress={addLineItem}>
                <Text style={createStyles.addItemText}>+ Add Line Item</Text>
              </TouchableOpacity>

              {/* Notes & tax */}
              <Text style={[createStyles.sectionLabel, { marginTop: Theme.space.xl }]}>Details</Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={createStyles.fieldLabel}>Tax Rate (%)</Text>
                  <TextInput
                    style={createStyles.fieldInput}
                    value={taxRate}
                    onChangeText={setTaxRate}
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 2 }} />
              </View>

              <View style={createStyles.fieldRow}>
                <Text style={createStyles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[createStyles.fieldInput, createStyles.textArea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes, access instructions, scheduling..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Totals */}
              <View style={createStyles.totalsCard}>
                <View style={createStyles.totalRow}>
                  <Text style={createStyles.totalLabel}>Subtotal</Text>
                  <Text style={createStyles.totalValue}>{formatCurrency(subtotal)}</Text>
                </View>
                <View style={createStyles.totalRow}>
                  <Text style={createStyles.totalLabel}>Tax ({taxRateNum}%)</Text>
                  <Text style={createStyles.totalValue}>{formatCurrency(taxAmount)}</Text>
                </View>
                <View style={[createStyles.totalRow, createStyles.grandTotal]}>
                  <Text style={createStyles.grandTotalLabel}>Total</Text>
                  <Text style={createStyles.grandTotalValue}>{formatCurrency(total)}</Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={createStyles.actionButtons}>
                <TouchableOpacity
                  style={[createStyles.saveBtn, createStyles.saveDraftBtn]}
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
                  style={[createStyles.saveBtn, createStyles.savePdfBtn]}
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
        </ScrollView>
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
    setEstimates(data ?? []);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchEstimates(); } catch {}
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

// ─── Create Modal Styles ─────────────────────────────────────────────────────

const createStyles = StyleSheet.create({
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
  sectionLabel: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Theme.space.sm,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: -4,
  },
  presetGroupLabel: {
    fontSize: 13,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  fieldRow: { marginBottom: Theme.space.md },
  fieldLabel: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.medium,
    color: Colors.textSecondary,
    marginBottom: Theme.space.xs,
  },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: Theme.space.md,
    fontSize: Theme.font.size.body,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pickerDropdown: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    marginBottom: Theme.space.md,
    marginTop: -Theme.space.sm,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: Theme.space.md,
    paddingVertical: Theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemName: { fontSize: Theme.font.size.body, color: Colors.text, fontWeight: Theme.font.weight.medium },
  pickerItemSub: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginTop: 1 },
  // AI button
  aiBtn: {
    backgroundColor: Colors.ai,
    paddingVertical: 18,
    borderRadius: Theme.radius.lg,
    alignItems: 'center',
    marginTop: 24,
    ...Theme.shadow.sm,
  },
  aiBtnText: { fontSize: 16, fontWeight: Theme.font.weight.bold, color: '#fff' },
  skipBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  skipBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  // Line items
  lineItemCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.md,
    gap: Theme.space.sm,
    marginBottom: Theme.space.sm,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineItemIndex: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  removeBtn: {
    fontSize: Theme.font.size.small,
    color: Colors.danger,
    fontWeight: Theme.font.weight.medium,
  },
  justificationBox: {
    backgroundColor: Colors.ai + '08',
    borderRadius: Theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: Colors.ai,
  },
  justificationText: { fontSize: 12, color: Colors.ai, lineHeight: 16, fontStyle: 'italic' },
  lineItemNumbers: {
    flexDirection: 'row',
    gap: Theme.space.sm,
  },
  numberField: { flex: 1 },
  numberLabel: {
    fontSize: Theme.font.size.caption,
    color: Colors.textTertiary,
    marginBottom: Theme.space.xxs,
  },
  numberInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.sm,
    padding: Theme.space.sm,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    textAlign: 'center',
  },
  amountText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.primary,
    textAlign: 'center',
    paddingVertical: Theme.space.sm,
  },
  addItemBtn: {
    paddingVertical: Theme.space.md,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: Theme.space.sm,
  },
  addItemText: {
    fontSize: Theme.font.size.body,
    color: Colors.primary,
    fontWeight: Theme.font.weight.medium,
  },
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    marginTop: Theme.space.lg,
    gap: Theme.space.xs,
    ...Theme.shadow.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  totalValue: { fontSize: Theme.font.size.body, color: Colors.text },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Theme.space.sm,
    marginTop: Theme.space.xs,
  },
  grandTotalLabel: { fontSize: 20, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  grandTotalValue: { fontSize: 20, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  actionButtons: {
    gap: Theme.space.sm,
    marginTop: Theme.space.xl,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDraftBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveDraftText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.text,
  },
  savePdfBtn: {
    backgroundColor: Colors.primary,
    ...Theme.shadow.sm,
  },
  savePdfText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.semibold,
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
