import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="wardrobe" options={{ title: 'Wardrobe', tabBarIcon: icon('shirt-outline') }} />
      <Tabs.Screen name="stylist" options={{ title: 'Stylist', tabBarIcon: icon('sparkles-outline') }} />
      {/* Demo mode: these tabs read and write account data, so they are hidden and unreachable. */}
      <Tabs.Protected guard={!demoActive}>
        <Tabs.Screen name="shopping" options={{ title: 'Shopping', tabBarIcon: icon('bag-outline') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline') }} />
      </Tabs.Protected>
    </Tabs>
  );
}
