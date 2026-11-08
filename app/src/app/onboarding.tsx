import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';
import { draftFromProfile, PreferencesForm, type PreferencesSection } from '@/components/PreferencesForm';
import { Body, Button, Card, ErrorText, Muted, Screen, Title, Toggle } from '@/components/ui';
import { useAppData } from '@/lib/data';
import { space, useTheme } from '@/lib/theme';

const STEPS: { title: string; subtitle: string; section?: PreferencesSection }[] = [
  { title: 'Your privacy, first', subtitle: 'How your photos and data are used.' },
  { title: 'Your style', subtitle: 'Everything here is optional and can be changed later.', section: 'style' },
  { title: 'Colours', subtitle: 'What you reach for, and what you skip.', section: 'colors' },
  { title: 'Your week', subtitle: 'So suggestions fit your real life.', section: 'lifestyle' },
  { title: 'Fit & comfort', subtitle: 'Sizes help shopping suggestions. Skip anything you like.', section: 'fit' },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const { profile, updateProfile } = useAppData();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => draftFromProfile(profile));
  const [aiConsent, setAiConsent] = useState(profile?.consent_ai_processing ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

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

      {step === 0 ? (
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
          style={{ flex: 2 }}
        />
      </View>
    </Screen>
  );
}

function PrivacyPoint({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={20} color={colors.accent} style={{ marginTop: 2 }} />
      <Body style={{ flex: 1, fontSize: 15 }}>{text}</Body>
    </View>
  );
}
