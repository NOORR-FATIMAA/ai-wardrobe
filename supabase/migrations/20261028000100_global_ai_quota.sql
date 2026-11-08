-- Project-wide daily AI cap on top of the per-user limit, so many accounts cannot exhaust the shared
-- Gemini quota.
--
-- consume_ai_call used to take the limit from the caller and was executable by any signed-in user.
-- With a shared counter that would let anyone fill everyone's cap without calling Gemini, so the new
-- version is executable only by service_role. The Edge Functions call it through the server-side admin
-- client with the verified user's id and limits from their own secrets.

-- One row per UTC day. Row level security with no policies, and no table privileges for API roles:
-- only service_role (which bypasses RLS) and the table owner can read or change it.
create table public.ai_usage_global (
  day   date primary key,
  calls integer not null default 0 check (calls >= 0)
);

alter table public.ai_usage_global enable row level security;
-- Supabase grants new public tables to these roles by default.
revoke all on table public.ai_usage_global from public, anon, authenticated;

-- Remove the caller-limited version entirely so no overload stays callable.
drop function public.consume_ai_call(integer);

-- Reserves one AI call for p_user_id. Returns 'ok', 'user_limit' or 'global_limit'.
-- A rejected call leaves both counters as they were.
--
-- Concurrency: each upsert locks its row, and the WHERE is checked against the latest committed value,
-- so concurrent calls can never take more slots than the limit. Locks are always taken in the same
-- order (the user's row, then the global row), so concurrent calls cannot deadlock.
create function public.consume_ai_call(p_user_id uuid, p_daily_limit integer, p_global_limit integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  user_calls integer;
  global_calls integer;
begin
  if p_user_id is null or p_daily_limit is null or p_global_limit is null
     or p_daily_limit < 0 or p_global_limit < 0 then
    raise exception 'Invalid AI limit arguments' using errcode = '22023';
  end if;

  -- A limit of 0 switches AI off without touching either counter.
  if p_daily_limit = 0 then
    return 'user_limit';
  end if;
  if p_global_limit = 0 then
    return 'global_limit';
  end if;

  -- 1. The user's slot. When the row is already full the WHERE skips the update and nothing is returned.
  insert into public.ai_usage as u (user_id, day, calls) values (p_user_id, today, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1 where u.calls < p_daily_limit
  returning calls into user_calls;

  if user_calls is null then
    return 'user_limit';  -- the global counter was never touched
  end if;

  -- 2. The shared slot, same pattern on today's single row.
  insert into public.ai_usage_global as g (day, calls) values (today, 1)
  on conflict (day) do update set calls = g.calls + 1 where g.calls < p_global_limit
  returning calls into global_calls;

  if global_calls is null then
    -- Give the user's slot back. This transaction still holds that row's lock.
    update public.ai_usage set calls = calls - 1 where user_id = p_user_id and day = today;
    return 'global_limit';
  end if;

  return 'ok';
end;
$$;

-- Supabase's default privileges grant new functions to anon and authenticated, so revoke explicitly.
revoke all on function public.consume_ai_call(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, integer, integer) to service_role;
