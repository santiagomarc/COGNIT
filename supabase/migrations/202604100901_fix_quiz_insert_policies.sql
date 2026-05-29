-- Enforce absolute ownership checks for quiz inserts to prevent cross-deck pollution.

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert their own quiz results" ON public.quiz_results;
  
  CREATE POLICY "Users can insert their own quiz results"
    ON public.quiz_results
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id AND
      EXISTS (
        SELECT 1
        FROM public.decks
        WHERE decks.id = quiz_results.deck_id
          AND decks.user_id = auth.uid()
      )
    );
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can insert quiz card results for their own attempts" ON public.quiz_card_results;

  CREATE POLICY "Users can insert quiz card results for their own attempts"
    ON public.quiz_card_results
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.quiz_results
        WHERE quiz_results.id = quiz_card_results.quiz_result_id
          AND quiz_results.user_id = auth.uid()
      ) AND
      EXISTS (
        SELECT 1
        FROM public.cards
        WHERE cards.id = quiz_card_results.card_id
          AND EXISTS (
            SELECT 1
            FROM public.decks
            WHERE decks.id = cards.deck_id
              AND decks.user_id = auth.uid()
          )
      )
    );
END $$;
