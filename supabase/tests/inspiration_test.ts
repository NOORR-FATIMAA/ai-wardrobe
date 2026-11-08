// Unit tests for outfit inspiration photos (supabase/functions/_shared/unsplash.ts). Offline: the
// Unsplash API is replaced by a local fake.
//
//   npx deno test -A supabase/tests/inspiration_test.ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { HttpError } from "../functions/_shared/http.ts";
import { resolveOutfits } from "../functions/_shared/outfits.ts";
import { clearCache, searchPhotos, searchPhrase, toPhotos, UTM } from "../functions/_shared/unsplash.ts";
import type { WardrobeSnapshot } from "../functions/_shared/wardrobe.ts";

const photo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  width: 3000,
  height: 4000,
  color: "#d9c8b4",
  alt_description: "woman in beige coat",
  urls: { small: `https://images.unsplash.com/photo-${id}?ixid=abc&w=400` },
  links: { html: `https://unsplash.com/photos/${id}` },
  user: { name: "Ana Lee", links: { html: "https://unsplash.com/@analee" } },
  ...extra,
});

function fakeFetch(respond: (url: URL, init?: RequestInit) => Response) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  }) as typeof fetch;
  return { impl, calls };
}

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", ...headers } });

Deno.test("search phrases drop item codes and symbols and are bounded", () => {
  assertEquals(searchPhrase("i3 + i12 cream knit, camel trousers!"), "cream knit camel trousers");
  assertEquals(searchPhrase("  café   look  "), "café look");
  assertEquals(searchPhrase("https://evil.example/?a=1"), "https evil example a 1");
  assert(searchPhrase("word ".repeat(40)).length <= 80);
});

Deno.test("photos keep the hotlinked image and credit the photographer with utm links", () => {
  const [p] = toPhotos({ results: [photo("a")] });
  assertEquals(p.image_url, "https://images.unsplash.com/photo-a?ixid=abc&w=400");
  assertEquals(p.photographer, "Ana Lee");
  assertEquals(p.photographer_url, `https://unsplash.com/@analee?${UTM}`);
  assertEquals(p.photo_url, `https://unsplash.com/photos/a?${UTM}`);
  assertEquals(p.color, "#d9c8b4");
});

Deno.test("malformed or foreign photos are skipped", () => {
  const photos = toPhotos({
    results: [
      photo("a", { urls: { small: "https://evil.example/x.jpg" } }),
      photo("b", { links: { html: "http://unsplash.com/photos/b" } }),
      photo("c", { user: { name: "", links: { html: "https://unsplash.com/@x" } } }),
      photo("d", { width: "big" }),
      photo("e", { color: "red; background:url(x)" }),
      null,
    ],
  });
  assertEquals(photos.map((p) => p.id), ["e"]);
  assertEquals(photos[0].color, null);
  assertEquals(toPhotos({ results: "nope" }), []);
  assertEquals(toPhotos(null), []);
  assertEquals(toPhotos({ results: Array.from({ length: 20 }, (_, i) => photo(`p${i}`)) }).length, 6);
});

Deno.test("search sends the key as a Client-ID header and only the cleaned phrase", async () => {
  clearCache();
  const fake = fakeFetch(() => ok({ results: [photo("a")] }));
  const photos = await searchPhotos("i2 navy blazer, white tee", { key: "test-key", fetchImpl: fake.impl });
  assertEquals(photos.length, 1);
  const { url, init } = fake.calls[0];
  assertEquals(url.origin + url.pathname, "https://api.unsplash.com/search/photos");
  assertEquals(url.searchParams.get("query"), "navy blazer white tee");
  assertEquals(url.searchParams.get("orientation"), "portrait");
  assertEquals(url.searchParams.get("content_filter"), "high");
  assertEquals(new Headers(init?.headers).get("Authorization"), "Client-ID test-key");
  assert(!url.search.includes("test-key"), "the key must never be in the URL");
});

Deno.test("repeated searches are served from the cache", async () => {
  clearCache();
  let now = 0;
  const fake = fakeFetch(() => ok({ results: [photo("a")] }));
  const opts = { key: "k", fetchImpl: fake.impl, now: () => now };
  await searchPhotos("Beige Linen Summer", opts);
  await searchPhotos("beige linen summer", opts);
  assertEquals(fake.calls.length, 1);
  now = 7 * 60 * 60 * 1000;
  await searchPhotos("beige linen summer", opts);
  assertEquals(fake.calls.length, 2, "an expired entry is fetched again");
});

Deno.test("missing key, rate limit, bad key and outages become readable errors", async () => {
  clearCache();
  const never = fakeFetch(() => ok({}));
  const unset = await assertRejects(() => searchPhotos("look", { key: "", fetchImpl: never.impl }), HttpError);
  assertEquals((unset as HttpError).status, 503);
  await assertRejects(() => searchPhotos("look", { key: "bad\x16key", fetchImpl: never.impl }), HttpError);
  assertEquals(never.calls.length, 0, "no request without a usable key");

  const cases: [Response, number, RegExp][] = [
    [new Response("Rate Limit Exceeded", { status: 403, headers: { "X-Ratelimit-Remaining": "0" } }), 503, /Too many/],
    [new Response("", { status: 429 }), 503, /Too many/],
    [new Response("", { status: 401 }), 503, /not set up correctly/],
    [new Response("", { status: 500 }), 502, /Could not load/],
    [new Response("not json", { status: 200 }), 502, /Could not load/],
  ];
  for (const [i, [response, status, message]] of cases.entries()) {
    const fake = fakeFetch(() => response);
    const error = await assertRejects(() => searchPhotos(`look ${i}`, { key: "k", fetchImpl: fake.impl }), HttpError);
    assertEquals((error as HttpError).status, status);
    assert(message.test((error as Error).message), (error as Error).message);
  }

  const offline = (() => Promise.reject(new TypeError("network"))) as typeof fetch;
  const error = await assertRejects(() => searchPhotos("offline look", { key: "k", fetchImpl: offline }), HttpError);
  assertEquals((error as HttpError).status, 502);
});

Deno.test("stylist outfits carry a search phrase without item codes or the user's item names", () => {
  const names = new Map([["a1", "Grandma's secret scarf"], ["b2", "Blue jeans"]]);
  const codeToId = new Map([["i1", "a1"], ["i2", "b2"]]);
  const wardrobe = {
    items: [{ id: "a1", category: "accessory" }, { id: "b2", category: "jeans" }],
    resolve: (codes: string[]) => codes.map((c) => codeToId.get(c)).filter((id): id is string => Boolean(id)),
    // As in the real snapshot: codes in prose become item names.
    nameCodes: (text: string) => text.replace(/i\d+/g, (code) => names.get(codeToId.get(code) ?? "") ?? code),
  } as unknown as WardrobeSnapshot;
  const [outfit] = resolveOutfits([{
    title: "Look", occasion: "Casual", item_refs: ["i1", "i2"], missing_items: [], explanation: "",
    styling_tips: [], weather_note: "", inspiration_query: "i1 with i2, relaxed denim weekend",
  }], wardrobe);
  assertEquals(outfit.inspiration_query, "with relaxed denim weekend");
  assertEquals(outfit.explanation, "", "sanity: prose fields still go through nameCodes");
});
