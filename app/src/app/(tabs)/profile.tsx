import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Switch, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Heading, Muted, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { removeUserFolder } from '@/lib/storageCleanup';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function Profile() {
  const { colors } = useTheme();
  const { session, profile, items, updateProfile, refreshItems } = useAppData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleAi(value: boolean) {
    setError(null);
    try {
      await updateProfile({ consent_ai_processing: value, consent_updated_at: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function deleteWardrobe() {
    confirm('Delete all clothes?', 'This removes every item and photo from your wardrobe. This cannot be undone.', async () => {
      setBusy('wardrobe');
      setError(null);
      const userId = session!.user.id;
      try {
        // Photos first (nested folders included). If any are left, keep the items so a retry
        // removes both together.
        const { problems } = await removeUserFolder(supabase.storage.from('wardrobe'), userId);
        if (problems.length) {
          setError('Some photos could not be deleted, so your clothes were kept. Please try again.');
        } else {
          await supabase.from('wardrobe_items').delete().eq('user_id', userId);
        }
      } catch {
        setError('Could not delete your clothes. Please try again.');
      }
      await refreshItems();
      setBusy(null);
    });
  }

  function deleteAccount() {
    confirm(
      'Delete your account?',
      'Your profile, wardrobe, photos, outfits and shopping list will be permanently deleted.',
      async () => {
        setBusy('account');
        try {
          await api.deleteAccount();
          await supabase.auth.signOut();
        } catch (e) {
          setError((e as Error).message);
          setBusy(null);
        }
      },
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <Title>{profile?.display_name || 'Profile'}</Title>
        <Muted>{session?.user.email}</Muted>
      </View>

      <Card>
        <Row icon="color-palette-outline" label="Style profile" hint="Styles, colours, occasions, sizes" onPress={() => router.push('/preferences')} />
        <Row icon="heart-outline" label="Saved outfits" onPress={() => router.push('/outfits')} />
        <Row icon="calendar-outline" label="Outfit calendar" hint="Planned looks and what you wore" onPress={() => router.push('/calendar')} />
        <Row icon="body-outline" label="3D avatar" hint="Coming soon" onPress={() => router.push('/avatar')} />
      </Card>

      <Heading>Privacy & data</Heading>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>AI processing</Body>
            <Muted>
              Sends your clothing photos, wardrobe details and preferences to Google&apos;s Gemini API (free tier) for tagging
              and styling. Under Google&apos;s terms, Google may use this data to improve its products and human reviewers
              may read it.
            </Muted>
          </View>
          <Switch
            value={profile?.consent_ai_processing ?? false}
            onValueChange={toggleAi}
            trackColor={{ true: colors.accent }}
            accessibilityLabel="AI processing"
          />
        </View>
        <Muted>
          Other users can&apos;t see your data. Photos are stored in a private bucket, resized and stripped of location
          metadata before upload. With AI processing on, they are also shared with Google Gemini as described above.
          Weather uses your approximate location only at the moment you ask.
        </Muted>
      </Card>

      <ErrorText message={error} />
      <Button variant="secondary" icon="log-out-outline" title="Sign out" onPress={() => supabase.auth.signOut()} />
      <Button
        variant="danger"
        icon="trash-outline"
        title={`Delete all clothes (${items.length})`}
        onPress={deleteWardrobe}
        loading={busy === 'wardrobe'}
        disabled={items.length === 0}
      />
      <Button variant="danger" icon="warning-outline" title="Delete account and all data" onPress={deleteAccount} loading={busy === 'account'} />
    </Screen>
  );
}

function Row({ icon, label, hint, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; hint?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
        {hint ? <Muted>{hint}</Muted> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
