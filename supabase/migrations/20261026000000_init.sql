-- AI Wardrobe: initial schema.
-- Every table is owned by a user and protected by row level security so wardrobes stay isolated.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (style preferences, sizes, consent)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  style_direction         text check (style_direction in ('menswear', 'womenswear', 'mixed', 'no_preference')),
  style_preferences       text[] not null default '{}',
  favorite_colors         text[] not null default '{}',
  avoid_colors            text[] not null default '{}',
  fit_preferences         text[] not null default '{}',
  comfort_notes           text,
  lifestyle_occasions     text[] not null default '{}',
  budget_level            text check (budget_level in ('low', 'medium', 'high')),
  currency                text not null default 'USD',
  sizes                   jsonb not null default '{}'::jsonb,   -- e.g. {"top":"M","bottom":"32","shoe":"42"}
  measurements            jsonb not null default '{}'::jsonb,   -- optional, user supplied, cm
  consent_ai_processing   boolean not null default false,       -- wardrobe photos sent to AI provider
  consent_body_photos     boolean not null default false,       -- separate consent for avatar photos (future)
  consent_updated_at      timestamptz,
  onboarded_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create an empty profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Wardrobe items
-- ---------------------------------------------------------------------------
create table public.wardrobe_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_path     text,                 -- object path in the private "wardrobe" bucket: <user_id>/<file>
  name           text not null,
  category       text not null check (category in (
                   'top', 'shirt', 'tshirt', 'knitwear', 'trousers', 'jeans', 'shorts', 'skirt',
                   'dress', 'jumpsuit', 'outerwear', 'suit', 'activewear', 'traditional',
                   'shoes', 'bag', 'accessory', 'other')),
  subcategory    text,
  colors         text[] not null default '{}',
  pattern        text,
  material       text,
  style_tags     text[] not null default '{}',
  formality      smallint check (formality between 1 and 5),   -- 1 very casual .. 5 black tie
  seasons        text[] not null default '{}',
  occasions      text[] not null default '{}',
  description    text,
  notes          text,
  ai_tagged      boolean not null default false,
  user_verified  boolean not null default false,
  archived       boolean not null default false,
  times_worn     integer not null default 0,
  last_worn_at   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index wardrobe_items_user_idx on public.wardrobe_items (user_id, category) where not archived;

create trigger wardrobe_items_touch before update on public.wardrobe_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Outfits (saved AI recommendations or manual combinations)
-- ---------------------------------------------------------------------------
create table public.outfits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null,
  occasion       text,
  request_text   text,
  explanation    text,
  styling_tips   text[] not null default '{}',
  missing_items  jsonb not null default '[]'::jsonb,   -- [{name, category, reason}] items the user does not own
  weather_note   text,
  source         text not null default 'ai' check (source in ('ai', 'manual')),
  is_favorite    boolean not null default true,
  planned_for    date,                                -- reserved for the outfit calendar
  created_at     timestamptz not null default now()
);

create index outfits_user_idx on public.outfits (user_id, created_at desc);

create table public.outfit_items (
  outfit_id  uuid not null references public.outfits (id) on delete cascade,
  item_id    uuid not null references public.wardrobe_items (id) on delete cascade,
  position   smallint not null default 0,
  primary key (outfit_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Shopping checklist
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  category        text,
  description     text,
  reason          text,
  priority        smallint not null default 2 check (priority between 1 and 3),  -- 1 = high
  price_range     text,
  pairs_with      uuid[] not null default '{}',
  status          text not null default 'todo' check (status in ('todo', 'bought', 'dismissed')),
  source          text not null default 'ai' check (source in ('ai', 'manual')),
  created_at      timestamptz not null default now()
);

create index shopping_items_user_idx on public.shopping_items (user_id, status);

-- ---------------------------------------------------------------------------
-- AI usage counter (cost guard for a student budget)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default current_date,
  calls    integer not null default 0,
  primary key (user_id, day)
);

-- Atomically counts one AI call for the current user; returns false once the daily limit is reached.
create or replace function public.consume_ai_call(daily_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.ai_usage (user_id, day, calls) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set calls = ai_usage.calls + 1
  returning calls into used;
  return used <= daily_limit;
end;
$$;

revoke all on function public.consume_ai_call(integer) from public, anon;
grant execute on function public.consume_ai_call(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfits        enable row level security;
alter table public.outfit_items   enable row level security;
alter table public.shopping_items enable row level security;
alter table public.ai_usage       enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own wardrobe items" on public.wardrobe_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own outfits" on public.outfits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- An outfit may only link the owner's outfits to the owner's items.
create policy "own outfit items" on public.outfit_items
  for all to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid()))
  with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
    and exists (select 1 from public.wardrobe_items w where w.id = item_id and w.user_id = auth.uid())
  );

create policy "own shopping items" on public.shopping_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private storage for clothing photos: objects live under "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "wardrobe read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wardrobe insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wardrobe update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "wardrobe delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
