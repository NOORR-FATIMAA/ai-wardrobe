import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '@/lib/theme';
import type { MissingItem, WardrobeItem } from '@/lib/types';
import { ItemThumb } from './ItemThumb';

type Slot = 'onepiece' | 'upper' | 'lower' | 'feet' | 'side';

const SLOT_BY_CATEGORY: Record<string, Slot> = {
  dress: 'onepiece', jumpsuit: 'onepiece', suit: 'onepiece', traditional: 'onepiece',
  top: 'upper', shirt: 'upper', tshirt: 'upper', knitwear: 'upper',
  trousers: 'lower', jeans: 'lower', shorts: 'lower', skirt: 'lower',
  shoes: 'feet',
  outerwear: 'side', bag: 'side', accessory: 'side', other: 'side',
};

/** Arranges pieces like a lookbook: body column (top/one-piece, bottom, shoes) and a side column. */
export function layoutOutfit(items: WardrobeItem[]) {
  const main: { item: WardrobeItem; weight: number }[] = [];
  const side: WardrobeItem[] = [];
  const taken = new Set<Slot>();

  const place = (item: WardrobeItem, slot: Slot) => {
    if (slot === 'side' || taken.has(slot) || (slot !== 'feet' && taken.has('onepiece'))) {
      side.push(item);
      return;
    }
    taken.add(slot);
    main.push({ item, weight: slot === 'feet' ? 0.6 : slot === 'onepiece' ? 2.2 : 1.2 });
  };

  for (const item of items) {
    let slot = SLOT_BY_CATEGORY[item.category] ?? 'side';
    // Activewear can be either half; fill whichever is free.
    if (item.category === 'activewear') slot = taken.has('upper') ? 'lower' : 'upper';
    place(item, slot);
  }

  const order: Record<string, number> = { onepiece: 0, upper: 0, lower: 1, feet: 2 };
  main.sort((a, b) => (order[SLOT_BY_CATEGORY[a.item.category]] ?? 1) - (order[SLOT_BY_CATEGORY[b.item.category]] ?? 1));
  return { main, side };
}

export function OutfitBoard({ items, missing = [] }: { items: WardrobeItem[]; missing?: MissingItem[] }) {
  const { colors } = useTheme();
  const { main, side } = layoutOutfit(items);
  const hasSide = side.length > 0 || missing.length > 0;

  const open = (item: WardrobeItem) => router.push({ pathname: '/item/[id]', params: { id: item.id } });

  return (
    <View
      style={[styles.board, { backgroundColor: colors.surfaceAlt }]}
      accessibilityLabel={`Outfit: ${items.map((i) => i.name).join(', ')}`}
    >
      <View style={[styles.column, { flex: hasSide ? 1.6 : 1 }]}>
        {main.map(({ item, weight }) => (
          <Pressable key={item.id} onPress={() => open(item)} style={{ flex: weight }} accessibilityLabel={`Open ${item.name}`}>
            <View style={[styles.tile, { backgroundColor: colors.surface }]}>
              <ItemThumb item={item} fill fit="contain" />
            </View>
          </Pressable>
        ))}
      </View>
      {hasSide ? (
        <View style={[styles.column, { flex: 1 }]}>
          {side.map((item) => (
            <Pressable key={item.id} onPress={() => open(item)} style={{ flex: 1 }} accessibilityLabel={`Open ${item.name}`}>
              <View style={[styles.tile, { backgroundColor: colors.surface }]}>
                <ItemThumb item={item} fill fit="contain" />
              </View>
            </Pressable>
          ))}
          {missing.map((m) => (
            <View
              key={m.name}
              style={[styles.tile, styles.missing, { flex: 1, borderColor: colors.accent }]}
              accessibilityLabel={`Not owned: ${m.name}`}
            >
              <Ionicons name="bag-add-outline" size={20} color={colors.accent} />
              <Text numberOfLines={3} style={{ color: colors.text, fontSize: 11, textAlign: 'center' }}>
                {m.name}
              </Text>
              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>NOT OWNED</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', gap: space.sm, padding: space.sm, borderRadius: radius.md, aspectRatio: 4 / 5 },
  column: { gap: space.sm },
  tile: { flex: 1, borderRadius: radius.sm, overflow: 'hidden', padding: 4 },
  missing: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.sm },
});
