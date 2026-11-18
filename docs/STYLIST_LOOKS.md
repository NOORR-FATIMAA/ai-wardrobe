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
| `LookFigure` | The full-body visual. By default a studio mannequin (proportions follow "Dress me in") dressed "ghost mannequin" style in the look's own pieces (`dressMannequin`): each picture at its natural proportions, top or one-piece from the shoulders, bottom from the waist, shoes at the floor, outer layer behind the top, a belt at the waist, other accessories at the hands. With `photoUrl` it shows the look's AI model photo instead. Optional garment hotspots; the selected one shows the piece's name. |
| `OutfitDetail` | Stage 2. Figure with hotspots, the "In this look" panel (beside the figure from 1000 px, a bottom sheet below it on smaller screens), completeness, the existing `OutfitActions` (save, plan, wore it today, thumbs), "Why it works", suggestions with "Add to list", and inspiration photos. |
| `OutfitItemsPanel` | The list of pieces with thumbnail, colour, category, ownership, the user's size for suggestions (from the style profile), and Explore. Hover/focus highlights the matching hotspot. |
| `ItemExplorer` | Stage 3. Large floating picture (gentle float, pointer tilt on the web), details, "Also styled in" (other looks in the same answer that use the item), "View in your wardrobe", or for suggestions the reason, the look it completes, "Add to shopping list" and "Ideas on Pinterest". Swipe, arrows and a thumbnail strip switch pieces. |

Motion uses React Native's `Animated` and CSS transitions (no new dependencies). Every animation is
skipped when the device asks for reduced motion. Escape steps back one stage on the web.

## AI model photos ("Create model photo")

Each look can also be shown as a realistic studio photo of a model wearing it, made on request in the
look detail (stage 2). The `look-image` Edge Function:

- takes the look's owned item ids (checked through RLS) and the names of its suggested pieces;
- sends the owned pieces' photos as references, plus a fixed prompt, to the Gemini image model
  (`gemini-nano-banana-2.1` by default; override with the `GEMINI_IMAGE_MODEL` secret);
- saves the image in the user's private folder as `look-<hash>.png|jpg` (hash of the pieces, who is
  dressed and the prompt version), so the same look is made, and paid for, once;
- reserves **two** AI calls from the daily limits, because image generation costs more than text.

Cost and availability: about US$0.034 per 1K image on Google's paid tier. **The image models have no
free tier**: without billing on the Gemini API project the button shows "Model photos need billing
enabled". Photos are labelled "AI preview · not an exact fit". Deleting all clothes or the account
removes them with the rest of the user's folder.

## Pictures

- Owned pieces use the user's own photos from the private `wardrobe` bucket (signed URLs, as
  everywhere else), or the bundled demo illustrations (`app/src/demo/images/`) in demo mode.
- Suggested pieces have no photo; they show a dashed outline with an icon for their body zone.
- Model photos use approximate hotspot positions for a standing full-body pose (`PHOTO_SPOT` in
  `LookFigure.tsx`); the mannequin's come from where each piece is placed.

## New occasions and categories

- Occasions are free text from the stylist; the gallery shows whatever it returns. To offer a new
  occasion in the picker, add it to `OCCASIONS` in `app/src/lib/types.ts`.
- A new wardrobe category needs a zone in `ZONE_BY_CATEGORY` (`app/src/lib/looks.ts`) so it lands in
  the right place on the figure; unknown categories float in the accessory column. Suggestions are
  placed by keywords in `ZONE_WORDS` (e.g. "khussa" → feet, "dupatta" → accessory).
