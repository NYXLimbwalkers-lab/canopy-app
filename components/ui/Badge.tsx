import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'ai' | 'primary';

interface Props {
  label: string;
  variant?: Variant;
}

export function Badge({ label, variant = 'neutral' }: Props) {
  return (
    <View style={[styles.badge, styles[`bg_${variant}`]]}>
      <Text style={[styles.label, styles[`text_${variant}`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Theme.space.sm,
    paddingVertical: 2,
    borderRadius: Theme.radius.full,
    alignSelf: 'flex-start',
  },
  label: { fontSize: Theme.font.size.caption, fontWeight: Theme.font.weight.semibold },
  bg_success: { backgroundColor: Colors.successBg },
  bg_warning: { backgroundColor: Colors.warningBg },
  bg_danger: { backgroundColor: Colors.dangerBg },
  bg_info: { backgroundColor: Colors.infoBg },
  bg_neutral: { backgroundColor: Colors.surfaceSecondary },
  bg_ai: { backgroundColor: '#EDE9FE' },
  bg_primary: { backgroundColor: '#D1FAE5' },
  text_success: { color: '#15803D' },
  text_warning: { color: '#B45309' },
  text_danger: { color: '#DC2626' },
  text_info: { color: '#1D4ED8' },
  text_neutral: { color: Colors.textSecondary },
  text_ai: { color: Colors.ai },
  text_primary: { color: Colors.primaryDark },
});
