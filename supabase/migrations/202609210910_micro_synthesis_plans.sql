-- ===================================================================
-- Migration: 202609210910_micro_synthesis_plans.sql
-- Micro-synthesis Sprint 3 (COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md D15, D16).
--
-- Essay Plan mode: a set question over 4–8 cards, answered as a plan
-- (thesis · three points · conclusion) and graded in bands. A plan is a
-- drill row with `kind = 'plan'`, a wider key and a wider answer; the same
-- attempt table, the same RPC, the same ladder machinery.
--
--   • synthesis_drills.kind / question_text / command_word
--   • card_ids 2..8, required_links 2..8, link_count 0..8, last_links_covered 0..8
--   • synthesis_attempts.mode gains 'plan'; word_count 1..400; band
--   • record_synthesis_attempt writes `band`
--   • synthesis_questions — the pasted past-paper questions (D16)
--
-- Idempotent and additive. Constraint rewrites use the same "drop every
-- CHECK mentioning the column, then add" pattern as 202609170970.
-- ===================================================================

-- ── 1. Drill columns ──────────────────────────────────────────────
alter table public.synthesis_drills
  add column if not exists kind text not null default 'drill'
    check (kind in ('drill', 'plan'));
alter table public.synthesis_drills
  add column if not exists question_text text
    check (question_text is null or char_length(question_text) <= 600);
alter table public.synthesis_drills
  add column if not exists command_word text
    check (command_word is null or char_length(command_word) <= 40);

create index if not exists synthesis_drills_kind_queue_idx
  on public.synthesis_drills (user_id, deck_id, kind, status, next_due_at);

-- ── 2. Wider keys for plans ───────────────────────────────────────
do $$
declare
  con record;
