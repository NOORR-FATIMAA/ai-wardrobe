// Outfit inspiration photos from Unsplash (https://unsplash.com/documentation).
// Unsplash's API guidelines, which this module and the app follow:
// - images are hotlinked: the app shows the returned image URLs as they are (keeping their ixid);
// - every photo is credited to its photographer and Unsplash, with links that carry the utm parameters;
// - only search phrases are sent: a short description of clothes and colours, never user data.
import { HttpError } from "./http.ts";

/** Attribution links must identify the app (utm_source) and say it is a referral. */
export const UTM = "utm_source=wardrobe_ai&utm_medium=referral";
export const MAX_PHOTOS = 6;
export const MAX_QUERY_LENGTH = 80;

export interface InspirationPhoto {
  id: string;
  /** Hotlinked image (about 400 px wide), exactly as Unsplash returned it. */
  image_url: string;
  width: number;
  height: number;
  /** Average colour, shown while the image loads. */
  color: string | null;
  alt: string;
  photographer: string;
  photographer_url: string;
  photo_url: string;
}

/**
 * A search phrase that is safe to send to a photo or pin search: item codes (i3) removed, only
 * letters, digits, spaces, hyphens and apostrophes kept, whitespace collapsed, at most 80 characters.
 */
export function searchPhrase(text: string): string {
  return text
    .replace(/\bi\d+\b/gi, " ")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

const withUtm = (link: string) => `${link}${link.includes("?") ? "&" : "?"}${UTM}`;

const str = (value: unknown) => (typeof value === "string" ? value : "");
const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/** True for an https URL on exactly `host` (so a response can never point the app somewhere else). */
function onHost(value: string, host: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === host;
  } catch {
    return false;
  }
}

/** Photos from a /search/photos response; anything malformed is skipped rather than passed on. */
export function toPhotos(body: unknown, max = MAX_PHOTOS): InspirationPhoto[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const photos: InspirationPhoto[] = [];
  for (const raw of results) {
    const p = raw as Record<string, any>;
    const image = str(p?.urls?.small);
    const page = str(p?.links?.html);
    const profile = str(p?.user?.links?.html);
    const name = str(p?.user?.name).trim();
    const width = positive(p?.width);
    const height = positive(p?.height);
    if (!str(p?.id) || !onHost(image, "images.unsplash.com") || !onHost(page, "unsplash.com") ||
      !onHost(profile, "unsplash.com") || !name || !width || !height) continue;
    const color = str(p?.color);
    photos.push({
      id: p.id,
      image_url: image,
      width,
      height,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
      alt: str(p?.alt_description).trim().slice(0, 200) || "Outfit inspiration photo",
      photographer: name.slice(0, 80),
      photographer_url: withUtm(profile),
      photo_url: withUtm(page),
    });
    if (photos.length >= max) break;
  }
  return photos;
}

// Recent results per phrase. The free (demo) tier allows 50 searches an hour for the whole app, so the
// same look opened again, or by someone else, should not spend another one. Per server instance.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; photos: InspirationPhoto[] }>();

export function clearCache() {
  cache.clear();
}

export interface SearchOptions {
  key?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Searches Unsplash for portrait outfit photos; errors are user-readable HttpErrors. */
export async function searchPhotos(
  query: string,
  { key = Deno.env.get("UNSPLASH_ACCESS_KEY")?.trim(), fetchImpl = fetch, now = Date.now }: SearchOptions = {},
): Promise<InspirationPhoto[]> {
  if (!key || !/^[\x21-\x7E]+$/.test(key)) {
    if (key) console.error("UNSPLASH_ACCESS_KEY contains spaces, control or non-ASCII characters; set the secret again.");
    throw new HttpError(503, "Inspiration photos are not set up yet.");
  }
  const phrase = searchPhrase(query);
  if (phrase.length < 2) throw new HttpError(400, "Describe the look to search for.");

  const cacheKey = phrase.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.photos;

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", phrase);
  url.searchParams.set("per_page", String(MAX_PHOTOS + 4)); // a few spare in case some are malformed
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("content_filter", "high");

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    console.error(`Unsplash request failed: ${(error as Error)?.name ?? "error"}`);
    throw new HttpError(502, "Could not load inspiration photos. Please try again.");
  }
  if (!res.ok) {
    await res.body?.cancel();
    const limited = res.status === 429 || res.headers.get("X-Ratelimit-Remaining") === "0";
    console.error(`Unsplash API error ${res.status}${limited ? " (rate limit)" : ""}`);
    if (limited) throw new HttpError(503, "Too many inspiration searches right now. Try again in a while.");
    if (res.status === 401) throw new HttpError(503, "Inspiration photos are not set up correctly.");
    throw new HttpError(502, "Could not load inspiration photos. Please try again.");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new HttpError(502, "Could not load inspiration photos. Please try again.");
  }
  const photos = toPhotos(body);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { at: now(), photos });
  return photos;
}
