-- ===================================================================
-- Migration: 202609070900_phase25_corrections.sql
-- Corrections to the Phase 2 migrations. Written as a superseding
-- migration rather than edits in place, so it applies cleanly whether or
-- not 202609060920 / 202609060930 already ran somewhere.
-- ===================================================================

-- ── 1. get_due_cards_by_deck: restore the intended double-check ──────
--
-- 202609060920 shipped `where decks.user_id = coalesce(auth.uid(), p_user_id)`,
-- which INVERTS the intent of finding S-5: it creates a path that falls back
-- to trusting the caller-supplied id when auth.uid() is NULL. The point of the
-- finding was to add the `auth.uid()` check that the other nine RPCs carry.
-- Not exploitable today (SECURITY INVOKER, granted only to authenticated and
-- service_role) but it is the opposite of defence in depth.
create or replace function public.get_due_cards_by_deck(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table (deck_id uuid, due_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cards.deck_id,
    count(*)::bigint as due_count
  from public.cards
  join public.decks on decks.id = cards.deck_id
  where decks.user_id = auth.uid()
    and decks.user_id = p_user_id
    and cards.next_review_at <= p_now
  group by cards.deck_id
  order by due_count desc;
$$;

revoke all on function public.get_due_cards_by_deck(uuid, timestamptz) from public;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to authenticated;
grant execute on function public.get_due_cards_by_deck(uuid, timestamptz) to service_role;

-- ── 2. select_quiz_cards: add p_focus_unproven, add randomisation ────
--
-- Two defects in the 202609060930 version:
--   D4 The RPC had no focus-unproven mode, so the page filtered inside the
--      small fetched pool. The deck page advertises "Force include all
--      unproven cards (N)" with N = every unproven card in the deck, but the
--      pool holds at most ~20-100, so the promise could not be kept.
--   D5 Ordering was fully deterministic (next_review_at, created_at), so the
--      same top-N cards came back on every quiz until scheduling changed —
--      inviting positional memorisation instead of recall.
--
-- Dropping the 2-arg version first: adding a defaulted third parameter would
-- otherwise create an ambiguous overload rather than replacing it.
drop function if exists public.select_quiz_cards(uuid, integer);

create or replace function public.select_quiz_cards(
  p_deck_id uuid,
  p_limit integer default 20,
  p_focus_unproven boolean default false
)
returns table (
  id uuid,
  deck_id uuid,
  front text,
  back text,
  state text,
  "interval" integer,
  ease_factor double precision,
  repetition_count integer,
  mcq_distractors jsonb,
  id_question text,
  topic_tags jsonb,
  mnemonic text,
  next_review_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with owned as (
    select c.*
    from public.cards c
    where c.deck_id = p_deck_id
      and exists (
        select 1 from public.decks d
        where d.id = p_deck_id and d.user_id = auth.uid()
      )
  ),
  ranked as (
    select
      owned.*,
      case
        when p_focus_unproven then
          -- Focus mode: unproven cards first, everything else after.
          case when exists (
            select 1 from public.card_mastery_state m
            where m.user_id = auth.uid()
              and m.deck_id = p_deck_id
              and m.card_id = owned.id
              and m.correct
          ) then 1 else 0 end
        else
          -- Default: due cards, then unproven, then the rest.
          case
            when owned.next_review_at <= now() then 0
            when not exists (
              select 1 from public.card_mastery_state m
              where m.user_id = auth.uid()
                and m.deck_id = p_deck_id
                and m.card_id = owned.id
                and m.correct
            ) then 1
            else 2
          end
      end as priority
    from owned
  )
  -- Every column qualified: `interval` is also a Postgres type name, and an
  -- unqualified reference in a RETURNS TABLE projection is asking for trouble.
  select
    ranked.id,
    ranked.deck_id,
    ranked.front,
    ranked.back,
    ranked.state,
    ranked.interval AS "interval",
    ranked.ease_factor,
    ranked.repetition_count,
    to_jsonb(ranked.mcq_distractors),
    ranked.id_question,
    to_jsonb(ranked.topic_tags),
    ranked.mnemonic,
    ranked.next_review_at
  from ranked
  -- random() inside each priority tier: keeps the pedagogical ordering while
  -- varying which cards a repeat quiz actually draws.
  order by priority, random()
  limit greatest(1, least(coalesce(p_limit, 20), 500));
$$;

revoke all on function public.select_quiz_cards(uuid, integer, boolean) from public;
grant execute on function public.select_quiz_cards(uuid, integer, boolean) to authenticated;
grant execute on function public.select_quiz_cards(uuid, integer, boolean) to service_role;

-- ── 3. count_quiz_ready_cards ────────────────────────────────────────
--
-- The deck page paginates cards at 60 (P-3) but still needs deck-wide totals
-- for its "N/M quiz-ready" badge. Counting client-side over the paginated
-- slice reported "60/200" for a fully-enriched 200-card deck (D6).
create or replace function public.count_quiz_ready_cards(p_deck_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.cards c
  where c.deck_id = p_deck_id
    and c.id_question is not null
    and c.mcq_distractors is not null
    and array_length(c.mcq_distractors, 1) >= 3
    and exists (
      select 1 from public.decks d
      where d.id = p_deck_id and d.user_id = auth.uid()
    );
$$;

revoke all on function public.count_quiz_ready_cards(uuid) from public;
grant execute on function public.count_quiz_ready_cards(uuid) to authenticated;
grant execute on function public.count_quiz_ready_cards(uuid) to service_role;

-- ── 4. get_deck_topic_tag_counts ─────────────────────────────────────
--
-- Same pagination problem for the "Top Concepts" panel: it aggregated
-- topic_tags over the first 60 cards only.
create or replace function public.get_deck_topic_tag_counts(
  p_deck_id uuid,
  p_limit integer default 10
)
returns table (topic_tag text, tag_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    trim(tag) as topic_tag,
    count(*)::integer as tag_count
  from public.cards c
  cross join lateral unnest(c.topic_tags) as tag
  where c.deck_id = p_deck_id
    and c.topic_tags is not null
    and trim(tag) <> ''
    and exists (
      select 1 from public.decks d
      where d.id = p_deck_id and d.user_id = auth.uid()
    )
  group by trim(tag)
  order by tag_count desc, topic_tag asc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.get_deck_topic_tag_counts(uuid, integer) from public;
grant execute on function public.get_deck_topic_tag_counts(uuid, integer) to authenticated;
grant execute on function public.get_deck_topic_tag_counts(uuid, integer) to service_role;
