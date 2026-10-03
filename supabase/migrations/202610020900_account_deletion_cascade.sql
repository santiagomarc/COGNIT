-- ===================================================================
-- Account deletion reaches every row (COGNIT_SIDEBAR_SETTINGS_PLAN.md
-- §5.11, SET-10).
--
-- `decks` and `study_logs` were made in the dashboard before any migration
-- declared them, so the `create table if not exists ... on delete cascade`
-- in 20260305/20260402 never reached production: there both user_id foreign
-- keys are NO ACTION. Production assertion 18 found it on 2026-10-02. With
-- NO ACTION on decks, `auth.admin.deleteUser` fails for anyone who owns a
-- deck. study_logs would mostly go through its cards cascade, but not a row
-- whose card is already gone, so it cascades directly too.
--
-- Same constraint names, so a fresh replay (where the files already said
-- cascade) ends in the same state. Two statements per table rather than one
-- ALTER with two actions, so the drop is unambiguous before the add. Both
-- tables are small; the re-validation scan is brief.
-- ===================================================================

alter table public.decks drop constraint if exists decks_user_id_fkey;
alter table public.decks
  add constraint decks_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.study_logs drop constraint if exists study_logs_user_id_fkey;
alter table public.study_logs
  add constraint study_logs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
