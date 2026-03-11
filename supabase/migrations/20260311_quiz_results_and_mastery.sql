CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('mcq', 'identification')),
  total_cards INT NOT NULL CHECK (total_cards > 0),
  correct_cards INT NOT NULL CHECK (correct_cards >= 0 AND correct_cards <= total_cards),
  duration_ms INT NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_card_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_result_id UUID NOT NULL REFERENCES quiz_results(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_results_user_id_created_at_idx
  ON quiz_results (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_results_deck_id_created_at_idx
  ON quiz_results (deck_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_card_results_quiz_result_id_idx
  ON quiz_card_results (quiz_result_id);

CREATE INDEX IF NOT EXISTS quiz_card_results_card_id_idx
  ON quiz_card_results (card_id);

ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_card_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_results'
      AND policyname = 'Users can view their own quiz results'
  ) THEN
    CREATE POLICY "Users can view their own quiz results"
      ON quiz_results
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_results'
      AND policyname = 'Users can insert their own quiz results'
  ) THEN
    CREATE POLICY "Users can insert their own quiz results"
      ON quiz_results
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_card_results'
      AND policyname = 'Users can view quiz card results from their own attempts'
  ) THEN
    CREATE POLICY "Users can view quiz card results from their own attempts"
      ON quiz_card_results
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM quiz_results
          WHERE quiz_results.id = quiz_card_results.quiz_result_id
            AND quiz_results.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_card_results'
      AND policyname = 'Users can insert quiz card results for their own attempts'
  ) THEN
    CREATE POLICY "Users can insert quiz card results for their own attempts"
      ON quiz_card_results
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM quiz_results
          WHERE quiz_results.id = quiz_card_results.quiz_result_id
            AND quiz_results.user_id = auth.uid()
        )
      );
  END IF;
END $$;