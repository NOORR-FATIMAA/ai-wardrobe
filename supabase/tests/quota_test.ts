// Tests for AI consent and quota reservation (supabase/functions/_shared/context.ts) with stub clients.
// No Supabase, no network: the quota RPC and the profile query are replaced by in-memory stubs.
//
//   npx deno test -A supabase/tests/quota_test.ts
import { assert, assertEquals, assertInstanceOf, assertRejects } from "jsr:@std/assert@1.0.14";
import { HttpError } from "../functions/_shared/http.ts";

// context.ts reads the project URL and publishable key at import time; dummy values, never used here.
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key-not-a-real-secret");
Deno.env.delete("SUPABASE_PUBLISHABLE_KEYS");
const { parseLimit, requireAiAccess, reserveAiCall } = await import("../functions/_shared/context.ts");

type RpcCall = { fn: string; args: Record<string, unknown> };

/** A stand-in for the admin client: records every RPC call and answers with `result`. */
function stubAdmin(result: { data?: unknown; error?: unknown }) {
  const calls: RpcCall[] = [];
  const admin = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, calls };
}

/** A request context whose profile query returns `profile`. */
function stubContext(profile: unknown = { consent_ai_processing: true }) {
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: profile, error: null }) }) }) }),
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, user: { id: "verified-user-id" } as any };
}

/** Runs `fn` with the AI limit variables set as given (undefined = unset), then restores them. */
async function withLimits(vars: { daily?: string; global?: string }, fn: () => Promise<void>) {
  const saved = { daily: Deno.env.get("DAILY_AI_LIMIT"), global: Deno.env.get("GLOBAL_AI_DAILY_LIMIT") };
  const apply = (name: string, value: string | undefined) => value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  apply("DAILY_AI_LIMIT", vars.daily);
  apply("GLOBAL_AI_DAILY_LIMIT", vars.global);
  try {
    await fn();
  } finally {
    apply("DAILY_AI_LIMIT", saved.daily);
    apply("GLOBAL_AI_DAILY_LIMIT", saved.global);
  }
}

async function rejectsWith(promise: Promise<unknown>, status: number, text?: string) {
  const error = await assertRejects(() => promise, HttpError);
  assertEquals(error.status, status);
  if (text) assert(error.message.includes(text), error.message);
}

Deno.test("parseLimit accepts only whole numbers up to 7 digits", () => {
  assertEquals(parseLimit("0"), 0);
  assertEquals(parseLimit("25"), 25);
  assertEquals(parseLimit(" 25 "), 25);
  assertEquals(parseLimit("9999999"), 9999999);
  for (const bad of [undefined, "", "   ", "-1", "1.5", "abc", "1e3", "0x10", "10abc", "Infinity", "NaN", "12345678"]) {
    assertEquals(parseLimit(bad), null, `${JSON.stringify(bad)} should be rejected`);
  }
});

Deno.test("reserveAiCall sends the verified user id and the configured limits", async () => {
  await withLimits({ daily: "30", global: "500" }, async () => {
    const { admin, calls } = stubAdmin({ data: "ok" });
    await reserveAiCall(stubContext(), admin);
    assertEquals(calls, [{
      fn: "consume_ai_call",
      args: { p_user_id: "verified-user-id", p_daily_limit: 30, p_global_limit: 500 },
    }]);
  });
});

Deno.test("an unset DAILY_AI_LIMIT keeps the default of 60", async () => {
  await withLimits({ daily: undefined, global: "500" }, async () => {
    const { admin, calls } = stubAdmin({ data: "ok" });
    await reserveAiCall(stubContext(), admin);
    assertEquals(calls[0].args.p_daily_limit, 60);
  });
});

Deno.test("a missing, empty or invalid GLOBAL_AI_DAILY_LIMIT fails closed without calling the RPC", async () => {
  for (const global of [undefined, "", "  ", "abc", "-5", "2.5", "1e3", "12345678"]) {
    await withLimits({ daily: "30", global }, async () => {
      const { admin, calls } = stubAdmin({ data: "ok" });
      await rejectsWith(reserveAiCall(stubContext(), admin), 503, "temporarily unavailable");
      assertEquals(calls.length, 0, `RPC called with GLOBAL_AI_DAILY_LIMIT=${JSON.stringify(global)}`);
    });
  }
});

Deno.test("a set but invalid DAILY_AI_LIMIT fails closed without calling the RPC", async () => {
  for (const daily of ["", "abc", "-1", "60.5"]) {
    await withLimits({ daily, global: "500" }, async () => {
      const { admin, calls } = stubAdmin({ data: "ok" });
      await rejectsWith(reserveAiCall(stubContext(), admin), 503);
      assertEquals(calls.length, 0);
    });
  }
});

