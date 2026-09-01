-- "Weakest Concepts": rank topic tags by quiz error rate. Purely an
-- aggregation over data already collected — cards.topic_tags (AI enrichment)
-- and quiz_card_results.correct (every quiz attempt) — no new columns needed.

create or replace function public.get_weakest_concepts(
  p_user_id uuid,
  p_deck_id uuid default null,
  p_min_attempts integer default 5,
  p_limit integer default 10
)
returns table (
  topic_tag text,
  attempts integer,
  misses integer,
  error_rate double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tag as topic_tag,
    count(*)::integer as attempts,
    count(*) filter (where not quiz_card_results.correct)::integer as misses,
    (count(*) filter (where not quiz_card_results.correct))::double precision / count(*) as error_rate
  from public.quiz_card_results
  join public.quiz_results
    on quiz_results.id = quiz_card_results.quiz_result_id
  join public.cards
    on cards.id = quiz_card_results.card_id
  cross join lateral unnest(cards.topic_tags) as tag
  where quiz_results.user_id = auth.uid()
    and quiz_results.user_id = p_user_id
    and (p_deck_id is null or quiz_results.deck_id = p_deck_id)
    and cards.topic_tags is not null
  group by tag
  having count(*) >= greatest(1, coalesce(p_min_attempts, 5))
  order by error_rate desc, attempts desc
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

revoke all on function public.get_weakest_concepts(uuid, uuid, integer, integer) from public;
grant execute on function public.get_weakest_concepts(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.get_weakest_concepts(uuid, uuid, integer, integer) to service_role;
