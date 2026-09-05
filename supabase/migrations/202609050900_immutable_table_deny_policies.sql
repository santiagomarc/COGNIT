-- ===================================================================
-- Migration: 202609050900_immutable_table_deny_policies.sql
-- Description: Enforce explicit defense-in-depth DENY RLS policies on
--              append-only and immutable tables:
--              - study_logs (immutable history)
--              - quiz_results (immutable history)
--              - quiz_card_results (immutable history)
--              - ai_usage_logs (immutable audit log)
--              - deck_chat_messages (no in-place editing permitted)
-- ===================================================================

-- 1. study_logs: explicit deny for UPDATE and DELETE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_logs'
      AND policyname IN ('Users cannot update study logs', 'Deny updates to study logs')
  ) THEN
    CREATE POLICY "Users cannot update study logs"
      ON public.study_logs FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'study_logs'
      AND policyname IN ('Users cannot delete study logs', 'Deny deletes to study logs')
  ) THEN
    CREATE POLICY "Users cannot delete study logs"
      ON public.study_logs FOR DELETE USING (false);
  END IF;
END $$;

-- 2. quiz_results: explicit deny for UPDATE and DELETE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quiz_results'
      AND policyname IN ('Users cannot update quiz results', 'Deny updates to quiz results')
  ) THEN
    CREATE POLICY "Users cannot update quiz results"
      ON public.quiz_results FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quiz_results'
      AND policyname IN ('Users cannot delete quiz results', 'Deny deletes to quiz results')
  ) THEN
    CREATE POLICY "Users cannot delete quiz results"
      ON public.quiz_results FOR DELETE USING (false);
  END IF;
END $$;

-- 3. quiz_card_results: explicit deny for UPDATE and DELETE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quiz_card_results'
      AND policyname IN ('Users cannot update quiz card results', 'Deny updates to quiz card results')
  ) THEN
    CREATE POLICY "Users cannot update quiz card results"
      ON public.quiz_card_results FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quiz_card_results'
      AND policyname IN ('Users cannot delete quiz card results', 'Deny deletes to quiz card results')
  ) THEN
    CREATE POLICY "Users cannot delete quiz card results"
      ON public.quiz_card_results FOR DELETE USING (false);
  END IF;
END $$;

-- 4. ai_usage_logs: explicit deny for UPDATE and DELETE (audit log)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_usage_logs'
      AND policyname IN ('Users cannot update ai usage logs', 'Deny updates to ai usage logs')
  ) THEN
    CREATE POLICY "Users cannot update ai usage logs"
      ON public.ai_usage_logs FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_usage_logs'
      AND policyname IN ('Users cannot delete ai usage logs', 'Deny deletes to ai usage logs')
  ) THEN
    CREATE POLICY "Users cannot delete ai usage logs"
      ON public.ai_usage_logs FOR DELETE USING (false);
  END IF;
END $$;

-- 5. deck_chat_messages: explicit deny for UPDATE (chat messages cannot be edited after generation)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'deck_chat_messages'
      AND policyname IN ('Users cannot update deck chat messages', 'Deny updates to deck chat messages')
  ) THEN
    CREATE POLICY "Users cannot update deck chat messages"
      ON public.deck_chat_messages FOR UPDATE USING (false) WITH CHECK (false);
  END IF;
END $$;
