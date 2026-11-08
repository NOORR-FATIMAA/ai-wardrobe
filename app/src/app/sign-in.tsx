import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Body, Button, ErrorText, Muted, Screen, TextField, Title } from '@/components/ui';
import { DEMO_MODE_AVAILABLE } from '@/demo/config';
import { useAppData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

export default function SignIn() {
  const { colors } = useTheme();
  const { enterDemo } = useAppData();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ gap: space.sm, marginTop: space.xxl * 2 }}>
          <Muted style={{ color: colors.accent, fontWeight: '700', letterSpacing: 1.2 }}>WARDROBE AI</Muted>
          <Title style={{ fontSize: 38, lineHeight: 44 }}>Your wardrobe,{'\n'}thoughtfully styled.</Title>
          <Body style={{ color: colors.textMuted }}>
            Digitise the clothes you own, get outfits for every occasion, and shop only for what you actually need.
          </Body>
        </View>

        <View style={{ gap: space.md, marginTop: space.xl }}>
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
          />
          <ErrorText message={error} />
          {notice ? <Body style={{ color: colors.success }}>{notice}</Body> : null}
          <Button
            title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email || password.length < 6}
          />
          <Button
            variant="ghost"
            title={mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          />
        </View>

        {/* Demo mode (development only): explore the UI with sample data and no account. */}
        {DEMO_MODE_AVAILABLE ? (
          <View style={{ gap: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Button variant="secondary" icon="eye-outline" title="Explore demo" onPress={enterDemo} />
            <Muted style={{ textAlign: 'center' }}>
              Look around with sample clothes on this device. No account is created, and nothing is saved or sent
              to the server or to AI.
            </Muted>
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
