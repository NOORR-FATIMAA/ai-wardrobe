-- Optional purchase price per wardrobe item, for cost-per-wear insights in the app.
-- In the owner's profile currency (profiles.currency); null means unknown. Additive only: existing
-- rows keep null, and the existing row level security policies cover the new column. The AI functions
-- select explicit columns (functions/_shared/wardrobe.ts), so prices are never sent to the model.

alter table public.wardrobe_items
  add column purchase_price numeric(10, 2)
    constraint wardrobe_items_purchase_price_range check (purchase_price >= 0 and purchase_price < 100000000);
