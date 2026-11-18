import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Text } from '@/components/Text';
import { Button, ErrorText, FadeIn, toneColors, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { getConversation, storeConversation } from '@/lib/chatStore';
import { useAppData } from '@/lib/data';
import { approximateLocation } from '@/lib/outfits';
import { supabase } from '@/lib/supabase';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import type { AssistantTurn, ShoppingIdea } from '@/lib/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

const STARTERS: { text: string; icon: IconName; tone: Tone }[] = [
  { text: 'Suggest an outfit for university tomorrow', icon: 'school-outline', tone: 'lavender' },
  { text: 'What can I wear with my black trousers?', icon: 'shirt-outline', tone: 'mint' },
  { text: 'Create three outfits for a weekend trip using my existing clothes', icon: 'airplane-outline', tone: 'butter' },
  { text: 'Suggest a formal outfit for a wedding', icon: 'diamond-outline', tone: 'coral' },
  { text: 'What essential clothing items am I missing?', icon: 'bag-handle-outline', tone: 'mint' },
  { text: 'Help me create five outfits without buying anything new', icon: 'repeat-outline', tone: 'lavender' },
];

const MAX_TURNS = 20;
const NATIVE = Platform.OS !== 'web';

export default function Assistant() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAppData();
  const userId = session!.user.id;
  const [turns, setTurns] = useState<AssistantTurn[]>(() => getConversation(userId));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useWeather, setUseWeather] = useState(false);
  const location = useRef<{ latitude: number; longitude: number } | undefined>(undefined);
  const list = useRef<FlatList<AssistantTurn>>(null);

  const setConversation = (next: AssistantTurn[]) => {
    storeConversation(userId, next);
    setTurns(next);
  };

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setDraft('');
    setError(null);
    const withUser = [...turns, { role: 'user' as const, content }];
    setConversation(withUser);
    setBusy(true);
    try {
      if (useWeather && !location.current) location.current = await approximateLocation();
      // Send the most recent turns, starting on a user turn as the API requires.
      let recent = withUser.slice(-MAX_TURNS);
      while (recent[0]?.role !== 'user') recent = recent.slice(1);
      const result = await api.assistant(recent, useWeather ? location.current : undefined);
      setConversation([
        ...withUser,
        { role: 'assistant', content: result.reply, outfits: result.outfits, shopping_suggestions: result.shopping_suggestions },
      ]);
    } catch (e) {
      setError((e as Error).message);
      setConversation(turns); // drop the unanswered message so it can be retried
      setDraft(content);
    } finally {
      setBusy(false);
    }
  }

  const canSend = Boolean(draft.trim()) && !busy;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Stylist chat',
          headerRight: () =>
            turns.length ? (
              <Pressable onPress={() => setConversation([])} accessibilityRole="button" accessibilityLabel="New chat" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="create-outline" size={20} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600' }}>New chat</Text>
              </Pressable>
            ) : null,
        }}
      />

      <FlatList
        ref={list}
        data={turns}
        keyExtractor={(_, i) => String(i)}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Welcome useWeather={useWeather} onStart={send} />}
        ListFooterComponent={busy ? <Typing /> : <ErrorText message={error} />}
        renderItem={({ item: turn, index }) =>
          turn.role === 'user' ? (
            <FadeIn style={[styles.bubble, styles.userBubble, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.onPrimary, fontSize: 16, lineHeight: 22 }}>{turn.content}</Text>
            </FadeIn>
          ) : (
            <FadeIn style={{ gap: space.md }}>
              <View style={styles.assistantRow}>
                <Avatar size={32} />
                <View style={[styles.bubble, styles.stylistBubble, { backgroundColor: colors.surface }, shadowFor(colors)]}>
                  <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{turn.content}</Text>
                </View>
              </View>
              {turn.outfits?.map((outfit, i) => (
                <OutfitCard key={`${index}-${i}`} glow outfit={outfit} actions={<OutfitActions outfit={outfit} requestText={turns[index - 1]?.content} />} />
              ))}
              {turn.shopping_suggestions?.map((s) => (
                <ShoppingIdeaCard key={`${index}-${s.name}`} idea={s} />
              ))}
            </FadeIn>
          )
        }
      />

      {/* Composer: weather switch, message, send. */}
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.sm, backgroundColor: colors.background }]}>
        <View style={[styles.composer, { backgroundColor: colors.surface }, shadowFor(colors, true)]}>
          <Pressable
            onPress={() => setUseWeather(!useWeather)}
            accessibilityRole="switch"
            accessibilityState={{ checked: useWeather }}
            accessibilityLabel="Use the weather forecast"
            hitSlop={6}
            style={[styles.weather, { backgroundColor: useWeather ? colors.butter : colors.surfaceAlt }]}
          >
            <Ionicons name={useWeather ? 'partly-sunny' : 'partly-sunny-outline'} size={18} color={useWeather ? colors.onPastel : colors.textMuted} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask your stylist…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
            onKeyPress={(e) => {
              // Web: Enter sends, Shift+Enter makes a new line.
              const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                send(draft);
              }
            }}
            style={[styles.input, { color: colors.text, fontFamily: fonts.regular }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [styles.send, { backgroundColor: colors.text, opacity: canSend ? 1 : 0.3, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.background} />
          </Pressable>
        </View>
        {useWeather ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>Weather on: your approximate location is used once and not stored.</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/** The stylist's avatar: sparkles on a lavender circle. */
function Avatar({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="sparkles" size={size * 0.5} color={colors.onPrimary} />
    </View>
  );
}

/** Empty chat: who you're talking to, and starter questions as cards. */
function Welcome({ useWeather, onStart }: { useWeather: boolean; onStart: (text: string) => void }) {
  const { colors } = useTheme();
  return (
    <FadeIn style={{ gap: space.xl, paddingTop: space.lg }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <View style={[styles.halo, { backgroundColor: colors.accentSoft }]}>
          <Avatar size={72} />
        </View>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 28, textAlign: 'center', letterSpacing: -0.6 }}>
          Hi, I&apos;m your stylist
        </Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', maxWidth: 440, lineHeight: 21 }}>
          I know your clothes, your style and what you wore recently. Ask me anything, or start with one of these.
          {useWeather ? ' The weather is on.' : ' Tap the sun to include the weather.'}
        </Text>
      </View>
      <View style={styles.starters}>
        {STARTERS.map((s) => (
          <Starter key={s.text} {...s} onPress={() => onStart(s.text)} />
        ))}
      </View>
    </FadeIn>
  );
}

function Starter({ text, icon, tone, onPress }: { text: string; icon: IconName; tone: Tone; onPress: () => void }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered, pressed }) => [
        styles.starter,
        { backgroundColor: colors.surface },
        shadowFor(colors, Boolean(hovered)),
        { transform: [{ translateY: hovered ? -2 : 0 }, { scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={[styles.starterIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={tone === 'lavender' ? colors.accent : colors.text} />
      </View>
      <Text style={{ color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </Pressable>
  );
}

/** "Stylist is typing": three dots bouncing in a bubble. */
function Typing() {
  const { colors, reduceMotion } = useTheme();
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduceMotion) return;
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: NATIVE }),
          Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: NATIVE }),
          Animated.delay((2 - i) * 150 + 200),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots, reduceMotion]);
  return (
    <View style={styles.assistantRow} accessibilityLiveRegion="polite" accessibilityLabel="Your stylist is typing">
      <Avatar size={32} />
      <View style={[styles.bubble, styles.stylistBubble, styles.typing, { backgroundColor: colors.surface }, shadowFor(colors)]}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[styles.dot, { backgroundColor: colors.accent, transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }], opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}
          />
        ))}
      </View>
    </View>
  );
}

