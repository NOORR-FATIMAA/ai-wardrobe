import { createContext, forwardRef, useContext, type ComponentRef } from 'react';
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { fonts } from '@/lib/theme';

const INTER: Record<string, string> = {
  '100': fonts.regular, '200': fonts.regular, '300': fonts.regular, '400': fonts.regular, normal: fonts.regular,
  '500': fonts.medium,
  '600': fonts.semibold,
  '700': fonts.bold, '800': fonts.bold, '900': fonts.bold, bold: fonts.bold,
};
const DISPLAY = new Set([fonts.display, fonts.displayMedium, fonts.displaySemibold]);

/** The family of the enclosing Text, so nested text without its own weight inherits it. */
const ParentFamily = createContext<string | null>(null);

/**
 * The app's Text: Inter by default, with `fontWeight` turned into the matching Inter file (each weight
 * is its own font family, which phones need). Text that sets a Space Grotesk family keeps it, and
 * nested text without a weight inherits its parent's. Use this instead of react-native's Text.
 */
export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text({ style, children, ...rest }, ref) {
  const parent = useContext(ParentFamily);
  const flat = StyleSheet.flatten(style) ?? {};
  const family =
    flat.fontFamily && DISPLAY.has(flat.fontFamily)
      ? flat.fontFamily
      : flat.fontWeight !== undefined
        ? (INTER[String(flat.fontWeight)] ?? fonts.regular)
        : (parent ?? fonts.regular);
  return (
    <RNText ref={ref} {...rest} style={[style, { fontFamily: family, fontWeight: undefined }]}>
      <ParentFamily.Provider value={family}>{children}</ParentFamily.Provider>
    </RNText>
  );
});
