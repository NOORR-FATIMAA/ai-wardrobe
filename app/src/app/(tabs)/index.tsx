import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Body, Button, Card, Heading, Muted, Screen, Title } from '@/components/ui';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { localDate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import { savedToStylist, type SavedOutfit } from '@/lib/types';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home: one main action (Style me), today's planned look, and a glimpse of the wardrobe. */
export default function Home() {
  const { colors } = useTheme();
  const { profile, items, demoActive } = useAppData();
  const name = profile?.display_name ? `, ${profile.display_name}` : '';
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
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Muted>{greeting()}{name}</Muted>
          <Title>What&apos;s the plan today?</Title>
        </View>
        {demoActive ? null : (
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile and settings"
            hitSlop={8}
            style={[styles.avatar, { backgroundColor: colors.accentSoft }]}
          >
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>
              {(profile?.display_name?.trim()[0] ?? '').toUpperCase() || <Ionicons name="person" size={18} />}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={() => router.push('/stylist')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.hero, { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 }]}
      >
        <Ionicons name="sparkles" size={26} color={colors.onAccent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.heroTitle, { color: colors.onAccent }]}>Style me</Text>
          <Text style={{ color: colors.onAccent, opacity: 0.85 }}>An outfit from clothes you already own</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.onAccent} />
      </Pressable>

      {todaysLook ? (
        <View style={{ gap: space.sm }}>
          <Heading>Today&apos;s look</Heading>
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

      {items.length === 0 ? (
        <Card>
          <Heading>Start your wardrobe</Heading>
          <Body>Photograph a few favourite pieces. The AI tags them for you.</Body>
          <Button title="Add your first item" icon="camera-outline" onPress={() => router.push('/item/add')} />
        </Card>
      ) : (
        <View style={{ gap: space.sm }}>
          <View style={styles.rowBetween}>
            <Heading>Your clothes</Heading>
            <Pressable onPress={() => router.push('/wardrobe')} accessibilityRole="link" hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>See all {items.length}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {items.slice(0, 12).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                accessibilityLabel={item.name}
              >
                <ItemThumb item={item} size={92} />
              </Pressable>
            ))}
          </ScrollView>
          {unverified > 0 ? (
            <Muted>
              {unverified} item{unverified > 1 ? 's' : ''} tagged by AI and waiting for your review.
            </Muted>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl, borderRadius: radius.lg },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
