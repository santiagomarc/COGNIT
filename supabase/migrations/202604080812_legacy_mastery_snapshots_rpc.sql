-- Aggregate legacy mastery snapshots per deck from quiz history tables.

create or replace function public.get_legacy_mastery_snapshots(
  p_deck_ids uuid[] default null
)
returns table (
  deck_id uuid,
  assessed_cards bigint,
  mastered_cards bigint,
  last_quiz_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with filtered_results as (
    select qr.id, qr.deck_id, qr.created_at
    from public.quiz_results qr
    where qr.user_id = auth.uid()
      and (
        p_deck_ids is null
        or qr.deck_id = any(p_deck_ids)
      )
  ),
  per_card as (
    select
      fr.deck_id,
      qcr.card_id,
      bool_or(qcr.correct) as ever_correct,
      max(fr.created_at) as card_last_quiz_at
    from filtered_results fr
    join public.quiz_card_results qcr on qcr.quiz_result_id = fr.id
    group by fr.deck_id, qcr.card_id
  )
  select
    pc.deck_id,
    count(*)::bigint as assessed_cards,
    sum(case when pc.ever_correct then 1 else 0 end)::bigint as mastered_cards,
    max(pc.card_last_quiz_at) as last_quiz_at
  from per_card pc
  group by pc.deck_id;
$$;

revoke all on function public.get_legacy_mastery_snapshots(uuid[]) from public;
grant execute on function public.get_legacy_mastery_snapshots(uuid[]) to authenticated;
grant execute on function public.get_legacy_mastery_snapshots(uuid[]) to service_role;
