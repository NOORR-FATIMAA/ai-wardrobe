// Unit tests for the Gemini provider (supabase/functions/_shared/ai.ts) against a local mock server.
// No network access to Google and no real API key: the SDK is pointed at 127.0.0.1 via GEMINI_BASE_URL.
//
//   npx deno test -A supabase/tests/ai_test.ts
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import { z } from "npm:zod@4.6.7";
import { HttpError } from "../functions/_shared/http.ts";
import { OutfitSchema } from "../functions/_shared/outfits.ts";

// A dummy value that must never leave the Authorization header or show up in logs.
const FAKE_KEY = "test-key-not-a-real-secret";

type Captured = { method: string; url: URL; headers: Headers; body: Record<string, any> };
let respond: (req: Captured) => Response = () => new Response("unset", { status: 500 });
const requests: Captured[] = [];

const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
  const captured: Captured = { method: req.method, url: new URL(req.url), headers: req.headers, body: await req.json() };
  requests.push(captured);
  return respond(captured);
});
const BASE_URL = `http://127.0.0.1:${server.addr.port}`;

// The module reads its configuration at import time, so each configuration gets its own import.
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GEMINI_MODEL");
const unconfigured = await import("../functions/_shared/ai.ts?config=no-key");

Deno.env.set("GEMINI_BASE_URL", BASE_URL);
Deno.env.set("GEMINI_API_KEY", `${FAKE_KEY}\x16`); // what Ctrl+V types into a hidden PowerShell 5.1 prompt
const malformedKey = await import("../functions/_shared/ai.ts?config=malformed-key");

Deno.env.set("GEMINI_API_KEY", FAKE_KEY);
Deno.env.set("GEMINI_BASE_URL", "http://127.0.0.1:9"); // nothing listens on the discard port
const unreachable = await import("../functions/_shared/ai.ts?config=unreachable");

Deno.env.set("GEMINI_BASE_URL", BASE_URL);
const ai = await import("../functions/_shared/ai.ts?config=mock");

Deno.env.set("GEMINI_MODEL", "gemini-2.5-flash");
const olderModel = await import("../functions/_shared/ai.ts?config=older-model");
Deno.env.delete("GEMINI_MODEL");

const Item = z.object({
  name: z.string(),
  formality: z.number().int().describe("1-5"),
  seasons: z.array(z.string()),
});

const okBody = (text: string, finishReason = "STOP") =>
  Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  });

const validItem = { name: "Navy chinos", formality: 3, seasons: ["spring", "autumn"] };

/** Captures console.error output for the duration of `fn`. */
async function captureErrors(fn: () => Promise<unknown>): Promise<string> {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    await fn().catch(() => {});
  } finally {
    console.error = original;
  }
  return lines.join("\n");
}

async function expectHttpError(promise: Promise<unknown>, status: number, message?: string) {
  const error = await assertRejects(() => promise, HttpError);
  assertEquals(error.status, status, `expected HTTP ${status}, got ${error.status}: ${error.message}`);
  if (message) assertStringIncludes(error.message, message);
}

Deno.test("missing GEMINI_API_KEY returns 503 without calling the API", async () => {
  const before = requests.length;
  await expectHttpError(
    unconfigured.askModel({ schema: Item, system: "s", effort: "low", content: [unconfigured.textPart("hi")] }),
    503,
    "not configured",
  );
  assertEquals(requests.length, before);
});

