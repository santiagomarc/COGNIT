-- ===================================================================
-- Per-account settings (COGNIT_SIDEBAR_SETTINGS_PLAN.md §3.1, DATA-01).
--
-- One row per user, written by the first save. A missing row means "every
-- default", so no backfill and no signup trigger. Only what must follow the
-- account across devices lives here: theme and sound/haptics stay in the
-- browser (plan §5.4, §5.6).
-- ===================================================================

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Null = derive it (resolveDisplayName). Trimmed and control-free in the app.
  display_name text
    check (display_name is null or char_length(display_name) between 1 and 40),
  -- Mirrors MIN/MAX_SESSION_CARD_COUNT and DEFAULT_SESSION_CARD_COUNT (src/lib/study.ts).
  session_card_count smallint not null default 10
    check (session_card_count between 5 and 50),
  -- Mirrors NEW_CARDS_PER_SESSION. Zero is allowed: reviews only.
  new_cards_per_session smallint not null default 5
    check (new_cards_per_session between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- All four commands (policy completeness, 202609060920), each reading
-- auth.uid() as an InitPlan (202609170950, assertion 13).
drop policy if exists "Users read their own settings" on public.user_settings;
create policy "Users read their own settings"
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own settings" on public.user_settings;
create policy "Users create their own settings"
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own settings" on public.user_settings;
create policy "Users update their own settings"
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- "Reset to defaults" deletes the row.
drop policy if exists "Users delete their own settings" on public.user_settings;
create policy "Users delete their own settings"
  on public.user_settings for delete
  to authenticated
  using ((select auth.uid()) = user_id);
