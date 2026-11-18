import { useSyncExternalStore } from 'react';

// The first-run tour: shown once per user on this device (Home opens it), and again on request from
// the profile ("Take the app tour"). Progress is kept on the device only.
const key = (userId: string) => `wardrobe.tour.${userId}`;

let requested = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** True when this user has already finished or skipped the tour on this device. */
export function tourSeen(userId: string) {
  try {
    return globalThis.localStorage?.getItem(key(userId)) === 'done';
  } catch {
    return false;
  }
}

export function markTourSeen(userId: string) {
  try {
    globalThis.localStorage?.setItem(key(userId), 'done');
  } catch {
    // Not saved: the tour may show again next time.
  }
  requested = false;
  emit();
}

/** Opens the tour again (Profile → "Take the app tour"). */
export function requestTour() {
  requested = true;
  emit();
}

/** Whether the tour should be showing for this user now. */
export function useTourVisible(userId: string | undefined) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => Boolean(userId) && (requested || !tourSeen(userId!)),
  );
}
