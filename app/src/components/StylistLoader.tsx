import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { radius, space, useTheme } from '@/lib/theme';
import { Text } from './Text';
import { Skeleton } from './ui';

const STEPS = ['Reading your wardrobe…', 'Matching colours and textures…', 'Checking the dress code…', 'Putting your looks together…'];
const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Shown while the AI stylist works (a few seconds): a pulsing sparkle, the step it is on, and a
 * skeleton of the outfit card that is coming. The steps are a friendly progress cue, not live status.
 */
export function StylistLoader() {
  const { colors, reduceMotion } = useTheme();
  const [step, setStep] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const rotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Styling. ${STEPS[step]}`} style={[styles.card, { backgroundColor: colors.surface, boxShadow: colors.glow }]}>
      <View style={styles.row}>
        <Animated.View style={[styles.orb, { backgroundColor: colors.primary, transform: [{ scale }, { rotate }] }]}>
          <Ionicons name="sparkles" size={24} color={colors.onPrimary} />
        </Animated.View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Styling you</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>{STEPS[step]}</Text>
        </View>
      </View>
      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, { backgroundColor: i <= step ? colors.accent : colors.surfaceAlt }]} />
        ))}
      </View>
      <View style={styles.board}>
        <Skeleton height={150} rounded={radius.md} style={{ flex: 2 }} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Skeleton height={71} rounded={radius.md} />
          <Skeleton height={71} rounded={radius.md} />
        </View>
      </View>
      <Skeleton width="70%" height={14} />
      <Skeleton width="45%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orb: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  board: { flexDirection: 'row', gap: space.sm },
});
