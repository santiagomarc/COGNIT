-- ===================================================================
-- Migration: 202609170980_record_synthesis_attempt.sql
-- Improvement plan §3.4 / §5.2 (SA-13, audit R8/R9).
--
-- The write side of a drill check — pull cards forward, insert the attempt,
-- advance the drill's ladder — was three statements from the action. Two
-- things could go wrong that the sequential idempotency check could not
-- catch: a concurrent replay (two tabs, a double-tap after a timeout) hit the
-- partial unique index AFTER paying for the model call and showed "could not
-- be saved"; and attempt_count was read-modify-write.
--
-- One SECURITY INVOKER function, one transaction, an advisory lock per drill:
--   1. the same client key returns the attempt it already produced;
--   2. otherwise the three writes happen together, and attempt_count is
--      incremented in SQL.
-- The model call stays OUTSIDE (the action calls this afterwards): a
-- transaction must never hold a lock across a network wait.
-- RLS still applies to every statement inside; `security invoker`.
-- ===================================================================

create or replace function public.record_synthesis_attempt(
  p_drill_id uuid,
  p_deck_id uuid,
  p_client_attempt_id uuid,          -- nullable for legacy clients
  p_attempt jsonb,                   -- the synthesis_attempts columns the action sets, minus ids
  p_schedule jsonb,                  -- { step, next_due_at, last_links_covered }
  p_pull_forward_card_ids uuid[],    -- candidates; the function decides which actually move
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

  -- One check at a time per drill: a second concurrent request waits here,
  -- then finds the first one's row instead of inserting its own.
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

  -- 1. Cards: pull forward, never push back (spec §8.4).
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

  -- 2. The immutable record, with what actually happened.
  insert into public.synthesis_attempts (
    drill_id, deck_id, user_id, mode, response, word_count, duration_ms, verdict,
    coverage, contradictions, outside_claims, structure, gap_note,
    missing_card_ids, contradicted_card_ids, pulled_forward_card_ids,
    integrity, model, usage, confidence, client_attempt_id, revision_of
  )
  select p_drill_id, p_deck_id, v_user_id,
         a.mode, a.response, a.word_count, coalesce(a.duration_ms, 0), a.verdict,
         coalesce(a.coverage, '[]'::jsonb), coalesce(a.contradictions, '[]'::jsonb),
         coalesce(a.outside_claims, '[]'::jsonb), coalesce(a.structure, '{}'::jsonb), coalesce(a.gap_note, ''),
         coalesce(a.missing_card_ids, '{}'::uuid[]), coalesce(a.contradicted_card_ids, '{}'::uuid[]), v_pulled,
         coalesce(a.integrity, '{}'::jsonb), a.model, coalesce(a.usage, '{}'::jsonb), a.confidence,
         p_client_attempt_id, a.revision_of
    from jsonb_to_record(p_attempt) as a(
         mode text, response jsonb, word_count integer, duration_ms integer, verdict text,
         coverage jsonb, contradictions jsonb, outside_claims jsonb, structure jsonb, gap_note text,
         missing_card_ids uuid[], contradicted_card_ids uuid[], integrity jsonb, model text, usage jsonb,
         confidence smallint, revision_of uuid)
  returning id into v_attempt;

  -- 3. The ladder, in SQL, so a concurrent check cannot lose an increment.
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
