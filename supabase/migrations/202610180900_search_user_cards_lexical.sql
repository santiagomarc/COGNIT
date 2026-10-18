-- ===================================================================
-- Card search by text (COGNIT_PERFORMANCE_PLAN.md §7.3, AI-12).
--
-- The command palette's only card search was semantic: an AI reservation, a
-- query embedding and a vector search for every query, finding only cards
-- that had an embedding. Typing a term you know is a text match, and Postgres
-- answers it without a model: this runs as you type, and "search by meaning"
-- stays a separate, explicit step.
--
-- `d.user_id = auth.uid()` is not redundant: RLS also lets a user read the
-- cards of any deck shared publicly (assertion 5), and a search box must only
-- find your own. Trashed decks are left out, as everywhere else.
-- ===================================================================

create extension if not exists pg_trgm with schema extensions;

-- Trigram indexes serve ILIKE '%…%'. Cheap at today's size; what keeps the
-- query fast past ~10k cards.
create index if not exists cards_front_trgm_idx on public.cards using gin (front extensions.gin_trgm_ops);
create index if not exists cards_back_trgm_idx on public.cards using gin (back extensions.gin_trgm_ops);

create or replace function public.search_user_cards_lexical(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  deck_id uuid,
  deck_title text,
  front text,
  back text
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    -- LIKE wildcards in the query are literal text, not patterns.
    select '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select c.id, c.deck_id, d.title, c.front, c.back
  from public.cards c
  join public.decks d
    on d.id = c.deck_id
   and d.user_id = (select auth.uid())
   and d.deleted_at is null
  cross join q
  where char_length(btrim(p_query)) >= 2
    and (c.front ilike q.pattern or c.back ilike q.pattern)
  -- A match in the term first, then the shorter (more specific) term.
  order by (c.front ilike q.pattern) desc, char_length(c.front), c.front
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.search_user_cards_lexical(text, integer) from public;
grant execute on function public.search_user_cards_lexical(text, integer) to authenticated;
grant execute on function public.search_user_cards_lexical(text, integer) to service_role;
