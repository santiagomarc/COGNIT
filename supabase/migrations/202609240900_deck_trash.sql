-- supabase/migrations/202609240900_deck_trash.sql
-- ===================================================================
-- Soft delete with a 30-day trash (COGNIT_NEXT_HORIZON_PLAN.md §4.1a).
-- A RESTRICTIVE policy hides trashed decks; the cards own-deck policies
-- (202609170950) resolve through decks, so their cards vanish with them.
-- Only the RPCs below lift the filter, via a transaction-local flag — a UX
-- filter, not a security boundary: the owner policies still decide WHOSE
-- rows are visible. Everything stays SECURITY INVOKER.
-- ===================================================================

alter table public.decks add column if not exists deleted_at timestamptz;

create index if not exists decks_user_trash_idx
  on public.decks (user_id, deleted_at)
  where deleted_at is not null;

drop policy if exists "Trashed decks are hidden" on public.decks;
create policy "Trashed decks are hidden"
  on public.decks
  as restrictive
  for all
  to public
  using (
    deleted_at is null
    or (select coalesce(current_setting('cognit.include_trashed', true), '') = 'on')
  )
  with check (
    deleted_at is null
    or (select coalesce(current_setting('cognit.include_trashed', true), '') = 'on')
  );

-- ── Trash ──────────────────────────────────────────────────────────
create or replace function public.trash_deck(p_deck_id uuid)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  -- An UPDATE whose WHERE reads the row is also checked against the SELECT
  -- policies for the NEW row, which a trashed row fails without the flag.
  perform set_config('cognit.include_trashed', 'on', true);

  update public.decks
     set deleted_at = now(),
         is_public = false          -- a trashed deck stops being shared
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is null
  returning deleted_at into v_deleted_at;

  if v_deleted_at is null then
    raise exception 'Deck not found or access denied.';
  end if;

  return v_deleted_at;
end;
$$;

-- ── Restore ────────────────────────────────────────────────────────
create or replace function public.restore_deck(p_deck_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  update public.decks
     set deleted_at = null,
         updated_at = now()
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is not null;

  if not found then
    raise exception 'That deck is not in your trash.';
  end if;
end;
$$;

-- ── List ───────────────────────────────────────────────────────────
create or replace function public.list_trashed_decks()
returns table (
  id uuid,
  title text,
  deleted_at timestamptz,
  purge_after timestamptz,
  card_count bigint
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  perform set_config('cognit.include_trashed', 'on', true);

  return query
    select d.id,
           d.title,
           d.deleted_at,
           d.deleted_at + interval '30 days',
           (select count(*) from public.cards c where c.deck_id = d.id)
      from public.decks d
     where d.user_id = (select auth.uid())
       and d.deleted_at is not null
     order by d.deleted_at desc;
end;
$$;

-- ── Delete forever ─────────────────────────────────────────────────
create or replace function public.purge_deck(p_deck_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  -- Only a trashed deck can be purged; a live deck goes to the trash first.
  -- ON DELETE CASCADE removes its cards and history; referential actions
  -- bypass RLS, so the append-only deny policies do not block them.
  delete from public.decks
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is not null;

  if not found then
    raise exception 'That deck is not in your trash.';
  end if;
end;
$$;

-- ── Lazy expiry: called whenever the trash is opened ────────────────
create or replace function public.purge_expired_trash()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    return 0;
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  delete from public.decks
   where user_id = (select auth.uid())
     and deleted_at is not null
     and deleted_at < now() - interval '30 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.trash_deck(uuid) from public;
revoke all on function public.restore_deck(uuid) from public;
revoke all on function public.list_trashed_decks() from public;
revoke all on function public.purge_deck(uuid) from public;
revoke all on function public.purge_expired_trash() from public;

grant execute on function public.trash_deck(uuid) to authenticated;
grant execute on function public.restore_deck(uuid) to authenticated;
grant execute on function public.list_trashed_decks() to authenticated;
grant execute on function public.purge_deck(uuid) to authenticated;
grant execute on function public.purge_expired_trash() to authenticated;

-- Optional, once pg_cron is enabled (Dashboard → Integrations → Cron). It
-- runs as postgres, so RLS does not apply and accounts that never come back
-- are purged too. Kept out of `public`, so the assertions are unaffected.
-- select cron.schedule('purge-deck-trash', '17 3 * * *',
--   $$delete from public.decks where deleted_at < now() - interval '30 days'$$);
