-- Cross-deck semantic search: generalizes search_deck_cards_by_embedding to
-- scope by the requesting user's owned decks instead of a single deck.
-- Kept as a separate function (rather than making p_deck_id optional on the
-- existing one) so the deck-chat RAG path stays narrowly scoped on its own
-- index-friendly query shape.

create or replace function public.search_user_cards_by_embedding(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_limit integer default 8
)
returns table (
  id uuid,
  deck_id uuid,
  deck_title text,
  front text,
  back text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cards.id,
    cards.deck_id,
    decks.title as deck_title,
    cards.front,
    cards.back,
    1 - (cards.embedding <=> p_query_embedding) as similarity
  from public.cards
  join public.decks
    on decks.id = cards.deck_id
  where decks.user_id = auth.uid()
    and decks.user_id = p_user_id
    and cards.embedding is not null
  order by cards.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.search_user_cards_by_embedding(uuid, vector, integer) from public;
grant execute on function public.search_user_cards_by_embedding(uuid, vector, integer) to authenticated;
grant execute on function public.search_user_cards_by_embedding(uuid, vector, integer) to service_role;

-- Extend the ai_usage_logs action allow-list for the new rate-limited action.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ai_usage_logs'
  ) then
    alter table public.ai_usage_logs
      drop constraint if exists ai_usage_logs_action_check;

    alter table public.ai_usage_logs
      add constraint ai_usage_logs_action_check
      check (action in (
        'generate_cards',
        'enrich_cards',
        'sanitize_notes',
        'get_hint',
        'chat_with_deck',
        'sync_embeddings',
        'generate_mnemonic',
        'semantic_search'
      ));
  end if;
end $$;
