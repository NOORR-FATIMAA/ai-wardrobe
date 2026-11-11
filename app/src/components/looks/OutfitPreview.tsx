import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import type { Look } from './types';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { LookFigure } from './LookFigure';

/** "Owns everything" or "+2 to shop": whether the look needs anything the user doesn't own. */
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

/** One look in the gallery rail: number, full-body figure, title, occasion and a one-line story. */
export function OutfitPreview({ look, width, onOpen }: { look: Look; width: number; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Look ${look.number}, ${look.title}. ${look.occasion}. Open the look.`}
      style={({ hovered }) => [styles.card, { width, backgroundColor: colors.surface }, shadowFor(colors, Boolean(hovered))]}
    >
      <View style={styles.head}>
        <Text style={[styles.number, { color: colors.accent }]}>LOOK {look.number}</Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>
          {look.occasion}
        </Text>
      </View>
      <LookFigure look={look} aspect={3 / 4} />
      <View style={{ gap: 6 }}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {look.title}
        </Text>
        {look.summary ? (
          <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {look.summary}
          </Text>
        ) : null}
        <OwnershipBadge look={look} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg + 4, padding: space.md, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: 4 },
  number: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1.6 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
