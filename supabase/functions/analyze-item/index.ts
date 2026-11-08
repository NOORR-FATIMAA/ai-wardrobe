// Recognises a clothing item from a photo the user uploaded to their private storage folder.
// The result is a suggestion: the app shows it in an editable form before anything is saved.
import { z } from "npm:zod@4.6.7";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { askModel, imagePart, textPart } from "../_shared/ai.ts";
import { getContext, requireAiAccess, reserveAiCall } from "../_shared/context.ts";
import { HttpError, serve } from "../_shared/http.ts";
import { normalizeCategory, normalizeSeasons, oneOf } from "../_shared/normalize.ts";
import { clip } from "../_shared/outfits.ts";
import { checkPhotoPath, MAX_PHOTO_BYTES, sniffImageType } from "../_shared/photo_path.ts";
import { CATEGORIES } from "../_shared/wardrobe.ts";

const Input = z.object({ image_path: z.string().min(1).max(300) });

const Analysis = z.object({
  is_clothing: z.boolean().describe("False if the photo does not show a wearable item"),
  name: z.string().describe("Short descriptive name, e.g. 'Navy slim-fit chinos'"),
  category: z.string().describe(`Exactly one of: ${CATEGORIES.join(", ")}`),
  subcategory: z.string().describe("More specific type, e.g. 'chinos', 'loafers', 'kurta'"),
  colors: z.array(z.string()).describe("Dominant colours first, plain names like 'navy', 'cream'"),
  pattern: z.string().describe("'solid', 'striped', 'checked', 'floral', 'graphic', ..."),
  material: z.string().describe("Best guess of fabric, or 'unknown'"),
  style_tags: z.array(z.string()).describe("e.g. 'minimal', 'streetwear', 'classic', 'sporty'"),
  // Not .int(): a "3.5" from the model is rounded in shapeAnalysis instead of failing the request.
  formality: z.number().describe("Whole number: 1 = very casual, 3 = smart casual, 5 = black tie"),
  seasons: z.array(z.string()).describe("Any of: spring, summer, autumn, winter"),
  occasions: z.array(z.string()).describe("e.g. 'university', 'office', 'wedding', 'gym', 'everyday'"),
  description: z.string().describe("One or two sentences describing the item"),
  confidence: z.string().describe("One of: low, medium, high"),
  other_items_detected: z.array(z.string()).describe("Other garments visible in the photo, if any"),
});

const SYSTEM = `You catalogue clothing for a personal digital wardrobe app used by people of every gender and style.
Describe the single most prominent wearable item in the photo (garment, footwear, bag or accessory).
Be factual and neutral. Do not comment on the person, their body, or their appearance if one is visible.
If unsure about material or exact type, give your best guess and lower the confidence.`;

serve(async (req, body) => {
  const ctx = await getContext(req);
  const { image_path } = Input.parse(body);

  // Strict format and the caller's own folder, checked before the image is touched; storage RLS
  // enforces ownership too.
  const photo = checkPhotoPath(image_path, ctx.user.id);
  if (!photo.ok) {
    throw photo.reason === "not_owner" ? new HttpError(403, "Not your image") : new HttpError(400, "Invalid image path");
  }
  await requireAiAccess(ctx);

  const { data: file, error } = await ctx.db.storage.from("wardrobe").download(image_path);
  if (error || !file) throw new HttpError(404, "Image not found");
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "This photo is too large.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check what the file really contains, not just its name, before it can cost an AI call.
  const mediaType = sniffImageType(bytes);
  if (!mediaType) throw new HttpError(400, "This file is not a JPEG, PNG or WebP image.");

  // Reserved last, so a request that fails above never uses up quota.
  await reserveAiCall(ctx);
  const analysis = await askModel({
    schema: Analysis,
    system: SYSTEM,
    effort: "low",
    maxTokens: 4000,
    content: [imagePart(encodeBase64(bytes), mediaType), textPart("Catalogue this item.")],
  });

  return shapeAnalysis(analysis);
});

const list = (values: string[], count: number, max: number) =>
  values.slice(0, count).map((v) => clip(v, max)).filter(Boolean);

/** Model output as the app's ItemAnalysis: known enums, a 1-5 formality, and bounded text and lists. */
function shapeAnalysis(analysis: z.infer<typeof Analysis>) {
  return {
    is_clothing: analysis.is_clothing,
    name: clip(analysis.name, 80),
    category: normalizeCategory(analysis.category),
    subcategory: clip(analysis.subcategory, 40),
    colors: list(analysis.colors, 6, 30),
    pattern: clip(analysis.pattern, 40),
    material: clip(analysis.material, 40),
    style_tags: list(analysis.style_tags, 8, 30),
    formality: Number.isFinite(analysis.formality) ? Math.min(5, Math.max(1, Math.round(analysis.formality))) : 3,
    seasons: normalizeSeasons(analysis.seasons),
    occasions: list(analysis.occasions, 8, 40),
    description: clip(analysis.description, 500),
    confidence: oneOf(analysis.confidence, ["low", "medium", "high"], "medium"),
    other_items_detected: list(analysis.other_items_detected, 6, 80),
  };
}
