// Canopy SaaS — Design System Colors
// High-contrast, sunlight-readable theme
// Primary brand: Bold green + bright orange

export const Colors = {
  // Brand
  primary: '#1A7742',
  primaryLight: '#22A05A',
  primaryDark: '#0F5C30',
  accent: '#FF8C00',
  accentDark: '#E6700A',

  // AI accent
  ai: '#8B5CF6',
  aiLight: '#A78BFA',

  // Semantic
  success: '#16A34A',
  successBg: '#D1FAE5',
  successDark: '#15803D',
  warning: '#EA8C00',
  warningBg: '#FFF3CD',
  warningDark: '#B45309',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  dangerDark: '#B91C1C',
  info: '#2563EB',
  infoBg: '#DBEAFE',
  infoDark: '#1D4ED8',

  // AI
  aiBg: '#EDE9FE',

  // Neutrals — HIGH CONTRAST, sunlight-readable
  background: '#FFFFFF',
  surface: '#F8FAFB',
  surfaceSecondary: '#EFF3F5',
  border: '#D1D9E0',
  borderStrong: '#B0BEC5',
  text: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',
  textInverse: '#FFFFFF',

  // Dark mode surfaces (kept for optional dark mode toggle later)
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
  statusNew: '#2563EB',
  statusActive: '#EA8C00',
  statusBooked: '#7C3AED',
  statusComplete: '#16A34A',
  statusCanceled: '#DC2626',

  // Overlays
  overlay: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(0,0,0,0.08)',
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
