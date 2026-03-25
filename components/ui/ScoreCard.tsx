import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';

interface Props {
  label: string;
  value: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

export function ScoreCard({ label, value, subtext, trend, color }: Props) {
  const trendColor = trend === 'up' ? Colors.success : trend === 'down' ? Colors.danger : Colors.textTertiary;
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : {}]}>{value}</Text>
      {(subtext || trend) && (
        <Text style={[styles.subtext, { color: trendColor }]}>
          {trendIcon} {subtext}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.space.lg,
    ...Theme.shadow.sm,
  },
  label: {
    fontSize: Theme.font.size.caption,
    fontWeight: Theme.font.weight.medium,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Theme.space.xs,
  },
  value: {
    fontSize: Theme.font.size.display,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
  },
  subtext: {
    fontSize: Theme.font.size.small,
    marginTop: Theme.space.xs,
  },
});
