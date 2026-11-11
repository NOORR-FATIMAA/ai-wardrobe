import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { pinterestSearchUrl } from '@/components/OutfitInspiration';
import { Text } from '@/components/Text';
import { Button, ErrorText, FadeIn } from '@/components/ui';
import { DEMO_IMAGES } from '@/demo/demoImages';
import { useAppData } from '@/lib/data';
import { isCutout } from '@/lib/images';
import { looksWithItem } from '@/lib/looks';
import type { Look, LookItem, Zone } from './types';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import type { ShoppingState } from './OutfitDetail';
import { PieceThumb, useSizeFor } from './OutfitItemsPanel';
import { RoundButton } from './OutfitRail';

const WEB = Platform.OS === 'web';
const FORMALITY = ['', 'Very casual', 'Casual', 'Smart casual', 'Formal', 'Black tie'];
const ZONE_ICON: Record<Zone, ComponentProps<typeof Ionicons>['name']> = {
  outer: 'cloudy-outline', top: 'shirt-outline', onepiece: 'woman-outline', bottom: 'resize-outline',
  feet: 'footsteps-outline', accessory: 'watch-outline',
};

/** The sentence of the AI's explanation that mentions this piece, else the look's summary. */
function fitNote(look: Look, item: LookItem) {
  const words = item.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const sentences = look.explanation.match(/[^.!?]+[.!?]?/g) ?? [];
  return sentences.find((s) => words.some((w) => s.toLowerCase().includes(w)))?.trim() || look.summary;
}

/**
 * Stage 3: one piece up close. Owned pieces show their wardrobe details, the other looks that use them
 * and a link to the wardrobe; suggested pieces show why the AI picked them, the look they complete, the
 * user's size and the existing shopping-list action. Swipe, the arrows or the strip switch pieces.
 */
