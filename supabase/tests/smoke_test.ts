// Backend smoke test against a local Supabase stack (`npx supabase start` + `npx supabase functions serve`).
//
//   npx supabase status -o env > supabase/.env.local-stack   (or export the values yourself)
//   npx deno run -A supabase/tests/smoke_test.ts
//
// Creates two throwaway users and checks schema, row level security, storage isolation, SQL functions
// and the Edge Functions' guards. No AI call is made unless LIVE_AI=1: only then does one stylist check
// send test data to Google Gemini (requires the GEMINI_API_KEY function secret). The Gemini provider
// itself is unit-tested offline in ai_test.ts.
//
// Requires SERVICE_ROLE_KEY: the test users are created and always cleaned up (storage folder, then
// account) through the admin API, even if a check fails, the run aborts, or it is interrupted with
// Ctrl+C. Only users created by this run are touched; see smoke_cleanup.ts.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  BUCKET,
  cleanupTestUsers,
  createTrackedUser,
  makeRedactor,
  runWithCleanup,
  type TestUser,
} from "./smoke_cleanup.ts";

const URL_ = Deno.env.get("API_URL") ?? Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
const LIVE_AI = Deno.env.get("LIVE_AI") === "1";
if (!ANON) throw new Error("Set ANON_KEY (see `npx supabase status -o env`).");
if (!SERVICE_KEY) {
  throw new Error("Set SERVICE_ROLE_KEY (see `npx supabase status -o env`): it is needed to create and clean up test users.");
}

const redact = makeRedactor([SERVICE_KEY, ANON]);
const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

