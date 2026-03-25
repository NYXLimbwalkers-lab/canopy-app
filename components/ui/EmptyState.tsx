import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';
import { Button } from './Button';

interface Props {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: Props) {
  return (
    <View style={styles.container}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.space.xxxl,
    gap: Theme.space.md,
  },
  icon: { fontSize: 48 },
  title: {
    fontSize: Theme.font.size.title,
    fontWeight: Theme.font.weight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: Theme.font.size.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Theme.font.size.body * Theme.font.lineHeight.relaxed,
  },
  button: { marginTop: Theme.space.md, minWidth: 200 },
});
