import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { dayLabel } from '@/lib/dates';
import { useOutfitRating } from '@/lib/feedback';
import { logWear, planOutfit, saveOutfit } from '@/lib/outfits';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import type { StylistOutfit } from '@/lib/types';
import { PlanSheet } from './PlanSheet';
import { Button, ErrorText, Muted } from './ui';

export interface OutfitState {
  savedId: string | null;
  favorite: boolean;
  plannedFor: string | null;
}

type OutfitActionsProps = {
  outfit: StylistOutfit;
  requestText?: string;
  initial?: OutfitState;
  onChange?: (state: OutfitState) => void;
};

/**
 * Save / plan / "wore it today" for an outfit. Works for fresh AI suggestions (saved on first use)
 * and for outfits already in the database (pass `initial.savedId`).
 */
export function OutfitActions(props: OutfitActionsProps) {
  const { demoActive } = useAppData();
  // Demo mode: these actions write to the database, so the real component is not mounted at all.
  if (demoActive) return <DemoOnlyNote what="Saving, planning and logging outfits" />;
  return <AccountOutfitActions {...props} />;
}

function AccountOutfitActions({
  outfit,
  requestText,
  initial = { savedId: null, favorite: false, plannedFor: null },
  onChange,
}: OutfitActionsProps) {
  const { refreshItems, itemById } = useAppData();
  const [state, setState] = useState<OutfitState>(initial);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState<'save' | 'wear' | null>(null);
  const [worn, setWorn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rate only items still in the wardrobe; a saved outfit can reference a deleted one.
  const ratedIds = outfit.item_ids.filter((id) => itemById(id));
  const [rating, setRating] = useOutfitRating(ratedIds);

  async function rate(value: 1 | -1) {
    setError(null);
    try {
      await setRating(rating === value ? 0 : value); // tapping the active thumb clears it
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const update = (next: OutfitState) => {
    setState(next);
    onChange?.(next);
  };

  async function ensureSaved(favorite: boolean, plannedFor: string | null = state.plannedFor) {
    if (state.savedId) return state.savedId;
    return saveOutfit(outfit, { requestText, favorite, plannedFor });
  }

  async function save() {
    setBusy('save');
    setError(null);
    try {
      if (state.savedId) {
        await supabase.from('outfits').update({ is_favorite: true }).eq('id', state.savedId);
        update({ ...state, favorite: true });
      } else {
        update({ ...state, savedId: await ensureSaved(true), favorite: true });
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function plan(date: string | null) {
    setPlanning(false);
    setError(null);
    try {
      const id = state.savedId ?? (await ensureSaved(false, date));
      if (state.savedId) await planOutfit(id, date);
      update({ ...state, savedId: id, plannedFor: date });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function wear() {
    setBusy('wear');
    setError(null);
    try {
      await logWear(outfit.item_ids, state.savedId);
      setWorn(true);
      await refreshItems();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <View style={{ gap: space.sm, width: '100%' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button
          variant={state.favorite ? 'secondary' : 'primary'}
          icon={state.favorite ? 'heart' : 'heart-outline'}
          title={state.favorite ? 'Saved' : 'Save'}
          onPress={save}
          loading={busy === 'save'}
          disabled={state.favorite}
        />
        <Button
          variant="secondary"
          icon="calendar-outline"
          title={state.plannedFor ? dayLabel(state.plannedFor) : 'Plan'}
          onPress={() => setPlanning(true)}
        />
        <Button
          variant="secondary"
          icon={worn ? 'checkmark-done' : 'checkmark-done-outline'}
          title={worn ? 'Logged' : 'Wore it today'}
          onPress={wear}
          loading={busy === 'wear'}
          disabled={worn}
        />
        {ratedIds.length ? (
          <View style={{ flexDirection: 'row', gap: space.xs, marginLeft: 'auto' }}>
            <Thumb up active={rating === 1} onPress={() => rate(1)} />
            <Thumb active={rating === -1} onPress={() => rate(-1)} />
          </View>
        ) : null}
      </View>
      {rating === -1 ? <Muted>Got it: the stylist won&apos;t suggest this combination again.</Muted> : null}
      <ErrorText message={error} />
      <PlanSheet visible={planning} current={state.plannedFor} onPick={plan} onClose={() => setPlanning(false)} />
    </View>
  );
}

/** Thumbs up or down; the stylist learns from these. */
function Thumb({ up, active, onPress }: { up?: boolean; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const name = up ? (active ? 'thumbs-up' : 'thumbs-up-outline') : active ? 'thumbs-down' : 'thumbs-down-outline';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={up ? 'I like this outfit' : "I don't like this outfit"}
      style={[styles.thumb, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surface }]}
    >
      <Ionicons name={name} size={18} color={active ? colors.accent : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
