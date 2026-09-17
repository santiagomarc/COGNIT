-- ===================================================================
-- Migration: 202609170940_fk_indexes.sql
-- Improvement plan §5.1 (DB-02, DB-03, DB-06).
--
-- Every foreign key below had no leading-column index, so each was a cascade
-- path that sequentially scanned its table:
--   • deleting a card scanned study_logs and card_mastery_state
--     (card_mastery_state's PK is (user_id, deck_id, card_id) — useless for a
--     lookup by card_id alone);
--   • deleting a deck scanned card_mastery_state and synthesis_attempts
--     (its composite index leads with user_id);
--   • deleting a user scanned five tables.
-- bulkDeleteCards of 200 cards was 200 × two sequential scans.
--
-- Plain CREATE INDEX: the migration runner wraps each file in a transaction,
-- and CONCURRENTLY cannot run inside one. On a database that already holds
-- real traffic, run the CONCURRENTLY variant at the bottom by hand FIRST; the
-- IF NOT EXISTS here then makes this file a no-op for those indexes.
-- ===================================================================

-- ── Missing FK indexes ─────────────────────────────────────────────
create index if not exists study_logs_card_id_idx
  on public.study_logs (card_id);
create index if not exists card_mastery_state_card_id_idx
  on public.card_mastery_state (card_id);
create index if not exists card_mastery_state_deck_id_idx
  on public.card_mastery_state (deck_id);
create index if not exists synthesis_attempts_deck_id_idx
  on public.synthesis_attempts (deck_id);
create index if not exists synthesis_attempts_revision_of_idx
  on public.synthesis_attempts (revision_of)
  where revision_of is not null;
create index if not exists synthesis_attempt_feedback_user_id_idx
  on public.synthesis_attempt_feedback (user_id);
create index if not exists deck_chat_sessions_user_id_idx
  on public.deck_chat_sessions (user_id);
create index if not exists deck_chat_messages_user_id_idx
  on public.deck_chat_messages (user_id);
create index if not exists deck_chat_embedding_metadata_user_id_idx
  on public.deck_chat_embedding_metadata (user_id);

-- ── Redundant indexes on the hottest write table ───────────────────
-- cards is written on every grade. cards_deck_id_idx is a strict prefix of
-- cards_deck_id_created_at_idx (and of the next_review_at composite), so the
-- planner never needs it and every UPDATE pays to maintain it.
drop index if exists public.cards_deck_id_idx;
-- ai_usage_logs_user_created_at_idx is a prefix of the (user_id, action,
-- created_at) index added with reserve_ai_call v2.
drop index if exists public.ai_usage_logs_user_created_at_idx;

-- cards_next_review_at_idx (global, no deck/user prefix) is left in place:
-- confirm it is unused before dropping it on a live database —
--   select indexrelname, idx_scan from pg_stat_user_indexes where relname = 'cards';

analyze public.study_logs;
analyze public.card_mastery_state;
analyze public.synthesis_attempts;

-- ── Zero-downtime variant, for a database that already holds user data ──
-- Run each statement by hand, outside any transaction, before applying this file:
--   create index concurrently if not exists study_logs_card_id_idx on public.study_logs (card_id);
--   create index concurrently if not exists card_mastery_state_card_id_idx on public.card_mastery_state (card_id);
--   create index concurrently if not exists card_mastery_state_deck_id_idx on public.card_mastery_state (deck_id);
--   create index concurrently if not exists synthesis_attempts_deck_id_idx on public.synthesis_attempts (deck_id);
--   create index concurrently if not exists synthesis_attempts_revision_of_idx on public.synthesis_attempts (revision_of) where revision_of is not null;
--   create index concurrently if not exists synthesis_attempt_feedback_user_id_idx on public.synthesis_attempt_feedback (user_id);
--   create index concurrently if not exists deck_chat_sessions_user_id_idx on public.deck_chat_sessions (user_id);
--   create index concurrently if not exists deck_chat_messages_user_id_idx on public.deck_chat_messages (user_id);
--   create index concurrently if not exists deck_chat_embedding_metadata_user_id_idx on public.deck_chat_embedding_metadata (user_id);
