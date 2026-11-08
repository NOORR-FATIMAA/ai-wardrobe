// Unit tests for the app's wardrobe insights (app/src/lib/insights.ts). Offline, no Supabase.
//
//   npx deno test -A supabase/tests/insights_test.ts
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1.0.14";
import {
  costPerWear,
  daysBetween,
  formatMoney,
  type InsightItem,
  parsePrice,
  wardrobeInsights,
} from "../../app/src/lib/insights.ts";

const TODAY = "2026-11-06";

let n = 0;
function item(fields: Partial<InsightItem>): InsightItem {
  n++;
  return {
    id: `item-${n}`,
    name: `Item ${n}`,
    category: "top",
    times_worn: 0,
    last_worn_at: null,
    purchase_price: null,
    created_at: "2026-01-01T09:00:00.000Z",
    ...fields,
  };
}

Deno.test("daysBetween counts calendar days and ignores the time of day", () => {
  assertEquals(daysBetween("2026-11-01", TODAY), 5);
  assertEquals(daysBetween("2026-11-06T23:59:00.000Z", TODAY), 0);
  assertEquals(daysBetween("2026-02-28", "2026-03-01"), 1);
  assertEquals(daysBetween("2026-03-28", "2026-03-30"), 2); // across a DST change in many zones
});

Deno.test("an empty wardrobe has no shares, averages or lists", () => {
  const r = wardrobeInsights([], TODAY);
  assertEquals(r.total, 0);
  assertEquals(r.activeShare, null);
  assertEquals(r.averageCostPerWear, null);
  assertEquals([r.neverWorn, r.resting, r.bestValue, r.highestCostPerWear].map((l) => l.length), [0, 0, 0, 0]);
});

Deno.test("active, resting and never-worn items are classified by the last wear and the add date", () => {
  const recent = item({ times_worn: 3, last_worn_at: "2026-10-20" });
  const edge = item({ times_worn: 1, last_worn_at: "2026-08-08" }); // exactly 90 days: resting
  const longAgo = item({ times_worn: 2, last_worn_at: "2025-12-01" });
  const noDate = item({ times_worn: 4, last_worn_at: null }); // older data without a date
  const unwornOld = item({ created_at: "2026-03-01T10:00:00.000Z" });
  const unwornOlder = item({ created_at: "2026-02-01T10:00:00.000Z" });
  const justAdded = item({ created_at: "2026-11-01T10:00:00.000Z" }); // too new to call "never worn"
  const r = wardrobeInsights([recent, edge, longAgo, noDate, unwornOld, unwornOlder, justAdded], TODAY);

  assertEquals(r.activeCount, 1);
  assertAlmostEquals(r.activeShare!, 1 / 7);
  assertEquals(r.resting.map((i) => i.id), [noDate.id, longAgo.id, edge.id]);
  assertEquals(r.neverWorn.map((i) => i.id), [unwornOlder.id, unwornOld.id]);
});

Deno.test("cost per wear uses only priced, worn items", () => {
  assertEquals(costPerWear(item({ purchase_price: 60, times_worn: 4 })), 15);
  assertEquals(costPerWear(item({ purchase_price: 60, times_worn: 0 })), null);
  assertEquals(costPerWear(item({ purchase_price: null, times_worn: 5 })), null);
  assertEquals(costPerWear(item({ purchase_price: 0, times_worn: 2 })), 0); // a gift is free per wear

  const coat = item({ purchase_price: 200, times_worn: 10, last_worn_at: "2026-11-01" });
  const tee = item({ purchase_price: 10, times_worn: 20, last_worn_at: "2026-11-05" });
  const dress = item({ purchase_price: 150, times_worn: 0 });
  const unpriced = item({ times_worn: 7, last_worn_at: "2026-11-02" });
  const r = wardrobeInsights([coat, tee, dress, unpriced], TODAY);

  assertEquals(r.pricedCount, 3);
  assertEquals(r.totalSpent, 360);
  assertEquals(r.unwornValue, 150);
  assertAlmostEquals(r.averageCostPerWear!, 210 / 30); // worn priced items only
  assertEquals(r.bestValue.map((p) => [p.item.id, p.costPerWear]), [[tee.id, 0.5], [coat.id, 20]]);
  assertEquals(r.highestCostPerWear, [], "a small wardrobe must not list the same item twice");
});

Deno.test("best value and highest cost per wear never overlap", () => {
  const items = Array.from({ length: 12 }, (_, i) => item({ purchase_price: 100, times_worn: i + 1, last_worn_at: TODAY }));
  const r = wardrobeInsights(items, TODAY);
  assertEquals(r.bestValue.length, 5);
  assertEquals(r.highestCostPerWear.length, 5);
  assertEquals(r.highestCostPerWear[0].costPerWear, 100, "the worst value comes first");
  const best = new Set(r.bestValue.map((p) => p.item.id));
  assert(r.highestCostPerWear.every((p) => !best.has(p.item.id)));
});

Deno.test("parsePrice accepts plain amounts and rejects everything else", () => {
  assertEquals(parsePrice(""), null);
  assertEquals(parsePrice("  "), null);
  assertEquals(parsePrice("49"), 49);
  assertEquals(parsePrice("49.9"), 49.9);
  assertEquals(parsePrice("49,95"), 49.95);
  assertEquals(parsePrice("12."), 12); // mid-typing
  for (const bad of ["-5", "1e3", "12.345", "abc", "1 000", "123456789", "$20", "Infinity", "."]) {
    assertEquals(parsePrice(bad), undefined, `"${bad}" should be rejected`);
  }
});

Deno.test("purchase prices are never loaded into AI prompts", async () => {
  const wardrobe = await Deno.readTextFile(new URL("../functions/_shared/wardrobe.ts", import.meta.url));
  const select = wardrobe.match(/\.from\("wardrobe_items"\)\s*\.select\("([^"]+)"\)/);
  assert(select, "loadWardrobe must select explicit columns");
  assert(!select[1].includes("price") && select[1] !== "*", `prompt columns: ${select[1]}`);
});

Deno.test("formatMoney shows the currency and falls back for unknown codes", () => {
  assert(formatMoney(12.5, "EUR").includes("12.50") || formatMoney(12.5, "EUR").includes("12,50"));
  assert(/\b1,?200\b|1\.200|1 200/.test(formatMoney(1200, "USD")), formatMoney(1200, "USD"));
  assertEquals(formatMoney(3, "NOT-A-CODE"), "NOT-A-CODE 3.00");
});
