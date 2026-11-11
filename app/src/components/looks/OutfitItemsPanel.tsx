import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import { useAppData } from '@/lib/data';
import type { Look, LookItem, Zone } from './types';
import { radius, space, useTheme } from '@/lib/theme';

const SIZE_KEY: Partial<Record<Zone, string>> = { top: 'top', outer: 'top', onepiece: 'top', bottom: 'bottom', feet: 'shoe' };

/** The user's own size for a suggested piece, from their style profile, when they gave one. */
export function useSizeFor(item: LookItem) {
  const { profile } = useAppData();
  const key = SIZE_KEY[item.zone];
  return item.ownership === 'suggested' && key ? profile?.sizes?.[key] || null : null;
}

/** Small square picture of a piece: the wardrobe photo, or a dashed outline for a suggestion. */
export function PieceThumb({ item, size = 56 }: { item: LookItem; size?: number }) {
  const { colors } = useTheme();
  if (item.wardrobeItem) return <ItemThumb item={item.wardrobeItem} size={size} fit="contain" />;
  return (
    <View style={[styles.suggestThumb, { width: size, height: size, borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
      <Ionicons name="bag-add-outline" size={size * 0.38} color={colors.accent} />
    </View>
  );
}

/** "In this look": every piece, owned or suggested, with an Explore action. Hover/press syncs the hotspot. */
export function OutfitItemsPanel({
  look,
  activeKey,
  onActivate,
  onExplore,
}: {
  look: Look;
  activeKey: string | null;
  onActivate: (key: string | null) => void;
  onExplore: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.headRow}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>In this look</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {look.items.length} piece{look.items.length === 1 ? '' : 's'}
        </Text>
      </View>
      {look.items.map((item) => (
        <ItemRow key={item.key} item={item} active={activeKey === item.key} onActivate={onActivate} onExplore={() => onExplore(item.key)} />
      ))}
      {look.removedCount > 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {look.removedCount} piece{look.removedCount > 1 ? 's' : ''} from this look {look.removedCount > 1 ? 'were' : 'was'} removed from your wardrobe.
        </Text>
      ) : null}
    </View>
  );
}

function ItemRow({
  item,
  active,
  onActivate,
  onExplore,
}: {
  item: LookItem;
  active: boolean;
  onActivate: (key: string | null) => void;
  onExplore: () => void;
}) {
  const { colors } = useTheme();
  const size = useSizeFor(item);
  const owned = item.ownership === 'owned';
  const meta = [item.colors.slice(0, 2).join(', '), item.category, size ? `Your size ${size}` : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onExplore}
      onHoverIn={() => onActivate(item.key)}
      onHoverOut={() => onActivate(null)}
      onFocus={() => onActivate(item.key)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${owned ? 'in your wardrobe' : 'suggested, not owned'}. Explore.`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border },
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <PieceThumb item={item} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>
          {item.name}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
            {meta}
          </Text>
        ) : null}
        <View style={[styles.tag, { backgroundColor: owned ? colors.mintSoft : colors.coralSoft }]}>
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{owned ? 'In your wardrobe' : 'Suggested · not owned'}</Text>
        </View>
      </View>
      <View style={styles.explore}>
        <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>Explore</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.md, borderWidth: 1.5 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  explore: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  suggestThumb: { borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
