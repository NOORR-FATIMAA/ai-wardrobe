import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, type ColorValue } from 'react-native';
import { useAppData } from '@/lib/data';
import { useTheme } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { demoActive } = useAppData();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Browsers report no safe-area inset, so give the labels some room above the screen edge.
          ...(Platform.OS === 'web' ? { height: 62, paddingBottom: 8 } : null),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
