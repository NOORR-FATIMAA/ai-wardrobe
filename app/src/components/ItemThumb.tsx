import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { useAppData } from '@/lib/data';
import { isCutout } from '@/lib/images';
import { radius, useTheme } from '@/lib/theme';
import { CATEGORIES, type WardrobeItem } from '@/lib/types';

/** Photo of a wardrobe item (square unless `fill`), with a category icon placeholder. */
export function ItemThumb({
  item,
  size,
  fill,
  fit = 'cover',
}: {
  item: WardrobeItem;
  size?: number;
  /** Stretch to the parent's size instead of a square. */
  fill?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const { colors } = useTheme();
  const { imageUrls } = useAppData();
  const uri = item.image_path ? imageUrls[item.image_path] : undefined;
  const icon = CATEGORIES.find((c) => c.key === item.category)?.icon ?? 'shirt-outline';
  const box = fill
    ? { flex: 1 }
    : size
      ? { width: size, height: size }
      : { width: '100%' as const, aspectRatio: 1 };

  return (
    <View
      style={[box, { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt }]}
      accessibilityLabel={item.name}
      accessible
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ flex: 1, margin: isCutout(item.image_path) ? 6 : 0 }}
          contentFit={isCutout(item.image_path) ? 'contain' : fit}
          transition={150}
          recyclingKey={item.id}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}
