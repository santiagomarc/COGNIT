-- Migration: select_quiz_cards RPC to bound quiz card selection (P-2)
-- Prefers due and unmastered cards up to p_limit, preventing unbounded queries.

CREATE OR REPLACE FUNCTION public.select_quiz_cards(
  p_deck_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  deck_id uuid,
  front text,
  back text,
  state text,
  "interval" integer,
  ease_factor double precision,
  repetition_count integer,
  mcq_distractors jsonb,
  id_question text,
  topic_tags jsonb,
  mnemonic text,
  next_review_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.deck_id,
    c.front,
    c.back,
    c.state,
    c.interval AS "interval",
    c.ease_factor,
    c.repetition_count,
    to_jsonb(c.mcq_distractors),
    c.id_question,
    to_jsonb(c.topic_tags),
    c.mnemonic,
    c.next_review_at
  FROM public.cards c
  LEFT JOIN public.card_mastery_state cms
    ON cms.card_id = c.id
    AND cms.deck_id = c.deck_id
    AND cms.user_id = auth.uid()
  WHERE c.deck_id = p_deck_id
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = p_deck_id AND d.user_id = auth.uid()
    )
  ORDER BY
    -- Prioritize due cards and unmastered cards
    CASE
      WHEN c.next_review_at <= now() THEN 0
      WHEN coalesce(cms.correct, false) = false THEN 1
      ELSE 2
    END ASC,
    c.next_review_at ASC NULLS FIRST,
    c.created_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.select_quiz_cards(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.select_quiz_cards(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_quiz_cards(uuid, integer) TO service_role;
