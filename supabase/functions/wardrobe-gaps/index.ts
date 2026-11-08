// Smart shopping assistant: finds gaps in the wardrobe and suggests a few versatile additions
// that combine with many owned pieces, explaining why each one is worth buying.
import { z } from "npm:zod@4.6.7";
import { askModel, textPart } from "../_shared/ai.ts";
import { getContext, requireAiAccess, reserveAiCall } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import { oneOf } from "../_shared/normalize.ts";
import { clip, OUTPUT_LIMITS } from "../_shared/outfits.ts";
import { loadProfileSummary, loadWardrobe } from "../_shared/wardrobe.ts";

const Input = z.object({
  focus: z.string().max(300).optional(), // e.g. "office wear", "a weekend trip"
  max_suggestions: z.number().int().min(1).max(8).default(5),
});

const GapAnalysis = z.object({
  summary: z.string().describe("Two or three sentences on the wardrobe's strengths and main gaps"),
  suggestions: z.array(z.object({
    name: z.string().describe("Specific but brand-free, e.g. 'Straight-leg charcoal wool trousers'"),
    category: z.string(),
    description: z.string(),
    reason: z.string().describe("Which gap it fills and what it unlocks"),
    pairs_with_refs: z.array(z.string()).describe("Codes of owned items it combines with"),
    // Not .int(): a "2.5" from the model is rounded below instead of failing the whole answer.
    new_outfits_estimate: z.number().describe("Roughly how many new outfits it enables, as a whole number"),
    priority: z.string().describe("One of: high, medium, low"),
    price_range: z.string().describe("Typical price range in the user's currency for their budget"),
  })),
  no_purchase_needed: z.array(z.string()).describe("Needs the user can already cover with owned items, with codes"),
});

const SYSTEM = `You are a thoughtful, sustainability-minded wardrobe consultant for people of every gender and style.
Analyse the user's wardrobe and suggest only additions that are genuinely useful:
- Prioritise versatile pieces that combine with many owned items (refer to them by code: i1, i2, ...).
- Respect the profile's style, colours to avoid, and budget.
- Never recommend something the user effectively already owns; mention in no_purchase_needed where existing items already serve a need.
- Fewer, better suggestions beat a long list. It is fine to suggest nothing if the wardrobe is complete.`;

const PRIORITY = { high: 1, medium: 2, low: 3 } as const;

serve(async (req, body) => {
  const ctx = await getContext(req);
  const input = Input.parse(body);

  await requireAiAccess(ctx);

  const [wardrobe, profile] = await Promise.all([loadWardrobe(ctx), loadProfileSummary(ctx)]);
  if (wardrobe.items.length < 3) throw new HttpError(400, "Add at least three items so there is something to analyse.");

  // Reserved last, so a request that fails above never uses up quota.
  await reserveAiCall(ctx);
  const result = await askModel({
    schema: GapAnalysis,
    system: SYSTEM,
    effort: "medium",
    content: [textPart([
      `## Profile\n${profile}`,
      `## Wardrobe\n${wardrobe.text}`,
      input.focus ? `## Focus\n${input.focus}` : null,
      `Suggest at most ${input.max_suggestions} purchases.`,
    ].filter(Boolean).join("\n\n"))],
  });

  // Replace item codes with real ids (unknown codes dropped) and in prose with item names.
  const named = wardrobe.nameCodes;

  // Every field is bounded before it reaches the app (and possibly the user's shopping list).
  return {
    summary: clip(named(result.summary), OUTPUT_LIMITS.text),
    no_purchase_needed: result.no_purchase_needed.slice(0, 8).map((note) => clip(named(note), OUTPUT_LIMITS.text)),
    suggestions: result.suggestions.slice(0, input.max_suggestions).map((s) => ({
      name: clip(s.name, OUTPUT_LIMITS.shortText),
      category: clip(s.category, OUTPUT_LIMITS.shortText),
      description: clip(named(s.description), OUTPUT_LIMITS.text),
      reason: clip(named(s.reason), OUTPUT_LIMITS.text),
      new_outfits_estimate: Math.min(99, Math.max(0, Math.round(s.new_outfits_estimate))),
      priority: PRIORITY[oneOf(s.priority, ["high", "medium", "low"], "medium")],
      price_range: clip(s.price_range, 60),
      pairs_with: wardrobe.resolve(s.pairs_with_refs).slice(0, 20),
    })),
  };
});
