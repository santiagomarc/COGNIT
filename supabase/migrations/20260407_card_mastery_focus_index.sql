-- Improves focus_unproven quiz filter path by narrowing proven-card lookups.

create index if not exists card_mastery_state_user_deck_correct_idx
  on public.card_mastery_state (user_id, deck_id, correct);
