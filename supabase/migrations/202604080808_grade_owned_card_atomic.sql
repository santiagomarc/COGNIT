-- Atomic card grade persistence: update scheduling state and append study log in one transaction.

create or replace function public.grade_owned_card(
  p_deck_id uuid,
  p_card_id uuid,
  p_state text,
  p_interval integer,
  p_ease_factor double precision,
  p_repetition_count integer,
  p_next_review_at timestamptz,
  p_last_review_at timestamptz,
  p_grade integer,
  p_review_duration_ms integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1
    from public.decks
    where decks.id = p_deck_id
      and decks.user_id = v_user_id
  ) then
    raise exception 'Deck not found or access denied.';
  end if;

  update public.cards
  set state = p_state,
      interval = p_interval,
      ease_factor = p_ease_factor,
      repetition_count = p_repetition_count,
      next_review_at = p_next_review_at,
      last_review_at = p_last_review_at
  where cards.id = p_card_id
    and cards.deck_id = p_deck_id;

  if not found then
    raise exception 'Card not found.';
  end if;

  insert into public.study_logs (
    user_id,
    card_id,
    grade,
    review_duration_ms
  ) values (
    v_user_id,
    p_card_id,
    p_grade,
    greatest(p_review_duration_ms, 0)
  );
end;
$$;

revoke all on function public.grade_owned_card(
  uuid,
  uuid,
  text,
  integer,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  integer,
  integer
) from public;

grant execute on function public.grade_owned_card(
  uuid,
  uuid,
  text,
  integer,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  integer,
  integer
) to authenticated;

grant execute on function public.grade_owned_card(
  uuid,
  uuid,
  text,
  integer,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  integer,
  integer
) to service_role;
