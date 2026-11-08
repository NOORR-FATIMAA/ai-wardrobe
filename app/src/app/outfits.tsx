import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Button, EmptyState, FadeIn, Muted, Screen, Skeleton, Title } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { radius, space } from '@/lib/theme';
import { savedToStylist, type SavedOutfit } from '@/lib/types';

/** Lookbook of favourite outfits: one column on phones, two on wide screens. */
export default function SavedOutfits() {
  const { width } = useWindowDimensions();
  const [outfits, setOutfits] = useState<SavedOutfit[] | null>(null);
  // The stack screen has no sidebar, so the full window width is available.
  const columns = width >= 1000 ? 2 : 1;

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

  return (
    <Screen edges={['bottom']} wide={columns > 1}>
      <View style={{ gap: space.xs }}>
        <Title>Your lookbook</Title>
        <Muted>{outfits ? `${outfits.length} saved outfit${outfits.length === 1 ? '' : 's'}` : 'Loading your saved outfits…'}</Muted>
      </View>

      {!outfits ? (
        <View style={[styles.grid, columns > 1 ? styles.row : null]}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.cell, { gap: space.md }]}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={260} rounded={radius.lg} />
            </View>
          ))}
        </View>
      ) : outfits.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          tone="coral"
          title="No saved outfits yet"
          message="Tap the heart on outfits you love in the stylist and they'll appear here, ready for any day."
          action={<Button title="Open stylist" icon="sparkles" onPress={() => router.push('/stylist')} />}
        />
      ) : (
        <View style={[styles.grid, columns > 1 ? styles.row : null]}>
          {outfits.map((o, index) => (
            <FadeIn key={o.id} delay={Math.min(index, 6) * 70} style={columns > 1 ? styles.cell : null}>
              <OutfitCard
                outfit={savedToStylist(o)}
                actions={
                  <>
                    <OutfitActions outfit={savedToStylist(o)} initial={{ savedId: o.id, favorite: true, plannedFor: o.planned_for }} />
                    <Button variant="ghost" icon="trash-outline" title="Remove" onPress={() => remove(o)} />
                  </>
                }
              />
            </FadeIn>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  cell: { flexBasis: '48%', flexGrow: 1 },
});
