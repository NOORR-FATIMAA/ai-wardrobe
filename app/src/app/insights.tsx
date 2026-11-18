import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import { Button, EmptyState, FadeIn, Muted, Screen, StatCard, Title, toneColors, type Tone } from '@/components/ui';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { localDate } from '@/lib/dates';
import { daysBetween, formatMoney, RESTING_DAYS, wardrobeInsights } from '@/lib/insights';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { categoryLabel, type WardrobeItem } from '@/lib/types';

const LIST_LIMIT = 12;

export default function Insights() {
  const { colors } = useTheme();
  const { items, profile } = useAppData();
  const currency = profile?.currency ?? 'USD';
  const today = localDate();
  const insights = useMemo(() => wardrobeInsights(items, today), [items, today]);
  const money = (amount: number) => formatMoney(amount, currency);

  // Share of each category worn in the last RESTING_DAYS days (the same rule as "worn recently").
  const byCategory = useMemo(() => {
    const groups = new Map<string, { total: number; active: number }>();
    for (const item of items) {
      const g = groups.get(item.category) ?? { total: 0, active: 0 };
      g.total += 1;
      if (item.times_worn > 0 && item.last_worn_at && daysBetween(item.last_worn_at, today) < RESTING_DAYS) g.active += 1;
      groups.set(item.category, g);
    }
    return [...groups.entries()]
      .map(([category, g]) => ({ category, ...g, share: g.active / g.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [items, today]);

  if (items.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="stats-chart-outline"
          title="No insights yet"
          message="Add some clothes and log what you wear to see which pieces earn their place."
          action={<Button title="Add an item" icon="camera-outline" onPress={() => router.push('/item/add')} />}
        />
      </Screen>
    );
  }

  const active = insights.activeCount;
  const never = insights.neverWorn.length;
  const resting = insights.resting.length;
  // Items newer than two weeks and never worn are in none of the three groups yet.
  const fresh = Math.max(0, insights.total - active - never - resting);

  return (
    <Screen edges={['bottom']} wide>
      <DemoBanner />
      <FadeIn style={{ gap: space.xs }}>
        <Title>Wardrobe insights</Title>
        <Muted>Based on the wears you log with “Wore it today”. Worked out on your device.</Muted>
      </FadeIn>

      {/* Wardrobe health: one bar split into worn recently / resting / never worn (/ new). */}
      <FadeIn delay={60} style={[styles.card, { backgroundColor: colors.surface }, shadowFor(colors)]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
          <Text style={[styles.big, { color: colors.text }]}>{Math.round((insights.activeShare ?? 0) * 100)}%</Text>
          <Text style={{ color: colors.textMuted, flex: 1, paddingBottom: 8 }}>of your wardrobe worn in the last {RESTING_DAYS} days</Text>
        </View>
        <HealthBar
          segments={[
            { value: active, color: colors.mint, label: 'Worn recently' },
            { value: resting, color: colors.butter, label: 'Resting' },
            { value: never, color: colors.coral, label: 'Never worn' },
            { value: fresh, color: colors.surfaceAlt, label: 'New' },
          ]}
        />
      </FadeIn>

      <FadeIn delay={120} style={styles.stats}>
        <StatCard icon="checkmark-done-outline" tone="mint" value={active} label="Worn recently" />
        <StatCard icon="moon-outline" tone="butter" value={resting} label="Resting 3+ months" />
        <StatCard icon="sparkles-outline" tone="coral" value={never} label="Never worn" />
        <StatCard icon="shirt-outline" tone="lavender" value={insights.total} label="Pieces in total" />
      </FadeIn>

      <View style={styles.split}>
        {/* What you actually wear, by category */}
        <FadeIn delay={180} style={[styles.card, styles.half, { backgroundColor: colors.surface }, shadowFor(colors)]}>
          <SectionTitle icon="pie-chart-outline" tone="lavender" title="Worn by category" />
          {byCategory.map((c, i) => (
            <View key={c.category} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{categoryLabel(c.category)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {c.active} of {c.total}
                </Text>
              </View>
              <GrowBar share={c.share} color={[colors.primary, colors.mint, colors.butter, colors.coral][i % 4]} delay={i * 80} />
            </View>
          ))}
        </FadeIn>

        {/* Cost per wear */}
        <FadeIn delay={240} style={[styles.card, styles.half, { backgroundColor: colors.butterSoft }]}>
          <SectionTitle icon="cash-outline" tone="butter" title="Cost per wear" />
          {insights.pricedCount === 0 ? (
            <Text style={{ color: colors.text, lineHeight: 22 }}>
              Add what you paid to your pieces (open a piece, then Edit, then “Price paid”) to see what each wear really costs.
            </Text>
          ) : (
            <>
              <View>
                <Text style={[styles.big, { color: colors.text }]}>
                  {insights.averageCostPerWear !== null ? money(insights.averageCostPerWear) : '—'}
                </Text>
                <Text style={{ color: colors.textMuted }}>
                  {insights.averageCostPerWear !== null ? 'average per wear' : 'no wears logged yet'}
                </Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.text }}>
                  {money(insights.totalSpent)} recorded across {insights.pricedCount} piece{insights.pricedCount > 1 ? 's' : ''}
                </Text>
                {insights.unwornValue > 0 ? (
                  <Text style={{ color: colors.text }}>{money(insights.unwornValue)} in pieces not worn yet</Text>
                ) : null}
              </View>
            </>
          )}
        </FadeIn>
      </View>

      {insights.bestValue.length ? (
        <Shelf title="Best value" note="Your hardest-working pieces: the lowest cost per wear." icon="trophy-outline" tone="mint">
          {insights.bestValue.map(({ item, costPerWear }) => (
            <PieceCard key={item.id} item={item} detail={wears(item)} badge={`${money(costPerWear!)} / wear`} tone="mint" />
          ))}
        </Shelf>
      ) : null}

      {insights.highestCostPerWear.length ? (
        <Shelf title="Highest cost per wear" note="Every extra wear brings these down." icon="trending-down-outline" tone="lavender">
          {insights.highestCostPerWear.map(({ item, costPerWear }) => (
            <PieceCard key={item.id} item={item} detail={wears(item)} badge={`${money(costPerWear!)} / wear`} tone="lavender" />
          ))}
        </Shelf>
      ) : null}

      {never ? (
        <Shelf title="Never worn" note="Give these a try, or pass them on to someone who will." icon="sparkles-outline" tone="coral">
          {insights.neverWorn.slice(0, LIST_LIMIT).map((item) => (
            <PieceCard
              key={item.id}
              item={item}
              detail={`Added ${daysBetween(item.created_at, today)} days ago`}
              badge={item.purchase_price !== null ? money(item.purchase_price) : undefined}
              tone="coral"
            />
          ))}
        </Shelf>
      ) : null}

      {resting ? (
        <Shelf title="Resting" note={`Worn before, but not in the last ${RESTING_DAYS} days.`} icon="moon-outline" tone="butter">
          {insights.resting.slice(0, LIST_LIMIT).map((item) => (
            <PieceCard
              key={item.id}
              item={item}
              detail={item.last_worn_at ? `Last worn ${daysBetween(item.last_worn_at, today)} days ago` : 'Last wear unknown'}
              tone="butter"
            />
          ))}
        </Shelf>
      ) : null}

      <Button title="Style a forgotten piece" icon="sparkles" onPress={() => router.push('/stylist')} />
    </Screen>
  );
}

const wears = (item: WardrobeItem) => `Worn ${item.times_worn} time${item.times_worn === 1 ? '' : 's'}`;

/** One horizontal bar split into proportional coloured segments, with a legend underneath. */
function HealthBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const { colors } = useTheme();
  const shown = segments.filter((s) => s.value > 0);
  return (
    <View style={{ gap: space.md }}>
      <View style={[styles.health, { backgroundColor: colors.surfaceAlt }]}>
        {shown.map((s) => (
          <View key={s.label} style={{ flex: s.value, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={styles.legend}>
        {shown.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color, borderWidth: 1, borderColor: colors.border }} />
            <Text style={{ color: colors.text, fontSize: 13 }}>
              {s.label} · {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A progress bar that grows to `share` (0–1) when it appears. */
function GrowBar({ share, color, delay }: { share: number; color: string; delay: number }) {
  const { colors, reduceMotion } = useTheme();
  const [grow] = useState(() => new Animated.Value(reduceMotion ? share : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(grow, { toValue: share, duration: 700, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, share, delay, reduceMotion]);
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
      <Animated.View style={{ width, height: '100%', borderRadius: 999, backgroundColor: color, minWidth: share > 0 ? 8 : 0 }} />
    </View>
  );
}

function SectionTitle({ icon, title, tone }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; tone: Tone }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={[styles.icon, { backgroundColor: tone === 'butter' ? colors.surface : t.bg }]}>
        <Ionicons name={icon} size={17} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.displaySemibold, fontSize: 19 }}>{title}</Text>
    </View>
  );
}

/** A titled, horizontally scrolling row of piece cards. */
function Shelf({ title, note, icon, tone, children }: { title: string; note: string; icon: ComponentProps<typeof Ionicons>['name']; tone: Tone; children: ReactNode }) {
  return (
    <FadeIn style={{ gap: space.sm }}>
      <SectionTitle icon={icon} title={title} tone={tone} />
      <Muted>{note}</Muted>
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} contentContainerStyle={{ gap: space.md, paddingVertical: 4, paddingRight: space.lg }}>
        {children}
      </ScrollView>
    </FadeIn>
  );
}

function PieceCard({ item, detail, badge, tone }: { item: WardrobeItem; detail: string; badge?: string; tone: Tone }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${detail}${badge ? `. ${badge}` : ''}`}
      style={({ hovered, pressed }) => [
        styles.piece,
        { backgroundColor: colors.surface },
        shadowFor(colors, Boolean(hovered)),
        { transform: [{ translateY: hovered ? -3 : 0 }, { scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <ItemThumb item={item} size={128} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: t.strong }]}>
          <Text style={{ color: colors.onPastel, fontSize: 12, fontWeight: '700' }}>{badge}</Text>
        </View>
      ) : null}
      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
        {item.name}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  big: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.2 },
  health: { flexDirection: 'row', height: 18, borderRadius: 999, overflow: 'hidden', gap: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  half: { flexGrow: 1, flexBasis: 320 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  piece: { width: 152, padding: 12, gap: 6, borderRadius: radius.lg },
  badge: { position: 'absolute', top: 18, right: 18, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
