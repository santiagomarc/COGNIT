ALTER TABLE quiz_card_results
  ADD COLUMN IF NOT EXISTS prompt_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS correct_answer_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS user_answer_text TEXT NULL;