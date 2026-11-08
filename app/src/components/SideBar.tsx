import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '@/lib/data';
import { fonts, radius, space, useTheme } from '@/lib/theme';

/** The props expo-router passes to a custom tab bar (the type is not exported from its main entry). */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** The brand mark used in the sidebar (and mirrored on the website): sparkles on a terracotta tile. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="sparkles" size={size * 0.55} color={colors.onAccent} />
    </View>
  );
}

/**
 * Left sidebar for wide screens (tablets, desktop browsers): brand, the main sections with labels, and
 * the profile at the bottom. Phones keep the bottom tab bar.
 */
export function SideBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { profile, demoActive } = useAppData();

  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={[styles.bar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      <View style={styles.brand}>
        <BrandMark />
        <Text style={[styles.brandName, { color: colors.text }]}>Wardrobe AI</Text>
      </View>

      <View role="tablist" style={{ gap: space.xs }}>
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
              style={({ hovered }) => [
                styles.item,
                { backgroundColor: focused ? colors.accentSoft : hovered ? colors.surfaceAlt : 'transparent' },
              ]}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text style={[styles.label, { color: focused ? colors.accent : colors.text }]}>{options.title ?? route.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {demoActive ? null : (
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          style={({ hovered }) => [styles.item, styles.you, { backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>
              {(profile?.display_name?.trim()[0] ?? '').toUpperCase() || <Ionicons name="person" size={16} />}
            </Text>
          </View>
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
            {profile?.display_name || 'You'}
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { width: 240, borderRightWidth: 1, paddingHorizontal: space.md, paddingVertical: space.lg, gap: space.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, paddingBottom: space.sm },
  brandName: { fontFamily: fonts.display, fontSize: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46, paddingHorizontal: space.md, borderRadius: radius.md },
  label: { fontSize: 15, fontWeight: '600' },
  you: { marginTop: 'auto' },
  avatar: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
