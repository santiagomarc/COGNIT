-- Records objects that exist on the hosted project but were made in the
-- dashboard, so a fresh replay (CI `database` job) matches production and its
-- generated types. Definitions are copied verbatim from production
-- (pg_get_functiondef / information_schema, 2026-09-27); on production every
-- statement is a no-op.

-- Written by src/app/actions/quiz.ts and read by QuizHistoryList.
alter table public.quiz_results
  add column if not exists incorrect_answers jsonb default '[]'::jsonb;

-- Neither overload is called by the app any more (apply_quiz_sm2_batch
-- replaced them); kept only so replay matches production until they are
-- dropped deliberately.
CREATE OR REPLACE FUNCTION public.batch_grade_owned_cards(p_deck_id uuid, p_updates jsonb[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.batch_grade_owned_cards(p_deck_id uuid, p_updates jsonb[], p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_update RECORD;
  v_item JSONB;
BEGIN
  -- Verify ownership of deck
  IF NOT EXISTS (
    SELECT 1 FROM public.decks WHERE id = p_deck_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Deck not found or access denied.';
  END IF;

  -- Iterate through updates
  FOREACH v_item IN ARRAY p_updates
  LOOP
    -- Update card
    UPDATE public.cards
    SET state = (v_item->>'state'),
        interval = (v_item->'interval')::INTEGER,
        ease_factor = (v_item->'ease_factor')::DOUBLE PRECISION,
        repetition_count = (v_item->'repetition_count')::INTEGER,
        next_review_at = (v_item->>'next_review_at')::TIMESTAMPTZ,
        last_review_at = (v_item->>'last_review_at')::TIMESTAMPTZ
    WHERE id = (v_item->>'card_id')::UUID AND deck_id = p_deck_id;

    -- Append study log
    INSERT INTO public.study_logs (
      user_id,
      card_id,
      grade,
      review_duration_ms
    ) VALUES (
      p_user_id,
      (v_item->>'card_id')::UUID,
      (v_item->'grade')::INTEGER,
      GREATEST((v_item->'review_duration_ms')::INTEGER, 0)
    );
  END LOOP;
END;
$function$;
