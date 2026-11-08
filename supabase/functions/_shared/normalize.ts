// Structured outputs guarantee JSON shape, but enum constraints are only passed to the model as hints.
// Enum-like fields are therefore requested as strings and normalised here, so one unexpected word
// (e.g. "pants", "fall") never fails a whole request.
import { CATEGORIES } from "./wardrobe.ts";

type Category = (typeof CATEGORIES)[number];

const CATEGORY_SYNONYMS: Record<string, Category> = {
  pants: "trousers", trouser: "trousers", chinos: "trousers", slacks: "trousers",
  "t-shirt": "tshirt", tee: "tshirt", "t shirt": "tshirt",
  blouse: "shirt", polo: "shirt",
  sweater: "knitwear", jumper: "knitwear", cardigan: "knitwear", hoodie: "knitwear", sweatshirt: "knitwear",
  jacket: "outerwear", coat: "outerwear", blazer: "outerwear", parka: "outerwear",
  sneakers: "shoes", trainers: "shoes", boots: "shoes", sandals: "shoes", heels: "shoes", footwear: "shoes",
  handbag: "bag", backpack: "bag", purse: "bag",
  jewelry: "accessory", jewellery: "accessory", belt: "accessory", hat: "accessory", scarf: "accessory",
  watch: "accessory", accessories: "accessory",
  sportswear: "activewear", gymwear: "activewear",
  denim: "jeans", dresses: "dress", skirts: "skirt",
};

export function normalizeCategory(value: string): Category {
  const key = value.trim().toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category;
  return CATEGORY_SYNONYMS[key] ?? "other";
}

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export function normalizeSeasons(values: string[]): string[] {
  const mapped = values.map((v) => {
    const key = v.trim().toLowerCase();
    if (key === "fall") return "autumn";
    if (key === "all" || key === "all seasons" || key === "year-round") return SEASONS;
    return key;
  }).flat();
  return [...new Set(mapped.filter((s) => (SEASONS as readonly string[]).includes(s)))];
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const key = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(key) ? (key as T) : fallback;
}
