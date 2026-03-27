CREATE TABLE IF NOT EXISTS card_mastery_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  correct BOOLEAN NOT NULL,
  last_quiz_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deck_id, card_id)
);

CREATE INDEX IF NOT EXISTS card_mastery_state_user_id_deck_id_idx
  ON card_mastery_state (user_id, deck_id);

CREATE INDEX IF NOT EXISTS card_mastery_state_user_id_last_quiz_at_idx
  ON card_mastery_state (user_id, last_quiz_at DESC);

ALTER TABLE card_mastery_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'card_mastery_state'
      AND policyname = 'Users can view their own mastery state'
  ) THEN
    CREATE POLICY "Users can view their own mastery state"
      ON card_mastery_state
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
      AND tablename = 'card_mastery_state'
      AND policyname = 'Users can insert their own mastery state'
  ) THEN
    CREATE POLICY "Users can insert their own mastery state"
      ON card_mastery_state
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
      AND tablename = 'card_mastery_state'
      AND policyname = 'Users can update their own mastery state'
  ) THEN
    CREATE POLICY "Users can update their own mastery state"
      ON card_mastery_state
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
