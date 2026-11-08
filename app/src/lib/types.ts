import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Must match the check constraint on wardrobe_items.category.
export const CATEGORIES = [
  { key: 'top', label: 'Tops', icon: 'shirt-outline' },
  { key: 'shirt', label: 'Shirts', icon: 'shirt-outline' },
  { key: 'tshirt', label: 'T-shirts', icon: 'shirt-outline' },
  { key: 'knitwear', label: 'Knitwear', icon: 'shirt-outline' },
  { key: 'trousers', label: 'Trousers', icon: 'resize-outline' },
  { key: 'jeans', label: 'Jeans', icon: 'resize-outline' },
  { key: 'shorts', label: 'Shorts', icon: 'resize-outline' },
  { key: 'skirt', label: 'Skirts', icon: 'triangle-outline' },
  { key: 'dress', label: 'Dresses', icon: 'woman-outline' },
  { key: 'jumpsuit', label: 'Jumpsuits', icon: 'body-outline' },
  { key: 'outerwear', label: 'Outerwear', icon: 'cloudy-outline' },
  { key: 'suit', label: 'Suits', icon: 'briefcase-outline' },
  { key: 'activewear', label: 'Activewear', icon: 'barbell-outline' },
  { key: 'traditional', label: 'Traditional', icon: 'sparkles-outline' },
  { key: 'shoes', label: 'Shoes', icon: 'footsteps-outline' },
  { key: 'bag', label: 'Bags', icon: 'bag-handle-outline' },
  { key: 'accessory', label: 'Accessories', icon: 'watch-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
] as const satisfies readonly { key: string; label: string; icon: IconName }[];

export type Category = (typeof CATEGORIES)[number]['key'];

export const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const OCCASIONS = [
  'University', 'Office', 'Business meeting', 'Casual outing', 'Date night', 'Wedding',
  'Formal event', 'Party', 'Travel', 'Gym', 'Everyday', 'Religious or cultural event',
];

export const STYLES = [
  'Minimal', 'Classic', 'Smart casual', 'Streetwear', 'Sporty', 'Bohemian',
  'Vintage', 'Preppy', 'Edgy', 'Romantic', 'Modest', 'Business',
];

export const COLORS = [
  'Black', 'White', 'Cream', 'Beige', 'Brown', 'Grey', 'Navy', 'Blue', 'Green',
  'Olive', 'Red', 'Burgundy', 'Pink', 'Purple', 'Yellow', 'Orange', 'Pastels', 'Earth tones',
];

export const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Tailored', 'Stretchy'];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export interface Profile {
  id: string;
  display_name: string | null;
  style_direction: 'menswear' | 'womenswear' | 'mixed' | 'no_preference' | null;
  style_preferences: string[];
  favorite_colors: string[];
  avoid_colors: string[];
  fit_preferences: string[];
  comfort_notes: string | null;
  lifestyle_occasions: string[];
  budget_level: 'low' | 'medium' | 'high' | null;
  currency: string;
  sizes: Record<string, string>;
  measurements: Record<string, number>;
  consent_ai_processing: boolean;
  consent_body_photos: boolean;
  consent_updated_at: string | null;
  onboarded_at: string | null;
}

export interface WardrobeItem {
  id: string;
  image_path: string | null;
  name: string;
  category: Category;
  subcategory: string | null;
  colors: string[];
  pattern: string | null;
  material: string | null;
  style_tags: string[];
  formality: number | null;
  seasons: string[];
  occasions: string[];
  description: string | null;
  notes: string | null;
  ai_tagged: boolean;
  user_verified: boolean;
  archived: boolean;
  times_worn: number;
  last_worn_at: string | null;
  /** What the user paid, in their profile currency; null when not entered. */
  purchase_price: number | null;
  created_at: string;
}

export type ItemDraft = Omit<WardrobeItem, 'id' | 'created_at' | 'archived' | 'times_worn' | 'last_worn_at'>;

export interface ItemAnalysis {
  is_clothing: boolean;
  name: string;
  category: Category;
  subcategory: string;
  colors: string[];
  pattern: string;
  material: string;
  style_tags: string[];
  formality: number;
  seasons: string[];
  occasions: string[];
  description: string;
  confidence: 'low' | 'medium' | 'high';
  other_items_detected: string[];
}

export interface MissingItem {
  name: string;
  category: string;
  reason: string;
}

export interface StylistOutfit {
  title: string;
  occasion: string;
  item_ids: string[];
  missing_items: MissingItem[];
  explanation: string;
  styling_tips: string[];
  weather_note: string;
  /** Short style phrase for inspiration photo and Pinterest searches (not stored with saved outfits). */
  inspiration_query?: string;
}

export interface InspirationPhoto {
  id: string;
  image_url: string;
  width: number;
  height: number;
  color: string | null;
  alt: string;
  photographer: string;
  photographer_url: string;
  photo_url: string;
}

export interface StylistResult {
  understood_request: string;
  wardrobe_note: string;
  weather: string | null;
  outfits: StylistOutfit[];
}

export interface SavedOutfit {
  id: string;
  title: string;
  occasion: string | null;
  request_text: string | null;
  explanation: string | null;
  styling_tips: string[];
  missing_items: MissingItem[];
  weather_note: string | null;
  is_favorite: boolean;
  planned_for: string | null;
  created_at: string;
  outfit_items: { item_id: string; position: number }[];
}

/** A saved outfit in the same shape as a fresh AI suggestion (item ids in display order). */
export function savedToStylist(o: SavedOutfit): StylistOutfit {
  return {
    title: o.title,
    occasion: o.occasion ?? '',
    item_ids: [...o.outfit_items].sort((a, b) => a.position - b.position).map((i) => i.item_id),
    missing_items: o.missing_items,
    explanation: o.explanation ?? '',
    styling_tips: o.styling_tips,
    weather_note: o.weather_note ?? '',
  };
}

export interface WearLogEntry {
  id: string;
  worn_on: string;
  outfit_id: string | null;
  item_ids: string[];
}

export interface ShoppingIdea {
  name: string;
  category: string;
  reason: string;
}

/** One chat turn as kept in the app; assistant turns carry the outfits they showed. */
export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
  outfits?: StylistOutfit[];
  shopping_suggestions?: ShoppingIdea[];
}

export interface AssistantResult {
  reply: string;
  outfits: StylistOutfit[];
  shopping_suggestions: ShoppingIdea[];
}

export interface GapSuggestion {
  name: string;
  category: string;
  description: string;
  reason: string;
  pairs_with: string[];
  new_outfits_estimate: number;
  priority: 1 | 2 | 3;
  price_range: string;
}

export interface GapResult {
  summary: string;
  no_purchase_needed: string[];
  suggestions: GapSuggestion[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  reason: string | null;
  priority: 1 | 2 | 3;
  price_range: string | null;
  pairs_with: string[];
  status: 'todo' | 'bought' | 'dismissed';
  source: 'ai' | 'manual';
  created_at: string;
}
