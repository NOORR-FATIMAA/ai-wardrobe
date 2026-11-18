import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ItemForm } from '@/components/ItemForm';
import { Text } from '@/components/Text';
import { Badge, Body, Button, Card, ErrorText, FadeIn, Muted, Screen, Title } from '@/components/ui';
import { DEMO_IMAGES } from '@/demo/demoImages';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { deleteWardrobePhoto, pickImage, preparePhoto, uploadWardrobePhoto, type PreparedPhoto } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { categoryLabel, type ItemAnalysis, type ItemDraft } from '@/lib/types';

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
        <FadeIn style={{ gap: space.lg }}>
          {savedCount > 0 ? (
            <View style={[styles.saved, { backgroundColor: colors.mintSoft }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>
                {savedCount} piece{savedCount > 1 ? 's' : ''} added to your wardrobe. Keep going, or tap Done.
              </Text>
              <Button variant="ink" title="Done" onPress={() => router.back()} style={{ minHeight: 40, paddingHorizontal: space.lg }} />
            </View>
          ) : null}

          <Viewfinder />
          <View style={{ gap: space.xs, alignItems: 'center' }}>
            <Title style={{ textAlign: 'center' }}>Add a piece</Title>
            <Muted style={{ textAlign: 'center', maxWidth: 420 }}>
              Snap one item at a time. The AI recognises its type, colours, fabric and occasions, and you check before saving.
            </Muted>
          </View>

          <View style={styles.tips}>
            {['Lay it flat or hang it', 'Plain background', 'Good light', 'One item per photo'].map((t) => (
              <Badge key={t} label={t} tone="lavender" icon="checkmark" />
            ))}
          </View>

          <ErrorText message={error} />
          <SourceTile primary icon="camera" title="Take a photo" hint="Use your camera" onPress={() => start('camera')} />
          <View style={styles.row}>
            <SourceTile icon="images-outline" title="From gallery" hint="Pick a photo" onPress={() => start('library')} />
            <SourceTile
              icon="create-outline"
              title="No photo"
              hint="Type the details"
              onPress={() => {
                setDraft(emptyDraft(null));
                setStage('review');
              }}
            />
          </View>
          <Muted style={{ textAlign: 'center', fontSize: 12 }}>
            Photos are resized and their location data removed before upload. On phones the background is cut away too.
          </Muted>
        </FadeIn>
      )}

      {stage === 'processing' && <Scanning uri={localUri} />}

      {stage === 'review' && (
        <FadeIn style={{ gap: space.lg }}>
          {localUri ? (
            <View style={[styles.photoCard, { backgroundColor: colors.photoTile }, shadowFor(colors)]}>
              <Image source={{ uri: localUri }} style={StyleSheet.absoluteFill} contentFit={showingCutout ? 'contain' : 'cover'} />
              {analysis ? (
                <View style={[styles.aiBadge, { backgroundColor: colors.text }]}>
                  <Ionicons name="sparkles" size={12} color={colors.background} />
                  <Text style={{ color: colors.background, fontSize: 12, fontWeight: '700' }}>Tagged by AI</Text>
                </View>
              ) : null}
            </View>
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
          {analysis && analysis.is_clothing ? (
            <View style={{ gap: space.sm, alignItems: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text, textAlign: 'center' }}>{analysis.name}</Text>
              <View style={styles.tips}>
                <Badge label={categoryLabel(analysis.category)} tone="lavender" />
                {analysis.colors.slice(0, 3).map((c) => (
                  <Badge key={c} label={c} tone="mint" />
                ))}
                {analysis.material && analysis.material !== 'unknown' ? <Badge label={analysis.material} tone="butter" /> : null}
              </View>
            </View>
          ) : null}
          {notice ? (
            <View style={[styles.notice, { backgroundColor: colors.butterSoft }]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.text} />
              <Body style={{ flex: 1 }}>{notice}</Body>
            </View>
          ) : analysis ? (
            <Muted style={{ textAlign: 'center' }}>Check the details below and fix anything that&apos;s off.</Muted>
          ) : null}
          {analysis?.other_items_detected.length ? (
            <Muted>Also in the photo: {analysis.other_items_detected.join(', ')}. Add them separately for best results.</Muted>
          ) : null}
          <Card>
            <ItemForm value={draft} onChange={setDraft} />
          </Card>
          <ErrorText message={error} />
          <Button title="Save to wardrobe" icon="checkmark" onPress={save} loading={saving} disabled={!draft.name.trim()} />
          <Button variant="ghost" title="Discard" onPress={discard} />
        </FadeIn>
      )}
    </Screen>
  );
}