function ShoppingIdeaCard({ idea }: { idea: ShoppingIdea }) {
  const { colors } = useTheme();
  const [added, setAdded] = useState(false);

  async function add() {
    const { error } = await supabase.from('shopping_items').insert({
      name: idea.name,
      category: idea.category,
      reason: idea.reason,
      source: 'ai',
    });
    if (!error) setAdded(true);
  }

  return (
    <View style={[styles.idea, { backgroundColor: colors.coralSoft }]}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Ionicons name="bag-add-outline" size={18} color={colors.text} />
        <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{idea.name}</Text>
      </View>
      <Text style={{ color: colors.text, opacity: 0.8 }}>{idea.reason}</Text>
      <Button variant={added ? 'secondary' : 'ink'} icon={added ? 'checkmark' : 'add'} title={added ? 'On your shopping list' : 'Add to shopping list'} onPress={add} disabled={added} />
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { padding: space.lg, gap: space.lg, flexGrow: 1, width: '100%', maxWidth: 820, alignSelf: 'center' },
  bubble: { paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.lg, maxWidth: '86%' },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  stylistBubble: { borderTopLeftRadius: 6, flexShrink: 1 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  typing: { flexDirection: 'row', gap: 6, paddingVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  halo: { padding: 12, borderRadius: 60 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  starter: { flexGrow: 1, flexBasis: 260, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  starterIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  idea: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  composerWrap: { paddingHorizontal: space.md, paddingTop: space.sm, gap: 4, width: '100%', maxWidth: 820, alignSelf: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: 6, borderRadius: radius.lg + 4 },
  weather: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
