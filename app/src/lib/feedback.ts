// Thumbs up / down on outfits, stored per item combination in outfit_feedback. The stylist reads
// them to learn the user's taste. All of a user's ratings are loaded once and shared by every outfit
// card through a small store; switching users starts a fresh store, so ratings never mix.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAppData } from './data';
import { supabase } from './supabase';

export type Rating = -1 | 0 | 1;

/** The canonical combination: sorted, distinct ids (the database stores the same form). */
export const comboIds = (ids: string[]) => [...new Set(ids)].sort();
const comboKey = (ids: string[]) => comboIds(ids).join('|');

interface Store {
  userId: string;
  ratings: Map<string, 1 | -1>;
}

let store: Store | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function load(userId: string) {
  if (store?.userId === userId) return;
  const next: Store = { userId, ratings: new Map() };
  store = next;
  supabase
    .from('outfit_feedback')
    .select('item_ids, rating')
    .order('updated_at', { ascending: false })
    .limit(1000)
    .then(({ data }) => {
      if (store !== next) return; // another user signed in meanwhile
      for (const row of (data ?? []) as { item_ids: string[]; rating: 1 | -1 }[]) {
        const key = comboKey(row.item_ids);
        if (!next.ratings.has(key)) next.ratings.set(key, row.rating);
      }
      notify();
    });
}

/** The current rating of an item combination and a function to change it (0 removes the rating). */
export function useOutfitRating(itemIds: string[]) {
  const { session } = useAppData();
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) load(userId);
  }, [userId]);

  const key = comboKey(itemIds);
  const rating = useSyncExternalStore(subscribe, (): Rating =>
    userId && store?.userId === userId ? store.ratings.get(key) ?? 0 : 0,
  );

  const setRating = useCallback(
    async (next: Rating) => {
      if (!userId || store?.userId !== userId) return;
      const current = store;
      const previous = current.ratings.get(key);
      const ids = comboIds(itemIds);
      if (next === 0) current.ratings.delete(key);
      else current.ratings.set(key, next);
      notify();

      const { error } = next === 0
        ? await supabase.from('outfit_feedback').delete().eq('item_ids', `{${ids.join(',')}}`)
        : await supabase.from('outfit_feedback').upsert({ item_ids: ids, rating: next }, { onConflict: 'user_id,item_ids' });
      if (error) {
        // Put the previous rating back so the screen matches what is stored.
        if (previous === undefined) current.ratings.delete(key);
        else current.ratings.set(key, previous);
        notify();
        throw new Error('Could not save your rating. Please try again.');
      }
    },
    [userId, key, itemIds],
  );

  return [rating, setRating] as const;
}
