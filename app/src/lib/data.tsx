import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE_AVAILABLE, setDemoActiveFlag } from '../demo/config';
import { DEMO_ITEMS, DEMO_PROFILE } from '../demo/demoData';
import { clearSignedUrlCache, signedUrls } from './images';
import { supabase } from './supabase';
import type { Profile, WardrobeItem } from './types';

interface AppData {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  items: WardrobeItem[];
  imageUrls: Record<string, string>;
  refreshProfile(): Promise<void>;
  refreshItems(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  itemById(id: string): WardrobeItem | undefined;
  /** Demo mode: local sample data, no account and no backend. Never true while a real session exists. */
  demoActive: boolean;
  enterDemo(): void;
  exitDemo(): void;
}

const noBackendInDemo = async () => {};

const AppDataContext = createContext<AppData | null>(null);

async function fetchProfile(userId: string) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data as Profile | null;
}

async function fetchWardrobe(userId: string) {
  const { data } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });
  const items = (data ?? []) as WardrobeItem[];
  const paths = items.map((r) => r.image_path).filter((p): p is string => Boolean(p));
  return { items, urls: paths.length ? await signedUrls(userId, paths) : {} };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await fetchProfile(userId));
  }, [userId]);

  const refreshItems = useCallback(async () => {
    if (!userId) return;
    const wardrobe = await fetchWardrobe(userId);
    setItems(wardrobe.items);
    setImageUrls(wardrobe.urls);
  }, [userId]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!userId) return;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
      if (error) throw new Error('Could not save your profile.');
      setProfile(data as Profile);
    },
    [userId],
  );

  // Clear the previous user's data as soon as the signed-in user changes. The URL cache also
  // resets itself whenever it is asked for a different user.
  const [trackedUser, setTrackedUser] = useState(userId);
  if (trackedUser !== userId) {
    setTrackedUser(userId);
    setProfile(null);
    setItems([]);
    setImageUrls({});
    clearSignedUrlCache();
  }

  const [loadedFor, setLoadedFor] = useState<string | undefined>();
  useEffect(() => {
    if (!userId) return;
    let current = true;
    Promise.all([fetchProfile(userId), fetchWardrobe(userId)])
      .then(([nextProfile, wardrobe]) => {
        if (!current) return;
        setProfile(nextProfile);
        setItems(wardrobe.items);
        setImageUrls(wardrobe.urls);
      })
      .finally(() => current && setLoadedFor(userId));
    return () => {
      current = false;
    };
  }, [userId]);
  const profileLoaded = loadedFor === userId;

  // Demo mode: separate from real authentication. It only applies while nobody is signed in, keeps no
  // session, and swaps in local sample data with backend refresh/update functions disabled.
  const [demoRequested, setDemoRequested] = useState(false);
  const demoActive = DEMO_MODE_AVAILABLE && demoRequested && !session;
  useEffect(() => setDemoActiveFlag(demoActive), [demoActive]);
  const enterDemo = useCallback(() => setDemoRequested(true), []);
  const exitDemo = useCallback(() => setDemoRequested(false), []);

  const value = useMemo<AppData>(() => {
    const visibleItems = demoActive ? DEMO_ITEMS : items;
    return {
      session,
      loading: !sessionLoaded || (Boolean(session) && !profileLoaded),
      profile: demoActive ? DEMO_PROFILE : profile,
      items: visibleItems,
      imageUrls: demoActive ? {} : imageUrls,
      refreshProfile: demoActive ? noBackendInDemo : refreshProfile,
      refreshItems: demoActive ? noBackendInDemo : refreshItems,
      updateProfile: demoActive
        ? () => Promise.reject(new Error('Profile changes are not available in demo mode.'))
        : updateProfile,
      itemById: (id) => visibleItems.find((i) => i.id === id),
      demoActive,
      enterDemo,
      exitDemo,
    };
  }, [session, sessionLoaded, profileLoaded, profile, items, imageUrls, refreshProfile, refreshItems, updateProfile, demoActive, enterDemo, exitDemo]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
