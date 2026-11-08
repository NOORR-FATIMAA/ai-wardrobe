import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { DIRECTIONS } from '@/components/PreferencesForm';
import { Body, Button, Card, Chip, ChipGroup, EmptyState, ErrorText, Muted, Screen, TextField, Title } from '@/components/ui';
import { DemoBanner } from '@/demo/DemoBanner';
import { generateDemoOutfits } from '@/demo/demoStylist';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { approximateLocation } from '@/lib/outfits';
import { radius, space, useTheme } from '@/lib/theme';
import { EVENT_STYLES, type EventStyle, OCCASIONS, type StylistResult } from '@/lib/types';

/** "Any" plus the event styles, as chip labels. */
const STYLE_LABELS = ['Any', ...Object.values(EVENT_STYLES)];
const styleFromLabel = (label: string | undefined) =>
  (Object.keys(EVENT_STYLES) as EventStyle[]).find((k) => EVENT_STYLES[k] === label);

export default function Stylist() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ occasion?: string; anchor?: string }>();
  const { items, itemById, profile, updateProfile, demoActive } = useAppData();

  const [occasion, setOccasion] = useState<string[]>([]);
  // A short list first (the chosen occasion, then the user's own, then the defaults); "More" shows all.
  const [allOccasions, setAllOccasions] = useState(false);
  const occasionOptions = allOccasions
    ? OCCASIONS
    : [...new Set([...occasion, ...(profile?.lifestyle_occasions ?? []), ...OCCASIONS])].slice(0, 6);
  const [styleLabel, setStyleLabel] = useState('Any');
  const [request, setRequest] = useState('');
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [useWeather, setUseWeather] = useState(false);
  const [allowPurchases, setAllowPurchases] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StylistResult | null>(null);
  // After a result the form folds into a one-line summary, so the outfits get the screen.
  const [editing, setEditing] = useState(true);
  // Bumped per result so each new batch gets fresh save/plan state.
  const [runId, setRunId] = useState(0);

  // Deep links from Home and item pages ("Style this item"): apply new params once.
  const paramsKey = `${params.occasion ?? ''}|${params.anchor ?? ''}`;
  const [appliedParams, setAppliedParams] = useState('');
  if (paramsKey !== appliedParams) {
    setAppliedParams(paramsKey);
    if (params.occasion) setOccasion([params.occasion]);
    if (params.anchor) setAnchorId(params.anchor);
    setEditing(true);
  }

  const anchor = anchorId ? itemById(anchorId) : undefined;
  const eventStyle = styleFromLabel(styleLabel);
  const ready = Boolean(occasion.length || request.trim() || anchor || eventStyle);
  const summary = [occasion[0], eventStyle ? styleLabel : null, request.trim() ? `“${request.trim()}”` : null, anchor?.name]
    .filter(Boolean)
    .join(' · ');

  async function run(alternatives = false) {
    setBusy(true);
    setError(null);
    try {
      const avoid = alternatives && result ? result.outfits.map((o) => o.item_ids) : [];
      let next: StylistResult;
      if (demoActive) {
        // Demo mode: local rules over the sample wardrobe; no location, no server, no AI.
        next = generateDemoOutfits(items, {
          occasion: occasion[0],
          eventStyle,
          request: request.trim() || undefined,
          anchorItemIds: anchor ? [anchor.id] : [],
          avoidOutfits: avoid,
          allowPurchases,
        });
      } else {
        const location = useWeather ? await approximateLocation() : undefined;
        next = await api.stylist({
          occasion: occasion[0],
          event_style: eventStyle,
          request: request.trim() || undefined,
          anchor_item_ids: anchor ? [anchor.id] : [],
          avoid_outfits: avoid,
          allow_purchases: allowPurchases,
          day,
          location,
        });
      }
      setResult(next);
      setRunId((n) => n + 1);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (items.length < 2) {
    return (
      <Screen>
        <Title>Stylist</Title>
        <EmptyState
          icon="sparkles-outline"
          title="Add a few clothes first"
          message="The stylist builds outfits only from clothes you own. Add at least a top, a bottom and shoes."
          action={<Button title="Add clothes" icon="camera-outline" onPress={() => router.push('/item/add')} />}
        />
      </Screen>
    );
  }

  // Demo mode never uses AI, so the AI-consent requirement does not apply to it.
  if (!demoActive && !profile?.consent_ai_processing) {
    return (
      <Screen>
        <Title>Stylist</Title>
        <EmptyState
          icon="lock-closed-outline"
          title="AI processing is off"
          message="Turn on AI processing in your profile's privacy settings to get outfit suggestions."
          action={<Button title="Open privacy settings" onPress={() => router.push('/profile')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <DemoBanner />
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Title>Stylist</Title>
          <Muted>Where are you going? I’ll dress you from your own clothes.</Muted>
        </View>
        {demoActive ? null : (
          <Pressable
            onPress={() => router.push('/assistant')}
            accessibilityRole="button"
            accessibilityLabel="Chat with your stylist"
            style={[styles.chat, { backgroundColor: colors.accentSoft }]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {!demoActive && profile && !profile.style_direction ? (
        <DressMeIn onPick={(value) => void updateProfile({ style_direction: value }).catch(() => undefined)} />
      ) : null}

      {editing ? (
        <View style={{ gap: space.xl }}>
          <Section title="Occasion">
            <ChipGroup single options={occasionOptions} value={occasion} onChange={setOccasion} />
            {occasionOptions.length < OCCASIONS.length ? (
              <Pressable onPress={() => setAllOccasions(true)} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>More occasions</Text>
              </Pressable>
            ) : null}
          </Section>

          <Section title="Style of the event">
            <ChipGroup single options={STYLE_LABELS} value={[styleLabel]} onChange={([l]) => setStyleLabel(l ?? 'Any')} />
          </Section>

          {anchor ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ItemThumb item={anchor} size={48} />
              <View style={{ flex: 1 }}>
                <Muted>Build around</Muted>
                <Body style={{ fontWeight: '600' }}>{anchor.name}</Body>
              </View>
              <Button variant="ghost" title="Remove" onPress={() => setAnchorId(null)} />
            </Card>
          ) : null}

          <TextField
            value={request}
            onChangeText={setRequest}
            placeholder="Anything else? e.g. outdoors in the evening, want to wear my red kurta"
            accessibilityLabel="Anything else"
            multiline
            maxLength={600}
            style={{ minHeight: 52, paddingTop: 14, textAlignVertical: 'top' }}
          />

          <View style={styles.options}>
            {demoActive ? null : <Chip label="☀ Weather" selected={useWeather} onPress={() => setUseWeather(!useWeather)} />}
            {useWeather && !demoActive ? (
              <Chip label={day === 'today' ? 'Today' : 'Tomorrow'} onPress={() => setDay(day === 'today' ? 'tomorrow' : 'today')} />
            ) : null}
            <Chip label="Shopping ideas" selected={allowPurchases} onPress={() => setAllowPurchases(!allowPurchases)} />
          </View>

          <ErrorText message={error} />
          <Button
            title={busy ? 'Styling…' : 'Style me'}
            icon="sparkles"
            onPress={() => run(false)}
            loading={busy}
            disabled={!ready}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel="Change the request"
          style={[styles.summary, { backgroundColor: colors.surfaceAlt }]}
        >
          <Ionicons name="options-outline" size={18} color={colors.textMuted} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: '500' }}>{summary || 'Your request'}</Text>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Change</Text>
        </Pressable>
      )}

      {result && !editing ? (
        <View style={{ gap: space.lg }}>
          {result.weather ? (
            <Muted>
              <Ionicons name="partly-sunny-outline" size={14} /> {result.weather}
            </Muted>
          ) : null}
          {result.outfits.map((outfit, index) => (
            <OutfitCard
              key={`${runId}-${index}`}
              outfit={outfit}
              actions={<OutfitActions outfit={outfit} requestText={request.trim() || occasion[0]} />}
            />
          ))}
          {result.wardrobe_note ? (
            <Card style={{ backgroundColor: colors.accentSoft }}>
              <Body>{result.wardrobe_note}</Body>
            </Card>
          ) : null}
          <ErrorText message={error} />
          <Button variant="secondary" icon="refresh" title="Show different outfits" onPress={() => run(true)} loading={busy} />
          <Muted style={{ textAlign: 'center' }}>AI suggestions can be imperfect. Trust your own judgement.</Muted>
        </View>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {children}
    </View>
  );
}

/** Asked once, until answered: who the stylist dresses. Saved to the profile (editable in Style profile). */
function DressMeIn({ onPick }: { onPick: (value: (typeof DIRECTIONS)[keyof typeof DIRECTIONS]) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.ask, { backgroundColor: colors.accentSoft }]}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>First, what should I dress you in?</Text>
      <View style={styles.options}>
        {(Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]).map((label) => (
          <Chip key={label} label={label} onPress={() => onPick(DIRECTIONS[label])} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  chat: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, paddingHorizontal: space.lg, borderRadius: radius.pill },
  ask: { gap: space.sm, padding: space.lg, borderRadius: radius.lg },
});
