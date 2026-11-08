import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const DEFAULT_DAILY_AI_LIMIT = 60;

/**
 * Hosted projects inject the new API keys as JSON dictionaries (SUPABASE_PUBLISHABLE_KEYS /
 * SUPABASE_SECRET_KEYS); older projects and the local stack inject the legacy single keys.
 */
function projectKey(dictionaryVar: string, legacyVar: string): string {
  const dictionary = Deno.env.get(dictionaryVar);
  if (dictionary) {
    try {
      const keys = JSON.parse(dictionary) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // fall through to the legacy variable
    }
  }
  const legacy = Deno.env.get(legacyVar);
  if (!legacy) throw new Error(`Missing ${dictionaryVar} / ${legacyVar}`);
  return legacy;
}

const SUPABASE_ANON_KEY = projectKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");

export interface RequestContext {
  /** Client acting as the caller, so every query is still filtered by row level security. */
  db: SupabaseClient;
  user: User;
}

export async function getContext(req: Request): Promise<RequestContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new HttpError(401, "Sign in required");

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  // An unreachable or failing auth service is not the caller's fault: answer 503, not "sign in".
  if (error && isAuthOutage(error)) throw new HttpError(503, "Sign-in service is unavailable. Please try again.");
  if (error || !data.user) throw new HttpError(401, "Sign in required");
  return { db, user: data.user };
}

/** Network failures (status 0 / AuthRetryableFetchError) and 5xx answers from the auth service. */
export function isAuthOutage(error: { name?: string; status?: number }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
}

/** Admin client for operations RLS cannot express (account deletion). Never expose to callers. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, projectKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/**
 * Call right after the request is validated, before loading any data or calling another service:
 * refuses with 503 when the AI limits are misconfigured (nothing else is read), then with 403 unless
 * the user has enabled AI processing.
 */
export async function requireAiAccess(ctx: RequestContext) {
  aiLimits();
  const { data: profile } = await ctx.db
    .from("profiles")
    .select("consent_ai_processing")
    .eq("id", ctx.user.id)
    .single();
  if (!profile?.consent_ai_processing) {
    throw new HttpError(403, "Enable AI processing in your privacy settings to use this feature.");
  }
}

/** A limit from an environment variable: a whole number up to 9,999,999, otherwise null. */
export function parseLimit(raw: string | undefined): number | null {
  const value = raw?.trim();
  return value && /^\d{1,7}$/.test(value) ? Number(value) : null;
}

/**
 * The per-user and project-wide daily AI limits. DAILY_AI_LIMIT defaults to 60 when unset;
 * GLOBAL_AI_DAILY_LIMIT has no default. A missing global limit or any malformed value disables AI
 * (503) rather than running without a cap. 0 switches AI off on purpose. The only limit parser: used
 * both by requireAiAccess (early) and reserveAiCall (again, right before the RPC).
 */
function aiLimits() {
  const rawDaily = Deno.env.get("DAILY_AI_LIMIT");
  const daily = rawDaily === undefined ? DEFAULT_DAILY_AI_LIMIT : parseLimit(rawDaily);
  const global = parseLimit(Deno.env.get("GLOBAL_AI_DAILY_LIMIT"));
  if (daily === null || global === null) {
    console.error("AI disabled: GLOBAL_AI_DAILY_LIMIT must be set, and both AI limits must be whole numbers.");
    throw new HttpError(503, "AI features are temporarily unavailable.");
  }
  return { daily, global };
}

const QUOTA_MESSAGES = {
  user_limit: "You have reached today's AI limit. It resets tomorrow.",
  global_limit: "The AI stylist has reached today's limit for everyone. Please try again tomorrow.",
} as const;

/**
 * Reserves one AI call against the user's and the project's daily limits. Call it immediately before
 * the Gemini request: a reserved call is not given back, even if that request then fails.
 * consume_ai_call is executable only by service_role, so this uses the admin client with the
 * verified user's id. `admin` is replaceable for tests.
 */
export async function reserveAiCall(ctx: RequestContext, admin?: Pick<SupabaseClient, "rpc">) {
  const limits = aiLimits();
  const { data, error } = await (admin ?? adminClient()).rpc("consume_ai_call", {
    p_user_id: ctx.user.id,
    p_daily_limit: limits.daily,
    p_global_limit: limits.global,
  });
  if (error) throw error;
  const result: unknown = data;
  if (result === "ok") return;
  if (result === "user_limit" || result === "global_limit") throw new HttpError(429, QUOTA_MESSAGES[result]);
  throw new Error("consume_ai_call returned an unexpected result");
}
