import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { ItemForm } from '@/components/ItemForm';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import { Badge, Body, Button, EmptyState, ErrorText, Eyebrow, FadeIn, Screen, toneColors, type Tone } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { deleteWardrobePhoto } from '@/lib/images';
import { dayLabel } from '@/lib/dates';
import { costPerWear, formatMoney } from '@/lib/insights';
import { logWear } from '@/lib/outfits';
import { supabase } from '@/lib/supabase';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { categoryLabel, type ItemDraft, type WardrobeItem } from '@/lib/types';

const toDraft = (i: WardrobeItem): ItemDraft => ({
  image_path: i.image_path,
  name: i.name,
  category: i.category,
  subcategory: i.subcategory,
  colors: i.colors,
  pattern: i.pattern,
  material: i.material,
  style_tags: i.style_tags,
  formality: i.formality,
  seasons: i.seasons,
  occasions: i.occasions,
  description: i.description,
  notes: i.notes,
  purchase_price: i.purchase_price,
  ai_tagged: i.ai_tagged,
  user_verified: i.user_verified,
});

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { itemById, refreshItems, demoActive, profile } = useAppData();
  const { colors } = useTheme();
  const item = itemById(id);
  // Non-null only while editing; seeded from the item when editing starts.
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="help-circle-outline" title="Item not found" message="It may have been deleted." />
      </Screen>
    );
  }

  async function update(patch: Partial<WardrobeItem>) {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from('wardrobe_items').update(patch).eq('id', item!.id);
    setBusy(false);
    if (updateError) return setError('Could not save changes.');
    await refreshItems();
  }

  async function saveEdits() {
    await update({ ...draft!, user_verified: true });
    setDraft(null);
  }

  async function markWorn() {
    setBusy(true);
    setError(null);
    try {
      await logWear([item!.id]);
      await refreshItems();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove() {
    const run = async () => {
      setBusy(true);
      await supabase.from('wardrobe_items').delete().eq('id', item!.id);
      if (item!.image_path) await deleteWardrobePhoto(item!.image_path);
      await refreshItems();
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${item!.name}?`)) run();
      return;
    }
    Alert.alert(`Delete ${item!.name}?`, 'The item and its photo will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  }

  if (draft) {
    return (
      <Screen edges={['bottom']}>
        <ItemForm value={draft} onChange={setDraft} />
        <ErrorText message={error} />
        <Button title="Save changes" onPress={saveEdits} loading={busy} disabled={!draft.name.trim()} />
        <Button variant="ghost" title="Cancel" onPress={() => setDraft(null)} />
      </Screen>
    );
  }

  const currency = profile?.currency ?? 'USD';
  const perWear = costPerWear(item);
  const details = [
    ['Type', categoryLabel(item.category) + (item.subcategory ? ` · ${item.subcategory}` : '')],
    ['Pattern', item.pattern],
    ['Material', item.material],
    ['Formality', item.formality ? FORMALITY[Math.round(item.formality)] : null],
    ['Seasons', item.seasons.join(', ')],
    ['Price paid', item.purchase_price !== null ? formatMoney(item.purchase_price, currency) : null],
  ].filter(([, v]) => v) as [string, string][];
  const tags = [...new Set([...item.style_tags, ...item.occasions])];

  return (
    <Screen edges={['bottom']}>
      <DemoBanner />
      {/* The piece in a studio frame, capped so a desktop window shows a product-sized photo. */}
      <FadeIn style={[styles.stage, { backgroundColor: colors.photoTile }, shadowFor(colors)]}>
        <ItemThumb item={item} fill fit="contain" bare />
        {item.ai_tagged && !item.user_verified ? (
          <View style={[styles.review, { backgroundColor: colors.text }]}>
            <Ionicons name="sparkles" size={12} color={colors.background} />
            <Text style={{ color: colors.background, fontSize: 12, fontWeight: '700' }}>Tagged by AI · please review</Text>
          </View>
        ) : null}
      </FadeIn>

      <FadeIn delay={80} style={{ gap: space.sm }}>
        <Eyebrow>{categoryLabel(item.category)}</Eyebrow>
        <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
          {item.name}
        </Text>
        {item.colors.length ? (
          <View style={styles.swatches}>
            {item.colors.map((c) => (
              <View key={c} style={[styles.swatch, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={[styles.dot, { backgroundColor: swatchColor(c), borderColor: colors.border }]} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {item.description ? <Body style={{ color: colors.textMuted }}>{item.description}</Body> : null}
      </FadeIn>

      <FadeIn delay={140} style={styles.stats}>
        <Stat tone="lavender" icon="repeat" value={item.times_worn ? `${item.times_worn}×` : '0'} label="Times worn" />
        <Stat tone="mint" icon="cash-outline" value={perWear !== null ? formatMoney(perWear, currency) : '—'} label="Cost per wear" />
        <Stat tone="butter" icon="time-outline" value={item.last_worn_at ? dayLabel(item.last_worn_at) : 'Never'} label="Last worn" />
      </FadeIn>

      {details.length ? (
        <FadeIn delay={200} style={styles.grid}>
          {details.map(([label, value]) => (
            <View key={label} style={[styles.detail, { backgroundColor: colors.surface }, shadowFor(colors)]}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
            </View>
          ))}
        </FadeIn>
      ) : null}

      {tags.length ? (
        <View style={styles.swatches}>
          {tags.map((t) => (
            <Badge key={t} label={t} tone="lavender" />
          ))}
        </View>
      ) : null}
      {item.notes ? (
        <View style={[styles.notes, { backgroundColor: colors.butterSoft }]}>
          <Ionicons name="document-text-outline" size={18} color={colors.text} />
          <Body style={{ flex: 1, fontSize: 15 }}>{item.notes}</Body>
        </View>
      ) : null}

      <ErrorText message={error} />
      <Button
        title="Style this item"
        icon="sparkles"
        onPress={() => router.push({ pathname: '/stylist', params: { anchor: item.id } })}
      />
      {demoActive ? (
        <DemoOnlyNote what="Editing, wear tracking and deleting" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Button variant="secondary" title={item.user_verified ? 'Edit' : 'Review & edit'} icon="create-outline" onPress={() => setDraft(toDraft(item))} style={{ flex: 1 }} />
            <Button variant="secondary" title="Wore it today" icon="checkmark-done-outline" onPress={markWorn} loading={busy} style={{ flex: 1 }} />
          </View>
          {!item.user_verified ? <Button variant="ghost" title="Details look right" onPress={() => update({ user_verified: true })} /> : null}
          <Button variant="danger" title="Delete item" icon="trash-outline" onPress={remove} />
        </>
      )}
    </Screen>
  );
}

const FORMALITY = ['', 'Very casual', 'Casual', 'Smart casual', 'Formal', 'Black tie'];

// Plain colour names to swatch colours; anything unknown shows a neutral swatch.
const SWATCHES: Record<string, string> = {
  black: '#1f1f1f', white: '#ffffff', grey: '#9a9a9a', gray: '#9a9a9a', charcoal: '#3d3f45', navy: '#1f2f57',
  blue: '#3f6fb5', 'light blue': '#a9c8ea', red: '#c0392b', burgundy: '#6d1f2f', maroon: '#6d1f2f', pink: '#f2a7bb',
  green: '#3e8e5a', olive: '#6b6b35', khaki: '#b9a77a', beige: '#e4d5b7', cream: '#f3ead6', camel: '#c19a6b',
  tan: '#c8a27a', brown: '#7a4f2c', yellow: '#f2cf4a', mustard: '#d4a72c', orange: '#e67e22', purple: '#7d4ea8',
  lavender: '#b9a3f0', gold: '#c9a227', silver: '#c0c0c8', teal: '#2a8c8c',
};
const swatchColor = (name: string) => SWATCHES[name.toLowerCase()] ?? '#d8d3e3';

function Stat({ icon, value, label, tone }: { icon: ComponentProps<typeof Ionicons>['name']; value: string; label: string; tone: Tone }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface }, shadowFor(colors)]}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={16} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', maxWidth: 420, aspectRatio: 1, alignSelf: 'center', borderRadius: radius.lg + 4, overflow: 'hidden', padding: space.lg },
  review: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  name: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  detail: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.md, padding: space.md, gap: 2 },
  notes: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
});
