import * as Location from 'expo-location';
import { localDate } from './dates';
import { supabase } from './supabase';
import type { StylistOutfit } from './types';

export async function saveOutfit(
  outfit: StylistOutfit,
  options: { requestText?: string; plannedFor?: string | null; favorite?: boolean } = {},
): Promise<string> {
  const { data, error } = await supabase
    .from('outfits')
    .insert({
      title: outfit.title,
      occasion: outfit.occasion,
      request_text: options.requestText ?? null,
      explanation: outfit.explanation,
      styling_tips: outfit.styling_tips,
      missing_items: outfit.missing_items,
      weather_note: outfit.weather_note || null,
      planned_for: options.plannedFor ?? null,
      is_favorite: options.favorite ?? true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('Could not save this outfit.');

  const { error: linkError } = await supabase
    .from('outfit_items')
    .insert(outfit.item_ids.map((item_id, position) => ({ outfit_id: data.id, item_id, position })));
  if (linkError) {
    await supabase.from('outfits').delete().eq('id', data.id);
    throw new Error('Could not save this outfit.');
  }
  return data.id;
}

/** Puts a saved outfit on the calendar (or removes it with `null`). */
export async function planOutfit(outfitId: string, date: string | null) {
  const { error } = await supabase.from('outfits').update({ planned_for: date }).eq('id', outfitId);
  if (error) throw new Error('Could not update the plan.');
}

/** Logs that the items were worn (default today) and bumps their wear counters. */
export async function logWear(itemIds: string[], outfitId?: string | null, date = localDate()) {
  const { error } = await supabase.rpc('log_wear', {
    p_item_ids: itemIds,
    p_outfit_id: outfitId ?? null,
    p_worn_on: date,
  });
  if (error) throw new Error('Could not log this wear.');
}

/** Approximate location for the weather forecast, or undefined if the user declines. Never stored. */
export async function approximateLocation() {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) return undefined;
  const last = await Location.getLastKnownPositionAsync();
  const position = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
