-- ===================================================================
-- Migration: 202609150900_micro_synthesis_phase3.sql
-- Micro-synthesis, Phase 3 (COGNIT_MICRO_SYNTHESIS_AUDIT.md P1, R8, F1, F2, F5).
--
--   • synthesis_drills.link_count / last_links_covered — the launcher's
--     DUE · LINKS a/b · LAST readings come from the drill rows alone; the
--     attempts table leaves the deck overview's critical path (P1).
--   • synthesis_attempts.client_attempt_id — a client-generated key so a
--     retried check after an ambiguous failure returns the existing attempt
--     instead of running a second model call (R8).
--   • synthesis_attempts.confidence — the student's judgement of learning
--     before the check, 1 unsure · 2 fairly sure · 3 sure (F1).
--   • synthesis_attempts.revision_of — the attempt this one revises, for the
--     one in-place revise after a partial or contradicted verdict (F2).
--   • synthesis_attempt_feedback — "was this check fair?", one row per
--     attempt, upsertable, kept out of the append-only attempts table (F5).
--
-- Idempotent: `if not exists` throughout; `drop policy if exists` + create.
-- No RPCs, no SECURITY DEFINER; every policy is own-rows plus ownership of
-- the referenced attempt, as 202609120900 does for drills and decks.
-- ===================================================================

-- ── 1. Denormalised readings on the drill row ─────────────────────
alter table public.synthesis_drills
  add column if not exists link_count smallint not null default 0
    check (link_count between 0 and 4);
alter table public.synthesis_drills
  add column if not exists last_links_covered smallint
    check (last_links_covered is null or last_links_covered between 0 and 4);

-- Backfill: the key's size is on the row already; the latest attempt's
-- covered count is one pass over the attempts, newest first per drill.
update public.synthesis_drills
   set link_count = least(4, jsonb_array_length(required_links))
 where link_count = 0;

update public.synthesis_drills d
   set last_links_covered = latest.covered
  from (
    select distinct on (a.drill_id)
           a.drill_id,
           (select count(*)::smallint
              from jsonb_array_elements(a.coverage) c
             where c->>'status' = 'covered') as covered
      from public.synthesis_attempts a
     order by a.drill_id, a.created_at desc
  ) latest
 where latest.drill_id = d.id
   and d.last_links_covered is null;

-- ── 2. Attempt columns: idempotency, confidence, revision ─────────
alter table public.synthesis_attempts
  add column if not exists client_attempt_id uuid;
alter table public.synthesis_attempts
  add column if not exists confidence smallint
    check (confidence is null or confidence between 1 and 3);
alter table public.synthesis_attempts
  add column if not exists revision_of uuid references public.synthesis_attempts(id) on delete set null;

-- One attempt per (drill, client key); the key is optional for legacy rows.
create unique index if not exists synthesis_attempts_client_key_idx
  on public.synthesis_attempts (drill_id, client_attempt_id)
  where client_attempt_id is not null;

-- ── 3. Verdict feedback ───────────────────────────────────────────
create table if not exists public.synthesis_attempt_feedback (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.synthesis_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('fair', 'unfair')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id)
);

alter table public.synthesis_attempt_feedback enable row level security;

drop policy if exists "Users can view their own synthesis feedback" on public.synthesis_attempt_feedback;
create policy "Users can view their own synthesis feedback"
  on public.synthesis_attempt_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own synthesis feedback" on public.synthesis_attempt_feedback;
create policy "Users can insert their own synthesis feedback"
  on public.synthesis_attempt_feedback for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.synthesis_attempts a where a.id = synthesis_attempt_feedback.attempt_id and a.user_id = auth.uid())
  );

drop policy if exists "Users can update their own synthesis feedback" on public.synthesis_attempt_feedback;
create policy "Users can update their own synthesis feedback"
  on public.synthesis_attempt_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own synthesis feedback" on public.synthesis_attempt_feedback;
create policy "Users can delete their own synthesis feedback"
  on public.synthesis_attempt_feedback for delete
  using (auth.uid() = user_id);
