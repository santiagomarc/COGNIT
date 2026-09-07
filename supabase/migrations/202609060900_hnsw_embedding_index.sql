-- ===================================================================
-- Migration: 202609060900_hnsw_embedding_index.sql
-- Finding P-1.
--
-- 202604100900 created an IVFFlat index (lists = 10) in the SAME migration
-- that added the embedding column — i.e. it was trained on an empty table.
-- IVFFlat computes its centroids at build time, so an index built over zero
-- rows never recovers its recall without a manual rebuild.
--
-- HNSW needs no training, handles incremental inserts, and at this corpus size
-- (<100k vectors per user) the build cost is negligible.
--
-- OPERATIONAL NOTE: on a populated `cards` table, DROP + CREATE INDEX takes an
-- ACCESS EXCLUSIVE lock for the duration of the build. If the target database
-- already holds real user data, run the CONCURRENTLY variant at the bottom of
-- this file by hand instead — CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, so it cannot live in a normal migration.
--
-- This migration is deliberately kept separate from the rest of Phase 3: it is
-- the one change that is not cleanly reversible alongside a code rollback.
-- Reverting the app is safe (the vector RPCs work with no index, just slower),
-- but the IVFFlat index will be gone.
-- ===================================================================

drop index if exists public.cards_embedding_ivfflat_idx;

create index if not exists cards_embedding_hnsw_idx
  on public.cards using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Both vector RPCs filter by deck (or by the user's decks) BEFORE ordering by
-- distance. Without this the planner scans the whole HNSW graph and then throws
-- away every row belonging to another deck.
create index if not exists cards_deck_id_embedding_notnull_idx
  on public.cards (deck_id)
  where embedding is not null;

analyze public.cards;

-- ── Zero-downtime variant, for a database that already holds user data ──
-- Run these two statements manually, outside any transaction:
--
--   create index concurrently if not exists cards_embedding_hnsw_idx
--     on public.cards using hnsw (embedding vector_cosine_ops)
--     with (m = 16, ef_construction = 64);
--   drop index concurrently if exists cards_embedding_ivfflat_idx;
