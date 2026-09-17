-- ===================================================================
-- Migration: 202609180900_analytics_snapshot.sql
-- Improvement plan §4.1 — the Analytics Hub (/dashboard/stats).
--
-- One RPC, one round trip. Every figure is a GROUP BY over tables that
-- already carry the right indexes (study_logs (user_id, created_at) and
-- (card_id); cards (deck_id, next_review_at); card_mastery_state (user_id,
-- deck_id)). Node does no aggregation.
--
--   retention_weekly  true retention per ISO week: share of review-state
--                     grades >= 3 (an SM-2 "pass"). Learning-state grades are
--                     excluded — they measure encoding, not retention.
--   load_30d          review load per UTC day, next 30 days.
--   retrievability    predicted recall of every review-state card right now,
--                     R = 0.9 ^ (elapsed / interval) — the SM-2 convention
--                     (90 % at the scheduled interval) — in ten buckets.
--   topic_mastery     per topic tag (>= 3 cards): cards, mean ease, lapse
--                     rate, mastered share, unseen count, the deck holding
--                     most of the tag (for the row's link).
--   effort            minutes and reviews per day, last p_days.
--   intervals         interval-band histogram of the whole collection.
--   totals            cards, review-state cards, mean R now, at-risk (R < .8).
-- ===================================================================

create or replace function public.get_analytics_snapshot(
  p_now timestamptz default now(),
  p_days integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  owned_cards as (
    select c.id, c.deck_id, c.state, c.interval, c.ease_factor, c.repetition_count,
           c.next_review_at, c.last_review_at, c.topic_tags
      from public.cards c
      join public.decks d on d.id = c.deck_id
     where d.user_id = (select uid from me)
  ),
  logs as (
    select l.card_id, l.grade, l.review_duration_ms, l.created_at,
           (l.created_at at time zone 'UTC')::date as day
      from public.study_logs l
     where l.user_id = (select uid from me)
       and l.created_at >= p_now - make_interval(days => greatest(7, coalesce(p_days, 90)))
       and l.created_at <= p_now
  ),
  -- Per-card log aggregates, computed once so topic_mastery is one join, not
  -- two correlated subqueries per card × tag.
  card_logs as (
    select card_id,
           count(*)::integer as reviews,
           count(*) filter (where grade = 0)::integer as lapses
      from logs
     group by card_id
  ),
  retention_weekly as (
    select date_trunc('week', l.created_at)::date as week_start,
           count(*)::integer as reviews,
           (count(*) filter (where l.grade >= 3))::double precision / nullif(count(*), 0) as pass_rate,
           avg(l.review_duration_ms)::integer as mean_ms
      from logs l
      join owned_cards c on c.id = l.card_id
     where c.repetition_count > 0
     group by week_start
  ),
  load_30d as (
    select (next_review_at at time zone 'UTC')::date as due_date, count(*)::integer as cards
      from owned_cards
     where state <> 'new'
       and next_review_at > p_now
       and next_review_at < p_now + interval '30 days'
     group by due_date
  ),
  retrievability as (
    select c.id, c.deck_id,
           power(0.9, extract(epoch from (p_now - c.last_review_at)) / 86400.0 / greatest(c.interval, 1)) as r
      from owned_cards c
     where c.state = 'review' and c.last_review_at is not null
  ),
  r_buckets as (
    -- width_bucket over [0, 1] in ten steps; r = 1 lands in bucket 10, not 11.
    select least(10, width_bucket(r, 0, 1, 10)) as bucket, count(*)::integer as cards
      from retrievability
     group by 1
  ),
  at_risk_by_deck as (
    select deck_id, count(*)::integer as cards
      from retrievability
     where r < 0.8
     group by deck_id
     order by cards desc
     limit 1
  ),
  topic_rows as (
    select t.tag, c.id, c.deck_id, c.ease_factor, c.state,
           coalesce(m.correct, false) as mastered,
           coalesce(cl.lapses, 0) as lapses,
           coalesce(cl.reviews, 0) as reviews
      from owned_cards c
      cross join lateral unnest(coalesce(c.topic_tags, '{}'::text[])) as t(tag)
      left join public.card_mastery_state m
        on m.card_id = c.id and m.user_id = (select uid from me)
      left join card_logs cl on cl.card_id = c.id
     where t.tag is not null and btrim(t.tag) <> ''
  ),
  topic_mastery as (
    select tag,
           count(*)::integer as cards,
           avg(ease_factor)::double precision as mean_ease,
           (sum(lapses))::double precision / nullif(sum(reviews), 0) as lapse_rate,
           (count(*) filter (where mastered))::double precision / count(*) as mastered_share,
           (count(*) filter (where state = 'new'))::integer as unseen,
           mode() within group (order by deck_id) as deck_id
      from topic_rows
     group by tag
    having count(*) >= 3
  ),
  effort as (
    select day,
           round((sum(review_duration_ms) / 60000.0)::numeric, 1) as minutes,
           count(*)::integer as reviews
      from logs
     group by day
  ),
  intervals as (
    select case
             when state = 'new' then 'new'
             when interval < 1 then 'learning'
             when interval < 7 then '1-6d'
             when interval < 30 then '7-29d'
             when interval < 90 then '30-89d'
             else '90d+'
           end as band,
           count(*)::integer as cards
      from owned_cards
     group by 1
  )
  select jsonb_build_object(
    'generated_at', p_now,
    'retention_weekly', coalesce((select jsonb_agg(to_jsonb(r) order by r.week_start) from retention_weekly r), '[]'::jsonb),
    'load_30d',         coalesce((select jsonb_agg(to_jsonb(l) order by l.due_date) from load_30d l), '[]'::jsonb),
    'retrievability',   coalesce((select jsonb_agg(to_jsonb(b) order by b.bucket) from r_buckets b), '[]'::jsonb),
    'topic_mastery',    coalesce((select jsonb_agg(to_jsonb(t) order by t.lapse_rate desc nulls last, t.cards desc) from topic_mastery t), '[]'::jsonb),
    'effort',           coalesce((select jsonb_agg(to_jsonb(e) order by e.day) from effort e), '[]'::jsonb),
    'intervals',        coalesce((select jsonb_agg(to_jsonb(i)) from intervals i), '[]'::jsonb),
    'totals', jsonb_build_object(
      'cards',        (select count(*) from owned_cards),
      'review_state', (select count(*) from owned_cards where state = 'review'),
      'mean_r_now',   (select avg(r) from retrievability),
      'at_risk_now',  (select count(*) from retrievability where r < 0.8),
      'at_risk_deck_id', (select deck_id from at_risk_by_deck),
      'reviews_in_window', (select count(*) from logs)
    )
  );
$$;

revoke all on function public.get_analytics_snapshot(timestamptz, integer) from public;
grant execute on function public.get_analytics_snapshot(timestamptz, integer) to authenticated;
