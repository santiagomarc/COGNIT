-- Dashboard aggregation: replace shipping up to ~35,000 raw study_logs /
-- card_mastery_state rows to the server on every dashboard load with two
-- grouped queries. Streak/longest-streak computation stays in TypeScript
-- (src/app/dashboard/page.tsx) — it's a small, easily-verified date-gap scan
-- that's safer to keep there than to reimplement in SQL, and it now runs
-- against a day-bucketed list instead of raw per-review rows.

-- One row per distinct day the user has ever studied, with that day's review
-- count. Row count is bounded by calendar days elapsed, not review volume —
-- this also fixes a latent correctness gap: the old "last 5000 study_logs"
-- cap could silently truncate a very active user's streak calculation before
-- it reached the actual streak boundary.
create or replace function public.get_study_activity_days(
  p_user_id uuid
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
    (study_logs.created_at at time zone 'UTC')::date as activity_date,
    count(*)::integer as review_count
  from public.study_logs
  where study_logs.user_id = auth.uid()
    and study_logs.user_id = p_user_id
  group by activity_date
  order by activity_date desc;
$$;

revoke all on function public.get_study_activity_days(uuid) from public;
grant execute on function public.get_study_activity_days(uuid) to authenticated;
grant execute on function public.get_study_activity_days(uuid) to service_role;

-- Per-deck mastery summary, grouped server-side instead of fetching every
-- card_mastery_state row (up to 20,000) to group them in Node.
create or replace function public.get_deck_mastery_summary(
  p_user_id uuid
)
returns table (
  deck_id uuid,
  assessed_cards integer,
  mastered_cards integer,
  last_quiz_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    card_mastery_state.deck_id,
    count(*)::integer as assessed_cards,
    count(*) filter (where card_mastery_state.correct)::integer as mastered_cards,
    max(card_mastery_state.last_quiz_at) as last_quiz_at
  from public.card_mastery_state
  where card_mastery_state.user_id = auth.uid()
    and card_mastery_state.user_id = p_user_id
  group by card_mastery_state.deck_id;
$$;

revoke all on function public.get_deck_mastery_summary(uuid) from public;
grant execute on function public.get_deck_mastery_summary(uuid) to authenticated;
grant execute on function public.get_deck_mastery_summary(uuid) to service_role;
