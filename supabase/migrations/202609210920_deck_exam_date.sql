-- ===================================================================
-- Migration: 202609210920_deck_exam_date.sql
-- Micro-synthesis Sprint 4 (COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md D19).
--
-- The deck learns when its exam is. The drill ladder compresses inside
-- three days of it ([0, 0.5, 1]), stays on the sprint cadence inside two
-- weeks ([0, 1, 2]) and stretches beyond ([1, 3, 7]); the launcher reads
-- "exam in N d". Nullable; nothing changes for decks without a date.
-- ===================================================================

alter table public.decks
  add column if not exists exam_at timestamptz;
