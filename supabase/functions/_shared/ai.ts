// Shared AI provider for the Edge Functions: Google Gemini via the generateContent API.
// Callers describe the request (system prompt, content, Zod schema) and receive schema-validated data;
// nothing outside this file depends on the provider's SDK types.
import { ApiError, type Content, FinishReason, GoogleGenAI, type Part, ThinkingLevel } from "npm:@google/genai@2.31.0";
import { z } from "npm:zod@4.6.7";
import { HttpError } from "./http.ts";

// The API key lives only in Edge Function secrets, never in the mobile app. It is sent as an HTTP
// header, so a key with spaces, control or non-ASCII characters (e.g. a botched paste) would make every
// request fail with "failed to parse header value"; such a key is treated as not configured.
const RAW_API_KEY = Deno.env.get("GEMINI_API_KEY")?.trim();
const API_KEY_MALFORMED = Boolean(RAW_API_KEY) && !/^[\x21-\x7E]+$/.test(RAW_API_KEY!);
const API_KEY = API_KEY_MALFORMED ? undefined : RAW_API_KEY;

// Override with `supabase secrets set GEMINI_MODEL=...`. Default per Google's model docs (Nov 2026):
// stable, Google's fastest and most cost-effective current model, with image input, structured
// outputs and thinking levels minimal/low/medium/high. gemini-3.8-flash is built for long agentic
// coding tasks and hit the 60 s deadline on simple stylist requests; the 2.5 models are closed to
// new API users.
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";

// Test hook: lets supabase/tests/ai_test.ts point the SDK at a local mock server. Leave unset in production.
const BASE_URL = Deno.env.get("GEMINI_BASE_URL");

// No automatic retries (the SDK only retries when retryOptions is set), so a rate limit reaches the
// user immediately instead of holding the function open; the timeout bounds slow responses.
const client = API_KEY
  ? new GoogleGenAI({
    apiKey: API_KEY,
    httpOptions: { timeout: 60_000, ...(BASE_URL ? { baseUrl: BASE_URL } : {}) },
  })
  : null;

export type Effort = "low" | "medium" | "high";

/** One turn of a stateless conversation. */
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

type StructuredRequest<S extends z.ZodType> = {
  schema: S;
  /** System prompt. Several parts are sent in order; put stable text (rules, wardrobe) first. */
  system: string | string[];
  effort: Effort;
  maxTokens?: number;
} & (
  | { content: Part[]; messages?: never }
  | { messages: ChatTurn[]; content?: never }
);

const THINKING_LEVELS: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Thinking levels are a Gemini 3+ setting; older models use a different thinking configuration,
// so the setting is omitted for them rather than risk a rejected request.
const SUPPORTS_THINKING_LEVEL = /^gemini-[3-9]/.test(MODEL);

// Finish reasons meaning the model declined or was stopped by a content filter.
const DECLINED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
]);

/**
 * The JSON Schema Gemini constrains its output to. Zod's draft-2020-12 `$schema` marker is not part
 * of Gemini's supported keyword subset, so it is dropped; every other keyword the app's schemas
 * produce (type, properties, required, additionalProperties, items, description, minimum, maximum)
 * is supported.
 */
export function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return jsonSchema;
}

/**
 * Calls Gemini and returns output validated against `schema`.
 * Gemini's structured output guarantees syntactically valid JSON in the requested shape; the Zod
 * schema is still applied to every response, and anything that fails it is treated as incomplete.
 */
