-- Migration: cast p_state/updates.state to card_state in the two grading RPCs.
--
-- Both functions accept the SM-2 state as `text` and assigned it straight into
-- cards.state, which is the card_state enum. Postgres does not convert text to
-- an enum implicitly, so every call raised 42804 and both call sites fell
-- through to their non-atomic fallback paths — which is why this never
-- surfaced as an error: the fallbacks write the same rows, one statement at a
-- time. The atomicity these functions exist to provide has never held.
--
-- The parameter stays `text` so the existing REVOKE/GRANT signatures and the
-- generated Args types are unchanged. An invalid state now raises
-- 22P02 (invalid_text_representation) instead of silently degrading.

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
  set state = p_state::card_state,
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

CREATE OR REPLACE FUNCTION public.apply_quiz_sm2_batch(
  p_deck_id uuid,
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_updated_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.decks
    WHERE decks.id = p_deck_id
      AND decks.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Deck not found or access denied.';
  END IF;

  WITH updates AS (
    SELECT *
    FROM jsonb_to_recordset(p_updates) AS u(
      card_id uuid,
      state text,
      interval integer,
      ease_factor double precision,
      repetition_count integer,
      next_review_at timestamptz,
      grade integer,
      correct boolean
    )
  ),
  updated_cards AS (
    UPDATE public.cards
    SET state = updates.state::card_state,
        interval = updates.interval,
        ease_factor = updates.ease_factor,
        repetition_count = updates.repetition_count,
        next_review_at = updates.next_review_at,
        last_review_at = v_now
    FROM updates
    WHERE cards.id = updates.card_id
      AND cards.deck_id = p_deck_id
    RETURNING cards.id, updates.grade, updates.correct
  ),
  logged AS (
    INSERT INTO public.study_logs (user_id, card_id, grade, review_duration_ms)
    SELECT v_user_id, updated_cards.id, updated_cards.grade, 0
    FROM updated_cards
    RETURNING 1
  ),
  mastery AS (
    INSERT INTO public.card_mastery_state (user_id, deck_id, card_id, correct, last_quiz_at, updated_at)
    SELECT v_user_id, p_deck_id, updated_cards.id, coalesce(updated_cards.correct, false), v_now, v_now
    FROM updated_cards
    WHERE updated_cards.correct IS NOT NULL
    ON CONFLICT (user_id, deck_id, card_id)
    DO UPDATE SET
      correct = card_mastery_state.correct OR EXCLUDED.correct,
      last_quiz_at = EXCLUDED.last_quiz_at,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT count(*) INTO v_updated_count FROM updated_cards;

  RETURN v_updated_count;
END;
$$;
