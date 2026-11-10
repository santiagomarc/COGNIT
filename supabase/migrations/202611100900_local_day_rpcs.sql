-- supabase/migrations/202611100900_local_day_rpcs.sql
-- ===================================================================
-- A day is the user's day (UIUX plan UX-06). The two RPCs behind Today's
-- streak, "reviewed today", heatmap and seven-day forecast cut days at UTC
-- midnight. These add a second signature of each that takes the user's IANA
-- zone, `p_tz`.
--
-- Expand-only (docs/runbooks/migrations.md): the old signatures stay until a
-- later contract migration, once no deployment calls them. `p_tz` has no
-- default, so PostgREST resolves { p_user_id } to the old function and
-- { p_user_id, p_tz } to the new one, and nothing is ambiguous. The app
-- validates the zone before sending it: an unknown zone makes `at time zone`
-- raise.
--
-- Not covered here, on purpose: get_analytics_snapshot (Stats' weekly charts)
-- and get_synthesis_insights still bucket by UTC.
-- ===================================================================

-- ── 1. get_study_activity_days(p_user_id, p_tz) ──────────────────────
create or replace function public.get_study_activity_days(
  p_user_id uuid,
  p_tz text
)
returns table (
  activity_date date,
  review_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (study_logs.created_at at time zone p_tz)::date as activity_date,
    count(*)::integer as review_count
  from public.study_logs
  where study_logs.user_id = auth.uid()
    and study_logs.user_id = p_user_id
  group by activity_date
  order by activity_date desc;
$$;

revoke all on function public.get_study_activity_days(uuid, text) from public;
revoke execute on function public.get_study_activity_days(uuid, text) from anon;
grant execute on function public.get_study_activity_days(uuid, text) to authenticated;
grant execute on function public.get_study_activity_days(uuid, text) to service_role;

-- ── 2. get_card_schedule_summary(p_user_id, p_tz, p_now, p_days) ─────
--
-- The same three readings as the UTC signature (202609141000), with the
-- forecast's days cut in `p_tz`: the window starts the day after `p_now`'s
-- date in that zone. `p_tz` comes before the defaulted parameters because a
-- parameter without a default cannot follow one with a default.
create or replace function public.get_card_schedule_summary(
  p_user_id uuid,
  p_tz text,
  p_now timestamptz default now(),
  p_days integer default 7
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with owned_cards as (
    select cards.deck_id, cards.ease_factor, cards.next_review_at
    from public.cards
    join public.decks on decks.id = cards.deck_id
    where decks.user_id = auth.uid()
      and decks.user_id = p_user_id
  ),
  window_start as (
    select ((p_now at time zone p_tz)::date + 1) as first_day
  ),
  forecast as (
    select
      (next_review_at at time zone p_tz)::date as due_date,
      count(*)::integer as card_count
    from owned_cards, window_start
    where next_review_at is not null
      and (next_review_at at time zone p_tz)::date >= window_start.first_day
      and (next_review_at at time zone p_tz)::date <  window_start.first_day + greatest(1, coalesce(p_days, 7))
    group by due_date
  ),
  ease as (
    select deck_id, avg(ease_factor)::double precision as mean_ease
    from owned_cards
    where ease_factor is not null
    group by deck_id
  ),
  overdue as (
    select min(next_review_at) as oldest_overdue_at
    from owned_cards
    where next_review_at is not null
      and next_review_at <= p_now
  )
  select jsonb_build_object(
    'forecast', coalesce(
      (select jsonb_agg(jsonb_build_object('date', due_date, 'count', card_count) order by due_date) from forecast),
      '[]'::jsonb
    ),
    'ease_by_deck', coalesce(
      (select jsonb_agg(jsonb_build_object('deck_id', deck_id, 'mean_ease', mean_ease)) from ease),
      '[]'::jsonb
    ),
    'oldest_overdue_at', (select to_jsonb(oldest_overdue_at) from overdue)
  );
$$;

revoke all on function public.get_card_schedule_summary(uuid, text, timestamptz, integer) from public;
revoke execute on function public.get_card_schedule_summary(uuid, text, timestamptz, integer) from anon;
grant execute on function public.get_card_schedule_summary(uuid, text, timestamptz, integer) to authenticated;
grant execute on function public.get_card_schedule_summary(uuid, text, timestamptz, integer) to service_role;
