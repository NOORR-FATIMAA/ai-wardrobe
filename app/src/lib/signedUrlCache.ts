// Cache of signed URLs for private photos, owned by one signed-in user at a time. Asking for another
// user (or clearing on sign-out) empties it, and a request that was still signing when the user
// changed returns nothing and caches nothing, so a previous account's URLs never reach the next one.

export type SignUrls = (
  paths: string[],
  ttlSeconds: number,
) => Promise<{ path: string | null; signedUrl: string | null }[]>;

/** Cached URLs are dropped this long before they actually expire. */
const EXPIRY_MARGIN_SECONDS = 300;

export function createSignedUrlCache(sign: SignUrls, ttlSeconds: number, now: () => number = Date.now) {
  let owner: string | null = null;
  let generation = 0;
  const cache = new Map<string, { url: string; expires: number }>();

  const reset = (nextOwner: string | null) => {
    owner = nextOwner;
    generation++;
    cache.clear();
  };

  return {
    /** Forget every cached URL (call when the user signs out or changes). */
    clear: () => reset(null),

    /** Signed URLs for `userId`'s own photos. Paths outside `<userId>/` are ignored. */
    async get(userId: string, paths: string[]): Promise<Record<string, string>> {
      if (owner !== userId) reset(userId);
      const startedIn = generation;
      const time = now();
      const result: Record<string, string> = {};
      const missing = new Set<string>();

      for (const path of new Set(paths)) {
        if (!path.startsWith(`${userId}/`)) continue;
        const cached = cache.get(path);
        if (cached && cached.expires > time) result[path] = cached.url;
        else missing.add(path);
      }

      if (missing.size) {
        const entries = await sign([...missing], ttlSeconds);
        // The user changed or signed out while signing: these URLs belong to nobody now.
        if (generation !== startedIn) return {};
        for (const entry of entries) {
          if (!entry.signedUrl || !entry.path || !missing.has(entry.path)) continue;
          result[entry.path] = entry.signedUrl;
          cache.set(entry.path, { url: entry.signedUrl, expires: time + (ttlSeconds - EXPIRY_MARGIN_SECONDS) * 1000 });
        }
      }
      return result;
    },
  };
}
