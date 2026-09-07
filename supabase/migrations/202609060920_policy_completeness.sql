-- Migration: Policy Completeness (S-6)
-- Ensures all auxiliary tables have complete CRUD RLS policies (including DELETE)
-- and confirms SECURITY INVOKER for auxiliary RPC functions.

-- 1. DELETE policy for card_mastery_state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'card_mastery_state'
      AND policyname = 'Users can delete their own mastery state'
  ) THEN
    CREATE POLICY "Users can delete their own mastery state"
      ON public.card_mastery_state
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. DELETE policy for deck_chat_embedding_metadata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deck_chat_embedding_metadata'
      AND policyname = 'Users can delete their own deck chat embedding metadata'
  ) THEN
    CREATE POLICY "Users can delete their own deck chat embedding metadata"
      ON public.deck_chat_embedding_metadata
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Re-affirm get_due_cards_by_deck has security invoker and user check
CREATE OR REPLACE FUNCTION public.get_due_cards_by_deck(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  deck_id uuid,
  due_count bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cards.deck_id,
    count(*)::bigint AS due_count
  FROM public.cards
  JOIN public.decks ON decks.id = cards.deck_id
  WHERE decks.user_id = coalesce(auth.uid(), p_user_id)
    AND cards.next_review_at <= p_now
  GROUP BY cards.deck_id
  ORDER BY due_count DESC;
$$;
