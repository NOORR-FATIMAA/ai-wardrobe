// The look model (lib/looks.ts) bound to the app's own types, for the "Shop the look" components.
import type { Look as BaseLook, LookItem as BaseLookItem } from '@/lib/looks';
import type { StylistOutfit, WardrobeItem } from '@/lib/types';

export type Look = BaseLook<WardrobeItem, StylistOutfit>;
export type LookItem = BaseLookItem<WardrobeItem>;
export type { Zone } from '@/lib/looks';
