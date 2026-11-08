import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, motion, radius, shadowFor, space, useTheme, type Colors } from '@/lib/theme';
import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Pastel tones for badges, stat tiles and icon circles; text on them is always ink. */
export type Tone = 'lavender' | 'coral' | 'mint' | 'butter';
export const toneColors = (colors: Colors, tone: Tone) =>
  ({
    lavender: { bg: colors.accentSoft, strong: colors.primary, fg: colors.accent },
    coral: { bg: colors.coralSoft, strong: colors.coral, fg: colors.text },
    mint: { bg: colors.mintSoft, strong: colors.mint, fg: colors.text },
    butter: { bg: colors.butterSoft, strong: colors.butter, fg: colors.text },
  })[tone];

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  wide,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  /** Grids and dashboards: a wider column on desktop (1100 px instead of 760). */
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const content = [styles.screenContent, Platform.OS === 'web' ? { maxWidth: wide ? 1100 : 760 } : null];
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
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

/** Small label above a heading, in the accent colour (e.g. the occasion over an outfit title). */
export function Eyebrow({ children, style }: { children: ReactNode; style?: TextProps['style'] }) {
  const { colors } = useTheme();
  return <Text style={[styles.eyebrow, { color: colors.accent }, style]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
    soft: { bg: colors.accentSoft, fg: colors.accent, border: colors.accentSoft },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed, hovered }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : 1 },
        variant === 'primary' && !inactive ? shadowFor(colors, Boolean(hovered)) : null,
        hovered && !inactive && variant !== 'primary'
          ? { backgroundColor: variant === 'secondary' ? colors.surfaceAlt : colors.accentSoft }
          : null,
        { transform: [{ scale: pressed && !inactive ? 0.97 : 1 }] },
        styles.transition,
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

/** Round icon-only button (header actions such as chat or profile). */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'lavender',
  size = 44,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
}) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed, hovered }) => [
        styles.iconButton,
        { width: size, height: size, backgroundColor: hovered ? t.strong : t.bg, transform: [{ scale: pressed ? 0.94 : 1 }] },
        styles.transition,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={tone === 'lavender' ? colors.accent : colors.onPastel} />
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
      style={({ hovered, pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : hovered ? colors.surfaceAlt : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        styles.transition,
      ]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: selected ? '600' : '500', flexShrink: 1 }}>
        {label}
      </Text>
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

/** Segmented control: one choice from a few options (e.g. System / Light / Dark). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active ? [{ backgroundColor: colors.surface }, shadowFor(colors)] : null, styles.transition]}
          >
            {o.icon ? <Ionicons name={o.icon} size={16} color={active ? colors.accent : colors.textMuted} /> : null}
            <Text style={{ color: active ? colors.text : colors.textMuted, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** An on/off switch in the app's colours (lavender track when on). */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.accent, false: colors.border }}
      thumbColor="#FFFFFF"
      // react-native-web colours the knob teal when on unless told otherwise (prop not in RN's types).
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : null)}
    />
  );
}

/**
 * A rounded surface with a soft shadow. `glow` adds the lavender AI glow (outfit suggestions);
 * `onPress` makes it a pressable card that lifts on hover.
 */
export function Card({
  children,
  style,
  glow,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const base = [styles.card, { backgroundColor: colors.surface }, glow ? { boxShadow: colors.glow } : shadowFor(colors)];
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ hovered, pressed }) => [
        base,
        hovered ? [shadowFor(colors, true), { transform: [{ translateY: -3 }] }] : null,
        pressed ? { transform: [{ scale: 0.98 }] } : null,
        styles.transition,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function TextField({ label, style, onFocus, onBlur, ...rest }: TextInputProps & { label?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: focused ? colors.accent : colors.border, fontFamily: fonts.regular },
          focused ? { boxShadow: `0 0 0 3px ${colors.accentSoft}` } : null,
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
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
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

/** Section title with an optional action link on the right ("See all"). */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Heading style={{ flex: 1 }}>{title}</Heading>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small rounded label in a pastel tone. */
export function Badge({ label, tone = 'lavender', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  tone = 'lavender',
}: {
  icon: IconName;
  title: string;
  message: string;
  action?: ReactNode;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <FadeIn style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.bg }]}>
        <View style={[styles.emptyDot, { backgroundColor: t.strong }]} />
        <Ionicons name={icon} size={32} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      <Muted style={{ textAlign: 'center', maxWidth: 360 }}>{message}</Muted>
      {action}
    </FadeIn>
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

// ---------------------------------------------------------------------------------------------
// Motion (skipped when the device asks for reduced motion)
// ---------------------------------------------------------------------------------------------

/** Fades and slides its children in once, after `delay` ms (staggered entrances). */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useTheme();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, progress, reduceMotion]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Placeholder that gently pulses while content loads. */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: ViewStyle['width'];
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, reduceMotion } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: rounded, backgroundColor: colors.surfaceAlt, opacity: pulse }, style]}
    />
  );
}

/** A number that counts up from 0 when it first appears. */
export function CountUp({
  value,
  style,
  format = (n: number) => String(Math.round(n)),
}: {
  value: number;
  style?: TextProps['style'];
  format?: (n: number) => string;
}) {
  const { reduceMotion } = useTheme();
  const [shown, setShown] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 700);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);
  return <Text style={style}>{format(reduceMotion ? value : shown)}</Text>;
}

/** Dashboard tile: a pastel icon, an animated number and a label. */
export function StatCard({
  icon,
  value,
  label,
  tone,
  onPress,
  format,
}: {
  icon: IconName;
  value: number;
  label: string;
  tone: Tone;
  onPress?: () => void;
  format?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${format ? format(value) : value}`} style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <CountUp value={value} format={format} style={[styles.statValue, { color: colors.text }]} />
      <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 13 }}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: space.lg,
    gap: space.lg,
    paddingBottom: space.xxl * 2,
    // In a desktop browser, keep screens in a readable column instead of full width.
    ...(Platform.OS === 'web' ? { width: '100%', alignSelf: 'center' as const } : null),
  },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.displaySemibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  muted: { fontSize: 14, lineHeight: 20 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  iconButton: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  transition: (Platform.OS === 'web'
    ? { transitionDuration: `${motion.fast}ms`, transitionProperty: 'transform, box-shadow, background-color' }
    : {}) as ViewStyle,
  // maxWidth lets a long label wrap inside the chip instead of running off a narrow screen.
  chip: { paddingHorizontal: 16, paddingVertical: 7, minHeight: 38, maxWidth: '100%', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, gap: 4 },
  segment: { flex: 1, minHeight: 40, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 50, fontSize: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyDot: { position: 'absolute', top: 6, right: 4, width: 16, height: 16, borderRadius: 8 },
  stat: { flex: 1, minWidth: 140, gap: space.sm, padding: space.lg },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
});