let passed = 0;
const failures: string[] = [];
const skipped: string[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${redact((error as Error).message)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Every user created by this run, recorded as soon as the admin API returns it.
const testUsers: TestUser[] = [];

async function newUser(label: string) {
  const client = createClient(URL_, ANON!, { auth: { persistSession: false } });
  const password = `pw-${crypto.randomUUID()}`;
  // Hosted projects require email confirmation, so the test user is created pre-confirmed.
  const { email } = await createTrackedUser(admin, testUsers, label, password);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${label}: ${error?.message}`);
  return { client, user: data.user, token: data.session.access_token };
}

async function callFunction(name: string, body: unknown, token?: string) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch { /* non-JSON gateway error */ }
  return { status: res.status, json, text };
}

// 1x1 transparent PNG, enough to exercise storage.
const PNG = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
), (c) => c.charCodeAt(0));

async function insertItem(db: SupabaseClient, name: string, category: string, image_path: string | null = null) {
  const { data, error } = await db.from("wardrobe_items")
    .insert({ name, category, colors: ["navy"], image_path })
    .select("id").single();
  if (error) throw new Error(`insert ${name}: ${error.message}`);
  return data.id as string;
}

async function main() {
  const a = await newUser("alice");
  const b = await newUser("bob");

  console.log("Schema & profiles");
  await check("profile row is created on sign-up", async () => {
    const { data, error } = await a.client.from("profiles").select("id, consent_ai_processing").single();
    assert(!error && data?.id === a.user.id, `profile missing: ${error?.message}`);
    assert(data.consent_ai_processing === false, "AI consent must default to off");
  });
  await check("profile update works and rejects invalid values", async () => {
    const ok = await a.client.from("profiles").update({ style_direction: "mixed", currency: "EUR" }).eq("id", a.user.id);
    assert(!ok.error, ok.error?.message ?? "");
    const bad = await a.client.from("profiles").update({ budget_level: "unlimited" }).eq("id", a.user.id);
    assert(bad.error, "check constraint on budget_level should reject 'unlimited'");
  });

  console.log("Wardrobe & row level security");
  const shirt = await insertItem(a.client, "White oxford shirt", "shirt");
  const chinos = await insertItem(a.client, "Navy chinos", "trousers");
  const shoes = await insertItem(a.client, "Brown loafers", "shoes");
  const bobShirt = await insertItem(b.client, "Bob's tee", "tshirt");

  await check("invalid category is rejected", async () => {
    const { error } = await a.client.from("wardrobe_items").insert({ name: "x", category: "spaceship" });
    assert(error, "category check constraint should reject unknown categories");
  });
  await check("users only see their own items", async () => {
    const { data } = await b.client.from("wardrobe_items").select("id");
    assert(data?.length === 1 && data[0].id === bobShirt, `bob sees ${data?.length} items`);
  });
  await check("users cannot update or delete other users' items", async () => {
    await b.client.from("wardrobe_items").update({ name: "hacked" }).eq("id", shirt);
    await b.client.from("wardrobe_items").delete().eq("id", shirt);
    const { data } = await a.client.from("wardrobe_items").select("name").eq("id", shirt).single();
    assert(data?.name === "White oxford shirt", "alice's item was modified by bob");
  });
  await check("users cannot create items owned by someone else", async () => {
    const { error } = await b.client.from("wardrobe_items").insert({ name: "x", category: "top", user_id: a.user.id });
    assert(error, "insert with another user's user_id should fail");
  });

  console.log("Outfits, calendar & wear log");
  let outfitId = "";
  await check("save an outfit with items", async () => {
    const { data, error } = await a.client.from("outfits")
      .insert({ title: "Smart casual", occasion: "Office", planned_for: "2030-01-01" }).select("id").single();
    assert(!error, error?.message ?? "");
    outfitId = data!.id;
    const links = await a.client.from("outfit_items").insert(
      [shirt, chinos, shoes].map((item_id, position) => ({ outfit_id: outfitId, item_id, position })),
    );
    assert(!links.error, links.error?.message ?? "");
  });
  await check("outfits cannot include another user's items", async () => {
    const { error } = await a.client.from("outfit_items").insert({ outfit_id: outfitId, item_id: bobShirt });
    assert(error, "linking bob's item into alice's outfit should fail");
  });
  await check("users cannot add items to another user's outfit", async () => {
    const { error } = await b.client.from("outfit_items").insert({ outfit_id: outfitId, item_id: bobShirt });
    assert(error, "bob should not write to alice's outfit");
  });
  await check("log_wear records history and bumps counters", async () => {
    const { error } = await a.client.rpc("log_wear", { p_item_ids: [shirt, chinos], p_outfit_id: outfitId, p_worn_on: "2026-10-20" });
    assert(!error, error?.message ?? "");
    const { data } = await a.client.from("wardrobe_items").select("times_worn, last_worn_at").eq("id", shirt).single();
    assert(data?.times_worn === 1 && data.last_worn_at === "2026-10-20", `got ${JSON.stringify(data)}`);
    const log = await a.client.from("wear_log").select("item_ids");
    assert(log.data?.length === 1 && log.data[0].item_ids.length === 2, "wear_log row missing");
  });
  await check("log_wear keeps the latest date when logging an older wear", async () => {
    await a.client.rpc("log_wear", { p_item_ids: [shirt], p_worn_on: "2026-10-01" });
    const { data } = await a.client.from("wardrobe_items").select("times_worn, last_worn_at").eq("id", shirt).single();
    assert(data?.times_worn === 2 && data.last_worn_at === "2026-10-20", `got ${JSON.stringify(data)}`);
  });
  await check("log_wear ignores other users' items", async () => {
    const { error } = await b.client.rpc("log_wear", { p_item_ids: [shirt] });
    assert(error, "bob logging alice's item should raise");
    const { data } = await a.client.from("wardrobe_items").select("times_worn").eq("id", shirt).single();
    assert(data?.times_worn === 2, "alice's counter changed");
  });
  const bobWearRows = async () => (await admin.from("wear_log").select("id").eq("user_id", b.user.id)).data?.length ?? 0;
  await check("log_wear rejects another user's outfit and an unknown one the same way", async () => {
    const before = await bobWearRows();
    const foreign = await b.client.rpc("log_wear", { p_item_ids: [bobShirt], p_outfit_id: outfitId });
    assert(foreign.error?.code === "P0002", `expected P0002, got ${foreign.error?.code}: ${foreign.error?.message}`);
    const unknown = await b.client.rpc("log_wear", { p_item_ids: [bobShirt], p_outfit_id: crypto.randomUUID() });
    assert(unknown.error?.code === "P0002", `expected P0002, got ${unknown.error?.code}`);
    assert(await bobWearRows() === before, "a wear_log row was written");
  });
  await check("direct wear_log inserts cannot reference another user's outfit", async () => {
    const before = await bobWearRows();
    const foreign = await b.client.from("wear_log").insert({ item_ids: [bobShirt], outfit_id: outfitId });
    assert(foreign.error?.code === "23503", `expected 23503, got ${foreign.error?.code}: ${foreign.error?.message}`);
    const unknown = await b.client.from("wear_log").insert({ item_ids: [bobShirt], outfit_id: crypto.randomUUID() });
    assert(unknown.error?.code === "23503", `expected 23503, got ${unknown.error?.code}`);
    assert(await bobWearRows() === before, "a wear_log row was written");
  });
  await check("an own wear_log row cannot be pointed at another user's outfit", async () => {
    const own = await b.client.from("wear_log").insert({ item_ids: [bobShirt] }).select("id").single();
    assert(!own.error, `logging without an outfit should work: ${own.error?.message}`);
    const moved = await b.client.from("wear_log").update({ outfit_id: outfitId }).eq("id", own.data!.id);
    assert(moved.error?.code === "23503", `expected 23503, got ${moved.error?.code}: ${moved.error?.message}`);
    const { data } = await admin.from("wear_log").select("outfit_id").eq("id", own.data!.id).single();
    assert(data?.outfit_id === null, "the row now references alice's outfit");
  });
  await check("own outfits can still be logged directly and through log_wear", async () => {
    const direct = await a.client.from("wear_log").insert({ item_ids: [shirt], outfit_id: outfitId });
    assert(!direct.error, direct.error?.message ?? "");
    const rpc = await a.client.rpc("log_wear", { p_item_ids: [chinos], p_outfit_id: outfitId });
    assert(!rpc.error, rpc.error?.message ?? "");
  });
  await check("deleting an outfit clears outfit_id but keeps the wear row", async () => {
    const temp = await a.client.from("outfits").insert({ title: "Temp look" }).select("id").single();
    assert(!temp.error, temp.error?.message ?? "");
    const logged = await a.client.rpc("log_wear", { p_item_ids: [shoes], p_outfit_id: temp.data!.id });
    assert(!logged.error, logged.error?.message ?? "");
    const removed = await a.client.from("outfits").delete().eq("id", temp.data!.id);
    assert(!removed.error, `outfit delete failed: ${removed.error?.message}`);
    const { data } = await admin.from("wear_log").select("user_id, outfit_id").eq("id", logged.data).single();
    assert(data?.outfit_id === null && data.user_id === a.user.id, `got ${JSON.stringify(data)}`);
  });
  await check("deleting an item cascades out of outfits", async () => {
    const temp = await insertItem(a.client, "Temp scarf", "accessory");
    await a.client.from("outfit_items").insert({ outfit_id: outfitId, item_id: temp, position: 9 });
    await a.client.from("wardrobe_items").delete().eq("id", temp);
    const { data } = await a.client.from("outfit_items").select("item_id").eq("outfit_id", outfitId);
    assert(data?.length === 3, `expected 3 links, got ${data?.length}`);
  });

  console.log("Outfit feedback");
  const ownFeedback = async () => (await admin.from("outfit_feedback").select("item_ids, rating").eq("user_id", a.user.id)).data ?? [];
  await check("feedback is stored sorted and de-duplicated, one row per combination", async () => {
    const first = await a.client.from("outfit_feedback").insert({ item_ids: [shoes, shirt, shirt], rating: 1 });
    assert(!first.error, first.error?.message ?? "");
    // The same combination in another order updates the row (this is how the app saves a rating).
    const again = await a.client.from("outfit_feedback")
      .upsert({ item_ids: [shirt, shoes].sort(), rating: -1 }, { onConflict: "user_id,item_ids" });
    assert(!again.error, again.error?.message ?? "");
    const rows = await ownFeedback();
    assert(rows.length === 1, `expected 1 row, got ${rows.length}`);
    assert(JSON.stringify(rows[0].item_ids) === JSON.stringify([shirt, shoes].sort()) && rows[0].rating === -1, `got ${JSON.stringify(rows[0])}`);
  });
  await check("feedback cannot include another user's items or be written for someone else", async () => {
    const foreign = await a.client.from("outfit_feedback").insert({ item_ids: [shirt, bobShirt], rating: 1 });
    assert(foreign.error, "alice rated a combination with bob's item");
    const forBob = await a.client.from("outfit_feedback").insert({ item_ids: [shirt], rating: 1, user_id: b.user.id });
    assert(forBob.error, "alice wrote feedback as bob");
    assert((await ownFeedback()).length === 1, "a row was added");
  });
  await check("feedback is private", async () => {
    const { data } = await b.client.from("outfit_feedback").select("id");
    assert(data?.length === 0, "bob can see alice's feedback");
    await b.client.from("outfit_feedback").update({ rating: 1 }).eq("user_id", a.user.id);
    await b.client.from("outfit_feedback").delete().eq("user_id", a.user.id);
    const rows = await ownFeedback();
    assert(rows.length === 1 && rows[0].rating === -1, "bob changed alice's feedback");
  });
  await check("invalid ratings and empty combinations are rejected", async () => {
    for (const row of [{ item_ids: [chinos], rating: 2 }, { item_ids: [chinos], rating: 0 }, { item_ids: [], rating: 1 }]) {
      const { error } = await a.client.from("outfit_feedback").insert(row);
      assert(error, `${JSON.stringify(row)} should be rejected`);
    }
  });
  await check("a rating can be removed by its combination", async () => {
    // Same filter as the app; the live stylist check below then runs without feedback.
    const { error } = await a.client.from("outfit_feedback").delete().eq("item_ids", `{${[shirt, shoes].sort().join(",")}}`);
    assert(!error, error?.message ?? "");
    assert((await ownFeedback()).length === 0, "the rating is still there");
  });

  console.log("Shopping list & AI budget");
  await check("shopping list is private", async () => {
    await a.client.from("shopping_items").insert({ name: "Grey wool trousers", priority: 1 });
    const { data } = await b.client.from("shopping_items").select("id");
    assert(data?.length === 0, "bob can see alice's shopping list");
  });
  // consume_ai_call is service_role only; the Edge Functions call it with the verified user's id.
  // The counters are per UTC day, so a run that crosses midnight UTC can fail these checks.
  const quota = (userId: string | null, daily: number, global: number) =>
    admin.rpc("consume_ai_call", { p_user_id: userId, p_daily_limit: daily, p_global_limit: global });
  const today = () => new Date().toISOString().slice(0, 10);
  const userCalls = async (userId: string) =>
    (await admin.from("ai_usage").select("calls").eq("user_id", userId).eq("day", today()).maybeSingle()).data?.calls ?? 0;
  const globalCalls = async () =>
    (await admin.from("ai_usage_global").select("calls").eq("day", today()).maybeSingle()).data?.calls ?? 0;

  await check("users and anonymous callers cannot call consume_ai_call", async () => {
    const anon = createClient(URL_, ANON!, { auth: { persistSession: false } });
    for (const client of [b.client, anon]) {
      const { error } = await client.rpc("consume_ai_call", { p_user_id: b.user.id, p_daily_limit: 1000, p_global_limit: 1000 });
      assert(error, "consume_ai_call should not be executable outside service_role");
    }
    const old = await b.client.rpc("consume_ai_call", { daily_limit: 100 });
    assert(old.error, "the old one-argument consume_ai_call should be gone");
  });
  await check("users cannot read or change the global counter or their own usage", async () => {
    const read = await b.client.from("ai_usage_global").select("calls");
    assert(read.error, "users should not read ai_usage_global");
    const insert = await b.client.from("ai_usage_global").insert({ day: "2000-01-01", calls: 0 });
    assert(insert.error, "users should not insert into ai_usage_global");
    const update = await b.client.from("ai_usage_global").update({ calls: 0 }).eq("day", today());
    assert(update.error, "users should not update ai_usage_global");
    const own = await b.client.from("ai_usage").insert({ user_id: b.user.id, day: "2000-01-01", calls: 0 });
    assert(own.error, "users should not insert into ai_usage");
    const before = await userCalls(b.user.id);
    await b.client.from("ai_usage").update({ calls: 0 }).eq("user_id", b.user.id);
    assert(await userCalls(b.user.id) === before, "users should not reset their own usage");
  });
  await check("the per-user limit stops at the limit and leaves the global counter alone", async () => {
    const [user0, global0] = [await userCalls(b.user.id), await globalCalls()];
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await quota(b.user.id, user0 + 2, global0 + 100)).data);
    assert(JSON.stringify(results) === '["ok","ok","user_limit"]', `got ${JSON.stringify(results)}`);
    assert(await userCalls(b.user.id) === user0 + 2, "user counter went past the limit");
    assert(await globalCalls() === global0 + 2, "a rejected call used global quota");
  });
  await check("a full global cap rejects without consuming either counter", async () => {
    const [user0, global0] = [await userCalls(a.user.id), await globalCalls()];
    assert(global0 > 0, "the previous check should have used global quota");
    const { data } = await quota(a.user.id, user0 + 100, global0);
    assert(data === "global_limit", `got ${JSON.stringify(data)}`);
    assert(await userCalls(a.user.id) === user0, "the user's slot was not given back");
    assert(await globalCalls() === global0, "the global counter changed");
  });
  await check("concurrent calls never exceed the global cap", async () => {
    const global0 = await globalCalls();
    const users = [a.user.id, b.user.id];
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => quota(users[i % 2], 100000, global0 + 5)));
    const ok = results.filter((r) => r.data === "ok").length;
    assert(results.every((r) => !r.error), "a concurrent call errored");
    assert(ok === 5, `${ok} calls succeeded, expected 5`);
    assert(await globalCalls() === global0 + 5, "global counter is wrong");
  });
  await check("concurrent calls never exceed a user's limit", async () => {
    const user0 = await userCalls(b.user.id);
    const results = await Promise.all(Array.from({ length: 10 }, () => quota(b.user.id, user0 + 3, 1000000)));
    const ok = results.filter((r) => r.data === "ok").length;
    assert(ok === 3, `${ok} calls succeeded, expected 3`);
    assert(await userCalls(b.user.id) === user0 + 3, "user counter is wrong");
  });
  await check("invalid limits raise and a limit of 0 changes nothing", async () => {
    for (const [userId, daily, global] of [[b.user.id, -1, 10], [b.user.id, 10, -1], [null, 10, 10]] as const) {
      const { error } = await quota(userId, daily, global);
      assert(error?.code === "22023", `expected 22023, got ${error?.code}: ${error?.message}`);
    }
    const [user0, global0] = [await userCalls(b.user.id), await globalCalls()];
    assert((await quota(b.user.id, 0, 1000000)).data === "user_limit", "daily limit 0 should reject");
    assert((await quota(b.user.id, 1000000, 0)).data === "global_limit", "global limit 0 should reject");
    assert(await userCalls(b.user.id) === user0 && await globalCalls() === global0, "a counter changed");
  });

  console.log("Storage isolation");
  const alicePath = `${a.user.id}/smoke.png`;
  await check("upload to own folder", async () => {
    const { error } = await a.client.storage.from(BUCKET).upload(alicePath, PNG, { contentType: "image/png" });
    assert(!error, error?.message ?? "");
  });
  await check("cannot upload into someone else's folder", async () => {
    const { error } = await b.client.storage.from(BUCKET).upload(`${a.user.id}/evil.png`, PNG, { contentType: "image/png" });
    assert(error, "bob uploaded into alice's folder");
  });
  await check("cannot read someone else's photo", async () => {
    const { data } = await b.client.storage.from(BUCKET).download(alicePath);
    assert(!data, "bob downloaded alice's photo");
    const signed = await b.client.storage.from(BUCKET).createSignedUrl(alicePath, 60);
    assert(!signed.data?.signedUrl, "bob got a signed URL for alice's photo");
  });
  await check("uploads must be flat, well-formed names in the caller's folder", async () => {
    for (const path of [`${a.user.id}/sub/nested.png`, `${a.user.id}/../${b.user.id}/evil.png`, `${a.user.id}/bad name.png`, `${a.user.id}/x.PNG`]) {
      const { error } = await a.client.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" });
      assert(error, `upload to ${path} should be rejected`);
    }
    const { data } = await admin.storage.from(BUCKET).list(`${a.user.id}/sub`);
    assert((data ?? []).length === 0, "a nested object was created");
  });
  await check("image_path must point into the owner's folder", async () => {
    for (const image_path of [`${b.user.id}/x.png`, `${a.user.id}/../${b.user.id}/x.png`, `${a.user.id}/sub/x.png`]) {
      const { error } = await a.client.from("wardrobe_items").insert({ name: "x", category: "top", image_path });
      assert(error?.code === "23514", `expected 23514 for ${image_path}, got ${error?.code}: ${error?.message}`);
    }
    const ok = await a.client.from("wardrobe_items").insert({ name: "Photo item", category: "top", image_path: alicePath }).select("id").single();
    assert(!ok.error, ok.error?.message ?? "");
    await a.client.from("wardrobe_items").delete().eq("id", ok.data!.id);
  });
  await check("bucket rejects non-image uploads", async () => {
    const { error } = await a.client.storage.from(BUCKET)
      .upload(`${a.user.id}/note.txt`, new TextEncoder().encode("hi"), { contentType: "text/plain" });
    assert(error, "text upload should be rejected");
  });

  console.log("Edge Functions");
  await check("functions require sign-in", async () => {
    for (const fn of ["analyze-item", "stylist", "wardrobe-gaps", "assistant", "delete-account"]) {
      const res = await callFunction(fn, {});
      assert(res.status === 401, `${fn} returned ${res.status} without a token`);
    }
  });
  await check("AI functions refuse without AI consent", async () => {
    // A photo path that does not exist: with consent off this is refused (403); if the consent guard were
    // broken, it would fail on the missing photo (404) before any AI call, so no data can reach Gemini.
    const res = await callFunction("analyze-item", { image_path: `${a.user.id}/consent-check-missing.png` }, a.token);
    assert(res.status === 403, `expected 403, got ${res.status}: ${res.text}`);
  });
  await a.client.from("profiles").update({ consent_ai_processing: true }).eq("id", a.user.id);
  await check("input validation returns 4xx, not 500", async () => {
    const res = await callFunction("stylist", { count: 99 }, a.token);
    assert(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}: ${res.text}`);
    const empty = await callFunction("stylist", {}, a.token);
    assert(empty.status === 400, `empty request should be 400, got ${empty.status}`);
    const chat = await callFunction("assistant", { messages: [{ role: "assistant", content: "hi" }] }, a.token);
    assert(chat.status >= 400 && chat.status < 500, `bad chat should be 4xx, got ${chat.status}`);
  });
  await check("analyze-item refuses other users' images", async () => {
    const res = await callFunction("analyze-item", { image_path: alicePath }, b.token);
    assert(res.status === 403, `expected 403, got ${res.status}: ${res.text}`);
  });
  await check("analyze-item refuses a non-image disguised as a PNG, without using AI quota", async () => {
    const fake = `${a.user.id}/disguised.png`;
    const upload = await a.client.storage.from(BUCKET)
      .upload(fake, new TextEncoder().encode("not really an image"), { contentType: "image/png" });
    assert(!upload.error, `the bucket only checks the declared type, so this upload should work: ${upload.error?.message}`);
    const before = (await admin.from("ai_usage").select("calls").eq("user_id", a.user.id).maybeSingle()).data?.calls ?? 0;
    const res = await callFunction("analyze-item", { image_path: fake }, a.token);
    assert(res.status === 400, `expected 400, got ${res.status}: ${res.text}`);
    const after = (await admin.from("ai_usage").select("calls").eq("user_id", a.user.id).maybeSingle()).data?.calls ?? 0;
    assert(after === before, "a rejected file used AI quota");
    await a.client.storage.from(BUCKET).remove([fake]);
  });
  await check("analyze-item rejects traversal and nested paths before reading storage", async () => {
    for (const image_path of [`${b.user.id}/../${a.user.id}/smoke.png`, `${b.user.id}/sub/x.png`, `${b.user.id}/x.gif`]) {
      const res = await callFunction("analyze-item", { image_path }, b.token);
      assert(res.status === 400, `expected 400 for ${image_path}, got ${res.status}: ${res.text}`);
    }
  });
  // The only check that reaches Gemini. Every other function check above is rejected before any AI call
  // (sign-in, consent, input validation, image ownership), so without LIVE_AI=1 no data goes to Google.
  if (LIVE_AI) {
    await check("stylist returns outfits from owned items (live Gemini call)", async () => {
      const res = await callFunction("stylist", { occasion: "Office", count: 1, local_date: "2026-10-27" }, a.token);
      assert(res.status === 200, `got ${res.status}: ${res.text}`);
      const outfits = res.json.outfits as { item_ids: string[] }[];
      const owned = new Set([shirt, chinos, shoes]);
      assert(outfits.length > 0 && outfits.every((o) => o.item_ids.every((id) => owned.has(id))), "outfit used unknown items");
    });
  } else {
    skipped.push("stylist live AI response (opt in with LIVE_AI=1; it sends test data to Google Gemini)");
    console.log(`  skip ${skipped.at(-1)}`);
  }

  console.log("Account deletion");
  await check("delete-account removes the user, rows and photos", async () => {
    const res = await callFunction("delete-account", {}, a.token);
    assert(res.status === 200, `got ${res.status}: ${res.text}`);
    // Empty body: a deleted user gets 401; if deletion failed, validation answers 400, never an AI call.
    const again = await callFunction("stylist", {}, a.token);
    assert(again.status === 401, `deleted user's token still works (${again.status})`);
    // Only an admin can see whether anything is left in the deleted user's folder.
    const { data } = await admin.storage.from(BUCKET).list(a.user.id);
    assert((data ?? []).length === 0, `${data?.length} photos remain`);
    const { data: rows } = await admin.from("wardrobe_items").select("id").eq("user_id", a.user.id);
    assert((rows ?? []).length === 0, "wardrobe rows remain");
  });
}

