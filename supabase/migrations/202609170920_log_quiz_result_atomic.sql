-- ===================================================================
-- Migration: 202609170920_log_quiz_result_atomic.sql
-- Improvement plan §5.2 (SA-12).
--
-- logQuizResult ran apply_quiz_sm2_batch (atomic) and then inserted the
-- quiz_results row and its quiz_card_results as two more statements. The
-- history tables are append-only (DENY update/delete), so a failure at the
-- third statement left a quiz_results row with no details — forever.
--
-- log_quiz_result wraps all three in one transaction. It delegates the card,
-- study_logs and mastery writes to apply_quiz_sm2_batch (unchanged) so the
-- two RPCs cannot drift, then writes the two history rows and returns the
-- quiz id. SECURITY INVOKER throughout: the INSERT policies on the history
-- tables still apply.
-- ===================================================================

create or replace function public.log_quiz_result(
  p_deck_id uuid,
  p_mode text,
  p_duration_ms integer,
  p_include_in_history boolean,
  p_updates jsonb,        -- apply_quiz_sm2_batch's p_updates, unchanged
  p_card_results jsonb    -- [{card_id, correct, prompt_text, correct_answer_text, user_answer_text}]
)
returns table (quiz_result_id uuid, created_at timestamptz, updated_cards integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated integer;
  v_total integer;
  v_correct integer;
  v_quiz_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_card_results is null or jsonb_typeof(p_card_results) <> 'array' or jsonb_array_length(p_card_results) = 0 then
    raise exception 'A quiz needs at least one result.';
  end if;

  if p_mode not in ('mcq', 'identification') then
    raise exception 'Unknown quiz mode.';
  end if;

  -- Ownership is checked inside; raises 'Deck not found or access denied.'
  v_updated := public.apply_quiz_sm2_batch(p_deck_id, p_updates);

  select count(*)::integer,
         count(*) filter (where (r->>'correct')::boolean)::integer
    into v_total, v_correct
    from jsonb_array_elements(p_card_results) r;

  insert into public.quiz_results (user_id, deck_id, mode, total_cards, correct_cards, duration_ms, include_in_history)
  values (v_user_id, p_deck_id, p_mode, v_total, v_correct, greatest(0, coalesce(p_duration_ms, 0)), coalesce(p_include_in_history, true))
  returning id, quiz_results.created_at into v_quiz_id, v_created_at;

  insert into public.quiz_card_results (quiz_result_id, card_id, correct, prompt_text, correct_answer_text, user_answer_text)
  select v_quiz_id,
         (r->>'card_id')::uuid,
         (r->>'correct')::boolean,
         r->>'prompt_text',
         r->>'correct_answer_text',
         r->>'user_answer_text'
    from jsonb_array_elements(p_card_results) r;

  return query select v_quiz_id, v_created_at, v_updated;
end;
$$;

revoke all on function public.log_quiz_result(uuid, text, integer, boolean, jsonb, jsonb) from public;
grant execute on function public.log_quiz_result(uuid, text, integer, boolean, jsonb, jsonb) to authenticated;
