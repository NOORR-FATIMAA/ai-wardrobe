// Offline tests for the smoke test's user lifecycle (smoke_cleanup.ts), using an in-memory fake of the
// Supabase admin client. No network, no real keys.
//
//   npx deno test -A supabase/tests/smoke_cleanup_test.ts
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.14";
import {
  type AdminApi,
  cleanupTestUsers,
  createTrackedUser,
  makeRedactor,
  runWithCleanup,
  type TestUser,
} from "./smoke_cleanup.ts";

const FAKE_SERVICE_KEY = "fake-service-role-key-0123456789";
const redact = makeRedactor([FAKE_SERVICE_KEY]);

type Failure = { message: string; status?: number };

/** In-memory stand-in for the service-role client. Records every call so tests can prove what was touched. */
class FakeAdmin implements AdminApi {
  users = new Map<string, string>(); // id -> email
  files = new Set<string>(); // "<folder>/<name>" object paths in the wardrobe bucket
  folders = new Set<string>(); // "<folder>/<subfolder>" pseudo-folders
  calls: string[] = [];
  failCreate: Failure | null = null;
  failLookup = new Map<string, Failure>();
  failDelete = new Map<string, Failure>();
  failList = new Map<string, Failure>();
  failRemove: Failure | null = null;
  deleteIsNoop = new Set<string>(); // deleteUser "succeeds" but the user remains
  nextIds: string[] = [];

  auth = {
    admin: {
      createUser: async ({ email }: { email: string }) => {
        this.calls.push(`createUser ${email}`);
        if (this.failCreate) return { data: { user: null }, error: this.failCreate };
        const id = this.nextIds.shift() ?? crypto.randomUUID();
        this.users.set(id, email);
        return { data: { user: { id, email } }, error: null };
      },
      getUserById: async (id: string) => {
        this.calls.push(`getUserById ${id}`);
        const failure = this.failLookup.get(id);
        if (failure) return { data: { user: null }, error: failure };
        const email = this.users.get(id);
        return email
          ? { data: { user: { id, email } }, error: null }
          : { data: { user: null }, error: { message: "User not found", status: 404 } };
      },
      deleteUser: async (id: string) => {
        this.calls.push(`deleteUser ${id}`);
        const failure = this.failDelete.get(id);
        if (failure) return { error: failure };
        if (!this.users.has(id)) return { error: { message: "User not found", status: 404 } };
        if (!this.deleteIsNoop.has(id)) this.users.delete(id);
        return { error: null };
      },
    },
  };

  storage = {
    from: (bucket: string) => {
      assertEquals(bucket, "wardrobe");
      return {
        list: async (path: string, { limit }: { limit: number }) => {
          this.calls.push(`list ${path}`);
          const failure = this.failList.get(path);
          if (failure) return { data: null, error: failure };
          const files = [...this.files].filter((f) => f.startsWith(`${path}/`)).map((f) => ({ name: f.slice(path.length + 1), id: "obj" }));
          const subfolders = [...this.folders].filter((f) => f.startsWith(`${path}/`)).map((f) => ({ name: f.slice(path.length + 1), id: null }));
          return { data: [...subfolders, ...files].slice(0, limit), error: null };
        },
        remove: async (paths: string[]) => {
          this.calls.push(`remove ${paths.length}`);
          if (this.failRemove) return { error: this.failRemove };
          for (const p of paths) this.files.delete(p);
          return { error: null };
        },
      };
    },
  };

  /** Every id or path the fake was asked to act on. */
  touched(): string[] {
    return this.calls.map((c) => c.split(" ")[1]);
  }
}

const OTHER_ID = "99999999-9999-4999-8999-999999999999";

function fakeWithUnrelatedData() {
  const admin = new FakeAdmin();
  admin.users.set(OTHER_ID, "real.person@gmail.com");
  admin.files.add(`${OTHER_ID}/precious.jpg`);
  return admin;
}

Deno.test("created users are recorded immediately, even when the next creation fails", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const alice = await createTrackedUser(admin, registry, "alice", "pw");
  admin.failCreate = { message: "rate limited" };
  await assertRejects(() => createTrackedUser(admin, registry, "bob", "pw"), Error, "create bob: rate limited");
  assertEquals(registry, [alice]);
  assert(alice.email.startsWith("smoke-alice-") && alice.email.endsWith("@example.test"), alice.email);
});

Deno.test("a user is still recorded when the step after creation (sign-in) fails", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const { aborted, cleanupProblems } = await runWithCleanup(
    async () => {
      await createTrackedUser(admin, registry, "alice", "pw");
      throw new Error("sign-in failed for alice: invalid credentials");
    },
    () => cleanupTestUsers(admin, registry, redact),
  );
  assertEquals(aborted, "sign-in failed for alice: invalid credentials");
  assertEquals(cleanupProblems, []);
  assertEquals([...admin.users.keys()], [OTHER_ID]);
});

Deno.test("cleanup removes the test users' storage folders and accounts, and nothing else", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  const b = await createTrackedUser(admin, registry, "bob", "pw");
  admin.files.add(`${a.id}/smoke.png`);
  admin.files.add(`${b.id}/other.png`);

  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems, []);
  assertEquals([...admin.users.keys()], [OTHER_ID]);
  assertEquals([...admin.files], [`${OTHER_ID}/precious.jpg`]);
  const touched = new Set(admin.touched().filter((t) => !t.includes("@") && !/^\d+$/.test(t)));
  assertEquals(touched, new Set([a.id, b.id]), "cleanup must only address the recorded test users");
});

