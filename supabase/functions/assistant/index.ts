// Conversational fashion assistant: multi-turn chat grounded in the user's real wardrobe.
// Handles requests like "what can I wear with these black trousers?", "make the second one more
// casual" or "what am I missing for a weekend trip?". The conversation is not stored server-side.
import { z } from "npm:zod@4.6.7";
import { askModel, type ChatTurn } from "../_shared/ai.ts";
import { getContext, requireAiAccess, reserveAiCall } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import {
  clip, LocalDate, OUTPUT_LIMITS, OutfitSchema, resolveOutfits, situationContext, STYLIST_RULES, wardrobeContext,
} from "../_shared/outfits.ts";
import {
  loadFeedback, loadProfileSummary, loadRecentWears, loadWardrobe, promptText, type WardrobeSnapshot,
} from "../_shared/wardrobe.ts";
import { Coordinates, fetchForecast } from "../_shared/weather.ts";

const Turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
  // Outfits shown with an assistant reply, so follow-ups like "swap the shoes in the second one" work.
  outfits: z.array(z.object({
    title: z.string().max(200),
    item_ids: z.array(z.string().uuid()).max(20),
  })).max(6).optional(),
});

const Input = z.object({
  messages: z.array(Turn).min(1).max(24),
  location: Coordinates.optional(),
  local_date: LocalDate,
});

/** Longest chat reply returned to the app (the model is asked for under 120 words). */
const MAX_REPLY_CHARS = 2000;

const Reply = z.object({
  reply: z.string().describe("Conversational answer, plain text without markdown, under 120 words"),
  outfits: z.array(OutfitSchema).describe("Outfits only when the user wants outfit ideas or changes; otherwise empty"),
  shopping_suggestions: z.array(z.object({
    name: z.string(),
    category: z.string(),
    reason: z.string(),
  })).describe("Only when the user asks what to buy or what is missing; otherwise empty"),
});

const ASSISTANT_RULES = `${STYLIST_RULES}

You are chatting with the user in the app's assistant.
- Answer questions about their wardrobe, outfits, colour pairing, packing and dress codes using their actual clothes.
- Return outfits only when they ask for outfit ideas or a change to an outfit. When changing an outfit you showed earlier, return the complete updated outfit.
- In the reply text, refer to items by name, never by code. Keep it short, friendly and specific.
- When they ask how to manage without buying anything, leave missing_items and shopping_suggestions empty.
- If a request is unrelated to clothing or style, answer briefly and steer back to what you can help with.`;

/** The app's turns as model turns (the app's "assistant" role is Gemini's "model" role). */
function toChatTurns(turns: z.infer<typeof Turn>[], wardrobe: WardrobeSnapshot): ChatTurn[] {
  return turns.map((turn) => {
    if (turn.role === "user") return { role: "user", text: turn.content };
    if (!turn.outfits?.length) return { role: "model", text: turn.content };
    const shown = turn.outfits
      .map((o, i) => `${i + 1}. ${promptText(o.title, 120)}: ${o.item_ids.map((id) => wardrobe.idToCode.get(id) ?? "(removed item)").join(" + ")}`)
      .join("\n");
    return { role: "model", text: `${turn.content}\n\n[Outfits shown]\n${shown}` };
  });
}

serve(async (req, body) => {
  const ctx = await getContext(req);
  const input = Input.parse(body);
  if (input.messages.at(-1)!.role !== "user") throw new HttpError(400, "The last message must be from the user.");
  if (input.messages[0].role !== "user") throw new HttpError(400, "The conversation must start with the user.");

  await requireAiAccess(ctx);

  const { latitude, longitude } = input.location ?? {};
  const [wardrobe, profile, today, tomorrow] = await Promise.all([
    loadWardrobe(ctx),
    loadProfileSummary(ctx),
    input.location ? fetchForecast(latitude!, longitude!, "today") : null,
    input.location ? fetchForecast(latitude!, longitude!, "tomorrow") : null,
  ]);
  if (wardrobe.items.length === 0) throw new HttpError(400, "Add some clothes to your wardrobe first.");
  // The chat only sees feedback in the prompt; it does not filter dislikes, since the user may ask for one again.
  const [recentWears, feedback] = await Promise.all([loadRecentWears(ctx, wardrobe), loadFeedback(ctx, wardrobe)]);
  const forecast = today || tomorrow ? `Today: ${today ?? "unavailable"}\nTomorrow: ${tomorrow ?? "unavailable"}` : null;

  // Reserved last, so a request that fails above never uses up quota.
  await reserveAiCall(ctx);
  const result = await askModel({
    schema: Reply,
    system: [
      `${ASSISTANT_RULES}\n\n${wardrobeContext(profile, wardrobe)}`,
      situationContext(forecast, recentWears, input.local_date, feedback.text),
    ],
    effort: "medium",
    messages: toChatTurns(input.messages, wardrobe),
  });

  return {
    reply: clip(wardrobe.nameCodes(result.reply), MAX_REPLY_CHARS),
    outfits: resolveOutfits(result.outfits, wardrobe),
    shopping_suggestions: result.shopping_suggestions.slice(0, OUTPUT_LIMITS.missingItems).map((s) => ({
      name: clip(s.name, OUTPUT_LIMITS.shortText),
      category: clip(s.category, OUTPUT_LIMITS.shortText),
      reason: clip(wardrobe.nameCodes(s.reason), OUTPUT_LIMITS.text),
    })),
  };
});
