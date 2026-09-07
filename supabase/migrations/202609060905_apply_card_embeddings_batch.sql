-- ===================================================================
-- Migration: 202609060905_apply_card_embeddings_batch.sql
-- Findings P-4, P-6.
--
-- syncEmbeddings issued one UPDATE per card — up to 200 round trips per
-- invocation, and the client loops until nothing is pending. This applies the
-- whole batch in a single statement.
-- ===================================================================

create or replace function public.apply_card_embeddings_batch(
  p_deck_id uuid,
  p_updates jsonb            -- [{"card_id":"…","embedding":"[0.1,…]"}]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array'
     or jsonb_array_length(p_updates) = 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.decks
    where decks.id = p_deck_id and decks.user_id = v_user_id
  ) then
    raise exception 'Deck not found or access denied.';
  end if;

  with updates as (
    select * from jsonb_to_recordset(p_updates) as u(card_id uuid, embedding text)
  ), applied as (
    update public.cards
    set embedding = updates.embedding::vector(768)
    from updates
    where cards.id = updates.card_id
      and cards.deck_id = p_deck_id
    returning 1
  )
  select count(*) into v_count from applied;

  return v_count;
end;
$$;

revoke all on function public.apply_card_embeddings_batch(uuid, jsonb) from public;
grant execute on function public.apply_card_embeddings_batch(uuid, jsonb) to authenticated;
grant execute on function public.apply_card_embeddings_batch(uuid, jsonb) to service_role;

-- The sync query is: deck_id = ? AND embedding IS NULL ORDER BY created_at.
-- Without this partial index, cards_deck_id_created_at_idx forces a filter over
-- every card in the deck on each of the (many) sync calls.
create index if not exists cards_deck_pending_embedding_idx
  on public.cards (deck_id, created_at)
  where embedding is null;
