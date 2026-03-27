import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { aiChat, isAIConfigured } from '@/lib/ai';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContractSettings {
  id: string;
  company_id: string;
  payment_terms: string;
  deposit_required: boolean;
  deposit_percent: number;
  warranty_text: string;
  warranty_days: number;
  cancellation_text: string;
  cancellation_hours: number;
  liability_text: string;
  cleanup_text: string;
  property_access_text: string;
  additional_clauses: string[];
  include_scope: boolean;
  include_schedule: boolean;
  include_payment: boolean;
  include_access: boolean;
  include_liability: boolean;
  include_cancellation: boolean;
  include_cleanup: boolean;
  include_warranty: boolean;
  include_additional: boolean;
  permit_clause: boolean;
  permit_text: string;
  utility_clause: boolean;
  utility_text: string;
  stump_grinding_clause: boolean;
  stump_grinding_text: string;
  crane_clause: boolean;
  crane_text: string;
}

const DEFAULT_SETTINGS: Omit<ContractSettings, 'id' | 'company_id'> = {
  payment_terms: 'Payment is due upon completion of work unless otherwise agreed in writing.',
  deposit_required: false,
  deposit_percent: 50,
  warranty_text: 'All work performed is guaranteed for 30 days from the date of completion. This warranty covers workmanship only and does not cover acts of nature, disease, or pre-existing conditions.',
  warranty_days: 30,
  cancellation_text: 'Either party may cancel this agreement with 48 hours written notice. Cancellation after work has commenced may be subject to charges for work already performed.',
  cancellation_hours: 48,
  liability_text: 'Contractor maintains general liability insurance and workers compensation coverage. Contractor is not liable for damage to underground utilities, irrigation systems, or other subsurface structures not disclosed prior to work.',
  cleanup_text: 'All debris generated from the work will be removed and the work area will be left in a clean condition. Stump grindings will be left on-site unless removal is specified in the scope of work.',
  property_access_text: 'Client agrees to provide clear access to the work area including removal of vehicles, outdoor furniture, and other obstacles. Client is responsible for identifying and disclosing all underground utilities and irrigation lines.',
  additional_clauses: [],
  include_scope: true,
  include_schedule: true,
  include_payment: true,
  include_access: true,
  include_liability: true,
  include_cancellation: true,
  include_cleanup: true,
  include_warranty: true,
  include_additional: true,
  permit_clause: false,
  permit_text: 'Client is responsible for obtaining any required permits unless otherwise agreed. Contractor will provide necessary documentation for permit applications.',
  utility_clause: true,
  utility_text: 'Contractor will exercise due care when working near utility lines. Client is responsible for contacting 811 (Call Before You Dig) at least 48 hours prior to scheduled work.',
  stump_grinding_clause: true,
  stump_grinding_text: 'Stump grinding depth is typically 6-12 inches below grade. Roots extending beyond the grinding area are not included unless specified.',
  crane_clause: false,
  crane_text: 'Crane operations require adequate ground conditions and access. Client is responsible for ensuring the designated crane setup area is clear and accessible.',
};

// ─── AI-Assisted Text Field ─────────────────────────────────────────────────

