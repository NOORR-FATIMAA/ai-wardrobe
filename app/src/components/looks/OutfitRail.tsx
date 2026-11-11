import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import type { Look } from './types';
import { radius, space, useTheme } from '@/lib/theme';
import { OutfitPreview } from './OutfitPreview';

const GAP = space.lg;
const WEB = Platform.OS === 'web';

/**
 * Horizontal, snapping rail of looks. The centred look is full size; its neighbours shrink and fade.
 * Touch swipe and trackpad scrolling are native; on the web it also supports mouse drag, the mouse
 * wheel and the arrow keys (`keyboard`). `initialIndex` restores the position when coming back.
 */
export function OutfitRail({
  looks,
  width,
  initialIndex = 0,
  onIndexChange,
  onOpen,
  keyboard = true,
}: {
  looks: Look[];
  /** Width available to the rail. */
  width: number;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onOpen: (look: Look) => void;
  keyboard?: boolean;
}) {
  const { colors, reduceMotion } = useTheme();
  const cardWidth = Math.min(340, Math.max(240, width * 0.72));
  const interval = cardWidth + GAP;
  const sidePad = Math.max(0, (width - cardWidth) / 2);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [scrollX] = useState(() => new Animated.Value(initialIndex * interval));
  const [index, setIndex] = useState(initialIndex);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(looks.length - 1, next));
      scrollRef.current?.scrollTo({ x: clamped * interval, animated: !reduceMotion });
    },
    [interval, looks.length, reduceMotion],
  );

  // Restore the remembered position (also after a resize changes the card width).
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollTo({ x: initialIndex * interval, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  // Web: arrow keys, vertical mouse wheel as horizontal movement, and mouse drag with snapping.
  useEffect(() => {
    if (!WEB) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement })?.getScrollableNode?.();
    if (!node) return;
    let snapTimer: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => goTo(Math.round(node.scrollLeft / interval)), 140);
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // trackpads scroll sideways natively
      const atStart = node.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = node.scrollLeft >= node.scrollWidth - node.clientWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // let the page scroll past the ends
      e.preventDefault();
      node.scrollLeft += e.deltaY;
      snap();
    };
    let drag: { x: number; left: number } | null = null;
    // Set when the last press turned into a drag, so the click that ends it doesn't open a look.
    let dragged = false;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, left: node.scrollLeft };
      dragged = false;
      node.style.scrollSnapType = 'none'; // snapping fights a manual drag; restored on release
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) dragged = true;
      node.scrollLeft = drag.left - dx;
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      node.style.scrollSnapType = 'x mandatory';
      if (dragged) snap();
    };
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!keyboard) return;
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.round(node.scrollLeft / interval) + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.round(node.scrollLeft / interval) - 1); }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    node.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(snapTimer);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      node.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [goTo, interval, keyboard]);

  const progress = looks.length > 1 ? (index + 1) / looks.length : 1;

  return (
    <View style={{ gap: space.lg }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: sidePad, gap: GAP, paddingVertical: space.lg }}
        style={WEB ? ({ scrollSnapType: 'x mandatory', cursor: 'grab' } as object) : null}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: !WEB,
          listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const next = Math.max(0, Math.min(looks.length - 1, Math.round(e.nativeEvent.contentOffset.x / interval)));
            if (next !== index) {
              setIndex(next);
              onIndexChange?.(next);
            }
          },
        })}
      >
        {looks.map((look, i) => {
          const range = [(i - 1) * interval, i * interval, (i + 1) * interval];
          const scale = reduceMotion ? 1 : scrollX.interpolate({ inputRange: range, outputRange: [0.88, 1, 0.88], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={look.index}
              style={[
                { opacity, transform: [{ scale }] },
                WEB ? ({ scrollSnapAlign: 'center', filter: i === index || reduceMotion ? 'none' : 'blur(1px)', transition: 'filter 250ms' } as object) : null,
              ]}
            >
              <OutfitPreview look={look} width={cardWidth} onOpen={() => (i === index ? onOpen(look) : goTo(i))} />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      {looks.length > 1 ? (
        <View style={styles.controls}>
          <RoundButton icon="arrow-back" label="Previous look" disabled={index === 0} onPress={() => goTo(index - 1)} />
          <View style={{ flex: 1, gap: 6, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, letterSpacing: 1 }} accessibilityLiveRegion="polite">
              {String(index + 1).padStart(2, '0')} / {String(looks.length).padStart(2, '0')}
            </Text>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
            </View>
          </View>
          <RoundButton icon="arrow-forward" label="Next look" disabled={index === looks.length - 1} onPress={() => goTo(index + 1)} />
        </View>
      ) : null}
    </View>
  );
}

/** Black (ink) pill-style round control, per the editorial direction; disabled at the ends. */
export function RoundButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'arrow-back' | 'arrow-forward' | 'close' | 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed, hovered }) => [
        styles.round,
        { backgroundColor: colors.text, opacity: disabled ? 0.25 : 1, transform: [{ scale: pressed ? 0.94 : hovered ? 1.05 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.background} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg },
  track: { width: '100%', maxWidth: 220, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  round: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
