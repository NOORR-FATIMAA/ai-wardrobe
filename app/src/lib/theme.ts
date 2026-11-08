import { Platform } from 'react-native';

// "Soft & warm": cream background, white cards with a gentle shadow, warm greys and a muted
// terracotta accent. One light palette on every device. Text colours meet WCAG AA contrast on both the
// background and the cards (accent ≈ 4.7:1 on cream; white on accent ≈ 5:1).
const colors = {
  background: '#FAF6F1',
  surface: '#FFFFFF',
  surfaceAlt: '#F3ECE4',
  text: '#2E2925',
  textMuted: '#7A6F66',
  border: '#ECE3D9',
  accent: '#A65A35',
  onAccent: '#FFFFFF',
  accentSoft: '#F5E6DC',
  success: '#3D6B4F',
  danger: '#B3261E',
};

export type Colors = typeof colors;

export const fonts = {
  // Editorial serif for headings, system sans for everything else.
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

/** A soft, warm-tinted shadow for cards (replaces hard borders). */
export const shadow = { boxShadow: '0 1px 2px rgba(74, 52, 33, 0.05), 0 6px 20px rgba(74, 52, 33, 0.06)' } as const;

export function useTheme() {
  return { colors };
}
