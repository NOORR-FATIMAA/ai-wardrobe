import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ItemForm } from '@/components/ItemForm';
import { Body, Button, Card, ErrorText, Heading, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { deleteWardrobePhoto, pickImage, preparePhoto, uploadWardrobePhoto, type PreparedPhoto } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';
import type { ItemAnalysis, ItemDraft } from '@/lib/types';

type Stage = 'pick' | 'processing' | 'review';

const emptyDraft = (imagePath: string | null): ItemDraft => ({
  image_path: imagePath,
  name: '',
  category: 'other',
  subcategory: null,
  colors: [],
  pattern: null,
  material: null,
  style_tags: [],
  formality: null,
  seasons: [],
  occasions: [],
  description: null,
  notes: null,
  purchase_price: null,
  ai_tagged: false,
  user_verified: true,
});

const draftFromAnalysis = (imagePath: string, a: ItemAnalysis): ItemDraft => ({
  ...emptyDraft(imagePath),
  name: a.name,
  category: a.category,
  subcategory: a.subcategory || null,
  colors: a.colors,
  pattern: a.pattern || null,
  material: a.material && a.material !== 'unknown' ? a.material : null,
  style_tags: a.style_tags,
  formality: a.formality,
  seasons: a.seasons,
  occasions: a.occasions,
  description: a.description || null,
  ai_tagged: true,
});

export default function AddItem() {
  const { colors } = useTheme();
  const { session, profile, refreshItems } = useAppData();
  const [stage, setStage] = useState<Stage>('pick');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft(null));
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [switching, setSwitching] = useState(false);
  const showingCutout = Boolean(photo?.cutout && localUri === photo.cutout);

  async function start(source: 'camera' | 'library') {
    setError(null);
    setNotice(null);
    let uri: string | null;
    try {
      uri = await pickImage(source);
    } catch (e) {
      return setError((e as Error).message);
    }
    if (!uri) return;

    setLocalUri(uri);
    setStage('processing');
    let path: string;
    try {
      const prepared = await preparePhoto(uri);
      const chosen = prepared.cutout ?? prepared.original;
      setPhoto(prepared);
      setLocalUri(chosen);
      path = await uploadWardrobePhoto(chosen, session!.user.id);
    } catch (e) {
      setError((e as Error).message);
      return setStage('pick');
    }

    if (!profile?.consent_ai_processing) {
      setDraft(emptyDraft(path));
      setNotice('AI processing is off, so please fill in the details yourself.');
      return setStage('review');
    }

    try {
      const result = await api.analyzeItem(path);
      setAnalysis(result);
      setDraft(draftFromAnalysis(path, result));
      if (!result.is_clothing) setNotice("This doesn't look like clothing. You can still save it if it is.");
      else if (result.confidence === 'low') setNotice('The AI is unsure about some details. Please check them.');
    } catch (e) {
      setDraft(emptyDraft(path));
      setNotice(`${(e as Error).message} You can enter the details manually.`);
    }
    setStage('review');
  }

  async function save() {
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('wardrobe_items').insert({ ...draft, user_verified: true });
    setSaving(false);
    if (insertError) return setError('Could not save this item. Please try again.');
    setSavedCount((n) => n + 1);
    await refreshItems();
    reset();
  }

  async function discard() {
    if (draft.image_path) await deleteWardrobePhoto(draft.image_path);
    reset();
  }

  /** Swaps between the background-removed cut-out and the original photo. */
  async function switchPhoto() {
    if (!photo?.cutout || !draft.image_path) return;
    const next = localUri === photo.cutout ? photo.original : photo.cutout;
    setSwitching(true);
    setError(null);
    try {
      const previous = draft.image_path;
      const path = await uploadWardrobePhoto(next, session!.user.id);
      setDraft((d) => ({ ...d, image_path: path }));
      setLocalUri(next);
      await deleteWardrobePhoto(previous);
    } catch (e) {
      setError((e as Error).message);
    }
    setSwitching(false);
  }

  function reset() {
    setStage('pick');
    setPhoto(null);
    setLocalUri(null);
    setAnalysis(null);
    setNotice(null);
    setDraft(emptyDraft(null));
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: stage === 'review' ? 'Review details' : 'Add to wardrobe' }} />

      {stage === 'pick' && (
        <View style={{ gap: space.lg }}>
          {savedCount > 0 ? (
            <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
              <Body>
                {savedCount} item{savedCount > 1 ? 's' : ''} added. Keep going, or close when you’re done.
              </Body>
            </Card>
          ) : null}
          <Heading>Photograph one item at a time</Heading>
          <Muted>
            For best results, lay the item flat or hang it against a plain background in good light. The photo is
            resized, its location data removed, and the background cut away on your phone before upload.
          </Muted>
          <ErrorText message={error} />
          <Button title="Take a photo" icon="camera-outline" onPress={() => start('camera')} />
          <Button variant="secondary" title="Choose from library" icon="images-outline" onPress={() => start('library')} />
          <Button variant="ghost" title="Add without a photo" onPress={() => { setDraft(emptyDraft(null)); setStage('review'); }} />
          {savedCount > 0 ? <Button variant="secondary" title="Done" onPress={() => router.back()} /> : null}
        </View>
      )}

      {stage === 'processing' && (
        <View style={{ alignItems: 'center', gap: space.lg, paddingVertical: space.xxl }}>
          {localUri ? <Image source={{ uri: localUri }} style={{ width: 220, height: 220, borderRadius: radius.lg }} contentFit="cover" /> : null}
          <ActivityIndicator color={colors.accent} />
          <Body>Recognising your item…</Body>
        </View>
      )}

      {stage === 'review' && (
        <View style={{ gap: space.lg }}>
          {localUri ? (
            <Image
              source={{ uri: localUri }}
              style={{ width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}
              contentFit={showingCutout ? 'contain' : 'cover'}
            />
          ) : null}
          {photo?.cutout ? (
            <Button
              variant="secondary"
              icon={showingCutout ? 'image-outline' : 'cut-outline'}
              title={showingCutout ? 'Background removed · use original photo' : 'Remove background'}
              onPress={switchPhoto}
              loading={switching}
            />
          ) : null}
          {notice ? (
            <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }}>
              <Body>{notice}</Body>
            </Card>
          ) : analysis ? (
            <Muted>Tagged by AI. Check the details and fix anything that’s off.</Muted>
          ) : null}
          {analysis?.other_items_detected.length ? (
            <Muted>Also in the photo: {analysis.other_items_detected.join(', ')}. Add them separately for best results.</Muted>
          ) : null}
          <ItemForm value={draft} onChange={setDraft} />
          <ErrorText message={error} />
          <Button title="Save to wardrobe" icon="checkmark" onPress={save} loading={saving} disabled={!draft.name.trim()} />
          <Button variant="ghost" title="Discard" onPress={discard} />
        </View>
      )}
    </Screen>
  );
}
