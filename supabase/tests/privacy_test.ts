// Offline tests for the cross-user privacy hardening: photo path validation (analyze-item), storage
// folder cleanup (delete-account and the app's "Delete all clothes", both copies), the app's signed-URL
// cache, and the SQL format staying in step with the TypeScript one. No Supabase, no network.
//
//   npx deno test -A supabase/tests/privacy_test.ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { checkPhotoPath, PHOTO_FILE } from "../functions/_shared/photo_path.ts";
import * as functionCleanup from "../functions/_shared/storage_cleanup.ts";
import * as appCleanup from "../../app/src/lib/storageCleanup.ts";
import { createSignedUrlCache } from "../../app/src/lib/signedUrlCache.ts";

const A = "0b6f1c1e-4a7d-4e8b-9c1a-2f3e4d5c6b7a";
const B = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

// ---------------------------------------------------------------------------------------------
// Photo paths
// ---------------------------------------------------------------------------------------------

Deno.test("photo paths: the app's own upload names are accepted", () => {
  for (const [file, type] of [
    ["1761234567890-k3j9x2ab.jpg", "image/jpeg"],
    ["1761234567890-k3j9x2ab.png", "image/png"],
    ["smoke.jpeg", "image/jpeg"],
    ["Photo_01.webp", "image/webp"],
  ] as const) {
    assertEquals(checkPhotoPath(`${A}/${file}`, A), { ok: true, mediaType: type }, file);
  }
});

Deno.test("photo paths: another user's well-formed path is rejected as not the owner", () => {
  assertEquals(checkPhotoPath(`${B}/1761234567890-abc.jpg`, A), { ok: false, reason: "not_owner" });
});

Deno.test("photo paths: traversal, nesting, odd characters and bad extensions are invalid", () => {
  const invalid = [
    `${A}/../${B}/photo.jpg`, // traversal into B's folder (passed the old prefix check)
    `${A}/./photo.jpg`,
    `${A}/../photo.jpg`,
    `${A}/sub/photo.jpg`, // nested folder
    `${A}//photo.jpg`,
    `/${A}/photo.jpg`,
    `${A}/photo.jpg/`,
    `${A}`,
    `${A}/`,
    "photo.jpg",
    "",
    `${A}/..`,
    `${A}/..jpg`,
    `${A}/.jpg`,
    `${A}/photo..jpg`,
    `${A}/photo.jpg.exe`,
    `${A}/photo.gif`,
    `${A}/photo.svg`,
    `${A}/photo`,
    `${A}/photo.JPG`, // extensions are lowercase only, like the SQL rule
    `${A}/photo%2e.jpg`,
    `${A}/%2e%2e/photo.jpg`,
    `${A}/pho to.jpg`,
    `${A}/photo.jpg\n`,
    `${A}\\photo.jpg`,
    `${A}/phöto.jpg`,
    `${A}/${"x".repeat(129)}.jpg`,
    `${A.toUpperCase()}/photo.jpg`,
    `not-a-uuid/photo.jpg`,
    `${A}/photo.jpg?download=1`,
  ];
  for (const path of invalid) {
    assertEquals(checkPhotoPath(path, A), { ok: false, reason: "invalid" }, JSON.stringify(path));
  }
  assertEquals(checkPhotoPath(`${A}/${"x".repeat(128)}.jpg`, A).ok, true, "128 characters is the limit");
});

Deno.test("analyze-item validates the path before touching storage", async () => {
  const source = await read("../functions/analyze-item/index.ts");
  const check = source.indexOf("checkPhotoPath(image_path, ctx.user.id)");
  assert(check > 0, "analyze-item must use checkPhotoPath");
  assert(check < source.indexOf(".download("), "the path must be checked before the download");
  assert(!source.includes("startsWith("), "the old prefix-only check should be gone");
});

Deno.test("the migration uses the same file-name pattern as photo_path.ts, in all three places", async () => {
  const sql = await read("../migrations/20261028000200_photo_path_format.sql");
  // PHOTO_FILE without its leading "^" is what follows "<user id>/" in the SQL.
  const tail = PHOTO_FILE.source.slice(1);
  assertEquals(tail, "[A-Za-z0-9_-]{1,128}\\.(jpg|jpeg|png|webp)$");
  // The pre-check, its hint, the table constraint and the storage policy.
  assertEquals(sql.split(`/${tail}`).length - 1, 4);
  assert(sql.includes("'^' || user_id::text || '/"), "table rule must be anchored to the row's owner");
  assert(sql.includes("'^' || auth.uid()::text || '/"), "upload rule must be anchored to the caller");
});

