// Unit tests for look model photos: generateImage (functions/_shared/ai.ts) against a local mock
// Gemini server, and the look-image cache key. No network access to Google and no real API key.
//
//   npx deno test -A supabase/tests/look_image_test.ts
import { assert, assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { HttpError } from "../functions/_shared/http.ts";

type Captured = { url: URL; body: Record<string, any> };
let respond: (req: Captured) => Response = () => new Response("unset", { status: 500 });
const requests: Captured[] = [];
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
  const captured = { url: new URL(req.url), body: await req.json() };
  requests.push(captured);
  return respond(captured);
});

Deno.env.set("GEMINI_BASE_URL", `http://127.0.0.1:${server.addr.port}`);
Deno.env.set("GEMINI_API_KEY", "test-key-not-a-real-secret");
Deno.env.delete("GEMINI_IMAGE_MODEL");
const ai = await import("../functions/_shared/ai.ts?config=image-mock");
// The cache key lives in the function module, which starts a server on import; take the helper only.
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_ANON_KEY", "anon");
const originalServe = Deno.serve;
(Deno as { serve: unknown }).serve = () => ({ shutdown() {} });
const { lookImageKey } = await import("../functions/look-image/index.ts");
(Deno as { serve: unknown }).serve = originalServe;

const PNG_B64 = btoa("\x89PNG\r\n\x1a\nfake");
const silence = async <T>(fn: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

Deno.test("asks the image model for an image only, with the aspect ratio and size, and returns it", async () => {
  requests.length = 0;
  respond = () =>
    Response.json({
      candidates: [{ content: { role: "model", parts: [{ text: "Here you go" }, { inlineData: { mimeType: "image/png", data: PNG_B64 } }] }, finishReason: "STOP" }],
    });
  const image = await ai.generateImage({ content: [ai.textPart("A look")], aspectRatio: "3:4" });
  assertEquals(image, { base64: PNG_B64, mimeType: "image/png" });
  const { url, body } = requests[0];
  assert(url.pathname.includes("gemini-nano-banana-2.1:generateContent"), url.pathname);
  assertEquals(body.generationConfig.responseModalities, ["IMAGE"]);
  assertEquals(body.generationConfig.imageConfig, { aspectRatio: "3:4", imageSize: "1K" });
});

Deno.test("no billing, busy, missing model, refusals and empty answers become readable errors", async () => {
  const cases: [Response, number][] = [
    [Response.json({ error: { code: 429, message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0", status: "RESOURCE_EXHAUSTED" } }, { status: 429 }), 402],
    [Response.json({ error: { code: 403, message: "Billing required", status: "PERMISSION_DENIED" } }, { status: 403 }), 402],
    [Response.json({ error: { code: 429, message: "Too many requests", status: "RESOURCE_EXHAUSTED" } }, { status: 429 }), 429],
    [Response.json({ error: { code: 404, message: "model not found", status: "NOT_FOUND" } }, { status: 404 }), 503],
    [Response.json({ candidates: [{ content: { parts: [] }, finishReason: "IMAGE_SAFETY" }] }), 422],
    [Response.json({ candidates: [{ content: { parts: [{ text: "Sorry" }] }, finishReason: "STOP" }] }), 502],
  ];
  for (const [response, status] of cases) {
    respond = () => response.clone();
    const error = await silence(() => assertRejects(() => ai.generateImage({ content: [ai.textPart("x")], aspectRatio: "3:4" }), HttpError));
    assertEquals((error as HttpError).status, status, (error as Error).message);
  }
});

Deno.test("the cache key ignores piece order and changes with the pieces or who is dressed", async () => {
  const a = await lookImageKey(["b", "a"], ["Loafers"], "a woman");
  assertEquals(a, await lookImageKey(["a", "b"], ["loafers"], "a woman"));
  assertNotEquals(a, await lookImageKey(["a", "b"], ["loafers"], "a man"));
  assertNotEquals(a, await lookImageKey(["a", "c"], ["loafers"], "a woman"));
  // A valid file name in the user's folder (same rule as uploaded photos).
  assert(/^[A-Za-z0-9_-]{1,128}$/.test(a), a);
});

Deno.test({ name: "stop the mock server", fn: () => server.shutdown(), sanitizeOps: false, sanitizeResources: false });
