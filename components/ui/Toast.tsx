// Toast — App-wide notification system for success/error/info feedback
// Shows a brief message at the top of the screen that auto-dismisses
// Usage: Toast.show('Estimate saved!', 'success')

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

// Global toast queue — allows calling Toast.show() from anywhere
let _toastHandler: ((text: string, type: ToastType) => void) | null = null;

export const Toast = {
  show: (text: string, type: ToastType = 'info') => {
    if (_toastHandler) _toastHandler(text, type);
  },
  success: (text: string) => Toast.show(text, 'success'),
  error: (text: string) => Toast.show(text, 'error'),
  info: (text: string) => Toast.show(text, 'info'),
  warning: (text: string) => Toast.show(text, 'warning'),
};

/** Mount this once at the app root (e.g., in _layout.tsx) */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback((text: string, type: ToastType) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev.slice(-2), { id, text, type }]); // Keep max 3
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  useEffect(() => {
    _toastHandler = addToast;
    return () => { _toastHandler = null; };
  }, [addToast]);

  const icons: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };

  const colors: Record<ToastType, { bg: string; border: string; text: string }> = {
    success: { bg: '#052E16', border: '#16A34A', text: '#4ADE80' },
    error:   { bg: '#2D0A0A', border: '#DC2626', text: '#FCA5A5' },
    info:    { bg: '#0A1628', border: '#2563EB', text: '#93C5FD' },
    warning: { bg: '#2D1F04', border: '#EA8C00', text: '#FCD34D' },
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map(toast => {
          const c = colors[toast.type];
          return (
            <TouchableOpacity
              key={toast.id}
              style={[styles.toast, { backgroundColor: c.bg, borderColor: c.border }]}
              onPress={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              activeOpacity={0.9}
            >
              <Text style={styles.icon}>{icons[toast.type]}</Text>
              <Text style={[styles.text, { color: c.text }]} numberOfLines={2}>{toast.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 19,
  },
});
