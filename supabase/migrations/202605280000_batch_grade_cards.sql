-- Batch card grade persistence: update multiple cards' scheduling state and append study logs in one transaction.

create or replace function public.batch_grade_owned_cards(
  p_deck_id uuid,
  p_updates jsonb[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_card_id uuid;
  v_state text;
  v_interval integer;
  v_ease_factor double precision;
  v_repetition_count integer;
  v_next_review_at timestamptz;
  v_last_review_at timestamptz;
  v_grade integer;
  v_review_duration_ms integer;
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

  if p_updates is null or array_length(p_updates, 1) is null then
    return;
  end if;

  foreach v_item in array p_updates
  loop
    v_card_id := (v_item->>'card_id')::uuid;
    v_state := (v_item->>'state');
    v_interval := (v_item->>'interval')::integer;
    v_ease_factor := (v_item->>'ease_factor')::double precision;
    v_repetition_count := (v_item->>'repetition_count')::integer;
    v_next_review_at := (v_item->>'next_review_at')::timestamptz;
    v_last_review_at := (v_item->>'last_review_at')::timestamptz;
    v_grade := (v_item->>'grade')::integer;
    v_review_duration_ms := (v_item->>'review_duration_ms')::integer;

    if v_card_id is null then
      continue;
    end if;

    update public.cards
    set state = v_state,
        interval = v_interval,
        ease_factor = v_ease_factor,
        repetition_count = v_repetition_count,
        next_review_at = v_next_review_at,
        last_review_at = v_last_review_at
    where cards.id = v_card_id
      and cards.deck_id = p_deck_id;

    if not found then
      raise exception 'Card % not found in this deck.', v_card_id;
    end if;

    insert into public.study_logs (
      user_id,
      card_id,
      grade,
      review_duration_ms
    ) values (
      v_user_id,
      v_card_id,
      v_grade,
      greatest(v_review_duration_ms, 0)
    );
  end loop;
end;
$$;

revoke all on function public.batch_grade_owned_cards(uuid, jsonb[]) from public;
grant execute on function public.batch_grade_owned_cards(uuid, jsonb[]) to authenticated;
grant execute on function public.batch_grade_owned_cards(uuid, jsonb[]) to service_role;
