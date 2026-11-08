-- Outfit feedback: the user's thumbs up / down on a combination of their own items. The stylist and
-- chat see recent feedback (as item codes, see functions/_shared/wardrobe.ts) to learn the user's
-- taste, and the stylist never suggests a disliked combination again.
--
-- Feedback is keyed by the item combination rather than a saved outfit, because fresh AI suggestions
-- are not saved. The combination is stored sorted and without duplicates (trigger below), so one
-- combination has one row and the app can upsert on (user_id, item_ids). Deleting an item leaves its
-- id in old rows; those combinations are simply ignored once an item is gone.

create table public.outfit_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_ids    uuid[] not null
                constraint outfit_feedback_item_count check (cardinality(item_ids) between 1 and 20 and array_position(item_ids, null) is null),
  rating      smallint not null constraint outfit_feedback_rating check (rating in (-1, 1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index outfit_feedback_combo_key on public.outfit_feedback (user_id, item_ids);

-- Canonical form: sorted, distinct ids. Runs before the unique index and the RLS check see the row.
create or replace function public.outfit_feedback_normalize()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.item_ids := array(select distinct id from unnest(new.item_ids) as t(id) order by id);
  new.updated_at := now();
  return new;
end;
$$;

create trigger outfit_feedback_normalize before insert or update on public.outfit_feedback
  for each row execute function public.outfit_feedback_normalize();

alter table public.outfit_feedback enable row level security;

-- Own rows only, and every item in a combination must be one of the caller's own wardrobe items.
create policy "own outfit feedback" on public.outfit_feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from unnest(item_ids) as t(id)
      where not exists (select 1 from public.wardrobe_items w where w.id = t.id and w.user_id = auth.uid())
    )
  );
