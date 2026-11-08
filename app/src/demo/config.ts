// Temporary, local-only demo mode: lets you explore the Home, Wardrobe and Stylist screens with
// sample data and no account. It never creates accounts, never writes to the database and never calls
// the AI service. Demo state lives in memory only, so reloading the app ends it.
//
// To hide it: set DEMO_MODE_AVAILABLE to false.
// To remove it: delete the src/demo folder and the code marked "Demo mode" (search for "demo").
//
// Available in development (`npx expo start`), and in a production build only when it is built with
// EXPO_PUBLIC_DEMO_MODE=1 (the public web app uses this for "Explore demo"). __DEV__ is false in
// production builds, and Expo inlines EXPO_PUBLIC_ variables at build time.
export const DEMO_MODE_AVAILABLE = __DEV__ || process.env.EXPO_PUBLIC_DEMO_MODE === '1';

// Mirror of the provider's demo state for non-React code (see api.ts), so backend calls can be refused
// as a safety net even if a demo screen tried to make one.
let demoActive = false;

export function setDemoActiveFlag(active: boolean) {
  demoActive = active;
}

export function isDemoActive() {
  return demoActive;
}
