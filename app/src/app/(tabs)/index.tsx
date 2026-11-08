import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Text } from '@/components/Text';
import { Body, Button, Card, FadeIn, Muted, Screen, SectionHeader, Skeleton, StatCard, Title, toneColors, type Tone } from '@/components/ui';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { localDate } from '@/lib/dates';
import { wardrobeInsights } from '@/lib/insights';
import { supabase } from '@/lib/supabase';
import { fonts, radius, space, useTheme } from '@/lib/theme';
import { savedToStylist, type SavedOutfit, type WardrobeItem } from '@/lib/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home dashboard: the AI stylist first, then quick actions, wardrobe stats, recent pieces and saved looks. */
export default function Home() {
  const { colors } = useTheme();
  const { profile, items, demoActive, itemById } = useAppData();
  const { width } = useWindowDimensions();
  const name = profile?.display_name ? `, ${profile.display_name}` : '';
  const unverified = items.filter((i) => i.ai_tagged && !i.user_verified).length;
  const stats = useMemo(() => wardrobeInsights(items, localDate()), [items]);
  const recent = useMemo(() => [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10), [items]);

  const [todaysLook, setTodaysLook] = useState<SavedOutfit | null>(null);
  const [saved, setSaved] = useState<{ outfits: SavedOutfit[]; count: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (demoActive) return; // Demo mode: outfits live in the database, so skip the queries.
      supabase
        .from('outfits')
        .select('*, outfit_items(item_id, position)')
        .eq('planned_for', localDate())
        .order('created_at', { ascending: false })
        .limit(1)
        .then(({ data }) => setTodaysLook((data?.[0] as SavedOutfit | undefined) ?? null));
      supabase
        .from('outfits')
        .select('*, outfit_items(item_id, position)', { count: 'exact' })
        .eq('is_favorite', true)
        .order('created_at', { ascending: false })
        .limit(4)
        .then(({ data, count }) => setSaved({ outfits: (data as SavedOutfit[] | null) ?? [], count: count ?? 0 }));
    }, [demoActive]),
  );

  const actions: { label: string; icon: IconName; href: Href; tone: Tone; show: boolean }[] = [
    { label: 'Add clothes', icon: 'camera-outline', href: '/item/add', tone: 'lavender', show: !demoActive },
    { label: 'Stylist chat', icon: 'chatbubbles-outline', href: '/assistant', tone: 'coral', show: !demoActive },
    { label: 'Calendar', icon: 'calendar-outline', href: '/calendar', tone: 'mint', show: !demoActive },
    { label: 'Browse wardrobe', icon: 'shirt-outline', href: '/wardrobe', tone: 'mint', show: demoActive },
    { label: 'Insights', icon: 'stats-chart-outline', href: '/insights', tone: 'butter', show: true },
  ];
  const twoColumns = width >= 1000;

  return (
    <Screen wide>
      <DemoBanner />
      <FadeIn style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Muted>
            {greeting()}
            {name} 👋
          </Muted>
          <Title>What&apos;s the plan today?</Title>
        </View>
        {/* On wide screens the sidebar already shows the profile. */}
        {demoActive || width >= 768 ? null : (
          <Pressable
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile and settings"
            hitSlop={8}
            style={[styles.avatar, { backgroundColor: colors.butter }]}
          >
            <Text style={{ color: colors.onPastel, fontWeight: '700', fontSize: 16 }}>
              {(profile?.display_name?.trim()[0] ?? '').toUpperCase() || <Ionicons name="person" size={18} />}
            </Text>
          </Pressable>
        )}
      </FadeIn>

      <FadeIn delay={60}>
        <StylistHero />
      </FadeIn>

      <FadeIn delay={120} style={styles.actions}>
        {actions
          .filter((a) => a.show)
          .map((a) => (
            <QuickAction key={a.label} {...a} />
          ))}
      </FadeIn>

      {items.length === 0 ? (
        <FadeIn delay={180}>
          <Card style={{ alignItems: 'flex-start' }}>
            <SectionHeader title="Start your wardrobe" />
            <Body>Photograph a few favourite pieces. The AI tags them for you, then the stylist can get to work.</Body>
            <Button title="Add your first item" icon="camera-outline" onPress={() => router.push('/item/add')} />
          </Card>
        </FadeIn>
      ) : (
        <FadeIn delay={180} style={styles.stats}>
          <StatCard icon="shirt-outline" tone="lavender" value={items.length} label="Pieces in your wardrobe" onPress={() => router.push('/wardrobe')} />
          <StatCard
            icon="pulse-outline"
            tone="mint"
            value={Math.round((stats.activeShare ?? 0) * 100)}
            format={(n) => `${Math.round(n)}%`}
            label="Worn in the last 90 days"
            onPress={() => router.push('/insights')}
          />
          <StatCard icon="moon-outline" tone="coral" value={stats.neverWorn.length} label="Never worn yet" onPress={() => router.push('/insights')} />
          {demoActive ? (
            <StatCard icon="color-palette-outline" tone="butter" value={new Set(items.map((i) => i.category)).size} label="Categories" />
          ) : (
            <StatCard icon="heart-outline" tone="butter" value={saved?.count ?? 0} label="Saved outfits" onPress={() => router.push('/outfits')} />
          )}
        </FadeIn>
      )}

      <View style={[styles.columns, twoColumns ? { flexDirection: 'row', alignItems: 'flex-start' } : null]}>
        {todaysLook ? (
          <FadeIn delay={240} style={[{ gap: space.sm }, twoColumns ? { flex: 1 } : null]}>
            <SectionHeader title="Today’s look" />
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
          </FadeIn>
        ) : null}

        {demoActive ? null : (
          <FadeIn delay={260} style={[{ gap: space.sm }, twoColumns ? { flex: 1 } : null]}>
            <SectionHeader title="Saved looks" action={saved?.count ? `See all ${saved.count}` : undefined} onAction={() => router.push('/outfits')} />
            {saved === null ? (
              <View style={styles.lookRow}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width={150} height={190} rounded={radius.lg} />
                ))}
              </View>
            ) : saved.outfits.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lookRow}>
                {saved.outfits.map((o) => (
                  <LookPreview key={o.id} outfit={o} itemById={itemById} />
                ))}
              </ScrollView>
            ) : (
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="heart-outline" size={22} color={colors.accent} />
                <Muted style={{ flex: 1 }}>Tap the heart on an outfit you love and it lands here, ready for later.</Muted>
              </Card>
            )}
          </FadeIn>
        )}
      </View>

      {items.length ? (
        <FadeIn delay={300} style={{ gap: space.sm }}>
          <SectionHeader title="Recently added" action={`See all ${items.length}`} onAction={() => router.push('/wardrobe')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: 4 }}>
            {recent.map((item) => (
              <RecentItem key={item.id} item={item} />
            ))}
          </ScrollView>
          {unverified > 0 ? (
            <Muted>
              {unverified} item{unverified > 1 ? 's' : ''} tagged by AI and waiting for your review.
            </Muted>
          ) : null}
        </FadeIn>
      ) : null}
    </Screen>
  );
}

