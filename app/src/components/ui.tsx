import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, space, useTheme } from '@/lib/theme';

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Heading({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Body({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.body, { color: colors.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Muted({ children, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.muted, { color: colors.textMuted }, style]} {...rest}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : 'text'}
      accessibilityState={onPress ? { checked: Boolean(selected) } : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.text, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

/** Multi- or single-select chips. Values are compared case-insensitively. */
export function ChipGroup({
  options,
  value,
  onChange,
  single,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}) {
  const has = (o: string) => value.some((v) => v.toLowerCase() === o.toLowerCase());
  const toggle = (o: string) => {
    if (single) return onChange(has(o) ? [] : [o]);
    onChange(has(o) ? value.filter((v) => v.toLowerCase() !== o.toLowerCase()) : [...value, o]);
  };
  // Keep any custom values (e.g. AI-suggested tags) visible alongside the presets.
  const all = [...options, ...value.filter((v) => !options.some((o) => o.toLowerCase() === v.toLowerCase()))];
  return (
    <View style={styles.chipRow}>
      {all.map((o) => (
        <Chip key={o} label={o} selected={has(o)} onPress={() => toggle(o)} />
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>
  );
}

export function TextField({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={30} color={colors.accent} />
      </View>
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      <Muted style={{ textAlign: 'center' }}>{message}</Muted>
      {action}
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14 }}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36 },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 23 },
  muted: { fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48, fontSize: 16 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
