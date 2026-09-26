-- supabase/migrations/202609240910_deck_copy_merge.sql   (requires 202609240900)

-- ── Duplicate ──────────────────────────────────────────────────────
create or replace function public.duplicate_deck(
  p_deck_id uuid,
  p_title text default null,
  p_keep_progress boolean default false
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text;
  v_description text;
  v_card_count integer;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  select d.title, d.description
    into v_title, v_description
    from public.decks d
   where d.id = p_deck_id
     and d.user_id = v_uid;

  if not found then
    raise exception 'Deck not found or access denied.';
  end if;

  select count(*) into v_card_count from public.cards where deck_id = p_deck_id;
  if v_card_count > 5000 then
    raise exception 'Deck is too large to duplicate (limit 5000 cards).';
  end if;

  insert into public.decks (user_id, title, description)
  values (
    v_uid,
    coalesce(nullif(btrim(p_title), ''), left(v_title, 113) || ' (copy)'),
    v_description
  )
  returning id into v_new_id;

  -- Content, enrichment and embeddings copy verbatim: they are this user's
  -- own and cost nothing to reuse. Scheduling resets to the column defaults
  -- unless the caller keeps progress. Absorption provenance points at
  -- attempts on the original deck, so it is not copied.
  if p_keep_progress then
    insert into public.cards (
      deck_id, front, back, explanation, source, imported_by, mcq_distractors,
      id_question, topic_tags, ai_hint, mnemonic, embedding,
      state, "interval", ease_factor, repetition_count, next_review_at, last_review_at
    )
    select v_new_id, c.front, c.back, c.explanation, c.source, c.imported_by, c.mcq_distractors,
           c.id_question, c.topic_tags, c.ai_hint, c.mnemonic, c.embedding,
           c.state, c."interval", c.ease_factor, c.repetition_count, c.next_review_at, c.last_review_at
      from public.cards c
     where c.deck_id = p_deck_id;
  else
    insert into public.cards (
      deck_id, front, back, explanation, source, imported_by, mcq_distractors,
      id_question, topic_tags, ai_hint, mnemonic, embedding
    )
    select v_new_id, c.front, c.back, c.explanation, c.source, c.imported_by, c.mcq_distractors,
           c.id_question, c.topic_tags, c.ai_hint, c.mnemonic, c.embedding
      from public.cards c
     where c.deck_id = p_deck_id;
  end if;

  return v_new_id;
end;
$$;

-- ── Merge ──────────────────────────────────────────────────────────
create or replace function public.merge_decks(p_source_id uuid, p_target_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owned integer;
  v_moved integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  if p_source_id = p_target_id then
    raise exception 'Choose two different decks.';
  end if;

  -- Lock both rows, in id order, so two merges cannot interleave.
  select count(*)
    into v_owned
    from (
      select d.id
        from public.decks d
       where d.id in (p_source_id, p_target_id)
         and d.user_id = v_uid
       order by d.id
         for update
    ) locked;

  if v_owned <> 2 then
    raise exception 'Deck not found or access denied.';
  end if;

  -- Cards keep their ids, so study_logs (keyed on card_id) follow them.
  update public.cards set deck_id = p_target_id where deck_id = p_source_id;
  get diagnostics v_moved = row_count;

  update public.card_mastery_state
     set deck_id = p_target_id
   where deck_id = p_source_id
     and user_id = v_uid;

  -- A drill's attempts are append-only (synthesis_attempts denies UPDATE),
  -- so a drill cannot be re-parented together with its history. Archive
  -- the source's drills; the merged deck generates new ones.
  update public.synthesis_drills
     set status = 'archived'
   where deck_id = p_source_id
     and user_id = v_uid
     and status = 'active';

  update public.decks set updated_at = now() where id = p_target_id;

  -- The emptied source goes to the trash for 30 days, keeping its quiz
  -- history, chat and drill attempts until it is purged.
  perform set_config('cognit.include_trashed', 'on', true);
  update public.decks
     set deleted_at = now(),
         is_public = false
   where id = p_source_id;

  return v_moved;
end;
$$;

revoke all on function public.duplicate_deck(uuid, text, boolean) from public;
revoke all on function public.merge_decks(uuid, uuid) from public;
grant execute on function public.duplicate_deck(uuid, text, boolean) to authenticated;
grant execute on function public.merge_decks(uuid, uuid) to authenticated;
