import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { OutfitState } from '@/components/OutfitActions';
import { Text } from '@/components/Text';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAppData } from '@/lib/data';
import { toLooks } from '@/lib/looks';
import { addSuggestionToShoppingList } from '@/lib/shopping';
import { fonts, radius, shadowFor, space, useTheme } from '@/lib/theme';
import { categoryLabel } from '@/lib/types';
import type { StylistOutfit } from '@/lib/types';
import { ItemExplorer } from './ItemExplorer';
import { OutfitDetail, type ModelPhotoState, type ShoppingState } from './OutfitDetail';
import { PieceThumb } from './OutfitItemsPanel';
import { OwnershipBadge } from './OutfitPreview';
import { OutfitRail } from './OutfitRail';
import type { Look } from './types';

type Stage = { name: 'gallery' } | { name: 'detail'; look: number } | { name: 'item'; look: number; key: string };

const SIDE_PANEL_MIN_WIDTH = 860;

/**
 * "Shop the look" for the AI stylist's answer: a lineup of full-body looks (stage 1), one look with
 * hotspots and its pieces (stage 2), and a single piece up close (stage 3). It only presents the
 * outfits it is given (the stylist's real response); saving, planning, wear logging and the shopping
 * list go through the app's existing functions. Each look is shown on a mannequin dressed in the
 * user's own clothes, or as an AI model photo once one has been created. Stage changes keep the
 * gallery position, each look's saved/planned state, model photos and what was added to the list.
 */
export function StylistOutfitGallery({ outfits, requestText }: { outfits: StylistOutfit[]; requestText?: string }) {
  const { colors } = useTheme();
  const { itemById, demoActive, profile } = useAppData();
  const looks: Look[] = useMemo(() => toLooks(outfits, itemById, categoryLabel), [outfits, itemById]);
  const [stage, setStage] = useState<Stage>({ name: 'gallery' });
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [actionStates, setActionStates] = useState<Record<number, OutfitState>>({});
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [photos, setPhotos] = useState<Record<number, string>>({});
  const [photoBusy, setPhotoBusy] = useState<Record<number, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<number, string>>({});
  // Model photos are made automatically for the look in focus. After an error that will repeat (no
  // billing, daily limit), stop asking for the rest of the session instead of using up AI requests.
  const [autoStopped, setAutoStopped] = useState(false);
  const autoPhotos = !demoActive && Boolean(profile?.consent_ai_processing) && !autoStopped;

  const shopping: ShoppingState = {
    added,
    add: async (look: Look, key: string) => {
      const item = look.items.find((i) => i.key === key);
      if (!item?.suggestion) return;
      await addSuggestionToShoppingList(item.suggestion, look.outfit.item_ids);
      setAdded((prev) => new Set(prev).add(`${look.index}:${key}`));
    },
  };

  const createPhoto = useCallback(async (look: Look) => {
    const owned = look.items.filter((i) => i.ownership === 'owned').map((i) => i.key);
    if (!owned.length) return; // nothing of the user's to dress the model in
    setPhotoBusy((p) => ({ ...p, [look.index]: true }));
    setPhotoErrors((p) => ({ ...p, [look.index]: '' }));
    try {
      const missing = look.items
        .filter((i) => i.ownership === 'suggested')
        .map((i) => ({ name: i.name, category: i.suggestion?.category ?? '' }));
      const { url } = await api.lookImage({ item_ids: owned, missing_items: missing });
      setPhotos((p) => ({ ...p, [look.index]: url }));
    } catch (e) {
      const message = (e as Error).message;
      setPhotoErrors((p) => ({ ...p, [look.index]: message }));
      if (/billing|limit|not configured|not available/i.test(message)) setAutoStopped(true);
    } finally {
      setPhotoBusy((p) => ({ ...p, [look.index]: false }));
    }
  }, []);

  const modelPhoto = (look: Look): ModelPhotoState => ({
    url: photos[look.index] ?? null,
    busy: Boolean(photoBusy[look.index]),
    error: photoErrors[look.index] ?? null,
    create: () => createPhoto(look),
  });

  // The look in focus (centred in the lineup, or open) gets its model photo automatically.
  const focusIndex = stage.name === 'gallery' ? galleryIndex : stage.look;
  useEffect(() => {
    const look = looks[focusIndex];
    if (!autoPhotos || !look || photos[focusIndex] || photoBusy[focusIndex] || photoErrors[focusIndex]) return;
    // A short pause, so looks that are only swiped past don't each start (and pay for) a photo.
    const timer = setTimeout(() => void createPhoto(look), 600);
    return () => clearTimeout(timer);
  }, [autoPhotos, focusIndex, looks, photos, photoBusy, photoErrors, createPhoto]);

  const back = useCallback(() => {
    setStage((s) => (s.name === 'item' ? { name: 'detail', look: s.look } : { name: 'gallery' }));
  }, []);

  // Web: Escape steps back one stage.
  useEffect(() => {
    if (Platform.OS !== 'web' || stage.name === 'gallery') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage.name, back]);

  if (!looks.length) return null;
  const openLook = (index: number) => {
    setGalleryIndex(index); // so "All looks" returns to the look you were on
    setStage({ name: 'detail', look: index });
  };
  const sidePanel = width >= SIDE_PANEL_MIN_WIDTH;
  const focused = looks[Math.min(galleryIndex, looks.length - 1)];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: space.lg }}>
      {stage.name === 'gallery' ? (
        <>
          <View style={{ gap: space.xs }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text }}>
              Your style, curated.
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Outfits thoughtfully put together for you, from your own wardrobe.</Text>
          </View>
          {width > 0 ? (
            <View style={sidePanel ? styles.row : { gap: space.lg }}>
              {/* The studio: one light backdrop the looks stand in, like a lookbook shoot. */}
              <View style={[styles.studio, sidePanel ? { flex: 1 } : { marginHorizontal: -space.lg, borderRadius: 0 }]}>
                <OutfitRail
                  looks={looks}
                  width={sidePanel ? width - PANEL_WIDTH - space.xl : width + space.lg * 2}
                  initialIndex={galleryIndex}
                  onIndexChange={setGalleryIndex}
                  onOpen={(look) => openLook(look.index)}
                  photoUrls={photos}
                  generating={photoBusy}
                />
              </View>
              <FocusedLookPanel look={focused} compact={!sidePanel} photoError={photoErrors[focused.index] || null} onOpen={() => openLook(focused.index)} />
            </View>
          ) : null}
        </>
      ) : stage.name === 'detail' ? (
        <OutfitDetail
          key={stage.look}
          look={looks[stage.look]}
          total={looks.length}
          actionState={actionStates[stage.look]}
          onActionChange={(s) => setActionStates((prev) => ({ ...prev, [stage.look]: s }))}
          requestText={requestText}
          shopping={shopping}
          modelPhoto={modelPhoto(looks[stage.look])}
          onBack={back}
          onStep={(delta) => openLook(Math.max(0, Math.min(looks.length - 1, stage.look + delta)))}
          onExplore={(key) => setStage({ name: 'item', look: stage.look, key })}
        />
      ) : (
        <ItemExplorer
          key={`${stage.look}:${stage.key}`}
          look={looks[stage.look]}
          looks={looks}
          initialKey={stage.key}
          shopping={shopping}
          onBack={back}
          onOpenLook={openLook}
        />
      )}
    </View>
  );
}

