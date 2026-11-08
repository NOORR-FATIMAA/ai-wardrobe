import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OutfitActions } from '@/components/OutfitActions';
import { OutfitCard } from '@/components/OutfitCard';
import { Body, Button, Card, Chip, ErrorText, Heading, Muted } from '@/components/ui';
import { api } from '@/lib/api';
import { getConversation, storeConversation } from '@/lib/chatStore';
import { useAppData } from '@/lib/data';
import { approximateLocation } from '@/lib/outfits';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme, fonts } from '@/lib/theme';
import type { AssistantTurn, ShoppingIdea } from '@/lib/types';

const STARTERS = [
  'Suggest an outfit for university tomorrow',
  'What can I wear with my black trousers?',
  'Create three outfits for a weekend trip using my existing clothes',
  'Suggest a formal outfit for a wedding',
  'What essential clothing items am I missing?',
  'Help me create five outfits without buying anything new',
];

const MAX_TURNS = 20;

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Stylist chat',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              <Pressable
                onPress={() => setUseWeather(!useWeather)}
                accessibilityRole="switch"
                accessibilityState={{ checked: useWeather }}
                accessibilityLabel="Use weather forecast"
                hitSlop={8}
              >
                <Ionicons name={useWeather ? 'partly-sunny' : 'partly-sunny-outline'} size={22} color={useWeather ? colors.accent : colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => setConversation([])} accessibilityRole="button" accessibilityLabel="New chat" hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={colors.text} />
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        ref={list}
        data={turns}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ gap: space.lg, paddingTop: space.xl }}>
            <Heading>Ask about your wardrobe</Heading>
            <Muted>
              I know your clothes, preferences and recent outfits. {useWeather ? 'Weather is on.' : 'Tap the sun to include the weather.'}
            </Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {STARTERS.map((s) => (
                <Chip key={s} label={s} onPress={() => send(s)} />
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          busy ? (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
              <Muted>Thinking about your wardrobe…</Muted>
            </View>
          ) : (
            <ErrorText message={error} />
          )
        }
        renderItem={({ item: turn, index }) =>
          turn.role === 'user' ? (
            <View style={[styles.bubble, styles.userBubble, { backgroundColor: colors.accent }]}>
              <Text style={{ color: colors.onAccent, fontSize: 16, lineHeight: 22 }}>{turn.content}</Text>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                <Body>{turn.content}</Body>
              </View>
              {turn.outfits?.map((outfit, i) => (
                <OutfitCard key={`${index}-${i}`} outfit={outfit} actions={<OutfitActions outfit={outfit} requestText={turns[index - 1]?.content} />} />
              ))}
              {turn.shopping_suggestions?.map((s) => (
                <ShoppingIdeaCard key={`${index}-${s.name}`} idea={s} />
              ))}
            </View>
          )
        }
      />

      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + space.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask your stylist…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          accessibilityLabel="Message"
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, fontFamily: fonts.regular }]}
        />
        <Pressable
          onPress={() => send(draft)}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.send, { backgroundColor: colors.accent, opacity: !draft.trim() || busy ? 0.4 : 1 }]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Ionicons name="bag-add-outline" size={18} color={colors.accent} />
        <Body style={{ fontWeight: '600', flex: 1 }}>{idea.name}</Body>
      </View>
      <Muted>{idea.reason}</Muted>
      <Button
        variant="secondary"
        icon={added ? 'checkmark' : 'add'}
        title={added ? 'On your shopping list' : 'Add to shopping list'}
        onPress={add}
        disabled={added}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  bubble: { padding: space.md, borderRadius: radius.lg, maxWidth: '88%', alignSelf: 'flex-start' },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: radius.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.md, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
