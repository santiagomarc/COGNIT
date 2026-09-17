-- ===================================================================
-- Migration: 202609170970_synthesis_absorption.sql
-- Improvement plan §3.3 — the "+ Add as card" absorption loop.
--
-- An outside claim the student made in a drill becomes a card. Until now it
-- became a `manual` card with no provenance, and the result panel forgot it
-- had been added the moment the page reloaded. The card now records which
-- attempt and which claim it came from. The attempts table stays append-only
-- (spec §5); the link lives on the card, and the partial unique index makes
-- a double-tap idempotent instead of a duplicate.
-- ===================================================================

-- The baseline schema declared the CHECK inline (auto-named cards_source_check);
-- an older database may carry it under another name. Drop every CHECK on
-- cards that mentions `source`, then add the one that allows the new value.
do $$
declare
  con record;
begin
  for con in
    select conname
      from pg_constraint
     where conrelid = 'public.cards'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%source%'
  loop
    execute format('alter table public.cards drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.cards
  add constraint cards_source_check
  check (source in ('manual', 'ai_pdf', 'bulk_import', 'ai_cleaned', 'synthesis_claim'));

alter table public.cards
  add column if not exists absorbed_from_attempt_id uuid
    references public.synthesis_attempts(id) on delete set null;
alter table public.cards
  add column if not exists absorbed_claim_index smallint
    check (absorbed_claim_index is null or absorbed_claim_index between 0 and 2);

-- One card per (attempt, claim); the FK's own index doubles as the lookup
-- for "which claims of this attempt were absorbed".
create unique index if not exists cards_absorbed_claim_idx
  on public.cards (absorbed_from_attempt_id, absorbed_claim_index)
  where absorbed_from_attempt_id is not null;
