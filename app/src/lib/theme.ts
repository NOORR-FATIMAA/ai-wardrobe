import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from 'react-native';

// Design system: "modern futuristic + playful + fashion". Electric lavender is the brand colour, with
// coral, mint and butter as playful accents, Space Grotesk for headings and Inter for text.
//
// Contrast (WCAG AA): pastel brand colours are used as BACKGROUNDS with dark ink text on them (ink on
// lavender ≈ 5.6:1). Text, links and icons that sit on the page use `accent`, a deeper lavender
// (≈ 5.6:1 on white). `accent` backgrounds take `onAccent` text. The dark theme is its own deep-plum
// palette, not an inversion.
const light = {
  scheme: 'light' as 'light' | 'dark',
  background: '#F8F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1EDFB',
  /** Backdrop for clothing pictures. Light in both themes, so black and navy clothes stay visible. */
  photoTile: '#F1EDFB',
  /** Tiles inside an outfit board (which sits on surfaceAlt). */
  boardTile: '#FFFFFF',
  text: '#252337',
  textMuted: '#615D78',
  border: '#E6E1F3',
  /** Brand lavender, for buttons, selected chips and highlights; always with `onPrimary` text. */
  primary: '#A78BFA',
  onPrimary: '#1D1A2C',
  /** Deeper lavender for text, links, icons and small marks. */
  accent: '#6D4FD8',
  onAccent: '#FFFFFF',
  accentSoft: '#EEE8FE',
  coral: '#FF8FA3',
  coralSoft: '#FFE8EC',
  mint: '#A7DCC8',
  mintSoft: '#E4F5EE',
  butter: '#F5D878',
  butterSoft: '#FCF3D6',
  /** Text on coral, mint and butter. */
  onPastel: '#252337',
  success: '#2F7A5B',
  danger: '#C2334D',
  overlay: 'rgba(29, 26, 44, 0.45)',
  shadow: '0 1px 2px rgba(37, 35, 55, 0.05), 0 8px 24px rgba(109, 79, 216, 0.08)',
  shadowRaised: '0 2px 4px rgba(37, 35, 55, 0.06), 0 16px 36px rgba(109, 79, 216, 0.16)',
  /** Soft lavender glow behind AI results. */
  glow: '0 0 0 1px rgba(167, 139, 250, 0.35), 0 10px 40px rgba(167, 139, 250, 0.30)',
};

export type Colors = typeof light;

const dark: Colors = {
  scheme: 'dark',
  background: '#15111D',
  surface: '#201A2B',
  surfaceAlt: '#2A2238',
  photoTile: '#E4DEEF',
  boardTile: '#EDE8F6',
  text: '#F2EEFA',
  textMuted: '#B2AAC7',
  border: '#382F4B',
  primary: '#B7A0FB',
  onPrimary: '#1B1527',
  accent: '#C4B2FF',
  onAccent: '#1B1527',
  accentSoft: '#2E2547',
  coral: '#F28C9E',
  coralSoft: '#3A2230',
  mint: '#8DC9B4',
  mintSoft: '#1E302B',
  butter: '#E5C866',
  butterSoft: '#352E1C',
  onPastel: '#1B1527',
  success: '#7FD1AE',
  danger: '#FF8A9B',
  overlay: 'rgba(5, 3, 10, 0.6)',
  shadow: '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.30)',
  shadowRaised: '0 2px 4px rgba(0, 0, 0, 0.4), 0 18px 40px rgba(0, 0, 0, 0.45)',
  glow: '0 0 0 1px rgba(183, 160, 251, 0.35), 0 10px 40px rgba(183, 160, 251, 0.18)',
};

/**
 * Font families, one per weight (native platforms need a separate family per weight). Loaded in the
 * root layout from assets/fonts; `Text` in components/Text.tsx maps fontWeight to these.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  displaySemibold: 'SpaceGrotesk_600SemiBold',
};

export const fontFiles = {
  Inter_400Regular: require('../../assets/fonts/Inter_400Regular.ttf'),
  Inter_500Medium: require('../../assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('../../assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('../../assets/fonts/Inter_700Bold.ttf'),
  SpaceGrotesk_500Medium: require('../../assets/fonts/SpaceGrotesk_500Medium.ttf'),
  SpaceGrotesk_600SemiBold: require('../../assets/fonts/SpaceGrotesk_600SemiBold.ttf'),
  SpaceGrotesk_700Bold: require('../../assets/fonts/SpaceGrotesk_700Bold.ttf'),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };
export const motion = { fast: 150, base: 220, slow: 420 };

// ---------------------------------------------------------------------------------------------
// Theme preference: System, Light or Dark, saved on this device only (no account data).
// ---------------------------------------------------------------------------------------------
export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'wardrobe.theme';

/**
 * Synchronous read, so the first frame already has the right theme (no flash). localStorage exists on
 * the web and, on phones, through expo-sqlite/localStorage (installed by lib/supabase.ts).
 */
function readPreference(): ThemePreference {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function writePreference(value: ThemePreference) {
  try {
    if (value === 'system') globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    // Not saved: the choice still applies until the app is closed.
  }
}

interface ThemeValue {
  colors: Colors;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  /** True when the device asks for reduced motion: animations are skipped. */
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    writePreference(value);
    // Native: also switch system UI (keyboard, alerts) to match. Web ignores this.
    if (Platform.OS !== 'web') Appearance.setColorScheme?.(value === 'system' ? 'unspecified' : value);
  }, []);

  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(
    () => ({ colors: scheme === 'dark' ? dark : light, preference, setPreference, reduceMotion }),
    [scheme, preference, setPreference, reduceMotion],
  );

  // Web: let the page background and form controls follow the theme too.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = value.colors.background;
  }, [scheme, value.colors.background]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  // Outside the provider (should not happen): the light theme, so screens still render.
  return value ?? { colors: light, preference: 'system', setPreference: () => undefined, reduceMotion: false };
}

/** Card shadow for the current theme (web and new-architecture native both support boxShadow). */
export const shadowFor = (colors: Colors, raised = false) => ({ boxShadow: raised ? colors.shadowRaised : colors.shadow });
