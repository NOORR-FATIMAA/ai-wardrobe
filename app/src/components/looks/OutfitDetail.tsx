import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { OutfitActions, type OutfitState } from '@/components/OutfitActions';
import { OutfitInspiration } from '@/components/OutfitInspiration';
import { Text } from '@/components/Text';
import { Button, ErrorText, FadeIn } from '@/components/ui';
import { useAppData } from '@/lib/data';
import type { Look } from './types';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { LookFigure } from './LookFigure';
import { OutfitItemsPanel } from './OutfitItemsPanel';
import { OwnershipBadge } from './OutfitPreview';
import { RoundButton } from './OutfitRail';

/** Shared between the detail and the item explorer: which suggestions are already on the shopping list. */
export interface ShoppingState {
  added: Set<string>;
  add: (look: Look, key: string) => Promise<void>;
}

/**
 * Stage 2: one look up close. Large figure with garment hotspots, the "In this look" panel (beside the
 * figure on wide screens, a bottom sheet below it on phones), the AI's reasoning, completeness, and the
 * existing save / plan / wore-it actions. Back returns to the gallery at the same look.
 */
export function OutfitDetail({
  look,
  total,
  actionState,
  onActionChange,
  requestText,
  shopping,
  onBack,
  onStep,
  onExplore,
}: {
  look: Look;
  total: number;
  actionState?: OutfitState;
  onActionChange: (state: OutfitState) => void;
  requestText?: string;
  shopping: ShoppingState;
  onBack: () => void;
  onStep: (delta: number) => void;
  onExplore: (key: string) => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1000; // the stylist column is capped; side-by-side only when there's room
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const select = (key: string) => {
    // First tap highlights a piece; tapping the same hotspot again explores it.
    if (activeKey === key) onExplore(key);
    else setActiveKey(key);
  };

  const info = (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          LOOK {look.number} · {look.occasion}
        </Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {look.title}
        </Text>
        <OwnershipBadge look={look} />
      </View>
      <OutfitItemsPanel look={look} activeKey={activeKey} onActivate={setActiveKey} onExplore={onExplore} />
      <Completeness look={look} />
      <View style={{ gap: space.sm }}>
        <OutfitActions
          key={look.index}
          outfit={look.outfit}
          requestText={requestText}
          initial={actionState}
          onChange={onActionChange}
        />
      </View>
    </View>
  );

  return (
    <FadeIn style={{ gap: space.xl }}>
      <View style={styles.topBar}>
        <Button variant="secondary" icon="grid-outline" title="All looks" onPress={onBack} style={{ minHeight: 44, paddingHorizontal: space.lg }} />
        <View style={{ flex: 1 }} />
        <RoundButton icon="chevron-back" label="Previous look" disabled={look.index === 0} onPress={() => onStep(-1)} />
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, letterSpacing: 1 }}>
          {look.number} / {String(total).padStart(2, '0')}
        </Text>
        <RoundButton icon="chevron-forward" label="Next look" disabled={look.index === total - 1} onPress={() => onStep(1)} />
      </View>

      <View style={wide ? styles.split : { gap: space.lg }}>
        <View style={wide ? { flex: 1, maxWidth: 420 } : { width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <LookFigure look={look} hotspots activeKey={activeKey} onSelect={select} style={{ boxShadow: colors.glow }} />
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: space.sm }}>
            Tap a marker to highlight a piece; tap it again to explore it.
          </Text>
        </View>
        {wide ? (
          <View style={{ flex: 1 }}>{info}</View>
        ) : (
          // Phones and tablets: the details sit in a sheet that rises from the bottom of the figure.
          <View style={[styles.sheet, { backgroundColor: colors.surface }, shadowFor(colors, true)]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {info}
          </View>
        )}
      </View>

      <WhyItWorks look={look} />
      <Suggestions look={look} shopping={shopping} onExplore={onExplore} />
      {look.inspirationQuery ? <OutfitInspiration query={look.inspirationQuery} /> : null}
    </FadeIn>
  );
}

/** How much of the core outfit the user already owns, and what is missing. */
function Completeness({ look }: { look: Look }) {
  const { colors } = useTheme();
  const pct = Math.round(look.completeness * 100);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Outfit completeness</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>
          {look.ownedCount} from your wardrobe{look.suggestedCount ? ` · ${look.suggestedCount} suggested` : ''}
        </Text>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 18 }}>{pct}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct === 100 ? colors.mint : colors.primary }]} />
      </View>
    </View>
  );
}

/** The AI's explanation, weather fit and styling tips. */
function WhyItWorks({ look }: { look: Look }) {
  const { colors } = useTheme();
  if (!look.explanation && !look.weatherNote && !look.tips.length) return null;
  return (
    <View style={[styles.block, { backgroundColor: colors.surface }, shadowFor(colors)]}>
      <Text style={[styles.blockTitle, { color: colors.text }]}>Why it works</Text>
      {look.explanation ? <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{look.explanation}</Text> : null}
      {look.weatherNote ? (
        <View style={styles.line}>
          <Ionicons name="partly-sunny-outline" size={17} color={colors.accent} />
          <Text style={{ color: colors.textMuted, flex: 1, lineHeight: 20 }}>{look.weatherNote}</Text>
        </View>
      ) : null}
      {look.tips.map((tip) => (
        <View key={tip} style={styles.line}>
          <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
          <Text style={{ color: colors.textMuted, flex: 1, lineHeight: 20 }}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

/** Pieces the user doesn't own, each with the existing "add to shopping list" action. */
function Suggestions({ look, shopping, onExplore }: { look: Look; shopping: ShoppingState; onExplore: (key: string) => void }) {
  const { colors } = useTheme();
  const { demoActive } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const suggested = look.items.filter((i) => i.ownership === 'suggested');
  if (!suggested.length) return null;
  return (
    <View style={[styles.block, { backgroundColor: colors.coralSoft }]}>
      <Text style={[styles.blockTitle, { color: colors.text }]}>To complete this look</Text>
      <Text style={{ color: colors.text, opacity: 0.8 }}>
        These pieces aren&apos;t in your wardrobe. They&apos;re ideas, not products: add them to your shopping list to look for them later.
      </Text>
      {suggested.map((item) => {
        const added = shopping.added.has(`${look.index}:${item.key}`);
        return (
          <View key={item.key} style={[styles.suggestRow, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              {item.suggestion?.reason ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{item.suggestion.reason}</Text> : null}
            </View>
            <Button variant="ghost" title="Explore" onPress={() => onExplore(item.key)} style={{ minHeight: 40, paddingHorizontal: space.md }} />
            {demoActive ? null : (
              <Button
                variant={added ? 'secondary' : 'primary'}
                icon={added ? 'checkmark' : 'bag-add-outline'}
                title={added ? 'On your list' : 'Add to list'}
                disabled={added}
                onPress={() => shopping.add(look, item.key).catch((e) => setError((e as Error).message))}
                style={{ minHeight: 40, paddingHorizontal: space.md }}
              />
            )}
          </View>
        );
      })}
      {demoActive ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>The shopping list needs a real account, so it isn&apos;t available in demo mode.</Text> : null}
      <ErrorText message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  split: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  eyebrow: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  sheet: { borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8, borderRadius: radius.lg, padding: space.lg, paddingTop: space.md, gap: space.md, marginTop: -space.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  block: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  blockTitle: { fontFamily: fonts.displaySemibold, fontSize: 20, letterSpacing: -0.3 },
  line: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, flexWrap: 'wrap' },
});
