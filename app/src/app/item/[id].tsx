import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { ItemForm } from '@/components/ItemForm';
import { ItemThumb } from '@/components/ItemThumb';
import { Body, Button, Chip, EmptyState, ErrorText, Heading, Muted, Screen } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { deleteWardrobePhoto } from '@/lib/images';
import { dayLabel } from '@/lib/dates';
import { costPerWear, formatMoney } from '@/lib/insights';
import { logWear } from '@/lib/outfits';
import { supabase } from '@/lib/supabase';
import { space } from '@/lib/theme';
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
  const facts = [
    ['Category', categoryLabel(item.category) + (item.subcategory ? ` · ${item.subcategory}` : '')],
    ['Colours', item.colors.join(', ')],
    ['Pattern', item.pattern],
    ['Material', item.material],
    ['Formality', item.formality ? `${item.formality} / 5` : null],
    ['Seasons', item.seasons.join(', ')],
    ['Worn', item.times_worn ? `${item.times_worn} times${item.last_worn_at ? `, last ${dayLabel(item.last_worn_at).toLowerCase()}` : ''}` : 'Not logged yet'],
    ['Price', item.purchase_price !== null ? formatMoney(item.purchase_price, currency) : null],
    ['Per wear', perWear !== null ? formatMoney(perWear, currency) : null],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <Screen edges={['bottom']}>
      <DemoBanner />
      {/* Capped so a desktop window shows a product-sized photo, not one filling the screen. */}
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
        <ItemThumb item={item} />
      </View>
      <View style={{ gap: space.xs }}>
        <Heading style={{ fontSize: 26, lineHeight: 32 }}>{item.name}</Heading>
        {item.ai_tagged && !item.user_verified ? <Muted>Tagged by AI and not yet reviewed.</Muted> : null}
      </View>
      {item.description ? <Body>{item.description}</Body> : null}

      <View style={{ gap: space.sm }}>
        {facts.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: space.md }}>
            <Muted style={{ width: 90 }}>{label}</Muted>
            <Body style={{ flex: 1, fontSize: 15 }}>{value}</Body>
          </View>
        ))}
      </View>

      {[...item.style_tags, ...item.occasions].length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {[...item.style_tags, ...item.occasions].map((t) => (
            <Chip key={t} label={t} />
          ))}
        </View>
      ) : null}
      {item.notes ? <Muted>Notes: {item.notes}</Muted> : null}

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
