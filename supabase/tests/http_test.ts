// Tests for the shared request wrapper (supabase/functions/_shared/http.ts). No server or network needed.
//
//   npx deno test -A supabase/tests/http_test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import { z } from "npm:zod@4.6.7";
import { createHandler, HttpError } from "../functions/_shared/http.ts";

const Input = z.object({
  count: z.number().int().min(1).max(4),
  occasion: z.string().optional(),
});

const handler = createHandler((_req, body) => {
  const input = Input.parse(body);
  if (input.occasion === "forbidden") throw new HttpError(403, "Not allowed");
  if (input.occasion === "crash") throw new Error("database exploded");
  return Promise.resolve({ ok: true, count: input.count });
});

const post = (body: unknown) =>
  handler(new Request("http://localhost/fn", { method: "POST", body: JSON.stringify(body) }));

Deno.test("valid input returns 200 with the handler's JSON", async () => {
  const res = await post({ count: 2 });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, count: 2 });
});

Deno.test("Zod validation errors return 400 with the failing field", async () => {
  const res = await post({ count: 99 });
  assertEquals(res.status, 400);
  const { error } = await res.json();
  assertStringIncludes(error, "Invalid request.");
  assertStringIncludes(error, "count");
});

Deno.test("missing or malformed bodies return 400, not 500", async () => {
  const empty = await handler(new Request("http://localhost/fn", { method: "POST", body: "not json" }));
  assertEquals(empty.status, 400);
  const wrongType = await post({ count: "two" });
  assertEquals(wrongType.status, 400);
});

Deno.test("HttpError keeps its status and message", async () => {
  const res = await post({ count: 1, occasion: "forbidden" });
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "Not allowed" });
});

Deno.test("unexpected errors still return a generic 500", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const res = await post({ count: 1, occasion: "crash" });
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Unexpected server error" });
  } finally {
    console.error = original;
  }
});

Deno.test("OPTIONS preflight and non-POST methods are unchanged", async () => {
  const options = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }));
  assertEquals(options.status, 200);
  assertEquals(options.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  const get = await handler(new Request("http://localhost/fn", { method: "GET" }));
  assertEquals(get.status, 405);
});
