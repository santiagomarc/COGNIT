-- ===================================================================
-- Migration: 202609210900_micro_synthesis_phase4.sql
-- Micro-synthesis Phase 4 (COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md, Sprints 1–2).
--
--   • synthesis_drills.prompt_variants — two rewordings of the same
--     question, served in rotation so a repeat attempt is retrieval of the
--     relation, not recall of the exemplar (plan D6).
--   • synthesis_drills.bloom — the generator's difficulty tag; the queue
--     prefers harder formats at step 2 (plan D18).
--   • synthesis_drills.scenario — the short case an `apply` drill is set in,
--     rendered above the question (plan D11).
--   • format CHECK extended with the four new formats (plan D11).
--
-- Link kinds and `core` live inside `required_links` jsonb; legacy rows
-- without them are read as mechanism/core by the loader (plan D3).
-- Idempotent and additive; every column has a default or is nullable.
-- ===================================================================

alter table public.synthesis_drills
  add column if not exists prompt_variants jsonb not null default '[]'::jsonb
    check (jsonb_typeof(prompt_variants) = 'array' and jsonb_array_length(prompt_variants) <= 3);

alter table public.synthesis_drills
  add column if not exists bloom text
    check (bloom is null or bloom in ('analyse', 'evaluate', 'create'));

alter table public.synthesis_drills
  add column if not exists scenario text
    check (scenario is null or char_length(scenario) <= 400);

-- The baseline declared the format CHECK inline (auto-named
-- synthesis_drills_format_check). Drop every CHECK on the table that
-- mentions `format`, then add the one that allows the new values.
do $$
declare
  con record;
begin
  for con in
    select conname
      from pg_constraint
     where conrelid = 'public.synthesis_drills'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%format%'
  loop
    execute format('alter table public.synthesis_drills drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.synthesis_drills
  add constraint synthesis_drills_format_check
  check (format in ('causal', 'counterfactual', 'comparative', 'evaluate', 'apply', 'distinguish', 'elaborate'));