Deno.test("a limit of 0 is passed through so the database can switch AI off", async () => {
  await withLimits({ daily: "30", global: "0" }, async () => {
    const { admin, calls } = stubAdmin({ data: "global_limit" });
    await rejectsWith(reserveAiCall(stubContext(), admin), 429, "for everyone");
    assertEquals(calls[0].args.p_global_limit, 0);
  });
});

Deno.test("quota results map to 429 messages", async () => {
  await withLimits({ daily: "30", global: "500" }, async () => {
    await rejectsWith(reserveAiCall(stubContext(), stubAdmin({ data: "user_limit" }).admin), 429, "You have reached today's AI limit");
    await rejectsWith(reserveAiCall(stubContext(), stubAdmin({ data: "global_limit" }).admin), 429, "for everyone");
  });
});

Deno.test("database errors and unexpected results never count as allowed", async () => {
  await withLimits({ daily: "30", global: "500" }, async () => {
    const dbError = new Error("permission denied for function consume_ai_call");
    const thrown = await assertRejects(() => reserveAiCall(stubContext(), stubAdmin({ error: dbError }).admin));
    assertEquals(thrown, dbError);

    // The old boolean contract, a missing value, or an unknown status must not be read as "ok".
    for (const data of [true, false, null, "OK", "allowed", 1]) {
      const error = await assertRejects(() => reserveAiCall(stubContext(), stubAdmin({ data }).admin));
      assert(!(error instanceof HttpError), `${JSON.stringify(data)} should be a server error, not ${String(error)}`);
      assertInstanceOf(error, Error);
    }
  });
});

Deno.test("requireAiAccess refuses without consent and allows with it", async () => {
  await withLimits({ daily: "30", global: "500" }, async () => {
    await rejectsWith(requireAiAccess(stubContext({ consent_ai_processing: false })), 403);
    await rejectsWith(requireAiAccess(stubContext(null)), 403);
    await requireAiAccess(stubContext({ consent_ai_processing: true }));
  });
});

Deno.test("requireAiAccess rejects misconfigured limits with 503 before reading anything", async () => {
  const cases = [
    { global: undefined },
    { global: "" },
    { global: "abc" },
    { global: "-1" },
    { daily: "", global: "500" },
    { daily: "1.5", global: "500" },
  ];
  for (const vars of cases) {
    await withLimits(vars, async () => {
      let reads = 0;
      const ctx = stubContext();
      const db = ctx.db;
      ctx.db = { from: (...args: unknown[]) => (reads++, db.from(...args)) };
      await rejectsWith(requireAiAccess(ctx), 503, "temporarily unavailable");
      assertEquals(reads, 0, `profile read with ${JSON.stringify(vars)}`);
    });
  }
  // The explicit AI-off setting and an unset DAILY_AI_LIMIT are valid configurations.
  await withLimits({ daily: undefined, global: "0" }, () => requireAiAccess(stubContext()));
});

// Static check of the four AI functions: limits and consent checked first, before any data is loaded or
// another service is called; quota reserved after every early rejection and immediately before the only
// Gemini call, so a request that fails early never uses up quota.
Deno.test("AI functions check limits and consent first and reserve quota right before calling Gemini", async () => {
  for (const name of ["analyze-item", "stylist", "wardrobe-gaps", "assistant"]) {
    const source = await Deno.readTextFile(new URL(`../functions/${name}/index.ts`, import.meta.url));
    const count = (text: string) => source.split(text).length - 1;
    assertEquals(count("askModel("), 1, `${name}: expected one askModel call`);
    assertEquals(count("reserveAiCall(ctx)"), 1, `${name}: expected one reserveAiCall`);
    assertEquals(count("requireAiAccess(ctx)"), 1, `${name}: expected one requireAiAccess`);
    assertEquals(count("requireAiAllowance") + count("requireAiConsent"), 0, `${name}: still uses an old helper`);

    const consent = source.indexOf("requireAiAccess(ctx)");
    for (const work of ["loadWardrobe(", "loadProfileSummary(", "loadRecentWears(", "fetchForecast(", ".download("]) {
      const at = source.indexOf(work, source.indexOf("serve("));
      if (at >= 0) assert(consent < at, `${name}: ${work} runs before requireAiAccess`);
    }
    const reserve = source.indexOf("reserveAiCall(ctx)");
    const model = source.indexOf("askModel(");
    const beforeModel = source.slice(0, model);
    assert(consent < reserve && reserve < model, `${name}: wrong order`);
    assert(beforeModel.lastIndexOf("throw new HttpError") < reserve, `${name}: an early rejection comes after the reservation`);
    const between = source.slice(reserve + "reserveAiCall(ctx)".length, model);
    assert(/^;\s*(?:const \w+ = )?await\s+$/.test(between), `${name}: other work between reservation and Gemini: ${between}`);
  }
});
