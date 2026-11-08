import { Platform, useColorScheme } from 'react-native';

const light = {
  background: '#F7F3EE',
  surface: '#FFFFFF',
  surfaceAlt: '#EFE8DF',
  text: '#1D1A17',
  textMuted: '#6E655C',
  border: '#E4DBD0',
  accent: '#8A4B2F',
  onAccent: '#FFFFFF',
  accentSoft: '#F2E2D7',
  success: '#3D6B4F',
  danger: '#B3261E',
};

const dark: typeof light = {
  background: '#141210',
  surface: '#1E1B18',
  surfaceAlt: '#2A2622',
  text: '#F3EEE8',
  textMuted: '#A89E93',
  border: '#37312B',
  accent: '#D99A72',
  onAccent: '#1D1A17',
  accentSoft: '#3A2A20',
  success: '#7FB58F',
  danger: '#F2B8B5',
};

export type Colors = typeof light;

export const fonts = {
  // Editorial serif for headings, system sans for everything else.
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export function useTheme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? dark : light, scheme };
}
