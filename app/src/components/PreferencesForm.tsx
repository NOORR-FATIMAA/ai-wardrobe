import { View } from 'react-native';
import { space } from '@/lib/theme';
import { COLORS, FITS, OCCASIONS, STYLES, type Profile } from '@/lib/types';
import { ChipGroup, Field, TextField } from './ui';

export type PreferencesDraft = Pick<
  Profile,
  | 'display_name'
  | 'style_direction'
  | 'region'
  | 'style_preferences'
  | 'favorite_colors'
  | 'avoid_colors'
  | 'fit_preferences'
  | 'comfort_notes'
  | 'lifestyle_occasions'
  | 'budget_level'
  | 'currency'
  | 'sizes'
>;

export type PreferencesSection = 'style' | 'colors' | 'lifestyle' | 'fit';

export const DIRECTIONS = { Womenswear: 'womenswear', Menswear: 'menswear', Both: 'mixed', 'No preference': 'no_preference' } as const;
const BUDGETS = { 'Budget-friendly': 'low', 'Mid-range': 'medium', Premium: 'high' } as const;
const SIZE_FIELDS = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'shoe', label: 'Shoes' },
];

const labelFor = <T extends Record<string, string>>(map: T, value: string | null) =>
  Object.entries(map).find(([, v]) => v === value)?.[0];

export function PreferencesForm({
  value,
  onChange,
  sections,
}: {
  value: PreferencesDraft;
  onChange: (next: PreferencesDraft) => void;
  sections: PreferencesSection[];
}) {
  const set = <K extends keyof PreferencesDraft>(key: K, v: PreferencesDraft[K]) => onChange({ ...value, [key]: v });
  const direction = labelFor(DIRECTIONS, value.style_direction);
  const budget = labelFor(BUDGETS, value.budget_level);

  return (
    <View style={{ gap: space.xl }}>
      {sections.includes('style') && (
        <>
          <TextField
            label="What should we call you?"
            value={value.display_name ?? ''}
            onChangeText={(t) => set('display_name', t || null)}
            placeholder="Optional"
          />
          <Field label="Dress me in">
            <ChipGroup
              single
              options={Object.keys(DIRECTIONS)}
              value={direction ? [direction] : []}
              onChange={([l]) => set('style_direction', l ? DIRECTIONS[l as keyof typeof DIRECTIONS] : null)}
            />
          </Field>
          <TextField
            label="Where are you based?"
            value={value.region ?? ''}
            onChangeText={(t) => set('region', t.slice(0, 60) || null)}
            placeholder="e.g. Pakistan, UK, Dubai"
            maxLength={60}
          />
          <Field label="Styles you love">
            <ChipGroup options={STYLES} value={value.style_preferences} onChange={(v) => set('style_preferences', v)} />
          </Field>
        </>
      )}

      {sections.includes('colors') && (
        <>
          <Field label="Favourite colours">
            <ChipGroup options={COLORS} value={value.favorite_colors} onChange={(v) => set('favorite_colors', v)} />
          </Field>
          <Field label="Colours to avoid">
            <ChipGroup options={COLORS} value={value.avoid_colors} onChange={(v) => set('avoid_colors', v)} />
          </Field>
        </>
      )}

      {sections.includes('lifestyle') && (
        <>
          <Field label="Occasions you dress for often">
            <ChipGroup
              options={OCCASIONS}
              value={value.lifestyle_occasions}
              onChange={(v) => set('lifestyle_occasions', v)}
            />
          </Field>
          <Field label="Shopping budget">
            <ChipGroup
              single
              options={Object.keys(BUDGETS)}
              value={budget ? [budget] : []}
              onChange={([l]) => set('budget_level', l ? BUDGETS[l as keyof typeof BUDGETS] : null)}
            />
          </Field>
          <TextField
            label="Currency"
            value={value.currency}
            onChangeText={(t) => set('currency', t.toUpperCase().slice(0, 3))}
            autoCapitalize="characters"
            placeholder="USD"
          />
        </>
      )}

      {sections.includes('fit') && (
        <>
          <Field label="Preferred fits">
            <ChipGroup options={FITS} value={value.fit_preferences} onChange={(v) => set('fit_preferences', v)} />
          </Field>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {SIZE_FIELDS.map((f) => (
              <View key={f.key} style={{ flex: 1 }}>
                <TextField
                  label={f.label}
                  value={value.sizes[f.key] ?? ''}
                  onChangeText={(t) => set('sizes', { ...value.sizes, [f.key]: t })}
                  placeholder="Size"
                />
              </View>
            ))}
          </View>
          <TextField
            label="Comfort notes"
            value={value.comfort_notes ?? ''}
            onChangeText={(t) => set('comfort_notes', t || null)}
            placeholder="e.g. no wool, prefer flat shoes, nothing too tight"
            multiline
            style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }}
          />
        </>
      )}
    </View>
  );
}

export function draftFromProfile(p: Profile | null): PreferencesDraft {
  return {
    display_name: p?.display_name ?? null,
    style_direction: p?.style_direction ?? null,
    region: p?.region ?? null,
    style_preferences: p?.style_preferences ?? [],
    favorite_colors: p?.favorite_colors ?? [],
    avoid_colors: p?.avoid_colors ?? [],
    fit_preferences: p?.fit_preferences ?? [],
    comfort_notes: p?.comfort_notes ?? null,
    lifestyle_occasions: p?.lifestyle_occasions ?? [],
    budget_level: p?.budget_level ?? null,
    currency: p?.currency ?? 'USD',
    sizes: p?.sizes ?? {},
  };
}
