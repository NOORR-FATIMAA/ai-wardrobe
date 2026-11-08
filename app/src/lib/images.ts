import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { liftSubject } from '../../modules/subject-lifter';
import { createSignedUrlCache } from './signedUrlCache';
import { supabase } from './supabase';

/** Opens the camera or photo library; returns the local URI or null if cancelled/denied. */
export async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(`Permission to use the ${source === 'camera' ? 'camera' : 'photo library'} was denied.`);
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0].uri;
}

export interface PreparedPhoto {
  /** Downscaled JPEG, local file. */
  original: string;
  /** Transparent PNG of just the item, when on-device background removal succeeded. */
  cutout: string | null;
}

/**
 * Downscales to 1024px and re-encodes as JPEG (keeps storage and AI costs low, and re-encoding
 * drops EXIF metadata such as GPS location), then tries on-device background removal.
 */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1024, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  return { original: saved.uri, cutout: await liftSubject(saved.uri) };
}

/** Uploads a prepared local image (JPEG original or PNG cutout) to the user's private folder. */
export async function uploadWardrobePhoto(localUri: string, userId: string): Promise<string> {
  const png = localUri.toLowerCase().endsWith('.png');
  const rendered = await ImageManipulator.manipulate(localUri).renderAsync();
  const saved = await rendered.saveAsync(
    png ? { format: SaveFormat.PNG, base64: true } : { format: SaveFormat.JPEG, compress: 0.75, base64: true },
  );
  if (!saved.base64) throw new Error('Could not process the image.');

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${png ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage
    .from('wardrobe')
    .upload(path, decode(saved.base64), { contentType: png ? 'image/png' : 'image/jpeg' });
  if (error) throw new Error('Upload failed. Please try again.');
  return path;
}

/** Cut-out photos (transparent PNG) look best shown whole rather than cropped. */
export const isCutout = (path: string | null) => Boolean(path?.endsWith('.png'));

export async function deleteWardrobePhoto(path: string) {
  await supabase.storage.from('wardrobe').remove([path]);
}

// Private bucket: images are shown through short-lived signed URLs, cached per signed-in user until
// near expiry.
const SIGNED_URL_TTL = 60 * 60;
const urlCache = createSignedUrlCache(
  async (paths, ttl) => (await supabase.storage.from('wardrobe').createSignedUrls(paths, ttl)).data ?? [],
  SIGNED_URL_TTL,
);

export const signedUrls = (userId: string, paths: string[]) => urlCache.get(userId, paths);

/** Forgets every cached URL; called whenever the signed-in user changes or signs out. */
export const clearSignedUrlCache = () => urlCache.clear();