const PANEL_WIDTH = 300;

/** Beside the lineup on wide screens (below it on phones): the centred look's pieces and Open. */
function FocusedLookPanel({ look, compact, photoError, onOpen }: { look: Look; compact: boolean; photoError: string | null; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, compact ? null : { width: PANEL_WIDTH }, { backgroundColor: colors.surface }, shadowFor(colors)]}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.6 }}>
          LOOK {look.number} · {look.occasion.toUpperCase()}
        </Text>
        <Text numberOfLines={2} style={{ color: colors.text, fontFamily: fonts.displaySemibold, fontSize: 20, letterSpacing: -0.3 }}>
          {look.title}
        </Text>
        <OwnershipBadge look={look} />
        {photoError ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Model photo unavailable: {photoError}</Text>
        ) : null}
      </View>
      {compact ? null : (
        <View style={{ gap: space.sm }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>In this look</Text>
          {look.items.slice(0, 5).map((item) => (
            <View key={item.key} style={styles.pieceRow}>
              <PieceThumb item={item} size={48} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {item.ownership === 'owned' ? item.category : 'Suggested · not owned'}
                </Text>
              </View>
            </View>
          ))}
          {look.items.length > 5 ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>+{look.items.length - 5} more</Text> : null}
        </View>
      )}
      <Button variant="ink" icon="arrow-forward" title="Open the look" onPress={onOpen} style={compact ? undefined : { marginTop: 'auto' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xl, alignItems: 'stretch' },
  studio: { backgroundColor: '#F3F1F6', borderRadius: radius.lg + 4, overflow: 'hidden', paddingBottom: space.md },
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  pieceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
