// Unit tests for the stylist's "Shop the look" mapping (app/src/lib/looks.ts). Offline, no Supabase.
//
//   npx deno test -A supabase/tests/looks_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import { looksWithItem, type LookOutfit, toLook, toLooks, zoneForCategory } from "../../app/src/lib/looks.ts";

const wardrobe = [
  { id: "a", name: "White oxford shirt", category: "shirt", colors: ["white"] },
  { id: "b", name: "Navy chinos", category: "trousers", colors: ["navy"] },
  { id: "c", name: "Brown loafers", category: "shoes", colors: ["brown"] },
  { id: "d", name: "Camel coat", category: "outerwear", colors: ["camel"] },
  { id: "e", name: "Black midi dress", category: "dress", colors: ["black"] },
];
const byId = (id: string) => wardrobe.find((w) => w.id === id);

const outfit = (item_ids: string[], extra: Partial<LookOutfit> = {}): LookOutfit => ({
  title: "Smart day",
  occasion: "Office",
  item_ids,
  missing_items: [],
  explanation: "The camel coat lifts the navy chinos. Brown loafers keep it polished!",
  styling_tips: ["Tuck the shirt."],
  weather_note: "",
  inspiration_query: "camel navy office",
  ...extra,
});

Deno.test("owned pieces are the user's real items; deleted ones are counted, never invented", () => {
  const look = toLook(outfit(["a", "b", "gone", "c"]), 0, byId, (k) => k.toUpperCase());
  assertEquals(look.items.map((i) => i.key), ["a", "b", "c"]);
  assert(look.items.every((i) => i.ownership === "owned" && i.wardrobeItem));
  assertEquals(look.items[0].category, "SHIRT", "category labels come from the app's label function");
  assertEquals(look.removedCount, 1);
  assertEquals(look.ownedCount, 3);
});

Deno.test("suggestions stay suggestions: no wardrobe item, marked not owned, with the AI's reason", () => {
  const look = toLook(outfit(["a", "b"], {
    missing_items: [{ name: "Tan suede loafers", category: "Footwear", reason: "Softens the look." }],
  }), 1, byId);
  const suggested = look.items.filter((i) => i.ownership === "suggested");
  assertEquals(suggested.length, 1);
  assertEquals(suggested[0].key, "suggested:0");
  assertEquals(suggested[0].wardrobeItem, undefined);
  assertEquals(suggested[0].suggestion?.reason, "Softens the look.");
  assertEquals(suggested[0].zone, "feet");
  assertEquals(look.suggestedCount, 1);
  assertEquals(look.number, "02");
});

Deno.test("completeness counts owned core pieces: top + bottom + shoes, or a one-piece + shoes", () => {
  assertEquals(toLook(outfit(["a", "b", "c"]), 0, byId).completeness, 1);
  assertEquals(toLook(outfit(["a", "b"]), 0, byId).completeness, 2 / 3);
  assertEquals(toLook(outfit(["e", "c"]), 0, byId).completeness, 1);
  // A suggested pair of shoes does not count as owned.
  const withSuggestion = toLook(outfit(["e"], { missing_items: [{ name: "Block heels", category: "shoes", reason: "" }] }), 0, byId);
  assertEquals(withSuggestion.completeness, 0.5);
});

Deno.test("free-text suggestion categories land on the right part of the figure", () => {
  assertEquals(zoneForCategory("shoes"), "feet");
  assertEquals(zoneForCategory("Khussa"), "feet");
  assertEquals(zoneForCategory("Light jacket"), "outer");
  assertEquals(zoneForCategory("Embroidered kurta"), "top");
  assertEquals(zoneForCategory("White shalwar"), "bottom");
  assertEquals(zoneForCategory("Lehenga"), "onepiece");
  assertEquals(zoneForCategory("Dupatta"), "accessory");
  assertEquals(zoneForCategory("outerwear"), "outer");
});

Deno.test("the gallery summary is the explanation's first sentence, and the original outfit is kept", () => {
  const original = outfit(["a", "b", "c", "d"]);
  const look = toLook(original, 0, byId);
  assertEquals(look.summary, "The camel coat lifts the navy chinos.");
  assert(look.outfit === original, "save/plan/wear use the untouched AI outfit");
});

Deno.test("other looks with the same item, excluding the current one", () => {
  const looks = toLooks([outfit(["a", "b"]), outfit(["e", "c"]), outfit(["a", "c"])], byId);
  assertEquals(looksWithItem(looks, "a", 0).map((l) => l.index), [2]);
  assertEquals(looksWithItem(looks, "e", 1), []);
});
