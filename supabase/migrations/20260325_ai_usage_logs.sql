CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('generate_cards', 'enrich_cards', 'sanitize_notes', 'get_hint')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_user_action_created_at_idx
  ON ai_usage_logs (user_id, action, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_logs'
      AND policyname = 'Users can view their own AI usage logs'
  ) THEN
    CREATE POLICY "Users can view their own AI usage logs"
      ON ai_usage_logs
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
      AND tablename = 'ai_usage_logs'
      AND policyname = 'Users can insert their own AI usage logs'
  ) THEN
    CREATE POLICY "Users can insert their own AI usage logs"
      ON ai_usage_logs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
