// Guest mode: the app opens straight into a real (anonymous) Supabase account, with no sign-up screen.
// The guest can use everything, including the camera, the AI stylist and saving; data belongs to the
// anonymous user and stays on this device's session. When email sign-in returns, a guest can add an
// email to the same account (supabase.auth.updateUser) and keep everything.
//
// Needs "Allow anonymous sign-ins" on the Supabase project (Authentication → Sign In / Providers).
// Set to false to bring back the sign-in screen and demo mode.
export const GUEST_MODE = true;
