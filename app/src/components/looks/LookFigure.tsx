import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import { useAppData } from '@/lib/data';
import { useTheme } from '@/lib/theme';
import type { Look, LookItem, Zone } from './types';

/**
 * The figure is a light photo studio in both themes (so black and navy clothes stay visible), so its
 * own marks use these fixed colours rather than the theme's, which turn light in dark mode.
 */
const STUDIO = {
  backdrop: '#F3F1F6',
  floor: '#E4E0EA',
  shadow: 'rgba(37, 35, 55, 0.16)',
  body: '#E6E0D8',
  bodyShade: '#DAD3C9',
  ink: '#252337',
  accent: '#6D4FD8',
  lavender: '#A78BFA',
  card: 'rgba(255, 255, 255, 0.72)',
  white: '#FFFFFF',
};

/** Width / height of the mannequin figure and of the AI model photo (generated at 3:4). */
export const MANNEQUIN_ASPECT = 0.48;
export const PHOTO_ASPECT = 3 / 4;

type Build = 'm' | 'f' | 'n';
type Box = { left: number; top: number; width: number; height: number; z: number };

const ZONE_ICON: Record<Zone, ComponentProps<typeof Ionicons>['name']> = {
  outer: 'cloudy-outline', top: 'shirt-outline', onepiece: 'woman-outline', bottom: 'resize-outline',
  feet: 'footsteps-outline', accessory: 'watch-outline',
};

/** Shoulder and hip widths (% of the figure width) for the "Dress me in" choice. */
const BUILD: Record<Build, { shoulders: number; hips: number; leg: number; scale: number }> = {
  m: { shoulders: 40, hips: 30, leg: 12.5, scale: 1.04 },
  f: { shoulders: 33, hips: 35, leg: 11.5, scale: 0.96 },
  n: { shoulders: 36, hips: 32, leg: 12, scale: 1 },
};

/**
 * A square garment box, in % of the figure, from figure-width units (the figure is 1 wide and
 * 1 / MANNEQUIN_ASPECT tall). Clothing pictures are roughly square with the garment in the middle,
 * so square boxes keep each piece at its natural proportions.
 */
function square(centerX: number, top: number, side: number, z: number): Box {
  return { left: (centerX - side / 2) * 100, top: top * MANNEQUIN_ASPECT * 100, width: side * 100, height: side * MANNEQUIN_ASPECT * 100, z };
}

/**
 * "Ghost mannequin" dressing: each piece is drawn at its natural proportions, overlapping from the
 * shoulders to the floor so the clothes form one standing figure: top (or a one-piece) from the
 * shoulders, the bottom from the waist, shoes at the floor, an outer layer larger and behind the top
 * (so it reads as open over it), and accessories at the hands. Owned pieces take a slot before
 * suggestions; extra pieces go to free accessory slots. Sizes are in figure-width units.
 */
export function dressMannequin(items: LookItem[], build: Build): { item: LookItem; box: Box }[] {
  const s = BUILD[build].scale;
  const byOwnership = (a: LookItem, c: LookItem) => (a.ownership === c.ownership ? 0 : a.ownership === 'owned' ? -1 : 1);
  const pick = (z: Zone) => items.filter((i) => i.zone === z).sort(byOwnership)[0];
  const onepiece = pick('onepiece');
  const outer = pick('outer');
  const top = onepiece ? undefined : pick('top');
  const bottom = onepiece ? undefined : pick('bottom');
  const feet = pick('feet');

  const out: { item: LookItem; box: Box }[] = [];
  const used = new Set<string>();
  const put = (item: LookItem | undefined, box: Box) => {
    if (!item) return;
    used.add(item.key);
    out.push({ item, box });
  };
  // The figure is 1 wide and about 2.08 tall; the floor line is at about 1.9.
  put(outer, square(0.5, 0.15, 0.96 * s, 2));
  // Under an open outer layer the top sits a little smaller, like a shirt under a jacket.
  put(top, square(0.5, 0.2, (outer ? 0.7 : 0.8) * s, 3));
  put(onepiece, square(0.5, 0.18, 1.0 * s, 3));
  put(bottom, square(0.5, 0.72, 1.05 * s, 1));
  put(feet, square(0.5, 1.5, 0.56, 4));
  // A belt goes round the waist, over the top of the bottom (or a one-piece).
  const belt = items.find((i) => !used.has(i.key) && i.zone === 'accessory' && /belt/i.test(`${i.name} ${i.category}`));
  put(belt, square(0.5, onepiece ? 0.66 : 0.72, 0.5 * s, 4));

  const slots: Box[] = [
    square(0.85, 0.72, 0.3, 5),
    square(0.15, 0.72, 0.3, 5),
    square(0.85, 0.3, 0.3, 5),
    square(0.15, 0.3, 0.3, 5),
  ];
  items.filter((i) => !used.has(i.key)).slice(0, slots.length).forEach((item, i) => put(item, slots[i]));
  return out;
}

