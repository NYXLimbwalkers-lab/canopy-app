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
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

type LeadStatus = 'new' | 'contacted' | 'quoted' | 'booked' | 'lost';

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  service: string;
  source: string;
  status: LeadStatus;
  score: number;
  notes: string | null;
  created_at: string;
  company_id: string;
}

const PIPELINE_STAGES: { key: LeadStatus; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: Colors.statusNew },
  { key: 'contacted', label: 'Contacted', color: Colors.statusActive },
  { key: 'quoted', label: 'Quoted', color: Colors.statusBooked },
  { key: 'booked', label: 'Booked', color: Colors.statusComplete },
];

const SOURCE_COLORS: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  google_ads: 'success',
  facebook_ads: 'info',
  website: 'warning',
  phone: 'neutral',
  referral: 'primary' as 'neutral',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function LeadCard({ lead, onStatusChange }: { lead: Lead; onStatusChange: (id: string, status: LeadStatus) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nextStatuses: LeadStatus[] = ['new', 'contacted', 'quoted', 'booked', 'lost'];

  return (
    <TouchableOpacity style={styles.leadCard} onPress={() => setMenuOpen(true)} activeOpacity={0.85}>
      <View style={styles.leadCardHeader}>
        <View style={styles.leadCardLeft}>
          <View style={[styles.scoreCircle, { backgroundColor: Colors.primary + '22' }]}>
            <Text style={styles.scoreText}>{lead.score}</Text>
          </View>
          <View>
            <Text style={styles.leadName}>{lead.name}</Text>
            <Text style={styles.leadService}>{lead.service}</Text>
          </View>
        </View>
        <Badge
          label={(SOURCE_COLORS[lead.source] ? lead.source : lead.source).replace(/_/g, ' ')}
          variant={SOURCE_COLORS[lead.source] ?? 'neutral'}
        />
      </View>
      <View style={styles.leadCardFooter}>
        {lead.phone && <Text style={styles.leadPhone}>📞 {lead.phone}</Text>}
        <Text style={styles.leadTime}>{timeAgo(lead.created_at)}</Text>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setMenuOpen(false)} activeOpacity={1}>
          <View style={styles.statusMenu}>
            <Text style={styles.statusMenuTitle}>Move to stage</Text>
            {nextStatuses.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.statusOption, lead.status === s && styles.statusOptionActive]}
                onPress={() => { onStatusChange(lead.id, s); setMenuOpen(false); }}
              >
                <Text style={[styles.statusOptionText, lead.status === s && styles.statusOptionTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  {lead.status === s ? ' ✓' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </TouchableOpacity>
  );
}

interface AddLeadForm {
  name: string;
  phone: string;
  email: string;
  service: string;
  source: string;
  notes: string;
}

export default function LeadsScreen() {
  const { company } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeStage, setActiveStage] = useState<LeadStatus | 'all'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AddLeadForm>({
    name: '', phone: '', email: '', service: '', source: 'phone', notes: '',
  });

  const fetchLeads = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLeads(data ?? []);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeads();
    setRefreshing(false);
  }, [fetchLeads]);

  useEffect(() => {
    fetchLeads().finally(() => setLoading(false));
  }, [fetchLeads]);

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    await supabase.from('leads').update({ status }).eq('id', id);
  };

  const handleAddLead = async () => {
    if (!company || !form.name.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.from('leads').insert({
        company_id: company.id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        service: form.service.trim() || 'Tree service',
        source: form.source,
        status: 'new',
        score: 5,
        notes: form.notes.trim() || null,
      }).select().single();

      if (data) {
        setLeads(prev => [data, ...prev]);
        setShowAdd(false);
        setForm({ name: '', phone: '', email: '', service: '', source: 'phone', notes: '' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLeads = activeStage === 'all' ? leads : leads.filter(l => l.status === activeStage);

  const countFor = (stage: LeadStatus) => leads.filter(l => l.status === stage).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lead Inbox</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Pipeline stage filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageScroll} contentContainerStyle={styles.stageScrollContent}>
        <TouchableOpacity
          style={[styles.stageChip, activeStage === 'all' && styles.stageChipActive]}
          onPress={() => setActiveStage('all')}
        >
          <Text style={[styles.stageChipText, activeStage === 'all' && styles.stageChipTextActive]}>
            All ({leads.length})
          </Text>
        </TouchableOpacity>
        {PIPELINE_STAGES.map(stage => (
          <TouchableOpacity
            key={stage.key}
            style={[styles.stageChip, activeStage === stage.key && styles.stageChipActive, activeStage === stage.key && { borderColor: stage.color }]}
            onPress={() => setActiveStage(stage.key)}
          >
            <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
            <Text style={[styles.stageChipText, activeStage === stage.key && styles.stageChipTextActive]}>
              {stage.label} ({countFor(stage.key)})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lead list */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        >
          {filteredLeads.length === 0 ? (
            <EmptyState
              icon="📬"
              title={activeStage === 'all' ? 'No leads yet' : `No ${activeStage} leads`}
              description={
                activeStage === 'all'
                  ? 'Add your first lead manually or connect your ad platforms to start receiving leads automatically.'
                  : `You have no leads in the ${activeStage} stage right now.`
              }
              actionLabel={activeStage === 'all' ? 'Add lead' : undefined}
              onAction={activeStage === 'all' ? () => setShowAdd(true) : undefined}
            />
          ) : (
            filteredLeads.map(lead => (
              <LeadCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add Lead Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Lead</Text>
            <TouchableOpacity onPress={handleAddLead} disabled={submitting || !form.name.trim()}>
              {submitting ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <Text style={[styles.modalSave, !form.name.trim() && styles.modalSaveDisabled]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Customer name"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.phone}
              onChangeText={v => setForm(f => ({ ...f, phone: v }))}
              placeholder="(555) 123-4567"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.email}
              onChangeText={v => setForm(f => ({ ...f, email: v }))}
              placeholder="email@example.com"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Service needed</Text>
            <TextInput
              style={styles.fieldInput}
              value={form.service}
              onChangeText={v => setForm(f => ({ ...f, service: v }))}
              placeholder="Tree removal, trimming, stump grinding..."
              placeholderTextColor={Colors.textTertiary}
            />
            <Text style={styles.fieldLabel}>Source</Text>
            <View style={styles.sourceRow}>
              {['phone', 'website', 'referral', 'google_ads', 'facebook_ads'].map(src => (
                <TouchableOpacity
                  key={src}
                  style={[styles.sourceChip, form.source === src && styles.sourceChipActive]}
                  onPress={() => setForm(f => ({ ...f, source: src }))}
                >
                  <Text style={[styles.sourceChipText, form.source === src && styles.sourceChipTextActive]}>
                    {src.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextarea]}
              value={form.notes}
              onChangeText={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="Any details about the job..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

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
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Theme.space.lg, paddingVertical: Theme.space.sm, borderRadius: Theme.radius.md },
  addBtnText: { color: Colors.textInverse, fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body },
  stageScroll: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stageScrollContent: { paddingHorizontal: Theme.layout.screenPadding, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  stageChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Theme.radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  stageChipActive: { backgroundColor: Colors.primary + '12', borderColor: Colors.primary },
  stageChipText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  stageChipTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  list: { flex: 1 },
  listContent: { padding: Theme.layout.screenPadding, gap: Theme.space.md, paddingBottom: 100 },
  leadCard: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    gap: Theme.space.sm,
    ...Theme.shadow.sm,
  },
  leadCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leadCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.md, flex: 1 },
  scoreCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.bold, color: Colors.primary },
  leadName: { fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  leadService: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  leadCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  leadPhone: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  leadTime: { fontSize: Theme.font.size.caption, color: Colors.textTertiary },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', alignItems: 'center' },
  statusMenu: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    width: 260,
    gap: 4,
    ...Theme.shadow.lg,
  },
  statusMenuTitle: { fontSize: Theme.font.size.small, color: Colors.textTertiary, fontWeight: Theme.font.weight.semibold, textTransform: 'uppercase', marginBottom: Theme.space.sm },
  statusOption: { paddingVertical: 12, paddingHorizontal: Theme.space.md, borderRadius: Theme.radius.md },
  statusOptionActive: { backgroundColor: Colors.primary + '15' },
  statusOptionText: { fontSize: Theme.font.size.body, color: Colors.text },
  statusOptionTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Theme.shadow.lg,
  },
  fabText: { fontSize: 28, color: Colors.textInverse, lineHeight: 32 },
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Theme.layout.screenPadding,
    paddingTop: Theme.space.xl,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text },
  modalCancel: { fontSize: Theme.font.size.body, color: Colors.textSecondary },
  modalSave: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  modalSaveDisabled: { color: Colors.textTertiary },
  modalScroll: { flex: 1 },
  modalContent: { padding: Theme.layout.screenPadding, gap: Theme.space.sm, paddingBottom: 40 },
  fieldLabel: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.medium, color: Colors.textSecondary, marginTop: Theme.space.md },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    padding: Theme.space.md,
    fontSize: Theme.font.size.body,
    color: Colors.text,
  },
  fieldTextarea: { minHeight: 80, textAlignVertical: 'top' },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  sourceChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Theme.radius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sourceChipActive: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  sourceChipText: { fontSize: Theme.font.size.small, color: Colors.textSecondary },
  sourceChipTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
});
