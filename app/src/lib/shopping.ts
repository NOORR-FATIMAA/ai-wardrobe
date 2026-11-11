import { supabase } from './supabase';
import type { MissingItem } from './types';

/**
 * Adds an AI-suggested piece to the user's existing shopping list (the `shopping_items` table that the
 * Shopping tab reads), linked to the owned items it pairs with. Same fields as the chat's "Add to list".
 */
export async function addSuggestionToShoppingList(item: MissingItem, pairsWith: string[]) {
  const { error } = await supabase.from('shopping_items').insert({
    name: item.name,
    category: item.category || null,
    reason: item.reason || null,
    pairs_with: pairsWith,
    source: 'ai',
  });
  if (error) throw new Error('Could not add it to your shopping list.');
}