/**
 * Marker position on the mannequin: the middle of the piece, except an outer layer's, which sits on
 * its side because the top underneath has its marker in the middle of the chest.
 */
function mannequinSpot(zone: Zone, box: Box): ViewStyle {
  if (zone === 'outer') return { left: `${box.left + box.width * 0.2}%`, top: `${box.top + box.height * 0.55}%` };
  return { left: `${box.left + box.width / 2}%`, top: `${box.top + box.height * (zone === 'top' || zone === 'onepiece' ? 0.42 : 0.5)}%` };
}

/** Approximate hotspot positions (% of the photo) for a standing full-body model photo. */
const PHOTO_SPOT: Record<Zone, { x: number; y: number }> = {
  outer: { x: 36, y: 33 }, top: { x: 52, y: 30 }, onepiece: { x: 50, y: 42 },
  bottom: { x: 50, y: 63 }, feet: { x: 46, y: 92 }, accessory: { x: 68, y: 50 },
};

/** The figure's body build from the user's "Dress me in" choice. */
function useBuild(): Build {
  const { profile } = useAppData();
  return profile?.style_direction === 'menswear' ? 'm' : profile?.style_direction === 'womenswear' ? 'f' : 'n';
}

/**
 * Full-body look: an illustrated mannequin dressed in the look's real pieces (wardrobe photos, demo
 * illustrations, or dashed outlines for suggested pieces), or, when `photoUrl` is given, the AI model
 * photo of the look. With `hotspots`, each piece gets a pulsing marker that selects it; the selected
 * piece shows its name.
 */
