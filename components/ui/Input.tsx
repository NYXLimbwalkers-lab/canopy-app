import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, hint, containerStyle, ...props }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholderTextColor={Colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Theme.space.xs },
  label: {
    fontSize: Theme.font.size.small,
    fontWeight: Theme.font.weight.medium,
    color: Colors.textSecondary,
  },
  input: {
    height: Theme.tapTarget.comfortable,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Theme.radius.md,
    paddingHorizontal: Theme.space.lg,
    fontSize: Theme.font.size.body,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputFocused: { borderColor: Colors.primary },
  inputError: { borderColor: Colors.danger },
  error: { fontSize: Theme.font.size.small, color: Colors.danger },
  hint: { fontSize: Theme.font.size.small, color: Colors.textTertiary },
});
