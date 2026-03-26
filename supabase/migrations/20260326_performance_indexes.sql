-- Performance indexes for dashboard/deck latency reduction.
-- Safe to run repeatedly in different environments.

-- Common ownership filter for deck-scoped queries.
create index if not exists decks_user_id_idx
  on public.decks (user_id);

-- Deck detail route: cards fetched by deck and sorted by newest first.
create index if not exists cards_deck_id_created_at_idx
  on public.cards (deck_id, created_at desc);

-- Dashboard due-today query pattern and review scheduler lookups.
create index if not exists cards_deck_id_next_review_at_idx
  on public.cards (deck_id, next_review_at);

-- Supports global due-time scans and range filters.
create index if not exists cards_next_review_at_idx
  on public.cards (next_review_at);

-- Dashboard streak/activity queries: user filtered + created_at sorted/ranged.
create index if not exists study_logs_user_id_created_at_idx
  on public.study_logs (user_id, created_at desc);

-- Deck page mastery queries: user+deck filter and newest-first ordering.
create index if not exists quiz_results_user_id_deck_id_created_at_idx
  on public.quiz_results (user_id, deck_id, created_at desc);
