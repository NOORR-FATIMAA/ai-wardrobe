// Test-user lifecycle for smoke_test.ts. Every user the smoke test creates is recorded the moment the
// admin API returns it, and cleanup acts only on those recorded users: their own storage folder, then
// their account. Unit-tested offline in smoke_cleanup_test.ts.

export interface TestUser {
  id: string;
  email: string;
  label: string;
}

type ApiError = { message: string; status?: number } | null;

/** The slice of the supabase-js service-role client used here (a fake implements it in the unit tests). */
export interface AdminApi {
  auth: {
    admin: {
      createUser(attributes: { email: string; password: string; email_confirm: boolean }): Promise<{
        data: { user: { id: string; email?: string } | null };
        error: ApiError;
      }>;
      getUserById(id: string): Promise<{ data: { user: { id: string; email?: string } | null }; error: ApiError }>;
      deleteUser(id: string): Promise<{ error: ApiError }>;
    };
  };
  storage: {
    from(bucket: string): {
      list(path: string, options: { limit: number }): Promise<{
        data: { name: string; id: string | null }[] | null;
        error: ApiError;
      }>;
      remove(paths: string[]): Promise<{ error: ApiError }>;
    };
  };
}

export const BUCKET = "wardrobe";
export const TEST_EMAIL_DOMAIN = "example.test";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STORAGE_ROUNDS = 50;

/** Unique throwaway address, recognisable as smoke-test data if anything is ever left behind. */
export function testEmail(label: string): string {
  return `smoke-${label}-${crypto.randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
}

/** Returns a function that replaces every given secret (e.g. API keys) in a message with "[redacted]". */
export function makeRedactor(secrets: (string | undefined | null)[]): (text: string) => string {
  const values = secrets.filter((s): s is string => typeof s === "string" && s.length >= 8);
  return (text) => values.reduce((out, secret) => out.split(secret).join("[redacted]"), text);
}

const isNotFound = (error: ApiError) => Boolean(error && (error.status === 404 || /not.?found/i.test(error.message)));

/**
 * Creates a confirmed test user and records it in `registry` immediately, before anything else can
 * fail, so cleanup can always find it.
 */
export async function createTrackedUser(
  admin: AdminApi,
  registry: TestUser[],
  label: string,
  password: string,
): Promise<TestUser> {
  const email = testEmail(label);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = data?.user?.id;
  if (id && UUID.test(id)) registry.push({ id, email, label });
  if (error || !id) throw new Error(`create ${label}: ${error?.message ?? "no user returned"}`);
  if (!UUID.test(id)) throw new Error(`create ${label}: unexpected user id format`);
  return { id, email, label };
}

/** Removes every object in `<userId>/` of the wardrobe bucket. Returns a problem description, or null. */
async function removeStorageFolder(admin: AdminApi, userId: string, redact: (s: string) => string) {
  const bucket = admin.storage.from(BUCKET);
  for (let round = 0; round < MAX_STORAGE_ROUNDS; round++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) return `could not list storage folder: ${redact(error.message)}`;
    const entries = data ?? [];
    const files = entries.filter((entry) => entry.id !== null);
    if (files.length === 0) {
      const folders = entries.filter((entry) => entry.id === null);
      return folders.length ? `storage subfolders were not removed (${folders.length})` : null;
    }
    const { error: removeError } = await bucket.remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError) return `could not remove storage objects: ${redact(removeError.message)}`;
  }
  return `storage folder still not empty after ${MAX_STORAGE_ROUNDS} rounds`;
}

/**
 * Deletes exactly the recorded test users: storage folder first (objects do not cascade), then the
 * account (database rows cascade from it). Users already removed by the test itself count as cleaned.
 * Returns one message per problem; an empty array means every recorded user is gone.
 */
export async function cleanupTestUsers(
  admin: AdminApi,
  users: TestUser[],
  redact: (s: string) => string,
): Promise<string[]> {
  const problems: string[] = [];
  for (const user of [...users].reverse()) {
    const who = `${user.label} (${user.email})`;

    // Safety checks: only well-formed ids from this run, and only accounts that still carry this
    // run's throwaway address. A malformed id could otherwise address the bucket root.
    if (!UUID.test(user.id) || !user.email.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
      problems.push(`${who}: refusing to clean up, not a smoke-test user record`);
      continue;
    }
    const lookup = await admin.auth.admin.getUserById(user.id);
    if (lookup.error && !isNotFound(lookup.error)) {
      problems.push(`${who}: could not look up user: ${redact(lookup.error.message)}`);
      continue;
    }
    const account = lookup.error ? null : lookup.data?.user ?? null;
    if (account && account.email?.toLowerCase() !== user.email.toLowerCase()) {
      problems.push(`${who}: refusing to delete, the account's email does not match this test run`);
      continue;
    }

    const storageProblem = await removeStorageFolder(admin, user.id, redact);
    if (storageProblem) problems.push(`${who}: ${storageProblem}`);

    if (!account) continue; // already deleted (e.g. by the delete-account check)
    const deletion = await admin.auth.admin.deleteUser(user.id);
    if (deletion.error && !isNotFound(deletion.error)) {
      problems.push(`${who}: could not delete user: ${redact(deletion.error.message)}`);
      continue;
    }
    const after = await admin.auth.admin.getUserById(user.id);
    if (!after.error && after.data?.user) problems.push(`${who}: user still exists after deletion`);
  }
  return problems;
}

/**
 * Runs the test body and then always runs cleanup. A body exception is captured (not rethrown) so
 * cleanup still happens and the original failure can be reported alongside any cleanup problems.
 */
export async function runWithCleanup(
  body: () => Promise<void>,
  cleanup: () => Promise<string[]>,
): Promise<{ aborted: string | null; cleanupProblems: string[] }> {
  let aborted: string | null = null;
  try {
    await body();
  } catch (error) {
    aborted = error instanceof Error ? error.message : String(error);
  }
  let cleanupProblems: string[];
  try {
    cleanupProblems = await cleanup();
  } catch (error) {
    cleanupProblems = [`cleanup crashed: ${error instanceof Error ? error.message : String(error)}`];
  }
  return { aborted, cleanupProblems };
}
