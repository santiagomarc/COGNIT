-- supabase/migrations/202609240930_explore_directory.sql

alter table public.decks add column if not exists listed_at timestamptz;

create index if not exists decks_listed_idx
  on public.decks (clone_count desc, listed_at desc)
  where listed_at is not null;

-- ── Owner: list or unlist ──────────────────────────────────────────
create or replace function public.set_deck_listing(p_deck_id uuid, p_listed boolean)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_listed_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform 1 from public.decks where id = p_deck_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Deck not found or access denied.';
  end if;

  update public.decks
     set listed_at = case when p_listed then coalesce(listed_at, now()) else null end
   where id = p_deck_id
     and user_id = (select auth.uid())
     and (not p_listed or (is_public = true and share_token is not null))
  returning listed_at into v_listed_at;

  if not found then
    raise exception 'Share the deck with a link before listing it.';
  end if;

  return v_listed_at;
end;
$$;

-- ── Anyone: browse ─────────────────────────────────────────────────
create or replace function public.list_public_decks(
  p_query text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  share_token text,
  title text,
  description text,
  card_count bigint,
  clone_count integer,
  listed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.share_token,
         d.title,
         d.description,
         (select count(*) from public.cards c where c.deck_id = d.id) as card_count,
         d.clone_count,
         d.listed_at
    from public.decks d
   where d.listed_at is not null
     and d.is_public = true
     and d.share_token is not null
     and (
       p_query is null
       or btrim(p_query) = ''
       or d.title ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by d.clone_count desc, d.listed_at desc, d.id
   limit greatest(1, least(coalesce(p_limit, 24), 48))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ── Reports ────────────────────────────────────────────────────────
create table if not exists public.deck_reports (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (deck_id, reporter_id)
);

-- The unique index leads with deck_id; reporter_id needs its own
-- (production-assertions.sql query 14: every FK has a leading index).
create index if not exists deck_reports_reporter_idx on public.deck_reports (reporter_id);

alter table public.deck_reports enable row level security;

drop policy if exists "Users can report listed decks" on public.deck_reports;
create policy "Users can report listed decks"
  on public.deck_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.decks d
       where d.id = deck_id
         and d.listed_at is not null
    )
  );

drop policy if exists "Reporters can view their own reports" on public.deck_reports;
create policy "Reporters can view their own reports"
  on public.deck_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on function public.set_deck_listing(uuid, boolean) from public;
revoke all on function public.list_public_decks(text, integer, integer) from public;
grant execute on function public.set_deck_listing(uuid, boolean) to authenticated;
grant execute on function public.list_public_decks(text, integer, integer) to anon, authenticated;

-- Auto-unlist on three reports since listing — pg_cron runs as postgres:
-- select cron.schedule('unlist-reported-decks', '*/15 * * * *', $$
--   update public.decks d
--      set listed_at = null
--    where d.listed_at is not null
--      and (select count(*) from public.deck_reports r
--            where r.deck_id = d.id and r.created_at > d.listed_at) >= 3
-- $$);
