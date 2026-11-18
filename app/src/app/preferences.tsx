import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { draftFromProfile, PreferencesForm, type PreferencesSection } from '@/components/PreferencesForm';
import { Text } from '@/components/Text';
import { Button, ErrorText, FadeIn, Muted, Screen, Title, toneColors, type Tone } from '@/components/ui';
import { useAppData } from '@/lib/data';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';

const SECTIONS: { section: PreferencesSection; title: string; hint: string; icon: ComponentProps<typeof Ionicons>['name']; tone: Tone }[] = [
  { section: 'style', title: 'You & your style', hint: 'Who to dress, where you are, styles you love', icon: 'sparkles-outline', tone: 'lavender' },
  { section: 'colors', title: 'Colours', hint: 'What you reach for, and what you skip', icon: 'color-palette-outline', tone: 'coral' },
  { section: 'lifestyle', title: 'Your week', hint: 'Occasions and budget, so suggestions fit real life', icon: 'calendar-outline', tone: 'mint' },
  { section: 'fit', title: 'Fit & sizes', hint: 'Sizes help shopping suggestions', icon: 'resize-outline', tone: 'butter' },
];

/** Style profile: the preferences the stylist uses, in four cards. */
export default function Preferences() {
  const { colors } = useTheme();
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
      <FadeIn style={{ gap: space.xs }}>
        <Title>Your style profile</Title>
        <Muted>The stylist uses all of this. Everything is optional and you can change it any time.</Muted>
      </FadeIn>
      {SECTIONS.map((s, i) => {
        const t = toneColors(colors, s.tone);
        return (
          <FadeIn key={s.section} delay={i * 70} style={[styles.card, { backgroundColor: colors.surface }, shadowFor(colors)]}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: t.bg }]}>
                <Ionicons name={s.icon} size={20} color={s.tone === 'lavender' ? colors.accent : colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.displaySemibold, fontSize: 19 }}>{s.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{s.hint}</Text>
              </View>
            </View>
            <PreferencesForm value={draft} onChange={setDraft} sections={[s.section]} />
          </FadeIn>
        );
      })}
      <ErrorText message={error} />
      <Button title="Save my style" icon="checkmark" onPress={save} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
