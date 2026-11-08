// Wardrobe insights computed on the device from data the app already has: wear counts, last-worn
// dates and optional purchase prices. No network and no AI. Kept free of React Native and app-alias
// imports so it can be unit-tested offline (supabase/tests/insights_test.ts).

/** The item fields insights need; WardrobeItem satisfies this. */
export interface InsightItem {
  id: string;
  name: string;
  category: string;
  times_worn: number;
  last_worn_at: string | null;
  purchase_price: number | null;
  created_at: string;
}

/** An item is "resting" when its last wear is at least this many days ago. */
export const RESTING_DAYS = 90;
/** Items added this recently are not called "never worn" yet. */
export const NEW_ITEM_DAYS = 14;
const LIST_SIZE = 5;

export interface PricedItem<T extends InsightItem> {
  item: T;
  /** Price divided by wears; null when the item has not been worn. */
  costPerWear: number | null;
}

export interface WardrobeInsights<T extends InsightItem> {
  total: number;
  /** Share of items (0..1) worn within the last RESTING_DAYS days; null for an empty wardrobe. */
  activeShare: number | null;
  activeCount: number;
  /** Never worn and added more than NEW_ITEM_DAYS days ago, oldest first. */
  neverWorn: T[];
  /** Worn before, but not within RESTING_DAYS days, longest resting first. */
  resting: T[];
  /** Items with a price; empty when the user has not entered any. */
  pricedCount: number;
  totalSpent: number;
  /** Total spent on worn priced items divided by their wears; null without such items. */
  averageCostPerWear: number | null;
  /** Lowest cost per wear first (worn items only). */
  bestValue: PricedItem<T>[];
  /** Highest cost per wear first (worn items only). */
  highestCostPerWear: PricedItem<T>[];
  /** Money in priced items that have never been worn. */
  unwornValue: number;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD or ISO timestamps; only the date part is used). */
export function daysBetween(from: string, to: string): number {
  const day = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((day(to) - day(from)) / 86_400_000);
}

const hasPrice = (item: InsightItem) =>
  typeof item.purchase_price === 'number' && Number.isFinite(item.purchase_price) && item.purchase_price >= 0;

export function costPerWear(item: InsightItem): number | null {
  return hasPrice(item) && item.times_worn > 0 ? item.purchase_price! / item.times_worn : null;
}

/** All insights for `items` as of `today` (the user's local date, YYYY-MM-DD). */
export function wardrobeInsights<T extends InsightItem>(items: T[], today: string): WardrobeInsights<T> {
  const restingFor = (item: T) => (item.last_worn_at ? daysBetween(item.last_worn_at, today) : Infinity);
  const worn = items.filter((i) => i.times_worn > 0);
  const active = worn.filter((i) => restingFor(i) < RESTING_DAYS);

  const neverWorn = items
    .filter((i) => i.times_worn === 0 && daysBetween(i.created_at, today) > NEW_ITEM_DAYS)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  // A worn item without a last-worn date (older data) counts as resting rather than active.
  const resting = worn
    .filter((i) => restingFor(i) >= RESTING_DAYS)
    .sort((a, b) => restingFor(b) - restingFor(a));

  const priced = items.filter(hasPrice);
  const pricedWorn: PricedItem<T>[] = priced
    .filter((i) => i.times_worn > 0)
    .map((item) => ({ item, costPerWear: costPerWear(item) }));
  const byCost = [...pricedWorn].sort((a, b) => a.costPerWear! - b.costPerWear!);
  const wornSpent = pricedWorn.reduce((sum, p) => sum + p.item.purchase_price!, 0);
  const wornWears = pricedWorn.reduce((sum, p) => sum + p.item.times_worn, 0);

  return {
    total: items.length,
    activeShare: items.length ? active.length / items.length : null,
    activeCount: active.length,
    neverWorn,
    resting,
    pricedCount: priced.length,
    totalSpent: priced.reduce((sum, i) => sum + i.purchase_price!, 0),
    averageCostPerWear: wornWears ? wornSpent / wornWears : null,
    bestValue: byCost.slice(0, LIST_SIZE),
    // Only items that are not already listed as best value, so a small wardrobe does not show one twice.
    highestCostPerWear: byCost.slice(LIST_SIZE).reverse().slice(0, LIST_SIZE),
    unwornValue: priced.filter((i) => i.times_worn === 0).reduce((sum, i) => sum + i.purchase_price!, 0),
  };
}

/**
 * Parses a price typed by the user: digits with an optional "." or "," and up to two decimals.
 * Returns undefined for text that is not (yet) a valid price, and null for an empty field.
 */
export function parsePrice(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d{1,8}([.,]\d{0,2})?$/.test(value)) return undefined;
  return Number(value.replace(',', '.'));
}

/** A money amount in the user's currency; falls back to "EUR 12.50" if the runtime lacks the currency. */
export function formatMoney(amount: number, currency: string): string {
  const decimals = amount !== 0 && Math.abs(amount) < 10 ? 2 : amount % 1 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}
