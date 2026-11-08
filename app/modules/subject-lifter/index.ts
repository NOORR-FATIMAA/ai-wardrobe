import { requireOptionalNativeModule } from 'expo';

interface SubjectLifterNative {
  isAvailableAsync(): Promise<boolean>;
  /** Returns a file URI of a transparent PNG cropped to the subject, or null if no subject was found. */
  liftSubjectAsync(uri: string): Promise<string | null>;
}

// Optional: absent in Expo Go and on web, where photos are simply kept as they are.
const native = requireOptionalNativeModule<SubjectLifterNative>('SubjectLifter');

/** True when on-device background removal can run (iOS 17+ or Android with Google Play services). */
export async function isSubjectLiftingAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Cuts the main subject out of a photo on the device (the photo is not uploaded for this).
 * Resolves to a transparent PNG file URI, or null when unavailable or nothing was detected.
 */
export async function liftSubject(uri: string): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.liftSubjectAsync(uri);
  } catch (error) {
    console.warn('Background removal failed', error);
    return null;
  }
}
