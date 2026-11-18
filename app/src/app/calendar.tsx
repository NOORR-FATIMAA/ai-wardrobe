import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Text } from '@/components/Text';
import { Button, EmptyState, FadeIn, Muted, Screen, Skeleton, Title } from '@/components/ui';
import { useAppData } from '@/lib/data';
import { dayLabel, localDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { savedToStylist, type SavedOutfit, type WearLogEntry } from '@/lib/types';

const DAYS = 14;

/** Weekday and day of month for a YYYY-MM-DD date, in the device's language. */
function dayParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { weekday: date.toLocaleDateString(undefined, { weekday: 'short' }), day: d };
}

/** Outfit calendar: a two-week day strip of planned looks, the chosen day's outfit, and recent wears. */
export default function Calendar() {
  const { colors } = useTheme();
  const { itemById } = useAppData();
  const [planned, setPlanned] = useState<SavedOutfit[] | null>(null);
  const [worn, setWorn] = useState<WearLogEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => localDate(i)), []);
  const byDay = useMemo(() => {
    const map = new Map<string, SavedOutfit[]>();
    for (const o of planned ?? []) map.set(o.planned_for!, [...(map.get(o.planned_for!) ?? []), o]);
    return map;
  }, [planned]);
  // Default: the first day with something planned, else today.
  const day = selected ?? days.find((d) => byDay.has(d)) ?? days[0];
  const dayOutfits = byDay.get(day) ?? [];

  return (
    <Screen edges={['bottom']}>
      <FadeIn style={{ gap: space.xs }}>
        <Title>Your outfit calendar</Title>
        <Muted>
          {planned === null ? 'Loading your plans…' : `${planned.length} look${planned.length === 1 ? '' : 's'} planned for the next two weeks`}
        </Muted>
      </FadeIn>

      {/* Two-week strip: a dot marks days with a planned look. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {days.map((d) => {
          const { weekday, day: n } = dayParts(d);
          const active = d === day;
          const has = byDay.has(d);
          return (
            <Pressable
              key={d}
              onPress={() => setSelected(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${dayLabel(d)}${has ? ', a look is planned' : ''}`}
              style={({ hovered }) => [
                styles.day,
                { backgroundColor: active ? colors.text : hovered ? colors.surfaceAlt : colors.surface },
                active ? null : shadowFor(colors),
              ]}
            >
              <Text style={{ color: active ? colors.background : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                {d === days[0] ? 'Today' : weekday}
              </Text>
              <Text style={{ color: active ? colors.background : colors.text, fontFamily: fonts.display, fontSize: 22 }}>{n}</Text>
              <View style={[styles.mark, { backgroundColor: has ? (active ? colors.primary : colors.accent) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      {planned === null ? (
        <Skeleton height={320} rounded={radius.lg} />
      ) : dayOutfits.length ? (
        dayOutfits.map((o) => (
          <FadeIn key={o.id} style={{ gap: space.sm }}>
            <Text style={[styles.dayTitle, { color: colors.text }]}>{dayLabel(day)}</Text>
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
          </FadeIn>
        ))
      ) : (
        <EmptyState
          icon="calendar-outline"
          tone="mint"
          title={`Nothing planned for ${dayLabel(day).toLowerCase() === 'today' ? 'today' : dayLabel(day)}`}
          message="Ask the stylist for outfits and tap Plan to put one on a day."
          action={<Button title="Plan a look" icon="sparkles" onPress={() => router.push('/stylist')} />}
        />
      )}

      <View style={{ gap: space.md }}>
        <Text style={[styles.dayTitle, { color: colors.text }]}>Recently worn</Text>
        {worn.length === 0 ? (
          <Muted>Tap “Wore it today” on an outfit or a piece to start your outfit history.</Muted>
        ) : (
          worn.map((w, i) => {
            const items = w.item_ids.map(itemById).filter((x) => x !== undefined);
            const { weekday, day: n } = dayParts(w.worn_on);
            return (
              <FadeIn key={w.id} delay={Math.min(i, 6) * 60} style={styles.wornRow}>
                {/* Timeline: date badge with a line down to the next entry. */}
                <View style={{ alignItems: 'center' }}>
                  <View style={[styles.dateBadge, { backgroundColor: colors.mintSoft }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>{weekday}</Text>
                    <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18 }}>{n}</Text>
                  </View>
                  {i < worn.length - 1 ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
                </View>
                <View style={[styles.wornCard, { backgroundColor: colors.surface }, shadowFor(colors)]}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{dayLabel(w.worn_on)}</Text>
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
                  {items.length < w.item_ids.length ? (
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                      <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                      <Muted style={{ fontSize: 12 }}>Some pieces were removed from your wardrobe.</Muted>
                    </View>
                  ) : null}
                </View>
              </FadeIn>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.sm, paddingVertical: 6, paddingHorizontal: 2 },
  day: { width: 58, paddingVertical: space.md, borderRadius: radius.md + 4, alignItems: 'center', gap: 2 },
  mark: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  dayTitle: { fontFamily: fonts.displaySemibold, fontSize: 20, letterSpacing: -0.3 },
  wornRow: { flexDirection: 'row', gap: space.md },
  dateBadge: { width: 48, paddingVertical: 6, borderRadius: radius.md, alignItems: 'center' },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1, minHeight: 16 },
  wornCard: { flex: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm, marginBottom: space.sm },
});
