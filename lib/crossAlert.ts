import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert helper.
 * Alert.alert() silently does nothing on web browsers.
 * This uses window.confirm/alert as a fallback on web.
 */
export function crossAlert(
  title: string,
  message: string,
  buttons?: Array<{ text: string; style?: string; onPress?: () => void }>
) {
  if (Platform.OS === 'web') {
    const destructiveBtn = buttons?.find((b) => b.style === 'destructive');
    const cancelBtn = buttons?.find((b) => b.style === 'cancel');
    const actionBtn =
      destructiveBtn || buttons?.find((b) => b.style !== 'cancel');

    if (actionBtn && cancelBtn) {
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) actionBtn.onPress?.();
    } else if (actionBtn) {
      window.alert(`${title}\n\n${message}`);
      actionBtn.onPress?.();
    } else {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
}