Deno.test("the update policy keeps USING and checks the result against the upload format", async () => {
  const init = await read("../migrations/20261026000000_init.sql");
  const sql = await read("../migrations/20261028000300_photo_path_update_policy.sql");
  const using = "using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text)";
  // The policy being replaced, as created in init (USING only, no WITH CHECK).
  assert(init.includes(`create policy "wardrobe update own" on storage.objects\n  for update to authenticated\n  ${using};`.replaceAll("\n", init.includes("\r\n") ? "\r\n" : "\n")));
  const code = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
  assert(code.includes('drop policy "wardrobe update own" on storage.objects;'));
  assert(code.includes('create policy "wardrobe update own" on storage.objects'));
  assert(code.includes("for update to authenticated"));
  assert(code.includes(using), "USING must stay exactly as before");
  const withCheck = code.slice(code.indexOf("with check"));
  assert(withCheck.includes("bucket_id = 'wardrobe'"));
  assert(withCheck.includes(`name ~ ('^' || auth.uid()::text || '/${PHOTO_FILE.source.slice(1)}')`), "WITH CHECK must use the upload pattern");
  // Only the update policy changes; select, insert and delete stay as they are.
  for (const other of ["wardrobe read own", "wardrobe insert own", "wardrobe delete own"]) assert(!code.includes(other), other);
});