export function ItemExplorer({
  look,
  looks,
  initialKey,
  shopping,
  onBack,
  onOpenLook,
}: {
  look: Look;
  looks: Look[];
  initialKey: string;
  shopping: ShoppingState;
  onBack: () => void;
  onOpenLook: (index: number) => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [key, setKey] = useState(initialKey);
  const position = Math.max(0, look.items.findIndex((i) => i.key === key));
  const item = look.items[position];
  const step = (delta: number) => {
    const next = look.items[position + delta];
    if (next) setKey(next.key);
  };

  // Touch swipe between pieces.
  const [touchX, setTouchX] = useState<number | null>(null);

  if (!item) return null;
  return (
    <FadeIn style={{ gap: space.xl }}>
      <View style={styles.topBar}>
        <Button variant="secondary" icon="arrow-back" title={`Back to look ${look.number}`} onPress={onBack} style={{ minHeight: 44, paddingHorizontal: space.lg }} />
        <View style={{ flex: 1 }} />
        <RoundButton icon="chevron-back" label="Previous piece" disabled={position === 0} onPress={() => step(-1)} />
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, letterSpacing: 1 }}>
          {position + 1} / {look.items.length}
        </Text>
        <RoundButton icon="chevron-forward" label="Next piece" disabled={position === look.items.length - 1} onPress={() => step(1)} />
      </View>

      <View style={wide ? styles.split : { gap: space.xl }}>
        <View
          style={wide ? { flex: 1 } : null}
          onTouchStart={(e) => setTouchX(e.nativeEvent.pageX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.nativeEvent.pageX - touchX;
            setTouchX(null);
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          <FloatingPiece key={item.key} item={item} />
        </View>
        <FadeIn key={`info-${item.key}`} style={[{ gap: space.lg }, wide ? { flex: 1 } : null]}>
          <Details item={item} look={look} looks={looks} shopping={shopping} onOpenLook={onOpenLook} />
        </FadeIn>
      </View>

      <ThumbnailStrip items={look.items} activeKey={item.key} onPick={setKey} />
    </FadeIn>
  );
}

/** The large picture: floats gently and, with a mouse, tilts towards the pointer. */
function FloatingPiece({ item }: { item: LookItem }) {
  const { colors, reduceMotion } = useTheme();
  const { imageUrls } = useAppData();
  const [float] = useState(() => new Animated.Value(0));
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: !WEB }),
        Animated.timing(float, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: !WEB }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reduceMotion]);

  const wardrobe = item.wardrobeItem;
  const uri = wardrobe?.image_path ? imageUrls[wardrobe.image_path] : undefined;
  const illustration = wardrobe && !uri ? DEMO_IMAGES[wardrobe.id] : undefined;
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <View
      style={[styles.stage, { backgroundColor: colors.surfaceAlt }]}
      // Pointer tilt (web and devices with a mouse); skipped with reduced motion.
      onPointerMove={(e) => {
        if (reduceMotion || !WEB) return;
        const target = e.currentTarget as unknown as HTMLElement;
        const rect = target.getBoundingClientRect?.();
        if (!rect) return;
        const ne = e.nativeEvent as unknown as { clientX: number; clientY: number };
        setTilt({ x: ((ne.clientY - rect.top) / rect.height - 0.5) * -10, y: ((ne.clientX - rect.left) / rect.width - 0.5) * 12 });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <View style={[styles.halo, { backgroundColor: item.ownership === 'owned' ? colors.primary : colors.coral }]} />
      <Animated.View
        style={[
          styles.floater,
          { transform: [{ perspective: 900 }, { translateY }, { rotateX: `${tilt.x}deg` }, { rotateY: `${tilt.y}deg` }] },
          WEB ? ({ transition: 'transform 180ms ease-out' } as object) : null,
        ]}
      >
        <View style={[styles.card, { backgroundColor: colors.photoTile }, shadowFor(colors, true)]}>
          {uri ? (
            <Image source={{ uri }} style={{ flex: 1, margin: isCutout(wardrobe?.image_path ?? null) ? 16 : 0 }} contentFit={isCutout(wardrobe?.image_path ?? null) ? 'contain' : 'cover'} transition={200} />
          ) : illustration ? (
            <Image source={illustration} style={{ flex: 1, margin: 24 }} contentFit="contain" transition={200} />
          ) : (
            <View style={[styles.placeholder, { borderColor: colors.accent }]}>
              <Ionicons name={item.ownership === 'suggested' ? 'bag-add-outline' : ZONE_ICON[item.zone]} size={64} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '700', letterSpacing: 1, fontSize: 12 }}>
                {item.ownership === 'suggested' ? 'SUGGESTED · NO PHOTO' : 'NO PHOTO YET'}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function Details({
  item,
  look,
  looks,
  shopping,
  onOpenLook,
}: {
  item: LookItem;
  look: Look;
  looks: Look[];
  shopping: ShoppingState;
  onOpenLook: (index: number) => void;
}) {
  const { colors } = useTheme();
  const { demoActive } = useAppData();
  const size = useSizeFor(item);
  const [error, setError] = useState<string | null>(null);
  const w = item.wardrobeItem;
  const owned = item.ownership === 'owned';
  const facts = owned && w
    ? [
        item.category,
        ...w.colors.slice(0, 3),
        w.material,
        w.pattern,
        w.formality ? FORMALITY[Math.round(w.formality)] : null,
        ...w.seasons.slice(0, 2),
      ].filter((f): f is string => Boolean(f))
    : [item.category, size ? `Your size ${size}` : null].filter((f): f is string => Boolean(f));
  const others = owned && w ? looksWithItem(looks, w.id, look.index) : [];
  const added = shopping.added.has(`${look.index}:${item.key}`);

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Text style={[styles.eyebrow, { color: owned ? colors.accent : colors.danger }]}>
          {owned ? 'From your wardrobe' : 'Suggested · not owned'}
        </Text>
        <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
          {item.name}
        </Text>
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f} style={[styles.fact, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{f}</Text>
            </View>
          ))}
        </View>
        {owned && w ? (
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            {w.times_worn ? `Worn ${w.times_worn} time${w.times_worn === 1 ? '' : 's'}` : 'Not worn yet'}
            {w.last_worn_at ? ` · last on ${w.last_worn_at.slice(0, 10)}` : ''}
          </Text>
        ) : null}
      </View>

      <View style={[styles.block, { backgroundColor: colors.surface }, shadowFor(colors)]}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>
          {owned ? `In look ${look.number}: ${look.title}` : `Why the stylist suggested it`}
        </Text>
        <Text style={{ color: colors.textMuted, lineHeight: 21 }}>
          {owned ? fitNote(look, item) : item.suggestion?.reason || 'It completes this look.'}
        </Text>
        {!owned ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Completes look {look.number}: {look.title}
          </Text>
        ) : null}
      </View>

      {owned && w ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Also styled in</Text>
          {others.length ? (
            others.map((o) => (
              <Pressable
                key={o.index}
                onPress={() => onOpenLook(o.index)}
                accessibilityRole="button"
                accessibilityLabel={`Open look ${o.number}, ${o.title}`}
                style={({ hovered }) => [styles.otherLook, { backgroundColor: hovered ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 13, letterSpacing: 1 }}>LOOK {o.number}</Text>
                <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{o.title}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          ) : (
            <Text style={{ color: colors.textMuted }}>Only in this look for now. Ask for different outfits to see it styled another way.</Text>
          )}
          {demoActive ? null : (
            <Button
              variant="secondary"
              icon="shirt-outline"
              title="View in your wardrobe"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: w.id } })}
            />
          )}
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {demoActive ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>The shopping list needs a real account, so it isn&apos;t available in demo mode.</Text>
          ) : (
            <Button
              variant={added ? 'secondary' : 'primary'}
              icon={added ? 'checkmark' : 'bag-add-outline'}
              title={added ? 'On your shopping list' : 'Add to shopping list'}
              disabled={added}
              onPress={() => shopping.add(look, item.key).catch((e) => setError((e as Error).message))}
            />
          )}
          <Button
            variant="ghost"
            icon="logo-pinterest"
            title="Ideas on Pinterest"
            onPress={() => void Linking.openURL(pinterestSearchUrl(item.name)).catch(() => undefined)}
          />
          <ErrorText message={error} />
        </View>
      )}
    </>
  );
}

