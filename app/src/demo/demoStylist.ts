// Demo-mode stand-in for the AI stylist: simple, deterministic rules over the sample wardrobe.
// It runs entirely on the device and never calls the AI service. Results say so explicitly.
import type { MissingItem, StylistOutfit, StylistResult, WardrobeItem } from '../lib/types';

export interface DemoStylistRequest {
  occasion?: string;
  request?: string;
  count?: number;
  anchorItemIds?: string[];
  avoidOutfits?: string[][];
  allowPurchases?: boolean;
}

const UPPER = new Set(['top', 'shirt', 'tshirt', 'knitwear']);
const LOWER = new Set(['trousers', 'jeans', 'shorts', 'skirt']);
const ONE_PIECE = new Set(['dress', 'jumpsuit', 'suit', 'traditional']);
const NEUTRALS = new Set(['black', 'white', 'navy', 'grey', 'gray', 'charcoal', 'beige', 'cream', 'brown', 'camel', 'tan']);

// Target formality (1 very casual .. 5 black tie) from words in the occasion or request.
const FORMALITY_RULES: [RegExp, number][] = [
  [/wedding|formal|gala|black tie/i, 4.5],
  [/interview|business|meeting/i, 4],
  [/office|work|date|religious|cultural|dinner/i, 3],
  [/party|celebration/i, 3],
  [/university|college|class|travel|trip/i, 2],
  [/casual|everyday|weekend|hangout/i, 1.5],
  [/gym|sport|run|training|workout/i, 1],
];

function targetFormality(text: string) {
  for (const [pattern, value] of FORMALITY_RULES) if (pattern.test(text)) return value;
  return 2;
}

const formalityOf = (item: WardrobeItem) => item.formality ?? 2.5;
const distance = (item: WardrobeItem, target: number) => Math.abs(formalityOf(item) - target);
const best = (items: WardrobeItem[], target: number) =>
  [...items].sort((a, b) => distance(a, target) - distance(b, target))[0];
const comboKey = (ids: string[]) => [...ids].sort().join('|');

export function generateDemoOutfits(items: WardrobeItem[], req: DemoStylistRequest): StylistResult {
  const text = `${req.occasion ?? ''} ${req.request ?? ''}`.trim();
  const label = req.occasion || (req.request ? `"${req.request}"` : 'this request');
  const count = Math.min(Math.max(req.count ?? 3, 1), 4);
  const target = targetFormality(text);
  const sporty = target <= 1;

  const anchors = (req.anchorItemIds ?? [])
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is WardrobeItem => Boolean(i));
  const anchor = anchors[0];

  const upper = items.filter((i) => UPPER.has(i.category));
  const lower = items.filter((i) => LOWER.has(i.category));
  const onePieces = items.filter((i) => ONE_PIECE.has(i.category));
  const active = items.filter((i) => i.category === 'activewear');
  const shoes = items.filter((i) => i.category === 'shoes');
  const outerwear = items.filter((i) => i.category === 'outerwear');
  const accessories = items.filter((i) => i.category === 'accessory');

  // Candidate bases: top + bottom pairs, one-pieces, and (for sport) activewear sets.
  type Base = { ids: string[]; score: number; names: string[] };
  const bases: Base[] = [];
  for (const top of upper) {
    for (const bottom of lower) {
      bases.push({ ids: [top.id, bottom.id], score: distance(top, target) + distance(bottom, target), names: [top.name, bottom.name] });
    }
  }
  for (const piece of [...onePieces, ...active]) {
    const sportBonus = sporty && piece.category === 'activewear' ? -2 : 0;
    bases.push({ ids: [piece.id], score: distance(piece, target) * 2 + sportBonus, names: [piece.name] });
  }
  bases.sort((a, b) => a.score - b.score);

  const anchorIsBase = anchor && (UPPER.has(anchor.category) || LOWER.has(anchor.category) || ONE_PIECE.has(anchor.category) || anchor.category === 'activewear');
  const usableBases = anchorIsBase ? bases.filter((b) => b.ids.includes(anchor.id)) : bases;

  const avoid = new Set((req.avoidOutfits ?? []).map(comboKey));
  const outfits: StylistOutfit[] = [];
  const usedBases = new Set<string>();

  for (const base of usableBases) {
    if (outfits.length >= count) break;
    const baseKey = comboKey(base.ids);
    if (usedBases.has(baseKey)) continue;

    const ids = [...base.ids];
    const shoe = anchor?.category === 'shoes' ? anchor : best(shoes, target);
    if (shoe) ids.push(shoe.id);
    const layer = anchor?.category === 'outerwear' ? anchor : target >= 3.5 || outfits.length % 2 === 1 ? best(outerwear, target) : undefined;
    // The item the user asked to build around is always included, even if it is dressier than the occasion.
    if (layer && (layer === anchor || distance(layer, target) <= 1.5)) ids.push(layer.id);
    const extra = anchor && ['accessory', 'bag'].includes(anchor.category) ? anchor : target >= 3 ? best(accessories, target) : undefined;
    if (extra) ids.push(extra.id);

    const key = comboKey(ids);
    if (avoid.has(key)) continue;
    usedBases.add(baseKey);

    const chosen = ids.map((id) => items.find((i) => i.id === id)!);
    const colors = chosen.flatMap((i) => i.colors.map((c) => c.toLowerCase()));
    const neutral = colors.every((c) => NEUTRALS.has(c));

    const missing: MissingItem[] = [];
    if (req.allowPurchases !== false) {
      if (!shoe || distance(shoe, target) > 1.5) {
        missing.push(target >= 3.5
          ? { name: 'Smart leather shoes', category: 'shoes', reason: 'Would match the dress code better than the shoes in the sample wardrobe.' }
          : { name: 'Versatile white sneakers', category: 'shoes', reason: 'Pair easily with most casual outfits.' });
      }
      if (target >= 4 && !ids.some((id) => outerwear.some((o) => o.id === id))) {
        missing.push({ name: 'Tailored blazer', category: 'outerwear', reason: 'Adds polish for formal occasions.' });
      }
    }

    outfits.push({
      title: `${base.names.join(' + ')}`,
      occasion: req.occasion || 'Demo suggestion',
      item_ids: ids,
      missing_items: missing,
      explanation:
        `Demo suggestion generated on this device from the sample wardrobe; no AI was used. ` +
        `${neutral ? 'The pieces stick to neutral colours, so they combine easily' : 'The colours are balanced by neutral basics'}, ` +
        `and their formality suits ${label}.`,
      styling_tips: target >= 3.5
        ? ['Keep accessories minimal and polished.', 'Make sure the trousers or hem are pressed.']
        : sporty
          ? ['Choose breathable layers you can remove as you warm up.']
          : ['Roll the sleeves or cuffs for a relaxed finish.'],
      weather_note: '',
    });
  }

  return {
    understood_request: `Demo mode: sample outfits for ${label}, generated on this device from sample data (no AI).`,
    wardrobe_note: outfits.length < count
      ? `The sample wardrobe only allows ${outfits.length} different outfit${outfits.length === 1 ? '' : 's'} for this request.`
      : '',
    weather: null,
    outfits,
  };
}
