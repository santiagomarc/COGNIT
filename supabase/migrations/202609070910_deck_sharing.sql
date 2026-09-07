-- ===================================================================
-- Migration: 202609070910_deck_sharing.sql
-- Task 4.1 — deck sharing via unguessable token.
--
-- Design constraints:
--   · A share link must work for a LOGGED-OUT visitor. That is the whole point.
--   · Sharing must never expose the owner's study data — only card content.
--   · Revocation must be instant and must not require deleting the deck.
--
-- SECURITY REVIEW. These are the first policies in the schema that widen read
-- access beyond the owner, so read this before changing them:
--
--   · Both new SELECT policies require `is_public = true AND share_token IS NOT
--     NULL`. Two flags, not one, so that (a) revoking sharing does not
--     invalidate the token and (b) a stray is_public write cannot expose a deck
--     that has no token.
--   · study_logs, quiz_results, quiz_card_results, card_mastery_state and
--     deck_chat_* policies are deliberately UNTOUCHED. A visitor sees card text
--     and nothing whatsoever about how the owner studied.
-- ===================================================================

alter table public.decks
  add column if not exists share_token text unique,
  add column if not exists shared_at timestamptz,
  add column if not exists clone_count integer not null default 0;

create index if not exists decks_share_token_idx
  on public.decks (share_token)
  where share_token is not null;

-- ── Public read policies ────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'decks'
      and policyname = 'Anyone can view shared decks'
  ) then
    create policy "Anyone can view shared decks"
      on public.decks for select
      using (is_public = true and share_token is not null);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cards'
      and policyname = 'Anyone can view cards in shared decks'
  ) then
    create policy "Anyone can view cards in shared decks"
      on public.cards for select
      using (
        exists (
          select 1 from public.decks
          where decks.id = cards.deck_id
            and decks.is_public = true
            and decks.share_token is not null
        )
      );
  end if;
end $$;

-- ── Enable / rotate / revoke sharing ────────────────────────────────
create or replace function public.set_deck_sharing(
  p_deck_id uuid,
  p_enabled boolean,
  p_rotate boolean default false
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_found boolean;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select share_token, true into v_token, v_found
  from public.decks
  where id = p_deck_id and user_id = v_user_id;

  if not coalesce(v_found, false) then
    raise exception 'Deck not found or access denied.';
  end if;

  if p_enabled and (v_token is null or p_rotate) then
    -- 32 hex chars ~ 128 bits of entropy. Not guessable, safe in a URL.
    v_token := encode(gen_random_bytes(16), 'hex');
  end if;

  update public.decks
  set is_public   = p_enabled,
      share_token = case when p_enabled then v_token else share_token end,
      shared_at   = case when p_enabled and shared_at is null then now() else shared_at end,
      updated_at  = now()
  where id = p_deck_id and user_id = v_user_id;

  return case when p_enabled then v_token else null end;
end;
$$;

revoke all on function public.set_deck_sharing(uuid, boolean, boolean) from public;
grant execute on function public.set_deck_sharing(uuid, boolean, boolean) to authenticated;

-- ── Clone a shared deck ─────────────────────────────────────────────
create or replace function public.clone_shared_deck(p_share_token text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source_id uuid;
  v_source_title text;
  v_source_description text;
  v_new_deck_id uuid;
  v_card_count integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to save a deck.';
  end if;

  select id, title, description
    into v_source_id, v_source_title, v_source_description
  from public.decks
  where share_token = p_share_token and is_public = true;

  if v_source_id is null then
    raise exception 'This deck is no longer shared.';
  end if;

  select count(*) into v_card_count from public.cards where deck_id = v_source_id;
  if v_card_count > 1000 then
    raise exception 'Deck is too large to clone (limit 1000 cards).';
  end if;

  insert into public.decks (user_id, title, description)
  values (v_user_id, v_source_title, v_source_description)
  returning id into v_new_deck_id;

  -- Copies CONTENT ONLY. SM-2 state, embeddings, mastery and history are
  -- deliberately excluded: the clone must start fresh for its new owner, and
  -- embeddings get regenerated on that user's own AI budget.
  insert into public.cards (
    deck_id, front, back, explanation, source, imported_by,
    mcq_distractors, id_question, topic_tags
  )
  select
    v_new_deck_id, front, back, explanation, 'bulk_import',
    'Cloned from a shared deck', mcq_distractors, id_question, topic_tags
  from public.cards
  where deck_id = v_source_id;

  update public.decks set clone_count = clone_count + 1 where id = v_source_id;

  return v_new_deck_id;
end;
$$;

revoke all on function public.clone_shared_deck(text) from public;
grant execute on function public.clone_shared_deck(text) to authenticated;
