// Removes every object in a user's own storage folder, nested folders included. A copy of
// supabase/functions/_shared/storage_cleanup.ts (the app cannot import function code);
// supabase/tests/privacy_test.ts runs the same cases against both.
//
// It lists the whole tree first, so removals cannot shift list pages, then removes in batches, then
// lists once more to confirm nothing is left. Every loop is bounded and repeated results stop the
// walk, so a folder that cannot be emptied is reported instead of looping forever.

export interface StorageEntry {
  name: string;
  /** null for a folder (storage lists folders as entries without an id). */
  id: string | null;
}

type StorageError = { message: string } | null;

/** The slice of a supabase-js storage bucket client used here. */
export interface StorageFolderApi {
  list(
    path: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ): Promise<{ data: StorageEntry[] | null; error: StorageError }>;
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: StorageError }>;
}

export interface CleanupResult {
  removed: number;
  /** Empty when the folder is confirmed empty. Messages never include storage error details. */
  problems: string[];
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE = 100;
const MAX_DEPTH = 8;
const MAX_OBJECTS = 10_000;
const MAX_LIST_CALLS = 1_000;

const safeName = (name: string) => name !== '' && name !== '.' && name !== '..' && !name.includes('/');

/** Every object path under `<userId>/`, plus any problems met while listing. */
async function listTree(bucket: StorageFolderApi, userId: string) {
  const files = new Set<string>();
  const problems: string[] = [];
  const folders = [{ path: userId, depth: 0 }];
  const seenFolders = new Set([userId]);
  let calls = 0;

  while (folders.length) {
    const { path, depth } = folders.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      if (++calls > MAX_LIST_CALLS) {
        problems.push('stopped listing: too many list requests');
        return { files, problems };
      }
      const { data, error } = await bucket.list(path, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) {
        problems.push('could not list a folder');
        break;
      }
      const entries = data ?? [];
      let added = 0;
      for (const entry of entries) {
        if (!safeName(entry.name)) {
          problems.push('skipped an entry with an unexpected name');
          continue;
        }
        const child = `${path}/${entry.name}`;
        if (entry.id === null) {
          if (seenFolders.has(child)) continue;
          if (depth + 1 > MAX_DEPTH) {
            problems.push('skipped folders nested too deeply');
            continue;
          }
          seenFolders.add(child);
          folders.push({ path: child, depth: depth + 1 });
          added++;
        } else if (!files.has(child)) {
          if (files.size >= MAX_OBJECTS) {
            problems.push('stopped listing: too many objects');
            return { files, problems };
          }
          files.add(child);
          added++;
        }
      }
      if (entries.length < PAGE) break;
      // A full page with nothing new means the listing is repeating itself (e.g. offset ignored).
      if (added === 0) {
        problems.push('stopped listing: a folder returned repeated results');
        break;
      }
    }
  }
  return { files, problems };
}

/**
 * Empties `<userId>/` in `bucket`. Throws before any request if `userId` is not a user id, so it can
 * never address the bucket root or another folder. Only paths under `<userId>/` are ever removed.
 */
export async function removeUserFolder(bucket: StorageFolderApi, userId: string): Promise<CleanupResult> {
  if (!USER_ID.test(userId)) throw new Error('Refusing to clean storage: invalid user id');
  const prefix = `${userId}/`;

  const listed = await listTree(bucket, userId);
  const problems = [...listed.problems];
  const paths = [...listed.files].filter((path) => path.startsWith(prefix));

  let removed = 0;
  for (let i = 0; i < paths.length; i += PAGE) {
    const batch = paths.slice(i, i + PAGE);
    const { data, error } = await bucket.remove(batch);
    if (error) problems.push(`could not remove ${batch.length} object(s)`);
    else removed += data?.length ?? 0;
  }

  // Confirm once; anything left is reported, never retried in a loop.
  if (problems.length === 0) {
    const after = await listTree(bucket, userId);
    problems.push(...after.problems);
    if (after.files.size) problems.push(`${after.files.size} object(s) are still in the folder`);
  }
  return { removed, problems };
}
