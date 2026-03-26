import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Theme } from '../../constants/Theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ai';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, style, textStyle, icon }: Props) {
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    isDisabled ? styles.disabled : undefined,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
    textStyle,
  ];

  return (
    <TouchableOpacity style={containerStyle} onPress={onPress} disabled={isDisabled} activeOpacity={0.8}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'ai' ? '#fff' : Colors.primary} size="small" />
      ) : (
        <>
          {icon}
          <Text style={labelStyle}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.space.sm,
    borderRadius: Theme.radius.md,
    minHeight: Theme.tapTarget.min,
  },
  variant_primary: { backgroundColor: Colors.primary },
  variant_secondary: { backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border },
  variant_danger: { backgroundColor: Colors.danger },
  variant_ghost: { backgroundColor: 'transparent' },
  variant_ai: { backgroundColor: Colors.ai },
  size_sm: { paddingHorizontal: Theme.space.md, paddingVertical: Theme.space.sm, minHeight: 36 },
  size_md: { paddingHorizontal: Theme.space.xl, paddingVertical: Theme.space.md },
  size_lg: { paddingHorizontal: Theme.space.xxl, paddingVertical: Theme.space.lg },
  disabled: { opacity: 0.5 },
  label: { fontWeight: Theme.font.weight.semibold },
  label_primary: { color: Colors.textInverse },
  label_secondary: { color: Colors.text },
  label_danger: { color: Colors.textInverse },
  label_ghost: { color: Colors.primary },
  label_ai: { color: Colors.textInverse },
  labelSize_sm: { fontSize: Theme.font.size.small },
  labelSize_md: { fontSize: Theme.font.size.body },
  labelSize_lg: { fontSize: Theme.font.size.bodyLg },
});