Deno.test("image request: endpoint, key header, system prompt, image part, schema and thinking level", async () => {
  respond = () => okBody(JSON.stringify(validItem));
  const result = await ai.askModel({
    schema: Item,
    system: ["stable rules and wardrobe", "today's weather"],
    effort: "low",
    maxTokens: 4000,
    content: [ai.imagePart("aGVsbG8=", "image/png"), ai.textPart("Catalogue this item.")],
  });
  assertEquals(result, validItem);

  const req = requests.at(-1)!;
  assertEquals(req.method, "POST");
  assert(req.url.pathname.endsWith("/models/gemini-3.5-flash-lite:generateContent"), req.url.pathname);
  assertEquals(req.headers.get("x-goog-api-key"), FAKE_KEY);
  assert(!req.url.toString().includes(FAKE_KEY), "API key must not be in the URL");

  assertEquals(req.body.systemInstruction.parts, [{ text: "stable rules and wardrobe" }, { text: "today's weather" }]);
  assertEquals(req.body.contents, [{
    role: "user",
    parts: [{ inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }, { text: "Catalogue this item." }],
  }]);

  const config = req.body.generationConfig;
  assertEquals(config.responseMimeType, "application/json");
  assertEquals(config.maxOutputTokens, 4000);
  assertEquals(config.thinkingConfig, { thinkingLevel: "LOW" });
  assertEquals(config.responseJsonSchema.type, "object");
  assertEquals(config.responseJsonSchema.required, ["name", "formality", "seasons"]);
  assertEquals(config.responseJsonSchema.$schema, undefined);
});

Deno.test("chat request maps turns to user/model roles and medium thinking", async () => {
  respond = () => okBody(JSON.stringify(validItem));
  await ai.askModel({
    schema: Item,
    system: "rules",
    effort: "medium",
    messages: [
      { role: "user", text: "What goes with navy chinos?" },
      { role: "model", text: "Try a white oxford.\n\n[Outfits shown]\n1. Smart: i1 + i2" },
      { role: "user", text: "Make it more casual" },
    ],
  });
  const body = requests.at(-1)!.body;
  assertEquals(body.contents.map((c: { role: string }) => c.role), ["user", "model", "user"]);
  assertEquals(body.contents[1].parts, [{ text: "Try a white oxford.\n\n[Outfits shown]\n1. Smart: i1 + i2" }]);
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: "MEDIUM" });
  assertEquals(body.generationConfig.maxOutputTokens, 16000);
});

Deno.test("older models are not sent a thinking level", async () => {
  respond = () => okBody(JSON.stringify(validItem));
  await olderModel.askModel({ schema: Item, system: "s", effort: "low", content: [olderModel.textPart("hi")] });
  const req = requests.at(-1)!;
  assert(req.url.pathname.endsWith("/models/gemini-2.5-flash:generateContent"), req.url.pathname);
  assertEquals(req.body.generationConfig.thinkingConfig, undefined);
});

Deno.test("output that fails the Zod schema is rejected as incomplete (502)", async () => {
  respond = () => okBody(JSON.stringify({ name: "Navy chinos", formality: "three", seasons: [] }));
  const logs = await captureErrors(() =>
    expectHttpError(
      ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }),
      502,
      "incomplete",
    )
  );
  assertStringIncludes(logs, "failed validation at: formality");
  assert(!logs.includes("Navy chinos"), "validation logs must not include model content");
});

Deno.test("invalid JSON is rejected as incomplete (502)", async () => {
  respond = () => okBody("{ not json");
  await captureErrors(() =>
    expectHttpError(ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }), 502, "incomplete")
  );
});

Deno.test("empty response text is rejected as incomplete (502)", async () => {
  respond = () => Response.json({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP" }] });
  await expectHttpError(ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }), 502);
});

Deno.test("MAX_TOKENS finish is rejected as incomplete (502)", async () => {
  respond = () => okBody(JSON.stringify(validItem).slice(0, 20), "MAX_TOKENS");
  await expectHttpError(
    ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }),
    502,
    "incomplete",
  );
});

Deno.test("blocked prompts return 422", async () => {
  respond = () => Response.json({ promptFeedback: { blockReason: "SAFETY" } });
  await expectHttpError(
    ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }),
    422,
    "could not help",
  );
});

Deno.test("safety and image-safety finish reasons return 422", async () => {
  for (const reason of ["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT"]) {
    respond = () => Response.json({ candidates: [{ content: { role: "model", parts: [] }, finishReason: reason }] });
    await expectHttpError(ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }), 422);
  }
});

