// StepProgress — Reusable step-by-step progress indicator
// Shows exactly what's happening at every stage with a progress bar
// Used in video generation, AI operations, exports, etc.

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Theme } from '@/constants/Theme';

interface Step {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

interface StepProgressProps {
  steps: Step[];
  accentColor?: string;
  showPercent?: boolean;
}

export function StepProgress({ steps, accentColor = '#40916C', showPercent = true }: StepProgressProps) {
  const doneCount = steps.filter(s => s.status === 'done').length;
  const activeStep = steps.find(s => s.status === 'active');
  const hasError = steps.some(s => s.status === 'error');
  const percent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Step list */}
      {steps.map((step, i) => (
        <View key={step.key} style={styles.stepRow}>
          <View style={[
            styles.dot,
            step.status === 'done' && [styles.dotDone, { backgroundColor: accentColor }],
            step.status === 'active' && [styles.dotActive, { borderColor: accentColor }],
            step.status === 'error' && styles.dotError,
          ]}>
            {step.status === 'done' && <Text style={styles.dotCheck}>✓</Text>}
            {step.status === 'active' && <ActivityIndicator size="small" color={accentColor} />}
            {step.status === 'error' && <Text style={styles.dotX}>!</Text>}
            {step.status === 'pending' && (
              <Text style={styles.dotNum}>{i + 1}</Text>
            )}
          </View>

          <View style={styles.stepContent}>
            <Text style={[
              styles.stepLabel,
              step.status === 'done' && styles.stepLabelDone,
              step.status === 'active' && [styles.stepLabelActive, { color: accentColor }],
              step.status === 'error' && styles.stepLabelError,
            ]}>
              {step.label}
            </Text>
            {step.detail && step.status === 'active' && (
              <Text style={styles.stepDetail}>{step.detail}</Text>
            )}
          </View>

          {step.status === 'done' && (
            <Text style={[styles.doneLabel, { color: accentColor }]}>done</Text>
          )}
          {step.status === 'error' && (
            <Text style={styles.errorLabel}>failed</Text>
          )}
        </View>
      ))}

      {/* Progress bar */}
      {showPercent && (
        <View style={styles.barContainer}>
          <View style={styles.barTrack}>
            <View style={[
              styles.barFill,
              { width: `${percent}%`, backgroundColor: hasError ? '#F87171' : accentColor },
            ]} />
          </View>
          <Text style={[styles.percentText, { color: hasError ? '#F87171' : accentColor }]}>
            {percent}%
          </Text>
        </View>
      )}

      {/* Status text */}
      {activeStep && (
        <Text style={styles.statusText}>
          {activeStep.detail ?? activeStep.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    width: '100%',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 32,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A2820',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#2D3F35',
  },
  dotDone: {
    borderWidth: 0,
  },
  dotActive: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  dotError: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
  },
  dotCheck: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  dotX: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#F87171',
  },
  dotNum: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  stepLabelDone: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  stepLabelActive: {
    fontWeight: '600' as const,
  },
  stepLabelError: {
    color: '#F87171',
  },
  stepDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  doneLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#F87171',
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A2820',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700' as const,
    minWidth: 36,
    textAlign: 'right' as const,
  },
  statusText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center' as const,
    fontStyle: 'italic' as const,
  },
});
