import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { useAppData } from '@/lib/data';
import { radius, space, useTheme } from '@/lib/theme';
import type { MissingItem } from '@/lib/types';
import { OutfitBoard } from './OutfitBoard';
import { OutfitInspiration } from './OutfitInspiration';
import { ShareOutfitButton } from './ShareOutfitButton';
import { Body, Card, Heading, Muted } from './ui';

export interface OutfitView {
  title: string;
  occasion?: string | null;
  item_ids: string[];
  missing_items: MissingItem[];
  explanation?: string | null;
  styling_tips: string[];
  weather_note?: string | null;
  inspiration_query?: string | null;
}

/** Shows an outfit, keeping owned items clearly separate from suggested purchases. */
export function OutfitCard({
  outfit,
  actions,
  compact,
  glow,
}: {
  outfit: OutfitView;
  actions?: ReactNode;
  /** Board and title only, for calendar and history views. */
  compact?: boolean;
  /** The lavender AI glow, for fresh suggestions. */
  glow?: boolean;
}) {
  const { colors } = useTheme();
  const { itemById } = useAppData();
  const owned = outfit.item_ids.map(itemById).filter((i) => i !== undefined);
  const removedCount = outfit.item_ids.length - owned.length;
  const shareRef = useRef<ComponentRef<typeof View>>(null);
  const [showTips, setShowTips] = useState(false);
  const tipCount = outfit.styling_tips.length + (outfit.weather_note ? 1 : 0);

  return (
    <Card glow={glow}>
      {/* The shareable part: everything in this view becomes the shared image. collapsable={false}
          keeps it a real native view on Android so it can be captured. */}
      <View ref={shareRef} collapsable={false} style={{ gap: space.md, backgroundColor: colors.surface }}>
        <View style={{ gap: 2, paddingRight: 32 }}>
          {outfit.occasion ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{outfit.occasion}</Text> : null}
          <Heading>{outfit.title}</Heading>
        </View>

        {/* Capped so a wide screen shows a lookbook-sized board, not a wall of tiles. */}
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <OutfitBoard items={owned} missing={outfit.missing_items} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          <Text style={{ fontWeight: '700' }}>You own: </Text>
          {owned.map((i) => i.name).join(' · ')}
        </Text>
      </View>
      {owned.length ? (
        <View style={styles.share}>
          <ShareOutfitButton target={shareRef} title={outfit.title} />
        </View>
      ) : null}
      {removedCount > 0 ? <Muted>{removedCount} item(s) from this outfit were removed from your wardrobe.</Muted> : null}

      {!compact && outfit.missing_items.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Would complete the look (not owned)</Text>
          {outfit.missing_items.map((m) => (
            <View key={m.name} style={[styles.missing, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="bag-add-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{m.name}</Text>
                <Muted>{m.reason}</Muted>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!compact && (
        <>
          {outfit.explanation ? <Body>{outfit.explanation}</Body> : null}
          {tipCount ? (
            <Pressable
              onPress={() => setShowTips(!showTips)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showTips }}
              hitSlop={6}
              style={[styles.row, { alignItems: 'center' }]}
            >
              <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Styling tips</Text>
              <Ionicons name={showTips ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
            </Pressable>
          ) : null}
          {showTips && outfit.weather_note ? (
            <View style={styles.row}>
              <Ionicons name="partly-sunny-outline" size={16} color={colors.textMuted} />
              <Muted style={{ flex: 1 }}>{outfit.weather_note}</Muted>
            </View>
          ) : null}
          {showTips && outfit.styling_tips.map((tip) => (
            <View key={tip} style={styles.row}>
              <Text style={{ color: colors.accent, width: 16, textAlign: 'center' }}>•</Text>
              <Muted style={{ flex: 1 }}>{tip}</Muted>
            </View>
          ))}
          {outfit.inspiration_query ? <OutfitInspiration query={outfit.inspiration_query} /> : null}
        </>
      )}

      {actions ? <View style={[styles.row, { flexWrap: 'wrap' }]}>{actions}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '600' },
  missing: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  // Over the card's top-right corner, outside the captured view, so the button is not in the image.
  share: { position: 'absolute', top: space.lg, right: space.lg },
});