/** Every piece in the look; the current one is outlined. */
function ThumbnailStrip({ items, activeKey, onPick }: { items: LookItem[]; activeKey: string; onPick: (key: string) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {items.map((i) => {
        const active = i.key === activeKey;
        return (
          <Pressable
            key={i.key}
            onPress={() => onPick(i.key)}
            accessibilityRole="button"
            accessibilityLabel={`${i.name}${i.ownership === 'suggested' ? ', suggested' : ''}`}
            accessibilityState={{ selected: active }}
            style={({ hovered }) => [
              styles.thumb,
              { borderColor: active ? colors.text : 'transparent', opacity: active || hovered ? 1 : 0.6, transform: [{ scale: active ? 1 : 0.94 }] },
            ]}
          >
            <PieceThumb item={i} size={64} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  split: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  stage: { borderRadius: radius.lg + 8, aspectRatio: 1, maxHeight: 520, width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  halo: { position: 'absolute', width: '62%', aspectRatio: 1, borderRadius: 999, opacity: 0.35 },
  floater: { width: '64%', aspectRatio: 0.9 },
  card: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  placeholder: { flex: 1, margin: 16, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  eyebrow: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },
  name: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  block: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  otherLook: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  strip: { gap: space.sm, paddingVertical: 4, paddingHorizontal: 2 },
  thumb: { borderWidth: 2, borderRadius: radius.md + 2, padding: 2 },
});
