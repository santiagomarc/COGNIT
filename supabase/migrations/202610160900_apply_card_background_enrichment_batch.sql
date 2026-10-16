-- ===================================================================
-- Background enrichment in one statement (COGNIT_PERFORMANCE_PLAN.md §5.3).
--
-- Enrichment no longer runs where the user waits: quiz options fall back to
-- the deck's other terms and identification prompts to the masked
-- description (AI-09), so a card is quizzable the moment it exists. A
-- background job then writes the AI's distractors (still better than the
-- deck's, per the B.6 review) and topic tags, after the response (PERF-10).
--
-- apply_card_enrichment_batch cannot be reused: it sets the identification
-- question too, and nulls it for rows that don't carry one. This writes only
-- what each row brings — a non-empty tag set, exactly three distractors —
-- and leaves every other column alone. One statement, ownership checked once.
-- ===================================================================

create or replace function public.apply_card_background_enrichment_batch(
  p_deck_id uuid,
  p_rows jsonb   -- [{"id":"…","topic_tags":["…"],"mcq_distractors":["…","…","…"]}]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.decks
    where decks.id = p_deck_id and decks.user_id = v_user_id
  ) then
    raise exception 'Deck not found or access denied.';
  end if;

  with enrichment as (
    select *
    from jsonb_to_recordset(p_rows) as r(id uuid, topic_tags text[], mcq_distractors text[])
  ), applied as (
    update public.cards
       set topic_tags = case when cardinality(enrichment.topic_tags) > 0
                             then enrichment.topic_tags else cards.topic_tags end,
           mcq_distractors = case when cardinality(enrichment.mcq_distractors) = 3
                                  then enrichment.mcq_distractors else cards.mcq_distractors end
      from enrichment
     where cards.id = enrichment.id
       and cards.deck_id = p_deck_id
       and (cardinality(enrichment.topic_tags) > 0 or cardinality(enrichment.mcq_distractors) = 3)
    returning 1
  )
  select count(*) into v_count from applied;

  return v_count;
end;
$$;

revoke all on function public.apply_card_background_enrichment_batch(uuid, jsonb) from public;
grant execute on function public.apply_card_background_enrichment_batch(uuid, jsonb) to authenticated;
grant execute on function public.apply_card_background_enrichment_batch(uuid, jsonb) to service_role;
