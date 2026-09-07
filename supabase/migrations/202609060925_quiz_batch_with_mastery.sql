-- Migration: Fold card mastery upsert into apply_quiz_sm2_batch transaction (R-6)
-- Closes partial-failure window where SM-2 updates succeed but mastery updates fail or vice-versa.

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
    SET state = updates.state,
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

REVOKE ALL ON FUNCTION public.apply_quiz_sm2_batch(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_quiz_sm2_batch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quiz_sm2_batch(uuid, jsonb) TO service_role;