begin
  for con in
    select conname
      from pg_constraint
     where conrelid = 'public.synthesis_drills'::regclass
       and contype = 'c'
       and (
         pg_get_constraintdef(oid) ilike '%card_ids%'
         or pg_get_constraintdef(oid) ilike '%required_links%'
         or pg_get_constraintdef(oid) ilike '%link_count%'
         or pg_get_constraintdef(oid) ilike '%last_links_covered%'
       )
  loop
    execute format('alter table public.synthesis_drills drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.synthesis_drills
  add constraint synthesis_drills_card_ids_check
  check (array_length(card_ids, 1) between 2 and 8);
alter table public.synthesis_drills
  add constraint synthesis_drills_required_links_check
  check (jsonb_typeof(required_links) = 'array' and jsonb_array_length(required_links) between 2 and 8);
alter table public.synthesis_drills
  add constraint synthesis_drills_link_count_check
  check (link_count between 0 and 8);
alter table public.synthesis_drills
  add constraint synthesis_drills_last_links_covered_check
  check (last_links_covered is null or last_links_covered between 0 and 8);

-- ── 3. Attempts: plan mode, longer answers, the band ──────────────
do $$
declare
  con record;
begin
  for con in
    select conname
      from pg_constraint
     where conrelid = 'public.synthesis_attempts'::regclass
       and contype = 'c'
       and (
         pg_get_constraintdef(oid) ilike '%mode%'
         or pg_get_constraintdef(oid) ilike '%word_count%'
       )
  loop
    execute format('alter table public.synthesis_attempts drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.synthesis_attempts
  add constraint synthesis_attempts_mode_check
  check (mode in ('outline', 'free', 'plan'));
alter table public.synthesis_attempts
  add constraint synthesis_attempts_word_count_check
  check (word_count between 1 and 400);
alter table public.synthesis_attempts
  add column if not exists band text
    check (band is null or band in ('developing', 'secure', 'strong'));

-- ── 4. The recording RPC learns the band ──────────────────────────
create or replace function public.record_synthesis_attempt(
  p_drill_id uuid,
  p_deck_id uuid,
  p_client_attempt_id uuid,
  p_attempt jsonb,
  p_schedule jsonb,
  p_pull_forward_card_ids uuid[],
  p_pull_forward_not_after timestamptz
)
returns table (attempt_id uuid, replayed boolean, pulled_forward_card_ids uuid[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing uuid;
  v_existing_pulled uuid[];
  v_attempt uuid;
  v_pulled uuid[] := '{}';
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object'
     or p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'Malformed attempt payload.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_drill_id::text));

  if not exists (
    select 1 from public.synthesis_drills d
     where d.id = p_drill_id and d.deck_id = p_deck_id and d.user_id = v_user_id and d.status = 'active'
  ) then
    raise exception 'Drill not found or access denied.';
  end if;

  if p_client_attempt_id is not null then
    select a.id, a.pulled_forward_card_ids
      into v_existing, v_existing_pulled
      from public.synthesis_attempts a
     where a.drill_id = p_drill_id
       and a.client_attempt_id = p_client_attempt_id
       and a.user_id = v_user_id;
    if v_existing is not null then
      return query select v_existing, true, coalesce(v_existing_pulled, '{}'::uuid[]);
      return;
    end if;
  end if;

  if coalesce(array_length(p_pull_forward_card_ids, 1), 0) > 0 and p_pull_forward_not_after is not null then
    with moved as (
      update public.cards c
         set next_review_at = p_pull_forward_not_after
       where c.deck_id = p_deck_id
         and c.state = 'review'
         and c.id = any(p_pull_forward_card_ids)
         and c.next_review_at > p_pull_forward_not_after
      returning c.id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_pulled from moved;
  end if;

  insert into public.synthesis_attempts (
    drill_id, deck_id, user_id, mode, response, word_count, duration_ms, verdict,
    coverage, contradictions, outside_claims, structure, gap_note,
    missing_card_ids, contradicted_card_ids, pulled_forward_card_ids,
    integrity, model, usage, confidence, client_attempt_id, revision_of, band
  )
  select p_drill_id, p_deck_id, v_user_id,
         a.mode, a.response, a.word_count, coalesce(a.duration_ms, 0), a.verdict,
         coalesce(a.coverage, '[]'::jsonb), coalesce(a.contradictions, '[]'::jsonb),
         coalesce(a.outside_claims, '[]'::jsonb), coalesce(a.structure, '{}'::jsonb), coalesce(a.gap_note, ''),
         coalesce(a.missing_card_ids, '{}'::uuid[]), coalesce(a.contradicted_card_ids, '{}'::uuid[]), v_pulled,
         coalesce(a.integrity, '{}'::jsonb), a.model, coalesce(a.usage, '{}'::jsonb), a.confidence,
         p_client_attempt_id, a.revision_of, a.band
    from jsonb_to_record(p_attempt) as a(
         mode text, response jsonb, word_count integer, duration_ms integer, verdict text,
         coverage jsonb, contradictions jsonb, outside_claims jsonb, structure jsonb, gap_note text,
         missing_card_ids uuid[], contradicted_card_ids uuid[], integrity jsonb, model text, usage jsonb,
         confidence smallint, revision_of uuid, band text)
  returning id into v_attempt;

  update public.synthesis_drills d
     set step = (p_schedule->>'step')::smallint,
         next_due_at = (p_schedule->>'next_due_at')::timestamptz,
         attempt_count = d.attempt_count + 1,
         last_verdict = p_attempt->>'verdict',
         last_attempt_at = now(),
         last_links_covered = nullif(p_schedule->>'last_links_covered', '')::smallint,
         updated_at = now()
   where d.id = p_drill_id
     and d.user_id = v_user_id;

  return query select v_attempt, false, v_pulled;
end;
$$;

revoke all on function public.record_synthesis_attempt(uuid, uuid, uuid, jsonb, jsonb, uuid[], timestamptz) from public;
grant execute on function public.record_synthesis_attempt(uuid, uuid, uuid, jsonb, jsonb, uuid[], timestamptz) to authenticated;

-- ── 5. The question bank (D16) ────────────────────────────────────
create table if not exists public.synthesis_questions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 10 and 600),
  source text not null default 'paper' check (source in ('paper', 'generated')),
  -- The cards the question was mapped to, most similar first, and the
  -- concepts the generator said the question needs that the deck lacks.
  mapped_card_ids uuid[] not null default '{}',
  missing_concepts text[] not null default '{}',
  -- The plan drill made from this question, once one exists.
  drill_id uuid references public.synthesis_drills(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists synthesis_questions_deck_idx
  on public.synthesis_questions (user_id, deck_id, created_at desc);

alter table public.synthesis_questions enable row level security;

drop policy if exists "Users can view their own synthesis questions" on public.synthesis_questions;
create policy "Users can view their own synthesis questions"
  on public.synthesis_questions for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own synthesis questions" on public.synthesis_questions;
create policy "Users can insert their own synthesis questions"
  on public.synthesis_questions for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.decks d where d.id = synthesis_questions.deck_id and d.user_id = (select auth.uid()))
  );

drop policy if exists "Users can update their own synthesis questions" on public.synthesis_questions;
create policy "Users can update their own synthesis questions"
  on public.synthesis_questions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own synthesis questions" on public.synthesis_questions;
create policy "Users can delete their own synthesis questions"
  on public.synthesis_questions for delete
  using ((select auth.uid()) = user_id);
