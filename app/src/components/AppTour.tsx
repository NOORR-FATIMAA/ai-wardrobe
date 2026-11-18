import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useAppData } from '@/lib/data';
import { fonts, radius, space, useTheme } from '@/lib/theme';
import { markTourSeen, useTourVisible } from '@/lib/tour';
import { Text } from './Text';
import { Button, FadeIn, toneColors, type Tone } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Step {
  icon: IconName;
  tone: Tone;
  title: string;
  text: string;
  /** Where "Show me" goes; the tour closes first. */
  href?: Href;
  points?: string[];
}

const STEPS: Step[] = [
  {
    icon: 'sparkles',
    tone: 'lavender',
    title: 'Welcome to your AI stylist',
    text: 'A quick look at what Wardrobe AI can do. It takes under a minute, and you can skip it any time.',
  },
  {
    icon: 'camera-outline',
    tone: 'coral',
    title: 'Add your clothes',
    text: 'Take a photo or pick one from your gallery. The AI recognises the type, colours, material and occasions; you check them before saving.',
    points: ['Home → Add clothes, or Wardrobe → Add', 'No photo? "Add without a photo" works too'],
    href: '/item/add',
  },
  {
    icon: 'shirt-outline',
    tone: 'mint',
    title: 'Your wardrobe',
    text: 'Every piece in one place: search by colour or occasion, filter by category, sort by newest or most worn, and tap a piece to edit it or log a wear.',
    href: '/wardrobe',
  },
  {
    icon: 'color-wand-outline',
    tone: 'lavender',
    title: 'Get styled',
    text: 'In Stylist, pick the occasion and the style of the event (Western, Desi, Fusion, Modest…) and tap Style me. Outfits are built only from clothes you own.',
    href: '/stylist',
  },
  {
    icon: 'body-outline',
    tone: 'butter',
    title: 'Shop the look',
    text: 'Your looks appear as a lineup worn by an AI model. Tap a look, then the markers on each garment to explore pieces and see what would complete it.',
    points: ['Save, plan or log any look', 'Thumbs up or down teach the stylist your taste'],
  },
  {
    icon: 'calendar-outline',
    tone: 'mint',
    title: 'Plan and track',
    text: 'Put looks on your calendar for the next two weeks, tap "Wore it today", and see your cost per wear and forgotten pieces in Insights.',
  },
  {
    icon: 'bag-handle-outline',
    tone: 'coral',
    title: 'Shop smarter',
    text: 'The Shopping tab finds the real gaps in your wardrobe, and you can add suggested pieces to your list from any look.',
  },
  {
    icon: 'chatbubbles-outline',
    tone: 'lavender',
    title: 'Ask your stylist anything',
    text: '"What goes with my black trousers?" Chat with your stylist from the Stylist screen, and change theme or redo this tour from your profile.',
  },
];

/** The first-run feature tour, as a card over the app with Next, Back and Skip. */
export function AppTour() {
  const { colors } = useTheme();
  const { session } = useAppData();
  const userId = session?.user.id;
  const visible = useTourVisible(userId);
  const [step, setStep] = useState(0);
  if (!visible || !userId) return null;

  const s = STEPS[step];
  const t = toneColors(colors, s.tone);
  const last = step === STEPS.length - 1;
  const close = () => {
    markTourSeen(userId);
    setStep(0);
  };
  const showMe = () => {
    close();
    if (s.href) router.push(s.href);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, boxShadow: colors.shadowRaised }]}>
          <View style={styles.top}>
            <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 13 }}>
              {step + 1} of {STEPS.length}
            </Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={10}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Skip</Text>
            </Pressable>
          </View>

          <FadeIn key={step} style={{ gap: space.lg, alignItems: 'center' }}>
            <View style={[styles.art, { backgroundColor: t.bg }]}>
              <View style={[styles.artDot, { backgroundColor: t.strong }]} />
              <Ionicons name={s.icon} size={44} color={s.tone === 'lavender' ? colors.accent : colors.text} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {s.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 23, textAlign: 'center' }}>{s.text}</Text>
            {s.points ? (
              <View style={{ gap: 6, alignSelf: 'stretch' }}>
                {s.points.map((p) => (
                  <View key={p} style={styles.point}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </FadeIn>

          <View style={styles.dots} accessibilityElementsHidden>
            {STEPS.map((x, i) => (
              <View key={x.title} style={[styles.dot, { width: i === step ? 22 : 7, backgroundColor: i === step ? colors.accent : colors.border }]} />
            ))}
          </View>

          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {step > 0 ? <Button variant="secondary" title="Back" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
              <Button
                variant="ink"
                title={last ? "Let's go" : 'Next'}
                icon={last ? 'sparkles' : 'arrow-forward'}
                onPress={last ? close : () => setStep(step + 1)}
                style={{ flex: 2 }}
              />
            </View>
            {s.href ? <Button variant="ghost" title="Show me" onPress={showMe} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 440, borderRadius: radius.lg + 4, padding: space.xl, gap: space.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  art: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  artDot: { position: 'absolute', top: 8, right: 6, width: 22, height: 22, borderRadius: 11 },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, textAlign: 'center' },
  point: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  dots: { flexDirection: 'row', gap: 5, justifyContent: 'center' },
  dot: { height: 7, borderRadius: 4 },
});
