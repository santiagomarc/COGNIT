INSERT INTO card_mastery_state (
  user_id,
  deck_id,
  card_id,
  correct,
  last_quiz_at,
  updated_at
)
SELECT
  quiz_results.user_id,
  quiz_results.deck_id,
  quiz_card_results.card_id,
  bool_or(quiz_card_results.correct) AS correct,
  max(quiz_results.created_at) AS last_quiz_at,
  now() AS updated_at
FROM quiz_card_results
JOIN quiz_results ON quiz_results.id = quiz_card_results.quiz_result_id
GROUP BY quiz_results.user_id, quiz_results.deck_id, quiz_card_results.card_id
ON CONFLICT (user_id, deck_id, card_id)
DO UPDATE
SET
  correct = card_mastery_state.correct OR EXCLUDED.correct,
  last_quiz_at = GREATEST(card_mastery_state.last_quiz_at, EXCLUDED.last_quiz_at),
  updated_at = now();
