import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { useAppData } from '@/lib/data';
import { fonts, radius, space, useTheme, type ThemePreference } from '@/lib/theme';

/** The props expo-router passes to a custom tab bar (the type is not exported from its main entry). */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconName = ComponentProps<typeof Ionicons>['name'];

/** The brand mark (also on the website): sparkles on a lavender tile with a coral dot. */
export function BrandMark({ size = 36, inverted }: { size?: number; /** Ink tile, for lavender backgrounds. */ inverted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: inverted ? colors.onPrimary : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="sparkles" size={size * 0.55} color={inverted ? colors.primary : colors.onPrimary} />
      <View
        style={{
          position: 'absolute',
          top: -size * 0.08,
          right: -size * 0.08,
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: size,
          backgroundColor: colors.coral,
          borderWidth: 2,
          borderColor: inverted ? colors.primary : colors.surface,
        }}
      />
    </View>
  );
}

const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_ICON: Record<ThemePreference, IconName> = { system: 'contrast-outline', light: 'sunny-outline', dark: 'moon-outline' };
const THEME_LABEL: Record<ThemePreference, string> = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

/** Cycles System → Light → Dark. */
export function ThemeSwitch() {
  const { colors, preference, setPreference } = useTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length];
  return (
    <Pressable
      onPress={() => setPreference(next)}
      accessibilityRole="button"
      accessibilityLabel={`${THEME_LABEL[preference]}. Switch to ${next}.`}
      style={({ hovered }) => [styles.item, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
    >
      <Ionicons name={THEME_ICON[preference]} size={20} color={colors.textMuted} />
      <Text style={[styles.label, { color: colors.text }]}>{THEME_LABEL[preference]}</Text>
    </Pressable>
  );
}

/**
 * Left sidebar for wide screens (tablets, desktop browsers): brand, the main sections, shortcuts to the
 * other existing screens, the theme switch and the profile. Phones keep the bottom tab bar.
 */
export function SideBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { profile, demoActive } = useAppData();

  // Existing stack screens only, shown under the same conditions as their guards in app/_layout.tsx.
  const links: { label: string; icon: IconName; href: Href; show: boolean }[] = [
    { label: 'Saved outfits', icon: 'heart-outline', href: '/outfits', show: !demoActive },
    { label: 'Calendar', icon: 'calendar-outline', href: '/calendar', show: !demoActive },
    { label: 'Insights', icon: 'stats-chart-outline', href: '/insights', show: true },
    { label: 'Stylist chat', icon: 'chatbubbles-outline', href: '/assistant', show: !demoActive },
  ];

  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={[styles.bar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      <View style={styles.brand}>
        <BrandMark />
        <Text style={[styles.brandName, { color: colors.text }]}>Wardrobe AI</Text>
      </View>

      <View role="tablist" style={{ gap: 2 }}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const color = focused ? colors.accent : colors.textMuted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              role="tab"
              accessibilityState={{ selected: focused }}
              style={({ hovered }) => [styles.item, { backgroundColor: focused ? colors.accentSoft : hovered ? colors.surfaceAlt : 'transparent' }]}
            >
              {focused ? <View style={[styles.marker, { backgroundColor: colors.accent }]} /> : null}
              {options.tabBarIcon?.({ focused, color, size: 21 })}
              <Text style={[styles.label, { color: focused ? colors.accent : colors.text }]}>{options.title ?? route.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[styles.group, { color: colors.textMuted }]}>More</Text>
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Pressable
              key={l.label}
              onPress={() => router.push(l.href)}
              accessibilityRole="link"
              style={({ hovered }) => [styles.item, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
            >
              <Ionicons name={l.icon} size={20} color={colors.textMuted} />
              <Text style={[styles.label, { color: colors.text }]}>{l.label}</Text>
            </Pressable>
          ))}
      </View>

      <View style={{ marginTop: 'auto', gap: 2 }}>
        <ThemeSwitch />
        {demoActive ? null : (
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile and settings"
            style={({ hovered }) => [styles.item, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.butter }]}>
              <Text style={{ color: colors.onPastel, fontWeight: '700' }}>
                {(profile?.display_name?.trim()[0] ?? '').toUpperCase() || <Ionicons name="person" size={15} />}
              </Text>
            </View>
            <Text style={[styles.label, { color: colors.text, flex: 1 }]} numberOfLines={1}>
              {profile?.display_name || 'You'}
            </Text>
            <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { width: 248, borderRightWidth: 1, paddingHorizontal: space.md, paddingVertical: space.lg, gap: space.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm },
  brandName: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md },
  marker: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2 },
  label: { fontSize: 15, fontWeight: '600' },
  group: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: space.md, paddingBottom: space.xs },
  avatar: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
