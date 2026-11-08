// Wardrobe photo object names are exactly "<user id>/<name>.<ext>": one folder deep, in the owner's
// folder, with a plain file name. The same format is enforced by the storage insert policy and the
// wardrobe_items.image_path constraint (migration 20261028000200_photo_path_format.sql).

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 1-128 letters, digits, "_" or "-", then a lowercase image extension. No dots, slashes or "%". */
export const PHOTO_FILE = /^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/;

const MEDIA_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** The storage bucket's own limit (5 MB, migration 20261026000000_init); checked again before use. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The image type a file really is, from its first bytes ("magic numbers"), or null if it is not a
 * JPEG, PNG or WebP. The bucket only checks the content type the uploader declared, so a file named
 * .jpg could hold anything.
 */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const starts = (offset: number, ...values: number[]) => values.every((v, i) => bytes[offset + i] === v);
  if (starts(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // "RIFF" <4-byte size> "WEBP"
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export type PhotoPathCheck =
  | { ok: true; mediaType: (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES] }
  | { ok: false; reason: "invalid" | "not_owner" };

/**
 * Validates a photo path before anything is read: the format first (rejects traversal, nested
 * folders, unexpected characters and unsupported extensions), then that the folder is the caller's.
 */
export function checkPhotoPath(path: string, userId: string): PhotoPathCheck {
  const parts = path.split("/");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [folder, file] = parts;
  if (!USER_ID.test(folder) || !PHOTO_FILE.test(file)) return { ok: false, reason: "invalid" };
  if (folder !== userId) return { ok: false, reason: "not_owner" };
  const extension = file.slice(file.lastIndexOf(".") + 1) as keyof typeof MEDIA_TYPES;
  return { ok: true, mediaType: MEDIA_TYPES[extension] };
}
