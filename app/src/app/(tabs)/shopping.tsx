import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import { ItemThumb } from '@/components/ItemThumb';
import { Body, Button, Card, EmptyState, ErrorText, Heading, Muted, Screen, TextField, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import type { GapResult, GapSuggestion, ShoppingItem } from '@/lib/types';

const PRIORITY_LABEL = { 1: 'High priority', 2: 'Nice to have', 3: 'Optional' } as const;

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
    <Screen>
      <View style={{ gap: space.xs }}>
        <Title>Shopping</Title>
        <Muted>Buy less, choose well: only pieces that unlock new outfits.</Muted>
      </View>

      <Card>
        <Heading>Find gaps in my wardrobe</Heading>
        <TextField value={focus} onChangeText={setFocus} placeholder="Optional focus, e.g. office wear, winter, a trip" />
        <ErrorText message={error} />
        <Button
          title={busy ? 'Analysing…' : 'Analyse my wardrobe'}
          icon="analytics-outline"
          onPress={analyse}
          loading={busy}
          disabled={!canAnalyse}
        />
        {!canAnalyse ? (
          <Muted>
            {items.length < 3 ? 'Add at least three items first.' : 'Turn on AI processing in your profile to use this.'}
          </Muted>
        ) : null}
      </Card>

      {analysis ? (
        <View style={{ gap: space.md }}>
          <Body>{analysis.summary}</Body>
          {analysis.no_purchase_needed.length ? (
            <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
              <Text style={[styles.label, { color: colors.text }]}>Already covered, no need to buy</Text>
              {analysis.no_purchase_needed.map((n) => (
                <Muted key={n} style={{ color: colors.text }}>• {n}</Muted>
              ))}
            </Card>
          ) : null}
          {analysis.suggestions.length === 0 ? <Muted>No purchases recommended right now.</Muted> : null}
          {analysis.suggestions.map((s) => {
            const pairs = s.pairs_with.map(itemById).filter((i) => i !== undefined);
            return (
              <Card key={s.name}>
                <View style={{ gap: 2 }}>
                  <Text style={[styles.label, { color: colors.accent }]}>
                    {PRIORITY_LABEL[s.priority]} · {s.price_range}
                  </Text>
                  <Heading>{s.name}</Heading>
                </View>
                <Body>{s.reason}</Body>
                {pairs.length ? (
                  <>
                    <Muted>Works with {pairs.length} of your items · about {s.new_outfits_estimate} new outfits</Muted>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                      {pairs.map((p) => (
                        <ItemThumb key={p.id} item={p} size={56} />
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <Button variant="secondary" icon="add" title="Add to shopping list" onPress={() => addSuggestion(s)} />
              </Card>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: space.md }}>
        <Heading>My shopping list</Heading>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <TextField value={manual} onChangeText={setManual} placeholder="Add an item" onSubmitEditing={addManual} returnKeyType="done" />
          </View>
          <Button title="Add" onPress={addManual} disabled={!manual.trim()} variant="secondary" />
        </View>
        {todo.length === 0 ? (
          <EmptyState icon="bag-check-outline" title="Nothing on your list" message="Run an analysis or add items yourself." />
        ) : (
          todo.map((item) => <ListRow key={item.id} item={item} onStatus={setStatus} />)
        )}
        {bought.length ? (
          <>
            <Button variant="ghost" title={`${showBought ? 'Hide' : 'Show'} bought (${bought.length})`} onPress={() => setShowBought(!showBought)} />
            {showBought && bought.map((item) => <ListRow key={item.id} item={item} onStatus={setStatus} />)}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function ListRow({ item, onStatus }: { item: ShoppingItem; onStatus: (i: ShoppingItem, s: ShoppingItem['status']) => void }) {
  const { colors } = useTheme();
  const done = item.status === 'bought';
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => onStatus(item, done ? 'todo' : 'bought')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark ${item.name} as ${done ? 'not bought' : 'bought'}`}
        hitSlop={8}
      >
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? colors.success : colors.textMuted} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>{item.name}</Text>
        {item.reason ? <Muted numberOfLines={2}>{item.reason}</Muted> : null}
        {item.price_range ? <Muted>{item.price_range}</Muted> : null}
      </View>
      <Pressable onPress={() => onStatus(item, 'dismissed')} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} hitSlop={8}>
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
});
