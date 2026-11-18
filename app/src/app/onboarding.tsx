import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DIRECTIONS, draftFromProfile, PreferencesForm, type PreferencesSection } from '@/components/PreferencesForm';
import { IntroScreen } from '@/components/IntroScreen';
import { Text } from '@/components/Text';
import { DEMO_IMAGES } from '@/demo/demoImages';
import { Body, Button, Card, ErrorText, Muted, Screen, Title, Toggle } from '@/components/ui';
import { useAppData } from '@/lib/data';
import { fonts, radius, space, useTheme } from '@/lib/theme';

const STEPS: { title: string; subtitle: string; section?: PreferencesSection; kind?: 'dress' | 'privacy' }[] = [
  { title: 'Who should we dress?', subtitle: 'Your stylist, outfits and model photos follow this. You can change it later.', kind: 'dress' },
  { title: 'Your privacy, first', subtitle: 'How your photos and data are used.', kind: 'privacy' },
  { title: 'Your style', subtitle: 'Everything here is optional and can be changed later.', section: 'style' },
  { title: 'Colours', subtitle: 'What you reach for, and what you skip.', section: 'colors' },
  { title: 'Your week', subtitle: 'So suggestions fit your real life.', section: 'lifestyle' },
  { title: 'Fit & comfort', subtitle: 'Sizes help shopping suggestions. Skip anything you like.', section: 'fit' },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const { profile, updateProfile } = useAppData();
  // New users first see the animated intro; "Get started" opens the questions.
  const [intro, setIntro] = useState(true);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => draftFromProfile(profile));
  const [aiConsent, setAiConsent] = useState(profile?.consent_ai_processing ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  // The style questions after privacy are optional: "Skip for now" saves what is set and starts.
  const optional = !current.kind;
  const canContinue = current.kind !== 'dress' || Boolean(draft.style_direction);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        ...draft,
        consent_ai_processing: aiConsent,
        consent_updated_at: new Date().toISOString(),
        onboarded_at: new Date().toISOString(),
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (intro) return <IntroScreen onStart={() => setIntro(false)} />;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: space.lg }} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.accent : colors.border }} />
        ))}
      </View>

      <View style={{ gap: space.xs }}>
        <Title>{current.title}</Title>
        <Muted>{current.subtitle}</Muted>
      </View>

      {current.kind === 'dress' ? (
        <View style={{ gap: space.md }}>
          {DRESS_OPTIONS.map((o) => {
            const selected = draft.style_direction === DIRECTIONS[o.label];
            return (
              <Pressable
                key={o.label}
                onPress={() => setDraft({ ...draft, style_direction: DIRECTIONS[o.label] })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={o.label}
                style={({ hovered }) => [
                  styles.dressOption,
                  {
                    backgroundColor: selected ? colors.primary : hovered ? colors.surfaceAlt : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                {o.pieces.length ? (
                  // A small collage of matching pieces from the app's illustrations.
                  <View style={[styles.collage, { backgroundColor: colors.photoTile }]}>
                    {o.pieces.map((id, i) => (
                      <Image
                        key={id}
                        source={DEMO_IMAGES[`demo-item-${id}`]}
                        contentFit="contain"
                        style={[styles.collagePiece, { left: 4 + i * 18, top: i % 2 ? 14 : 2, zIndex: 3 - i }]}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.collage, { backgroundColor: selected ? colors.onPrimary : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name={o.icon} size={28} color={selected ? colors.primary : colors.accent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 19, color: selected ? colors.onPrimary : colors.text }}>{o.label}</Text>
                  <Text style={{ color: selected ? colors.onPrimary : colors.textMuted, fontSize: 14 }}>{o.hint}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.onPrimary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : current.kind === 'privacy' ? (
        <View style={{ gap: space.md }}>
          <Card>
            <PrivacyPoint icon="lock-closed-outline" text="Your wardrobe photos are stored in your private account. Other users of the app can't see them." />
            <PrivacyPoint icon="sparkles-outline" text="If you allow AI processing, your clothing photos, wardrobe details and style preferences are sent to Google's Gemini API to recognise clothes and suggest outfits. We use Gemini's free tier, so under Google's terms Google may use this data to improve its products and AI, and human reviewers may read it. Avoid photos that show your face or anything private. We don't use your photos to train AI ourselves." />
            <PrivacyPoint icon="trash-outline" text="You can delete any item, or your whole account and all photos, at any time from your profile." />
            <PrivacyPoint icon="information-circle-outline" text="AI suggestions can be wrong. You can always correct tags and ignore recommendations." />
          </Card>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '600' }}>Allow AI processing</Body>
              <Muted>Required for clothing recognition and the AI stylist. Turning it on sends data to Google Gemini as described above. You can turn it off later.</Muted>
            </View>
            <Toggle value={aiConsent} onValueChange={setAiConsent} label="Allow AI processing" />
          </Card>
        </View>
      ) : (
        <PreferencesForm value={draft} onChange={setDraft} sections={[current.section!]} />
      )}

      <ErrorText message={error} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {step > 0 ? <Button variant="secondary" title="Back" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button
          title={last ? 'Start styling' : 'Continue'}
          onPress={last ? finish : () => setStep(step + 1)}
          loading={busy}
          disabled={!canContinue}
          style={{ flex: 2 }}
        />
      </View>
      {optional && !last ? (
        <Button variant="ghost" title="Skip for now" onPress={finish} disabled={busy} />
      ) : null}
    </Screen>
  );
}

const DRESS_OPTIONS: { label: keyof typeof DIRECTIONS; hint: string; icon: React.ComponentProps<typeof Ionicons>['name']; pieces: string[] }[] = [
  { label: 'Womenswear', hint: 'Dresses, tops, skirts, shalwar kameez, sarees…', icon: 'woman-outline', pieces: ['08', '09', '16'] },
  { label: 'Menswear', hint: 'Shirts, trousers, kurtas, sherwanis, suits…', icon: 'man-outline', pieces: ['01', '05', '12'] },
  { label: 'Both', hint: 'A mix of menswear and womenswear', icon: 'people-outline', pieces: ['04', '06', '11'] },
  { label: 'No preference', hint: "Style me without either; I'll decide", icon: 'sparkles-outline', pieces: [] },
];

const styles = StyleSheet.create({
  dressOption: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5 },
  collage: { width: 84, height: 72, borderRadius: 16, overflow: 'hidden' },
  collagePiece: { position: 'absolute', width: 48, height: 56 },
});

function PrivacyPoint({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={colors.accent} style={{ marginTop: 2 }} />
      <Body style={{ flex: 1, fontSize: 15 }}>{text}</Body>
    </View>
  );
}
