import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ItemThumb } from '@/components/ItemThumb';
import { pinterestSearchUrl } from '@/components/OutfitInspiration';
import { StylistLoader } from '@/components/StylistLoader';
import { Text } from '@/components/Text';
import { Badge, Button, Chip, EmptyState, ErrorText, FadeIn, Muted, Screen, TextField, Title, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import type { GapResult, GapSuggestion, ShoppingItem } from '@/lib/types';

const PRIORITY: Record<1 | 2 | 3, { label: string; tone: Tone }> = {
  1: { label: 'High priority', tone: 'coral' },
  2: { label: 'Nice to have', tone: 'butter' },
  3: { label: 'Optional', tone: 'lavender' },
};
const CHECK_STEPS = ['Reading your wardrobe…', 'Finding gaps and repeats…', 'Counting the outfits each piece unlocks…', 'Writing your suggestions…'];
const FOCUS_IDEAS = ['Office', 'Winter', 'A trip', 'Wedding season', 'Everyday basics'];

export default function Shopping() {
  const { colors } = useTheme();
  const { items, itemById, profile } = useAppData();
  const [list, setList] = useState<ShoppingItem[]>([]);
  const [analysis, setAnalysis] = useState<GapResult | null>(null);
  const [focus, setFocus] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBought, setShowBought] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .neq('status', 'dismissed')
      .order('priority')
      .order('created_at', { ascending: false });
    setList((data ?? []) as ShoppingItem[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function analyse() {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await api.wardrobeGaps({ focus: focus.trim() || undefined }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addSuggestion(s: GapSuggestion) {
    const { error: insertError } = await supabase.from('shopping_items').insert({
      name: s.name,
      category: s.category,
      description: s.description,
      reason: s.reason,
      priority: s.priority,
      price_range: s.price_range,
      pairs_with: s.pairs_with,
      source: 'ai',
    });
    if (insertError) return setError('Could not add to your list.');
    setAnalysis((a) => (a ? { ...a, suggestions: a.suggestions.filter((x) => x !== s) } : a));
    load();
  }

  async function addManual() {
    if (!manual.trim()) return;
    await supabase.from('shopping_items').insert({ name: manual.trim(), source: 'manual' });
    setManual('');
    load();
  }

  async function setStatus(item: ShoppingItem, status: ShoppingItem['status']) {
    setList((l) => l.map((x) => (x.id === item.id ? { ...x, status } : x)).filter((x) => x.status !== 'dismissed'));
    await supabase.from('shopping_items').update({ status }).eq('id', item.id);
  }

  const todo = list.filter((i) => i.status === 'todo');
  const bought = list.filter((i) => i.status === 'bought');
  const canAnalyse = items.length >= 3 && profile?.consent_ai_processing;

  return (
    <Screen wide>
      <FadeIn style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Title>Shopping</Title>
          <Muted>Buy less, choose well: only pieces that unlock new outfits.</Muted>
        </View>
        <View style={[styles.counter, { backgroundColor: colors.surface }, shadowFor(colors)]}>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 22 }}>{todo.length}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>to buy</Text>
        </View>
      </FadeIn>

      {/* Gap finder */}
      <FadeIn delay={60} style={[styles.finder, { backgroundColor: colors.primary, boxShadow: colors.glow }]}>
        <View style={[styles.blob, { backgroundColor: colors.coral, width: 160, height: 160, top: -60, right: -40 }]} />
        <View style={[styles.blob, { backgroundColor: colors.butter, width: 90, height: 90, bottom: -30, right: 90 }]} />
        <View style={{ gap: space.xs }}>
          <View style={[styles.aiChip, { backgroundColor: colors.onPrimary }]}>
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>AI wardrobe check</Text>
          </View>
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.display, fontSize: 26, lineHeight: 30 }}>Find what&apos;s really missing</Text>
          <Text style={{ color: colors.onPrimary, opacity: 0.85 }}>
            The stylist looks at everything you own and suggests only the pieces that create the most new outfits.
          </Text>
        </View>
        <View style={styles.chips}>
          {FOCUS_IDEAS.map((f) => (
            <Chip key={f} label={f} selected={focus === f} onPress={() => setFocus(focus === f ? '' : f)} />
          ))}
        </View>
        <TextField value={focus} onChangeText={setFocus} placeholder="Or type a focus, e.g. smart shoes for work" />
        <ErrorText message={error} />
        <Button
          variant="ink"
          title={busy ? 'Checking your wardrobe…' : 'Analyse my wardrobe'}
          icon="analytics-outline"
          onPress={analyse}
          loading={busy}
          disabled={!canAnalyse}
        />
        {!canAnalyse ? (
          <Text style={{ color: colors.onPrimary, fontSize: 13 }}>
            {items.length < 3 ? 'Add at least three pieces first.' : 'Turn on AI processing in your profile to use this.'}
          </Text>
        ) : null}
      </FadeIn>

      {busy ? <StylistLoader title="Checking your wardrobe" steps={CHECK_STEPS} /> : null}

      {analysis && !busy ? (
        <FadeIn style={{ gap: space.md }}>
          <View style={[styles.summary, { backgroundColor: colors.surface }, shadowFor(colors)]}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.accent} />
            <Text style={{ color: colors.text, flex: 1, fontSize: 16, lineHeight: 24 }}>{analysis.summary}</Text>
          </View>
          {analysis.no_purchase_needed.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Already covered, no need to buy</Text>
              <View style={styles.chips}>
                {analysis.no_purchase_needed.map((n) => (
                  <Badge key={n} label={n} tone="mint" icon="checkmark" />
                ))}
              </View>
            </View>
          ) : null}
          {analysis.suggestions.length === 0 ? <Muted>No purchases recommended right now. Your wardrobe has it covered.</Muted> : null}
          <View style={styles.grid}>
            {analysis.suggestions.map((s, i) => (
              <FadeIn key={s.name} delay={i * 90} style={styles.cell}>
                <SuggestionCard suggestion={s} owned={s.pairs_with.map(itemById).filter((x) => x !== undefined)} onAdd={() => addSuggestion(s)} />
              </FadeIn>
            ))}
          </View>
        </FadeIn>
      ) : null}

      {/* The list */}
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 22, flex: 1 }]}>My shopping list</Text>
          <Muted>
            {todo.length} to buy · {bought.length} bought
          </Muted>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField value={manual} onChangeText={setManual} placeholder="Add something yourself" onSubmitEditing={addManual} returnKeyType="done" />
          </View>
          <Button title="Add" icon="add" onPress={addManual} disabled={!manual.trim()} variant="secondary" />
        </View>
        {todo.length === 0 ? (
          <EmptyState icon="bag-check-outline" tone="mint" title="Nothing on your list" message="Run the wardrobe check, add ideas from your looks, or add pieces yourself." />
        ) : (
          todo.map((item) => <ListRow key={item.id} item={item} onStatus={setStatus} />)
        )}
        {bought.length ? (
          <>
            <Button variant="ghost" icon={showBought ? 'chevron-up' : 'chevron-down'} title={`${showBought ? 'Hide' : 'Show'} bought (${bought.length})`} onPress={() => setShowBought(!showBought)} />
            {showBought && bought.map((item) => <ListRow key={item.id} item={item} onStatus={setStatus} />)}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function SuggestionCard({
  suggestion: s,
  owned,
  onAdd,
}: {
  suggestion: GapSuggestion;
  owned: NonNullable<ReturnType<ReturnType<typeof useAppData>['itemById']>>[];
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const p = PRIORITY[s.priority];
  return (
    <View style={[styles.suggestion, { backgroundColor: colors.surface }, shadowFor(colors)]}>
      <View style={styles.chips}>
        <Badge label={p.label} tone={p.tone} />
        {s.price_range ? <Badge label={s.price_range} tone="lavender" icon="pricetag-outline" /> : null}
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 22, lineHeight: 26 }}>{s.name}</Text>
      <Text style={{ color: colors.textMuted, lineHeight: 21 }}>{s.reason}</Text>
      {owned.length ? (
        <View style={[styles.unlocks, { backgroundColor: colors.mintSoft }]}>
          <View style={{ flexDirection: 'row' }}>
            {owned.slice(0, 4).map((item, i) => (
              <View key={item.id} style={{ marginLeft: i ? -14 : 0, borderRadius: radius.md, borderWidth: 2, borderColor: colors.surface }}>
                <ItemThumb item={item} size={44} />
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>~{s.new_outfits_estimate} new outfits</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>with {owned.length} piece{owned.length > 1 ? 's' : ''} you own</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button variant="ink" icon="bag-add-outline" title="Add to list" onPress={onAdd} style={{ flex: 1 }} />
        <Button
          variant="ghost"
          icon="logo-pinterest"
          title="Ideas"
          accessibilityLabel={`Ideas for ${s.name} on Pinterest`}
          onPress={() => void Linking.openURL(pinterestSearchUrl(s.name)).catch(() => undefined)}
        />
      </View>
    </View>
  );
}

function ListRow({ item, onStatus }: { item: ShoppingItem; onStatus: (i: ShoppingItem, s: ShoppingItem['status']) => void }) {
  const { colors } = useTheme();
  const done = item.status === 'bought';
  const p = PRIORITY[item.priority];
  return (
    <FadeIn style={[styles.row, { backgroundColor: colors.surface, opacity: done ? 0.65 : 1 }, shadowFor(colors)]}>
      <Pressable
        onPress={() => onStatus(item, done ? 'todo' : 'bought')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark ${item.name} as ${done ? 'not bought' : 'bought'}`}
        hitSlop={8}
        style={[styles.check, { borderColor: done ? colors.success : colors.border, backgroundColor: done ? colors.success : 'transparent' }]}
      >
        {done ? <Ionicons name="checkmark" size={18} color={colors.surface} /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15, textDecorationLine: done ? 'line-through' : 'none' }}>{item.name}</Text>
        {item.reason ? (
          <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 13 }}>
            {item.reason}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {item.source === 'ai' ? <Badge label={p.label} tone={p.tone} /> : null}
          {item.price_range ? <Badge label={item.price_range} tone="lavender" /> : null}
        </View>
      </View>
      <Pressable onPress={() => onStatus(item, 'dismissed')} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} hitSlop={8}>
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </Pressable>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  counter: { alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  finder: { borderRadius: radius.lg + 4, padding: space.xl, gap: space.md, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.5 },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  summary: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, alignItems: 'flex-start' },
  sectionTitle: { fontFamily: fonts.displaySemibold, fontSize: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  cell: { flexGrow: 1, flexBasis: 300 },
  suggestion: { borderRadius: radius.lg, padding: space.lg, gap: space.md, flex: 1 },
  unlocks: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.md },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
