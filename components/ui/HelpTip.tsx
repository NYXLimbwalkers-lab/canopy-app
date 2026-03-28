// HelpTip — Inline contextual help for non-technical users
// Tap the (?) icon to expand/collapse a friendly explanation
// Designed for tree service owners who need guidance on tech features

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';

interface HelpTipProps {
  /** Short label shown next to the ? icon */
  label?: string;
  /** The helpful explanation text */
  tip: string;
  /** Optional "pro tip" from the AI — shown in accent color */
  aiTip?: string;
  /** Style variant */
  variant?: 'inline' | 'card';
  /** Custom icon instead of ? */
  icon?: string;
}

export function HelpTip({ label, tip, aiTip, variant = 'inline', icon }: HelpTipProps) {
  const [expanded, setExpanded] = useState(false);

  if (variant === 'card') {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{icon ?? '💡'}</Text>
          {label && <Text style={styles.cardLabel}>{label}</Text>}
        </View>
        <Text style={styles.cardTip}>{tip}</Text>
        {aiTip && (
          <View style={styles.aiTipRow}>
            <Text style={styles.aiIcon}>🤖</Text>
            <Text style={styles.aiTipText}>{aiTip}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.inlineWrap}>
      <TouchableOpacity
        style={styles.helpBtn}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.helpIcon}>{expanded ? '✕' : '?'}</Text>
      </TouchableOpacity>
      {label && !expanded && (
        <Text style={styles.inlineLabel}>{label}</Text>
      )}
      {expanded && (
        <View style={styles.tipBubble}>
          <Text style={styles.tipText}>{tip}</Text>
          {aiTip && (
            <View style={styles.aiTipRow}>
              <Text style={styles.aiIcon}>🤖</Text>
              <Text style={styles.aiTipText}>{aiTip}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Standalone guidance card — use at the top of complex sections */
export function GuidanceCard({ title, steps, icon }: {
  title: string;
  steps: string[];
  icon?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <View style={styles.guideCard}>
      <View style={styles.guideHeader}>
        <Text style={styles.guideIcon}>{icon ?? '📋'}</Text>
        <Text style={styles.guideTitle}>{title}</Text>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.guideDismiss}>Got it</Text>
        </TouchableOpacity>
      </View>
      {steps.map((step, i) => (
        <View key={i} style={styles.guideStep}>
          <View style={styles.guideStepNum}>
            <Text style={styles.guideStepNumText}>{i + 1}</Text>
          </View>
          <Text style={styles.guideStepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline help (? button)
  inlineWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexShrink: 1,
  },
  helpBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.info + '20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.info + '40',
  },
  helpIcon: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.info,
  },
  inlineLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
  },
  tipBubble: {
    flex: 1,
    backgroundColor: Colors.info + '10',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.info + '25',
    gap: 6,
  },
  tipText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
  },

  // AI tip accent
  aiTipRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.ai + '20',
  },
  aiIcon: {
    fontSize: 13,
  },
  aiTipText: {
    flex: 1,
    fontSize: 12,
    color: Colors.ai,
    lineHeight: 17,
    fontStyle: 'italic' as const,
  },

  // Card variant
  card: {
    backgroundColor: '#111B16',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2D3F35',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: {
    fontSize: 18,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#F9FAFB',
  },
  cardTip: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 19,
  },

  // Guidance card
  guideCard: {
    backgroundColor: Colors.info + '08',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.info + '20',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guideIcon: {
    fontSize: 18,
  },
  guideTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  guideDismiss: {
    fontSize: 12,
    color: Colors.info,
    fontWeight: '600' as const,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 2,
  },
  guideStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.info + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideStepNumText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.info,
  },
  guideStepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
});
