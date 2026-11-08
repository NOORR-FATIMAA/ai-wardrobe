-- A wear-log row may only reference an outfit owned by the same user.
--
-- 20261027000000_wear_log created `outfit_id uuid references public.outfits (id) on delete set null`.
-- Foreign keys are checked without row level security, so that link accepted any existing outfit,
-- including another user's, through both log_wear() and direct table writes. The "own wear log"
-- policy only checks user_id.
--
-- The link becomes a composite foreign key on (outfit_id, user_id) -> outfits (id, user_id). The
-- database enforces it for every writer (RPC, direct writes, service role) without relying on what a
-- policy subquery can see. A foreign outfit and a nonexistent one fail with the same error (23503),
-- and a null outfit_id is never checked (MATCH SIMPLE), so logging without an outfit still works.

-- Refuse to continue (changing nothing) if existing rows already break the rule.
do $$
declare
  mismatched integer;
begin
  select count(*) into mismatched
  from public.wear_log w
  join public.outfits o on o.id = w.outfit_id
  where o.user_id <> w.user_id;

  if mismatched > 0 then
    raise exception 'wear_log has % row(s) that reference another user''s outfit; resolve them before applying this migration', mismatched;
  end if;
end;
$$;

-- Target of the composite foreign key (id alone is already the primary key).
alter table public.outfits
  add constraint outfits_id_user_id_key unique (id, user_id);

-- wear_log_outfit_id_fkey is the name Postgres generated for the inline reference in 20261027000000.
-- No IF EXISTS: if the name differs, the migration fails instead of leaving two links in place.
-- SET NULL (outfit_id) clears only outfit_id when an outfit is deleted (Postgres 15+); a plain SET NULL
-- would also clear user_id, which is NOT NULL, and deleting an outfit would fail.
alter table public.wear_log
  drop constraint wear_log_outfit_id_fkey,
  add constraint wear_log_outfit_owner_fkey
    foreign key (outfit_id, user_id) references public.outfits (id, user_id)
    on delete set null (outfit_id);

-- Keeps outfit deletes from scanning the wear log.
create index wear_log_outfit_idx on public.wear_log (outfit_id) where outfit_id is not null;

-- Same signature as before, so existing grants are kept. Ownership is checked explicitly instead of
-- relying on what row level security lets the function see; the foreign key above is the backstop
-- (for example, an outfit deleted between this check and the insert).
create or replace function public.log_wear(p_item_ids uuid[], p_outfit_id uuid default null, p_worn_on date default current_date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  owned uuid[];
  log_id uuid;
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  -- Same error for another user's outfit and a nonexistent one.
  if p_outfit_id is not null
     and not exists (select 1 from public.outfits where id = p_outfit_id and user_id = uid) then
    raise exception 'Outfit not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into owned
  from public.wardrobe_items where id = any (p_item_ids) and user_id = uid;

  if cardinality(owned) = 0 then
    raise exception 'No wardrobe items to log';
  end if;

  insert into public.wear_log (worn_on, outfit_id, item_ids)
  values (p_worn_on, p_outfit_id, owned)
  returning id into log_id;

  update public.wardrobe_items
     set times_worn = times_worn + 1,
         last_worn_at = greatest(coalesce(last_worn_at, p_worn_on), p_worn_on)
   where id = any (owned);

  return log_id;
end;
$$;

revoke all on function public.log_wear(uuid[], uuid, date) from public, anon;
grant execute on function public.log_wear(uuid[], uuid, date) to authenticated;
