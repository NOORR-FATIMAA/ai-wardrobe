import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { ItemThumb } from '@/components/ItemThumb';
import { Body, Button, Card, EmptyState, Heading, Muted, Screen } from '@/components/ui';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { localDate } from '@/lib/dates';
import { daysBetween, formatMoney, RESTING_DAYS, wardrobeInsights } from '@/lib/insights';
import { radius, space, useTheme } from '@/lib/theme';
import type { WardrobeItem } from '@/lib/types';

const LIST_LIMIT = 8;

export default function Insights() {
  const { items, profile } = useAppData();
  const currency = profile?.currency ?? 'USD';
  const today = localDate();
  const insights = useMemo(() => wardrobeInsights(items, today), [items, today]);
  const money = (amount: number) => formatMoney(amount, currency);

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

  const activePercent = Math.round((insights.activeShare ?? 0) * 100);

  return (
    <Screen edges={['bottom']}>
      <DemoBanner />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat value={`${activePercent}%`} label={`worn in the last ${RESTING_DAYS} days`} />
        <Stat value={String(insights.neverWorn.length)} label="never worn" />
        <Stat value={String(insights.resting.length)} label="resting 3+ months" />
      </View>
      <Muted>
        Based on the wears you log with “Wore it today”. {insights.activeCount} of {insights.total} items were worn recently.
      </Muted>

      <Card>
        <Heading>Cost per wear</Heading>
        {insights.pricedCount === 0 ? (
          <Body>
            Add what you paid to your items (open an item, then Edit, then “Price paid”) to see what each wear really costs.
          </Body>
        ) : (
          <View style={{ gap: space.sm }}>
            <Fact label="Average per wear" value={insights.averageCostPerWear !== null ? money(insights.averageCostPerWear) : 'No wears logged yet'} />
            <Fact label="Total recorded" value={`${money(insights.totalSpent)} across ${insights.pricedCount} item${insights.pricedCount > 1 ? 's' : ''}`} />
            {insights.unwornValue > 0 ? <Fact label="Not worn yet" value={money(insights.unwornValue)} /> : null}
          </View>
        )}
      </Card>

      {insights.bestValue.length ? (
        <Section title="Best value" note="The lowest cost per wear: your hardest-working pieces.">
          {insights.bestValue.map(({ item, costPerWear }) => (
            <ItemRow key={item.id} item={item} detail={wears(item)} value={`${money(costPerWear!)} / wear`} />
          ))}
        </Section>
      ) : null}

      {insights.highestCostPerWear.length ? (
        <Section title="Highest cost per wear" note="Every extra wear brings these down.">
          {insights.highestCostPerWear.map(({ item, costPerWear }) => (
            <ItemRow key={item.id} item={item} detail={wears(item)} value={`${money(costPerWear!)} / wear`} />
          ))}
        </Section>
      ) : null}

      {insights.neverWorn.length ? (
        <Section title="Never worn" note="Give these a try, or pass them on to someone who will.">
          {insights.neverWorn.slice(0, LIST_LIMIT).map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              detail={`Added ${daysBetween(item.created_at, today)} days ago`}
              value={item.purchase_price !== null ? money(item.purchase_price) : undefined}
            />
          ))}
          <More count={insights.neverWorn.length - LIST_LIMIT} />
        </Section>
      ) : null}

      {insights.resting.length ? (
        <Section title="Resting" note={`Worn before, but not in the last ${RESTING_DAYS} days.`}>
          {insights.resting.slice(0, LIST_LIMIT).map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              detail={item.last_worn_at ? `Last worn ${daysBetween(item.last_worn_at, today)} days ago` : 'Last wear date unknown'}
            />
          ))}
          <More count={insights.resting.length - LIST_LIMIT} />
        </Section>
      ) : null}

      <Button variant="secondary" title="Style a resting piece" icon="sparkles-outline" onPress={() => router.push('/stylist')} />
    </Screen>
  );
}

const wears = (item: WardrobeItem) => `Worn ${item.times_worn} time${item.times_worn === 1 ? '' : 's'}`;

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.accent }]}>{value}</Text>
      <Muted style={{ fontSize: 12, textAlign: 'center' }}>{label}</Muted>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Muted style={{ width: 130 }}>{label}</Muted>
      <Body style={{ flex: 1, fontSize: 15 }}>{value}</Body>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ gap: 2 }}>
        <Heading>{title}</Heading>
        <Muted>{note}</Muted>
      </View>
      {children}
    </View>
  );
}

function ItemRow({ item, detail, value }: { item: WardrobeItem; detail: string; value?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${detail}${value ? `. ${value}` : ''}`}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <ItemThumb item={item} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{item.name}</Text>
        <Muted>{detail}</Muted>
      </View>
      {value ? <Text style={{ color: colors.text, fontWeight: '600' }}>{value}</Text> : null}
    </Pressable>
  );
}

function More({ count }: { count: number }) {
  return count > 0 ? <Muted>and {count} more</Muted> : null;
}

const styles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1 },
  statValue: { fontSize: 24, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1 },
});