export async function askModel<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  if (!client) {
    if (API_KEY_MALFORMED) console.error("GEMINI_API_KEY contains spaces, control or non-ASCII characters; set the secret again.");
    throw new HttpError(503, "AI features are not configured on the server yet.");
  }

  const contents: Content[] = req.messages
    ? req.messages.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }))
    : [{ role: "user", parts: req.content }];
  const system = Array.isArray(req.system) ? req.system : [req.system];

  let response;
  const started = Date.now();
  const elapsed = () => `after ${Date.now() - started} ms`;
  try {
    response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: { parts: system.map((text) => ({ text })) },
        responseMimeType: "application/json",
        responseJsonSchema: toResponseSchema(req.schema),
        maxOutputTokens: req.maxTokens ?? 16000,
        ...(SUPPORTS_THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[req.effort] } } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) throw new HttpError(429, "The AI stylist is busy. Please try again in a minute.");
      console.error(`Gemini API error ${error.status} ${elapsed()}: ${error.message.slice(0, 300)}`);
      throw new HttpError(502, "The AI service is unavailable right now.");
    }
    // Network failures and timeouts. The message and cause say which (DNS, TLS, reset, abort); the key
    // is sent in a header, not the URL, and is stripped anyway in case a runtime ever echoes it.
    const err = error as Error & { cause?: unknown };
    const detail = `${err.name}: ${String(err.message).slice(0, 300)}` +
      (err.cause ? ` (cause: ${String(err.cause).slice(0, 200)})` : "");
    console.error(`Gemini request failed ${elapsed()}: ${API_KEY ? detail.split(API_KEY).join("[redacted]") : detail}`);
    throw new HttpError(502, "The AI service is unavailable right now.");
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || (finishReason && DECLINED.has(finishReason))) {
    throw new HttpError(422, "The AI could not help with this request. Try rephrasing it.");
  }

  const incomplete = new HttpError(502, "The AI returned an incomplete answer. Please try again.");
  const text = response.text;
  if (finishReason === FinishReason.MAX_TOKENS || !text) {
    console.error(`Gemini answer incomplete ${elapsed()}: finish reason ${finishReason ?? "none"}`);
    throw incomplete;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Gemini returned invalid JSON");
    throw incomplete;
  }

  const parsed = req.schema.safeParse(data);
  if (!parsed.success) {
    // Log where validation failed, never the content itself.
    console.error(`Gemini output failed validation at: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    throw incomplete;
  }
  return parsed.data;
}

// Image generation ("Nano Banana" family). Default per Google's image generation docs (Nov 2026):
// gemini-nano-banana-2.1 is the recommended model for generation and editing and accepts up to 10
// object reference images; about US$0.034 per 1K image on the paid tier. These image models have NO
// free tier, so a project without billing gets an error, which is reported as "needs billing".
// Override with `supabase secrets set GEMINI_IMAGE_MODEL=...`.
const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-nano-banana-2.1";

export interface GeneratedImage {
  base64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

/** Generates one image from text and reference images. Errors are user-readable HttpErrors. */
export async function generateImage(req: { content: Part[]; aspectRatio: string; imageSize?: "1K" | "2K" }): Promise<GeneratedImage> {
  if (!client) {
    if (API_KEY_MALFORMED) console.error("GEMINI_API_KEY contains spaces, control or non-ASCII characters; set the secret again.");
    throw new HttpError(503, "AI features are not configured on the server yet.");
  }
  let response;
  const started = Date.now();
  const elapsed = () => `after ${Date.now() - started} ms`;
  try {
    response = await client.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: req.content }],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: req.aspectRatio, imageSize: req.imageSize ?? "1K" },
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Gemini image API error ${error.status} ${elapsed()}: ${error.message.slice(0, 300)}`);
      // No free tier for image models: without billing the API answers with a quota or permission error.
      if (error.status === 429 && /limit:\s*0|free.?tier|billing/i.test(error.message)) {
        throw new HttpError(402, "Model photos need billing enabled on the Gemini API project.");
      }
      if (error.status === 403 || error.status === 400 && /billing/i.test(error.message)) {
        throw new HttpError(402, "Model photos need billing enabled on the Gemini API project.");
      }
      if (error.status === 429) throw new HttpError(429, "The image service is busy. Please try again in a minute.");
      if (error.status === 404) throw new HttpError(503, "The image model is not available on this project.");
      throw new HttpError(502, "The image service is unavailable right now.");
    }
    const err = error as Error;
    const detail = `${err.name}: ${String(err.message).slice(0, 300)}`;
    console.error(`Gemini image request failed ${elapsed()}: ${API_KEY ? detail.split(API_KEY).join("[redacted]") : detail}`);
    throw new HttpError(502, "The image service is unavailable right now.");
  }

  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || (candidate?.finishReason && DECLINED.has(candidate.finishReason))) {
    throw new HttpError(422, "The AI could not create a picture of this look.");
  }
  const image = candidate?.content?.parts?.find((p) => p.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType ?? ""));
  if (!image?.inlineData?.data) {
    console.error(`Gemini image response had no image ${elapsed()}: finish reason ${candidate?.finishReason ?? "none"}`);
    throw new HttpError(502, "The AI did not return a picture. Please try again.");
  }
  return { base64: image.inlineData.data, mimeType: image.inlineData.mimeType as GeneratedImage["mimeType"] };
}

export function imagePart(base64: string, mimeType: "image/jpeg" | "image/png" | "image/webp"): Part {
  return { inlineData: { mimeType, data: base64 } };
}

export function textPart(text: string): Part {
  return { text };
}
