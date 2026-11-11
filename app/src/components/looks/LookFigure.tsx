import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { Text } from '@/components/Text';
import type { Look, LookItem, Zone } from './types';
import { radius, useTheme } from '@/lib/theme';

/**
 * The figure is a light photo studio in both themes (so black and navy clothes stay visible), so its
 * own marks use these fixed colours rather than the theme's, which turn light in dark mode.
 */
const STUDIO = { ink: '#252337', accent: '#6D4FD8', lavender: '#A78BFA', floor: '#D9D2EA', card: 'rgba(255, 255, 255, 0.7)', white: '#FFFFFF' };

type Box = { left: number; top: number; width: number; height: number; rotate?: number; z: number };

const ZONE_ICON: Record<Zone, ComponentProps<typeof Ionicons>['name']> = {
  outer: 'cloudy-outline', top: 'shirt-outline', onepiece: 'woman-outline', bottom: 'resize-outline',
  feet: 'footsteps-outline', accessory: 'watch-outline',
};

/**
 * Where each piece goes on the figure, in % of the figure box (3:5). A full-body arrangement: top or
 * one-piece, then bottom, then shoes down the middle; an outer layer slightly behind and to the left of
 * the top; accessories and any extra pieces floating in a column on the right.
 */
export function placePieces(items: LookItem[]): { item: LookItem; box: Box }[] {
  const byZone = (z: Zone) => items.filter((i) => i.zone === z);
  // Owned pieces take the body slot before suggestions of the same kind.
  const pick = (z: Zone) => [...byZone(z)].sort((a, b) => (a.ownership === b.ownership ? 0 : a.ownership === 'owned' ? -1 : 1));
  const used = new Set<string>();
  const out: { item: LookItem; box: Box }[] = [];
  const put = (item: LookItem | undefined, box: Box) => {
    if (!item) return;
    used.add(item.key);
    out.push({ item, box });
  };

  const onepiece = pick('onepiece')[0];
  const top = onepiece ? undefined : pick('top')[0];
  const bottom = onepiece ? undefined : pick('bottom')[0];
  const outer = pick('outer')[0];
  const feet = pick('feet')[0];
  const center = outer ? 40 : 24; // shift the body right when a layer sits beside it

  put(outer, { left: 2, top: 5, width: 50, height: 40, rotate: -5, z: 1 });
  if (onepiece) put(onepiece, { left: center - 2, top: 4, width: 56, height: 64, z: 2 });
  put(top, { left: center, top: 4, width: 52, height: 37, z: 2 });
  put(bottom, { left: center + 4, top: 41, width: 44, height: 39, z: 2 });
  put(feet, { left: center + 6, top: 81, width: 40, height: 16, z: 3 });

  // Everything else floats on the right, smallest first, at most three.
  const rest = items.filter((i) => !used.has(i.key)).slice(0, 3);
  rest.forEach((item, i) => put(item, { left: 74, top: 6 + i * 25, width: 24, height: 21, rotate: i % 2 ? 4 : -3, z: 4 }));
  return out;
}

/**
 * Full-body outfit visual built from the look's real pieces: wardrobe photos (or the demo illustrations)
 * for owned items, and dashed outlines for suggested ones, which are never shown as owned. With
 * `hotspots`, each piece gets a pulsing marker that selects it.
 */
export function LookFigure({
  look,
  hotspots,
  activeKey,
  onSelect,
  style,
  aspect = 3 / 5,
}: {
  look: Look;
  hotspots?: boolean;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  style?: ViewStyle;
  /** Width / height of the figure box; pieces are placed in % so any portrait shape works. */
  aspect?: number;
}) {
  const { colors } = useTheme();
  const pieces = placePieces(look.items);

  return (
    <View
      accessibilityLabel={`Look ${look.number}: ${look.items.map((i) => `${i.name}${i.ownership === 'suggested' ? ' (suggested, not owned)' : ''}`).join(', ')}`}
      style={[styles.figure, { aspectRatio: aspect, backgroundColor: colors.photoTile }, style]}
    >
      {/* Studio floor and a soft spotlight, so the pieces read as one standing figure. */}
      <View style={[styles.spot, { backgroundColor: colors.boardTile }]} />
      <View style={[styles.floor, { backgroundColor: STUDIO.floor }]} />

      {pieces.map(({ item, box }) => {
        const dimmed = Boolean(activeKey) && activeKey !== item.key;
        const active = activeKey === item.key;
        const pieceStyle = {
          position: 'absolute' as const,
          left: `${box.left}%` as const,
          top: `${box.top}%` as const,
          width: `${box.width}%` as const,
          height: `${box.height}%` as const,
          zIndex: active ? 10 : box.z,
          opacity: dimmed ? 0.35 : 1,
          transform: [{ rotate: `${box.rotate ?? 0}deg` }, { scale: active ? 1.04 : 1 }],
        };
        return (
          <View key={item.key} style={[pieceStyle, styles.transition]}>
            {item.ownership === 'owned' && item.wardrobeItem ? (
              <View style={styles.piece}>
                <ItemThumb item={item.wardrobeItem} fill fit="contain" bare />
              </View>
            ) : (
              <View style={[styles.piece, styles.suggested, { borderColor: STUDIO.accent, backgroundColor: STUDIO.card }]}>
                <Ionicons name={ZONE_ICON[item.zone]} size={22} color={STUDIO.accent} />
                <Text numberOfLines={2} style={{ color: STUDIO.ink, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>
                  {item.name}
                </Text>
                <Text style={{ color: STUDIO.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 }}>SUGGESTED</Text>
              </View>
            )}
            {hotspots && onSelect ? (
              <Hotspot label={`${item.name}${item.ownership === 'suggested' ? ', suggested' : ''}`} active={active} onPress={() => onSelect(item.key)} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A small pulsing marker on a garment. Pressing it selects that piece. */
function Hotspot({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label}`}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      hitSlop={14}
      style={styles.hotspot}
    >
      {reduceMotion ? null : (
        <Animated.View style={[styles.ring, { backgroundColor: STUDIO.lavender, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      )}
      <View style={[styles.dot, { backgroundColor: active ? STUDIO.accent : STUDIO.white, borderColor: STUDIO.accent }]}>
        <View style={[styles.core, { backgroundColor: active ? STUDIO.white : STUDIO.accent }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  figure: { width: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  spot: { position: 'absolute', left: '10%', right: '10%', top: '8%', bottom: '18%', borderRadius: 999, opacity: 0.55 },
  floor: { position: 'absolute', left: '22%', right: '22%', bottom: '2.5%', height: 6, borderRadius: 999, opacity: 0.6 },
  piece: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  suggested: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6 },
  transition: (Platform.OS === 'web' ? { transitionDuration: '220ms', transitionProperty: 'opacity, transform' } : {}) as ViewStyle,
  hotspot: { position: 'absolute', top: '42%', left: '50%', marginLeft: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  ring: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  core: { width: 8, height: 8, borderRadius: 4 },
});
