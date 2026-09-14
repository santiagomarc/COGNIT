-- ===================================================================
-- Migration: 202609141000_schedule_summary_rpcs.sql
-- Two aggregations that were being computed in Node over raw card rows on
-- every page load, moved into Postgres where they belong.
-- ===================================================================

-- ── 1. get_card_schedule_summary ─────────────────────────────────────
--
-- The dashboard fetched up to 20,000 `cards` rows (deck_id, ease_factor,
-- next_review_at) on every load, then bucketed them in Node into a seven-day
-- forecast, a mean ease per deck, and the oldest overdue card. All three are
-- GROUP BYs. This returns them in one row-trip as ~(7 + decks + 1) values
-- instead of ~20,000 rows, and drops the row cap that made the forecast
-- silently partial for large collections.
--
-- Semantics match src/lib/dashboard-forecast.ts exactly:
--   forecast     – cards due per UTC day for `p_days` days starting the day
--                  AFTER `p_now`'s UTC date (today/overdue are excluded: they
--                  are the band's hero figure, not a column).
--   ease_by_deck – avg(ease_factor) per deck, NULL ease skipped (not zeroed).
--   oldest_overdue_at – min(next_review_at) at or before p_now, or NULL.
create or replace function public.get_card_schedule_summary(
  p_user_id uuid,
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
    select ((p_now at time zone 'UTC')::date + 1) as first_day
  ),
  forecast as (
    select
      (next_review_at at time zone 'UTC')::date as due_date,
      count(*)::integer as card_count
    from owned_cards, window_start
    where next_review_at is not null
      and (next_review_at at time zone 'UTC')::date >= window_start.first_day
      and (next_review_at at time zone 'UTC')::date <  window_start.first_day + greatest(1, coalesce(p_days, 7))
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

revoke all on function public.get_card_schedule_summary(uuid, timestamptz, integer) from public;
grant execute on function public.get_card_schedule_summary(uuid, timestamptz, integer) to authenticated;
grant execute on function public.get_card_schedule_summary(uuid, timestamptz, integer) to service_role;

-- ── 2. get_deck_schedule_breakdown ───────────────────────────────────
--
-- The deck page fetched up to 20,000 `cards` rows (state, next_review_at) for
-- one deck to count four buckets in Node. One row back instead.
--
-- Bucket precedence matches loadScheduleBreakdown in
-- src/app/dashboard/(shell)/[deckId]/page.tsx exactly, in this order:
--   fresh     – state = 'new' (regardless of next_review_at: the schema
--               defaults next_review_at to now(), so a never-studied card
--               looks due unless state is read first)
--   due       – next_review_at at or before p_now
--   learning  – state in ('learning', 'relearning')
--   scheduled – everything else
create or replace function public.get_deck_schedule_breakdown(
  p_deck_id uuid,
  p_now timestamptz default now()
)
returns table (due integer, learning integer, scheduled integer, fresh integer)
language sql
stable
security invoker
set search_path = public
as $$
  -- A NULL state is treated as 'new', matching the Node fallback
  -- (`typeof row.state === 'string' ? row.state : 'new'`).
  with normalized as (
    select
      coalesce(cards.state::text, 'new') as state,
      (cards.next_review_at is not null and cards.next_review_at <= p_now) as is_due
    from public.cards
    join public.decks on decks.id = cards.deck_id
    where cards.deck_id = p_deck_id
      and decks.user_id = auth.uid()
  )
  select
    count(*) filter (where state <> 'new' and is_due)::integer as due,
    count(*) filter (where state <> 'new' and not is_due and state in ('learning', 'relearning'))::integer as learning,
    count(*) filter (where state <> 'new' and not is_due and state not in ('learning', 'relearning'))::integer as scheduled,
    count(*) filter (where state = 'new')::integer as fresh
  from normalized;
$$;

revoke all on function public.get_deck_schedule_breakdown(uuid, timestamptz) from public;
grant execute on function public.get_deck_schedule_breakdown(uuid, timestamptz) to authenticated;
grant execute on function public.get_deck_schedule_breakdown(uuid, timestamptz) to service_role;
