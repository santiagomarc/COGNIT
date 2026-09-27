-- get_synthesis_insights — plan §6.4 (PERF-05).
--
-- Every Insights reading in one statement, uncapped, with the semantics of
-- src/lib/synthesis/insights.ts: weak links at >= 2 signals; calibration where
-- "fairly sure" always matches; 30 zero-filled UTC days. The Node aggregation
-- stays as the fallback and the parity oracle (loadSynthesisInsightsRpc
-- returns null on any error) until three decks with >= 20 attempts agree.
create or replace function public.get_synthesis_insights(
  p_deck_id uuid,
  p_now timestamptz default now()
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
  attempts as (
    select a.id, a.drill_id, a.verdict, a.coverage, a.contradictions, a.outside_claims,
           a.missing_card_ids, a.contradicted_card_ids, a.confidence, a.duration_ms, a.created_at
      from public.synthesis_attempts a
     where a.deck_id = p_deck_id
       and a.user_id = (select uid from me)
  ),
  recent as (
    select * from attempts where created_at >= p_now - interval '30 days'
  ),
  signals as (
    select m.card_id, 'missing'::text as kind, a.created_at
      from attempts a
      cross join lateral unnest(a.missing_card_ids) as m(card_id)
    union all
    select c.card_id, 'contradicted'::text as kind, a.created_at
      from attempts a
      cross join lateral unnest(a.contradicted_card_ids) as c(card_id)
  ),
  weak as (
    select s.card_id,
           count(*) filter (where s.kind = 'missing') as missing,
           count(*) filter (where s.kind = 'contradicted') as contradicted,
           max(s.created_at) as last_at
      from signals s
     group by s.card_id
    having count(*) >= 2
  ),
  formats as (
    select d.format,
           count(*) as attempts,
           count(*) filter (where a.verdict = 'sound') as sound
      from attempts a
      join public.synthesis_drills d on d.id = a.drill_id
     where a.verdict <> 'off_target'
     group by d.format
  ),
  kinds as (
    select entry ->> 'kind' as kind, count(*) as n
      from recent r
      cross join lateral jsonb_array_elements(coalesce(r.contradictions, '[]'::jsonb)) as entry
     group by entry ->> 'kind'
  ),
  attempt_links as (
    select a.id,
           (a.created_at at time zone 'utc')::date as day,
           (select count(*)
              from jsonb_array_elements(coalesce(a.coverage, '[]'::jsonb)) as e
             where e ->> 'status' = 'covered') as covered,
           jsonb_array_length(coalesce(a.coverage, '[]'::jsonb)) as total
      from attempts a
  ),
  days as (
    select generate_series(
             (date_trunc('day', p_now at time zone 'utc') - interval '29 days')::date,
             (p_now at time zone 'utc')::date,
             interval '1 day'
           )::date as day
  ),
  daily as (
    select dy.day,
           count(al.id) as attempts,
           coalesce(sum(al.covered), 0) as links_covered,
           coalesce(sum(al.total), 0) as links_total
      from days dy
      left join attempt_links al on al.day = dy.day
     group by dy.day
  ),
  history as (
    select a.id as attempt_id,
           a.drill_id,
           d.prompt_text,
           d.format,
           a.verdict,
           (select count(*)
              from jsonb_array_elements(coalesce(a.coverage, '[]'::jsonb)) as e
             where e ->> 'status' = 'covered') as links_covered,
           jsonb_array_length(coalesce(d.required_links, '[]'::jsonb)) as links_total,
           a.duration_ms,
           a.created_at
      from attempts a
      join public.synthesis_drills d on d.id = a.drill_id
     order by a.created_at desc
     limit 20
  )
  select jsonb_build_object(
    'attempt_count', (select count(*) from attempts),
    'weak_links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'card_id', w.card_id,
               'term', c.front,
               'missing', w.missing,
               'contradicted', w.contradicted,
               'last_at', w.last_at
             ) order by w.contradicted desc, w.missing desc, w.last_at desc)
        from weak w
        join public.cards c on c.id = w.card_id and c.deck_id = p_deck_id
    ), '[]'::jsonb),
    'format_rates', coalesce((
      select jsonb_agg(jsonb_build_object('format', f.format, 'attempts', f.attempts, 'sound', f.sound)
                       order by f.attempts desc)
        from formats f
    ), '[]'::jsonb),
    'outside_claims_30d', (
      select coalesce(sum(jsonb_array_length(coalesce(r.outside_claims, '[]'::jsonb))), 0) from recent r
    ),
    'misconceptions_30d', coalesce((
      select jsonb_object_agg(k.kind, k.n) from kinds k where k.kind is not null
    ), '{}'::jsonb),
    'calibration_30d', (
      select case
               when count(*) = 0 then null
               else (count(*) filter (
                       where r.confidence = 2
                          or (r.confidence = 3 and r.verdict = 'sound')
                          or (r.confidence = 1 and r.verdict <> 'sound')
                     ))::numeric / count(*)
             end
        from recent r
       where r.confidence is not null
         and r.verdict <> 'off_target'
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', d.day,
               'attempts', d.attempts,
               'links_covered', d.links_covered,
               'links_total', d.links_total
             ) order by d.day)
        from daily d
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.created_at desc) from history h
    ), '[]'::jsonb)
  );
$$;

-- Supabase's default privileges grant anon EXECUTE directly (plan §4.5), so
-- revoking from public alone leaves it callable signed out. Harmless here —
-- security invoker plus the auth.uid() filter return an empty reading — but
-- there is no reason for anon to reach it at all.
revoke all on function public.get_synthesis_insights(uuid, timestamptz) from public, anon;
grant execute on function public.get_synthesis_insights(uuid, timestamptz) to authenticated;