export function LookFigure({
  look,
  photoUrl,
  hotspots,
  activeKey,
  onSelect,
  style,
}: {
  look: Look;
  /** A generated model photo of this look; replaces the mannequin. */
  photoUrl?: string | null;
  hotspots?: boolean;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  style?: ViewStyle;
}) {
  const build = useBuild();
  const description = `Look ${look.number}: ${look.items.map((i) => `${i.name}${i.ownership === 'suggested' ? ' (suggested, not owned)' : ''}`).join(', ')}`;

  if (photoUrl) {
    // Several pieces in one zone (e.g. two accessories) get staggered markers.
    const seen: Partial<Record<Zone, number>> = {};
    return (
      <View accessibilityLabel={`AI model photo. ${description}`} style={[styles.figure, { aspectRatio: PHOTO_ASPECT, backgroundColor: STUDIO.backdrop }, style]}>
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        <View style={styles.aiTag}>
          <Ionicons name="sparkles" size={11} color={STUDIO.white} />
          <Text style={{ color: STUDIO.white, fontSize: 11, fontWeight: '700' }}>AI preview · not an exact fit</Text>
        </View>
        {hotspots && onSelect
          ? look.items.map((item) => {
              const n = (seen[item.zone] = (seen[item.zone] ?? -1) + 1);
              const spot = PHOTO_SPOT[item.zone];
              return (
                <Hotspot
                  key={item.key}
                  item={item}
                  active={activeKey === item.key}
                  onPress={() => onSelect(item.key)}
                  style={{ left: `${Math.min(92, spot.x + n * 9)}%`, top: `${Math.min(95, spot.y + n * 6)}%` }}
                />
              );
            })
          : null}
      </View>
    );
  }

  const pieces = dressMannequin(look.items, build);
  return (
    <View accessibilityLabel={description} style={[styles.figure, { aspectRatio: MANNEQUIN_ASPECT, backgroundColor: STUDIO.backdrop }, style]}>
      <View style={[styles.floor, { backgroundColor: STUDIO.floor }]} />
      <View style={[styles.shadow, { backgroundColor: STUDIO.shadow }]} />
      <Mannequin build={build} />

      {pieces.map(({ item, box }) => {
        const dimmed = Boolean(activeKey) && activeKey !== item.key;
        const active = activeKey === item.key;
        return (
          <View
            key={item.key}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: `${box.left}%`,
                top: `${box.top}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                zIndex: active ? 10 : box.z,
                opacity: dimmed ? 0.3 : 1,
                transform: [{ scale: active ? 1.04 : 1 }],
              },
              styles.transition,
            ]}
          >
            {item.ownership === 'owned' && item.wardrobeItem ? (
              <ItemThumb item={item.wardrobeItem} fill fit="contain" bare />
            ) : (
              <View style={[styles.suggested, { borderColor: STUDIO.accent, backgroundColor: STUDIO.card }]}>
                <Ionicons name={ZONE_ICON[item.zone]} size={18} color={STUDIO.accent} />
                <Text numberOfLines={2} style={{ color: STUDIO.ink, fontSize: 10, fontWeight: '600', textAlign: 'center' }}>
                  {item.name}
                </Text>
                <Text style={{ color: STUDIO.accent, fontSize: 8, fontWeight: '700', letterSpacing: 0.6 }}>SUGGESTED</Text>
              </View>
            )}
          </View>
        );
      })}

      {hotspots && onSelect
        ? pieces.map(({ item, box }) => (
            <Hotspot
              key={`spot-${item.key}`}
              item={item}
              active={activeKey === item.key}
              onPress={() => onSelect(item.key)}
              style={mannequinSpot(item.zone, box)}
            />
          ))
        : null}
    </View>
  );
}

/** A neutral studio mannequin drawn with simple shapes; proportions follow the build. */
function Mannequin({ build }: { build: Build }) {
  const b = BUILD[build];
  const half = b.shoulders / 2;
  const part = (s: ViewStyle, shade = false): ViewStyle => ({ position: 'absolute', backgroundColor: shade ? STUDIO.bodyShade : STUDIO.body, ...s });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.7 }]}>
      {/* Arms (behind the torso) */}
      <View style={part({ left: `${50 - half - 7}%`, top: '13.5%', width: '8.5%', height: '30%', borderRadius: 999, transform: [{ rotate: '6deg' }] }, true)} />
      <View style={part({ left: `${50 + half - 1.5}%`, top: '13.5%', width: '8.5%', height: '30%', borderRadius: 999, transform: [{ rotate: '-6deg' }] }, true)} />
      {/* Legs */}
      <View style={part({ left: `${50 - b.leg - 0.8}%`, top: '43%', width: `${b.leg}%`, height: '46.5%', borderRadius: 999 }, true)} />
      <View style={part({ left: '50.8%', top: '43%', width: `${b.leg}%`, height: '46.5%', borderRadius: 999 }, true)} />
      {/* Hips, torso, neck, head */}
      <View style={part({ left: `${50 - b.hips / 2}%`, top: '35%', width: `${b.hips}%`, height: '11%', borderRadius: 30 })} />
      <View style={part({ left: `${50 - half}%`, top: '12.5%', width: `${b.shoulders}%`, height: '26%', borderTopLeftRadius: 40, borderTopRightRadius: 40, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 })} />
      <View style={part({ left: '46.5%', top: '9.2%', width: '7%', height: '4.5%', borderRadius: 6 }, true)} />
      <View style={part({ left: '42%', top: '1.8%', width: '16%', height: '8.6%', borderRadius: 999 })} />
    </View>
  );
}

/** A pulsing marker on a garment; selected, it shows the piece's name. */
function Hotspot({ item, active, onPress, style }: { item: LookItem; active: boolean; onPress: () => void; style: ViewStyle }) {
  const { reduceMotion } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const label = `${item.name}${item.ownership === 'suggested' ? ', suggested' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label}`}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      hitSlop={14}
      style={[styles.hotspot, style]}
    >
      {reduceMotion ? null : (
        <Animated.View style={[styles.ring, { backgroundColor: STUDIO.lavender, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      )}
      <View style={[styles.dot, { backgroundColor: active ? STUDIO.accent : STUDIO.white, borderColor: STUDIO.accent }]}>
        <View style={[styles.core, { backgroundColor: active ? STUDIO.white : STUDIO.accent }]} />
      </View>
      {active ? (
        <View style={[styles.pill, { backgroundColor: STUDIO.white }]}>
          <Text numberOfLines={1} style={{ color: STUDIO.ink, fontSize: 11, fontWeight: '600' }}>
            {item.name}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  figure: { width: '100%', borderRadius: 24, overflow: 'hidden' },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '9%' },
  shadow: { position: 'absolute', left: '28%', right: '28%', bottom: '4.2%', height: '2.4%', borderRadius: 999 },
  suggested: { flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  transition: (Platform.OS === 'web' ? { transitionDuration: '220ms', transitionProperty: 'opacity, transform' } : {}) as ViewStyle,
  aiTag: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(37, 35, 55, 0.72)' },
  hotspot: { position: 'absolute', marginLeft: -12, marginTop: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  ring: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  core: { width: 8, height: 8, borderRadius: 4 },
  pill: { position: 'absolute', left: 26, top: 1, maxWidth: 160, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, boxShadow: '0 2px 8px rgba(37,35,55,0.18)' },
});
