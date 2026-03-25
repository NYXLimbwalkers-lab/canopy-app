import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';

interface Props {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
  padding?: boolean;
}

export function Card({ children, title, style, padding = true }: Props) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={padding ? styles.content : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Theme.radius.xl,
    ...Theme.shadow.md,
    overflow: 'hidden',
  },
  title: {
    fontSize: Theme.font.size.subtitle,
    fontWeight: Theme.font.weight.semibold,
    color: Colors.text,
    paddingHorizontal: Theme.space.lg,
    paddingTop: Theme.space.lg,
    paddingBottom: Theme.space.sm,
  },
  content: {
    padding: Theme.space.lg,
  },
});