// Cleanup runs once, whichever path reaches it first (normal end, abort, or Ctrl+C).
let cleanupRun: Promise<string[]> | null = null;
const cleanup = () => (cleanupRun ??= cleanupTestUsers(admin, testUsers, redact));

function reportCleanup(problems: string[]) {
  if (problems.length) {
    console.log(`\nCleanup problems (${problems.length}); these smoke-test users may remain and need manual removal:`);
    for (const problem of problems) console.log(`  CLEANUP FAIL ${redact(problem)}`);
  } else {
    console.log(`\nCleanup: removed ${testUsers.length} test user(s) and their storage folders.`);
  }
}

// Deno does not run `finally` blocks on Ctrl+C, so clean up from the signal handler as well.
Deno.addSignalListener("SIGINT", async () => {
  console.log("\nInterrupted: cleaning up test users...");
  reportCleanup(await cleanup());
  Deno.exit(130);
});

console.log(`Smoke test against ${URL_}\n`);
const { aborted, cleanupProblems } = await runWithCleanup(main, cleanup);

console.log(`\n${passed} passed, ${failures.length} failed, ${skipped.length} skipped`);
if (aborted) console.log(`ABORTED before all checks ran: ${redact(aborted)}`);
reportCleanup(cleanupProblems);
if (failures.length || aborted || cleanupProblems.length) Deno.exit(1);
Deno.exit(0);
