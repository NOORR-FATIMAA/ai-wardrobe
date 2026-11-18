import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { BrandMark } from './SideBar';

const NATIVE = Platform.OS !== 'web';

/**
 * Shown while the app starts (session, profile and fonts loading): the brand mark pops in on the
 * lavender background and gently breathes, with three loading dots. No text, so it looks right even
 * before the fonts have loaded.
 */
export function Splash() {
  const { colors, reduceMotion } = useTheme();
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [breathe] = useState(() => new Animated.Value(0));
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 70, useNativeDriver: NATIVE }).start();
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
          Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        ]),
      ),
      ...dots.map((d, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 160),
            Animated.timing(d, { toValue: 1, duration: 360, useNativeDriver: NATIVE }),
            Animated.timing(d, { toValue: 0.3, duration: 360, useNativeDriver: NATIVE }),
            Animated.delay((2 - i) * 160),
          ]),
        ),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pop, breathe, dots, reduceMotion]);

  const scale = Animated.multiply(
    pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
  );
  return (
    <View accessibilityLabel="Wardrobe AI is loading" style={[styles.page, { backgroundColor: colors.primary }]}>
      <View style={[styles.blob, { backgroundColor: colors.coral, width: 220, height: 220, top: -60, right: -60 }]} />
      <View style={[styles.blob, { backgroundColor: colors.butter, width: 160, height: 160, bottom: -40, left: -40 }]} />
      <Animated.View style={{ opacity: pop, transform: [{ scale }] }}>
        <BrandMark size={92} inverted />
      </Animated.View>
      <View style={styles.dots}>
        {dots.map((d, i) => (
          <Animated.View key={i} style={[styles.dot, { backgroundColor: colors.onPrimary, opacity: d }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.5 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
