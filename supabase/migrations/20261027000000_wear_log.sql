-- Wear history: what the user wore and when. Powers "avoid repeats" in the stylist and the outfit calendar.

create table public.wear_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worn_on    date not null default current_date,
  outfit_id  uuid references public.outfits (id) on delete set null,
  item_ids   uuid[] not null,
  created_at timestamptz not null default now()
);

create index wear_log_user_idx on public.wear_log (user_id, worn_on desc);

alter table public.wear_log enable row level security;

create policy "own wear log" on public.wear_log
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index outfits_planned_idx on public.outfits (user_id, planned_for) where planned_for is not null;

-- Records a wear and updates per-item counters in one transaction.
-- Runs with the caller's rights, so RLS limits it to the caller's own items and outfits.
create or replace function public.log_wear(p_item_ids uuid[], p_outfit_id uuid default null, p_worn_on date default current_date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  owned uuid[];
  log_id uuid;
begin
  select coalesce(array_agg(id), '{}') into owned
  from public.wardrobe_items where id = any (p_item_ids);

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
