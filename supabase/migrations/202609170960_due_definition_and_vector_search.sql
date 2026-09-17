-- ===================================================================
-- Migration: 202609170960_due_definition_and_vector_search.sql
-- Improvement plan §5.1 (DB-04) and §5.2 (DB-05).
--
-- 1. ONE definition of "due". get_due_cards_by_deck counted every card whose
--    next_review_at <= now — which, because the column defaults to now(),
--    included every never-studied card. get_deck_schedule_breakdown (the deck
--    page) excluded state = 'new'. The dashboard band and the deck header
--    disagreed on every deck with unstudied cards.
--
--    Due now means: a card that has been studied and whose review is owed.
--    New cards are AVAILABLE, not due; they are returned separately as
--    new_count so the band can say "12 due · 8 new". A deck with new cards
--    and nothing due is not "clear" — it is a study-ahead target, and the
--    dashboard's fallback session link already handles that case.
--
-- 2. Cross-user vector search under a post-filter. HNSW returns ef_search
--    (default 40) nearest candidates GLOBALLY and only then applies
--    `decks.user_id = auth.uid()`. Past a few thousand vectors from other
--    users, a user's own cards fall outside the candidates and the palette's
--    semantic search returns 0–2 rows regardless of p_limit. pgvector ≥ 0.8's
--    iterative scan keeps pulling candidates until the filter yields enough;
--    on an older pgvector the setting is an inert placeholder. Per-deck
--    search (search_deck_cards_by_embedding) is not affected: the planner
--    uses the deck_id b-tree and sorts exactly.
-- ===================================================================

-- ── 1. Due = studied and owed; new counted beside it ───────────────
drop function if exists public.get_due_cards_by_deck(uuid, timestamptz);

create or replace function public.get_due_cards_by_deck(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table (deck_id uuid, due_count bigint, new_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cards.deck_id,
    count(*) filter (where cards.state <> 'new' and cards.next_review_at <= p_now)::bigint as due_count,
    count(*) filter (where cards.state = 'new')::bigint as new_count
  from public.cards
  join public.decks on decks.id = cards.deck_id
  where decks.user_id = (select auth.uid())
    and decks.user_id = p_user_id
    and (cards.state = 'new' or cards.next_review_at <= p_now)
  group by cards.deck_id
  having count(*) filter (where cards.state <> 'new' and cards.next_review_at <= p_now) > 0
      or count(*) filter (where cards.state = 'new') > 0
  order by due_count desc, new_count desc;
$$;

revoke all on function public.get_due_cards_by_deck(uuid, timestamptz) from public;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to authenticated;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to service_role;

-- ── 2. Cross-user vector search that survives the post-filter ──────
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
set hnsw.ef_search = 100
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
  where decks.user_id = (select auth.uid())
    and decks.user_id = p_user_id
    and cards.embedding is not null
  order by cards.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.search_user_cards_by_embedding(uuid, vector, integer) from public;
grant execute on function public.search_user_cards_by_embedding(uuid, vector, integer) to authenticated;
grant execute on function public.search_user_cards_by_embedding(uuid, vector, integer) to service_role;

-- Iterative scan exists from pgvector 0.8. On an older extension the GUC is
-- unknown and the ALTER would fail, so it is attempted separately: the
-- function above is correct either way, only less complete under a filter.
do $$
begin
  execute 'alter function public.search_user_cards_by_embedding(uuid, vector, integer) set hnsw.iterative_scan = ''relaxed_order''';
exception when others then
  raise notice 'hnsw.iterative_scan not available (pgvector < 0.8): %', sqlerrm;
end $$;
