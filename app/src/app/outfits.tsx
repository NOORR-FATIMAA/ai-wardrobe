import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Button, EmptyState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { savedToStylist, type SavedOutfit } from '@/lib/types';

export default function SavedOutfits() {
  const { colors } = useTheme();
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('outfits')
      .select('*, outfit_items(item_id, position)')
      .eq('is_favorite', true)
      .order('created_at', { ascending: false });
    setOutfits((data ?? []) as SavedOutfit[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function remove(o: SavedOutfit) {
    setOutfits((list) => list?.filter((x) => x.id !== o.id) ?? null);
    // Keep outfits that are still on the calendar; just drop them from favourites.
    if (o.planned_for) await supabase.from('outfits').update({ is_favorite: false }).eq('id', o.id);
    else await supabase.from('outfits').delete().eq('id', o.id);
  }

  if (!outfits) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      {outfits.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No saved outfits yet"
          message="Save outfits you like from the stylist and they'll appear here."
          action={<Button title="Open stylist" icon="sparkles" onPress={() => router.push('/stylist')} />}
        />
      ) : (
        outfits.map((o) => (
          <OutfitCard
            key={o.id}
            outfit={savedToStylist(o)}
            actions={
              <>
                <OutfitActions
                  outfit={savedToStylist(o)}
                  initial={{ savedId: o.id, favorite: true, plannedFor: o.planned_for }}
                />
                <Button variant="ghost" icon="trash-outline" title="Remove" onPress={() => remove(o)} />
              </>
            }
          />
        ))
      )}
    </Screen>
  );
}
