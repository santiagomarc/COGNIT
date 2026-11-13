-- supabase/migrations/202611130900_revoke_anon_rpcs.sql
-- ===================================================================
-- Signed-out clients may run exactly one of this project's functions:
-- `list_public_decks`, which the signed-out Explore page calls.
--
-- Supabase's default privileges grant EXECUTE on every new function in
-- `public` to `anon` directly, so `revoke all … from public` in the older
-- migrations never stopped an anonymous call. Each function's own
-- `auth.uid()` check or RLS still refused it (every one is SECURITY INVOKER),
-- so this was defense in depth, not an open door: an anonymous caller got
-- "Unauthorized" or an empty result. Now it gets "permission denied" before
-- the function body runs. The newer RPCs already revoked `anon` themselves
-- (202610010910, 202609270900, 202611100900); this closes the rest, 37
-- functions on 2026-11-13.
--
-- Written as a loop over the catalog so a signature (the `vector` ones in
-- particular) cannot be mistyped, and so it is idempotent. Extension-owned
-- functions (pgvector, pg_trgm) are left alone.
--
-- Expand-only in effect: nothing the app calls signed-out is revoked.
-- Verified against the code: the share page and keep-alive read tables (RLS),
-- not RPCs.
-- ===================================================================

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'list_public_decks'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from anon', fn.signature);
  end loop;
end
$$;

-- The next function a migration creates should not start life callable by
-- `anon`: Supabase's default privileges grant it, which is how the list above
-- grew. A function meant for signed-out callers now says so with its own grant,
-- as `list_public_decks` does. Applies to functions created by the migration
-- role from here on; existing ones were handled above.
alter default privileges in schema public revoke execute on functions from anon;
