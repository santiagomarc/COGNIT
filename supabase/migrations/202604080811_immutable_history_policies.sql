-- Explicitly document immutable history intent: these tables are append-only for end users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_logs'
      AND policyname = 'Users cannot update study logs'
  ) THEN
    CREATE POLICY "Users cannot update study logs"
      ON public.study_logs
      FOR UPDATE
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_logs'
      AND policyname = 'Users cannot delete study logs'
  ) THEN
    CREATE POLICY "Users cannot delete study logs"
      ON public.study_logs
      FOR DELETE
      USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_results'
      AND policyname = 'Users cannot update quiz results'
  ) THEN
    CREATE POLICY "Users cannot update quiz results"
      ON public.quiz_results
      FOR UPDATE
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_results'
      AND policyname = 'Users cannot delete quiz results'
  ) THEN
    CREATE POLICY "Users cannot delete quiz results"
      ON public.quiz_results
      FOR DELETE
      USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_card_results'
      AND policyname = 'Users cannot update quiz card results'
  ) THEN
    CREATE POLICY "Users cannot update quiz card results"
      ON public.quiz_card_results
      FOR UPDATE
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quiz_card_results'
      AND policyname = 'Users cannot delete quiz card results'
  ) THEN
    CREATE POLICY "Users cannot delete quiz card results"
      ON public.quiz_card_results
      FOR DELETE
      USING (false);
  END IF;
END $$;
