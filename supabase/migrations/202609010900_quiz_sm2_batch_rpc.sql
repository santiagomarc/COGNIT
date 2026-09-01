-- Atomic batch SM-2 update for quiz results: applies every card's scheduling
-- update and appends every study_logs row in a single round trip, instead of
-- N sequential UPDATEs per quiz (see logQuizResult in src/app/actions/quiz.ts).

create or replace function public.apply_quiz_sm2_batch(
  p_deck_id uuid,
  p_updates jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) = 0 then
    return 0;
  end if;

  if not exists (
    select 1
    from public.decks
    where decks.id = p_deck_id
      and decks.user_id = v_user_id
  ) then
    raise exception 'Deck not found or access denied.';
  end if;

  with updates as (
    select *
    from jsonb_to_recordset(p_updates) as u(
      card_id uuid,
      state text,
      interval integer,
      ease_factor double precision,
      repetition_count integer,
      next_review_at timestamptz,
      grade integer
    )
  ),
  updated_cards as (
    update public.cards
    set state = updates.state,
        interval = updates.interval,
        ease_factor = updates.ease_factor,
        repetition_count = updates.repetition_count,
        next_review_at = updates.next_review_at,
        last_review_at = v_now
    from updates
    where cards.id = updates.card_id
      and cards.deck_id = p_deck_id
    returning cards.id, updates.grade
  ),
  -- Data-modifying CTEs in Postgres always run to completion even when not
  -- referenced by the final SELECT, so this insert executes for every row
  -- updated_cards produced above.
  logged as (
    insert into public.study_logs (user_id, card_id, grade, review_duration_ms)
    select v_user_id, updated_cards.id, updated_cards.grade, 0
    from updated_cards
    returning 1
  )
  select count(*) into v_updated_count from updated_cards;

  return v_updated_count;
end;
$$;

revoke all on function public.apply_quiz_sm2_batch(uuid, jsonb) from public;
grant execute on function public.apply_quiz_sm2_batch(uuid, jsonb) to authenticated;
grant execute on function public.apply_quiz_sm2_batch(uuid, jsonb) to service_role;
