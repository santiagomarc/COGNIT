-- ===================================================================
-- Two reads for the sidebar and Settings (COGNIT_SIDEBAR_SETTINGS_PLAN.md
-- §3.2, DATA-02 and DATA-03). Both SECURITY INVOKER with a pinned
-- search_path (production assertions 2 and 3).
-- ===================================================================

-- ── Sidebar counts: trashed and shared decks, in one round trip ────
-- The restrictive "Trashed decks are hidden" policy (202609240900) hides
-- trashed rows; the transaction-local flag lifts it for this read only. The
-- owner policies still decide whose rows are visible, so this counts only the
-- caller's decks. The 30-day bound matches purge_expired_trash, so the badge
-- never counts a deck the trash page is about to purge on open.
create or replace function public.get_sidebar_counts()
returns table (trashed_count integer, shared_count integer)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  return query
    select (count(*) filter (
              where d.deleted_at is not null
                and d.deleted_at >= now() - interval '30 days'))::integer,
           (count(*) filter (
              where d.deleted_at is null
                and d.is_public = true
                and d.share_token is not null))::integer
      from public.decks d
     where d.user_id = (select auth.uid());
end;
$$;

-- ── AI usage over the window reserve_ai_call enforces ──────────────
-- Same sum as the daily ceiling in reserve_ai_call v2 (202609170900): calls,
-- not rows, over a rolling 24 hours. Reads through the existing owner SELECT
-- policy on ai_usage_logs and its (user_id, created_at desc) index.
create or replace function public.get_ai_usage_summary()
returns table (calls_used integer, oldest_call_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(coalesce((l.metadata->>'calls')::integer, 1)), 0)::integer,
         min(l.created_at)
    from public.ai_usage_logs l
   where l.user_id = (select auth.uid())
     and l.created_at >= now() - interval '24 hours';
$$;

-- Supabase's default privileges grant anon EXECUTE directly, so revoke it
-- from anon as well as public (as 202609270900 does).
revoke all on function public.get_sidebar_counts() from public, anon;
revoke all on function public.get_ai_usage_summary() from public, anon;
grant execute on function public.get_sidebar_counts() to authenticated;
grant execute on function public.get_ai_usage_summary() to authenticated;
