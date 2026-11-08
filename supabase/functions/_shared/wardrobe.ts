import type { RequestContext } from "./context.ts";

export const CATEGORIES = [
  "top", "shirt", "tshirt", "knitwear", "trousers", "jeans", "shorts", "skirt",
  "dress", "jumpsuit", "outerwear", "suit", "activewear", "traditional",
  "shoes", "bag", "accessory", "other",
] as const;

interface ItemRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  material: string | null;
  style_tags: string[];
  formality: number | null;
  seasons: string[];
  occasions: string[];
  description: string | null;
  notes: string | null;
  times_worn: number;
  last_worn_at: string | null;
}

/**
 * The user's wardrobe with short reference codes (i1, i2, ...).
 * The AI model only ever sees and returns these codes; `resolve` maps them back to real item ids,
 * which guarantees recommendations can never reference clothes the user does not own.
 */
export interface WardrobeSnapshot {
  items: ItemRow[];
  codeToId: Map<string, string>;
  idToCode: Map<string, string>;
  text: string;
  resolve(codes: string[]): string[];
  /** Replaces item codes in prose ("pairs with i3") with item names. */
  nameCodes(text: string): string;
}

/** Most items included in one prompt; bounds the tokens (and cost) of a single AI call. */
export const MAX_PROMPT_ITEMS = 400;

/**
 * User-written text as one prompt-safe line: control characters and line breaks become spaces (so a
 * note cannot start a new prompt section), whitespace is collapsed, and the result is cut to `max`.
 */
