# Runbook — Adding a database migration

Preview and production deployments share **one** Supabase database, so every migration has to
work with both the old and the new code. See decision D-DATA-4 in
[../decisions.md](../decisions.md).

**Only the project owner runs `supabase db push`.** Anyone can write a migration. Tell the
group before you commit one, so that two people don't take the same timestamp or edit the same
function.

## Steps

1. **Name it** `supabase/migrations/YYYYMMDDHHMM_short_name.sql`, using a timestamp later than
   every existing file.
2. **Write it expand-only:**
   - Add columns (nullable or defaulted), tables, functions, indexes and policies.
   - Never drop or rename in the same release.
   - A new policy must not narrow reads of existing rows.
3. **Follow the house rules for SQL:**
   - Enable RLS on every new table, with own-row policies.
   - RPCs are `security invoker`, have `set search_path = public` (or `''`), check ownership
     explicitly, `revoke all … from public`, and `grant execute … to authenticated`. Add
     `revoke execute … from anon` too unless the function is for signed-out callers: Supabase's
     defaults grant `anon` directly (assertion 19 in `production-assertions.sql` catches a miss).
   - Never use `security definer`. The assertion suite fails on it.
4. **Check the syntax locally:** `node scripts/sqlcheck.mjs supabase/migrations/<file>.sql`.
   This uses PostgreSQL's own parser; Docker isn't needed.
5. **Owner pushes:**
   - Dry run: `supabase db push --linked --dry-run`
   - Then: `supabase db push --linked`
6. **Regenerate types:** `npm run db:types`, then `npx tsc --noEmit`. Commit
   `src/lib/database.types.ts` with the migration. CI fails if the types drift.
7. **Verify:**
   - Run `npm run verify:deployment`.
   - Run `supabase/verify/production-assertions.sql` in the Supabase SQL editor. The listed
     queries must return zero rows.
8. **Ship the code** that uses the new objects, after the push. The database always leads.
9. **Contract later.** Drops wait until no deployment, previews included, references the old
   object.

Don't edit a migration that has already been applied. Write a new one.