Deno.test("the README's production preflight matches what the migrations need and create", async () => {
  const readme = await read("../../README.md");
  const start = readme.indexOf("### Production: read-only checks");
  assert(start > 0, "preflight section missing");
  const sql = readme.slice(readme.indexOf("```sql", start), readme.indexOf("```\n", readme.indexOf("```sql", start) + 6));
  assert(/^```sql\s+with checks/.test(sql) && !/\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\s/i.test(sql.replace(/'[^']*'/g, "''")),
    "the preflight must be a single read-only SELECT");

  const migrations = await Promise.all([
    "20261028000000_wear_log_outfit_owner.sql",
    "20261028000100_global_ai_quota.sql",
    "20261028000200_photo_path_format.sql",
    "20261028000300_photo_path_update_policy.sql",
    "20261106000000_item_purchase_price.sql",
    "20261107000000_outfit_feedback.sql",
  ].map((name) => read(`../migrations/${name}`)));
  const all = migrations.join("\n");
  // Every name the migrations create must be checked as "must be free".
  const created = [
    ...[...all.matchAll(/add constraint (\w+)/g)].map((m) => m[1]),
    ...[...all.matchAll(/add column \w+[^;]*?\bconstraint (\w+)/g)].map((m) => m[1]),
    ...[...all.matchAll(/create (?:unique )?index (\w+)/g)].map((m) => m[1]),
    ...[...all.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]),
  ];
  assertEquals(created.sort(), [
    "ai_usage_global", "outfit_feedback", "outfit_feedback_combo_key", "outfits_id_user_id_key",
    "wardrobe_items_image_path_format", "wardrobe_items_purchase_price_range", "wear_log_outfit_idx", "wear_log_outfit_owner_fkey",
  ]);
  // A new function (as opposed to the ones the migrations deliberately replace) must be free too:
  // "create or replace" would otherwise silently overwrite an existing one.
  assert(sql.includes("proname = 'outfit_feedback_normalize'"), "preflight does not check outfit_feedback_normalize");
  for (const name of created) assert(sql.includes(`'${name}'`), `preflight does not check ${name}`);
  // New columns must be checked as free too.
  const columns = [...all.matchAll(/alter table public\.(\w+)\s+add column (\w+)/g)].map((m) => [m[1], m[2]]);
  assertEquals(columns, [["wardrobe_items", "purchase_price"]]);
  for (const [table, column] of columns) {
    assert(sql.includes(`'public.${table}'::regclass and attname = '${column}'`), `preflight does not check ${table}.${column}`);
  }
  // Everything the migrations drop by exact name must be checked as present.
  const dropped = [...all.matchAll(/drop (?:policy|constraint|function) "?([\w. ]+?)"?(?: on |;|,|\()/g)]
    .map((m) => m[1].trim().replace(/^public\./, ""));
  assertEquals(dropped.sort(), ["consume_ai_call", "wardrobe insert own", "wardrobe update own", "wear_log_outfit_id_fkey"]);
  for (const name of dropped) assert(sql.includes(name), `preflight does not check ${name}, which a migration drops`);
  assert(sql.includes("'consume_ai_call(integer)'"), "the exact dropped signature must be expected");
  // The same image_path rule as the migration's own pre-check.
  assert(sql.includes(`'^' || user_id::text || '/${PHOTO_FILE.source.slice(1)}'`), "image_path rule differs from the migration");
  // The applied migrations it expects are the two applied files.
  assert(sql.includes("'20261026000000, 20261027000000'"));
});

Deno.test("applied migrations are unchanged and new ones sort after them", async () => {
  const sha256 = async (path: string) => {
    const bytes = await Deno.readFile(new URL(path, import.meta.url));
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  // Already applied to the hosted project; editing them would not change the database and would
  // desynchronise the repository from it.
  assertEquals(await sha256("../migrations/20261026000000_init.sql"), "aa1bd7f4ffe279a30dfd022196d24ba0449f509c5d3fd6c2de722433a7476410");
  assertEquals(await sha256("../migrations/20261027000000_wear_log.sql"), "10ffb90aa56bac888206b376e4f68dd9b2aa29cf47ef9fa5c586f1c7bb001e7e");
  const names = [...Deno.readDirSync(new URL("../migrations/", import.meta.url))].map((e) => e.name).filter((n) => n.endsWith(".sql")).sort();
  assertEquals(names, [
    "20261026000000_init.sql",
    "20261027000000_wear_log.sql",
    "20261028000000_wear_log_outfit_owner.sql",
    "20261028000100_global_ai_quota.sql",
    "20261028000200_photo_path_format.sql",
    "20261028000300_photo_path_update_policy.sql",
    "20261106000000_item_purchase_price.sql",
    "20261107000000_outfit_feedback.sql",
  ]);
});

// ---------------------------------------------------------------------------------------------
// Storage cleanup (both copies)
// ---------------------------------------------------------------------------------------------

type Options = {
  /** Paths whose removal reports an error. */
  failRemove?: (path: string) => boolean;
  /** Paths that remove() silently leaves in place. */
  stuck?: (path: string) => boolean;
  /** Folders whose listing fails. */
  failList?: (folder: string) => boolean;
  /** Ignore offset and return the first page every time. */
  ignoreOffset?: boolean;
  /** Extra raw entries returned when listing a folder. */
  extraEntries?: Record<string, { name: string; id: string | null }[]>;
};

/** An in-memory bucket with Supabase-like listing: one level, folders as entries with id null. */
function fakeBucket(paths: string[], options: Options = {}) {
  const objects = new Set(paths);
  const removeCalls: string[][] = [];
  let listCalls = 0;
  const bucket = {
    list(folder: string, opts: { limit: number; offset: number }) {
      listCalls++;
      if (options.failList?.(folder)) return Promise.resolve({ data: null, error: { message: "list failed: secret detail" } });
      const children = new Map<string, string | null>();
      for (const path of objects) {
        if (!path.startsWith(`${folder}/`)) continue;
        const rest = path.slice(folder.length + 1).split("/");
        children.set(rest[0], rest.length > 1 ? null : `id-${path}`);
      }
      const entries = [...children].sort(([a], [b]) => a.localeCompare(b)).map(([name, id]) => ({ name, id }));
      entries.push(...(options.extraEntries?.[folder] ?? []));
      const start = options.ignoreOffset ? 0 : opts.offset;
      return Promise.resolve({ data: entries.slice(start, start + opts.limit), error: null });
    },
    remove(batch: string[]) {
      removeCalls.push(batch);
      if (batch.some((p) => options.failRemove?.(p))) {
        return Promise.resolve({ data: null, error: { message: "remove failed: secret detail" } });
      }
      const removed = batch.filter((p) => objects.has(p) && !options.stuck?.(p));
      for (const p of removed) objects.delete(p);
      return Promise.resolve({ data: removed.map((name) => ({ name })), error: null });
    },
  };
  return { bucket, objects, removeCalls, listCount: () => listCalls };
}

const many = (folder: string, n: number) => Array.from({ length: n }, (_, i) => `${folder}/${String(i).padStart(4, "0")}.jpg`);

for (const [label, { removeUserFolder }] of [["function", functionCleanup], ["app", appCleanup]] as const) {
  Deno.test(`${label} cleanup: removes flat files, nested folders and multiple pages, nothing else`, async () => {
    const own = [...many(A, 250), `${A}/sub/a.jpg`, `${A}/sub/deeper/b.png`, `${A}/other/c.webp`];
    const others = [`${B}/x.jpg`, `${B}/sub/y.jpg`, `${A}x/z.jpg`, "root.jpg"];
    const fake = fakeBucket([...own, ...others]);
    const result = await removeUserFolder(fake.bucket, A);
    assertEquals(result, { removed: own.length, problems: [] });
    assertEquals([...fake.objects].sort(), others.sort(), "only A's folder may be emptied");
    for (const batch of fake.removeCalls) {
      assert(batch.length <= 100, "batches are at most 100");
      for (const path of batch) assert(path.startsWith(`${A}/`), `removed outside A's folder: ${path}`);
    }
  });

  Deno.test(`${label} cleanup: an empty folder is fine`, async () => {
    const fake = fakeBucket([`${B}/x.jpg`]);
    assertEquals(await removeUserFolder(fake.bucket, A), { removed: 0, problems: [] });
    assertEquals(fake.removeCalls.length, 0);
  });

  Deno.test(`${label} cleanup: refuses malformed user ids before any request`, async () => {
    for (const id of ["", "..", `${A}/..`, `../${B}`, `${A}/sub`, A.toUpperCase(), "*", `${A} `]) {
      const fake = fakeBucket([`${A}/x.jpg`, `${B}/y.jpg`]);
      await assertRejects(() => removeUserFolder(fake.bucket, id), Error, "invalid user id");
      assertEquals(fake.listCount(), 0, `listed with id ${JSON.stringify(id)}`);
      assertEquals(fake.removeCalls.length, 0);
    }
  });

  Deno.test(`${label} cleanup: a failed removal is reported and does not loop`, async () => {
    const fake = fakeBucket(many(A, 150), { failRemove: (p) => p.endsWith("0003.jpg") });
    const result = await removeUserFolder(fake.bucket, A);
    assertEquals(result.problems, ["could not remove 100 object(s)"]);
    assertEquals(result.removed, 50);
    assertEquals(fake.removeCalls.length, 2, "each batch is tried once");
    assert(!result.problems.join(" ").includes("secret detail"), "storage error details are not exposed");
  });

  Deno.test(`${label} cleanup: objects that silently stay are caught by the final check`, async () => {
    const fake = fakeBucket([`${A}/keep.jpg`, `${A}/sub/gone.jpg`], { stuck: (p) => p === `${A}/keep.jpg` });
    const result = await removeUserFolder(fake.bucket, A);
    assertEquals(result.problems, ["1 object(s) are still in the folder"]);
    assertEquals(fake.removeCalls.length, 1);
  });

  Deno.test(`${label} cleanup: a listing that ignores the offset stops instead of looping`, async () => {
    const fake = fakeBucket(many(A, 250), { ignoreOffset: true });
    const result = await removeUserFolder(fake.bucket, A);
    assert(result.problems.includes("stopped listing: a folder returned repeated results"), result.problems.join("; "));
    assert(fake.listCount() < 10, `listed ${fake.listCount()} times`);
  });

  Deno.test(`${label} cleanup: list errors are reported without details`, async () => {
    const fake = fakeBucket([`${A}/x.jpg`, `${A}/sub/y.jpg`], { failList: (folder) => folder === `${A}/sub` });
    const result = await removeUserFolder(fake.bucket, A);
    assertEquals(result.problems, ["could not list a folder"]);
    assertEquals([...fake.objects], [`${A}/sub/y.jpg`], "what could be listed is still removed");
  });

  Deno.test(`${label} cleanup: unsafe entry names are skipped, never turned into paths`, async () => {
    const fake = fakeBucket([`${A}/x.jpg`], {
      extraEntries: { [A]: [{ name: "..", id: null }, { name: `../${B}`, id: "f" }, { name: "", id: "g" }, { name: ".", id: null }] },
    });
    const result = await removeUserFolder(fake.bucket, A);
    assertEquals(result.problems.length, 4);
    assert(result.problems.every((p) => p === "skipped an entry with an unexpected name"));
    assertEquals(fake.removeCalls.flat(), [`${A}/x.jpg`]);
  });

  Deno.test(`${label} cleanup: very deep nesting is bounded`, async () => {
    const deep = `${A}/${Array.from({ length: 12 }, (_, i) => `d${i}`).join("/")}/x.jpg`;
    const fake = fakeBucket([deep, `${A}/top.jpg`]);
    const result = await removeUserFolder(fake.bucket, A);
    assert(result.problems.includes("skipped folders nested too deeply"), result.problems.join("; "));
    assertEquals([...fake.objects], [deep], "reachable objects are still removed");
  });
}

