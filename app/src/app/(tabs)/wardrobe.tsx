import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ItemThumb } from '@/components/ItemThumb';
import { Button, Chip, EmptyState, Muted, TextField, Title } from '@/components/ui';
import { DemoBanner, DemoOnlyNote } from '@/demo/DemoBanner';
import { useAppData } from '@/lib/data';
import { radius, space, useTheme } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';

export default function Wardrobe() {
  const { colors } = useTheme();
  const { items, refreshItems, demoActive } = useAppData();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const columns = width > 700 ? 4 : 2;
  const present = CATEGORIES.filter((c) => items.some((i) => i.category === c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      return [item.name, item.subcategory, item.material, item.pattern, ...item.colors, ...item.style_tags, ...item.occasions]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [items, category, query]);

  async function onRefresh() {
    setRefreshing(true);
    await refreshItems();
    setRefreshing(false);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {demoActive ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
          <DemoBanner />
          <DemoOnlyNote what="Adding, editing and deleting clothes" />
        </View>
      ) : null}
      <View style={styles.header}>
        <Title>Wardrobe</Title>
        {demoActive ? null : (
          <Button title="Add" icon="add" onPress={() => router.push('/item/add')} style={{ paddingHorizontal: space.lg }} />
        )}
      </View>

      {items.length > 0 ? (
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <View style={{ paddingHorizontal: space.lg }}>
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search colour, type, occasion…"
              accessibilityLabel="Search wardrobe"
              clearButtonMode="while-editing"
            />
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
              title="Your digital wardrobe is empty"
              message="Photograph a piece of clothing or pick a photo. The AI will recognise its type, colours and style."
              action={<Button title="Scan an item" icon="camera-outline" onPress={() => router.push('/item/add')} />}
            />
          ) : (
            <EmptyState icon="search-outline" title="No matches" message="Try another search or category." />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={{ flex: 1 / columns, gap: 6 }}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            <ItemThumb item={item} />
            {item.ai_tagged && !item.user_verified ? (
              <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                <Ionicons name="sparkles" size={12} color={colors.accent} />
                <Text style={{ fontSize: 11, color: colors.text }}>Review</Text>
              </View>
            ) : null}
            <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '500' }}>
              {item.name}
            </Text>
            <Muted numberOfLines={1}>{item.colors.slice(0, 2).join(', ')}</Muted>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  filters: { gap: space.sm, paddingHorizontal: space.lg },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
