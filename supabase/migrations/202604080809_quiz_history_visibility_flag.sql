-- Keep this migration for historical compatibility with environments that applied version 20260328.
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS include_in_history BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS quiz_results_user_id_deck_id_history_created_at_idx
  ON quiz_results (user_id, deck_id, include_in_history, created_at DESC);
