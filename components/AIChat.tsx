import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { aiChat, isAIConfigured } from '@/lib/ai';
import { useAuthStore } from '@/lib/stores/authStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  context?: string; // Extra context for the current screen
}

export function AIChat({ context }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { company, profile } = useAuthStore();

  const systemPrompt = `You are Canopy AI, a smart business advisor for ${company?.name ?? 'a tree service company'} in ${company?.city ?? 'their city'}. You have deep expertise in tree service marketing, operations, and growth. Answer concisely and practically. ${context ?? ''}`;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!isAIConfigured()) {
      setMessages(prev => [...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '⚠️ AI not configured yet. Add your OpenRouter key to .env to enable the AI assistant.' },
      ]);
      setInput('');
      return;
    }

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const reply = await aiChat(
        [{ role: 'system', content: systemPrompt }, ...history],
        { model: 'fast', maxTokens: 300 }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const QUICK_QUESTIONS = [
    'Why am I not getting calls?',
    'What should I post today?',
    'How do I get more Google reviews?',
    'What keywords should I target?',
  ];

  return (
    <>
      {/* Floating button */}
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85} accessibilityLabel="Open AI Chat" accessibilityRole="button">
        <Text style={styles.fabEmoji}>🤖</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>🤖 Canopy AI</Text>
              <Text style={styles.headerSub}>Ask anything about your business</Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn} accessibilityLabel="Close AI Chat" accessibilityRole="button">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.length === 0 && (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatTitle}>Hi {profile?.name?.split(' ')[0] ?? 'there'} 👋</Text>
                <Text style={styles.emptyChatSub}>Ask me anything about your marketing, leads, or business strategy.</Text>
                <View style={styles.quickQuestions}>
                  {QUICK_QUESTIONS.map(q => (
                    <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => { setInput(q); }}>
                      <Text style={styles.quickBtnText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {messages.map((msg, i) => (
              <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                {msg.role === 'assistant' && <Text style={styles.aiLabel}>🤖</Text>}
                <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userBubbleText : styles.aiBubbleText]}>
                  {msg.content}
                </Text>
              </View>
            ))}

            {loading && (
              <View style={[styles.bubble, styles.aiBubble]}>
                <ActivityIndicator size="small" color={Colors.ai} />
                <Text style={styles.aiBubbleText}>Thinking...</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              onSubmitEditing={send}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]} onPress={send} disabled={!input.trim() || loading} accessibilityLabel="Send message" accessibilityRole="button">
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.ai,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.ai,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  fabEmoji: { fontSize: 26 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  headerSub: { fontSize: Theme.font.size.small, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: Theme.font.weight.bold },
  messages: { flex: 1, backgroundColor: Colors.background },
  messagesContent: { padding: 16, gap: 12, paddingBottom: 24 },
  emptyChat: { gap: 12, paddingTop: 20 },
  emptyChatTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text },
  emptyChatSub: { fontSize: Theme.font.size.body, color: Colors.textSecondary, lineHeight: 22 },
  quickQuestions: { gap: 8, marginTop: 8 },
  quickBtn: { backgroundColor: Colors.surface, padding: 14, borderRadius: Theme.radius.lg, borderWidth: 1, borderColor: Colors.border },
  quickBtnText: { fontSize: Theme.font.size.body, color: Colors.text },
  bubble: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, padding: 12, borderRadius: Theme.radius.lg, borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: Colors.surface, padding: 12, borderRadius: Theme.radius.lg, borderBottomLeftRadius: 4, ...Theme.shadow.sm },
  aiLabel: { fontSize: 16 },
  bubbleText: { fontSize: Theme.font.size.body, lineHeight: 22, flex: 1 },
  userBubbleText: { color: Colors.textInverse },
  aiBubbleText: { color: Colors.text },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Theme.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.ai, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: Colors.textInverse, fontSize: 20, fontWeight: Theme.font.weight.bold },
});
