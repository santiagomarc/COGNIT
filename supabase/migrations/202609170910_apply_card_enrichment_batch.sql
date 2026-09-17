-- ===================================================================
-- Migration: 202609170910_apply_card_enrichment_batch.sql
-- Improvement plan §5.2 (SA-18).
--
-- enrichCards issued one UPDATE per enriched card — ~200 statements under RLS
-- for a large import. This is the sibling of apply_card_embeddings_batch:
-- the whole batch in one statement, ownership checked once.
-- ===================================================================

create or replace function public.apply_card_enrichment_batch(
  p_deck_id uuid,
  p_rows jsonb   -- [{"id":"…","mcq_distractors":["…","…","…"],"id_question":"…","topic_tags":["…"]}]
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
    from jsonb_to_recordset(p_rows)
      as r(id uuid, mcq_distractors text[], id_question text, topic_tags text[])
  ), applied as (
    update public.cards
       set mcq_distractors = enrichment.mcq_distractors,
           id_question = enrichment.id_question,
           topic_tags = enrichment.topic_tags
      from enrichment
     where cards.id = enrichment.id
       and cards.deck_id = p_deck_id
    returning 1
  )
  select count(*) into v_count from applied;

  return v_count;
end;
$$;

revoke all on function public.apply_card_enrichment_batch(uuid, jsonb) from public;
grant execute on function public.apply_card_enrichment_batch(uuid, jsonb) to authenticated;
grant execute on function public.apply_card_enrichment_batch(uuid, jsonb) to service_role;
