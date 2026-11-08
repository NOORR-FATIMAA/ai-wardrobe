import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppData } from '@/lib/data';
import { radius, space, useTheme } from '@/lib/theme';
import type { MissingItem } from '@/lib/types';
import { OutfitBoard } from './OutfitBoard';
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
}

/** Shows an outfit, keeping owned items clearly separate from suggested purchases. */
export function OutfitCard({
  outfit,
  actions,
  compact,
}: {
  outfit: OutfitView;
  actions?: ReactNode;
  /** Board and title only, for calendar and history views. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { itemById } = useAppData();
  const owned = outfit.item_ids.map(itemById).filter((i) => i !== undefined);
  const removedCount = outfit.item_ids.length - owned.length;
  const shareRef = useRef<ComponentRef<typeof View>>(null);

  return (
    <Card>
      {/* The shareable part: everything in this view becomes the shared image. collapsable={false}
          keeps it a real native view on Android so it can be captured. */}
      <View ref={shareRef} collapsable={false} style={{ gap: space.md, backgroundColor: colors.surface }}>
        <View style={{ gap: 2, paddingRight: 32 }}>
          {outfit.occasion ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{outfit.occasion}</Text> : null}
          <Heading>{outfit.title}</Heading>
        </View>

        <OutfitBoard items={owned} missing={outfit.missing_items} />
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
          {outfit.weather_note ? (
            <View style={styles.row}>
              <Ionicons name="partly-sunny-outline" size={16} color={colors.textMuted} />
              <Muted style={{ flex: 1 }}>{outfit.weather_note}</Muted>
            </View>
          ) : null}
          {outfit.styling_tips.map((tip) => (
            <View key={tip} style={styles.row}>
              <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
              <Muted style={{ flex: 1 }}>{tip}</Muted>
            </View>
          ))}
        </>
      )}

      {actions ? <View style={[styles.row, { flexWrap: 'wrap' }]}>{actions}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  missing: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  // Over the card's top-right corner, outside the captured view, so the button is not in the image.
  share: { position: 'absolute', top: space.lg, right: space.lg },
});
