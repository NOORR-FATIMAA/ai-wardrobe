// Sample data for demo mode. Kept on the device, never sent anywhere, and clearly labelled as demo data.
import { localDate } from '../lib/dates';
import type { Profile, WardrobeItem } from '../lib/types';

const DEMO_NOTE = 'Demo sample item, not from a real wardrobe.';

// Wear dates relative to today, so the demo insights look the same whenever it is opened.
const daysAgo = (n: number) => localDate(-n);

export const DEMO_PROFILE: Profile = {
  id: 'demo-profile',
  display_name: 'Demo guest',
  style_direction: 'mixed',
  style_preferences: ['Minimal', 'Smart casual', 'Classic'],
  favorite_colors: ['Navy', 'White', 'Earth tones'],
  avoid_colors: ['Orange'],
  fit_preferences: ['Regular', 'Relaxed'],
  comfort_notes: null,
  lifestyle_occasions: ['University', 'Office', 'Casual outing', 'Wedding', 'Gym'],
  budget_level: 'medium',
  currency: 'USD',
  sizes: {},
  measurements: {},
  consent_ai_processing: false,
  consent_body_photos: false,
  consent_updated_at: null,
  onboarded_at: '2026-01-01T00:00:00.000Z',
};

function item(
  n: number,
  fields: Pick<WardrobeItem, 'name' | 'category' | 'colors' | 'formality'> & Partial<WardrobeItem>,
): WardrobeItem {
  return {
    id: `demo-item-${String(n).padStart(2, '0')}`,
    image_path: null, // no photos: items show their category icon, so nothing is downloaded
    subcategory: null,
    pattern: 'solid',
    material: null,
    style_tags: [],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    occasions: [],
    description: null,
    notes: DEMO_NOTE,
    ai_tagged: false,
    user_verified: true,
    archived: false,
    times_worn: 0,
    last_worn_at: null,
    purchase_price: null,
    created_at: `2026-01-${String(n).padStart(2, '0')}T09:00:00.000Z`,
    ...fields,
  };
}

export const DEMO_ITEMS: WardrobeItem[] = [
  item(1, { name: 'White oxford shirt', category: 'shirt', subcategory: 'oxford shirt', colors: ['white'], formality: 3, material: 'cotton', style_tags: ['Classic'], occasions: ['Office', 'University'], purchase_price: 45, times_worn: 12, last_worn_at: daysAgo(3) }),
  item(2, { name: 'Navy crew-neck tee', category: 'tshirt', colors: ['navy'], formality: 1, material: 'cotton', style_tags: ['Minimal'], occasions: ['Everyday', 'Casual outing'], times_worn: 6, purchase_price: 15, last_worn_at: daysAgo(1) }),
  item(3, { name: 'Grey merino sweater', category: 'knitwear', subcategory: 'crew neck', colors: ['grey'], formality: 3, material: 'merino wool', style_tags: ['Smart casual'], seasons: ['autumn', 'winter'], purchase_price: 90, times_worn: 2, last_worn_at: daysAgo(160) }),
  item(4, { name: 'Black hoodie', category: 'knitwear', subcategory: 'hoodie', colors: ['black'], formality: 1, style_tags: ['Streetwear'], occasions: ['Casual outing'] }),
  item(5, { name: 'Navy chinos', category: 'trousers', subcategory: 'chinos', colors: ['navy'], formality: 3, material: 'cotton twill', style_tags: ['Smart casual'], occasions: ['Office', 'University'], times_worn: 4, purchase_price: 55, last_worn_at: daysAgo(5) }),
  item(6, { name: 'Dark-wash jeans', category: 'jeans', subcategory: 'straight leg', colors: ['blue'], formality: 2, material: 'denim', style_tags: ['Classic'], occasions: ['Casual outing', 'Everyday'], purchase_price: 80, times_worn: 15, last_worn_at: daysAgo(2) }),
  item(7, { name: 'Charcoal wool trousers', category: 'trousers', subcategory: 'tailored trousers', colors: ['charcoal'], formality: 4, material: 'wool', style_tags: ['Business'], occasions: ['Office', 'Formal event'], purchase_price: 120, times_worn: 1, last_worn_at: daysAgo(120) }),
  item(8, { name: 'Black midi dress', category: 'dress', colors: ['black'], formality: 4, material: 'crepe', style_tags: ['Classic', 'Minimal'], occasions: ['Wedding', 'Formal event', 'Date night'], purchase_price: 140 }),
  item(9, { name: 'Camel wool coat', category: 'outerwear', subcategory: 'overcoat', colors: ['camel'], formality: 4, material: 'wool', style_tags: ['Classic'], seasons: ['autumn', 'winter'], purchase_price: 250, times_worn: 5, last_worn_at: daysAgo(40) }),
  item(10, { name: 'Denim jacket', category: 'outerwear', subcategory: 'trucker jacket', colors: ['blue'], formality: 2, material: 'denim', style_tags: ['Streetwear'], seasons: ['spring', 'autumn'] }),
  item(11, { name: 'White leather sneakers', category: 'shoes', subcategory: 'sneakers', colors: ['white'], formality: 2, material: 'leather', style_tags: ['Minimal'], times_worn: 9, purchase_price: 110, last_worn_at: daysAgo(1) }),
  item(12, { name: 'Brown leather loafers', category: 'shoes', subcategory: 'loafers', colors: ['brown'], formality: 4, material: 'leather', style_tags: ['Classic'], purchase_price: 130 }),
  item(13, { name: 'Grey running shoes', category: 'shoes', subcategory: 'trainers', colors: ['grey'], formality: 1, style_tags: ['Sporty'], occasions: ['Gym'], purchase_price: 70, times_worn: 20, last_worn_at: daysAgo(4) }),
  item(14, { name: 'Black training set', category: 'activewear', subcategory: 'top and leggings', colors: ['black'], formality: 1, style_tags: ['Sporty'], occasions: ['Gym'] }),
  item(15, { name: 'Tan leather belt', category: 'accessory', subcategory: 'belt', colors: ['tan'], formality: 3, material: 'leather' }),
  item(16, { name: 'Canvas tote bag', category: 'bag', colors: ['cream'], formality: 1, material: 'canvas', style_tags: ['Minimal'] }),
];