export function promptText(value: unknown, max: number): string {
  // Cc = control characters (including line breaks), Zl/Zp = Unicode line and paragraph separators.
  const text = String(value ?? "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** A list of user-written values for a prompt: at most `count` entries of at most `max` characters. */
const promptList = (values: unknown, count: number, max: number) =>
  (Array.isArray(values) ? values : []).slice(0, count).map((v) => promptText(v, max)).filter(Boolean).join(", ");

export async function loadWardrobe(ctx: RequestContext): Promise<WardrobeSnapshot> {
  // RLS already limits rows to the caller; the explicit owner filter keeps that true even if a
  // policy were ever widened.
  const { data, error } = await ctx.db
    .from("wardrobe_items")
    .select("id,name,category,subcategory,colors,pattern,material,style_tags,formality,seasons,occasions,description,notes,times_worn,last_worn_at")
    .eq("user_id", ctx.user.id)
    .eq("archived", false)
    .order("category")
    .order("created_at")
    .limit(MAX_PROMPT_ITEMS + 1);
  if (error) throw error;

  const rows = (data ?? []) as ItemRow[];
  const items = rows.slice(0, MAX_PROMPT_ITEMS);
  const codeToId = new Map<string, string>();
  const idToCode = new Map<string, string>();
  const lines = items.map((item, index) => {
    const code = `i${index + 1}`;
    codeToId.set(code, item.id);
    idToCode.set(item.id, code);
    // Everything except the category, numbers and dates was typed by the user (or by the AI and then
    // edited), so it is treated as untrusted text: one line each, with length limits.
    const attrs = [
      item.category + (item.subcategory ? `/${promptText(item.subcategory, 40)}` : ""),
      item.colors.length ? `colors: ${promptList(item.colors, 6, 30)}` : null,
      item.pattern && item.pattern !== "solid" ? `pattern: ${promptText(item.pattern, 40)}` : null,
      item.material ? `material: ${promptText(item.material, 40)}` : null,
      item.formality ? `formality ${item.formality}/5` : null,
      item.style_tags.length ? `style: ${promptList(item.style_tags, 8, 30)}` : null,
      item.seasons.length ? `seasons: ${promptList(item.seasons, 4, 10)}` : null,
      item.occasions.length ? `occasions: ${promptList(item.occasions, 8, 40)}` : null,
      item.notes ? `owner notes: ${promptText(item.notes, 200)}` : null,
      `worn ${item.times_worn}x` + (item.last_worn_at ? `, last ${item.last_worn_at}` : ""),
    ].filter(Boolean);
    return `${code}: ${promptText(item.name, 80)} — ${attrs.join("; ")}`;
  });
  if (rows.length > MAX_PROMPT_ITEMS) lines.push(`(more items exist but are not listed; use only the codes above)`);

  return {
    items,
    codeToId,
    idToCode,
    text: lines.length ? lines.join("\n") : "(the wardrobe is empty)",
    resolve(codes) {
      const ids = codes.map((c) => codeToId.get(c.trim())).filter((id): id is string => Boolean(id));
      return [...new Set(ids)];
    },
    nameCodes(text) {
      return text.replace(/\bi\d+\b/g, (code) => {
        const id = codeToId.get(code);
        return id ? items.find((item) => item.id === id)!.name : code;
      });
    },
  };
}

/** What the user wore in the last week, as item codes, so outfits are not repeated too soon. */
export async function loadRecentWears(ctx: RequestContext, wardrobe: WardrobeSnapshot): Promise<string> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await ctx.db
    .from("wear_log")
    .select("worn_on,item_ids")
    .eq("user_id", ctx.user.id)
    .gte("worn_on", since)
    .order("worn_on", { ascending: false })
    .limit(14);
  if (error) throw error;

  const lines = (data ?? [])
    .map((w: { worn_on: string; item_ids: string[] }) => {
      const codes = w.item_ids.map((id) => wardrobe.idToCode.get(id)).filter(Boolean);
      return codes.length ? `- ${w.worn_on}: ${codes.join(" + ")}` : null;
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "(nothing logged this week)";
}

/** Most liked and most disliked combinations included in a prompt (each). */
export const MAX_FEEDBACK = 15;

export interface OutfitFeedback {
  /** Prompt text: liked and disliked combinations as item codes. */
  text: string;
  /** Disliked combinations as item ids, for filtering suggestions. */
  disliked: string[][];
}

/**
 * The user's recent thumbs up / down on outfits. Only combinations whose items are all still in the
 * wardrobe are used, and only as item codes, so no free text reaches the prompt.
 */
export async function loadFeedback(ctx: RequestContext, wardrobe: WardrobeSnapshot): Promise<OutfitFeedback> {
  const { data, error } = await ctx.db
    .from("outfit_feedback")
    .select("item_ids,rating")
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return summarizeFeedback((data ?? []) as { item_ids: string[]; rating: number }[], wardrobe);
}

export function summarizeFeedback(
  rows: { item_ids: string[]; rating: number }[],
  wardrobe: Pick<WardrobeSnapshot, "idToCode">,
): OutfitFeedback {
  const complete = rows.filter((r) => r.item_ids.length > 0 && r.item_ids.every((id) => wardrobe.idToCode.has(id)));
  const liked = complete.filter((r) => r.rating > 0).slice(0, MAX_FEEDBACK);
  const disliked = complete.filter((r) => r.rating < 0).slice(0, MAX_FEEDBACK);
  const codes = (ids: string[]) => ids.map((id) => wardrobe.idToCode.get(id)).join(" + ");
  const lines = [
    ...liked.map((r) => `- liked: ${codes(r.item_ids)}`),
    ...disliked.map((r) => `- disliked: ${codes(r.item_ids)}`),
  ];
  return {
    text: lines.length ? lines.join("\n") : "(no outfit feedback yet)",
    disliked: disliked.map((r) => r.item_ids),
  };
}

/** Only the profile fields the AI needs (not measurements, consent or timestamps). */
const PROFILE_FIELDS =
  "style_direction,style_preferences,favorite_colors,avoid_colors,fit_preferences,comfort_notes,lifestyle_occasions,budget_level,currency,sizes";

export async function loadProfileSummary(ctx: RequestContext): Promise<string> {
  const { data: p, error } = await ctx.db.from("profiles").select(PROFILE_FIELDS).eq("id", ctx.user.id).single();
  if (error) throw error;
  return profileSummary(p);
}

/** The profile as prompt text. Every user-written value is one line, length-limited (see promptText). */
export function profileSummary(p: Record<string, unknown>): string {
  const sizes = p.sizes && typeof p.sizes === "object" && !Array.isArray(p.sizes)
    ? Object.entries(p.sizes as Record<string, unknown>).slice(0, 10)
      .map(([key, value]) => `${promptText(key, 20)} ${promptText(value, 20)}`).join(", ")
    : "";
  const list = (key: string) => promptList(p[key], 12, 40);
  const parts = [
    p.style_direction && p.style_direction !== "no_preference" ? `Shops mostly: ${promptText(p.style_direction, 20)}` : null,
    list("style_preferences") ? `Preferred styles: ${list("style_preferences")}` : null,
    list("favorite_colors") ? `Favourite colours: ${list("favorite_colors")}` : null,
    list("avoid_colors") ? `Colours to avoid: ${list("avoid_colors")}` : null,
    list("fit_preferences") ? `Fit preferences: ${list("fit_preferences")}` : null,
    p.comfort_notes ? `Comfort notes: ${promptText(p.comfort_notes, 300)}` : null,
    list("lifestyle_occasions") ? `Frequent occasions: ${list("lifestyle_occasions")}` : null,
    p.budget_level ? `Shopping budget: ${promptText(p.budget_level, 10)} (${promptText(p.currency, 3)})` : null,
    sizes ? `Sizes: ${sizes}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "(no preferences provided yet)";
}
