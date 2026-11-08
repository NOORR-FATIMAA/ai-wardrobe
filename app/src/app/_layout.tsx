import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AppDataProvider, useAppData } from '@/lib/data';
import { useTheme } from '@/lib/theme';

function RootNavigator() {
  const { session, profile, loading, demoActive } = useAppData();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = Boolean(session);
  const onboarded = Boolean(profile?.onboarded_at);
  const realApp = signedIn && onboarded;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!signedIn && !demoActive}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Signed-in users, plus demo mode (local sample data only, never a real session). */}
        <Stack.Protected guard={realApp || demoActive}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
          <Stack.Screen name="avatar" options={{ title: 'Your avatar' }} />
          {/* Computed on the device from the visible items, so it works with demo data too. */}
          <Stack.Screen name="insights" options={{ title: 'Wardrobe insights' }} />
        </Stack.Protected>
        {/* Signed-in users only: these screens read or write account data. */}
        <Stack.Protected guard={realApp}>
          <Stack.Screen name="item/add" options={{ title: 'Add to wardrobe', presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ title: 'You' }} />
          <Stack.Screen name="outfits" options={{ title: 'Saved outfits' }} />
          <Stack.Screen name="calendar" options={{ title: 'Outfit calendar' }} />
          <Stack.Screen name="assistant" options={{ title: 'Stylist chat' }} />
          <Stack.Screen name="preferences" options={{ title: 'Style profile' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppDataProvider>
      <RootNavigator />
    </AppDataProvider>
  );
}
