import { useState } from 'react';
import { View } from 'react-native';
import { useAppData } from '@/lib/data';
import { parsePrice } from '@/lib/insights';
import { space } from '@/lib/theme';
import { CATEGORIES, COLORS, OCCASIONS, SEASONS, STYLES, type Category, type ItemDraft } from '@/lib/types';
import { ChipGroup, ErrorText, Field, TextField } from './ui';

const FORMALITY = ['1 · Very casual', '2 · Casual', '3 · Smart casual', '4 · Formal', '5 · Black tie'];

/** Editable attributes of a wardrobe item. AI suggestions arrive pre-filled; the user has the final say. */
export function ItemForm({ value, onChange }: { value: ItemDraft; onChange: (next: ItemDraft) => void }) {
  const set = <K extends keyof ItemDraft>(key: K, v: ItemDraft[K]) => onChange({ ...value, [key]: v });
  const categoryLabel = CATEGORIES.find((c) => c.key === value.category)?.label;
  const { profile } = useAppData();

  // The typed text is kept as is, so partial input such as "12." survives; the draft gets the parsed
  // number. A different price arriving from outside (a new draft) replaces the text.
  const [priceText, setPriceText] = useState(value.purchase_price?.toString() ?? '');
  const parsedPrice = parsePrice(priceText);
  if (parsedPrice !== undefined && parsedPrice !== value.purchase_price) {
    setPriceText(value.purchase_price?.toString() ?? '');
  }

  return (
    <View style={{ gap: space.xl }}>
      <TextField label="Name" value={value.name} onChangeText={(t) => set('name', t)} placeholder="e.g. Navy chinos" />

      <Field label="Category">
        <ChipGroup
          single
          options={CATEGORIES.map((c) => c.label)}
          value={categoryLabel ? [categoryLabel] : []}
          onChange={([label]) => {
            const match = CATEGORIES.find((c) => c.label === label);
            if (match) set('category', match.key as Category);
          }}
        />
      </Field>

      <TextField
        label="Type"
        value={value.subcategory ?? ''}
        onChangeText={(t) => set('subcategory', t || null)}
        placeholder="e.g. chinos, loafers, kurta"
      />

      <Field label="Colours">
        <ChipGroup options={COLORS} value={value.colors} onChange={(v) => set('colors', v)} />
      </Field>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <TextField label="Pattern" value={value.pattern ?? ''} onChangeText={(t) => set('pattern', t || null)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Material" value={value.material ?? ''} onChangeText={(t) => set('material', t || null)} />
        </View>
      </View>

      <Field label="Formality">
        <ChipGroup
          single
          options={FORMALITY}
          value={value.formality ? [FORMALITY[value.formality - 1]] : []}
          onChange={([f]) => set('formality', f ? FORMALITY.indexOf(f) + 1 : null)}
        />
      </Field>

      <Field label="Style">
        <ChipGroup options={STYLES} value={value.style_tags} onChange={(v) => set('style_tags', v)} />
      </Field>

      <Field label="Seasons">
        <ChipGroup options={SEASONS} value={value.seasons} onChange={(v) => set('seasons', v)} />
      </Field>

      <Field label="Occasions">
        <ChipGroup options={OCCASIONS} value={value.occasions} onChange={(v) => set('occasions', v)} />
      </Field>

      <View style={{ gap: space.xs }}>
        <TextField
          label={`Price paid (${profile?.currency ?? 'USD'}, optional)`}
          value={priceText}
          onChangeText={(t) => {
            setPriceText(t);
            const price = parsePrice(t);
            if (price !== undefined) set('purchase_price', price);
          }}
          placeholder="For cost-per-wear insights"
          keyboardType="decimal-pad"
          maxLength={11}
        />
        <ErrorText message={parsedPrice === undefined ? 'Enter an amount like 49.90.' : null} />
      </View>

      <TextField
        label="Description"
        value={value.description ?? ''}
        onChangeText={(t) => set('description', t || null)}
        multiline
        style={{ minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <TextField
        label="Personal notes"
        value={value.notes ?? ''}
        onChangeText={(t) => set('notes', t || null)}
        placeholder="e.g. runs small, only for winter, needs ironing"
        multiline
        style={{ minHeight: 64, paddingTop: 12, textAlignVertical: 'top' }}
      />
    </View>
  );
}
