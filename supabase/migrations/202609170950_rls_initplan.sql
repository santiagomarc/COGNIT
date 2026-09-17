-- ===================================================================
-- Migration: 202609170950_rls_initplan.sql
-- Improvement plan §5.1 (DB-01).
--
-- Not one policy in the schema wrapped auth.uid() as (select auth.uid()).
-- Bare, the planner treats the call as a per-row function; wrapped, it is an
-- InitPlan evaluated once per statement. On `cards` the cost was compounded:
-- the own-deck policies ran `exists (select 1 from decks …)` per card row.
--
-- Two passes:
--   1. The four `cards` own-deck policies are rewritten by hand to
--      `deck_id in (select id from decks where user_id = (select auth.uid()))`
--      — a hashed InitPlan, one scan of the user's decks per statement.
--   2. Every other policy that mentions a bare auth.uid() is rewritten
--      mechanically from pg_policies with ALTER POLICY, preserving its
--      command, roles, USING and WITH CHECK. Nothing about WHO can see WHAT
--      changes; only how often the check is evaluated.
--
-- The shared-deck policies ("Anyone can view …") have no auth.uid() term and
-- are untouched. production-assertions.sql query 13 pins the result.
-- ===================================================================

-- ── 1. cards: own-deck policies ────────────────────────────────────
drop policy if exists "Users can view cards in their own decks" on public.cards;
create policy "Users can view cards in their own decks"
  on public.cards for select
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())));

drop policy if exists "Users can insert cards in their own decks" on public.cards;
create policy "Users can insert cards in their own decks"
  on public.cards for insert
  with check (deck_id in (select id from public.decks where user_id = (select auth.uid())));

drop policy if exists "Users can update cards in their own decks" on public.cards;
create policy "Users can update cards in their own decks"
  on public.cards for update
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())))
  with check (deck_id in (select id from public.decks where user_id = (select auth.uid())));

drop policy if exists "Users can delete cards in their own decks" on public.cards;
create policy "Users can delete cards in their own decks"
  on public.cards for delete
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())));

-- ── 2. Everything else, mechanically ───────────────────────────────
do $$
declare
  pol record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (
         (qual is not null and qual like '%auth.uid()%' and qual not like '%( SELECT auth.uid()%' and qual not like '%(select auth.uid())%')
         or
         (with_check is not null and with_check like '%auth.uid()%' and with_check not like '%( SELECT auth.uid()%' and with_check not like '%(select auth.uid())%')
       )
  loop
    v_using := case when pol.qual is not null then replace(pol.qual, 'auth.uid()', '(select auth.uid())') end;
    v_check := case when pol.with_check is not null then replace(pol.with_check, 'auth.uid()', '(select auth.uid())') end;

    v_sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end $$;

-- ── 3. Verify ──────────────────────────────────────────────────────
-- Must return zero rows. (pg_policies deparses the wrapped form as
-- "( SELECT auth.uid() AS uid)", which both LIKE patterns above accept.)
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and (
       (qual is not null and regexp_replace(qual, '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%')
       or
       (with_check is not null and regexp_replace(with_check, '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%')
     );
  if v_count > 0 then
    raise exception 'rls_initplan: % polic(y/ies) still evaluate a bare auth.uid()', v_count;
  end if;
end $$;
