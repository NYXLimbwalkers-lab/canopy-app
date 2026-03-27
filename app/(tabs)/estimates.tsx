import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { aiChat, isAIConfigured } from '@/lib/ai';
import { router } from 'expo-router';

// ─── Types ───────────────────────────────────────────────────────────────────

type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined';

interface LineItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EstimateStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: Colors.surfaceSecondary, text: Colors.textSecondary },
  sent: { label: 'Sent', bg: Colors.infoBg, text: '#1D4ED8' },
  accepted: { label: 'Accepted', bg: Colors.successBg, text: '#15803D' },
  declined: { label: 'Declined', bg: Colors.dangerBg, text: '#DC2626' },
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
      <Text style={[badgeStyles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: Theme.space.sm,
    paddingVertical: 2,
    borderRadius: Theme.radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.semibold,
  },
});

// ─── Estimate Card ───────────────────────────────────────────────────────────

function EstimateCard({ estimate, onPress }: { estimate: Estimate; onPress: (e: Estimate) => void }) {
  const customerName = estimate.customers?.name || estimate.customer_name || 'Unknown Customer';
  const estimateNumber = estimate.id.slice(0, 8).toUpperCase();

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(estimate)} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardCustomer}>{customerName}</Text>
          <Text style={styles.cardNumber}>#{estimateNumber}</Text>
        </View>
        <StatusBadge status={estimate.status} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{formatDate(estimate.created_at)}</Text>
        <Text style={styles.cardTotal}>{formatCurrency(estimate.total || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Estimate Detail Modal ───────────────────────────────────────────────────

function EstimateDetailModal({
  estimate,
  visible,
  onClose,
  onStatusChange,
  onGeneratePdf,
  onGenerateContract,
  generatingPdf,
  generatingContract,
}: {
  estimate: Estimate | null;
  visible: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: EstimateStatus) => void;
  onGeneratePdf: (id: string) => void;
  onGenerateContract: (id: string) => void;
  generatingPdf: boolean;
  generatingContract: boolean;
}) {
  if (!estimate) return null;

  const customerName = estimate.customers?.name || estimate.customer_name || 'Unknown Customer';
  const customerEmail = estimate.customers?.email || estimate.customer_email || null;
  const customerPhone = estimate.customers?.phone || estimate.customer_phone || null;
  const estimateNumber = estimate.id.slice(0, 8).toUpperCase();
  const lineItems: LineItem[] = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  const handleShare = async () => {
    const url = estimate.contract_url || estimate.pdf_url;
    if (!url) {
      Alert.alert('No Document', 'Generate a PDF or contract first before sharing.');
      return;
    }
    try {
      await Share.share({
        message: `Estimate #${estimateNumber} - ${formatCurrency(estimate.total || 0)}\n${url}`,
        url,
      });
    } catch {}
  };

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
            {customerEmail && <Text style={detailStyles.customerDetail}>{customerEmail}</Text>}
            {customerPhone && <Text style={detailStyles.customerDetail}>{customerPhone}</Text>}
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
            <Text style={detailStyles.sectionTitle}>Line Items</Text>
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

          {/* Contract status */}
          {estimate.contract_url ? (
            <View style={[detailStyles.section, { borderLeftWidth: 3, borderLeftColor: Colors.primary }]}>
              <Text style={detailStyles.sectionTitle}>Contract</Text>
              <Text style={{ fontSize: Theme.font.size.body, color: Colors.textSecondary }}>
                Contract generated and ready to share.
              </Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={detailStyles.actions}>
            <TouchableOpacity
              style={[detailStyles.actionBtn, { backgroundColor: '#1a5c1a' }]}
              onPress={() => onGenerateContract(estimate.id)}
              disabled={generatingContract}
            >
              {generatingContract ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={detailStyles.actionBtnPrimaryText}>AI building contract...</Text>
                </View>
              ) : (
                <Text style={detailStyles.actionBtnPrimaryText}>
                  {estimate.contract_url ? 'Regenerate Contract' : 'Generate Contract'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailStyles.actionBtn, detailStyles.actionBtnPrimary]}
              onPress={() => onGeneratePdf(estimate.id)}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={detailStyles.actionBtnPrimaryText}>Generate PDF</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailStyles.actionBtn, detailStyles.actionBtnSecondary]}
              onPress={handleShare}
            >
              <Text style={detailStyles.actionBtnSecondaryText}>Share</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Create Estimate Modal ───────────────────────────────────────────────────

function CreateEstimateModal({
  visible,
  onClose,
  companyId,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  companyId: string;
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
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === 'description') {
        item.description = value;
      } else if (field === 'qty') {
        item.qty = parseFloat(value) || 0;
      } else if (field === 'rate') {
        item.rate = parseFloat(value) || 0;
      }
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
      // If new customer, create them first
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={createStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={createStyles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={createStyles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={createStyles.headerTitle}>New Estimate</Text>
          <View style={{ width: 50 }} />
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

          <View style={createStyles.fieldRow}>
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

          <View style={createStyles.fieldRow}>
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

          {/* Line items */}
          <Text style={[createStyles.sectionLabel, { marginTop: Theme.space.xl }]}>Line Items</Text>

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
                placeholder="Description"
                placeholderTextColor={Colors.textTertiary}
              />
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

          <View style={createStyles.fieldRow}>
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

          <View style={createStyles.fieldRow}>
            <Text style={createStyles.fieldLabel}>Notes</Text>
            <TextInput
              style={[createStyles.fieldInput, createStyles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Totals summary */}
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

  // Create modal
  const [showCreate, setShowCreate] = useState(false);

  // Detail modal
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);

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
    try {
      await fetchEstimates();
    } catch {}
    finally {
      setRefreshing(false);
    }
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
        Alert.alert('PDF Generated', 'The estimate PDF has been created successfully.');
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

      // Send to edge function to render HTML contract
      const { data, error } = await supabase.functions.invoke('generate-contract', {
        body: { estimateId: id, sections },
      });

      if (error) throw error;
      if (data?.contractUrl) {
        setEstimates(es => es.map(e => e.id === id ? { ...e, contract_url: data.contractUrl } : e));
        setSelectedEstimate(e => e?.id === id ? { ...e, contract_url: data.contractUrl } : e);
        Alert.alert('Contract Generated', 'AI-customized contract is ready to share.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate contract');
    } finally {
      setGeneratingContract(false);
    }
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Estimates</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}
            onPress={() => router.push('/(tabs)/contract-settings' as any)}
            accessibilityLabel="Contract Settings"
          >
            <Text style={[styles.addBtnText, { color: Colors.text }]}>Contract</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
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
              icon="📄"
              title={activeFilter === 'all' ? 'No estimates yet' : `No ${activeFilter} estimates`}
              description={
                activeFilter === 'all'
                  ? 'Create your first estimate to get started.'
                  : `You have no estimates with ${activeFilter} status.`
              }
              actionLabel={activeFilter === 'all' ? 'Create estimate' : undefined}
              onAction={activeFilter === 'all' ? () => setShowCreate(true) : undefined}
            />
          ) : (
            filteredEstimates.map(estimate => (
              <EstimateCard key={estimate.id} estimate={estimate} onPress={handleOpenDetail} />
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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
        generatingPdf={generatingPdf}
        generatingContract={generatingContract}
      />

      {/* Create Modal */}
      {company && (
        <CreateEstimateModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          companyId={company.id}
          onCreated={handleEstimateCreated}
        />
      )}
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
  emptyText: { fontSize: Theme.font.size.body, color: Colors.textTertiary, fontStyle: 'italic' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
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
    alignItems: 'center',
    paddingVertical: Theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineItemLeft: { flex: 1 },
  lineItemDesc: { fontSize: Theme.font.size.body, color: Colors.text },
  lineItemMeta: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginTop: 2 },
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
  actions: { gap: Theme.space.sm },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnPrimaryText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: '#fff' },
  actionBtnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  actionBtnSecondaryText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
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
  grandTotalLabel: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  grandTotalValue: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  actionButtons: {
    gap: Theme.space.sm,
    marginTop: Theme.space.xl,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
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
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.sm,
    borderRadius: Theme.radius.md,
  },
  addBtnText: { color: Colors.textInverse, fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body },
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
  listContent: { padding: Theme.layout.screenPadding, gap: Theme.space.md, paddingBottom: 100 },
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardDate: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  cardTotal: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.lg,
  },
  fabText: { fontSize: 28, color: Colors.textInverse, lineHeight: 32 },
});
