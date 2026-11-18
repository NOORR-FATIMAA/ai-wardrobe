import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
import { GUEST_MODE } from '@/lib/guest';
import { AppDataProvider, useAppData } from '@/lib/data';
import { fontFiles, ThemeProvider, useTheme } from '@/lib/theme';

function RootNavigator() {
  const { session, profile, loading, demoActive, guestError, retryGuest } = useAppData();
  const { colors } = useTheme();
  // The bundled fonts (Inter, Space Grotesk). A font that fails to load falls back to the system font.
  const [fontsLoaded, fontError] = useFonts(fontFiles);

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Guest mode: the guest account could not be created, so explain instead of showing a sign-in form.
  if (GUEST_MODE && !session && guestError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Couldn&apos;t open Wardrobe AI</Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', maxWidth: 420 }}>{guestError}</Text>
        <Button title="Try again" icon="refresh" onPress={retryGuest} />
      </View>
    );
  }

  const signedIn = Boolean(session);
  const onboarded = Boolean(profile?.onboarded_at);
  const realApp = signedIn && onboarded;

  return (
    <>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'SpaceGrotesk_600SemiBold' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Guest mode opens straight into a guest account, so the sign-in screen (and demo) are not offered. */}
        <Stack.Protected guard={!GUEST_MODE && !signedIn && !demoActive}>
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
    <ThemeProvider>
      <AppDataProvider>
        <RootNavigator />
      </AppDataProvider>
    </ThemeProvider>
  );
}