Deno.test("rate limit returns 429 after a single attempt (no automatic retries)", async () => {
  respond = () =>
    Response.json({ error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  const before = requests.length;
  await expectHttpError(
    ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }),
    429,
    "busy",
  );
  assertEquals(requests.length - before, 1);
});

Deno.test("API errors return 502 and never log the API key", async () => {
  for (const status of [400, 403, 500, 503]) {
    respond = () =>
      Response.json({ error: { code: status, message: "API key not valid", status: "INVALID_ARGUMENT" } }, { status });
    const logs = await captureErrors(() =>
      expectHttpError(
        ai.askModel({ schema: Item, system: "s", effort: "low", content: [ai.textPart("hi")] }),
        502,
        "unavailable",
      )
    );
    assertStringIncludes(logs, `Gemini API error ${status}`);
    assert(!logs.includes(FAKE_KEY), "API key leaked into logs");
  }
});

Deno.test("a key with a header-breaking character is treated as not configured, with a clear log", async () => {
  const before = requests.length;
  const logs = await captureErrors(() =>
    expectHttpError(
      malformedKey.askModel({ schema: Item, system: "s", effort: "low", content: [malformedKey.textPart("hi")] }),
      503,
    )
  );
  assertEquals(requests.length, before, "no request may be sent with a malformed key");
  assertStringIncludes(logs, "GEMINI_API_KEY contains");
  assert(!logs.includes(FAKE_KEY), "API key leaked into logs");
});

Deno.test("network failures return 502", async () => {
  const logs = await captureErrors(() =>
    expectHttpError(
      unreachable.askModel({ schema: Item, system: "s", effort: "low", content: [unreachable.textPart("hi")] }),
      502,
      "unavailable",
    )
  );
  // The log names the failure precisely enough to diagnose it (Deno: "TypeError: ... Connection refused ...").
  assert(/Gemini request failed after \d+ ms: \w+: \S/.test(logs), `log line lacks the error detail: ${logs}`);
  assert(!logs.includes(FAKE_KEY), "API key leaked into logs");
});

Deno.test("outfit arrays are bounded in the response schema", () => {
  const props = (ai.toResponseSchema(OutfitSchema) as { properties: Record<string, { maxItems?: number }> }).properties;
  assertEquals(props.item_refs.maxItems, 12);
  assertEquals(props.missing_items.maxItems, 6);
  assertEquals(props.styling_tips.maxItems, 6);
  // A hint for the model only: a longer answer still validates and is trimmed later.
  assert(OutfitSchema.safeParse({
    title: "t", occasion: "o", item_refs: Array(20).fill("i1"), missing_items: [], explanation: "e",
    styling_tips: Array(10).fill("tip"), weather_note: "",
  }).success, "maxItems must not reject longer answers");
});

Deno.test("app schemas only use JSON Schema keywords Gemini supports", () => {
  // Supported subset per the SDK's responseJsonSchema documentation.
  const supported = new Set([
    "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items", "prefixItems",
    "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required",
  ]);
  const used = new Set<string>();
  const walk = (node: unknown, insideProperties = false) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (!insideProperties) used.add(key);
      if (key === "properties") {
        for (const child of Object.values(value as object)) walk(child);
      } else if (typeof value === "object" && !Array.isArray(value)) {
        walk(value);
      }
    }
  };
  const Recommendation = z.object({ understood_request: z.string(), outfits: z.array(OutfitSchema), wardrobe_note: z.string() });
  for (const schema of [Item, Recommendation]) walk(ai.toResponseSchema(schema));
  const unsupported = [...used].filter((k) => !supported.has(k));
  assertEquals(unsupported, [], `unsupported keywords: ${unsupported.join(", ")}`);
});

Deno.test({
  name: "stop mock server",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await server.shutdown();
  },
});
