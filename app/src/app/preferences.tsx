import { router } from 'expo-router';
import { useState } from 'react';
import { draftFromProfile, PreferencesForm } from '@/components/PreferencesForm';
import { Button, ErrorText, Screen } from '@/components/ui';
import { useAppData } from '@/lib/data';

export default function Preferences() {
  const { profile, updateProfile } = useAppData();
  const [draft, setDraft] = useState(() => draftFromProfile(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile(draft);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      <PreferencesForm value={draft} onChange={setDraft} sections={['style', 'colors', 'lifestyle', 'fit']} />
      <ErrorText message={error} />
      <Button title="Save" onPress={save} loading={busy} />
    </Screen>
  );
}
