import { FunctionsHttpError } from '@supabase/supabase-js';
import { isDemoActive } from '../demo/config';
import { localDate } from './dates';
import { supabase } from './supabase';
import type { AssistantResult, AssistantTurn, GapResult, InspirationPhoto, ItemAnalysis, StylistResult } from './types';

/** Calls an Edge Function and surfaces its `{ error }` message as a readable Error. */
async function invoke<T>(name: string, body: object): Promise<T> {
  // Demo mode safety net: no Edge Function (and so no AI) call may leave the device.
  if (isDemoActive()) throw new Error('Not available in demo mode.');
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'Something went wrong. Please try again.');
    }
    throw new Error('Could not reach the server. Check your connection.');
  }
  return data as T;
}

type Coordinates = { latitude: number; longitude: number };

export const api = {
  analyzeItem: (imagePath: string) => invoke<ItemAnalysis>('analyze-item', { image_path: imagePath }),

  stylist: (params: {
    request?: string;
    occasion?: string;
    count?: number;
    anchor_item_ids?: string[];
    avoid_outfits?: string[][];
    allow_purchases?: boolean;
    day?: 'today' | 'tomorrow';
    location?: Coordinates;
  }) => invoke<StylistResult>('stylist', { ...params, local_date: localDate() }),

  assistant: (turns: AssistantTurn[], location?: Coordinates) =>
    invoke<AssistantResult>('assistant', {
      // Send only what the server needs: text plus the outfits each reply showed.
      messages: turns.map((t) => ({
        role: t.role,
        content: t.content,
        outfits: t.outfits?.map((o) => ({ title: o.title, item_ids: o.item_ids })),
      })),
      location,
      local_date: localDate(),
    }),

  wardrobeGaps: (params: { focus?: string; max_suggestions?: number }) =>
    invoke<GapResult>('wardrobe-gaps', params),

  inspiration: (query: string) => invoke<{ photos: InspirationPhoto[] }>('inspiration', { query }),

  deleteAccount: () => invoke<{ deleted: boolean }>('delete-account', {}),
};