function AITextField({
  label,
  value,
  onChangeText,
  sectionContext,
  companyName,
  placeholder,
  multiline = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  sectionContext: string;
  companyName: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [aiLoading, setAiLoading] = useState(false);

  const handleAIRewrite = async () => {
    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings to use AI assistance.');
      return;
    }
    setAiLoading(true);
    try {
      const result = await aiChat([
        {
          role: 'system',
          content: `You are a contract writer for ${companyName}, a professional tree service company. Write clear, enforceable contract language that protects both the contractor and the client. Be professional but not overly legalistic. Return ONLY the rewritten text, no quotes, no explanation.`,
        },
        {
          role: 'user',
          content: `Rewrite and improve this ${sectionContext} clause for a tree service contract. Make it more professional and comprehensive while keeping it concise:\n\n"${value}"\n\nReturn only the improved text.`,
        },
      ], { model: 'claude', maxTokens: 400, temperature: 0.3 });
      onChangeText(result.trim().replace(/^["']|["']$/g, ''));
    } catch (err: any) {
      Alert.alert('AI Error', err.message || 'Failed to generate text');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIMakeStrict = async () => {
    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings.');
      return;
    }
    setAiLoading(true);
    try {
      const result = await aiChat([
        {
          role: 'system',
          content: `You are a contract writer for ${companyName}, a professional tree service company. Make contract clauses stricter and more protective of the contractor while remaining fair. Return ONLY the rewritten text.`,
        },
        {
          role: 'user',
          content: `Make this ${sectionContext} clause stricter and more protective of the contractor:\n\n"${value}"\n\nReturn only the improved text.`,
        },
      ], { model: 'claude', maxTokens: 400, temperature: 0.3 });
      onChangeText(result.trim().replace(/^["']|["']$/g, ''));
    } catch (err: any) {
      Alert.alert('AI Error', err.message || 'Failed to generate text');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAISimplify = async () => {
    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings.');
      return;
    }
    setAiLoading(true);
    try {
      const result = await aiChat([
        {
          role: 'system',
          content: `You are a contract writer for ${companyName}, a professional tree service company. Simplify contract clauses to be more client-friendly while still protecting the contractor. Use plain language. Return ONLY the rewritten text.`,
        },
        {
          role: 'user',
          content: `Simplify this ${sectionContext} clause to be easier for clients to understand:\n\n"${value}"\n\nReturn only the simplified text.`,
        },
      ], { model: 'fast', maxTokens: 300, temperature: 0.3 });
      onChangeText(result.trim().replace(/^["']|["']$/g, ''));
    } catch (err: any) {
      Alert.alert('AI Error', err.message || 'Failed to generate text');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <View style={fieldStyles.container}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, multiline && fieldStyles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
      />
      {isAIConfigured() && (
        <View style={fieldStyles.aiButtons}>
          {aiLoading ? (
            <View style={fieldStyles.aiLoadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={fieldStyles.aiLoadingText}>AI writing...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={fieldStyles.aiBtn} onPress={handleAIRewrite}>
                <Text style={fieldStyles.aiBtnText}>AI Improve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[fieldStyles.aiBtn, { borderColor: '#b45309' }]} onPress={handleAIMakeStrict}>
                <Text style={[fieldStyles.aiBtnText, { color: '#b45309' }]}>Stricter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[fieldStyles.aiBtn, { borderColor: '#0284c7' }]} onPress={handleAISimplify}>
                <Text style={[fieldStyles.aiBtnText, { color: '#0284c7' }]}>Simplify</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { marginBottom: Theme.space.lg },
  label: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.textSecondary,
    marginBottom: Theme.space.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: Theme.space.md,
    fontSize: Theme.font.size.body,
    color: Colors.text,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  aiButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Theme.space.xs,
  },
  aiBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  aiBtnText: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.primary,
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiLoadingText: {
    fontSize: Theme.font.size.caption,
    color: Colors.primary,
  },
});

// ─── Section Toggle ─────────────────────────────────────────────────────────

function SectionToggle({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}) {
  return (
    <View style={toggleStyles.container}>
      <View style={toggleStyles.left}>
        <Text style={toggleStyles.label}>{label}</Text>
        <Text style={toggleStyles.desc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
        thumbColor={value ? Colors.primary : Colors.textTertiary}
      />
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  left: { flex: 1, marginRight: Theme.space.md },
  label: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  desc: { fontSize: Theme.font.size.small, color: Colors.textTertiary, marginTop: 2 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ContractSettingsScreen() {
  const { company } = useAuthStore();
  const [settings, setSettings] = useState<ContractSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [newClause, setNewClause] = useState('');
  const [aiGeneratingAll, setAiGeneratingAll] = useState(false);

  const companyName = company?.name || 'Company';

  const fetchSettings = useCallback(async () => {
    if (!company) return;
    const { data, error } = await supabase
      .from('contract_settings')
      .select('*')
      .eq('company_id', company.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings yet — create defaults
      const { data: newData, error: insertError } = await supabase
        .from('contract_settings')
        .insert({ company_id: company.id })
        .select()
        .single();
      if (!insertError && newData) {
        setSettings(newData as ContractSettings);
      }
    } else if (data) {
      setSettings(data as ContractSettings);
    }
  }, [company]);

  useEffect(() => {
    fetchSettings().finally(() => setLoading(false));
  }, [fetchSettings]);

  const update = <K extends keyof ContractSettings>(key: K, value: ContractSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!settings || !company) return;
    setSaving(true);
    try {
      const { id, company_id, ...updates } = settings;
      const { error } = await supabase
        .from('contract_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('company_id', company.id);
      if (error) throw error;
      setHasChanges(false);
      Alert.alert('Saved', 'Contract settings updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddClause = () => {
    if (!newClause.trim() || !settings) return;
    update('additional_clauses', [...(settings.additional_clauses || []), newClause.trim()]);
    setNewClause('');
  };

  const handleRemoveClause = (index: number) => {
    if (!settings) return;
    update('additional_clauses', settings.additional_clauses.filter((_, i) => i !== index));
  };

  const handleAIGenerateAll = async () => {
    if (!isAIConfigured()) {
      Alert.alert('AI Not Configured', 'Add your OpenRouter API key in Settings.');
      return;
    }
    Alert.alert(
      'AI Generate All Sections',
      'This will use AI to generate professional contract language for all sections. Your current text will be replaced. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setAiGeneratingAll(true);
            try {
              const services = company?.services_offered?.join(', ') || 'tree removal, trimming, stump grinding';
              const result = await aiChat([
                {
                  role: 'system',
                  content: `You are a contract writer for ${companyName}, a professional tree service company in ${company?.city || 'their area'}, ${company?.state || ''}. Generate comprehensive, legally-sound contract sections. Return ONLY valid JSON.`,
                },
                {
                  role: 'user',
                  content: `Generate professional tree service contract clauses for all sections. The company offers: ${services}.

Return JSON:
{
  "payment_terms": "payment terms clause",
  "warranty_text": "warranty clause (30-day default)",
  "cancellation_text": "cancellation policy",
  "liability_text": "liability and insurance clause",
  "cleanup_text": "cleanup and debris removal clause",
  "property_access_text": "property access requirements",
  "permit_text": "permit responsibility clause",
  "utility_text": "utility line safety clause",
  "stump_grinding_text": "stump grinding specifics",
  "crane_text": "crane operation requirements"
}`,
                },
              ], { model: 'claude', maxTokens: 2000, temperature: 0.3 });

              const match = result.match(/\{[\s\S]*\}/);
              if (match) {
                const sections = JSON.parse(match[0]);
                setSettings(prev => prev ? {
                  ...prev,
                  payment_terms: sections.payment_terms || prev.payment_terms,
                  warranty_text: sections.warranty_text || prev.warranty_text,
                  cancellation_text: sections.cancellation_text || prev.cancellation_text,
                  liability_text: sections.liability_text || prev.liability_text,
                  cleanup_text: sections.cleanup_text || prev.cleanup_text,
                  property_access_text: sections.property_access_text || prev.property_access_text,
                  permit_text: sections.permit_text || prev.permit_text,
                  utility_text: sections.utility_text || prev.utility_text,
                  stump_grinding_text: sections.stump_grinding_text || prev.stump_grinding_text,
                  crane_text: sections.crane_text || prev.crane_text,
                } : prev);
                setHasChanges(true);
                Alert.alert('Done', 'AI has generated all contract sections. Review and save when ready.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'AI generation failed');
            } finally {
              setAiGeneratingAll(false);
            }
          },
        },
      ]
    );
  };

  const handleResetDefaults = () => {
    Alert.alert(
      'Reset to Defaults',
      'This will reset all contract settings to their defaults. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            if (!settings) return;
            setSettings({ ...settings, ...DEFAULT_SETTINGS });
            setHasChanges(true);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.loadingCenter}>
        <Text style={styles.errorText}>Failed to load settings</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contract Settings</Text>
        {hasChanges && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI Generate All */}
        <TouchableOpacity
          style={styles.aiGenerateAllBtn}
          onPress={handleAIGenerateAll}
          disabled={aiGeneratingAll}
        >
          {aiGeneratingAll ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.aiGenerateAllText}>AI generating all sections...</Text>
            </View>
          ) : (
            <Text style={styles.aiGenerateAllText}>AI Generate All Sections</Text>
          )}
        </TouchableOpacity>

        {/* ── Section Visibility ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contract Sections</Text>
          <Text style={styles.cardDesc}>Toggle which sections appear in generated contracts</Text>

          <SectionToggle
            label="Scope of Work"
            description="Auto-generated from estimate line items"
            value={settings.include_scope}
            onValueChange={v => update('include_scope', v)}
          />
          <SectionToggle
            label="Work Schedule"
            description="Scheduling and timeline details"
            value={settings.include_schedule}
            onValueChange={v => update('include_schedule', v)}
          />
          <SectionToggle
            label="Payment Terms"
            description="Payment schedule and deposit requirements"
            value={settings.include_payment}
            onValueChange={v => update('include_payment', v)}
          />
          <SectionToggle
            label="Property Access"
            description="Client responsibilities for site preparation"
            value={settings.include_access}
            onValueChange={v => update('include_access', v)}
          />
          <SectionToggle
            label="Liability & Insurance"
            description="Liability limitations and coverage"
            value={settings.include_liability}
            onValueChange={v => update('include_liability', v)}
          />
          <SectionToggle
            label="Cancellation Policy"
            description="Terms for cancelling or rescheduling"
            value={settings.include_cancellation}
            onValueChange={v => update('include_cancellation', v)}
          />
          <SectionToggle
            label="Cleanup & Debris"
            description="Cleanup commitments and debris removal"
            value={settings.include_cleanup}
            onValueChange={v => update('include_cleanup', v)}
          />
          <SectionToggle
            label="Warranty"
            description="Work guarantee and warranty terms"
            value={settings.include_warranty}
            onValueChange={v => update('include_warranty', v)}
          />
          <SectionToggle
            label="Additional Terms"
            description="Custom clauses you've added"
            value={settings.include_additional}
            onValueChange={v => update('include_additional', v)}
          />
        </View>

        {/* ── Payment Settings ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>

          <AITextField
            label="Payment Terms"
            value={settings.payment_terms}
            onChangeText={v => update('payment_terms', v)}
            sectionContext="payment terms"
            companyName={companyName}
          />

          <View style={toggleStyles.container}>
            <View style={toggleStyles.left}>
              <Text style={toggleStyles.label}>Require Deposit</Text>
              <Text style={toggleStyles.desc}>Require upfront deposit before work begins</Text>
            </View>
            <Switch
              value={settings.deposit_required}
              onValueChange={v => update('deposit_required', v)}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={settings.deposit_required ? Colors.primary : Colors.textTertiary}
            />
          </View>

          {settings.deposit_required && (
            <View style={{ marginTop: Theme.space.sm }}>
              <Text style={fieldStyles.label}>Deposit Percentage</Text>
              <View style={styles.numberRow}>
                {[25, 50, 75].map(pct => (
                  <TouchableOpacity
                    key={pct}
                    style={[
                      styles.numberChip,
                      settings.deposit_percent === pct && styles.numberChipActive,
                    ]}
                    onPress={() => update('deposit_percent', pct)}
                  >
                    <Text
                      style={[
                        styles.numberChipText,
                        settings.deposit_percent === pct && styles.numberChipTextActive,
                      ]}
                    >
                      {pct}%
                    </Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={styles.numberInput}
                  value={String(settings.deposit_percent)}
                  onChangeText={v => update('deposit_percent', parseFloat(v) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="Custom"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
            </View>
          )}
        </View>

        {/* ── Warranty ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Warranty</Text>

          <View style={{ marginBottom: Theme.space.md }}>
            <Text style={fieldStyles.label}>Warranty Period (days)</Text>
            <View style={styles.numberRow}>
              {[14, 30, 60, 90].map(days => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.numberChip,
                    settings.warranty_days === days && styles.numberChipActive,
                  ]}
                  onPress={() => update('warranty_days', days)}
                >
                  <Text
                    style={[
                      styles.numberChipText,
                      settings.warranty_days === days && styles.numberChipTextActive,
                    ]}
                  >
                    {days}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AITextField
            label="Warranty Language"
            value={settings.warranty_text}
            onChangeText={v => update('warranty_text', v)}
            sectionContext="warranty"
            companyName={companyName}
          />
        </View>

        {/* ── Cancellation ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cancellation</Text>

          <View style={{ marginBottom: Theme.space.md }}>
            <Text style={fieldStyles.label}>Notice Period (hours)</Text>
            <View style={styles.numberRow}>
              {[24, 48, 72].map(hrs => (
                <TouchableOpacity
                  key={hrs}
                  style={[
                    styles.numberChip,
                    settings.cancellation_hours === hrs && styles.numberChipActive,
                  ]}
                  onPress={() => update('cancellation_hours', hrs)}
                >
                  <Text
                    style={[
                      styles.numberChipText,
                      settings.cancellation_hours === hrs && styles.numberChipTextActive,
                    ]}
                  >
                    {hrs}h
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <AITextField
            label="Cancellation Policy"
            value={settings.cancellation_text}
            onChangeText={v => update('cancellation_text', v)}
            sectionContext="cancellation policy"
            companyName={companyName}
          />
        </View>

        {/* ── Liability ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Liability & Insurance</Text>
          <AITextField
            label="Liability Language"
            value={settings.liability_text}
            onChangeText={v => update('liability_text', v)}
            sectionContext="liability and insurance"
            companyName={companyName}
          />
        </View>

        {/* ── Cleanup ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cleanup & Debris Removal</Text>
          <AITextField
            label="Cleanup Terms"
            value={settings.cleanup_text}
            onChangeText={v => update('cleanup_text', v)}
            sectionContext="cleanup and debris removal"
            companyName={companyName}
          />
        </View>

        {/* ── Property Access ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Property Access</Text>
          <AITextField
            label="Access Requirements"
            value={settings.property_access_text}
            onChangeText={v => update('property_access_text', v)}
            sectionContext="property access"
            companyName={companyName}
          />
        </View>

        {/* ── Tree Service-Specific Clauses ────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tree Service Clauses</Text>
          <Text style={styles.cardDesc}>Special clauses for tree service work</Text>

          <SectionToggle
            label="Permit Clause"
            description="Who handles permits"
            value={settings.permit_clause}
            onValueChange={v => update('permit_clause', v)}
          />
          {settings.permit_clause && (
            <AITextField
              label="Permit Language"
              value={settings.permit_text}
              onChangeText={v => update('permit_text', v)}
              sectionContext="permit requirements"
              companyName={companyName}
            />
          )}

          <SectionToggle
            label="Utility Line Safety"
            description="Utility proximity and 811 requirements"
            value={settings.utility_clause}
            onValueChange={v => update('utility_clause', v)}
          />
          {settings.utility_clause && (
            <AITextField
              label="Utility Language"
              value={settings.utility_text}
              onChangeText={v => update('utility_text', v)}
              sectionContext="utility line safety"
              companyName={companyName}
            />
          )}

          <SectionToggle
            label="Stump Grinding"
            description="Stump grinding depth and scope"
            value={settings.stump_grinding_clause}
            onValueChange={v => update('stump_grinding_clause', v)}
          />
          {settings.stump_grinding_clause && (
            <AITextField
              label="Stump Grinding Terms"
              value={settings.stump_grinding_text}
              onChangeText={v => update('stump_grinding_text', v)}
              sectionContext="stump grinding"
              companyName={companyName}
            />
          )}

          <SectionToggle
            label="Crane Operations"
            description="Crane access and setup requirements"
            value={settings.crane_clause}
            onValueChange={v => update('crane_clause', v)}
          />
          {settings.crane_clause && (
            <AITextField
              label="Crane Terms"
              value={settings.crane_text}
              onChangeText={v => update('crane_text', v)}
              sectionContext="crane operations"
              companyName={companyName}
            />
          )}
        </View>

        {/* ── Custom Clauses ────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custom Clauses</Text>
          <Text style={styles.cardDesc}>Add your own contract terms</Text>

          {(settings.additional_clauses || []).map((clause, index) => (
            <View key={index} style={styles.clauseItem}>
              <Text style={styles.clauseText}>{clause}</Text>
              <TouchableOpacity onPress={() => handleRemoveClause(index)}>
                <Text style={styles.clauseRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addClauseRow}>
            <TextInput
              style={[fieldStyles.input, { flex: 1 }]}
              value={newClause}
              onChangeText={setNewClause}
              placeholder="Add a custom clause..."
              placeholderTextColor={Colors.textTertiary}
              multiline
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: Theme.space.xs }}>
            <TouchableOpacity style={styles.addClauseBtn} onPress={handleAddClause} disabled={!newClause.trim()}>
              <Text style={styles.addClauseBtnText}>Add Clause</Text>
            </TouchableOpacity>
            {isAIConfigured() && (
              <TouchableOpacity
                style={[styles.addClauseBtn, { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' }]}
                onPress={async () => {
                  if (!newClause.trim()) {
                    // Generate a suggested clause from AI
                    try {
                      const result = await aiChat([
                        {
                          role: 'system',
                          content: `You are a contract writer for ${companyName}. Suggest one useful additional contract clause for a tree service company that isn't covered by standard sections. Return ONLY the clause text.`,
                        },
                        {
                          role: 'user',
                          content: `Suggest one additional contract clause for a tree service company. Keep it under 2 sentences.`,
                        },
                      ], { model: 'fast', maxTokens: 100, temperature: 0.8 });
                      setNewClause(result.trim().replace(/^["']|["']$/g, ''));
                    } catch {}
                  } else {
                    // Improve the entered clause
                    try {
                      const result = await aiChat([
                        {
                          role: 'system',
                          content: `You are a contract writer for ${companyName}. Improve the given clause to be more professional and enforceable. Return ONLY the improved text.`,
                        },
                        {
                          role: 'user',
                          content: `Improve this clause: "${newClause}"`,
                        },
                      ], { model: 'fast', maxTokens: 150, temperature: 0.3 });
                      setNewClause(result.trim().replace(/^["']|["']$/g, ''));
                    } catch {}
                  }
                }}
              >
                <Text style={[styles.addClauseBtnText, { color: Colors.primary }]}>
                  {newClause.trim() ? 'AI Improve' : 'AI Suggest'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Reset ────────────────────────────────── */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefaults}>
          <Text style={styles.resetBtnText}>Reset All to Defaults</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
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
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Theme.space.lg,
    paddingVertical: Theme.space.sm,
    borderRadius: Theme.radius.md,
    minWidth: 70,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body },
  scroll: { flex: 1 },
  scrollContent: { padding: Theme.layout.screenPadding, paddingBottom: 100 },
  aiGenerateAllBtn: {
    backgroundColor: '#1a5c1a',
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    marginBottom: Theme.space.lg,
  },
  aiGenerateAllText: { color: '#fff', fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    marginBottom: Theme.space.lg,
    ...Theme.shadow.sm,
  },
  cardTitle: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: Theme.font.size.small,
    color: Colors.textTertiary,
    marginBottom: Theme.space.md,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  numberChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  numberChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  numberChipText: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },
  numberChipTextActive: {
    color: Colors.primary,
    fontWeight: Theme.font.weight.bold,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: Theme.space.sm,
    width: 70,
    textAlign: 'center',
    fontSize: Theme.font.size.body,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  clauseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: Theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Theme.space.sm,
  },
  clauseText: {
    flex: 1,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 20,
  },
  clauseRemove: {
    fontSize: Theme.font.size.small,
    color: Colors.danger,
    fontWeight: Theme.font.weight.medium,
  },
  addClauseRow: {
    marginTop: Theme.space.md,
  },
  addClauseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addClauseBtnText: {
    fontSize: Theme.font.size.body,
    fontWeight: Theme.font.weight.medium,
    color: Colors.text,
  },
  resetBtn: {
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    marginTop: Theme.space.md,
  },
  resetBtnText: {
    fontSize: Theme.font.size.body,
    color: Colors.danger,
    fontWeight: Theme.font.weight.medium,
  },
});
