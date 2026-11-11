import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import type { OutfitState } from '@/components/OutfitActions';
import { Text } from '@/components/Text';
import { useAppData } from '@/lib/data';
import { toLooks } from '@/lib/looks';
import { categoryLabel } from '@/lib/types';
import type { Look } from './types';
import { addSuggestionToShoppingList } from '@/lib/shopping';
import { fonts, space, useTheme } from '@/lib/theme';
import type { StylistOutfit } from '@/lib/types';
import { ItemExplorer } from './ItemExplorer';
import { OutfitDetail, type ShoppingState } from './OutfitDetail';
import { OutfitRail } from './OutfitRail';

type Stage = { name: 'gallery' } | { name: 'detail'; look: number } | { name: 'item'; look: number; key: string };

/**
 * "Shop the look" for the AI stylist's answer: a gallery of full-body looks (stage 1), one look with
 * hotspots and its pieces (stage 2), and a single piece up close (stage 3). It only presents the
 * outfits it is given (the stylist's real response); saving, planning, wear logging and the shopping
 * list go through the app's existing functions. Stage changes keep the gallery position, each look's
 * saved/planned state and what was added to the shopping list.
 */
export function StylistOutfitGallery({ outfits, requestText }: { outfits: StylistOutfit[]; requestText?: string }) {
  const { colors } = useTheme();
  const { itemById } = useAppData();
  const looks: Look[] = useMemo(() => toLooks(outfits, itemById, categoryLabel), [outfits, itemById]);
  const [stage, setStage] = useState<Stage>({ name: 'gallery' });
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [actionStates, setActionStates] = useState<Record<number, OutfitState>>({});
  const [added, setAdded] = useState<Set<string>>(() => new Set());

  const shopping: ShoppingState = {
    added,
    add: async (look: Look, key: string) => {
      const item = look.items.find((i) => i.key === key);
      if (!item?.suggestion) return;
      await addSuggestionToShoppingList(item.suggestion, look.outfit.item_ids);
      setAdded((prev) => new Set(prev).add(`${look.index}:${key}`));
    },
  };

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

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: space.lg }}>
      {stage.name === 'gallery' ? (
        <>
          <View style={{ gap: space.xs }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text }}>
              Your style, curated.
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Outfits thoughtfully put together for you.</Text>
          </View>
          {width > 0 ? (
            // Bleeds to the screen edges so neighbouring looks peek in.
            <View style={{ marginHorizontal: -space.lg }}>
              <OutfitRail
                looks={looks}
                width={width + space.lg * 2}
                initialIndex={galleryIndex}
                onIndexChange={setGalleryIndex}
                onOpen={(look) => openLook(look.index)}
              />
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
