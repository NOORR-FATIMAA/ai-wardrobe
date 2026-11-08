import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/SideBar';
import { Text } from '@/components/Text';
import { Body, Button, Card, ErrorText, FadeIn, IconButton, Muted, TextField } from '@/components/ui';
import { DEMO_MODE_AVAILABLE } from '@/demo/config';
import { DEMO_IMAGES } from '@/demo/demoImages';
import { useAppData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { fonts, radius, space, useTheme, type ThemePreference } from '@/lib/theme';

// Pieces from the demo wardrobe illustrations, floating on the brand panel.
const FLOATING = ['demo-item-01', 'demo-item-06', 'demo-item-09', 'demo-item-13'] as const;
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

export default function SignIn() {
  const { colors, preference, setPreference } = useTheme();
  const { enterDemo } = useAppData();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(params.mode === 'sign-up' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const credentials = { email: email.trim(), password };
    const { data, error: authError } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);
    if (authError) return setError(authError.message);
    if (mode === 'sign-up' && !data.session) setNotice('Check your inbox to confirm your email, then sign in.');
  }

  const form = (
    <Card style={styles.formCard}>
      <View style={{ gap: space.xs }}>
        <Text style={[styles.formTitle, { color: colors.text }]}>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</Text>
        <Muted>{mode === 'sign-in' ? 'Sign in to your wardrobe.' : 'Free while in early access.'}</Muted>
      </View>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
        onSubmitEditing={() => email && password.length >= 6 && submit()}
      />
      <ErrorText message={error} />
      {notice ? <Body style={{ color: colors.success }}>{notice}</Body> : null}
      <Button title={mode === 'sign-in' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} disabled={!email || password.length < 6} />
      <Button
        variant="ghost"
        title={mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
      />
      {/* Demo mode: explore the UI with sample data and no account. */}
      {DEMO_MODE_AVAILABLE ? (
        <View style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Button variant="soft" icon="eye-outline" title="Explore demo" onPress={enterDemo} />
          <Muted style={{ textAlign: 'center', fontSize: 13 }}>
            Sample clothes on this device. No account is created, and nothing is saved or sent to the server or to AI.
          </Muted>
        </View>
      ) : null}
    </Card>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.page, wide ? styles.pageWide : null]} keyboardShouldPersistTaps="handled">
          <View style={styles.themeButton}>
            <IconButton
              icon={preference === 'dark' ? 'moon-outline' : preference === 'light' ? 'sunny-outline' : 'contrast-outline'}
              label={`Theme: ${preference}. Switch to ${NEXT_THEME[preference]}.`}
              onPress={() => setPreference(NEXT_THEME[preference])}
              size={40}
            />
          </View>

          <FadeIn style={[styles.brandPanel, { backgroundColor: colors.primary }, wide ? { flex: 1, minHeight: 560 } : null]}>
            <View style={[styles.blob, { backgroundColor: colors.coral, width: 180, height: 180, top: -50, right: -40, opacity: 0.6 }]} />
            <View style={[styles.blob, { backgroundColor: colors.butter, width: 110, height: 110, bottom: -30, left: -20, opacity: 0.7 }]} />
            <View style={[styles.blob, { backgroundColor: colors.mint, width: 70, height: 70, top: '45%', right: '30%', opacity: 0.55 }]} />
            <View style={styles.brandRow}>
              <BrandMark size={34} inverted />
              <Text style={[styles.brandName, { color: colors.onPrimary }]}>Wardrobe AI</Text>
            </View>
            <Text style={[styles.hero, { color: colors.onPrimary }, wide ? { fontSize: 52, lineHeight: 56 } : null]}>
              Your style.{'\n'}Your rules.
            </Text>
            <Text style={{ color: colors.onPrimary, fontSize: 16, lineHeight: 24, maxWidth: 420 }}>
              Your personal AI stylist. Organise your wardrobe, discover new combinations and find the perfect outfit for every occasion.
            </Text>
            <View style={[styles.floating, wide ? { marginTop: 'auto' } : null]}>
              {FLOATING.map((id, i) => (
                <View key={id} style={[styles.tile, { backgroundColor: colors.boardTile, transform: [{ rotate: `${[-6, 4, -3, 7][i]}deg` }, { translateY: i % 2 ? 10 : 0 }] }]}>
                  <Image source={DEMO_IMAGES[id]} style={{ flex: 1, margin: 8 }} contentFit="contain" accessibilityIgnoresInvertColors />
                </View>
              ))}
            </View>
          </FadeIn>

          <FadeIn delay={120} style={wide ? { flex: 1, justifyContent: 'center', alignItems: 'center' } : null}>
            {form}
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl, flexGrow: 1 },
  pageWide: { flexDirection: 'row', alignItems: 'stretch', padding: space.xl, gap: space.xl, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  themeButton: { position: 'absolute', top: space.lg, right: space.lg, zIndex: 2 },
  brandPanel: { borderRadius: radius.lg, padding: space.xl, gap: space.md, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandName: { fontFamily: fonts.display, fontSize: 18 },
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1, marginTop: space.md },
  floating: { flexDirection: 'row', gap: space.sm, marginTop: space.md, paddingBottom: space.sm },
  tile: { flex: 1, maxWidth: 110, aspectRatio: 0.85, borderRadius: radius.md },
  formCard: { gap: space.md, padding: space.xl, width: '100%', maxWidth: 460 },
  formTitle: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.4 },
});