Deno.test("both cleanup copies are identical apart from quote style", async () => {
  const strip = (code: string) =>
    code.split("\n").filter((line) => !line.startsWith("//")).join("\n")
      .replaceAll('"', "'").replace(/for \(let offset = 0;;/, "for (let offset = 0; ;");
  const fn = strip(await read("../functions/_shared/storage_cleanup.ts"));
  const app = strip(await read("../../app/src/lib/storageCleanup.ts"));
  assertEquals(app, fn);
});

Deno.test("delete-account and Delete all clothes use the bounded cleanup", async () => {
  const fn = await read("../functions/delete-account/index.ts");
  const profile = await read("../../app/src/app/profile.tsx");
  for (const [name, source] of [["delete-account", fn], ["profile", profile]]) {
    assert(source.includes("removeUserFolder("), `${name} must use removeUserFolder`);
    assert(!source.includes("for (;;)"), `${name} still has an unbounded loop`);
  }
  assert(fn.indexOf("removeUserFolder(") < fn.indexOf("deleteUser("), "photos are removed before the account");
  assert(/if \(problems\.length\)[\s\S]*throw/.test(fn), "delete-account must stop when cleanup is incomplete");
});

// ---------------------------------------------------------------------------------------------
// Signed-URL cache
// ---------------------------------------------------------------------------------------------

function fakeSigner() {
  const calls: string[][] = [];
  let pending: (() => void) | null = null;
  let hold = false;
  const sign = async (paths: string[]) => {
    calls.push(paths);
    if (hold) {
      hold = false; // only the next call is held
      await new Promise<void>((resolve) => (pending = resolve));
    }
    return paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?n=${calls.length}` }));
  };
  return {
    sign,
    calls,
    holdNext() {
      hold = true;
    },
    release() {
      pending?.();
    },
  };
}

Deno.test("url cache: reuses URLs for the same user", async () => {
  const signer = fakeSigner();
  const cache = createSignedUrlCache(signer.sign, 3600, () => 0);
  const first = await cache.get(A, [`${A}/1.jpg`, `${A}/1.jpg`]);
  const second = await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(second, first);
  assertEquals(signer.calls, [[`${A}/1.jpg`]]);
});

Deno.test("url cache: switching account never returns the previous account's URLs", async () => {
  const signer = fakeSigner();
  const cache = createSignedUrlCache(signer.sign, 3600, () => 0);
  await cache.get(A, [`${A}/1.jpg`]);
  // B asks for A's path (e.g. a stale or crafted image_path): it is neither served nor signed.
  assertEquals(await cache.get(B, [`${A}/1.jpg`]), {});
  assertEquals(signer.calls.length, 1);
  // Back to A: the cache was reset by the switch, so A's URL is signed again.
  await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(signer.calls.length, 2);
});

Deno.test("url cache: clear() on sign-out forgets everything", async () => {
  const signer = fakeSigner();
  const cache = createSignedUrlCache(signer.sign, 3600, () => 0);
  await cache.get(A, [`${A}/1.jpg`]);
  cache.clear();
  await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(signer.calls.length, 2);
});

Deno.test("url cache: a request still signing when the account changes returns and caches nothing", async () => {
  for (const change of ["sign-out", "other user"] as const) {
    const signer = fakeSigner();
    const cache = createSignedUrlCache(signer.sign, 3600, () => 0);
    signer.holdNext();
    const slow = cache.get(A, [`${A}/1.jpg`]);
    await Promise.resolve();
    if (change === "sign-out") cache.clear();
    else await cache.get(B, [`${B}/2.jpg`]).catch(() => {});
    signer.release();
    assertEquals(await slow, {}, change);
    await cache.get(A, [`${A}/1.jpg`]);
    assertEquals(signer.calls.filter((c) => c[0] === `${A}/1.jpg`).length, 2, `${change}: A's late URL was cached`);
  }
});

Deno.test("url cache: entries expire five minutes early and ignore unrequested paths", async () => {
  let time = 0;
  const calls: string[][] = [];
  const cache = createSignedUrlCache((paths) => {
    calls.push(paths);
    return Promise.resolve([...paths, `${B}/sneaky.jpg`].map((path) => ({ path, signedUrl: `u:${path}` })));
  }, 3600, () => time);
  const result = await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(Object.keys(result), [`${A}/1.jpg`]);
  time = (3600 - 300) * 1000 - 1;
  await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(calls.length, 1, "still fresh");
  time += 1;
  await cache.get(A, [`${A}/1.jpg`]);
  assertEquals(calls.length, 2, "re-signed once within the safety margin");
});

Deno.test("the app clears the URL cache when the user changes and passes the user to it", async () => {
  const data = await read("../../app/src/lib/data.tsx");
  const block = data.slice(data.indexOf("if (trackedUser !== userId)"), data.indexOf("const [loadedFor"));
  assert(block.includes("clearSignedUrlCache()"), "user change must clear the URL cache");
  assert(data.includes("signedUrls(userId, paths)"), "signedUrls must be scoped to the user");
});
