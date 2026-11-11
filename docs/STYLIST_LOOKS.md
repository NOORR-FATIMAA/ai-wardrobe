# Stylist: "Shop the look"

How the stylist presents its outfits: a gallery of full-body looks, a look in detail, and a single
piece up close. This is a presentation layer only. Outfits still come from the existing `stylist`
Edge Function (or, in demo mode, the on-device demo stylist); nothing here generates outfits, and
there are no backend or database changes.

## Data flow

```
stylist Edge Function  ─►  StylistResult.outfits: StylistOutfit[]      (app/src/lib/types.ts)
                              │  title, occasion, item_ids, missing_items, explanation,
                              │  styling_tips, weather_note, inspiration_query
                              ▼
toLooks(outfits, itemById)  ─►  Look[]                                  (app/src/lib/looks.ts)
                              │  number ("01"), title, occasion, summary, items, counts,
                              │  completeness, and the untouched `outfit` for the actions
                              ▼
LookItem[]  (one per piece)
   ownership: 'owned'      → wardrobeItem  (looked up by id in the user's wardrobe)
   ownership: 'suggested'  → suggestion    (one of the outfit's missing_items: name, category, reason)
   zone: outer | top | onepiece | bottom | feet | accessory   (where it sits on the figure)
```

- Owned pieces are always real wardrobe items. A piece whose item was deleted is dropped and counted
  in `removedCount`; it is never replaced.
- Suggested pieces are always labelled "Suggested · not owned" and drawn as dashed outlines. They are
  ideas, not products: there is no price, store or checkout. Their action is the existing shopping
  list (`shopping_items`).
- `completeness` is the share of the core outfit (top + bottom, or a one-piece, plus shoes) that the
  user owns.

## Components (`app/src/components/looks/`)

| Component | Responsibility |
|---|---|
| `types.ts` | `Look` and `LookItem` bound to the app's `WardrobeItem` and `StylistOutfit` (`lib/looks.ts` itself has no app imports so it can be unit-tested: `supabase/tests/looks_test.ts`). |
| `StylistOutfitGallery` | Orchestrates the three stages; keeps the gallery position, each look's saved/planned state and what was added to the shopping list while you move between them. Used by `(tabs)/stylist.tsx`. |
| `OutfitRail` | Stage 1. Snapping horizontal rail: centred look full size, neighbours smaller, faded (and slightly blurred on the web). Touch swipe, trackpad, mouse wheel, mouse drag, arrow keys, previous/next buttons, counter and progress bar. Also exports `RoundButton`. |
| `OutfitPreview` | A gallery card: "LOOK 01", occasion, figure, title, one-line story, and the ownership badge ("All from your wardrobe" / "2 owned · +1 to shop"). |
| `LookFigure` | The full-body visual, built from the look's own pieces (`placePieces`): top or one-piece, bottom and shoes down the middle, outer layer behind, accessories floating at the side. Optional garment hotspots. |
| `OutfitDetail` | Stage 2. Figure with hotspots, the "In this look" panel (beside the figure from 1000 px, a bottom sheet below it on smaller screens), completeness, the existing `OutfitActions` (save, plan, wore it today, thumbs), "Why it works", suggestions with "Add to list", and inspiration photos. |
| `OutfitItemsPanel` | The list of pieces with thumbnail, colour, category, ownership, the user's size for suggestions (from the style profile), and Explore. Hover/focus highlights the matching hotspot. |
| `ItemExplorer` | Stage 3. Large floating picture (gentle float, pointer tilt on the web), details, "Also styled in" (other looks in the same answer that use the item), "View in your wardrobe", or for suggestions the reason, the look it completes, "Add to shopping list" and "Ideas on Pinterest". Swipe, arrows and a thumbnail strip switch pieces. |

Motion uses React Native's `Animated` and CSS transitions (no new dependencies). Every animation is
skipped when the device asks for reduced motion. Escape steps back one stage on the web.

## Pictures

- Owned pieces use the user's own photos from the private `wardrobe` bucket (signed URLs, as
  everywhere else), or the bundled demo illustrations (`app/src/demo/images/`) in demo mode.
- Suggested pieces have no photo; they show a dashed outline with an icon for their body zone.
- **Future full-body images:** to show a generated or photographed outfit image instead of the
  composition, add an optional image URL to the look (e.g. `previewImage` on `Look`, filled in
  `toLook`) and render it in `LookFigure` when present. Hotspots can then take positions from the
  same source instead of `placePieces`.

## New occasions and categories

- Occasions are free text from the stylist; the gallery shows whatever it returns. To offer a new
  occasion in the picker, add it to `OCCASIONS` in `app/src/lib/types.ts`.
- A new wardrobe category needs a zone in `ZONE_BY_CATEGORY` (`app/src/lib/looks.ts`) so it lands in
  the right place on the figure; unknown categories float in the accessory column. Suggestions are
  placed by keywords in `ZONE_WORDS` (e.g. "khussa" → feet, "dupatta" → accessory).
