import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Body, Button, Card, Chip, Heading, Muted, Screen, Title } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { localDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { categoryLabel, OCCASIONS, savedToStylist, type SavedOutfit } from '@/lib/types';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { colors } = useTheme();
  const { profile, items, demoActive } = useAppData();
  const name = profile?.display_name ? `, ${profile.display_name}` : '';
  const quickOccasions = profile?.lifestyle_occasions.length ? profile.lifestyle_occasions : OCCASIONS.slice(0, 5);

  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const unverified = items.filter((i) => i.ai_tagged && !i.user_verified).length;

  const [todaysLook, setTodaysLook] = useState<SavedOutfit | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (demoActive) return; // Demo mode: planned outfits live in the database, so skip the query.
      supabase
        .from('outfits')
        .select('*, outfit_items(item_id, position)')
        .eq('planned_for', localDate())
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => setTodaysLook((data?.[0] as SavedOutfit | undefined) ?? null));
    }, [demoActive]),
  );

  return (
    <Screen>
      <DemoBanner />
      <View style={{ gap: space.xs }}>
        <Muted>{greeting()}{name}</Muted>
        <Title>What are we wearing today?</Title>
      </View>

      {todaysLook ? (
        <View style={{ gap: space.sm }}>
          <Muted style={{ fontWeight: '700', color: colors.accent }}>PLANNED FOR TODAY</Muted>
          <OutfitCard
            key={todaysLook.id}
            compact
            outfit={savedToStylist(todaysLook)}
            actions={
              <OutfitActions
                outfit={savedToStylist(todaysLook)}
                initial={{ savedId: todaysLook.id, favorite: todaysLook.is_favorite, plannedFor: todaysLook.planned_for }}
              />
            }
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push('/stylist')}
        accessibilityRole="button"
        style={[styles.hero, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="sparkles" size={24} color={colors.onAccent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: colors.onAccent }]}>Ask your stylist</Text>
          <Text style={{ color: colors.onAccent, opacity: 0.85 }}>Outfits from clothes you already own</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.onAccent} />
      </Pressable>

      <View style={{ gap: space.sm }}>
        <Heading>Quick picks</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {quickOccasions.map((o) => (
            <Chip key={o} label={o} onPress={() => router.push({ pathname: '/stylist', params: { occasion: o } })} />
          ))}
        </View>
      </View>

      <Card>
        <View style={styles.rowBetween}>
          <Heading>Your wardrobe</Heading>
          <Muted>{items.length} items</Muted>
        </View>
        {items.length === 0 ? (
          <>
            <Body>Start by photographing a few favourite pieces. The AI will tag them for you.</Body>
            <Button title="Add your first item" icon="camera-outline" onPress={() => router.push('/item/add')} />
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {items.slice(0, 10).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                  accessibilityLabel={item.name}
                >
                  <ItemThumb item={item} size={84} />
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {topCategories.map(([cat, n]) => (
                <Muted key={cat}>{categoryLabel(cat)} · {n}</Muted>
              ))}
            </View>
            {unverified > 0 ? (
              <Muted>
                {unverified} AI-tagged item{unverified > 1 ? 's' : ''} not yet reviewed. Open an item to confirm its details.
              </Muted>
            ) : null}
          </>
        )}
      </Card>

      {demoActive ? (
        <DemoOnlyNote what="Stylist chat, the outfit calendar, saved outfits and the shopping list" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Tile icon="chatbubbles-outline" title="Stylist chat" onPress={() => router.push('/assistant')} />
            <Tile icon="calendar-outline" title="Outfit calendar" onPress={() => router.push('/calendar')} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Tile icon="heart-outline" title="Saved outfits" onPress={() => router.push('/outfits')} />
            <Tile icon="bag-check-outline" title="Wardrobe gaps" onPress={() => router.push('/shopping')} />
          </View>
        </>
      )}
      {items.length ? (
        <Tile
          icon="stats-chart-outline"
          title="Wardrobe insights"
          subtitle="Cost per wear, and pieces you never wear"
          onPress={() => router.push('/insights')}
        />
      ) : null}
      <Tile icon="body-outline" title="Your 3D avatar" subtitle="Coming soon: preview outfits on you" onPress={() => router.push('/avatar')} />
    </Screen>
  );
}

function Tile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  heroTitle: { fontSize: 18, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