/** The main call to action: a lavender card with floating pastel shapes. */
function StylistHero() {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/stylist')}
      accessibilityRole="button"
      accessibilityLabel="Style me: an outfit from clothes you already own"
      style={({ pressed, hovered }) => [
        styles.hero,
        { backgroundColor: colors.primary, boxShadow: colors.glow, transform: [{ scale: pressed ? 0.98 : hovered ? 1.01 : 1 }] },
      ]}
    >
      <View style={[styles.blob, { backgroundColor: colors.coral, width: 120, height: 120, top: -40, right: 40, opacity: 0.55 }]} />
      <View style={[styles.blob, { backgroundColor: colors.butter, width: 70, height: 70, bottom: -24, right: -10, opacity: 0.7 }]} />
      <View style={[styles.blob, { backgroundColor: colors.mint, width: 46, height: 46, top: 18, right: 150, opacity: 0.6 }]} />
      <View style={{ flex: 1, gap: space.sm }}>
        <View style={[styles.heroBadge, { backgroundColor: colors.onPrimary }]}>
          <Ionicons name="sparkles" size={12} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>AI stylist</Text>
        </View>
        <Text style={[styles.heroTitle, { color: colors.onPrimary }]}>Style me</Text>
        <Text style={{ color: colors.onPrimary, fontSize: 15, maxWidth: 360 }}>Pick an occasion and get complete outfits made from clothes you already own.</Text>
      </View>
      <View style={[styles.heroArrow, { backgroundColor: colors.onPrimary }]}>
        <Ionicons name="arrow-forward" size={22} color={colors.primary} />
      </View>
    </Pressable>
  );
}

function QuickAction({ label, icon, href, tone }: { label: string; icon: IconName; href: Href; tone: Tone }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <Card onPress={() => router.push(href)} accessibilityLabel={label} style={styles.action}>
      <View style={[styles.actionIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={20} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Card>
  );
}

function RecentItem({ item }: { item: WardrobeItem }) {
  const { colors } = useTheme();
  return (
    <Card
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityLabel={item.name}
      style={styles.recent}
    >
      <ItemThumb item={item} size={124} />
      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
        {item.name}
      </Text>
    </Card>
  );
}

/** A saved outfit as a small lookbook tile: up to four pieces in a grid, and the title. */
function LookPreview({ outfit, itemById }: { outfit: SavedOutfit; itemById: (id: string) => WardrobeItem | undefined }) {
  const { colors } = useTheme();
  const pieces = [...outfit.outfit_items]
    .sort((a, b) => a.position - b.position)
    .map((oi) => itemById(oi.item_id))
    .filter((i): i is WardrobeItem => Boolean(i))
    .slice(0, 4);
  return (
    <Card onPress={() => router.push('/outfits')} accessibilityLabel={outfit.title} style={styles.look}>
      <View style={styles.lookGrid}>
        {pieces.map((p) => (
          <ItemThumb key={p.id} item={p} size={60} />
        ))}
      </View>
      <Text numberOfLines={2} style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
        {outfit.title}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.xl, borderRadius: radius.lg, overflow: 'hidden', minHeight: 150 },
  blob: { position: 'absolute', borderRadius: 999 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  heroTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 },
  heroArrow: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  action: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  columns: { gap: space.lg },
  lookRow: { flexDirection: 'row', gap: space.md, paddingVertical: 4 },
  look: { width: 150, padding: space.md, gap: space.sm },
  lookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recent: { width: 148, padding: space.sm + 4, gap: space.sm },
});
