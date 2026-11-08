import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Button, Card, EmptyState, Heading, Muted, Screen } from '@/components/ui';
import { useAppData } from '@/lib/data';
import { dayLabel, localDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/lib/theme';
import { savedToStylist, type SavedOutfit, type WearLogEntry } from '@/lib/types';

export default function Calendar() {
  const { colors } = useTheme();
  const { itemById } = useAppData();
  const [planned, setPlanned] = useState<SavedOutfit[] | null>(null);
  const [worn, setWorn] = useState<WearLogEntry[]>([]);

  const load = useCallback(async () => {
    const [plans, wears] = await Promise.all([
      supabase
        .from('outfits')
        .select('*, outfit_items(item_id, position)')
        .gte('planned_for', localDate())
        .lte('planned_for', localDate(13))
        .order('planned_for'),
      supabase
        .from('wear_log')
        .select('id, worn_on, outfit_id, item_ids')
        .gte('worn_on', localDate(-14))
        .order('worn_on', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    setPlanned((plans.data ?? []) as SavedOutfit[]);
    setWorn((wears.data ?? []) as WearLogEntry[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!planned) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Heading>Coming up</Heading>
      {planned.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing planned yet"
          message="Ask the stylist for outfits and tap Plan to put them on a day."
          action={<Button title="Open stylist" icon="sparkles" onPress={() => router.push('/stylist')} />}
        />
      ) : (
        planned.map((o) => (
          <View key={o.id} style={{ gap: space.sm }}>
            <Muted style={{ fontWeight: '700', color: colors.accent }}>{dayLabel(o.planned_for!)}</Muted>
            <OutfitCard
              compact
              outfit={savedToStylist(o)}
              actions={
                <OutfitActions
                  outfit={savedToStylist(o)}
                  initial={{ savedId: o.id, favorite: o.is_favorite, plannedFor: o.planned_for }}
                  onChange={(s) => s.plannedFor !== o.planned_for && load()}
                />
              }
            />
          </View>
        ))
      )}

      <Heading>Recently worn</Heading>
      {worn.length === 0 ? (
        <Muted>Tap “Wore it today” on an outfit or item to start your outfit history.</Muted>
      ) : (
        worn.map((w) => {
          const items = w.item_ids.map(itemById).filter((i) => i !== undefined);
          return (
            <Card key={w.id}>
              <Muted style={{ fontWeight: '700' }}>{dayLabel(w.worn_on)}</Muted>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                    accessibilityLabel={item.name}
                  >
                    <ItemThumb item={item} size={64} />
                  </Pressable>
                ))}
              </ScrollView>
              {items.length < w.item_ids.length ? <Muted>Some items were removed from your wardrobe.</Muted> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
