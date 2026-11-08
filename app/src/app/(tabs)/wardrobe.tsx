import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import { Button, Card, Chip, EmptyState, FadeIn, IconButton, Muted, Title } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { fonts, radius, space, useTheme } from '@/lib/theme';
import { CATEGORIES, type WardrobeItem } from '@/lib/types';

const SORTS = {
  newest: { label: 'Newest', compare: (a: WardrobeItem, b: WardrobeItem) => b.created_at.localeCompare(a.created_at) },
  mostWorn: { label: 'Most worn', compare: (a: WardrobeItem, b: WardrobeItem) => b.times_worn - a.times_worn },
  leastWorn: { label: 'Least worn', compare: (a: WardrobeItem, b: WardrobeItem) => a.times_worn - b.times_worn },
  name: { label: 'A–Z', compare: (a: WardrobeItem, b: WardrobeItem) => a.name.localeCompare(b.name) },
} as const;
type SortKey = keyof typeof SORTS;
const SORT_ORDER = Object.keys(SORTS) as SortKey[];

export default function Wardrobe() {
  const { colors } = useTheme();
  const { items, refreshItems, demoActive } = useAppData();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [focused, setFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Phones 2 columns, tablets and small windows 3, wide screens 4 (content is capped at MAX_WIDTH; the
  // sidebar takes 248 px from 768 px up).
  const contentWidth = Math.min(width >= 768 ? width - 248 : width, MAX_WIDTH);
  const columns = contentWidth < 520 ? 2 : contentWidth < 820 ? 3 : 4;
  const present = CATEGORIES.filter((c) => items.some((i) => i.category === c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (category && item.category !== category) return false;
        if (!q) return true;
        return [item.name, item.subcategory, item.material, item.pattern, ...item.colors, ...item.style_tags, ...item.occasions]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q));
      })
      .sort(SORTS[sort].compare);
  }, [items, category, query, sort]);

  async function onRefresh() {
    setRefreshing(true);
    await refreshItems();
    setRefreshing(false);
  }

  const nextSort = SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.column}>
        {demoActive ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
            <DemoBanner />
            <DemoOnlyNote what="Adding, editing and deleting clothes" />
          </View>
        ) : null}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Title>Wardrobe</Title>
            {items.length ? <Muted>{items.length} pieces · {present.length} categories</Muted> : null}
          </View>
          {items.length > 0 ? <IconButton icon="stats-chart-outline" label="Wardrobe insights" tone="butter" onPress={() => router.push('/insights')} /> : null}
          {demoActive ? null : <Button title="Add" icon="add" onPress={() => router.push('/item/add')} style={{ paddingHorizontal: space.lg }} />}
        </View>

        {items.length > 0 ? (
          <View style={{ gap: space.md, paddingBottom: space.md }}>
            <View style={styles.toolbar}>
              <View
                style={[
                  styles.search,
                  { backgroundColor: colors.surface, borderColor: focused ? colors.accent : colors.border },
                  focused ? { boxShadow: `0 0 0 3px ${colors.accentSoft}` } : null,
                ]}
              >
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Search colour, type, occasion…"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Search wardrobe"
                  clearButtonMode="while-editing"
                  style={[styles.searchInput, { color: colors.text, fontFamily: fonts.regular }, { outlineStyle: 'none' } as object]}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={() => setSort(nextSort)}
                accessibilityRole="button"
                accessibilityLabel={`Sorted by ${SORTS[sort].label}. Sort by ${SORTS[nextSort].label}.`}
                style={({ hovered }) => [styles.sort, { backgroundColor: hovered ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="swap-vertical" size={16} color={colors.accent} />
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{SORTS[sort].label}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <Chip label={`All · ${items.length}`} selected={!category} onPress={() => setCategory(null)} />
              {present.map((c) => (
                <Chip
                  key={c.key}
                  label={`${c.label} · ${items.filter((i) => i.category === c.key).length}`}
                  selected={category === c.key}
                  onPress={() => setCategory(category === c.key ? null : c.key)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <FlatList
          key={columns}
          data={filtered}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md, flexGrow: 1 }}
          columnWrapperStyle={{ gap: space.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState
                icon="shirt-outline"
                title="Your digital closet is empty"
                message="Photograph a piece of clothing or pick a photo. The AI recognises its type, colours and style."
                action={demoActive ? undefined : <Button title="Scan an item" icon="camera-outline" onPress={() => router.push('/item/add')} />}
              />
            ) : (
              <EmptyState icon="search-outline" tone="butter" title="No matches" message="Try another search or category." />
            )
          }
          renderItem={({ item, index }) => (
            <FadeIn delay={Math.min(index, 12) * 30} style={{ flex: 1 / columns }}>
              <ItemCard item={item} />
            </FadeIn>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

function ItemCard({ item }: { item: WardrobeItem }) {
  const { colors } = useTheme();
  const category = CATEGORIES.find((c) => c.key === item.category)?.label ?? item.category;
  return (
    <Card
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityLabel={item.name}
      style={styles.card}
    >
      <ItemThumb item={item} />
      {item.ai_tagged && !item.user_verified ? (
        <View style={[styles.review, { backgroundColor: colors.primary }]}>
          <Ionicons name="sparkles" size={11} color={colors.onPrimary} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onPrimary }}>Review</Text>
        </View>
      ) : null}
      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600' }}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
          {category}
          {item.times_worn ? ` · worn ${item.times_worn}×` : ''}
        </Text>
      </View>
    </Card>
  );
}

const MAX_WIDTH = 1100;

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  toolbar: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space.lg, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 44 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 48 },
  filters: { gap: space.sm, paddingHorizontal: space.lg },
  card: { padding: space.sm, gap: space.sm, borderRadius: radius.lg },
  review: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
});
