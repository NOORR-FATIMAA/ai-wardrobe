// "Model photo" for a stylist look: an AI-generated studio photo of a model wearing the look, made from
// the user's own clothing photos. Shown in the app as "AI preview, not an exact fit".
//
// - Owned pieces must be the caller's wardrobe items (read through RLS); their photos are the
//   references. Suggested pieces (not owned) are described in words only.
// - The result is saved in the caller's private folder as look-<hash>.<ext>, keyed by the pieces and
//   who is being dressed, so the same look is generated (and charged) once; later requests reuse it.
// - Image generation costs more than a text call, so it reserves two AI calls from the daily limits.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { z } from "npm:zod@4.6.7";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { encodeHex } from "jsr:@std/encoding@1.0.10/hex";
import { generateImage, imagePart, textPart } from "../_shared/ai.ts";
import { getContext, requireAiAccess, reserveAiCall } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import { checkPhotoPath, MAX_PHOTO_BYTES, sniffImageType } from "../_shared/photo_path.ts";
import { promptText } from "../_shared/wardrobe.ts";

/** Bump when the prompt changes, so cached images from the old prompt are not reused. */
const PROMPT_VERSION = "v1";
const MAX_REFERENCES = 8;
const SIGNED_URL_SECONDS = 60 * 60;

const Input = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(12),
  missing_items: z.array(z.object({ name: z.string().max(120), category: z.string().max(120) })).max(6).default([]),
});

const WHO: Record<string, string> = {
  womenswear: "a woman",
  menswear: "a man",
  mixed: "a person",
  no_preference: "a person",
};

/** Cache key: the pieces (order-independent), who is dressed, and the prompt version. */
export async function lookImageKey(itemIds: string[], missing: string[], who: string) {
  const source = [PROMPT_VERSION, who, [...itemIds].sort().join(","), [...missing].map((m) => m.toLowerCase()).sort().join("|")].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return `look-${encodeHex(new Uint8Array(digest)).slice(0, 40)}`;
}

serve(async (req, body) => {
  const ctx = await getContext(req);
  const input = Input.parse(body);
  await requireAiAccess(ctx);

  const ids = [...new Set(input.item_ids)];
  const { data: items, error } = await ctx.db
    .from("wardrobe_items")
    .select("id,name,category,colors,image_path")
    .in("id", ids);
  if (error) throw error;
  if (!items || items.length !== ids.length) throw new HttpError(404, "Some pieces of this look are no longer in your wardrobe.");

  const { data: profile } = await ctx.db.from("profiles").select("style_direction").eq("id", ctx.user.id).single();
  const who = WHO[profile?.style_direction ?? ""] ?? "a person";
  const missing = input.missing_items.map((m) => promptText(m.name, 80)).filter(Boolean);

  const bucket = ctx.db.storage.from("wardrobe");
  const key = await lookImageKey(ids, missing, who);

  // Already made for this look? Return it without another AI call.
  const { data: existing } = await bucket.list(ctx.user.id, { search: key, limit: 5 });
  const cached = existing?.find((f) => f.name.startsWith(`${key}.`));
  if (cached) return await signed(bucket, `${ctx.user.id}/${cached.name}`, true);

  // Reference photos: the caller's own, in their folder, checked like any other upload.
  const parts = [];
  const described: string[] = [];
  for (const item of items) {
    const label = `${promptText(item.name, 80)} (${promptText(item.category, 20)}${item.colors?.length ? `, ${item.colors.slice(0, 2).join(" and ")}` : ""})`;
    described.push(label);
    if (!item.image_path || parts.length >= MAX_REFERENCES) continue;
    if (!checkPhotoPath(item.image_path, ctx.user.id).ok) continue;
    const { data: file } = await bucket.download(item.image_path);
    if (!file || file.size > MAX_PHOTO_BYTES) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) continue;
    parts.push(textPart(`Reference photo of: ${label}`), imagePart(encodeBase64(bytes), type));
  }

  const prompt = [
    `A photorealistic full-body fashion studio photograph of ${who} wearing this outfit.`,
    `The outfit consists of exactly these pieces: ${described.join("; ")}.`,
    parts.length
      ? "Reproduce every garment from the reference photos faithfully: same colour, pattern, fabric, cut and details. Do not add logos or text."
      : "",
    missing.length ? `Also wearing: ${missing.join("; ")}.` : "",
    "Standing relaxed and facing the camera, whole body visible from head to shoes, centred, with space above the head and below the feet.",
    "Seamless very light grey studio background and floor, soft even lighting, a soft shadow under the feet. Editorial e-commerce style.",
    "Neutral expression. No other people, no props, no text, no watermark.",
  ].filter(Boolean).join("\n");

  // Reserved last (two calls: image generation costs more than text), so a request that fails above
  // never uses up quota.
  await reserveAiCall(ctx);
  await reserveAiCall(ctx);
  const image = await generateImage({ content: [...parts, textPart(prompt)], aspectRatio: "3:4" });

  const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  const extension = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${ctx.user.id}/${key}.${extension}`;
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: image.mimeType, upsert: true });
  if (uploadError) {
    console.error(`look image upload failed: ${uploadError.message}`);
    throw new HttpError(502, "The picture was created but could not be saved. Please try again.");
  }
  return await signed(bucket, path, false);
});

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

/** A one-hour link to the private picture, like every other photo in the app. */
async function signed(bucket: Bucket, path: string, cached: boolean) {
  const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new HttpError(502, "Could not open the picture. Please try again.");
  return { path, url: data.signedUrl, cached };
}
