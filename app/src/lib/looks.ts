// Presentation model for the stylist's "Shop the look" experience.
//
// Maps the AI stylist's real response (StylistResult.outfits from the `stylist` Edge Function, or the
// demo stylist's local equivalent) into looks for the gallery, the outfit detail and the item explorer.
// Nothing here generates or invents outfits: every owned piece is a real wardrobe item (looked up by id),
// and every suggested piece is one of the outfit's `missing_items`, always marked as not owned.
//
// No app imports (like lib/insights.ts), so it can be unit-tested offline (supabase/tests/looks_test.ts).
// The types below are the parts of WardrobeItem / StylistOutfit / MissingItem (lib/types.ts) it uses.

export interface LookMissingItem {
  name: string;
  category: string;
  reason: string;
}

export interface LookOutfit {
  title: string;
  occasion: string;
  item_ids: string[];
  missing_items: LookMissingItem[];
  explanation: string;
  styling_tips: string[];
  weather_note: string;
  inspiration_query?: string;
}

export interface LookWardrobeItem {
  id: string;
  name: string;
  category: string;
  colors: string[];
}

/** Where a piece sits on the full-body figure. */
export type Zone = 'outer' | 'top' | 'onepiece' | 'bottom' | 'feet' | 'accessory';

export interface LookItem<W extends LookWardrobeItem = LookWardrobeItem> {
  /** Stable within a look: the wardrobe item id, or `suggested:<index>`. */
  key: string;
  name: string;
  /** Display category ("Shirts", "Shoes", or the AI's own wording for a suggestion). */
  category: string;
  colors: string[];
  ownership: 'owned' | 'suggested';
  zone: Zone;
  /** Owned pieces only. */
  wardrobeItem?: W;
  /** Suggested pieces only: the AI's missing item, including why it was suggested. */
  suggestion?: LookMissingItem;
}

export interface Look<W extends LookWardrobeItem = LookWardrobeItem, O extends LookOutfit = LookOutfit> {
  /** Position in the stylist's answer (0-based); "LOOK 01" is index 0. */
  index: number;
  number: string;
  title: string;
  occasion: string;
  /** First sentence of the AI's explanation, for the gallery card. */
  summary: string;
  explanation: string;
  tips: string[];
  weatherNote: string;
  inspirationQuery: string;
  items: LookItem<W>[];
  ownedCount: number;
  suggestedCount: number;
  /** Pieces of the saved/suggested outfit that are no longer in the wardrobe. */
  removedCount: number;
  /** Share of the core outfit (top + bottom, or a one-piece, plus shoes) covered by owned pieces. */
  completeness: number;
  /** The untouched AI outfit, for saving, planning and logging through the existing actions. */
  outfit: O;
}

const ZONE_BY_CATEGORY: Record<string, Zone> = {
  outerwear: 'outer', suit: 'onepiece',
  top: 'top', shirt: 'top', tshirt: 'top', knitwear: 'top', activewear: 'top',
  dress: 'onepiece', jumpsuit: 'onepiece', traditional: 'onepiece',
  trousers: 'bottom', jeans: 'bottom', shorts: 'bottom', skirt: 'bottom',
  shoes: 'feet',
  bag: 'accessory', accessory: 'accessory', other: 'accessory',
};

// Suggestions carry the AI's free-text category ("Footwear", "Light jacket", "Dupatta"), so match words.
const ZONE_WORDS: [RegExp, Zone][] = [
  [/shoe|sneaker|trainer|boot|loafer|heel|sandal|khussa|jutti|footwear|slipper|flat/i, 'feet'],
  [/coat|jacket|blazer|cardigan|outer|parka|shawl|waistcoat/i, 'outer'],
  [/dress|jumpsuit|saree|sari|lehenga|abaya|kaftan|suit|sherwani|gown|one.?piece/i, 'onepiece'],
  [/trouser|pant|jean|chino|short|skirt|shalwar|legging|bottom/i, 'bottom'],
  [/shirt|tee|top|blouse|sweater|knit|hoodie|kurta|kameez|polo|tank/i, 'top'],
];

export function zoneForCategory(category: string): Zone {
  const known = ZONE_BY_CATEGORY[category];
  if (known) return known;
  return ZONE_WORDS.find(([pattern]) => pattern.test(category))?.[1] ?? 'accessory';
}

const firstSentence = (text: string) => {
  const match = text.match(/^.*?[.!?](\s|$)/);
  const sentence = (match ? match[0] : text).trim();
  return sentence.length > 140 ? `${sentence.slice(0, 139).trimEnd()}…` : sentence;
};

function completenessOf(items: LookItem<LookWardrobeItem>[]) {
  const owned = new Set(items.filter((i) => i.ownership === 'owned').map((i) => i.zone));
  const all = new Set(items.map((i) => i.zone));
  const core: Zone[] = all.has('onepiece') || owned.has('onepiece') ? ['onepiece', 'feet'] : ['top', 'bottom', 'feet'];
  return core.filter((z) => owned.has(z)).length / core.length;
}

/**
 * One stylist outfit as a look. `itemById` resolves the user's (or the demo's) wardrobe items;
 * `categoryLabel` turns a category key into its display name (lib/types.ts categoryLabel).
 */
export function toLook<W extends LookWardrobeItem, O extends LookOutfit>(
  outfit: O,
  index: number,
  itemById: (id: string) => W | undefined,
  categoryLabel: (key: string) => string = (key) => key,
): Look<W, O> {
  const owned = outfit.item_ids.map(itemById).filter((i): i is W => Boolean(i));
  const items: LookItem<W>[] = [
    ...owned.map((item) => ({
      key: item.id,
      name: item.name,
      category: categoryLabel(item.category),
      colors: item.colors,
      ownership: 'owned' as const,
      zone: zoneForCategory(item.category),
      wardrobeItem: item,
    })),
    ...outfit.missing_items.map((m, i) => ({
      key: `suggested:${i}`,
      name: m.name,
      category: m.category || 'Suggested piece',
      colors: [],
      ownership: 'suggested' as const,
      zone: zoneForCategory(`${m.category} ${m.name}`),
      suggestion: m,
    })),
  ];
  return {
    index,
    number: String(index + 1).padStart(2, '0'),
    title: outfit.title,
    occasion: outfit.occasion,
    summary: firstSentence(outfit.explanation ?? ''),
    explanation: outfit.explanation ?? '',
    tips: outfit.styling_tips ?? [],
    weatherNote: outfit.weather_note ?? '',
    inspirationQuery: outfit.inspiration_query ?? '',
    items,
    ownedCount: owned.length,
    suggestedCount: outfit.missing_items.length,
    removedCount: outfit.item_ids.length - owned.length,
    completeness: completenessOf(items),
    outfit,
  };
}

export const toLooks = <W extends LookWardrobeItem, O extends LookOutfit>(
  outfits: O[],
  itemById: (id: string) => W | undefined,
  categoryLabel?: (key: string) => string,
) => outfits.map((o, i) => toLook(o, i, itemById, categoryLabel));

/** Other looks in the same answer that use this wardrobe item. */
export const looksWithItem = <L extends Look<LookWardrobeItem, LookOutfit>>(looks: L[], itemId: string, except: number) =>
  looks.filter((l) => l.index !== except && l.outfit.item_ids.includes(itemId));
