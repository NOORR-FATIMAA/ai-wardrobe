import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { fonts, radius, space, useTheme } from '@/lib/theme';
import { LookFigure } from './LookFigure';
import type { Look } from './types';

/** "All from your wardrobe" or "2 owned · +1 to shop": whether the look needs anything not owned. */
export function OwnershipBadge({ look }: { look: Look }) {
  const { colors } = useTheme();
  const shop = look.suggestedCount > 0;
  return (
    <View style={[styles.badge, { backgroundColor: shop ? colors.coralSoft : colors.mintSoft }]}>
      <Ionicons name={shop ? 'bag-add-outline' : 'checkmark-circle-outline'} size={13} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
        {shop ? `${look.ownedCount} owned · +${look.suggestedCount} to shop` : 'All from your wardrobe'}
      </Text>
    </View>
  );
}

/**
 * One look standing in the lineup: the full-body figure (mannequin, or its AI model photo) on the
 * shared studio floor, with its number and name underneath.
 */
export function OutfitPreview({
  look,
  width,
  photoUrl,
  focused,
  onOpen,
}: {
  look: Look;
  width: number;
  photoUrl?: string | null;
  focused: boolean;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Look ${look.number}, ${look.title}. ${look.occasion}. ${focused ? 'Open the look.' : 'Show this look.'}`}
      style={{ width, gap: space.sm }}
    >
      <LookFigure look={look} photoUrl={photoUrl} style={{ borderRadius: radius.lg }} />
      <View style={{ gap: 2, alignItems: 'center' }}>
        <Text style={[styles.number, { color: colors.accent }]}>LOOK {look.number}</Text>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {look.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
          {look.occasion}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  number: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.6 },
  title: { fontFamily: fonts.displaySemibold, fontSize: 17, letterSpacing: -0.2, textAlign: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