Deno.test("users already removed by the delete-account check count as cleaned up", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  admin.users.delete(a.id); // as if delete-account already ran
  admin.files.add(`${a.id}/leftover.png`); // ...but left a file behind
  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems, []);
  assert(!admin.files.has(`${a.id}/leftover.png`), "leftover file should be removed");
  assert(!admin.calls.includes(`deleteUser ${a.id}`), "no delete needed for a missing user");
});

Deno.test("refuses to delete when the account no longer has this run's email", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  admin.users.set(a.id, "someone.else@gmail.com");
  admin.files.add(`${a.id}/photo.png`);
  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems.length, 1);
  assertStringIncludes(problems[0], "refusing to delete");
  assert(admin.users.has(a.id) && admin.files.has(`${a.id}/photo.png`), "nothing may be deleted");
});

Deno.test("refuses malformed records instead of addressing the bucket root", async () => {
  const admin = fakeWithUnrelatedData();
  const problems = await cleanupTestUsers(admin, [
    { id: "", email: "smoke-x-1@example.test", label: "empty id" },
    { id: OTHER_ID, email: "real.person@gmail.com", label: "wrong domain" },
  ], redact);
  assertEquals(problems.length, 2);
  for (const p of problems) assertStringIncludes(p, "refusing to clean up");
  assertEquals(admin.calls, [], "no API calls for rejected records");
});

Deno.test("each failure is reported, cleanup continues with the other users, and secrets are redacted", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  const b = await createTrackedUser(admin, registry, "bob", "pw");
  admin.failDelete.set(b.id, { message: `permission denied for key ${FAKE_SERVICE_KEY}`, status: 403 });
  admin.failList.set(a.id, { message: "storage unavailable", status: 503 });

  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems.length, 2);
  assert(problems.some((p) => p.includes("bob") && p.includes("could not delete user")));
  assert(problems.some((p) => p.includes("alice") && p.includes("could not list storage folder")));
  assert(!problems.join("\n").includes(FAKE_SERVICE_KEY), "secret leaked into a cleanup message");
  assertStringIncludes(problems.join("\n"), "[redacted]");
  assert(!admin.users.has(a.id), "alice is still deleted despite her storage problem");
  assert(admin.users.has(b.id), "bob remains (and is reported)");
});

Deno.test("a lookup failure is reported and that user is left untouched", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  admin.failLookup.set(a.id, { message: "timeout", status: 504 });
  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems.length, 1);
  assertStringIncludes(problems[0], "could not look up user");
  assert(admin.users.has(a.id));
});

Deno.test("a user that still exists after deletion is reported", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  admin.deleteIsNoop.add(a.id);
  const problems = await cleanupTestUsers(admin, registry, redact);
  assertEquals(problems.length, 1);
  assertStringIncludes(problems[0], "still exists");
});

Deno.test("storage cleanup pages through large folders and reports subfolders and remove errors", async () => {
  const admin = fakeWithUnrelatedData();
  const registry: TestUser[] = [];
  const a = await createTrackedUser(admin, registry, "alice", "pw");
  for (let i = 0; i < 250; i++) admin.files.add(`${a.id}/f${i}.png`);
  assertEquals(await cleanupTestUsers(admin, registry, redact), []);
  assertEquals(admin.calls.filter((c) => c.startsWith("remove")).length, 3);

  const admin2 = fakeWithUnrelatedData();
  const registry2: TestUser[] = [];
  const b = await createTrackedUser(admin2, registry2, "bob", "pw");
  admin2.folders.add(`${b.id}/nested`);
  const nested = await cleanupTestUsers(admin2, registry2, redact);
  assertEquals(nested.length, 1);
  assertStringIncludes(nested[0], "subfolders were not removed");

  const admin3 = fakeWithUnrelatedData();
  const registry3: TestUser[] = [];
  const c = await createTrackedUser(admin3, registry3, "carol", "pw");
  admin3.files.add(`${c.id}/x.png`);
  admin3.failRemove = { message: "denied" };
  const removeProblems = await cleanupTestUsers(admin3, registry3, redact);
  assertEquals(removeProblems.length, 1);
  assertStringIncludes(removeProblems[0], "could not remove storage objects");
});

Deno.test("runWithCleanup always cleans up and keeps both the original failure and cleanup problems", async () => {
  let cleaned = 0;
  const ok = await runWithCleanup(async () => {}, async () => (cleaned++, []));
  assertEquals(ok, { aborted: null, cleanupProblems: [] });

  const both = await runWithCleanup(
    async () => {
      throw new Error("insert failed");
    },
    async () => (cleaned++, ["bob: could not delete user: denied"]),
  );
  assertEquals(both, { aborted: "insert failed", cleanupProblems: ["bob: could not delete user: denied"] });

  const crashed = await runWithCleanup(
    async () => {
      throw new Error("first");
    },
    async () => {
      cleaned++;
      throw new Error("network down");
    },
  );
  assertEquals(crashed.aborted, "first");
  assertEquals(crashed.cleanupProblems, ["cleanup crashed: network down"]);
  assertEquals(cleaned, 3);
});

Deno.test("redactor replaces every occurrence of each secret and ignores empty values", () => {
  const r = makeRedactor([FAKE_SERVICE_KEY, undefined, "", "short"]);
  assertEquals(r(`a ${FAKE_SERVICE_KEY} b ${FAKE_SERVICE_KEY}`), "a [redacted] b [redacted]");
  assertEquals(r("short text stays"), "short text stays");
});