/** Camera-viewfinder hero: corner brackets around a garment, a shutter, and a soft pastel glow. */
function Viewfinder() {
  const { colors } = useTheme();
  const corner = (pos: object) => <View style={[styles.corner, { borderColor: colors.accent }, pos]} />;
  return (
    <View style={[styles.viewfinder, { backgroundColor: colors.accentSoft }]}>
      <View style={[styles.vfBlob, { backgroundColor: colors.coral }]} />
      {corner({ top: 18, left: 18, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 })}
      {corner({ top: 18, right: 18, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 })}
      {corner({ bottom: 18, left: 18, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 })}
      {corner({ bottom: 18, right: 18, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 })}
      <Image source={DEMO_IMAGES['demo-item-10']} style={{ width: '58%', height: '72%' }} contentFit="contain" />
      <View style={[styles.shutter, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
        <Ionicons name="camera" size={20} color={colors.accent} />
      </View>
    </View>
  );
}

/** One way to add a piece; the primary one (camera) is large and lavender. */
function SourceTile({
  icon,
  title,
  hint,
  onPress,
  primary,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed, hovered }) => [
        styles.tile,
        primary ? { backgroundColor: colors.primary, boxShadow: colors.glow } : [{ backgroundColor: colors.surface }, shadowFor(colors, Boolean(hovered))],
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
        primary ? null : { flex: 1 },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: primary ? colors.onPrimary : colors.accentSoft }]}>
        <Ionicons name={icon} size={primary ? 26 : 22} color={primary ? colors.primary : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: primary ? colors.onPrimary : colors.text, fontFamily: fonts.displaySemibold, fontSize: primary ? 20 : 16 }}>{title}</Text>
        <Text style={{ color: primary ? colors.onPrimary : colors.textMuted, opacity: primary ? 0.8 : 1, fontSize: 13 }}>{hint}</Text>
      </View>
      {primary ? <Ionicons name="arrow-forward" size={22} color={colors.onPrimary} /> : null}
    </Pressable>
  );
}

const SCAN_STEPS = ['Looking at the shape…', 'Reading the colours…', 'Recognising fabric and type…', 'Matching occasions…'];
const SCAN_SIZE = 280;

/** While the AI recognises the photo: a light sweeps over it and the steps change. */
function Scanning({ uri }: { uri: string | null }) {
  const { colors, reduceMotion } = useTheme();
  const [sweep] = useState(() => new Animated.Value(0));
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 1400);
    if (reduceMotion) return () => clearInterval(timer);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(sweep, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(timer);
      loop.stop();
    };
  }, [sweep, reduceMotion]);
  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_SIZE - 4] });
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Recognising your item. ${SCAN_STEPS[step]}`}
      style={{ alignItems: 'center', gap: space.lg, paddingVertical: space.xl }}
    >
      <View style={[styles.scanFrame, { backgroundColor: colors.photoTile, boxShadow: colors.glow }]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {reduceMotion ? null : <Animated.View style={[styles.scanLine, { backgroundColor: colors.primary, transform: [{ translateY }] }]} />}
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>Recognising your piece</Text>
        <Text style={{ color: colors.textMuted }}>{SCAN_STEPS[step]}</Text>
      </View>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.lg, borderRadius: radius.lg },
  viewfinder: { width: '100%', maxWidth: 360, aspectRatio: 1.15, alignSelf: 'center', borderRadius: radius.lg + 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vfBlob: { position: 'absolute', width: 170, height: 170, borderRadius: 85, opacity: 0.35, right: -40, bottom: -50 },
  corner: { position: 'absolute', width: 36, height: 36 },
  shutter: { position: 'absolute', bottom: 16, alignSelf: 'center', width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  tips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.md },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  photoCard: { width: '100%', maxWidth: 420, aspectRatio: 1, alignSelf: 'center', borderRadius: radius.lg, overflow: 'hidden' },
  aiBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  notice: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  scanFrame: { width: SCAN_SIZE, height: SCAN_SIZE, borderRadius: radius.lg, overflow: 'hidden' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 4, opacity: 0.9, boxShadow: '0 0 18px 6px rgba(167, 139, 250, 0.7)' },
});
