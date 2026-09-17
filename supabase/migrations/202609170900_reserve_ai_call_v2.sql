-- ===================================================================
-- Migration: 202609170900_reserve_ai_call_v2.sql
-- Improvement plan §2.6 / §5.3 (SA-10, SA-11, AI-06).
--
--   • The daily ceiling moves INSIDE the reservation, under the same advisory
--     lock as the per-action window. It used to be a separate TypeScript
--     query that failed open on any error.
--   • A reservation says how many model calls it covers (`p_calls`): a drill
--     batch is up to 5, an enrichment fan-out is one per 25 cards, a chat turn
--     is 2 (answer + follow-ups). The ceiling counts calls, not rows.
--   • Distinct error codes. 'Unauthorized' used to raise the default P0001,
--     which the client read as "rate limited".
--       28000  invalid_authorization_specification  → not signed in
--       P0001  AI_RATE_LIMIT                         → per-action window
--       P0002  AI_DAILY_CEILING                      → daily ceiling
--
-- The old 4-argument signature is dropped so a stale client fails loudly
-- ("could not find the function") rather than reserving without a ceiling.
-- Deploy this BEFORE the app build that passes p_calls (README deploy order).
-- ===================================================================

drop function if exists public.reserve_ai_call(text, integer, integer, jsonb);

create or replace function public.reserve_ai_call(
  p_action text,
  p_window_minutes integer,
  p_max_requests integer,
  p_metadata jsonb default '{}'::jsonb,
  p_calls integer default 1,
  p_daily_ceiling integer default 300
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_calls integer := greatest(1, coalesce(p_calls, 1));
  v_used integer;
  v_daily integer;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  -- Serialises concurrent reservations for this (user, action) pair. Advisory
  -- locks are transaction-scoped and released automatically on commit/abort.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action));

  -- Daily ceiling across every action, counting the calls each row covers.
  -- Rows written before this migration carry no `calls` and count as one.
  select coalesce(sum(coalesce((metadata->>'calls')::integer, 1)), 0)
    into v_daily
    from public.ai_usage_logs
   where user_id = v_user_id
     and created_at >= now() - interval '24 hours';

  if v_daily + v_calls > greatest(1, coalesce(p_daily_ceiling, 300)) then
    raise exception 'AI_DAILY_CEILING' using errcode = 'P0002';
  end if;

  -- Per-action window, counting reservations (one per user-visible request).
  select count(*)
    into v_used
    from public.ai_usage_logs
   where user_id = v_user_id
     and action = p_action
     and created_at >= now() - make_interval(mins => p_window_minutes);

  if v_used >= p_max_requests then
    raise exception 'AI_RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_logs (user_id, action, metadata)
  values (v_user_id, p_action, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('calls', v_calls))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_ai_call(text, integer, integer, jsonb, integer, integer) from public;
grant execute on function public.reserve_ai_call(text, integer, integer, jsonb, integer, integer) to authenticated;

-- The two window queries above both start with (user_id, …, created_at);
-- putting `action` in the key turns the per-action count into an index range
-- scan instead of an index scan plus a heap filter.
create index if not exists ai_usage_logs_user_action_created_idx
  on public.ai_usage_logs (user_id, action, created_at desc);
