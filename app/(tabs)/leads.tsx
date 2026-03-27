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
  Linking,
  Alert,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';
import { scoreAndSuggestFollowUp, isAIConfigured, aiChat } from '@/lib/ai';

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

const ALL_STATUSES: { key: LeadStatus; label: string; emoji: string }[] = [
  { key: 'new', label: 'New', emoji: '🆕' },
  { key: 'contacted', label: 'Contacted', emoji: '📞' },
  { key: 'quoted', label: 'Quoted', emoji: '📋' },
  { key: 'booked', label: 'Booked', emoji: '✅' },
  { key: 'lost', label: 'Lost', emoji: '❌' },
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

// ─── Lead Detail Modal ────────────────────────────────────────────────────────

function LeadDetailModal({
  lead,
  visible,
  onClose,
  onStatusChange,
  onScore,
  scoringId,
  onReviewRequest,
  onCreateEstimate,
  creatingEstimate,
}: {
  lead: Lead | null;
  visible: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onScore: (lead: Lead) => void;
  scoringId: string | null;
  onReviewRequest: (lead: Lead) => void;
  onCreateEstimate: (lead: Lead) => void;
  creatingEstimate: boolean;
}) {
  if (!lead) return null;
  const isScoring = scoringId === lead.id;
  const showEstimateBtn = ['new', 'contacted', 'quoted'].includes(lead.status);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        {/* Header */}
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={detailStyles.closeBtn}>Done</Text>
          </TouchableOpacity>
          <Text style={detailStyles.headerTitle}>Lead Detail</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={detailStyles.scroll} contentContainerStyle={detailStyles.content}>
          {/* Score + Name */}
          <View style={detailStyles.nameRow}>
            <View style={detailStyles.scoreBubble}>
              <Text style={detailStyles.scoreBubbleText}>{lead.score}</Text>
              <Text style={detailStyles.scoreBubbleLabel}>score</Text>
            </View>
            <View style={detailStyles.nameBlock}>
              <Text style={detailStyles.leadName}>{lead.name}</Text>
              <Text style={detailStyles.leadService}>{lead.service || 'Tree service'}</Text>
              <Text style={detailStyles.leadTime}>{timeAgo(lead.created_at)}</Text>
            </View>
            <Badge
              label={lead.source.replace(/_/g, ' ')}
              variant={SOURCE_COLORS[lead.source] ?? 'neutral'}
            />
          </View>

          {/* Contact info */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Contact</Text>
            {lead.phone ? (
              <TouchableOpacity
                style={detailStyles.contactRow}
                onPress={() => Linking.openURL(`tel:${lead.phone}`)}
              >
                <Text style={detailStyles.contactIcon}>📞</Text>
                <Text style={detailStyles.contactValue}>{lead.phone}</Text>
                <Text style={detailStyles.contactAction}>Call →</Text>
              </TouchableOpacity>
            ) : (
              <Text style={detailStyles.contactNone}>No phone on file</Text>
            )}
            {lead.email ? (
              <TouchableOpacity
                style={detailStyles.contactRow}
                onPress={() => Linking.openURL(`mailto:${lead.email}`)}
              >
                <Text style={detailStyles.contactIcon}>✉️</Text>
                <Text style={detailStyles.contactValue}>{lead.email}</Text>
                <Text style={detailStyles.contactAction}>Email →</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Notes */}
          {lead.notes ? (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Notes</Text>
              <Text style={detailStyles.notesText}>{lead.notes}</Text>
            </View>
          ) : null}

          {/* Status pipeline */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>Pipeline Stage</Text>
            <View style={detailStyles.statusGrid}>
              {ALL_STATUSES.map(s => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    detailStyles.statusBtn,
                    lead.status === s.key && detailStyles.statusBtnActive,
                  ]}
                  onPress={() => onStatusChange(lead.id, s.key)}
                >
                  <Text style={detailStyles.statusBtnEmoji}>{s.emoji}</Text>
                  <Text
                    style={[
                      detailStyles.statusBtnText,
                      lead.status === s.key && detailStyles.statusBtnTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* AI actions */}
          {isAIConfigured() && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>AI Tools</Text>
              <View style={detailStyles.aiActions}>
                <TouchableOpacity
                  style={[detailStyles.aiBtn, isScoring && detailStyles.aiBtnDisabled]}
                  onPress={() => onScore(lead)}
                  disabled={isScoring}
                >
                  {isScoring ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={detailStyles.aiBtnText}>🤖 Score & Follow-up</Text>
                  )}
                </TouchableOpacity>
                {lead.status === 'booked' && (
                  <TouchableOpacity
                    style={detailStyles.aiBtn}
                    onPress={() => onReviewRequest(lead)}
                  >
                    <Text style={detailStyles.aiBtnText}>🌟 Generate Review Request</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Create Estimate */}
          {showEstimateBtn && (
            <TouchableOpacity
              style={[detailStyles.estimateBtn, creatingEstimate && detailStyles.estimateBtnDisabled]}
              onPress={() => onCreateEstimate(lead)}
              disabled={creatingEstimate}
            >
              {creatingEstimate ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={detailStyles.estimateBtnText}>Create Estimate</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onOpen,
  scoringId,
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  scoringId: string | null;
}) {
  const isScoring = scoringId === lead.id;

  return (
    <TouchableOpacity style={styles.leadCard} onPress={() => onOpen(lead)} activeOpacity={0.85}>
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
        <View style={styles.leadFooterRight}>
          <Text style={styles.leadTime}>{timeAgo(lead.created_at)}</Text>
          {isScoring && (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.aiSpinner} />
          )}
          <View style={[styles.statusPip, { backgroundColor: PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? Colors.textTertiary }]} />
          <Text style={styles.statusLabel}>{lead.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Add Lead Form ─────────────────────────────────────────────────────────────

interface AddLeadForm {
  name: string;
  phone: string;
  email: string;
  service: string;
  source: string;
  notes: string;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LeadsScreen() {
  const { company } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeStage, setActiveStage] = useState<LeadStatus | 'all'>('all');

  // Add lead modal
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AddLeadForm>({
    name: '', phone: '', email: '', service: '', source: 'phone', notes: '',
  });

  // Lead detail modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // AI state
  const [aiResult, setAiResult] = useState<{ leadId: string; score: number; followUpMessage: string } | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [creatingEstimate, setCreatingEstimate] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<{ leadId: string; leadName: string; message: string } | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!company) return;
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to fetch leads:', error.message);
      Alert.alert('Error', 'Failed to load leads. Pull down to retry.');
      return;
    }
    setLeads(data ?? []);
  }, [company]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLeads();
    } catch {}
    finally {
      setRefreshing(false);
    }
  }, [fetchLeads]);

  useEffect(() => {
    fetchLeads().finally(() => setLoading(false));
  }, [fetchLeads]);

  // Realtime subscription for new leads
  useEffect(() => {
    if (!company) return;
    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads', filter: `company_id=eq.${company.id}` },
        (payload) => {
          setLeads(prev => [payload.new as Lead, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company]);

  const generateReviewRequest = async (lead: Lead) => {
    try {
      const msg = await aiChat([
        {
          role: 'system',
          content: `You write short, friendly SMS review request messages for tree service companies. Under 160 characters. Include the Google review link placeholder [LINK].`,
        },
        {
          role: 'user',
          content: `Write a review request SMS for ${lead.name} from ${company!.name} in ${company!.city ?? 'their area'}. They just got ${lead.service ?? 'tree service'} done. Keep it natural, not salesy.`,
        },
      ], { model: 'fast', maxTokens: 80 });
      setReviewRequest({ leadId: lead.id, leadName: lead.name, message: msg });
    } catch {}
  };

  const handleStatusChange = async (id: string, status: LeadStatus) => {
    const prevStatus = leads.find(l => l.id === id)?.status;
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    // Keep selected lead in sync
    setSelectedLead(prev => prev?.id === id ? { ...prev, status } : prev);
    const { error } = await supabase.from('leads').update({ status }).eq('id', id);
    if (error) {
      // Rollback optimistic update on failure
      if (prevStatus) {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: prevStatus } : l));
        setSelectedLead(prev => prev?.id === id ? { ...prev, status: prevStatus } : prev);
      }
      return;
    }

    // When booked, generate review request
    if (status === 'booked' && isAIConfigured()) {
      const lead = leads.find(l => l.id === id);
      if (lead && company) {
        generateReviewRequest(lead);
      }
    }
  };

  const handleScoreLead = async (lead: Lead) => {
    if (!isAIConfigured() || !company) return;
    setScoringId(lead.id);
    try {
      const result = await scoreAndSuggestFollowUp(
        { name: company.name, city: company.city ?? undefined, services: company.services_offered },
        { name: lead.name, service: lead.service, notes: lead.notes ?? undefined, source: lead.source, createdAt: lead.created_at }
      );
      await supabase.from('leads').update({ score: result.score }).eq('id', lead.id);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, score: result.score } : l));
      setSelectedLead(prev => prev?.id === lead.id ? { ...prev, score: result.score } : prev);
      setAiResult({ leadId: lead.id, score: result.score, followUpMessage: result.followUpMessage });
    } catch {
      Alert.alert('Error', 'Failed to score lead. Please try again.');
    }
    setScoringId(null);
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

  const handleCreateEstimate = async (lead: Lead) => {
    if (!company) return;
    setCreatingEstimate(true);
    try {
      // Step 1: Check if a customer already exists (match by email or phone)
      let customerId: string | null = null;
      const orFilters: string[] = [];
      if (lead.email) orFilters.push(`email.eq.${lead.email}`);
      if (lead.phone) orFilters.push(`phone.eq.${lead.phone}`);

      if (orFilters.length > 0) {
        const { data: existingCustomers } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', company.id)
          .or(orFilters.join(','))
          .limit(1);
        if (existingCustomers && existingCustomers.length > 0) {
          customerId = existingCustomers[0].id;
        }
      }

      // If no existing customer, create one
      if (!customerId) {
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            company_id: company.id,
            name: lead.name,
            email: lead.email || null,
            phone: lead.phone || null,
          })
          .select('id')
          .single();
        if (custError) throw custError;
        customerId = newCustomer.id;
      }

      // Step 2: Create the estimate
      const { error: estError } = await supabase
        .from('estimates')
        .insert({
          company_id: company.id,
          customer_id: customerId,
          status: 'draft',
          line_items: [],
          subtotal: 0,
          tax: 0,
          total: 0,
        });
      if (estError) throw estError;

      // Step 3: Update lead status to 'quoted'
      await handleStatusChange(lead.id, 'quoted');

      // Step 4: Alert user
      Alert.alert('Estimate created!', 'Go to Estimates tab to add line items.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create estimate.');
    } finally {
      setCreatingEstimate(false);
    }
  };

  const handleOpenDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDetail(true);
  };

  const filteredLeads = activeStage === 'all' ? leads : leads.filter(l => l.status === activeStage);
  const countFor = (stage: LeadStatus) => leads.filter(l => l.status === stage).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Lead Inbox</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
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
              <LeadCard
                key={lead.id}
                lead={lead}
                onOpen={handleOpenDetail}
                scoringId={scoringId}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        visible={showDetail}
        onClose={() => { setShowDetail(false); setSelectedLead(null); }}
        onStatusChange={handleStatusChange}
        onScore={handleScoreLead}
        scoringId={scoringId}
        onReviewRequest={generateReviewRequest}
        onCreateEstimate={handleCreateEstimate}
        creatingEstimate={creatingEstimate}
      />

      {/* AI Follow-up Message Banner */}
      {aiResult && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setAiResult(null)}>
          <TouchableOpacity style={styles.aiOverlay} onPress={() => setAiResult(null)} activeOpacity={1}>
            <TouchableOpacity style={styles.aiBanner} activeOpacity={1} onPress={() => {}}>
              <View style={styles.aiBannerHeader}>
                <Text style={styles.aiBannerTitle}>💬 Follow-up message</Text>
                <Text style={styles.aiBannerScore}>Score: {aiResult.score}/10</Text>
                <TouchableOpacity onPress={() => setAiResult(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.aiBannerClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.aiBannerMessage} selectable>
                {aiResult.followUpMessage}
              </Text>
              <Text style={styles.aiBannerHint}>Hold to select and copy the message above.</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Review Request Modal */}
      {reviewRequest && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setReviewRequest(null)}>
          <TouchableOpacity style={styles.aiOverlay} onPress={() => setReviewRequest(null)} activeOpacity={1}>
            <TouchableOpacity style={styles.aiBanner} activeOpacity={1} onPress={() => {}}>
              <View style={styles.aiBannerHeader}>
                <Text style={styles.aiBannerTitle}>🌟 Request a review from {reviewRequest.leadName}</Text>
                <TouchableOpacity onPress={() => setReviewRequest(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.aiBannerClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.aiBannerMessage} selectable>
                {reviewRequest.message}
              </Text>
              {(() => {
                const lead = leads.find(l => l.id === reviewRequest.leadId);
                const hasPhone = lead?.phone && lead.phone.length >= 7;
                return hasPhone ? (
                  <TouchableOpacity
                    style={[styles.dismissBtn, { backgroundColor: Colors.primary }]}
                    onPress={async () => {
                      if (!lead?.phone || !lead?.name || !company) return;
                      try {
                        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
                        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
                        const resp = await fetch(`${supabaseUrl}/functions/v1/send-review-request`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`,
                          },
                          body: JSON.stringify({
                            companyId: company.id,
                            customerPhone: lead.phone,
                            customerName: lead.name,
                          }),
                        });
                        const result = await resp.json();
                        if (result.success) {
                          Alert.alert('Sent!', `Review request SMS sent to ${lead.name}`);
                          setReviewRequest(null);
                        } else {
                          Alert.alert('Error', result.error || 'Failed to send SMS');
                        }
                      } catch (err: any) {
                        Alert.alert('Error', err.message || 'Failed to send SMS');
                      }
                    }}
                  >
                    <Text style={[styles.dismissBtnText, { color: '#fff' }]}>📱 Send SMS to {lead!.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.reviewRequestHint}>Add a phone number to send via SMS</Text>
                );
              })()}
              <TouchableOpacity style={styles.dismissBtn} onPress={() => setReviewRequest(null)}>
                <Text style={styles.dismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

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

// ─── Lead Detail Styles ───────────────────────────────────────────────────────

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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.space.md,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    ...Theme.shadow.sm,
  },
  scoreBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoreBubbleText: { fontSize: 20, fontWeight: Theme.font.weight.bold, color: Colors.primary, lineHeight: 24 },
  scoreBubbleLabel: { fontSize: 9, color: Colors.primary, fontWeight: Theme.font.weight.semibold, textTransform: 'uppercase' },
  nameBlock: { flex: 1 },
  leadName: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.bold, color: Colors.text },
  leadService: { fontSize: Theme.font.size.body, color: Colors.textSecondary, marginTop: 2 },
  leadTime: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, marginTop: 4 },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.space.lg,
    gap: Theme.space.sm,
    ...Theme.shadow.sm,
  },
  sectionTitle: { fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.semibold, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.sm, paddingVertical: 6 },
  contactIcon: { fontSize: 18, width: 28 },
  contactValue: { flex: 1, fontSize: Theme.font.size.body, color: Colors.text },
  contactAction: { fontSize: Theme.font.size.small, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  contactNone: { fontSize: Theme.font.size.body, color: Colors.textTertiary, fontStyle: 'italic' },
  notesText: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  statusBtnEmoji: { fontSize: 14 },
  statusBtnText: { fontSize: Theme.font.size.small, color: Colors.textSecondary, fontWeight: Theme.font.weight.medium },
  statusBtnTextActive: { color: Colors.primary, fontWeight: Theme.font.weight.bold },
  aiActions: { gap: Theme.space.sm },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  aiBtnDisabled: { opacity: 0.5 },
  aiBtnText: { fontSize: Theme.font.size.body, color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  estimateBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: '#22c55e',
  },
  estimateBtnDisabled: { opacity: 0.5 },
  estimateBtnText: { fontSize: Theme.font.size.body, color: '#fff', fontWeight: Theme.font.weight.bold },
});

// ─── Main Screen Styles ───────────────────────────────────────────────────────

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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.space.sm },
  headerTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a18',
    borderRadius: Theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  liveText: {
    fontSize: 11,
    fontWeight: Theme.font.weight.semibold,
    color: '#16a34a',
    letterSpacing: 0.3,
  },
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
  leadFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiSpinner: { width: 16, height: 16 },
  statusPip: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textTransform: 'capitalize' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Theme.shadow.lg,
  },
  fabText: { fontSize: 28, color: Colors.textInverse, lineHeight: 32 },
  aiOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  aiBanner: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Theme.radius.xl,
    borderTopRightRadius: Theme.radius.xl,
    padding: Theme.space.xl,
    gap: Theme.space.md,
    paddingBottom: 40,
    ...Theme.shadow.lg,
  },
  aiBannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiBannerTitle: { fontSize: Theme.font.size.subtitle, fontWeight: Theme.font.weight.semibold, color: Colors.text, flex: 1 },
  aiBannerScore: { fontSize: Theme.font.size.small, color: Colors.primary, fontWeight: Theme.font.weight.semibold, marginRight: Theme.space.md },
  aiBannerClose: { fontSize: Theme.font.size.body, color: Colors.textTertiary, fontWeight: Theme.font.weight.medium },
  aiBannerMessage: {
    fontSize: Theme.font.size.body,
    color: Colors.text,
    lineHeight: 22,
    backgroundColor: Colors.background,
    borderRadius: Theme.radius.md,
    padding: Theme.space.md,
  },
  aiBannerHint: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center' },
  reviewRequestHint: {
    fontSize: Theme.font.size.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  dismissBtn: {
    alignSelf: 'center',
    paddingHorizontal: Theme.space.xl,
    paddingVertical: Theme.space.sm,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Theme.space.xs,
  },
  dismissBtnText: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    fontWeight: Theme.font.weight.medium,
  },
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
