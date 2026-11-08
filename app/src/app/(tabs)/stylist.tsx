import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Body, Button, Card, Chip, ChipGroup, EmptyState, ErrorText, Field, Muted, Screen, TextField, Title } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { generateDemoOutfits } from '@/demo/demoStylist';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { approximateLocation } from '@/lib/outfits';
import { radius, space, useTheme } from '@/lib/theme';
import { OCCASIONS, type StylistResult } from '@/lib/types';

const EXAMPLES = [
  'Smart but comfortable for a long day at university',
  'Three outfits for a weekend trip without buying anything',
  'Something for a summer wedding as a guest',
];

export default function Stylist() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ occasion?: string; anchor?: string }>();
  const { items, itemById, profile, demoActive } = useAppData();

  const [occasion, setOccasion] = useState<string[]>([]);
  const [request, setRequest] = useState('');
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [useWeather, setUseWeather] = useState(false);
  const [allowPurchases, setAllowPurchases] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StylistResult | null>(null);
  // Bumped per result so each new batch gets fresh save/plan state.
  const [runId, setRunId] = useState(0);

  // Deep links from Home ("Quick picks") and item pages ("Style this item"): apply new params once.
  const paramsKey = `${params.occasion ?? ''}|${params.anchor ?? ''}`;
  const [appliedParams, setAppliedParams] = useState('');
  if (paramsKey !== appliedParams) {
    setAppliedParams(paramsKey);
    if (params.occasion) setOccasion([params.occasion]);
    if (params.anchor) setAnchorId(params.anchor);
  }

  const anchor = anchorId ? itemById(anchorId) : undefined;

  async function run(alternatives = false) {
    setBusy(true);
    setError(null);
    try {
      if (demoActive) {
        // Demo mode: local rules over the sample wardrobe; no location, no server, no AI.
        setResult(generateDemoOutfits(items, {
          occasion: occasion[0],
          request: request.trim() || undefined,
          anchorItemIds: anchor ? [anchor.id] : [],
          avoidOutfits: alternatives && result ? result.outfits.map((o) => o.item_ids) : [],
          allowPurchases,
        }));
        setRunId((n) => n + 1);
        return;
      }
      const location = useWeather ? await approximateLocation() : undefined;
      const next = await api.stylist({
        occasion: occasion[0],
        request: request.trim() || undefined,
        anchor_item_ids: anchor ? [anchor.id] : [],
        avoid_outfits: alternatives && result ? result.outfits.map((o) => o.item_ids) : [],
        allow_purchases: allowPurchases,
        day,
        location,
      });
      setResult(next);
      setRunId((n) => n + 1);
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
      <View style={{ gap: space.xs }}>
        <Title>Stylist</Title>
        <Muted>
          {demoActive
            ? 'Demo: outfits from the sample wardrobe, put together on this device by simple rules (no AI).'
            : 'Outfits built from your own wardrobe.'}
        </Muted>
      </View>

      {demoActive ? null : (
        <Pressable
          onPress={() => router.push('/assistant')}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.accentSoft }}
        >
          <Ionicons name="chatbubbles-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>Chat with your stylist</Body>
            <Muted>Ask anything, refine outfits, plan a trip</Muted>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      <Field label="Occasion">
        <ChipGroup single options={OCCASIONS} value={occasion} onChange={setOccasion} />
      </Field>

      <TextField
        label="Or describe what you need"
        value={request}
        onChangeText={setRequest}
        placeholder={EXAMPLES[0]}
        multiline
        maxLength={600}
        style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }}
      />
      {!request ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {EXAMPLES.slice(1).map((e) => (
            <Chip key={e} label={e} onPress={() => setRequest(e)} />
          ))}
        </View>
      ) : null}

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

      <Card>
        {demoActive ? (
          <DemoOnlyNote what="Weather-aware suggestions and stylist chat" />
        ) : (
          <ToggleRow
            icon="partly-sunny-outline"
            label="Consider the weather"
            hint="Uses your approximate location once; it is not stored."
            value={useWeather}
            onChange={setUseWeather}
          />
        )}
        {useWeather && !demoActive ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
            <Chip label="Tomorrow" selected={day === 'tomorrow'} onPress={() => setDay('tomorrow')} />
          </View>
        ) : null}
        <ToggleRow
          icon="bag-outline"
          label="Suggest items to buy"
          hint="Turn off to style only what you own."
          value={allowPurchases}
          onChange={setAllowPurchases}
        />
      </Card>

      <ErrorText message={error} />
      <Button
        title={busy ? 'Styling…' : 'Style me'}
        icon="sparkles"
        onPress={() => run(false)}
        loading={busy}
        disabled={!occasion.length && !request.trim() && !anchor}
      />

      {result ? (
        <View style={{ gap: space.lg }}>
          <Muted>{result.understood_request}</Muted>
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
            <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
              <Body>{result.wardrobe_note}</Body>
            </Card>
          ) : null}
          <Button variant="secondary" icon="refresh" title="Show different outfits" onPress={() => run(true)} loading={busy} />
          <Muted style={{ textAlign: 'center' }}>AI suggestions can be imperfect. Trust your own judgement.</Muted>
        </View>
      ) : null}
    </Screen>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '600' }}>{label}</Body>
        <Muted>{hint}</Muted>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} accessibilityLabel={label} />
    </View>
  );
}
