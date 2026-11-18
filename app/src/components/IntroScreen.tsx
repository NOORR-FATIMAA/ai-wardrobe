import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEMO_ITEMS } from '@/demo/demoData';
import { toLook } from '@/lib/looks';
import { fonts, radius, space, useTheme } from '@/lib/theme';
import { categoryLabel, type StylistOutfit } from '@/lib/types';
import { LookFigure } from './looks/LookFigure';
import type { Look } from './looks/types';
import { BrandMark } from './SideBar';
import { Text } from './Text';
import { Button } from './ui';

const NATIVE = Platform.OS !== 'web';

// Sample looks from the app's own demo illustrations, restyled on the stage one after another.
const SHOWCASE: { ids: number[]; label: string }[] = [
  { ids: [1, 5, 12, 15], label: 'Office · Smart casual' },
  { ids: [9, 8, 12], label: 'Dinner · Elegant' },
  { ids: [4, 6, 11], label: 'Weekend · Streetwear' },
  { ids: [3, 7, 9, 12], label: 'Winter · Classic' },
];
const CAPTIONS = ['Your style.', 'Your rules.', 'Styled by AI.', 'From your own wardrobe.'];
const CYCLE_MS = 1900;

function showcaseLooks(): Look[] {
  const byId = (id: string) => DEMO_ITEMS.find((i) => i.id === id);
  return SHOWCASE.map(({ ids, label }, index) => {
    const outfit: StylistOutfit = {
      title: label,
      occasion: label,
      item_ids: ids.map((n) => `demo-item-${String(n).padStart(2, '0')}`),
      missing_items: [],
      explanation: '',
      styling_tips: [],
      weather_note: '',
    };
    return toLook(outfit, index, byId, categoryLabel);
  });
}

/**
 * The opening of the app for a new user: the logo bursts in, then a stage where the stylist restyles
 * a figure outfit after outfit while the tagline cycles, and "Get started". Built from the app's own
 * illustrations; motion is skipped when the device asks for reduced motion.
 */
export function IntroScreen({ onStart }: { onStart: () => void }) {
  const { colors, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const looks = useMemo(() => showcaseLooks(), []);
  const [index, setIndex] = useState(0);

  // Entrance: mark → wordmark → stage → text → button.
  const [enter] = useState(() => [0, 1, 2, 3, 4].map(() => new Animated.Value(reduceMotion ? 1 : 0)));
  const [swap] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.stagger(
      180,
      enter.map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: NATIVE, friction: 7, tension: 60 })),
    ).start();
  }, [enter, reduceMotion]);

  // The styling loop: fade the figure out, change the look, fade it back in.
  useEffect(() => {
    const timer = setInterval(() => {
      if (reduceMotion) {
        setIndex((i) => (i + 1) % looks.length);
        return;
      }
      Animated.timing(swap, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }).start(() => {
        setIndex((i) => (i + 1) % looks.length);
        Animated.timing(swap, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: NATIVE }).start();
      });
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [looks.length, reduceMotion, swap]);

  const rise = (v: Animated.Value, distance = 24) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  });
  const look = looks[index];
  const figureScale = swap.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const figureX = swap.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] });

  const stage = (
    <Animated.View style={[styles.stage, { backgroundColor: colors.surface, boxShadow: colors.glow }, rise(enter[2], 40)]}>
      <Sparkles />
      <Animated.View style={{ width: '62%', opacity: swap, transform: [{ scale: figureScale }, { translateX: figureX }] }}>
        <LookFigure look={look} style={{ backgroundColor: 'transparent' }} />
      </Animated.View>
      <View style={[styles.chip, { backgroundColor: colors.text }]}>
        <Ionicons name="sparkles" size={13} color={colors.background} />
        <Text style={{ color: colors.background, fontWeight: '700', fontSize: 13 }}>{look.title}</Text>
      </View>
    </Animated.View>
  );

  const copy = (
    <View style={{ gap: space.lg, alignItems: wide ? 'flex-start' : 'center' }}>
      <Animated.View style={rise(enter[3])}>
        <Text accessibilityRole="header" style={[styles.headline, { color: colors.onPrimary, textAlign: wide ? 'left' : 'center' }, wide ? { fontSize: 64, lineHeight: 64 } : null]}>
          {CAPTIONS[index % CAPTIONS.length]}
        </Text>
        <Text style={{ color: colors.onPrimary, opacity: 0.8, fontSize: 17, lineHeight: 25, maxWidth: 420, textAlign: wide ? 'left' : 'center', marginTop: space.sm }}>
          Your personal AI stylist. Snap your clothes, pick an occasion, and see outfits worn and styled for you.
        </Text>
      </Animated.View>
      <Animated.View style={[{ alignSelf: wide ? 'flex-start' : 'stretch' }, rise(enter[4])]}>
        <Button variant="ink" icon="arrow-forward" title="Get started" onPress={onStart} style={{ minWidth: 220 }} />
      </Animated.View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }}>
      <View style={[styles.blob, { backgroundColor: colors.coral, width: 280, height: 280, top: -90, right: -80 }]} />
      <View style={[styles.blob, { backgroundColor: colors.butter, width: 180, height: 180, bottom: -50, left: -60 }]} />
      <View style={[styles.blob, { backgroundColor: colors.mint, width: 90, height: 90, top: '38%', left: '6%' }]} />

      <View style={[styles.page, wide ? styles.pageWide : null]}>
        <Animated.View
          style={[
            styles.brand,
            { opacity: enter[0], transform: [{ scale: enter[0].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
            wide ? { position: 'absolute', top: space.xl, left: space.xl } : null,
          ]}
        >
          <BrandMark size={44} inverted />
          <Animated.Text style={[styles.wordmark, { color: colors.onPrimary }, rise(enter[1], 12)]}>Wardrobe AI</Animated.Text>
        </Animated.View>

        {wide ? (
          <>
            <View style={{ flex: 1, justifyContent: 'center' }}>{copy}</View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{stage}</View>
          </>
        ) : (
          <>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' }}>{stage}</View>
            {copy}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Small sparkles drifting up around the figure while it is being styled. */
function Sparkles() {
  const { colors, reduceMotion } = useTheme();
  const [drift] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduceMotion) return;
    const loops = drift.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [drift, reduceMotion]);
  if (reduceMotion) return null;
  const spots = [
    { left: '14%', top: '58%', size: 18, color: colors.primary },
    { left: '80%', top: '40%', size: 22, color: colors.coral },
    { left: '72%', top: '72%', size: 14, color: colors.butter },
  ] as const;
  return (
    <>
      {drift.map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spots[i].left,
            top: spots[i].top,
            opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }],
          }}
        >
          <Ionicons name="sparkles" size={spots[i].size} color={spots[i].color} />
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: space.xl, gap: space.xl, alignItems: 'center' },
  pageWide: { flexDirection: 'row', maxWidth: 1180, width: '100%', alignSelf: 'center', paddingHorizontal: 64 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wordmark: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.55 },
  stage: { width: '100%', maxWidth: 360, aspectRatio: 0.78, borderRadius: radius.lg + 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chip: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  headline: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
});
