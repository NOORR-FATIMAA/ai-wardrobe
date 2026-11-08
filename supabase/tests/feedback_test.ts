// Outfit feedback in prompts and results (functions/_shared/wardrobe.ts, outfits.ts). Offline.
//
//   npx deno test -A supabase/tests/feedback_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import { resolveOutfits, situationContext, STYLIST_RULES } from "../functions/_shared/outfits.ts";
import { MAX_FEEDBACK, summarizeFeedback, type WardrobeSnapshot } from "../functions/_shared/wardrobe.ts";

const ids = ["a1", "b2", "c3", "d4"];
const categories = ["shirt", "trousers", "shoes", "outerwear"];
const idToCode = new Map(ids.map((id, i) => [id, `i${i + 1}`]));
const codeToId = new Map(ids.map((id, i) => [`i${i + 1}`, id]));
const wardrobe = {
  items: ids.map((id, i) => ({ id, name: `Item ${i + 1}`, category: categories[i] })),
  idToCode,
  codeToId,
  text: "",
  resolve: (codes: string[]) => [...new Set(codes.map((c) => codeToId.get(c)).filter((id): id is string => Boolean(id)))],
  nameCodes: (text: string) => text,
} as unknown as WardrobeSnapshot;

const outfit = (item_refs: string[]) => ({
  title: "Look", occasion: "Office", item_refs, missing_items: [], explanation: "", styling_tips: [], weather_note: "", inspiration_query: "",
});

Deno.test("feedback becomes item codes, newest first, without removed items", () => {
  const summary = summarizeFeedback([
    { item_ids: ["a1", "b2", "c3"], rating: 1 },
    { item_ids: ["a1", "gone"], rating: 1 }, // an item was deleted: ignored
    { item_ids: ["b2", "d4"], rating: -1 },
    { item_ids: [], rating: -1 },
  ], wardrobe);
  assertEquals(summary.text, "- liked: i1 + i2 + i3\n- disliked: i2 + i4");
  assertEquals(summary.disliked, [["b2", "d4"]]);
});

Deno.test("no feedback says so, and the prompt is bounded", () => {
  assertEquals(summarizeFeedback([], wardrobe), { text: "(no outfit feedback yet)", disliked: [] });
  const many = Array.from({ length: 50 }, (_, i) => ({ item_ids: ["a1"], rating: i % 2 ? 1 : -1 }));
  const summary = summarizeFeedback(many, wardrobe);
  assertEquals(summary.text.split("\n").length, 2 * MAX_FEEDBACK);
  assertEquals(summary.disliked.length, MAX_FEEDBACK);
});

Deno.test("the stylist prompt carries feedback and the rule to use it", () => {
  const context = situationContext(null, "(nothing logged this week)", "2026-11-07", "- liked: i1 + i2");
  assertStringIncludes(context, "## Outfit feedback (the user's own ratings)\n- liked: i1 + i2");
  assert(!situationContext(null, "x").includes("Outfit feedback"), "no section without feedback");
  assertStringIncludes(STYLIST_RULES, "never repeat a disliked combination");
});

Deno.test("disliked combinations are removed from suggestions in any order", () => {
  const { disliked } = summarizeFeedback([{ item_ids: ["d4", "b2"], rating: -1 }], wardrobe);
  const result = resolveOutfits([outfit(["i2", "i4"]), outfit(["i4", "i2"]), outfit(["i1", "i2", "i3"])], wardrobe, { avoid: disliked });
  assertEquals(result.map((o) => o.item_ids), [["a1", "b2", "c3"]]);
});

Deno.test("the AI functions load feedback before reserving quota", async () => {
  for (const name of ["stylist", "assistant"]) {
    const source = await Deno.readTextFile(new URL(`../functions/${name}/index.ts`, import.meta.url));
    const load = source.indexOf("loadFeedback(ctx");
    assert(load > 0 && load < source.indexOf("reserveAiCall(ctx)"), `${name}: feedback must load before quota is reserved`);
    assertStringIncludes(source, "feedback.text", `${name}: feedback must reach the prompt`);
  }
  const stylist = await Deno.readTextFile(new URL("../functions/stylist/index.ts", import.meta.url));
  assertStringIncludes(stylist, "...feedback.disliked", "the stylist must filter disliked combinations");
});
