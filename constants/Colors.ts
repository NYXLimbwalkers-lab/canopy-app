// Canopy SaaS — Design System Colors
// Primary brand: Forest green + amber gold

export const Colors = {
  // Brand
  primary: '#2D6A4F',
  primaryLight: '#40916C',
  primaryDark: '#1B4332',
  accent: '#F4A261',
  accentDark: '#E76F51',

  // AI accent
  ai: '#7C3AED',
  aiLight: '#A78BFA',

  // Semantic
  success: '#22C55E',
  successBg: '#DCFCE7',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  danger: '#EF4444',
  dangerBg: '#FEE2E2',
  info: '#3B82F6',
  infoBg: '#DBEAFE',

  // Neutrals (dark forest theme)
  background: '#0E1A14',
  surface: '#142B1F',
  surfaceSecondary: '#1A3326',
  border: '#2A4035',
  borderStrong: '#3A5548',
  text: '#F0F9F4',
  textSecondary: '#8BAF9A',
  textTertiary: '#5C7A6B',
  textInverse: '#0E1A14',

  // Dark mode surfaces
  dark: {
    background: '#0A0F0D',
    surface: '#111B16',
    surfaceSecondary: '#1A2820',
    border: '#2D3F35',
    borderStrong: '#3D5247',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
  },

  // Pipeline status colors
  statusNew: '#3B82F6',
  statusActive: '#F59E0B',
  statusBooked: '#8B5CF6',
  statusComplete: '#22C55E',
  statusCanceled: '#EF4444',

  // Overlays
  overlay: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(0,0,0,0.15)',
};

export function getThemeColors(isDark: boolean) {
  return {
    ...Colors,
    background: isDark ? Colors.dark.background : Colors.background,
    surface: isDark ? Colors.dark.surface : Colors.surface,
    surfaceSecondary: isDark ? Colors.dark.surfaceSecondary : Colors.surfaceSecondary,
    border: isDark ? Colors.dark.border : Colors.border,
    borderStrong: isDark ? Colors.dark.borderStrong : Colors.borderStrong,
    text: isDark ? Colors.dark.text : Colors.text,
    textSecondary: isDark ? Colors.dark.textSecondary : Colors.textSecondary,
    textTertiary: isDark ? Colors.dark.textTertiary : Colors.textTertiary,
  };
}

// Legacy default export for compatibility
export default Colors;
