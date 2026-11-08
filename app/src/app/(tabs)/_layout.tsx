import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, useWindowDimensions, type ColorValue } from 'react-native';
import { SideBar } from '@/components/SideBar';
import { useAppData } from '@/lib/data';
import { fonts, useTheme } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

/** Wide screens (tablets, desktop browsers) get a left sidebar; phones keep the bottom tab bar. */
const SIDEBAR_MIN_WIDTH = 768;

export default function TabLayout() {
  const { colors } = useTheme();
  const { demoActive } = useAppData();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_MIN_WIDTH;
  return (
    <Tabs
      tabBar={sidebar ? (props) => <SideBar {...props} /> : undefined}
      screenOptions={{
        headerShown: false,
        tabBarPosition: sidebar ? 'left' : 'bottom',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Browsers report no safe-area inset, so give the labels some room above the screen edge.
          ...(Platform.OS === 'web' ? { height: 66, paddingBottom: 10, paddingTop: 6 } : null),
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.semibold },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe', tabBarIcon: icon('shirt-outline') }} />
      <Tabs.Screen name="stylist" options={{ title: 'Stylist', tabBarIcon: icon('sparkles-outline') }} />
      {/* Demo mode: the shopping list reads and writes account data, so the tab is hidden and unreachable.
          The profile is a stack screen opened from the Home header (app/profile.tsx). */}
      <Tabs.Protected guard={!demoActive}>
        <Tabs.Screen name="shopping" options={{ title: 'Shopping', tabBarIcon: icon('bag-outline') }} />
      </Tabs.Protected>
    </Tabs>
  );
}
