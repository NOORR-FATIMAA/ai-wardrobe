import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { DEMO_IMAGES } from '@/demo/demoImages';
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
  bare,
}: {
  item: WardrobeItem;
  size?: number;
  /** Stretch to the parent's size instead of a square. */
  fill?: boolean;
  fit?: 'cover' | 'contain';
  /** No tile behind the picture (for compositions that draw their own backdrop). */
  bare?: boolean;
}) {
  const { colors } = useTheme();
  const { imageUrls } = useAppData();
  const uri = item.image_path ? imageUrls[item.image_path] : undefined;
  // Demo mode: bundled illustrations (demo items have no photos).
  const illustration = uri ? undefined : DEMO_IMAGES[item.id];
  const icon = CATEGORIES.find((c) => c.key === item.category)?.icon ?? 'shirt-outline';
  const box = fill
    ? { flex: 1 }
    : size
      ? { width: size, height: size }
      : { width: '100%' as const, aspectRatio: 1 };

  return (
    <View
      style={[box, { borderRadius: radius.md, overflow: 'hidden', backgroundColor: bare ? 'transparent' : uri || illustration ? colors.photoTile : colors.surfaceAlt }]}
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
      ) : illustration ? (
        <Image source={illustration} style={{ flex: 1, margin: 8 }} contentFit="contain" recyclingKey={item.id} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}
