// AI stylist: builds complete outfits from the user's own wardrobe for an occasion or a
// free-text request ("what goes with my black trousers?"), optionally using the weather forecast.
import { z } from "npm:zod@4.6.7";
import { askModel, textPart } from "../_shared/ai.ts";
import { getContext, requireAiAccess, reserveAiCall } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import {
  atMost, clip, LocalDate, OUTPUT_LIMITS, OutfitSchema, resolveOutfits, situationContext, STYLIST_RULES, wardrobeContext,
} from "../_shared/outfits.ts";
import { loadFeedback, loadProfileSummary, loadRecentWears, loadWardrobe } from "../_shared/wardrobe.ts";
import { Coordinates, fetchForecast } from "../_shared/weather.ts";

const Input = z.object({
  request: z.string().max(600).optional(),
  occasion: z.string().max(80).optional(),
  count: z.number().int().min(1).max(4).default(3),
  anchor_item_ids: z.array(z.string().uuid()).max(5).default([]),
  avoid_outfits: z.array(z.array(z.string().uuid()).max(20)).max(12).default([]),
  allow_purchases: z.boolean().default(true),
  day: z.enum(["today", "tomorrow"]).default("today"),
  location: Coordinates.optional(),
  local_date: LocalDate,
});

const Recommendation = z.object({
  understood_request: z.string().describe("One sentence restating what the user needs"),
  outfits: z.array(OutfitSchema).meta(atMost(4)), // count is at most 4
  wardrobe_note: z.string().describe("Optional observation about gaps limiting these outfits, or empty"),
});

serve(async (req, body) => {
  const ctx = await getContext(req);
  const input = Input.parse(body);
  if (!input.request && !input.occasion && input.anchor_item_ids.length === 0) {
    throw new HttpError(400, "Choose an occasion or describe what you need.");
  }

  await requireAiAccess(ctx);

  const [wardrobe, profile, forecast] = await Promise.all([
    loadWardrobe(ctx),
    loadProfileSummary(ctx),
    input.location ? fetchForecast(input.location.latitude, input.location.longitude, input.day) : null,
  ]);
  if (wardrobe.items.length < 2) {
    throw new HttpError(400, "Add a few more clothes to your wardrobe first.");
  }
  const [recentWears, feedback] = await Promise.all([loadRecentWears(ctx, wardrobe), loadFeedback(ctx, wardrobe)]);

  const code = (id: string) => wardrobe.idToCode.get(id);
  const anchors = input.anchor_item_ids.map(code).filter(Boolean);
  const avoid = input.avoid_outfits
    .map((ids) => ids.map(code).filter(Boolean).join(" + "))
    .filter(Boolean);

  const prompt = [
    `Outfits are for ${input.day}.`,
    input.occasion ? `Occasion: ${input.occasion}` : null,
    input.request ? `In the user's words: "${input.request}"` : null,
    anchors.length ? `Every outfit must include: ${anchors.join(", ")}` : null,
    avoid.length ? `Do not repeat these combinations:\n${avoid.map((a) => `- ${a}`).join("\n")}` : null,
    input.allow_purchases
      ? `Suggest purchases only where they meaningfully help.`
      : `The user does not want to buy anything: missing_items must be empty.`,
    `Create ${input.count} outfit${input.count > 1 ? "s" : ""}.`,
  ].filter(Boolean).join("\n\n");

  // Reserved last, so a request that fails above never uses up quota.
  await reserveAiCall(ctx);
  const result = await askModel({
    schema: Recommendation,
    system: [
      `${STYLIST_RULES}\n\n${wardrobeContext(profile, wardrobe)}`,
      situationContext(forecast && `${input.day}: ${forecast}`, recentWears, input.local_date, feedback.text),
    ],
    effort: "medium",
    // Up to four outfits plus thinking fit well within this; it bounds a runaway answer's duration.
    maxTokens: 8000,
    content: [textPart(prompt)],
  });

  // Only owned items, never a combination the user asked to avoid or disliked, and never more than requested.
  const outfits = resolveOutfits(result.outfits, wardrobe, {
    allowPurchases: input.allow_purchases,
    avoid: [...input.avoid_outfits, ...feedback.disliked],
    max: input.count,
  });
  if (outfits.length === 0) throw new HttpError(502, "The stylist could not build an outfit. Please try again.");

  return {
    understood_request: clip(result.understood_request, OUTPUT_LIMITS.text),
    wardrobe_note: clip(wardrobe.nameCodes(result.wardrobe_note), OUTPUT_LIMITS.text),
    weather: forecast,
    outfits,
  };
});
