-- ===================================================================
-- Migration: 202609170930_get_quiz_history.sql
-- Improvement plan §5.4 (SA-17, handoff P2.4).
--
-- getQuizHistory read up to 200 quiz_results rows and then up to 20,000
-- quiz_card_results rows to nest the misses in Node. One call, one page,
-- misses already nested per quiz, cursor on created_at.
-- ===================================================================

create or replace function public.get_quiz_history(
  p_deck_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  mode text,
  total_cards integer,
  correct_cards integer,
  duration_ms integer,
  created_at timestamptz,
  misses jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.id,
    q.mode,
    q.total_cards,
    q.correct_cards,
    q.duration_ms,
    q.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'card_id', r.card_id,
               'prompt', r.prompt_text,
               'correct_answer', r.correct_answer_text,
               'user_answer', r.user_answer_text
             ) order by r.created_at)
        from public.quiz_card_results r
       where r.quiz_result_id = q.id
         and not r.correct
    ), '[]'::jsonb) as misses
  from public.quiz_results q
  where q.deck_id = p_deck_id
    and q.user_id = (select auth.uid())
    and q.include_in_history
    and (p_before is null or q.created_at < p_before)
  order by q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_quiz_history(uuid, integer, timestamptz) from public;
grant execute on function public.get_quiz_history(uuid, integer, timestamptz) to authenticated;
