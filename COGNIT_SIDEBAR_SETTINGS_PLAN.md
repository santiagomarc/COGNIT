# Cognit — Sidebar, Account and Settings Plan

**Revision:** 1.0 · 2026-09-30.
**Baseline:** `main` @ `bc66b1d`. The only untracked file is `COGNIT_UIUX_PLAN_PROMPT.md`, which this plan does not touch.
**Scope:** build the approved mockups (the full sidebar, the account menu and the Settings page) and everything they need in order to work: one table, two RPCs, four new routes, one API route, seven server actions, a design-system revision, and the tests and gates.
**Approved design:** the canvas at https://claude.ai/artifact/2WkK4ZUGKHwVv5HAFJR1Kq, page **"2 · Full sidebar"**: board 1 (the sidebar on Today, account menu open) and board 2 (Settings). Page "1 · Search placement" is superseded except where §2 says otherwise.
**Companions:** `COGNIT_DESIGN_SYSTEM.md` (Rev. D; this plan writes Rev. E, Appendix B) · `COGNIT_NEXT_HORIZON_PLAN.md` (house style; its §1.2.1 push sequence and §7 standing rules apply unchanged).

---

## How to read this document

- **§0** is the one-page answer. **§1** says what the code does today. **§2** lists the decisions this plan has already taken. **§3–§6** are the four phases, each ending in a gate. **§7** holds the gates, the deploy sequence and the standing rules. The appendices hold the evidence, the Rev. E text, two ready-to-apply patches, and what is deliberately left out.
- Task IDs: **DATA** (schema and reads), **DST** (new destinations), **SET** (Settings), **NAV** (the shell), **DSR** (design system). None reuses an ID from the Next Horizon plan.
- Every `file:line` refers to `bc66b1d`.
- The code in **Appendix C1** (Phase 0) and **Appendix C2** (the palette and shortcuts) is written, compiled and tested; the tasks that use it say so. Component work in §4–§6 is specified rather than pre-written: file, layout, markup contract, states, copy and checks.
- Phases run in this order so that **every push to `main` can deploy on its own**: the data lands first, then the pages the sidebar will link to, then Settings, and the sidebar switch lands last, when everything it links to exists.

### Evidence standard

| Question | Method |
|---|---|
| What exists today? | Read every file §1 names, at `bc66b1d`. |
| Does the SQL parse? | `scripts/sqlcheck.mjs` (PostgreSQL's own parser, libpg_query) on both migrations and on assertion 18. A deliberate `retrun` typo fails with exit 1. |
| Does the Phase 0 code work? | Appendix C1 applied to an APFS clone of `bc66b1d`: `tsc` clean · ESLint 0 problems · **554 tests in 53 files**, all green (491 baseline + 63) · `next build` ✓ · `git apply --check` clean against this repo. |
| Does Appendix C2 work? | C1 + C2 on a fresh clone: `tsc` clean · ESLint 0 · **559 tests in 54 files**. One test is red **by design** until SET-06 adds the two shortcut owners it checks for (§5.7). With those two owners stubbed it passes (5/5). C2 also applies cleanly on its own. |
| Types for the new objects | The clone used hand-written types for `user_settings` and the two RPCs, only so it could compile. The repo gets them from `npm run db:types` after the push, per the standing rule. |
| What could not be verified | Anything behind a sign-in (this session had no test account); the Supabase SQL editor (assertion 18 must be run before SET-10 ships); the Vercel environment; an Anki import of the all-decks file; the UI itself. Each gate lists the manual check that covers it. |

---

## 0. Executive summary

### 0.1 What ships

| Area | Today (`bc66b1d`) | After this plan |
|---|---|---|
| Navigation | A 48 px icon rail (Decks, Stats, Search, account, expand) plus a header "Search ⌘K" button | A 256 px sidebar: Search, New deck, **Study** (Today · Drills · Statistics) and **Library** (your decks · Shared · Explore · Trash), then the account row. It collapses to a 48 px rail, and becomes a drawer on phones. |
| Search | The header button and the rail icon both open the ⌘K palette; there's also a "Filter decks" box above the deck table | One Search control, at the top of the sidebar, opening the same palette. The header button and the filter box are gone. |
| Account | A sheet with the email, a theme toggle and Sign out | An account menu: name and email, Profile, Settings, Keyboard shortcuts, Dark/Light/System, AI calls in the last 24 hours, Sign out |
| Settings | None | `/dashboard/settings`: Profile, Sign-in & security, Appearance, Study, Sound & haptics, Keyboard shortcuts, AI usage & privacy, Sharing, Export & trash, Delete account |
| New pages | — | `/dashboard/drills`, `/dashboard/shared`, `/dashboard/trash`, and `GET /api/export` (every deck in one CSV or Anki file) |
| Data | Nothing account-scoped | `user_settings` (display name, cards per session, new cards per session) · `get_sidebar_counts()` · `get_ai_usage_summary()` |

### 0.2 Found while planning, and it changes how this is built

1. **Any new palette effect signs the user out.** `runEffect` handles `toggle-theme` and `new-deck`, then falls through to `void logout()` (`CommandPalette.tsx:170`). Adding "Keyboard shortcuts" as-is would have made it a sign-out button. SET-11 makes the switch exhaustive, with a `never` branch (Appendix C2).
2. **⌘N works only on Today.** Its listener lives in `CreateDeckPanel` (`CreateDeckPanel.tsx:45–52`), which only Today renders. The sidebar shows ⌘N on every page, so SET-06 moves the listener to `CreateDeckModal`, which the shell mounts once.
3. **No account-scoped settings exist.** Theme (`cognit-theme`) and sound/haptics (`cognit-feedback-prefs`) live in `localStorage`. The sound and haptics toggles exist only on the quiz screen (`QuizAssessmentClient.tsx:665, 677`). The display name is always derived (`display-name.ts`). DATA-01 adds `user_settings` for the values that must follow the account.
4. **The "daily" AI limit is a rolling 24 hours** (`202609170900`, line 58), and users can't see their usage. The limit message says it "resets 24 hours after your first request today" (`_shared.ts:119`), which is not what happens. SET-07 shows usage and corrects the copy.
5. **Anyone can read any shared deck.** The sharing SELECT policy is `is_public = true and share_token is not null` (`202609070910`). A "my shared decks" query must therefore filter `user_id` itself. DST-02 does, and so does `get_sidebar_counts`.
6. **Account deletion has no path.** There is no service-role key in `src/` or `scripts/`, and production assertion 2 forbids `SECURITY DEFINER`. SET-10 uses the Admin API from one server action, with the key server-only and optional.
7. **System theme costs nothing at the CSP.** The pre-paint script already reads a missing `cognit-theme` key as "follow the OS" (`theme-script.ts`). "System" is stored as the key's absence, so the script and its CSP hash don't change. `theme.test.ts` runs the real script to prove it.
8. **Hard-coded session sizes.** `?count=10` is written into `DashboardOnboarding.tsx:66` and `FlashcardReviewClient.tsx:722, 725`, which would bypass a "cards per session" setting. SET-04 removes it.
9. **Trash is hard to reach.** It's a closed `<details>` at the bottom of Today (`page.tsx:492`). DST-03 makes it a page, and the sidebar links to it from everywhere.

### 0.3 Roadmap

| Phase | Goal | Size | Exit gate |
|---|---|---|---|
| **0** | Data, reads, library code and server actions. Nothing visible changes. | ~1 day (Appendix C1 is the code) | S0 (§3.8) |
| **1** | Rev. E; the Drills, Shared and Trash pages; export all. Reachable by URL until Phase 3 links them. | 2–3 days | S1 (§4.7) |
| **2** | Settings; the shortcuts dialog; ⌘N everywhere; the palette's new commands (Appendix C2) | 3–4 days | S2 (§5.13) |
| **3** | The sidebar replaces the rail and the header search; account menu; mobile drawer; Today clean-up | 3–4 days | S3 (§6.10) |

Sizes are single-developer estimates and include the tests each task names. About 9–12 days in all.

---

## 1. What exists today

| Area | Where | What it does |
|---|---|---|
| Shell | `src/app/dashboard/(shell)/layout.tsx:46–95` | A flex row: `AmbientField`, `AppRail`, then a column with a sticky 48 px header (breadcrumb on the left; `ShellCommandPalette` and, below `md`, `AccountControl` on the right) and `#main-content`. It mounts `CreateDeckModal`. The deck list for the header streams behind two Suspense boundaries off `loadShellNav` (`src/lib/shell-nav.ts`). |
| Focus routes | `src/app/dashboard/(focus)/layout.tsx` | Study, quiz and synthesis have no chrome at all. **Unchanged by this plan.** |
| Rail | `src/components/ui/shared/AppRail.tsx`, `globals.css:1381–1511` | 48 px, collapsed by default and **deliberately not persisted**, because restoring it from storage would reflow after hydration. Desktop only. |
| Palette | `CommandPalette.tsx` (494 lines), `src/lib/command-palette.ts` | Renders its own "Search ⌘K" trigger (line 314). Commands: start session, decks, stats, new deck, theme, sign out, then one row per deck, then cross-deck semantic card search. |
| Account | `AccountControl.tsx` | A modal sheet: "Signed in as", the email, Appearance (`ThemeToggle`, dark/light only), Sign out. |
| Theme | `theme-script.ts`, `ThemeProvider.tsx` | The pre-paint script is allowed by hash in the CSP. The provider stores `dark` or `light`; with nothing stored it follows the OS once, at load. |
| Today | `(shell)/page.tsx` | Greeting (`resolveDisplayName`), due band, create panel, signal panel, deck grid (with `DashboardSearch` "Filter decks", `DeckGrid.tsx:151`), `TrashPanel` (line 492). |
| Study size | `src/lib/study.ts` | `DEFAULT_SESSION_CARD_COUNT` 10, range 5–50, `NEW_CARDS_PER_SESSION` 5. The study page's new-card allowance is `max(5, count − scheduled)` (`study/page.tsx:106`). |
| Sharing | `202609070910`, `202609240930`, `actions/share.ts`, `ShareDeckButton.tsx` | One token per deck. Turning sharing off keeps the token, so turning it back on restores the same link. Directory listing sits behind `EXPLORE_ENABLED`. |
| Trash | `202609240900`, `actions/deck-lifecycle.ts`, `TrashPanel.tsx` | A restrictive policy hides trashed decks. The RPCs lift it with a transaction-local flag. Purge happens after 30 days, on listing. |
| Export | `api/decks/[deckId]/export/route.ts`, `src/lib/deck-export.ts` | Per-deck CSV and Anki (`#deck:` header), streamed 1,000 rows at a time. |
| Drills | `loadDueDrillsByDeck` (`synthesis/loaders.ts:657`) | Due drills by deck, capped read, used by Today's due band only. |
| AI budget | `_shared.ts:68`, `reserve_ai_call` v2 | 300 calls per rolling 24 hours, per user, counted in `ai_usage_logs.metadata.calls`. The owner can SELECT their own rows. |
| Auth | `auth/actions.ts` | Email and password, Google, GitHub. `resetPassword` emails a link to `/login/update-password`. `logout()` is a local sign-out. |
| Tests | Vitest 4, node environment | 491 tests in 47 files, all library and action tests. No UI harness (Next Horizon §5 seed S5). |

---

## 2. Decisions this plan takes

The owner approved the mockups; these are the choices the mockups left open. Each has a default, and the owner can override any of them before the phase that uses it.

| # | Decision | Why |
|---|---|---|
| D1 | The sidebar's Search control **opens the existing ⌘K palette**, as in mockup A. In-sidebar results (mockup C) are not in this plan. | The palette already does commands, decks and semantic card search with a tested keyboard model. C would duplicate it and add a Gemini embedding call per query into a narrow column. See Appendix D. |
| D2 | The header "Search ⌘K" button and Today's "Filter decks" box are **removed**. Sort stays. | One way to search. The palette lists every deck, which is what the filter box did. |
| D3 | "Decks" is renamed **"Today"** in the sidebar, the breadcrumb, the palette and the page title. | "Decks" now names the Library list. The page is the day's work, not the index. |
| D4 | **Per-account:** display name, cards per session, new cards per session (`user_settings`). **Per-browser:** theme and sound/haptics (`localStorage`, as now). | Study defaults and your name should follow you. Theme and vibration are properties of the device: a phone can be light while a laptop is dark. |
| D5 | Settings is **one scrolling page with anchored sections**, not ten routes. | It's a list of small controls. Anchors keep it one server render, and the sidebar lists the sections. |
| D6 | Sidebar widths: **256 px** expanded, **48 px** collapsed. With no stored choice it is collapsed at 768–1023 px and expanded from 1024 px, decided by CSS. A user's choice is stored in a cookie the server reads. | The server can render the stored state, so there's no reflow after hydration: the reason design system §8 forbade persisting the rail. |
| D7 | Phones get **a drawer**, opened from a header button. Still **no bottom bar**. | Design system §8: the grade deck owns the bottom band on focus routes, and those routes have no chrome at all. |
| D8 | Account deletion goes through the **Supabase Admin API** from one server action, using an **optional** `SUPABASE_SERVICE_ROLE_KEY`, set in Vercel **Production only**. Without the key, Settings says deletion is unavailable. | Production assertion 2 forbids `SECURITY DEFINER`. Preview deployments share the production database, so they must not hold a key that deletes users. |
| D9 | **No ⌘, binding** for Settings (the mockup's menu showed one). | Browsers reserve ⌘, for their own preferences on macOS. A keycap the product can't honour breaks design system §11 item 7. |
| D10 | **Explore** appears in the sidebar only when `EXPLORE_ENABLED === 'true'`. | `/explore` is `notFound()` without the flag. |
| D11 | The Shared page and Settings → Sharing render **one component**, `SharedDeckList`. | One place to copy a link or turn it off. |
| D12 | Settings, Shared and Trash have **no `.raised`** object. Drills has one: the launcher. Rev. E records this. | Design system §1b's "exactly one" assumes a screen has a primary object. A list of controls doesn't. |

---

## 3. Phase 0 — Data and library (no visible change)

Everything in this phase is in **Appendix C1**: the two migrations, the library modules and their tests, the loaders, the server actions, the deployment probes and assertion 18. The tasks below say what each part is and why. §3.7 is the sequence that applies it.

### 3.1 DATA-01 — `user_settings`

One row per user, **written by the first save**. A missing row means every default, so there's no backfill and no signup trigger. The columns and their CHECKs mirror `src/lib/user-settings.ts`, and a test reads the migration file to keep the two in step.

```sql
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
```

- **Policies:** all four commands, each reading `auth.uid()` as an InitPlan (assertion 13). Delete is included for policy completeness (`202609060920`); nothing in the UI deletes the row.
- **Why not `user_metadata`:** it rides in every JWT, the user can write it directly through `auth.updateUser`, and OAuth providers own keys in it. A table has CHECKs and RLS.

### 3.2 DATA-02 `get_sidebar_counts` · DATA-03 `get_ai_usage_summary`

```sql
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
```

- **`get_sidebar_counts`** is `volatile` because it calls `set_config`. It lifts the trash filter exactly as `list_trashed_decks` does. It filters on `user_id`, which matters for the shared count (§0.2 item 5). Its 30-day bound matches `purge_expired_trash`.
- **`get_ai_usage_summary`** repeats `reserve_ai_call`'s sum over the same window and uses the existing `(user_id, created_at desc)` index. `oldest_call_at` + 24 h is when the oldest call stops counting, which is all "resets" can honestly mean for a rolling window.
- Both revoke EXECUTE from `anon` (as `202609270900` does), so `verify:deployment` shows them as "guarded".

### 3.3 DATA-04 — Server loaders

All in C1:

| Loader | Where | What |
|---|---|---|
| `getUserSettings(userId)` | `src/lib/supabase/session.ts` | React `cache`d. One `maybeSingle()` on `user_settings`, then `settingsFromRow`. A failed read is logged and reads as defaults, so a settings outage can't take Today down. |
| `getDueDrills(userId)` | `session.ts` | `cache`d wrapper over `loadDueDrillsByDeck`, so the sidebar badge, Today's due band and the Drills page share one read per request, as `getDueByDeck` already does. |
| `SessionUser.providers` | `session.ts` | `app_metadata.providers` from the verified claims (`email`, `google`, `github`). Settings shows a password row only for `email`. |
| `loadSidebar(userId)` | `src/lib/shell-nav.ts` | `cache`d. One wave: `loadShellNav`, `getDueDrills`, `get_sidebar_counts`, `getUserSettings`. It returns the shell nav plus `counts` (`SidebarCounts`) and `settings`. Phase 3 renders it; until then nothing calls it. |

### 3.4 DATA-05 — Library modules

Pure modules, each with its own test file:

| Module | Contents |
|---|---|
| `src/lib/user-settings.ts` | `UserSettings`, defaults, `normalizeDisplayName` (strips control, zero-width and bidi characters; collapses whitespace), `displayNameSchema` (at most 40 code points, never an address: F-06), `studyDefaultsSchema` (5–50; 0–20), `settingsFromRow` (a bad row degrades to defaults, never to `NaN`). |
| `src/lib/sidebar-nav.ts` | `dashboardLocation` (Today, named route, deck, or outside), `sidebarMode`, `activeSidebarItem`, `activeDeckId`, `buildSidebarItems` (render order, badges, accessible count labels, and `due` tone only for due work), `sidebarDecks` (due first, then recency, capped at 12 with a hidden count), `SETTINGS_SECTIONS`, `SIDEBAR_COOKIE`, `parseSidebarPreference`. |
| `src/lib/ai-usage.ts` | `DAILY_AI_CALL_CEILING` (moved from `_shared.ts`, which imports the server session and so can't reach a client component; `_shared.ts` re-exports it) and `aiUsageReading`. |
| `src/lib/theme.ts` | `ThemePreference` (`dark`, `light`, `system`), `parseThemePreference`, `resolveTheme`, `storedThemeValue` (`system` → remove the key). The test executes the real `THEME_BOOTSTRAP` for all six combinations of preference and OS. |
| `src/lib/synthesis/links.ts` | `drillSessionHref`, lifted from Today (`page.tsx:402`) so the Drills page links identically. |
| `src/lib/study.ts` | `getSessionCardBounds(available, preferred)` and `normalizeSessionCardCount(raw, available, preferred)` take the account default; `?count=` still wins. `newCardAllowance(count, scheduled, perSession)` is the study page's formula with the constant made a parameter. |
| `src/lib/display-name.ts` | `resolveDisplayName(user, chosen?)`: a chosen name wins and is used whole, not cut to its first word. |
| `src/lib/deck-export.ts` | `CSV_HEADER_ALL`, `toCsvRowWithDeck`, `ankiHeaderAll` (`#deck column:5`), `toAnkiRowWithDeck`, `exportAllFilename`. GUIDs are unchanged, so exporting a deck and then everything never duplicates a note in Anki. |

### 3.5 DATA-06 — Settings actions and the admin client

`src/app/actions/settings.ts` holds seven actions, and `src/lib/supabase/admin.ts` holds the admin client:

| Action | Behaviour |
|---|---|
| `updateDisplayName(raw)` | Validates, then upserts `display_name` on conflict `user_id`. PostgREST writes only the columns sent, so the study defaults survive. Revalidates the `/dashboard` layout. An empty name saves `null`, which means derive it. |
| `updateStudyDefaults({ sessionCardCount, newCardsPerSession })` | Validates before any database call, then upserts both. |
| `resetStudyDefaults()` | Writes the defaults. |
| `getAiUsage()` | `get_ai_usage_summary` through `aiUsageReading`. Returns `{ used, ceiling, nextFreesAt }`. |
| `sendPasswordResetLink()` | Password accounts only. Calls the existing `resetPassword` with the session's email. |
| `signOutEverywhere()` | `signOut({ scope: 'global' })`, then redirects to `/login`. It isn't wrapped in `guardAction`, because `redirect` throws: the same reason `logout` isn't. |
| `deleteAccount({ confirmation })` | Requires the account email to be typed (case- and space-insensitive). Calls `auth.admin.deleteUser(id)`. On failure the user stays signed in and is told nothing was deleted. On success it clears local cookies and redirects to `/?account=deleted`. |

`createAdminClient()` returns `null` without the key, and `accountDeletionAvailable()` says whether it's set. A test walks `src/` and fails if anything other than `actions/settings.ts` imports the admin module.

### 3.6 DATA-07 — Deployment probes and assertion 18

- `scripts/verify-deployment.mjs` probes `get_sidebar_counts`, `get_ai_usage_summary` and the `user_settings` columns.
- `supabase/verify/production-assertions.sql` gains assertion 18, placed before its query-plan notes; 1–17 already exist. For every `user_id` and `reporter_id` column in `public`, it shows whether that column cascades from `auth.users` and which parents the table cascades from. A row passes when `on_delete = 'c'`, or when `cascades_from` names a parent that is removed with the user (`decks`, `cards`, a synthesis table). Otherwise SET-10 would leave orphaned rows. **Run it before SET-10 ships.** A failing row blocks SET-10 until a migration adds `on delete cascade`.

```sql
-- 18. Account deletion reaches every row (sidebar plan §5.11, SET-10).
--     Deleting an auth user must remove every row it owns. A row passes when
--     on_delete = 'c' (user_id cascades from auth.users), or when
--     cascades_from names a parent that is itself removed with the user
--     (decks, cards, a synthesis table). Anything else keeps rows after an
--     account is deleted and blocks SET-10 until a migration fixes it.
select cl.relname as table_name,
       a.attname as column_name,
       coalesce(con.confdeltype::text, 'none') as on_delete,
       (select string_agg(ref.relname, ', ' order by ref.relname)
          from pg_constraint fk
          join pg_class ref on ref.oid = fk.confrelid
         where fk.conrelid = cl.oid
           and fk.contype = 'f'
           and fk.confdeltype = 'c') as cascades_from
from pg_attribute a
join pg_class cl on cl.oid = a.attrelid and cl.relkind = 'r'
join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
left join pg_constraint con
  on con.conrelid = cl.oid
 and con.contype = 'f'
 and a.attnum = any (con.conkey)
 and con.confrelid = 'auth.users'::regclass
where a.attname in ('user_id', 'reporter_id')
  and not a.attisdropped
order by on_delete, table_name;
```

### 3.7 Deployment sequence

The database leads the code (Next Horizon §1.2.1). Work on `main`.

1. Extract and apply Appendix C1:

```bash
awk '/<!-- patch:C1 -->/{m=1} m && /^```diff$/{f=1; next} f && /^```$/{exit} f' COGNIT_SIDEBAR_SETTINGS_PLAN.md > /tmp/cognit-sidebar-c1.patch
```

```bash
git apply --check /tmp/cognit-sidebar-c1.patch && git apply /tmp/cognit-sidebar-c1.patch
```

2. Check the SQL, dry-run, then push:

```bash
node scripts/sqlcheck.mjs supabase/migrations/202610010900_user_settings.sql supabase/migrations/202610010910_shell_reads.sql
```

```bash
supabase db push --linked --dry-run
```

```bash
supabase db push --linked
```

3. Regenerate the types. `tsc` fails before this step, because the loaders read `user_settings`.

```bash
npm run db:types && npx tsc --noEmit
```

4. Run the local gate:

```bash
npm run lint && npm test && npm run build
```

5. Commit and push. That deploys to production.
6. Probe production:

```bash
npm run verify:deployment
```

7. In the SQL editor, run `supabase/verify/production-assertions.sql`. Queries 1–3 and 12–15 must return zero rows (Next Horizon §1.2.1), and every row of 18 must pass (§3.6).

### 3.8 Gate S0

| Check | How | Pass |
|---|---|---|
| Types | `npm run db:types && npx tsc --noEmit` | clean; `database.types.ts` gains `user_settings`, `get_sidebar_counts`, `get_ai_usage_summary` |
| Unit | `npm test` | **554** tests in **53** files, all green |
| Lint and build | `npm run lint && npm run build` | 0 problems · build ✓ |
| Deployment | `npm run verify:deployment` | both RPCs "EXISTS (guarded)"; `user_settings` exists and anon sees 0 rows |
| Assertions | SQL editor | 1–3 and 12–15 zero rows · every row of 18 passes |
| No visible change | Open Today, a deck, Stats | identical to before |

---

## 4. Phase 1 — New destinations

Three pages and an API route. Until Phase 3 they are reachable **by URL only**. That lets each one be checked on production before the sidebar links it.

### 4.1 DSR-01 — Design system Rev. E

Paste **Appendix B** into `COGNIT_DESIGN_SYSTEM.md` **before any UI task below**. It is the contract this phase and the next two are checked against. It covers §1b's `.raised` rule (D12), three CSS marks and a minus sign in §6, §7.11 Sidebar, §7.12 Settings controls, the new §8 navigation, and §11 items 13–15.

### 4.2 DST-01 — Drills: `/dashboard/drills`

**Files:** `src/app/dashboard/(shell)/drills/page.tsx`, `drills/loading.tsx`, and `examLine` moved from `(shell)/[deckId]/page.tsx:133` into `src/lib/synthesis/schedule.ts` beside `daysToExam`, exported and tested (3 cases), and used by both pages.

**Data:** `getDueDrills(user.id)` (DATA-04). Then one read of the due decks' titles and exam dates, `decks.select('id, title, exam_at').in('id', dueDeckIds)`, filtered by RLS and trash exactly as Today is.

**Layout** (design system §7.1 planes):
- `h1`, serif display: **Drills**. Sub-line at 13 px: "*N* drills due across *M* decks", numbers in mono. When `truncated` is true, "*N*+".
- **`.raised` launcher** for the deck with the most due: its title, "*N* due" in `--state-due`, and its exam line in ink (§2.2e), with the primary button **Start drills** → `drillSessionHref(deckId, dueCount)`. This is the screen's only primary button.
- **`.well` list** of the other due decks, one row each: 2 px due tick, title (a link to the deck), due count in mono and `--state-due`, exam line in ink, and a default **Start** button with the same href.
- **Empty:** "No drills due." and, below it, "Drills are written from a deck's cards: open a deck and use its Insights tab." A link goes to Today. No `.raised` when empty.
- Page title: `Drills - Cognit`.

**Check:** with drills due in two decks, the launcher names the one with more, and Start opens `…/synthesis?count=N&pull=1` with N ≤ 3. With none due, the empty state shows.

### 4.3 DST-02 — Shared: `/dashboard/shared`

**Files:** `src/app/dashboard/(shell)/shared/page.tsx`, `shared/loading.tsx`, `src/lib/sharing.ts` (server-only `loadSharedDecks(userId)`) and `src/components/ui/shared/SharedDeckList.tsx` (client; reused by SET-08).

**Data:** `decks.select('id, title, share_token, shared_at, listed_at, clone_count').eq('user_id', userId).eq('is_public', true).not('share_token', 'is', null).order('shared_at', { ascending: false })`. **The `user_id` filter is required** (§0.2 item 5). Add a unit test with the Supabase mock that asserts `.eq('user_id', …)` was called.

**`SharedDeckList` row:** title (a link to the deck) · "Link on · shared *N* days ago" and "copied *N* times" when `clone_count > 0`, dates in ink · **Copy link** writes `${location.origin}/s/${token}` with `navigator.clipboard`, then toasts "Link copied" · **Turn off** calls `setDeckSharing({ deck_id, enabled: false })`, removes the row optimistically, and toasts with **Undo** (`enabled: true`). The token is kept on disable (`202609070910`), so Undo restores the same link. When `EXPLORE_ENABLED` is on, a **Listed on Explore** switch calls `setDeckListing`.

**Empty:** "Nothing is shared. Share a deck from its page, and its link appears here."

**Check:** turning a deck off, then Undo, leaves the same URL working. A deck another user shares never appears.

### 4.4 DST-03 — Trash: `/dashboard/trash`

**Files:** `src/app/dashboard/(shell)/trash/page.tsx`, `trash/loading.tsx`, and `src/components/ui/shared/TrashList.tsx`, which is `TrashPanel`'s restore and purge logic without the `<details>`.

**Data:** the page (server) calls `purge_expired_trash` and then `list_trashed_decks`, the same two calls as `listTrashedDecks`, and passes the rows down.

**Row:** title · *N* cards · "Deleted Sep 28 · removed for good Oct 28", dates in ink · **Restore** (default button) · **Delete forever** (ghost; opens `ConfirmDialog`; destructive copy uses `--destructive` per §2.2d). After either action, `router.refresh()`.

**Empty:** "Nothing in the trash. Deleted decks stay here for 30 days."

`TrashPanel` stays on Today until NAV-07 removes it. Both call the same actions.

### 4.5 DST-04 — Export all: `GET /api/export?format=csv|anki`

**File:** `src/app/api/export/route.ts`, with the same runtime, `maxDuration` and session check as the per-deck route (`/api` is outside the proxy matcher).

**Stream:** read the user's decks (`id, title`, ordered by title). Enqueue a BOM plus `CSV_HEADER_ALL`, or `ankiHeaderAll()`. Then, deck by deck, page cards 1,000 at a time with `EXPORT_COLUMNS` and enqueue `toCsvRowWithDeck` or `toAnkiRowWithDeck`. Filename: `exportAllFilename(format, now)`. The response headers match the per-deck route.

**Test:** `src/app/api/export/route.test.ts` (as `keep-alive/route.test.ts` does): 401 when signed out; a CSV body that starts with the BOM and `deck,question,answer`, with one row per mocked card carrying its deck title.

**Check:** open the CSV in Excel and in Google Sheets and confirm one column per field, with no formula executed. Import the Anki file into Anki 2.1.55 or later: notes land under `Cognit::<deck>` per deck. Importing it a second time updates the notes rather than duplicating them.

### 4.6 DST-05 — Counts that follow the data

Once the sidebar shows counts (Phase 3), an action that changes them must re-render the shell layout. It's cheap, and it does no harm before Phase 3, so do it now. In `deck-lifecycle.ts` (trash, restore, purge, duplicate, merge), `share.ts` (`setDeckSharing`, `cloneSharedDeck`), `deck.ts` (`createDeck`, `deleteDeck`) and `setDeckListing`, change `revalidatePath('/dashboard')` to `revalidatePath('/dashboard', 'layout')`. Keep the per-deck `revalidatePath` calls as they are.

### 4.7 Gate S1

| Check | How | Pass |
|---|---|---|
| Unit and build | `npm test && npm run build` | green; build lists `ƒ /dashboard/drills`, `ƒ /dashboard/shared`, `ƒ /dashboard/trash`, `ƒ /api/export` |
| Rev. E | `COGNIT_DESIGN_SYSTEM.md` | header reads Rev. E; §7.11, §7.12 and the new §8 are present |
| Drills | URL, signed in | launcher, list and empty state as specified; Start opens the drill canvas |
| Shared | URL, signed in | only your decks; Copy link; Turn off → Undo keeps the URL |
| Trash | URL, signed in | restore and delete forever work; the 30-day copy is right |
| Export all | download both formats | the Excel, Sheets and Anki checks in §4.5 |
| Both themes | each page | matches Rev. E; hue only on due counts |

**Execution notes (2026-10-01, on `0a386ab`, uncommitted).** Automated: `tsc` clean · ESLint and contrast clean · **566 tests in 55 files** (554 + `examLine` 3, `sharing` 5, export route 4) · build ✓ with `ƒ /dashboard/drills`, `ƒ /dashboard/shared`, `ƒ /dashboard/trash`, `ƒ /api/export` · bundle budgets pass (new pages 193.5–196.6 kB gz). Signed out on `next start`: the three pages redirect to `/login?redirectTo=…` and `/api/export` returns 401. **Not yet checked:** everything signed in (no test account), Excel, Sheets and Anki. Where the repo corrected the plan:

- **Breadcrumb moved up from NAV-07.** It read any segment that wasn't `stats` as a deck id, so `/dashboard/drills` showed "Decks / Deck". It now reads `dashboardLocation`, and the root label stays "Decks" until NAV-07 renames it to Today.
- **Drills empty state.** Drills are started from a deck's **Overview** (`DeckSessionLauncher` → `SynthesisLauncher`), not its Insights tab, so the copy says Overview.
- **Rev. E applied with a guard.** §7.11 and §8 say the sidebar ships in Phase 3, and Rev. D's rail table is kept beside Rev. E's until then, so the design system never describes chrome that isn't running.
- **`src/components/ui/switch.tsx`** is a small native `role="switch"` button rather than Radix's Switch. SET-05 reuses it.
- **Budgets** gained the three new pages at measured + 5 kB: drills 199, shared 202, trash 202.
- **`purgeDeck`** had no revalidation at all; it now revalidates the layout too.
- **Export test:** `Response.text()` strips a leading BOM, so the test reads bytes.

---

## 5. Phase 2 — Settings

`/dashboard/settings`, reachable by URL and, after SET-11, from the palette. Until Phase 3 the page carries its own section index. After Phase 3 the sidebar lists the sections at `md` and above, and the in-page index shows below `md` only.

### 5.1 SET-00 — Route, frame, section index

**Files:** `src/app/dashboard/(shell)/settings/page.tsx` (server), `settings/loading.tsx`, and under `src/components/ui/shared/settings/`: `SettingsSection.tsx`, `SettingsRow.tsx`, `SettingsIndex.tsx`.

**Data (one wave):** `getSessionUser`, `getUserSettings`, `loadSharedDecks`, `get_ai_usage_summary`, `get_sidebar_counts` (for the trash count) and `accountDeletionAvailable()`.

**Frame:**
- `h1` **Settings** (serif display); sub-line: "Your account, how Cognit looks, and how your sessions run."
- One `<section id={id} aria-labelledby={id + '-title'}>` per entry of `SETTINGS_SECTIONS`, in that order, each with `scroll-margin-top: 64px` so the sticky header doesn't cover its heading.
- `SettingsSection`: a two-column grid at `md` and above (240 px heading column, 48 px gap), stacked below `md`. Heading is 16 px/600 (`h2`) with a 13 px `--ink-dim` description. Sections are separated by a 1 px `--border` rule. No card, no fill (Rev. E §7.12).
- `SettingsRow`: at least 56 px tall. The label (14 px) and optional hint (12 px, `--ink-dim`) sit on the left, the control on the right. Rows after the first get a 1 px top rule. Below `md` the control drops under the label.
- `SettingsIndex`: a wrapping row of anchor links (13 px, `--ink-dim`, 44 px touch height below `md`). Hidden at `md` and above once NAV-04 lands.
- No `.raised` on this screen (D12). At most one primary button, and none is needed: saves use default buttons.
- Page title: `Settings - Cognit`.

### 5.2 SET-01 — Profile

- **Display name:** a `<label>`led text input, prefilled with `settings.displayName ?? ''`, whose placeholder shows the derived name (`resolveDisplayName(user)`). **Save** (default button) → `updateDisplayName`. Pending: "Saving…". Success: toast "Saved". Field errors go in an `aria-live="polite"` line under the field, in `--destructive`. Hint: "Shown in your greeting. Leave it empty to use your account name."
- **Email:** read-only, mono 13 px, `--ink-dim`. Hint: "The address you sign in with."
- **Wire it:** Today's `resolveDisplayName(user)` (`page.tsx:382`) becomes `resolveDisplayName(user, settings.displayName)`, with `getUserSettings(user.id)` added to Today's single wave.

### 5.3 SET-02 — Sign-in & security

- **Signed in with:** from `user.providers`, e.g. "Google" or "Email and password". Text only.
- **Password** (only when `providers` includes `email`): **Send reset link** → `sendPasswordResetLink`, then toast "Check your email for a reset link."
- **Sessions:** **Sign out everywhere** opens `ConfirmDialog` ("This signs you out on every browser and device, including this one."), then calls `signOutEverywhere`.

### 5.4 SET-03 — Appearance: the theme preference

**`ThemeProvider.tsx`:** its state becomes a `ThemePreference`, read with `parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))`. The resolved `theme` is still exported, so `useTheme().theme` keeps its meaning for every current caller. Add `preference` and `setPreference(p)`, which writes `storedThemeValue(p)` (removing the key for `system`) and applies `resolveTheme`. While the preference is `system`, subscribe to `matchMedia('(prefers-color-scheme: light)')` `change` events and re-apply; unsubscribe otherwise. `toggleTheme` stays, for `ThemeToggle` on the landing, login and share pages and for the palette: it sets the explicit opposite of the resolved theme. **`theme-script.ts` does not change**, and `theme.test.ts` fails if its behaviour drifts.

**`ThemePreferenceControl.tsx`** (client, `src/components/ui/shared/`): a three-option radio group (`radix-ui` RadioGroup) labelled **Dark · Light · System**, with arrow-key movement and `aria-label="Theme"`. It is used here and in the account menu (NAV-06).

**Motion row:** "Follows your system's Reduce motion setting." Text only; nothing to set.

### 5.5 SET-04 — Study defaults

- **Cards per session:** a stepper, 5–50, default 10. Hint: "Where a study session or quiz starts. You can still change it each time."
- **New cards per session:** a stepper, 0–20, default 5. Hint: "Unseen cards mixed in with your reviews. When few cards are due, new ones fill the rest of the session." That describes `newCardAllowance` exactly.
- **Save** → `updateStudyDefaults`. **Reset to defaults** (ghost) → `resetStudyDefaults`.
- **Stepper** (`src/components/ui/stepper.tsx`): a native `<input type="number" inputMode="numeric" min max step=1>` between − and + buttons. The buttons are 32 px on desktop and 44 px below `md`, with `aria-label`s "Fewer cards" and "More cards". The value is mono 14 px. The range goes in the hint via `aria-describedby`. The input's font is at least 16 px below `md` (MOB-01).

**Wire it:**
- `study/page.tsx`: add `getUserSettings(user.id)` to the wave. Then `normalizeSessionCardCount(raw, totalInDeck, settings.sessionCardCount)`, and replace line 106 with `newCardAllowance(sessionCardCount, scheduledRows.length, settings.newCardsPerSession)`.
- `quiz/page.tsx:101–102`: pass `settings.sessionCardCount` to both calls.
- `(shell)/[deckId]/page.tsx:347`: `getSessionCardBounds(totalCards, settings.sessionCardCount)`, so the deck launcher opens on the user's number.
- Remove the hard-coded size: `DashboardOnboarding.tsx:66` → `?scope=due`; `FlashcardReviewClient.tsx:722` → `?mode=mcq`; `:725` → `?scope=include_reviewed`.

**Check:** set 25 and 0. A deck with 40 due opens a 25-card session with no new cards. A new deck opens 25 new cards. `?count=15` still gives 15.

### 5.6 SET-05 — Sound & haptics

Two `radix-ui` Switches bound to `useFeedbackPrefs()` (the store is unchanged):
- **Sound on answer**, default off.
- **Vibrate on answer**, default on, with the hint "Phones that support it. iPhones don't."

Section description: "Feedback when you answer a quiz question. Saved to this browser." That's accurate: only the quiz fires feedback today. Extending it to study and drills is in Appendix D.

### 5.7 SET-06 — Keyboard shortcuts: registry, dialog, ⌘N everywhere

1. **Registry:** apply `src/lib/shortcuts.ts` and its test from **Appendix C2**. The test checks that every owner file exists and binds keys, and it is red until steps 2 and 3 are done.
2. **⌘N moves:** delete the listener effect from `CreateDeckPanel.tsx:33–54` and add it to `CreateDeckModal.tsx`. Keep the same guard (`pageShortcutBlocked`, typing targets, no Alt or Shift), and have it open the modal directly. Keep the panel's `aria-keyshortcuts` and `Kbd`.
3. **Dialog:** `src/components/ui/shared/KeyboardShortcutsDialog.tsx` (client), mounted once in `(shell)/layout.tsx` beside `CreateDeckModal`.
   - It opens on `isShortcutsHotkey(event)` from a window `keydown` handler that first checks `pageShortcutBlocked(event)` and `isTypingTarget(event.target)`. It also opens on `OPEN_SHORTCUTS_EVENT`.
   - It uses `useModalDialog` and the §7.8 scrim, with title "Keyboard shortcuts".
   - Content is `groupShortcuts()`: one table per scope, with the scope as a label-step caption and each row a label plus one `.kbd` per key. `keycapLabel(key, apple)` renders the keys; `apple` is `/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)`, read after mount.
   - It is not mounted on focus routes: they have no chrome, and their own bindings show on their own screens.
4. **Settings section:** the same tables, rendered by a shared `ShortcutsTable` component. Description: "They work whenever you're not typing in a field."

### 5.8 SET-07 — AI usage & privacy

- **Used in the last 24 hours:** mono "*38* of 300 calls" and a 4 px meter (track `--surface-raised`, fill `--ink-dim`). The fill turns `--destructive` at the limit: an error state (§2.2d), not a memory state.
- Below the meter: "Calls stop counting 24 hours after they're made. The oldest one clears at *HH:MM*." Time in ink, in the user's locale. It's hidden when `used` is 0.
- **What counts:** "Card generation, hints, deck chat, search and drill checks each use calls."
- **Notice** (`.well`, 13 px, `--ink-dim`): "Cognit uses Google Gemini on its free tier. On that tier, Google may use what you send to improve its products, so don't upload anything confidential."
- **Copy fix:** `_shared.ts:119` becomes "You've reached your AI limit: 300 calls in 24 hours. Calls free up as they pass 24 hours old."

### 5.9 SET-08 — Sharing

`SharedDeckList` from DST-02, fed by the page's `loadSharedDecks`. A section-footer link reads "All shared decks →" and goes to `/dashboard/shared`.

### 5.10 SET-09 — Export & trash

- **Export all decks:** two default buttons, rendered as `<a download>`: **CSV** → `/api/export?format=csv` and **Anki** → `/api/export?format=anki`. Hint: "All *N* decks in one file." (*N* from `loadShellNav`).
- **Trash:** "*N* decks in the trash" (from `get_sidebar_counts`), or "The trash is empty", with **Open trash** → `/dashboard/trash`.

### 5.11 SET-10 — Delete account

**Blocked until:** assertion 18 has been run on production and every row passes (§3.6).

**Environment:** add `SUPABASE_SERVICE_ROLE_KEY` in Vercel for the **Production** environment only (D8), and optionally in `.env.local`. It is never prefixed `NEXT_PUBLIC_`.

**UI:**
- When deletion is available, the section shows the text "Deletes your decks, cards, review history and drills. Shared links stop working. This can't be undone." and a **Delete account…** button styled as destructive (`--destructive` text and 1 px border; not primary).
- The button opens `DeleteAccountDialog`: `role="alertdialog"`, `useModalDialog`, initial focus on **Cancel**. The body lists what goes, with the user's deck and shared counts, then "Type *your email* to confirm" above a text input. **Delete account** stays disabled until the input matches (case- and space-insensitive), then calls `deleteAccount`. Pending: "Deleting…". On error, the message shows in the dialog's live region.
- When deletion isn't available, the section reads "Account deletion isn't available yet." and shows no button.

**Landing:** on `/` with `?account=deleted`, show a toast: "Your account and everything in it has been deleted."

**Check:** on a throwaway account (never the owner's), create a deck, share it and study it, then delete the account. The share URL 404s. Signing in again fails. Assertion 18's tables hold no rows for that id: check in the SQL editor with the id noted beforehand.

### 5.12 SET-11 — Palette: exhaustive effects and new commands

Apply the rest of **Appendix C2**:
- `command-palette.ts` gets **Today** (renamed from "Go to decks"), **Drills**, **Shared**, **Trash**, **Settings**, and **Keyboard shortcuts** (`effect: 'show-shortcuts'`).
- `runEffect` becomes an exhaustive `switch` with a `never` branch.
- `openerRef` records what opened the palette, so the create-deck and shortcuts dialogs hand focus back to it.
- `dashboard-events.ts` gets `OPEN_SHORTCUTS_EVENT` and `requestOpenShortcuts`.

The palette keeps its own header trigger until NAV-08.

### 5.13 Gate S2

| Check | How | Pass |
|---|---|---|
| Unit | `npm test` | **559+** tests (C2's 5, plus the DST and SET tests named above), all green, **including** `shortcuts.test.ts` |
| Build | `npm run build` | ✓, with `ƒ /dashboard/settings` |
| Name | Set "Dr. Santiago", then reload Today | the greeting uses it whole; clearing it restores the derived name |
| Study defaults | the §5.5 check | as written |
| Theme | Set System, then flip the OS theme | the page follows without a reload; Dark and Light ignore the OS |
| Shortcuts | `?` on Today, a deck page and Stats | the dialog opens; not while typing; not over another dialog. ⌘N opens New deck on every chromed page. |
| Palette | "Keyboard shortcuts" in ⌘K | opens the dialog. **Does not sign out.** |
| AI usage | Generate one hint, then reload Settings | the count rises by one |
| Security | Send reset link (password account); Sign out everywhere with two browsers | the email arrives; both browsers are signed out |
| Delete | §5.11 check, throwaway account | as written |
| Accessibility | axe on `/dashboard/settings` | 0 violations of `label`, `aria-*`, `landmark-*`, `color-contrast` |
| Both themes | Settings | matches Rev. E §7.12 |

---

## 6. Phase 3 — The sidebar

The visible switch. It replaces the rail, the header search and the account sheet in one release. Every destination it links to exists by now.

### 6.1 NAV-01 — CSS and tokens

In `globals.css`, replace the `.rail*` block (`:1381–1511`) and `--rail-w*` (`:141–142`) with the `.sidebar*` block that Rev. E §7.11 specifies. The key rules:

- **Tokens:** `--sidebar-w: 256px; --sidebar-w-rail: 48px;`
- **Frame:** `.sidebar { position: sticky; top: 0; height: 100dvh; width: var(--sidebar-w); border-right: 1px solid var(--border); z-index: var(--z-rail); display: flex; flex-direction: column; transition: width var(--dur-panel) var(--ease-out); }`. No fill and no shadow, as the rail had.
- **Width by state:** `[data-sidebar='collapsed']` sets the rail width. `[data-sidebar='auto']` sets the rail width inside `@media (min-width: 768px) and (max-width: 1023px)`. Below 768 px the drawer rules apply instead (§6.5).
- **Rail mode** hides `.sidebar__label`, `.sidebar__count`, `.sidebar__group-label`, the Library deck list and the account text, using the same opacity and width technique as `.rail__label`. Items keep their marks, and each gets a `title` and an accessible name.
- **Items** (`.sidebar__item`): 30 px tall, 9 px inline padding, 10 px gap, `--radius-control`, 13 px/500, `--ink-dimmer`. On hover: `--ink` with a `--border-strong` edge. `[aria-current]`: `--surface` fill, `--elevate`, `--border` edge, `--ink`, exactly as `.rail__btn[aria-current='page']`.
- **Counts** (`.sidebar__count`): mono 12 px, pushed right with `margin-left: auto`. `[data-tone='due']` uses `--state-due`; otherwise `--ink-dimmer`. Never a pill.
- **Group labels:** the label step (mono 10 px, uppercase, 0.16em tracking, `--ink-dimmer`).
- **Marks:** keep `.rail__rows` and `.rail__bars` as `.sidebar__mark--today` and `.sidebar__mark--stats`. Add `--drills` (two 6 px ring nodes joined by a 1.5 px edge), `--explore` (a 2 × 2 grid of 1.5 px-outline squares) and `--trash` (an open-top 11 px bin outline with a lid rule), all drawn in CSS, 15 × 15, `currentColor`. Search, plus, settings (gear), arrow-up-right and the chevrons stay Lucide at stroke 1.5.
- **Reduced motion:** extend the existing `prefers-reduced-motion` block (`:1506`) to `.sidebar` and `.sidebar__label`.

### 6.2 NAV-02 — `SidebarProvider` and `Sidebar`: one DOM, three presentations

**Files:** `src/components/ui/shared/sidebar/SidebarProvider.tsx`, `Sidebar.tsx`, `SidebarToggle.tsx` (all client).

- **`SidebarProvider`** holds `drawerOpen`, `openDrawer()`, `closeDrawer()`. It wraps the shell's flex row, so the header's toggle and the sidebar share state without events.
- **`Sidebar`** props: `preference: SidebarPreference`, `email: string | null`, and two slots, `nav: ReactNode` and `account: ReactNode`, both server-rendered (§6.3). Its structure:

```
<div class="sidebar" data-sidebar={state} data-open={drawerOpen}
     role={drawerOpen ? 'dialog' : undefined} aria-modal={drawerOpen || undefined}
     aria-label={drawerOpen ? 'Navigation' : undefined}>
  header row: Wordmark (links to /dashboard) · collapse button (desktop) / close button (drawer)
  Search control: <button aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">
                  search icon · "Search" · Kbd ⌘K   → requestOpenCommandPalette()
  New deck: <button aria-haspopup="dialog" aria-keyshortcuts="Meta+N Control+N">
                  plus · "New deck" · Kbd ⌘N         → requestOpenCreateDeck()
  <nav aria-label="Primary"> {nav} </nav>
  footer: {account}
</div>
```

- **Collapse:** the button toggles between `expanded` and `collapsed`, and writes `document.cookie = 'cognit-sidebar=<state>; path=/; max-age=31536000; samesite=lax'`. The initial state is the server's `preference`, so there's no reflow. `aria-expanded` sits on the collapse button, and its `aria-label` is "Collapse navigation" or "Expand navigation", as the rail's is now.
- **The Search control in the drawer:** close the drawer first, then request the palette on the next frame. Focus returns to the header toggle, and the palette's `openerRef` records it.
- **Links close the drawer:** an effect on `usePathname()` calls `closeDrawer()`.

### 6.3 NAV-03 — Streamed slots and fallbacks

**Files:** `src/components/ui/shared/sidebar/SidebarSlots.tsx` (server), `SidebarNav.tsx` and `AccountRow.tsx` (client).

- `SidebarNavSlot({ userId, exploreEnabled })` awaits `loadSidebar(userId)`, then renders `<SidebarNav items={buildSidebarItems({ counts, exploreEnabled })} decks={sidebarDecks(decks)} />`.
- `SidebarNavFallback({ exploreEnabled })` renders the same `SidebarNav` with `counts: null` (every item present, no badges) and `decks: null`. The Library shows four 28 px skeleton rows (`glass-skeleton`). The frame never changes shape when the data lands.
- `AccountRowSlot({ user })` awaits `loadSidebar`, resolves the name with `resolveDisplayName(user, settings.displayName)`, then renders `<AccountRow name email />`. The fallback shows the email's initial with no name.
- `loadSidebar` is `cache`d, so the two slots share one wave of reads, and Today's own `getDueByDeck` and `getDueDrills` calls reuse it.

### 6.4 NAV-04 — Items, Library and settings mode

**`SidebarNav`** (client) reads `usePathname()`.

**App mode** (`sidebarMode(pathname) === 'app'`):
- **Study:** a group label, then items `today`, `drills`, `stats` from `buildSidebarItems`. The item matching `activeSidebarItem(pathname)` gets `aria-current="page"`. A badge renders as `<span class="sidebar__count" data-tone>` with `aria-hidden`, and the link's accessible name appends `countLabel` ("Today, 47 due").
- **Library:** a group label with the deck total ("6 decks"), then one row per `shown` deck. A row is 28 px: 2 px tick (`--state-due` when due; otherwise `--ink-faint`, the design system §7.5 rule), then the title, truncated, 13 px `--ink-dim`, then the due count in mono `--state-due`, omitted at 0. The row matching `activeDeckId(pathname)` gets `aria-current="page"`. When `hiddenCount > 0`, a last row reads "All *N* decks" → `/dashboard#deck-collection`. Then `shared`, `explore` (flagged) and `trash`.
- **No decks:** the Library shows "No decks yet" in `--ink-dim`, and the items still render.

**Settings mode** (`/dashboard/settings`):
- The list is replaced by: **Back to Cognit** (arrow-left) → `/dashboard`, the heading **Settings**, then `SETTINGS_SECTIONS` grouped under their `group` labels, each an anchor `#id`.
- The active section comes from an `IntersectionObserver` over the page's `section[id]` elements (`rootMargin: '-64px 0px -60% 0px'`) and gets `aria-current="location"`.
- `SettingsIndex` (SET-00) is now hidden at `md` and above.

### 6.5 NAV-05 — Phones: the drawer

Below 768 px:
- **Closed:** `.sidebar` is `position: fixed; inset: 0 auto 0 0; width: min(320px, 100vw - 56px); transform: translateX(-100%); visibility: hidden;`. The `visibility` transition is delayed until the slide ends, so it's never tabbable while closed.
- **Open:** `[data-open='true']` sets `transform: none; visibility: visible;`. A sibling scrim (§7.8) sits at `--z-overlay`, the sidebar at `--z-modal`. Clicking the scrim closes the drawer.
- `useModalDialog({ open: drawerOpen, onClose: closeDrawer })`: Escape closes, Tab is trapped, and focus returns to `SidebarToggle`.
- **Touch sizes:** items and deck rows are 44 px tall below `md`; the Search control and the account row are 44 px.
- **`SidebarToggle`:** in the header, `md:hidden`, 44 × 44, the `--today` mark, `aria-label="Open navigation"`, `aria-expanded={drawerOpen}`, `aria-controls` pointing at the sidebar's id.
- **Account menu in the drawer:** it renders **inline**, as a disclosure under the account row, not as a second modal. Nested modals would fight over Escape and the Tab trap.

### 6.6 NAV-06 — Account menu

**Files:** `src/components/ui/shared/sidebar/AccountMenu.tsx` (client) and `AccountMenuContent.tsx`. `AccountControl.tsx` is deleted in NAV-09.

**`AccountRow`:** a 40 px button showing a 26 px initial circle (mono 11 px, `--border-control` edge), the name (13 px/500) and "Account" (11 px `--ink-dimmer`), with `aria-haspopup="dialog"` and `aria-expanded`. Beside it, a 32 px **Settings** icon link (gear, `aria-label="Settings"`) → `/dashboard/settings`. In rail mode only the circle shows, and the gear moves above it.

**Desktop menu:** a 280 px popover, `position: fixed`, opened beside the sidebar: its left edge is the sidebar's right edge + 8 px, and its bottom aligns with the row. `useModalDialog` handles Escape, the trap and focus return. A transparent full-screen click-catcher closes it. The surface is `--surface`, with a `--border-strong` edge, `--radius-lg` and `--elevate-2`.

**`AccountMenuContent`**, top to bottom:
1. "Signed in as" (label step), the name (14/500), the email (mono 12, `--ink-dimmer`, truncated with a `title`).
2. **Profile** → `/dashboard/settings#profile`; **Settings** → `/dashboard/settings`; **Keyboard shortcuts** with a `?` keycap → `requestOpenShortcuts()`, after the menu closes.
3. **Theme** → `ThemePreferenceControl` (SET-03).
4. **AI calls today:** calls `getAiUsage()` when the menu opens, never on page load, and shows a 12 px skeleton until it returns. Then "*38* / 300" and the 4 px meter. If the call fails: "Usage unavailable".
5. **Sign out** → `logout()`.

Rows are 32 px on desktop and 44 px in the drawer.

### 6.7 NAV-07 — Header, breadcrumb and Today

- **`(shell)/layout.tsx`** becomes: `SidebarProvider` › flex row › `AmbientField`, `Sidebar` (with both slots in Suspense), then the column. The header holds `SidebarToggle` and the breadcrumb, and **nothing on the right**. Read the preference with `parseSidebarPreference((await cookies()).get(SIDEBAR_COOKIE)?.value)`; the layout is already dynamic because of the session. Take `exploreEnabled` from `process.env.EXPLORE_ENABLED === 'true'`. Mount `CreateDeckModal`, `KeyboardShortcutsDialog` and `<Suspense fallback={null}><ShellCommandPalette userId /></Suspense>` once.
- **`Breadcrumb.tsx`:** derive the trail from `dashboardLocation(pathname)`. The root reads **Today**. A named route shows its label (Statistics, Drills, Shared, Trash, Settings). A deck shows its title. This replaces the `isStats` special case, which would otherwise treat `drills`, `shared`, `trash` and `settings` as deck ids.
- **Today, `(shell)/page.tsx`:** delete `<TrashPanel />` (`:492`) and its import. Replace the drill href at `:402` with `drillSessionHref(topDrillDeck.deckId, topDrillDeck.dueCount)`, and read due drills through `getDueDrills` (the shared cache) instead of `loadDueDrillsByDeck` directly. Add `export const metadata = { title: 'Today - Cognit' }`.
- **`DeckGrid.tsx`:** delete `DashboardSearch`, the `search` state and `filtered`. Render `orderedDecks`. Keep the sort group and the "*N* decks · *M* cards" line.
- **`dashboard/layout.tsx:4`:** the generic title becomes `'Cognit'`. Each page sets its own.

### 6.8 NAV-08 — The palette without a trigger

- `CommandPalette` stops rendering its `Button` trigger (`:314–326`). Delete `triggerRef`; `openerRef` (C2) covers focus hand-back.
- `ShellNav.tsx`: delete `ShellCommandPaletteFallback`. `ShellCommandPalette` is now mounted headless (§6.7).
- ⌘K, the sidebar's Search control and `requestOpenCommandPalette` all still open the one palette.

### 6.9 NAV-09 — Removals

Delete these, and check that `rg -n "AppRail|AccountControl|DashboardSearch|TrashPanel|rail__|--rail-w" src` returns nothing:
- `AppRail.tsx`
- `AccountControl.tsx`
- `DashboardSearch.tsx`
- `TrashPanel.tsx`, now replaced by `TrashList`
- the `.rail*` CSS and the `--rail-w*` tokens

Update the stale comments:
- `(shell)/loading.tsx`: the skeleton's comment mentions "the rail and the header".
- `dashboard/layout.tsx`: "rail + header + ⌘K" becomes "sidebar + header".
- `use-modal-dialog.ts`: "the rail *and* from the header".

The skeletons need no layout change: they render inside the shell.

**Bundle:** the sidebar is new client code on every shell route, partly offset by removing `AppRail` and `AccountControl`. Run `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json`. If `/dashboard/(shell)/*` exceeds its budget, raise it to the measured size + 5 kB **with this sentence as the written reason** (standing rule): "Sidebar navigation, account menu and drawer replace the rail (COGNIT_SIDEBAR_SETTINGS_PLAN.md §6)."

### 6.10 Gate S3

| Check | How | Pass |
|---|---|---|
| Unit and build | `npm test && npm run build` | green; the `rg` in NAV-09 is empty |
| Bundle | `bundle-report.mjs --budgets` | within budget, or raised once with the NAV-09 reason |
| Desktop ≥ 1024 | Today, a deck, Stats, Drills, Shared, Trash, Settings | expanded sidebar; the right item or deck carries `aria-current`; counts match the pages |
| 768–1023, no cookie | same | collapsed rail; every item has a name; collapse and expand persists across a reload with **no reflow** (throttle to Slow 3G and watch the first paint) |
| Phone (device) | iOS Safari and Android Chrome | ☰ opens the drawer; the scrim and Escape close it; Tab is trapped; links close it; Search opens the palette after the drawer closes; the account menu opens inline; every target ≥ 44 px |
| Focus routes | study, quiz and synthesis | no sidebar, no header, no drawer |
| Keyboard | Tab through the sidebar from the skip link | every control reachable, with a visible focus ring; ⌘K, ⌘N and ? work from every chromed page |
| Screen reader | VoiceOver: the sidebar, then the account menu | "Primary, navigation"; "Today, 47 due, current page"; the menu's name and theme radio group are announced |
| Settings mode | `/dashboard/settings` | sidebar shows Back to Cognit and the sections; the current section follows scroll; `SettingsIndex` hidden at `md` and above |
| Counts follow | Trash a deck on Today | the Trash badge rises and Today's count drops, with no reload |
| axe | Today, Settings, Drills, and the drawer open | 0 violations of `landmark-*`, `region`, `aria-*`, `label`, `color-contrast` |
| Both themes | all of the above | matches Rev. E; no hue except due counts and state ticks |
| Mockup parity | canvas boards 1 and 2 | layout, order and copy match. Differences allowed: no ⌘, (D9), and Settings' sound copy (§5.6) |

---

## 7. Gates, deploy sequence, standing rules

| Gate | Blocks | Automated | Manual |
|---|---|---|---|
| **S0** | Phase 1 | `db:types` · `tsc` · lint · **554** tests · build · `verify:deployment` | assertions 1–3, 12–15, 18 |
| **S1** | Phase 2 | tests · build shows the four new routes | Drills, Shared, Trash, export (Excel, Sheets, Anki) |
| **S2** | Phase 3 | tests ≥ 559 with `shortcuts.test.ts` green · build | name, defaults, theme, `?`, ⌘N, palette doesn't sign out, AI usage, sign out everywhere, delete (throwaway account), axe on Settings |
| **S3** | Done | tests · build · NAV-09 `rg` empty · bundle | three widths, two phones, focus routes, keyboard, VoiceOver, axe on four surfaces, both themes, mockup parity |

**Deploy sequence per phase:** Phase 0 follows §3.7, with the database first. Phases 1–3 add no migrations: run the local gate (`tsc`, lint, test, build), commit to `main` and push, then do the gate's manual checks on production. SET-10 also needs the Vercel key set **before** the deploy that shows the button; without it the section says "unavailable", which is safe.

**Standing rules added by this plan** (Next Horizon §7's rules still apply):
- A new named route under `/dashboard` is added to `NAMED_DASHBOARD_SEGMENTS` in the same commit, or the breadcrumb and sidebar treat it as a deck id.
- A new keyboard binding gets a row in `SHORTCUTS` in the same commit. `shortcuts.test.ts` checks that every owner file binds keys.
- Only `src/app/actions/settings.ts` imports `@/lib/supabase/admin`, and a test enforces it.
- An action that changes deck, share or trash counts revalidates the `/dashboard` **layout**.
- Account-scoped preferences go in `user_settings`. Device-scoped ones stay in `localStorage` and say "Saved to this browser" where they're set.

---

## Appendix A — Evidence log

| # | What was run | Result |
|---|---|---|
| A.1 | `git log -1` · `git status --short` | `bc66b1d`; only `COGNIT_UIUX_PLAN_PROMPT.md` untracked |
| A.2 | `npx vitest run` at `bc66b1d` | 491 tests in 47 files, green |
| A.3 | `node scripts/sqlcheck.mjs` on both migrations | `202610010900_user_settings.sql: 10 statements` ok · `202610010910_shell_reads.sql: 6 statements, 1 SQL body` ok |
| A.4 | `sqlcheck` on assertion 18 (and the whole assertions file with it), and on a deliberate typo | ok (the file: 20 statements) · `FAIL … syntax error at or near "retrun"`, exit 1 |
| A.5 | C1 on an APFS clone, types hand-added for compile only | `tsc` 0 · ESLint 0 · **554 / 53** green |
| A.6 | C1 + C2 on a fresh clone | `tsc` 0 · ESLint 0 · **559 / 54**; the one red test is `shortcuts.test.ts › names an owner…`, by design (§5.7) |
| A.7 | The same, with `CreateDeckModal` and `KeyboardShortcutsDialog` stubbed | `shortcuts.test.ts` 5/5 |
| A.8 | `npm run build` on the patched clone | ✓ Compiled successfully; 20 routes, unchanged |
| A.9 | `git apply --check` of C1, and of C2, against this repo | both clean; C2 is independent of C1 |
| A.10 | `rg` for a service-role key in `src/` and `scripts/` | none |
| A.11 | `supabase/verify/production-assertions.sql` query 2 | the project forbids `SECURITY DEFINER`; hence D8 |
| A.12 | `@supabase/auth-js` `JwtPayload` | carries `app_metadata.providers`; hence `SessionUser.providers` |

---

## Appendix B — Design system Rev. E (paste into `COGNIT_DESIGN_SYSTEM.md`)

**Header line:** append to **Status**: `· Rev. E (2026-10: sidebar navigation, settings controls, planes on management screens — COGNIT_SIDEBAR_SETTINGS_PLAN.md)`.

**Changelog (Rev. E)** (add above Rev. C's): The 48 px rail becomes a 256 px sidebar that collapses to the rail and becomes a drawer on phones (§8, §7.11). Adds settings controls (§7.12). Scopes "exactly one `.raised`" to screens with a primary object (§1b). Adds three CSS marks and a minus sign to §6.

**§1, principle 1b:** append:
> *Rev. E.* "Exactly one `.raised`" applies to screens that have a primary object: Today's due band, the study card, the Drills launcher. Management screens (Settings, Shared, Trash) are lists of equal controls and have **no** `.raised`. They use rules and, where content is contained, a `.well`.

**§6 Iconography:** append to *Permitted*: `minus` (steppers). Add a paragraph:
> *CSS marks (Rev. E).* Where §6 has no glyph for a destination, the mark is a miniature of the page it opens, drawn in CSS at 15 × 15 in `currentColor`, as the deck-index mark always was. **Today:** three rules (the index). **Statistics:** three bars. **Drills:** two ring nodes joined by an edge (the concept map). **Explore:** a 2 × 2 grid (the directory). **Trash:** an open bin outline. **Shared:** Lucide `arrow-up-right`. **Settings:** Lucide `settings`. Nothing else joins without a Rev.

**New §7.11 Sidebar:**
- **Geometry:** 256 px expanded, 48 px rail, drawer `min(320px, 100vw − 56px)` below 768 px. With no stored choice it is a rail at 768–1023 px and expanded from 1024 px. A choice is stored in the `cognit-sidebar` cookie and rendered by the server.
- **Boundary:** a 1 px `--border` right rule; no fill, no shadow. The drawer uses `--surface`, a `--border-strong` right edge, `--elevate-2`, and the §7.8 scrim.
- **Order:** wordmark · Search (control edge, ⌘K keycap) · New deck (ghost, ⌘N keycap) · *Study*: Today, Drills, Statistics · *Library*: decks, Shared, Explore (flagged), Trash · account row with the settings link.
- **Item:** 30 px (44 px in the drawer), `--radius-control`, 13 px/500, `--ink-dimmer`. Hover: `--ink` with a `--border-strong` edge. Current: `--surface`, `--elevate`, a `--border` edge, `--ink`.
- **Count:** mono 12 px, right-aligned, `--state-due` only when the number is due work, otherwise `--ink-dimmer`. A zero prints nothing. Never a pill or a dot.
- **Deck row:** 28 px, a 2 px × 12 px state tick (§7.5 rule), title in `--ink-dim`, due count in mono.
- **Group label:** the label step.
- **Settings mode:** Back to Cognit, the heading, then sections under group labels. The current section is `aria-current="location"`.

**New §7.12 Settings controls:**
- **Section:** a 240 px heading column and the controls column, 48 px apart; stacked below `md`. `h2` at 16 px/600 with a 13 px `--ink-dim` description. Sections are separated by a 1 px `--border` rule. No card.
- **Row:** at least 56 px; label 14 px, hint 12 px `--ink-dim`, control right-aligned; a 1 px rule between rows.
- **Switch:** a 36 × 20 track. Off: a `--border-control` edge with an `--ink-dimmer` knob. On: an `--ink` track with a `--bg` knob. `role="switch"`.
- **Segmented control** (radio group): a `--border-control` edge, 2 px inset; the selected option is `--surface-raised` and `--ink`, the others `--ink-dim`; 28 px (44 px below `md`); arrow keys move the selection.
- **Stepper:** − and + buttons around a mono value, all inside one `--border-control` edge; 32 px (44 px below `md`).
- **Meter:** 4 px, track `--surface-raised`, fill `--ink-dim`. `--destructive` only at a hard limit (an error, §2.2d).
- **Destructive button:** `--destructive` text and edge, transparent fill. Never primary.
- **Saving:** explicit Save buttons (default variant). Switches and the theme apply at once. Confirmation is a toast; errors go in a live region under the field.

**§8 Navigation architecture:** replace the table:

| Viewport | Chrome |
|---|---|
| ≥ 1024 px | 256 px sidebar (collapsible to the 48 px rail, persisted by cookie) + header breadcrumb |
| 768–1023 px | 48 px rail by default (expandable, persisted) + header breadcrumb |
| < 768 px | Header: drawer button + breadcrumb. The sidebar is a drawer. **No bottom bar.** |
| Focus routes (study, quiz, synthesis) | **No navigation chrome at all** (unchanged) |

Add under **Rules**: "Search lives in the sidebar and opens the ⌘K palette; there is no header search." And: "The account menu opens beside the sidebar on desktop and inline inside the drawer on phones; never a modal inside a modal."

**§11 Self-check:** add:
> 13. Does every sidebar count that is not due work stay out of `--state-due`?
> 14. Does a new `/dashboard/<name>` route appear in `NAMED_DASHBOARD_SEGMENTS`?
> 15. Is every device-only preference labelled "Saved to this browser"?

---

## Appendix C1 — Phase 0 patch (DATA-01 … DATA-07)

26 files. Apply with §3.7 step 1. It does **not** include `src/lib/database.types.ts`: that file comes from `npm run db:types` after the push.

<!-- patch:C1 -->
```diff
diff --git a/scripts/verify-deployment.mjs b/scripts/verify-deployment.mjs
index bdd4ad0..4c1266c 100755
--- a/scripts/verify-deployment.mjs
+++ b/scripts/verify-deployment.mjs
@@ -64,6 +64,9 @@ const RPCS = {
   list_public_decks:          { p_limit: 1 },
   // Phase 3 (202609270900). anon's EXECUTE is revoked, so expect "guarded".
   get_synthesis_insights:     { p_deck_id: DECK },
+  // Sidebar and Settings (COGNIT_SIDEBAR_SETTINGS_PLAN.md, 202610010910). anon's EXECUTE is revoked.
+  get_sidebar_counts:         {},
+  get_ai_usage_summary:       {},
 };
 
 let missing = 0;
@@ -101,6 +104,8 @@ const SYNTHESIS_PROBES = [
   // Trash and directory (202609240900, 202609240930).
   ['decks', 'id, deleted_at, listed_at'],
   ['deck_reports', 'id, deck_id, reporter_id, reason'],
+  // Per-account settings (202610010900).
+  ['user_settings', 'user_id, display_name, session_card_count, new_cards_per_session'],
 ];
 for (const [table, columns] of SYNTHESIS_PROBES) {
   const probe = await supabase.from(table).select(columns).limit(1);
diff --git a/src/app/actions/_shared.ts b/src/app/actions/_shared.ts
index 1565b9e..a38e5a6 100644
--- a/src/app/actions/_shared.ts
+++ b/src/app/actions/_shared.ts
@@ -2,6 +2,10 @@ import type { createClient } from '@/lib/supabase/server';
 import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
 import type { Json } from '@/lib/database.types';
 import { logger } from '@/lib/logger';
+import { DAILY_AI_CALL_CEILING } from '@/lib/ai-usage';
+
+// Moved to src/lib/ai-usage.ts so client components can read it (sidebar plan §5.8).
+export { DAILY_AI_CALL_CEILING };
 
 export type AiActionName =
   | 'generate_cards'
@@ -60,12 +64,6 @@ export function sanitizeAiInputText(rawText: string, maxChars = 50_000) {
   return sanitized.length > 0 ? sanitized : bounded.trim();
 }
 
-/**
- * The daily ceiling on model calls per user, across every action. Enforced
- * inside `reserve_ai_call` under the same advisory lock as the per-action
- * window, so it can neither race nor fail open.
- */
-export const DAILY_AI_CALL_CEILING = 300;
 
 type ReservationOutcome =
   | { ok: true; reservationId: string }
diff --git a/src/app/actions/settings.test.ts b/src/app/actions/settings.test.ts
new file mode 100644
index 0000000..741972d
--- /dev/null
+++ b/src/app/actions/settings.test.ts
@@ -0,0 +1,192 @@
+import { readFileSync, readdirSync, statSync } from 'node:fs';
+import path from 'node:path';
+import { beforeEach, describe, expect, it, vi } from 'vitest';
+
+import { createSupabaseMock } from '@/test/supabase-mock';
+
+const USER = { id: 'user-1' };
+const EMAIL = 'me@example.com';
+
+const mocks = vi.hoisted(() => ({
+  client: null as unknown,
+  admin: null as unknown,
+  redirect: vi.fn((to: string) => {
+    throw new Error(`NEXT_REDIRECT ${to}`);
+  }),
+  resetPassword: vi.fn(async () => ({ success: true, message: 'sent' })),
+}));
+
+vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
+vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }));
+vi.mock('@/app/auth/actions', () => ({ resetPassword: mocks.resetPassword }));
+vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
+vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
+
+type Mock = ReturnType<typeof createSupabaseMock> & { auth: Record<string, unknown> };
+
+function client(options: { email?: string | null; providers?: string[]; signedOut?: boolean; rpcs?: NonNullable<Parameters<typeof createSupabaseMock>[0]>['rpcs'] } = {}) {
+  const mock = createSupabaseMock({ user: options.signedOut ? null : USER, rpcs: options.rpcs }) as Mock;
+  if (!options.signedOut) {
+    mock.auth.getClaims = vi.fn(async () => ({
+      data: { claims: { sub: USER.id, email: options.email ?? EMAIL, app_metadata: { providers: options.providers ?? ['email'] } } },
+      error: null,
+    }));
+  }
+  mock.auth.signOut = vi.fn(async () => ({ error: null }));
+  mocks.client = mock;
+  return mock;
+}
+
+/** The payload the action passed to `.upsert()` on user_settings. */
+function upserted(mock: Mock) {
+  const from = mock.from as unknown as { mock: { calls: string[][]; results: { value: { upsert: { mock: { calls: unknown[][] } } } }[] } };
+  const index = from.mock.calls.findIndex(([table]) => table === 'user_settings');
+  return from.mock.results[index]?.value.upsert.mock.calls[0];
+}
+
+const importSettings = () => import('./settings');
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mocks.admin = null;
+});
+
+describe('updateDisplayName', () => {
+  it('upserts the normalised name, keyed on the user', async () => {
+    const mock = client();
+    const { updateDisplayName } = await importSettings();
+    await expect(updateDisplayName('  Dr.   Santiago ')).resolves.toMatchObject({ success: true, displayName: 'Dr. Santiago' });
+    const [payload, options] = upserted(mock) as [Record<string, unknown>, Record<string, unknown>];
+    expect(payload).toMatchObject({ user_id: USER.id, display_name: 'Dr. Santiago' });
+    expect(payload).not.toHaveProperty('session_card_count');
+    expect(options).toEqual({ onConflict: 'user_id' });
+  });
+
+  it('saves a cleared name as null, which means "derive it"', async () => {
+    const mock = client();
+    const { updateDisplayName } = await importSettings();
+    await updateDisplayName('   ');
+    expect((upserted(mock) as [Record<string, unknown>])[0].display_name).toBeNull();
+  });
+
+  it('refuses an address and a signed-out caller', async () => {
+    client();
+    const { updateDisplayName } = await importSettings();
+    await expect(updateDisplayName('me@example.com')).resolves.toMatchObject({ error: expect.stringContaining('email') });
+    client({ signedOut: true });
+    await expect(updateDisplayName('Marc')).resolves.toMatchObject({ error: 'You must be logged in.' });
+  });
+});
+
+describe('updateStudyDefaults', () => {
+  it('writes both values and nothing else', async () => {
+    const mock = client();
+    const { updateStudyDefaults } = await importSettings();
+    await expect(updateStudyDefaults({ sessionCardCount: 20, newCardsPerSession: 8 })).resolves.toMatchObject({ success: true });
+    const [payload] = upserted(mock) as [Record<string, unknown>];
+    expect(payload).toMatchObject({ session_card_count: 20, new_cards_per_session: 8 });
+    expect(payload).not.toHaveProperty('display_name');
+  });
+
+  it('refuses out-of-range values before touching the database', async () => {
+    const mock = client();
+    const { updateStudyDefaults } = await importSettings();
+    await expect(updateStudyDefaults({ sessionCardCount: 80, newCardsPerSession: 5 })).resolves.toMatchObject({ success: false });
+    expect(mock.from).not.toHaveBeenCalled();
+  });
+});
+
+describe('getAiUsage', () => {
+  it('reads the rolling window and reports when the oldest call frees', async () => {
+    client({ rpcs: { get_ai_usage_summary: { data: [{ calls_used: 38, oldest_call_at: '2026-10-01T08:00:00Z' }], error: null } } });
+    const { getAiUsage } = await importSettings();
+    await expect(getAiUsage()).resolves.toEqual({
+      success: true,
+      used: 38,
+      ceiling: 300,
+      nextFreesAt: '2026-10-02T08:00:00.000Z',
+    });
+  });
+});
+
+describe('sendPasswordResetLink', () => {
+  it('sends to the session address for a password account', async () => {
+    client();
+    const { sendPasswordResetLink } = await importSettings();
+    await expect(sendPasswordResetLink()).resolves.toMatchObject({ success: true });
+    expect(mocks.resetPassword).toHaveBeenCalledWith({ email: EMAIL });
+  });
+
+  it('refuses an OAuth-only account', async () => {
+    client({ providers: ['google'] });
+    const { sendPasswordResetLink } = await importSettings();
+    await expect(sendPasswordResetLink()).resolves.toMatchObject({ error: expect.stringContaining('without a password') });
+    expect(mocks.resetPassword).not.toHaveBeenCalled();
+  });
+});
+
+describe('signOutEverywhere', () => {
+  it('revokes every session, then leaves for the login page', async () => {
+    const mock = client();
+    const { signOutEverywhere } = await importSettings();
+    await expect(signOutEverywhere()).rejects.toThrow('NEXT_REDIRECT /login');
+    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
+  });
+});
+
+describe('deleteAccount', () => {
+  const adminWith = (error: { message: string } | null = null) => {
+    const deleteUser = vi.fn(async () => ({ data: {}, error }));
+    mocks.admin = { auth: { admin: { deleteUser } } };
+    return deleteUser;
+  };
+
+  it('does nothing unless the typed email matches', async () => {
+    client();
+    const deleteUser = adminWith();
+    const { deleteAccount } = await importSettings();
+    await expect(deleteAccount({ confirmation: 'someone@else.com' })).resolves.toMatchObject({ error: expect.stringContaining('Nothing was deleted') });
+    expect(deleteUser).not.toHaveBeenCalled();
+  });
+
+  it('is unavailable without the service-role key', async () => {
+    client();
+    const { deleteAccount } = await importSettings();
+    await expect(deleteAccount({ confirmation: EMAIL })).resolves.toMatchObject({ error: expect.stringContaining('not available') });
+  });
+
+  it('keeps the user signed in and says so when deletion fails', async () => {
+    const mock = client();
+    adminWith({ message: 'boom' });
+    const { deleteAccount } = await importSettings();
+    await expect(deleteAccount({ confirmation: EMAIL })).resolves.toMatchObject({ error: expect.stringContaining('was not deleted') });
+    expect(mock.auth.signOut).not.toHaveBeenCalled();
+  });
+
+  it('deletes this user, clears the local session and leaves', async () => {
+    const mock = client();
+    const deleteUser = adminWith();
+    const { deleteAccount } = await importSettings();
+    await expect(deleteAccount({ confirmation: ` ${EMAIL.toUpperCase()} ` })).rejects.toThrow('NEXT_REDIRECT /?account=deleted');
+    expect(deleteUser).toHaveBeenCalledWith(USER.id);
+    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
+  });
+});
+
+describe('the service-role client stays in one place', () => {
+  it('is imported by settings.ts and nothing else', () => {
+    const root = path.resolve(__dirname, '../..');
+    const importers: string[] = [];
+    const walk = (dir: string) => {
+      for (const name of readdirSync(dir)) {
+        const full = path.join(dir, name);
+        if (statSync(full).isDirectory()) walk(full);
+        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(full, 'utf8').includes('@/lib/supabase/admin')) {
+          importers.push(path.relative(root, full));
+        }
+      }
+    };
+    walk(root);
+    expect(importers).toEqual([path.join('app', 'actions', 'settings.ts')]);
+  });
+});
diff --git a/src/app/actions/settings.ts b/src/app/actions/settings.ts
new file mode 100644
index 0000000..abb32bd
--- /dev/null
+++ b/src/app/actions/settings.ts
@@ -0,0 +1,172 @@
+'use server';
+
+import { revalidatePath } from 'next/cache';
+import { redirect } from 'next/navigation';
+
+import { resetPassword } from '@/app/auth/actions';
+import { guardAction } from '@/lib/action-guard';
+import { aiUsageReading } from '@/lib/ai-usage';
+import { logger } from '@/lib/logger';
+import { sanitizeDatabaseError } from '@/lib/server-errors';
+import { createAdminClient } from '@/lib/supabase/admin';
+import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
+import { DEFAULT_USER_SETTINGS, displayNameSchema, studyDefaultsSchema, type StudyDefaults } from '@/lib/user-settings';
+
+/*
+ * Settings (sidebar plan §5). Account-scoped values go to `user_settings`
+ * (202610010900) through its owner policies; nothing here needs more than
+ * the caller's own session, except deleteAccount, which is the only user of
+ * the service-role client.
+ */
+
+async function signedIn() {
+  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
+  return user ? { supabase, user } : null;
+}
+
+function firstIssue(issues: { message: string }[], fallback: string): string {
+  return issues[0]?.message ?? fallback;
+}
+
+/** Everything that renders the name or the defaults sits under the dashboard layout. */
+function revalidateShell() {
+  revalidatePath('/dashboard', 'layout');
+}
+
+export async function updateDisplayName(raw: string) {
+  return guardAction('Display name', async () => {
+    const parsed = displayNameSchema.safeParse(typeof raw === 'string' ? raw : '');
+    if (!parsed.success) return { error: firstIssue(parsed.error.issues, 'That name cannot be used.') };
+
+    const session = await signedIn();
+    if (!session) return { error: 'You must be logged in.' };
+
+    // PostgREST's upsert writes only the columns sent, so the study defaults survive.
+    const { error } = await session.supabase
+      .from('user_settings')
+      .upsert(
+        { user_id: session.user.id, display_name: parsed.data, updated_at: new Date().toISOString() },
+        { onConflict: 'user_id' },
+      );
+    if (error) return { error: sanitizeDatabaseError(error, 'Could not save your name.') };
+
+    revalidateShell();
+    return { success: true as const, displayName: parsed.data };
+  });
+}
+
+export async function updateStudyDefaults(input: StudyDefaults) {
+  return guardAction('Study defaults', async () => {
+    const parsed = studyDefaultsSchema.safeParse(input);
+    if (!parsed.success) return { error: firstIssue(parsed.error.issues, 'Those values are out of range.') };
+
+    const session = await signedIn();
+    if (!session) return { error: 'You must be logged in.' };
+
+    const { error } = await session.supabase
+      .from('user_settings')
+      .upsert(
+        {
+          user_id: session.user.id,
+          session_card_count: parsed.data.sessionCardCount,
+          new_cards_per_session: parsed.data.newCardsPerSession,
+          updated_at: new Date().toISOString(),
+        },
+        { onConflict: 'user_id' },
+      );
+    if (error) return { error: sanitizeDatabaseError(error, 'Could not save your study defaults.') };
+
+    revalidateShell();
+    return { success: true as const, ...parsed.data };
+  });
+}
+
+export async function resetStudyDefaults() {
+  return updateStudyDefaults({
+    sessionCardCount: DEFAULT_USER_SETTINGS.sessionCardCount,
+    newCardsPerSession: DEFAULT_USER_SETTINGS.newCardsPerSession,
+  });
+}
+
+/** Read on demand by the account menu and Settings, never by the shell on every navigation. */
+export async function getAiUsage() {
+  return guardAction('AI usage', async () => {
+    const session = await signedIn();
+    if (!session) return { error: 'You must be logged in.' };
+
+    const { data, error } = await session.supabase.rpc('get_ai_usage_summary');
+    if (error) return { error: sanitizeDatabaseError(error, 'Could not read your AI usage.') };
+
+    const reading = aiUsageReading(data?.[0] ?? null);
+    return {
+      success: true as const,
+      used: reading.used,
+      ceiling: reading.ceiling,
+      nextFreesAt: reading.nextFreesAt?.toISOString() ?? null,
+    };
+  });
+}
+
+/** Only for accounts that sign in with a password; OAuth accounts have none to reset. */
+export async function sendPasswordResetLink() {
+  return guardAction('Password reset', async () => {
+    const session = await signedIn();
+    if (!session) return { error: 'You must be logged in.' };
+    if (!session.user.email || !session.user.providers.includes('email')) {
+      return { error: 'This account signs in without a password.' };
+    }
+    const result = await resetPassword({ email: session.user.email });
+    return 'error' in result && result.error ? { error: result.error } : { success: true as const };
+  });
+}
+
+/**
+ * Revokes every refresh token for the account, this browser's included.
+ * Not wrapped in guardAction: `redirect` works by throwing, and the guard
+ * would catch it — the same reason `logout` is unwrapped.
+ */
+export async function signOutEverywhere() {
+  const supabase = await getRequestClient();
+  const { error } = await supabase.auth.signOut({ scope: 'global' });
+  if (error) logger.warn('auth', 'global sign-out failed', { message: error.message });
+  revalidatePath('/', 'layout');
+  redirect('/login');
+}
+
+/**
+ * Deletes the auth user; every public table cascades from auth.users (checked
+ * by production assertion 18 before this ships). The confirmation is the
+ * account's email, typed — a button alone is one mis-click from gone.
+ */
+export async function deleteAccount(input: { confirmation: string }) {
+  const result = await guardAction('Account delete', async () => {
+    const session = await signedIn();
+    if (!session) return { error: 'You must be logged in.' };
+
+    const expected = (session.user.email ?? 'delete my account').trim().toLowerCase();
+    const typed = typeof input?.confirmation === 'string' ? input.confirmation.trim().toLowerCase() : '';
+    if (typed !== expected) return { error: 'That does not match. Nothing was deleted.' };
+
+    const admin = createAdminClient();
+    if (!admin) return { error: 'Account deletion is not available right now.' };
+
+    const { error } = await admin.auth.admin.deleteUser(session.user.id);
+    if (error) {
+      logger.error('account', 'deleteUser failed', { message: error.message });
+      return { error: 'Your account was not deleted. Please try again.' };
+    }
+
+    logger.info('account', 'account deleted', { user_id: session.user.id });
+    return { success: true as const };
+  });
+
+  if ('success' in result && result.success) {
+    // The user is gone; clearing this browser's cookies is all that is left.
+    const supabase = await getRequestClient();
+    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
+    revalidatePath('/', 'layout');
+    redirect('/?account=deleted');
+  }
+
+  return result;
+}
diff --git a/src/lib/ai-usage.test.ts b/src/lib/ai-usage.test.ts
new file mode 100644
index 0000000..0cb85d8
--- /dev/null
+++ b/src/lib/ai-usage.test.ts
@@ -0,0 +1,38 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+import { DAILY_AI_CALL_CEILING, aiUsageReading } from './ai-usage';
+
+describe('aiUsageReading', () => {
+  it('reads no usage as an empty meter', () => {
+    expect(aiUsageReading(null)).toEqual({
+      used: 0,
+      ceiling: DAILY_AI_CALL_CEILING,
+      remaining: DAILY_AI_CALL_CEILING,
+      fraction: 0,
+      atLimit: false,
+      nextFreesAt: null,
+    });
+  });
+
+  it('computes the meter and when the oldest call leaves the window', () => {
+    const reading = aiUsageReading({ calls_used: 38, oldest_call_at: '2026-10-01T08:00:00Z' });
+    expect(reading.remaining).toBe(262);
+    expect(reading.fraction).toBeCloseTo(38 / 300);
+    expect(reading.nextFreesAt?.toISOString()).toBe('2026-10-02T08:00:00.000Z');
+  });
+
+  it('clamps at the ceiling and survives junk', () => {
+    expect(aiUsageReading({ calls_used: 340, oldest_call_at: null })).toMatchObject({ fraction: 1, remaining: 0, atLimit: true });
+    expect(aiUsageReading({ calls_used: -5, oldest_call_at: 'not a date' })).toMatchObject({ used: 0, nextFreesAt: null });
+  });
+});
+
+describe('one ceiling', () => {
+  it('is the number the reservation passes to reserve_ai_call', () => {
+    const shared = readFileSync(path.resolve(__dirname, '../app/actions/_shared.ts'), 'utf8');
+    expect(shared).toMatch(/import \{[^}]*DAILY_AI_CALL_CEILING[^}]*\} from '@\/lib\/ai-usage'/);
+    expect(shared).not.toMatch(/const DAILY_AI_CALL_CEILING/);
+  });
+});
diff --git a/src/lib/ai-usage.ts b/src/lib/ai-usage.ts
new file mode 100644
index 0000000..1d09bf2
--- /dev/null
+++ b/src/lib/ai-usage.ts
@@ -0,0 +1,53 @@
+/**
+ * The daily AI budget, as the account menu and Settings → Usage & privacy
+ * show it (sidebar plan §5.8, SET-07).
+ *
+ * The ceiling moves here from `src/app/actions/_shared.ts`, which imports the
+ * server session and so cannot reach a client component. `_shared.ts`
+ * re-imports it; there is still exactly one number.
+ */
+
+/**
+ * Model calls per user over a rolling 24 hours, across every action.
+ * Enforced inside `reserve_ai_call` (202609170900) under an advisory lock.
+ */
+export const DAILY_AI_CALL_CEILING = 300;
+
+export const AI_USAGE_WINDOW_HOURS = 24;
+
+/** What `get_ai_usage_summary` returns (202610010910). */
+export type AiUsageRow = { calls_used: number | null; oldest_call_at: string | null };
+
+export type AiUsageReading = {
+  used: number;
+  ceiling: number;
+  remaining: number;
+  /** 0–1, for the meter. */
+  fraction: number;
+  atLimit: boolean;
+  /**
+   * When the oldest call in the window leaves it and frees its share. Null
+   * with no calls in the window. It frees that call's share only — the
+   * window rolls, it does not reset at midnight.
+   */
+  nextFreesAt: Date | null;
+};
+
+export function aiUsageReading(row: AiUsageRow | null | undefined, ceiling = DAILY_AI_CALL_CEILING): AiUsageReading {
+  const used = Math.max(0, Math.floor(Number(row?.calls_used ?? 0)) || 0);
+  const safeCeiling = Math.max(1, Math.floor(ceiling));
+  const oldest = row?.oldest_call_at ? new Date(row.oldest_call_at) : null;
+  const nextFreesAt =
+    oldest && !Number.isNaN(oldest.getTime()) && used > 0
+      ? new Date(oldest.getTime() + AI_USAGE_WINDOW_HOURS * 60 * 60 * 1000)
+      : null;
+
+  return {
+    used,
+    ceiling: safeCeiling,
+    remaining: Math.max(0, safeCeiling - used),
+    fraction: Math.min(1, used / safeCeiling),
+    atLimit: used >= safeCeiling,
+    nextFreesAt,
+  };
+}
diff --git a/src/lib/deck-export.test.ts b/src/lib/deck-export.test.ts
index 54b430b..6f58e25 100644
--- a/src/lib/deck-export.test.ts
+++ b/src/lib/deck-export.test.ts
@@ -1,13 +1,18 @@
 import { describe, expect, it } from 'vitest';
 import {
   CSV_HEADER,
+  CSV_HEADER_ALL,
   ankiHeader,
+  ankiHeaderAll,
   csvCell,
+  exportAllFilename,
   exportFilename,
   toAnkiField,
   toAnkiRow,
+  toAnkiRowWithDeck,
   toAnkiTags,
   toCsvRow,
+  toCsvRowWithDeck,
   type ExportCard,
 } from '@/lib/deck-export';
 
@@ -92,3 +97,37 @@ describe('deck export — file names', () => {
     expect(exportFilename('日本語', 'anki')).toBe('deck.anki.txt');
   });
 });
+
+describe('export all decks (sidebar plan §4.5)', () => {
+  const card: ExportCard = {
+    id: 'c1',
+    front: 'Mitochondria',
+    back: 'Site of the Krebs cycle?',
+    explanation: null,
+    topic_tags: ['cell'],
+    state: 'review',
+    interval: 4,
+    ease_factor: 2.5,
+    next_review_at: '2026-10-02T00:00:00Z',
+  };
+
+  it('prefixes the single-deck CSV row with a deck cell, escaped like any other', () => {
+    expect(CSV_HEADER_ALL.startsWith('deck,question,answer')).toBe(true);
+    expect(toCsvRowWithDeck('Bio, Ch. 4', card)).toBe(`"Bio, Ch. 4",${toCsvRow(card)}`);
+    expect(toCsvRowWithDeck('=HYPERLINK()', card).startsWith("'=HYPERLINK()")).toBe(true);
+  });
+
+  it('adds a fifth Anki column naming the deck, with the header that points at it', () => {
+    expect(ankiHeaderAll()).toContain('#deck column:5');
+    expect(ankiHeaderAll()).not.toContain('#deck:');
+    const row = toAnkiRowWithDeck('Cell Biology', card);
+    expect(row.endsWith('\tCognit::Cell Biology\n')).toBe(true);
+    expect(row.split('\t')).toHaveLength(5);
+    expect(row.split('\t')[3]).toBe('cognit-c1');
+  });
+
+  it('dates the file name', () => {
+    expect(exportAllFilename('csv', new Date('2026-10-01T12:00:00Z'))).toBe('cognit-decks-2026-10-01.csv');
+    expect(exportAllFilename('anki', new Date('2026-10-01T12:00:00Z'))).toBe('cognit-decks-2026-10-01.anki.txt');
+  });
+});
diff --git a/src/lib/deck-export.ts b/src/lib/deck-export.ts
index dce0ad5..237184d 100644
--- a/src/lib/deck-export.ts
+++ b/src/lib/deck-export.ts
@@ -132,3 +132,39 @@ export function exportFilename(title: string, format: ExportFormat): string {
     .slice(0, 60);
   return `${base || 'deck'}.${format === 'anki' ? 'anki.txt' : 'csv'}`;
 }
+
+/* ── Every deck in one file (sidebar plan §4.5, DST-04) ───────────── */
+
+/** The CSV header with a leading `deck` column; the rest is CSV_HEADER unchanged. */
+export const CSV_HEADER_ALL = `deck,${CSV_HEADER}`;
+
+export function toCsvRowWithDeck(deckTitle: string, card: ExportCard): string {
+  return `${csvCell(deckTitle)},${toCsvRow(card)}`;
+}
+
+/**
+ * Anki's per-row deck column (`#deck column:N`, Anki ≥ 2.1.55) files every
+ * note under its own `Cognit::<deck>`, so one import rebuilds the library.
+ * GUIDs are the same `cognit-<card id>` as the single-deck export, so
+ * importing both never duplicates a note.
+ */
+export function ankiHeaderAll(): string {
+  return [
+    '#separator:tab',
+    '#html:true',
+    '#notetype:Basic',
+    '#columns:Front\tBack\tTags\tGUID\tDeck',
+    '#tags column:3',
+    '#guid column:4',
+    '#deck column:5',
+  ].join('\n') + '\n';
+}
+
+export function toAnkiRowWithDeck(deckTitle: string, card: ExportCard): string {
+  return `${toAnkiRow(card).replace(/\n$/, '')}\t${ankiDeckName(deckTitle)}\n`;
+}
+
+/** `cognit-decks-2026-10-01.csv`: dated, since the whole library changes daily. */
+export function exportAllFilename(format: ExportFormat, now: Date): string {
+  return `cognit-decks-${now.toISOString().slice(0, 10)}.${format === 'anki' ? 'anki.txt' : 'csv'}`;
+}
diff --git a/src/lib/display-name.test.ts b/src/lib/display-name.test.ts
index b85981a..3b34705 100644
--- a/src/lib/display-name.test.ts
+++ b/src/lib/display-name.test.ts
@@ -89,3 +89,21 @@ describe('greetingForHour', () => {
     expect(greetingForHour(23)).toBe('evening');
   });
 });
+
+describe('a name chosen in Settings (sidebar plan §5.2)', () => {
+  const user = { email: 'santiagomarcstephen@gmail.com', user_metadata: { full_name: 'Marc Santiago' } };
+
+  it('wins over metadata and the address, and is used whole', () => {
+    expect(resolveDisplayName(user, 'Dr. Santiago')).toBe('Dr. Santiago');
+  });
+
+  it('falls through when unset, blank or address-shaped', () => {
+    expect(resolveDisplayName(user, null)).toBe('Marc');
+    expect(resolveDisplayName(user, '  ')).toBe('Marc');
+    expect(resolveDisplayName(user, 'me@example.com')).toBe('Marc');
+  });
+
+  it('works with no user at all', () => {
+    expect(resolveDisplayName(null, 'Marc')).toBe('Marc');
+  });
+});
diff --git a/src/lib/display-name.ts b/src/lib/display-name.ts
index 4f25011..9078a6a 100644
--- a/src/lib/display-name.ts
+++ b/src/lib/display-name.ts
@@ -44,7 +44,16 @@ function firstWord(value: unknown): string | null {
  * evening," with nothing after the comma is a bug, not a degraded state. It is
  * why the greeting carries no information and the sub-line carries all of it.
  */
-export function resolveDisplayName(user: NameSource | null | undefined): string | null {
+export function resolveDisplayName(
+  user: NameSource | null | undefined,
+  /**
+   * The name set in Settings → Profile (`user_settings.display_name`, sidebar
+   * plan §5.2). Already normalised and address-free by settingsFromRow; a
+   * chosen name is used whole, not cut to its first word.
+   */
+  chosen?: string | null,
+): string | null {
+  if (typeof chosen === 'string' && chosen.trim() && !chosen.includes('@')) return chosen.trim();
   if (!user) return null;
 
   const meta = user.user_metadata ?? {};
diff --git a/src/lib/shell-nav.ts b/src/lib/shell-nav.ts
index 368f1f9..20a64c4 100644
--- a/src/lib/shell-nav.ts
+++ b/src/lib/shell-nav.ts
@@ -1,7 +1,10 @@
 import 'server-only';
 import { cache } from 'react';
-import { getDueByDeck, getRequestClient } from '@/lib/supabase/session';
+import { getDueByDeck, getDueDrills, getRequestClient, getUserSettings } from '@/lib/supabase/session';
 import { removeDeckTagFromTitle } from '@/lib/deck-tags';
+import { logger } from '@/lib/logger';
+import type { SidebarCounts } from '@/lib/sidebar-nav';
+import type { UserSettings } from '@/lib/user-settings';
 
 /**
  * How many decks the rail's palette and breadcrumb can name. Past this the
@@ -67,3 +70,44 @@ export const loadShellNav = cache(async (userId: string): Promise<ShellNav> => {
 
   return { decks, totalDue, sessionHref };
 });
+
+// ── The sidebar (sidebar plan §6.3, NAV-03) ─────────────────────────
+
+export type SidebarData = ShellNav & {
+  counts: SidebarCounts;
+  settings: UserSettings;
+};
+
+/**
+ * Everything the sidebar's streamed slots need, off one cached promise: the
+ * shell nav (decks, due), due drills, the trash/shared counts and the
+ * settings. One wave of reads, behind the sidebar's Suspense boundaries, so
+ * the frame still goes out on the first flush.
+ */
+export const loadSidebar = cache(async (userId: string): Promise<SidebarData> => {
+  const supabase = await getRequestClient();
+
+  const [nav, drills, countsResult, settings] = await Promise.all([
+    loadShellNav(userId),
+    getDueDrills(userId),
+    supabase.rpc('get_sidebar_counts'),
+    getUserSettings(userId),
+  ]);
+
+  if (countsResult.error) {
+    logger.error('sidebar', 'get_sidebar_counts failed', { message: countsResult.error.message });
+  }
+  const countRow = countsResult.data?.[0];
+
+  return {
+    ...nav,
+    settings,
+    counts: {
+      due: nav.totalDue,
+      drillsDue: drills.total,
+      drillsTruncated: drills.truncated,
+      shared: countRow?.shared_count ?? 0,
+      trashed: countRow?.trashed_count ?? 0,
+    },
+  };
+});
diff --git a/src/lib/sidebar-nav.test.ts b/src/lib/sidebar-nav.test.ts
new file mode 100644
index 0000000..c180026
--- /dev/null
+++ b/src/lib/sidebar-nav.test.ts
@@ -0,0 +1,133 @@
+import { describe, expect, it } from 'vitest';
+
+import {
+  SETTINGS_SECTIONS,
+  SIDEBAR_DECK_LIMIT,
+  activeDeckId,
+  activeSidebarItem,
+  buildSidebarItems,
+  dashboardLocation,
+  formatCount,
+  parseSidebarPreference,
+  sidebarDecks,
+  sidebarMode,
+  type SidebarCounts,
+} from './sidebar-nav';
+
+const DECK = '00000000-0000-4000-8000-000000000001';
+const COUNTS: SidebarCounts = { due: 47, drillsDue: 4, drillsTruncated: false, shared: 2, trashed: 1 };
+
+describe('dashboardLocation', () => {
+  it('names Today, the named routes and decks', () => {
+    expect(dashboardLocation('/dashboard')).toEqual({ kind: 'today' });
+    expect(dashboardLocation('/dashboard/stats')).toEqual({ kind: 'named', segment: 'stats', label: 'Statistics' });
+    expect(dashboardLocation('/dashboard/settings')).toMatchObject({ segment: 'settings' });
+    expect(dashboardLocation(`/dashboard/${DECK}`)).toEqual({ kind: 'deck', deckId: DECK });
+    expect(dashboardLocation(`/dashboard/${DECK}/study`)).toEqual({ kind: 'deck', deckId: DECK });
+    expect(dashboardLocation('/explore')).toEqual({ kind: 'outside' });
+  });
+
+  it('does not treat an Object.prototype key as a named route', () => {
+    expect(dashboardLocation('/dashboard/constructor')).toEqual({ kind: 'deck', deckId: 'constructor' });
+  });
+});
+
+describe('active item', () => {
+  it('marks the destination, and no item on a deck or in settings', () => {
+    expect(activeSidebarItem('/dashboard')).toBe('today');
+    expect(activeSidebarItem('/dashboard/drills')).toBe('drills');
+    expect(activeSidebarItem('/dashboard/trash')).toBe('trash');
+    expect(activeSidebarItem(`/dashboard/${DECK}`)).toBeNull();
+    expect(activeSidebarItem('/dashboard/settings')).toBeNull();
+    expect(activeDeckId(`/dashboard/${DECK}`)).toBe(DECK);
+    expect(activeDeckId('/dashboard/shared')).toBeNull();
+  });
+
+  it('switches to settings mode only under /dashboard/settings', () => {
+    expect(sidebarMode('/dashboard/settings')).toBe('settings');
+    expect(sidebarMode('/dashboard')).toBe('app');
+    expect(sidebarMode(`/dashboard/${DECK}`)).toBe('app');
+  });
+});
+
+describe('formatCount', () => {
+  it('prints nothing for zero, caps at 999+ and marks a floor', () => {
+    expect(formatCount(0)).toBeNull();
+    expect(formatCount(-3)).toBeNull();
+    expect(formatCount(Number.NaN)).toBeNull();
+    expect(formatCount(47)).toBe('47');
+    expect(formatCount(1200)).toBe('999+');
+    expect(formatCount(200, true)).toBe('200+');
+  });
+});
+
+describe('buildSidebarItems', () => {
+  it('lists the destinations in order, Explore only behind its flag', () => {
+    expect(buildSidebarItems({ counts: COUNTS, exploreEnabled: false }).map((item) => item.id)).toEqual([
+      'today',
+      'drills',
+      'stats',
+      'shared',
+      'trash',
+    ]);
+    expect(buildSidebarItems({ counts: COUNTS, exploreEnabled: true }).map((item) => item.id)).toContain('explore');
+  });
+
+  it('badges with words for the accessible name, and only due work takes the due tone', () => {
+    const items = buildSidebarItems({ counts: COUNTS, exploreEnabled: false });
+    const today = items.find((item) => item.id === 'today');
+    expect(today).toMatchObject({ count: '47', countLabel: '47 due', tone: 'due' });
+    expect(items.find((item) => item.id === 'trash')).toMatchObject({ count: '1', countLabel: '1 in trash', tone: 'ink' });
+    expect(items.find((item) => item.id === 'stats')?.count).toBeNull();
+  });
+
+  it('renders every item with no badges while counts are loading', () => {
+    const items = buildSidebarItems({ counts: null, exploreEnabled: false });
+    expect(items).toHaveLength(5);
+    expect(items.every((item) => item.count === null && item.countLabel === null)).toBe(true);
+  });
+
+  it('marks a truncated drill count as a floor', () => {
+    const drills = buildSidebarItems({ counts: { ...COUNTS, drillsDue: 200, drillsTruncated: true }, exploreEnabled: false })
+      .find((item) => item.id === 'drills');
+    expect(drills?.count).toBe('200+');
+  });
+});
+
+describe('sidebarDecks', () => {
+  const decks = [
+    { id: 'a', title: 'Recent, nothing due', dueCount: 0 },
+    { id: 'b', title: 'Some due', dueCount: 9 },
+    { id: 'c', title: 'Most due', dueCount: 21 },
+    { id: 'd', title: 'Older, nothing due', dueCount: 0 },
+  ];
+
+  it('puts due work first and otherwise keeps the recency order', () => {
+    expect(sidebarDecks(decks).shown.map((deck) => deck.id)).toEqual(['c', 'b', 'a', 'd']);
+  });
+
+  it('caps the list and reports how many it hid', () => {
+    const many = Array.from({ length: SIDEBAR_DECK_LIMIT + 3 }, (_, i) => ({ id: `${i}`, title: `${i}`, dueCount: 0 }));
+    const { shown, hiddenCount } = sidebarDecks(many);
+    expect(shown).toHaveLength(SIDEBAR_DECK_LIMIT);
+    expect(hiddenCount).toBe(3);
+    expect(sidebarDecks(decks, 2)).toMatchObject({ hiddenCount: 2 });
+  });
+});
+
+describe('settings sections', () => {
+  it('have unique ids, usable as fragment anchors', () => {
+    const ids = SETTINGS_SECTIONS.map((section) => section.id);
+    expect(new Set(ids).size).toBe(ids.length);
+    expect(ids.every((id) => /^[a-z]+$/.test(id))).toBe(true);
+  });
+});
+
+describe('parseSidebarPreference', () => {
+  it('reads the cookie, defaulting to auto', () => {
+    expect(parseSidebarPreference('collapsed')).toBe('collapsed');
+    expect(parseSidebarPreference('expanded')).toBe('expanded');
+    expect(parseSidebarPreference(undefined)).toBe('auto');
+    expect(parseSidebarPreference('wide')).toBe('auto');
+  });
+});
diff --git a/src/lib/sidebar-nav.ts b/src/lib/sidebar-nav.ts
new file mode 100644
index 0000000..0e96504
--- /dev/null
+++ b/src/lib/sidebar-nav.ts
@@ -0,0 +1,221 @@
+/**
+ * The sidebar's model (sidebar plan §6.4, NAV-04): which destinations exist,
+ * what each counts, which is current, and which decks the Library lists.
+ *
+ * Pure and framework-free so every rule here is unit-tested; `Sidebar.tsx`
+ * only renders what this returns. The breadcrumb reads the same segment map,
+ * so a new named route is added in one place.
+ */
+
+// ── Routes ───────────────────────────────────────────────────────────
+
+/** Named routes under /dashboard. Any other first segment is a deck id. */
+export const NAMED_DASHBOARD_SEGMENTS = {
+  stats: 'Statistics',
+  drills: 'Drills',
+  shared: 'Shared',
+  trash: 'Trash',
+  settings: 'Settings',
+} as const;
+
+export type NamedSegment = keyof typeof NAMED_DASHBOARD_SEGMENTS;
+
+export type DashboardLocation =
+  | { kind: 'today' }
+  | { kind: 'named'; segment: NamedSegment; label: string }
+  | { kind: 'deck'; deckId: string }
+  | { kind: 'outside' };
+
+export function dashboardLocation(pathname: string): DashboardLocation {
+  if (pathname === '/dashboard' || pathname === '/dashboard/') return { kind: 'today' };
+  const segment = pathname.match(/^\/dashboard\/([^/?#]+)/)?.[1];
+  if (!segment) return { kind: 'outside' };
+  if (Object.hasOwn(NAMED_DASHBOARD_SEGMENTS, segment)) {
+    const named = segment as NamedSegment;
+    return { kind: 'named', segment: named, label: NAMED_DASHBOARD_SEGMENTS[named] };
+  }
+  return { kind: 'deck', deckId: segment };
+}
+
+/** Settings swaps the sidebar's contents for its own sections (plan §6.4). */
+export function sidebarMode(pathname: string): 'app' | 'settings' {
+  const location = dashboardLocation(pathname);
+  return location.kind === 'named' && location.segment === 'settings' ? 'settings' : 'app';
+}
+
+// ── Items ────────────────────────────────────────────────────────────
+
+export type SidebarItemId = 'today' | 'drills' | 'stats' | 'shared' | 'explore' | 'trash';
+
+export type SidebarCounts = {
+  due: number;
+  drillsDue: number;
+  /** loadDueDrillsByDeck hit its row cap, so drillsDue is a floor. */
+  drillsTruncated: boolean;
+  shared: number;
+  trashed: number;
+};
+
+export type SidebarItem = {
+  id: SidebarItemId;
+  label: string;
+  href: string;
+  group: 'study' | 'library';
+  /** What the badge prints, or null for no badge. */
+  count: string | null;
+  /** The badge as words, for the accessible name ("47 due"). */
+  countLabel: string | null;
+  /** `due` only where the number is due work — the state channel (design system §2.2). */
+  tone: 'due' | 'ink';
+};
+
+export function activeSidebarItem(pathname: string): SidebarItemId | null {
+  const location = dashboardLocation(pathname);
+  if (location.kind === 'today') return 'today';
+  if (location.kind !== 'named') return null;
+  switch (location.segment) {
+    case 'stats':
+      return 'stats';
+    case 'drills':
+      return 'drills';
+    case 'shared':
+      return 'shared';
+    case 'trash':
+      return 'trash';
+    default:
+      return null;
+  }
+}
+
+export function activeDeckId(pathname: string): string | null {
+  const location = dashboardLocation(pathname);
+  return location.kind === 'deck' ? location.deckId : null;
+}
+
+/** 0 prints nothing: an empty badge is noise, and "0 due" is what the page says. */
+export function formatCount(value: number, truncated = false): string | null {
+  if (!Number.isFinite(value) || value <= 0) return null;
+  if (value > 999) return '999+';
+  return truncated ? `${value}+` : String(value);
+}
+
+function badge(value: number | undefined, noun: (count: string) => string, truncated = false) {
+  if (value === undefined) return { count: null, countLabel: null };
+  const count = formatCount(value, truncated);
+  return { count, countLabel: count ? noun(count) : null };
+}
+
+/**
+ * The destinations, in render order. `counts` is null while the sidebar's
+ * reads are still streaming: the items render at once, their badges after.
+ */
+export function buildSidebarItems(input: { counts: SidebarCounts | null; exploreEnabled: boolean }): SidebarItem[] {
+  const { counts, exploreEnabled } = input;
+
+  const items: SidebarItem[] = [
+    {
+      id: 'today',
+      label: 'Today',
+      href: '/dashboard',
+      group: 'study',
+      tone: 'due',
+      ...badge(counts?.due, (n) => `${n} due`),
+    },
+    {
+      id: 'drills',
+      label: 'Drills',
+      href: '/dashboard/drills',
+      group: 'study',
+      tone: 'due',
+      ...badge(counts?.drillsDue, (n) => `${n} drills due`, counts?.drillsTruncated ?? false),
+    },
+    { id: 'stats', label: 'Statistics', href: '/dashboard/stats', group: 'study', tone: 'ink', count: null, countLabel: null },
+    {
+      id: 'shared',
+      label: 'Shared',
+      href: '/dashboard/shared',
+      group: 'library',
+      tone: 'ink',
+      ...badge(counts?.shared, (n) => `${n} shared`),
+    },
+  ];
+
+  if (exploreEnabled) {
+    items.push({ id: 'explore', label: 'Explore', href: '/explore', group: 'library', tone: 'ink', count: null, countLabel: null });
+  }
+
+  items.push({
+    id: 'trash',
+    label: 'Trash',
+    href: '/dashboard/trash',
+    group: 'library',
+    tone: 'ink',
+    ...badge(counts?.trashed, (n) => `${n} in trash`),
+  });
+
+  return items;
+}
+
+// ── Library decks ────────────────────────────────────────────────────
+
+export type SidebarDeck = { id: string; title: string; dueCount: number };
+
+/** Past this the list ends in "All N decks", which goes to Today's index. */
+export const SIDEBAR_DECK_LIMIT = 12;
+
+/**
+ * Decks with work first, most due first; ties keep the caller's order, which
+ * is most recently updated (loadShellNav). A sidebar that reorders on every
+ * visit is hard to find things in, so only due work moves a deck up.
+ */
+export function sidebarDecks(decks: SidebarDeck[], limit = SIDEBAR_DECK_LIMIT): { shown: SidebarDeck[]; hiddenCount: number } {
+  const ordered = decks
+    .map((deck, index) => ({ deck, index }))
+    .sort((a, b) => b.deck.dueCount - a.deck.dueCount || a.index - b.index)
+    .map(({ deck }) => deck);
+  const cap = Math.max(0, Math.floor(limit));
+  return { shown: ordered.slice(0, cap), hiddenCount: Math.max(0, ordered.length - cap) };
+}
+
+// ── Settings sections (sidebar in settings mode, plan §6.4) ───────────────
+
+export type SettingsSectionId =
+  | 'profile'
+  | 'security'
+  | 'appearance'
+  | 'study'
+  | 'sound'
+  | 'shortcuts'
+  | 'ai'
+  | 'sharing'
+  | 'data'
+  | 'delete';
+
+export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; group: 'Account' | 'Preferences' | 'AI' | 'Data' }> = [
+  { id: 'profile', label: 'Profile', group: 'Account' },
+  { id: 'security', label: 'Sign-in & security', group: 'Account' },
+  { id: 'appearance', label: 'Appearance', group: 'Preferences' },
+  { id: 'study', label: 'Study', group: 'Preferences' },
+  { id: 'sound', label: 'Sound & haptics', group: 'Preferences' },
+  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Preferences' },
+  { id: 'ai', label: 'Usage & privacy', group: 'AI' },
+  { id: 'sharing', label: 'Sharing', group: 'Data' },
+  { id: 'data', label: 'Export & trash', group: 'Data' },
+  { id: 'delete', label: 'Delete account', group: 'Data' },
+];
+
+// ── Collapse preference (plan §6.2) ───────────────────────────────────────
+
+export const SIDEBAR_COOKIE = 'cognit-sidebar';
+
+/**
+ * `auto` (no cookie) lets CSS decide by width: collapsed from 768 to 1023 px,
+ * expanded from 1024. A choice the user makes is stored in a cookie so the
+ * server renders it — no reflow after hydration, which is why design system §8 used to
+ * forbid persisting the rail at all.
+ */
+export type SidebarPreference = 'auto' | 'expanded' | 'collapsed';
+
+export function parseSidebarPreference(value: string | undefined): SidebarPreference {
+  return value === 'expanded' || value === 'collapsed' ? value : 'auto';
+}
diff --git a/src/lib/study.test.ts b/src/lib/study.test.ts
index 5cbd9be..b90597c 100644
--- a/src/lib/study.test.ts
+++ b/src/lib/study.test.ts
@@ -1,5 +1,15 @@
 import { describe, expect, it } from 'vitest';
-import { MAX_SESSION_CARD_COUNT, interleaveNewCards, parseSessionCardIds } from './study';
+import {
+  DEFAULT_SESSION_CARD_COUNT,
+  MAX_SESSION_CARD_COUNT,
+  MIN_SESSION_CARD_COUNT,
+  NEW_CARDS_PER_SESSION,
+  getSessionCardBounds,
+  interleaveNewCards,
+  newCardAllowance,
+  normalizeSessionCardCount,
+  parseSessionCardIds,
+} from './study';
 
 const A = '00000000-0000-4000-8000-00000000000a';
 const B = '00000000-0000-4000-8000-00000000000b';
@@ -34,3 +44,34 @@ describe('interleaveNewCards', () => {
     expect(interleaveNewCards(['r1', 'r2'], ['n1', 'n2'], { every: 0 })).toEqual(['r1', 'n1', 'r2', 'n2']);
   });
 });
+
+describe('session size from the account default (sidebar plan §5.5)', () => {
+  it('uses the preferred count when there is no ?count=', () => {
+    expect(normalizeSessionCardCount(undefined, 200, 25)).toBe(25);
+    expect(normalizeSessionCardCount(undefined, 200)).toBe(DEFAULT_SESSION_CARD_COUNT);
+  });
+
+  it('lets an explicit ?count= win over the preference', () => {
+    expect(normalizeSessionCardCount('15', 200, 25)).toBe(15);
+  });
+
+  it('clamps the preference to the deck and to the global bounds', () => {
+    expect(normalizeSessionCardCount(undefined, 12, 25)).toBe(12);
+    expect(getSessionCardBounds(200, 500).defaultCount).toBe(MAX_SESSION_CARD_COUNT);
+    expect(getSessionCardBounds(200, 1).defaultCount).toBe(MIN_SESSION_CARD_COUNT);
+    expect(getSessionCardBounds(200, Number.NaN).defaultCount).toBe(DEFAULT_SESSION_CARD_COUNT);
+  });
+});
+
+describe('newCardAllowance', () => {
+  it('keeps the old formula at the old constant', () => {
+    expect(newCardAllowance(10, 20)).toBe(NEW_CARDS_PER_SESSION);
+    expect(newCardAllowance(10, 2)).toBe(8);
+  });
+
+  it('takes the account value, and zero means none while reviews fill the session', () => {
+    expect(newCardAllowance(10, 20, 0)).toBe(0);
+    expect(newCardAllowance(10, 4, 0)).toBe(6);
+    expect(newCardAllowance(10, 20, 12)).toBe(12);
+  });
+});
diff --git a/src/lib/study.ts b/src/lib/study.ts
index 888a6f1..3f6ffcd 100644
--- a/src/lib/study.ts
+++ b/src/lib/study.ts
@@ -52,7 +52,12 @@ export type StudySessionCard = {
   mnemonic: string | null;
 };
 
-export function getSessionCardBounds(availableCount: number) {
+/**
+ * `preferredCount` is the account's "cards per session" (Settings → Study,
+ * sidebar plan §5.5). It moves the default only; an explicit `?count=` still
+ * wins, and both are clamped to what the deck holds.
+ */
+export function getSessionCardBounds(availableCount: number, preferredCount = DEFAULT_SESSION_CARD_COUNT) {
   const safeAvailableCount = Math.max(0, availableCount);
 
   if (safeAvailableCount === 0) {
@@ -61,15 +66,32 @@ export function getSessionCardBounds(availableCount: number) {
 
   const max = Math.min(MAX_SESSION_CARD_COUNT, safeAvailableCount);
   const min = Math.min(MIN_SESSION_CARD_COUNT, max);
-  const defaultCount = Math.min(DEFAULT_SESSION_CARD_COUNT, max);
+  const preferred = Number.isFinite(preferredCount)
+    ? Math.min(MAX_SESSION_CARD_COUNT, Math.max(MIN_SESSION_CARD_COUNT, Math.round(preferredCount)))
+    : DEFAULT_SESSION_CARD_COUNT;
+  const defaultCount = Math.min(preferred, max);
 
   return { min, max, defaultCount };
 }
 
-export function normalizeSessionCardCount(rawCount: string | string[] | undefined, availableCount = MAX_SESSION_CARD_COUNT): number {
+/**
+ * How many unseen cards a session may take. At least `perSession`, and more
+ * when fewer reviews are due than the session holds — a brand-new deck still
+ * fills its session. Extracted from the study page unchanged, with the
+ * constant made a parameter.
+ */
+export function newCardAllowance(sessionCardCount: number, scheduledCount: number, perSession = NEW_CARDS_PER_SESSION): number {
+  return Math.max(Math.max(0, perSession), sessionCardCount - scheduledCount);
+}
+
+export function normalizeSessionCardCount(
+  rawCount: string | string[] | undefined,
+  availableCount = MAX_SESSION_CARD_COUNT,
+  preferredCount = DEFAULT_SESSION_CARD_COUNT,
+): number {
   const countValue = Array.isArray(rawCount) ? rawCount[0] : rawCount;
   const parsedCount = Number.parseInt(countValue ?? '', 10);
-  const { min, max, defaultCount } = getSessionCardBounds(availableCount);
+  const { min, max, defaultCount } = getSessionCardBounds(availableCount, preferredCount);
 
   if (max === 0) {
     return 0;
diff --git a/src/lib/supabase/admin.ts b/src/lib/supabase/admin.ts
new file mode 100644
index 0000000..d7a2e4b
--- /dev/null
+++ b/src/lib/supabase/admin.ts
@@ -0,0 +1,30 @@
+import 'server-only';
+import { createClient } from '@supabase/supabase-js';
+
+import type { Database } from '@/lib/database.types';
+import { publicEnv } from '@/lib/env-public';
+
+/**
+ * The one service-role client in the app (sidebar plan §5.11, SET-10). It
+ * exists for a single call — `auth.admin.deleteUser` — because deleting an
+ * auth user needs either this key or a SECURITY DEFINER function, and
+ * production assertion 2 forbids the latter.
+ *
+ * It bypasses RLS entirely. Nothing but `deleteAccount` may import it, which
+ * the settings test pins; never pass it to a loader or return it from a helper.
+ *
+ * Null when SUPABASE_SERVICE_ROLE_KEY is unset: Settings then shows account
+ * deletion as unavailable instead of offering a button that fails.
+ */
+export function createAdminClient() {
+  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
+  if (!key) return null;
+
+  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
+    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
+  });
+}
+
+export function accountDeletionAvailable(): boolean {
+  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
+}
diff --git a/src/lib/supabase/session.ts b/src/lib/supabase/session.ts
index 74ce6fe..796bc5c 100644
--- a/src/lib/supabase/session.ts
+++ b/src/lib/supabase/session.ts
@@ -4,6 +4,8 @@ import { createClient } from '@/lib/supabase/server';
 import { loadDueByDeckRows } from '@/lib/dashboard-due';
 import { logger } from '@/lib/logger';
 import { verifiedClaims } from '@/lib/supabase/claims';
+import { loadDueDrillsByDeck } from '@/lib/synthesis/loaders';
+import { settingsFromRow, type UserSettings } from '@/lib/user-settings';
 
 /**
  * Per-request memoisation of the reads every chromed route repeats.
@@ -28,6 +30,12 @@ export type SessionUser = {
   id: string;
   email: string | null;
   user_metadata: Record<string, unknown> | null;
+  /**
+   * The sign-in methods on the account (`app_metadata.providers`: 'email',
+   * 'google', 'github'). Settings shows a password row only for 'email'
+   * (sidebar plan §5.3).
+   */
+  providers: string[];
 };
 
 /**
@@ -54,6 +62,9 @@ export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
     id: claims.sub,
     email: claims.email ?? null,
     user_metadata: claims.user_metadata ?? null,
+    providers: Array.isArray(claims.app_metadata?.providers)
+      ? claims.app_metadata.providers.filter((provider): provider is string => typeof provider === 'string')
+      : [],
   };
 });
 
@@ -92,3 +103,29 @@ export const getDueByDeck = cache(async (userId: string) => {
   const supabase = await getRequestClient();
   return loadDueByDeckRows(supabase, userId, getRequestNow().toISOString());
 });
+
+/**
+ * The account's settings, once per request (sidebar plan §3.3, DATA-04).
+ * No row is every default. A failed read is logged and also reads as defaults:
+ * a settings outage must not take the dashboard down with it.
+ */
+export const getUserSettings = cache(async (userId: string): Promise<UserSettings> => {
+  const supabase = await getRequestClient();
+  const { data, error } = await supabase
+    .from('user_settings')
+    .select('display_name, session_card_count, new_cards_per_session')
+    .eq('user_id', userId)
+    .maybeSingle();
+
+  if (error) logger.error('settings', 'user_settings read failed', { message: error.message });
+  return settingsFromRow(data);
+});
+
+/**
+ * Due drills by deck, shared by the sidebar badge, Today's due band and the
+ * Drills page within one request, as getDueByDeck is.
+ */
+export const getDueDrills = cache(async (userId: string) => {
+  const supabase = await getRequestClient();
+  return loadDueDrillsByDeck(supabase, { userId, now: getRequestNow() });
+});
diff --git a/src/lib/synthesis/links.test.ts b/src/lib/synthesis/links.test.ts
new file mode 100644
index 0000000..3100edb
--- /dev/null
+++ b/src/lib/synthesis/links.test.ts
@@ -0,0 +1,15 @@
+import { describe, expect, it } from 'vitest';
+
+import { drillSessionHref } from './links';
+
+describe('drillSessionHref', () => {
+  it('launches up to three drills and pulls cards forward', () => {
+    expect(drillSessionHref('d1', 7)).toBe('/dashboard/d1/synthesis?count=3&pull=1');
+    expect(drillSessionHref('d1', 2)).toBe('/dashboard/d1/synthesis?count=2&pull=1');
+  });
+
+  it('never asks for fewer than one', () => {
+    expect(drillSessionHref('d1', 0)).toBe('/dashboard/d1/synthesis?count=1&pull=1');
+    expect(drillSessionHref('d1', Number.NaN)).toBe('/dashboard/d1/synthesis?count=1&pull=1');
+  });
+});
diff --git a/src/lib/synthesis/links.ts b/src/lib/synthesis/links.ts
new file mode 100644
index 0000000..6cf03ff
--- /dev/null
+++ b/src/lib/synthesis/links.ts
@@ -0,0 +1,11 @@
+/**
+ * Where "start drills on this deck" goes: up to three due drills, pulling the
+ * weakest cards forward (micro-synthesis spec §4.1). Shared by Today's due
+ * band and the Drills page (sidebar plan §4.2) so the two never disagree.
+ */
+export const DRILLS_PER_LAUNCH = 3;
+
+export function drillSessionHref(deckId: string, dueCount: number): string {
+  const count = Math.min(DRILLS_PER_LAUNCH, Math.max(1, Math.floor(dueCount) || 1));
+  return `/dashboard/${deckId}/synthesis?count=${count}&pull=1`;
+}
diff --git a/src/lib/theme.test.ts b/src/lib/theme.test.ts
new file mode 100644
index 0000000..f20f712
--- /dev/null
+++ b/src/lib/theme.test.ts
@@ -0,0 +1,55 @@
+import { describe, expect, it } from 'vitest';
+
+import { THEME_BOOTSTRAP } from './theme-script';
+import {
+  THEME_PREFERENCES,
+  THEME_STORAGE_KEY,
+  parseThemePreference,
+  resolveTheme,
+  storedThemeValue,
+} from './theme';
+
+/** Runs the real pre-paint script against a fake document and returns what it chose. */
+function bootstrapChooses(stored: string | null, prefersLight: boolean): 'dark' | 'light' {
+  const classes = new Set<string>();
+  const documentElement = {
+    classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)), add: (name: string) => classes.add(name) },
+    style: { colorScheme: '' },
+  };
+  const localStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) };
+  const window = { matchMedia: (query: string) => ({ matches: query.includes('light') ? prefersLight : !prefersLight }) };
+  new Function('localStorage', 'window', 'document', THEME_BOOTSTRAP)(localStorage, window, { documentElement });
+  return classes.has('dark') ? 'dark' : 'light';
+}
+
+describe('theme preference', () => {
+  it('parses anything but an explicit choice as system', () => {
+    expect(parseThemePreference('dark')).toBe('dark');
+    expect(parseThemePreference('light')).toBe('light');
+    expect(parseThemePreference(null)).toBe('system');
+    expect(parseThemePreference('system')).toBe('system');
+    expect(parseThemePreference('purple')).toBe('system');
+  });
+
+  it('stores system as the absence of the key', () => {
+    expect(storedThemeValue('system')).toBeNull();
+    expect(storedThemeValue('dark')).toBe('dark');
+  });
+
+  it('resolves system from the OS and leaves an explicit choice alone', () => {
+    expect(resolveTheme('system', true)).toBe('light');
+    expect(resolveTheme('system', false)).toBe('dark');
+    expect(resolveTheme('dark', true)).toBe('dark');
+    expect(resolveTheme('light', false)).toBe('light');
+  });
+});
+
+describe('the unchanged pre-paint script agrees with every preference', () => {
+  for (const preference of THEME_PREFERENCES) {
+    for (const prefersLight of [true, false]) {
+      it(`${preference}, OS ${prefersLight ? 'light' : 'dark'}`, () => {
+        expect(bootstrapChooses(storedThemeValue(preference), prefersLight)).toBe(resolveTheme(preference, prefersLight));
+      });
+    }
+  }
+});
diff --git a/src/lib/theme.ts b/src/lib/theme.ts
new file mode 100644
index 0000000..332a706
--- /dev/null
+++ b/src/lib/theme.ts
@@ -0,0 +1,31 @@
+/**
+ * Theme preference (sidebar plan §5.4, SET-03).
+ *
+ * The stored value is a preference, not a theme: `system` follows
+ * `prefers-color-scheme` live. `system` is stored as the ABSENCE of the key,
+ * which is exactly what the pre-paint script in theme-script.ts already treats
+ * as "follow the OS" — so the script, and the CSP hash that allows it, do not
+ * change. theme.test.ts runs that script against this module to prove it.
+ */
+
+export const THEME_STORAGE_KEY = 'cognit-theme';
+
+export type ThemePreference = 'dark' | 'light' | 'system';
+export type ResolvedTheme = 'dark' | 'light';
+
+export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];
+
+/** Anything but an explicit choice — including a legacy or corrupt value — is `system`. */
+export function parseThemePreference(stored: string | null | undefined): ThemePreference {
+  return stored === 'dark' || stored === 'light' ? stored : 'system';
+}
+
+export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
+  if (preference === 'system') return prefersLight ? 'light' : 'dark';
+  return preference;
+}
+
+/** What to write for a preference: a value, or null to remove the key. */
+export function storedThemeValue(preference: ThemePreference): string | null {
+  return preference === 'system' ? null : preference;
+}
diff --git a/src/lib/user-settings.test.ts b/src/lib/user-settings.test.ts
new file mode 100644
index 0000000..1ac5662
--- /dev/null
+++ b/src/lib/user-settings.test.ts
@@ -0,0 +1,94 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+import { MAX_SESSION_CARD_COUNT, MIN_SESSION_CARD_COUNT } from './study';
+import {
+  DEFAULT_USER_SETTINGS,
+  DISPLAY_NAME_MAX,
+  MAX_NEW_CARDS_PER_SESSION,
+  displayNameSchema,
+  normalizeDisplayName,
+  settingsFromRow,
+  studyDefaultsSchema,
+} from './user-settings';
+
+describe('normalizeDisplayName', () => {
+  it('trims, collapses whitespace and strips invisible characters', () => {
+    expect(normalizeDisplayName('  Marc   Santiago ')).toBe('Marc Santiago');
+    expect(normalizeDisplayName('Ma\u200brc')).toBe('Marc');
+    expect(normalizeDisplayName('\u202eMarc')).toBe('Marc');
+    expect(normalizeDisplayName('Mar\u0007c')).toBe('Marc');
+  });
+
+  it('treats an empty or invisible-only name as "derive it"', () => {
+    expect(normalizeDisplayName('')).toBeNull();
+    expect(normalizeDisplayName('   ')).toBeNull();
+    expect(normalizeDisplayName('\u200b\u200b')).toBeNull();
+  });
+});
+
+describe('displayNameSchema', () => {
+  it('accepts a name at the limit, counted in code points', () => {
+    const emoji = '🙂'.repeat(DISPLAY_NAME_MAX); // 80 UTF-16 units, 40 code points
+    expect(displayNameSchema.safeParse(emoji).success).toBe(true);
+    expect(displayNameSchema.safeParse('a'.repeat(DISPLAY_NAME_MAX + 1)).success).toBe(false);
+  });
+
+  it('refuses an email address, the F-06 rule', () => {
+    expect(displayNameSchema.safeParse('me@example.com').success).toBe(false);
+  });
+
+  it('turns an empty submission into null', () => {
+    expect(displayNameSchema.parse('   ')).toBeNull();
+  });
+});
+
+describe('studyDefaultsSchema', () => {
+  it('holds the bounds the study page enforces', () => {
+    const ok = { sessionCardCount: MIN_SESSION_CARD_COUNT, newCardsPerSession: 0 };
+    expect(studyDefaultsSchema.safeParse(ok).success).toBe(true);
+    expect(studyDefaultsSchema.safeParse({ ...ok, sessionCardCount: MAX_SESSION_CARD_COUNT + 1 }).success).toBe(false);
+    expect(studyDefaultsSchema.safeParse({ ...ok, sessionCardCount: 7.5 }).success).toBe(false);
+    expect(studyDefaultsSchema.safeParse({ ...ok, newCardsPerSession: MAX_NEW_CARDS_PER_SESSION + 1 }).success).toBe(false);
+    expect(studyDefaultsSchema.safeParse({ ...ok, newCardsPerSession: -1 }).success).toBe(false);
+  });
+});
+
+describe('settingsFromRow', () => {
+  it('reads no row as every default', () => {
+    expect(settingsFromRow(null)).toEqual(DEFAULT_USER_SETTINGS);
+    expect(settingsFromRow(undefined)).toEqual(DEFAULT_USER_SETTINGS);
+  });
+
+  it('maps a row', () => {
+    expect(settingsFromRow({ display_name: 'Marc', session_card_count: 20, new_cards_per_session: 8 })).toEqual({
+      displayName: 'Marc',
+      sessionCardCount: 20,
+      newCardsPerSession: 8,
+    });
+  });
+
+  it('degrades a bad row to defaults rather than to NaN', () => {
+    const bad = { display_name: 'x@y.z', session_card_count: Number.NaN, new_cards_per_session: 999 };
+    expect(settingsFromRow(bad)).toEqual({
+      displayName: null,
+      sessionCardCount: DEFAULT_USER_SETTINGS.sessionCardCount,
+      newCardsPerSession: MAX_NEW_CARDS_PER_SESSION,
+    });
+  });
+});
+
+describe('the migration agrees with this module', () => {
+  it('repeats every bound in its CHECK constraints', () => {
+    const sql = readFileSync(
+      path.resolve(__dirname, '../../supabase/migrations/202610010900_user_settings.sql'),
+      'utf8',
+    );
+    expect(sql).toContain(`char_length(display_name) between 1 and ${DISPLAY_NAME_MAX}`);
+    expect(sql).toContain(`session_card_count between ${MIN_SESSION_CARD_COUNT} and ${MAX_SESSION_CARD_COUNT}`);
+    expect(sql).toContain(`default ${DEFAULT_USER_SETTINGS.sessionCardCount}`);
+    expect(sql).toContain(`new_cards_per_session between 0 and ${MAX_NEW_CARDS_PER_SESSION}`);
+    expect(sql).toContain(`default ${DEFAULT_USER_SETTINGS.newCardsPerSession}`);
+  });
+});
diff --git a/src/lib/user-settings.ts b/src/lib/user-settings.ts
new file mode 100644
index 0000000..476740e
--- /dev/null
+++ b/src/lib/user-settings.ts
@@ -0,0 +1,103 @@
+import { z } from 'zod';
+
+import {
+  DEFAULT_SESSION_CARD_COUNT,
+  MAX_SESSION_CARD_COUNT,
+  MIN_SESSION_CARD_COUNT,
+  NEW_CARDS_PER_SESSION,
+} from '@/lib/study';
+
+/**
+ * Per-account settings (sidebar plan §3.1, DATA-01): the values that follow a
+ * user across devices. Theme and sound/haptics are per-browser and live in
+ * localStorage instead (plan §5.4, §5.6).
+ *
+ * Shared by the server loader, the server actions and the Settings form, so
+ * the limits here are the limits everywhere. The table's CHECK constraints
+ * (202610010900) repeat them; a test pins the two together.
+ */
+
+export const DISPLAY_NAME_MAX = 40;
+export const MAX_NEW_CARDS_PER_SESSION = 20;
+
+export type UserSettings = {
+  /** Null means "derive it" — resolveDisplayName's metadata and email chain. */
+  displayName: string | null;
+  sessionCardCount: number;
+  newCardsPerSession: number;
+};
+
+export const DEFAULT_USER_SETTINGS: UserSettings = {
+  displayName: null,
+  sessionCardCount: DEFAULT_SESSION_CARD_COUNT,
+  newCardsPerSession: NEW_CARDS_PER_SESSION,
+};
+
+/** The `user_settings` columns this module reads. */
+export type UserSettingsRow = {
+  display_name: string | null;
+  session_card_count: number;
+  new_cards_per_session: number;
+};
+
+// C0/C1 controls, zero-width characters and bidi overrides: none belongs in a
+// greeting, and the bidi ones can make a name render as something else.
+const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
+
+/** Trimmed, single-spaced and free of invisible characters; empty becomes null. */
+export function normalizeDisplayName(raw: string): string | null {
+  const cleaned = raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
+  return cleaned.length === 0 ? null : cleaned;
+}
+
+/** Code points, as Postgres `char_length` counts them — not UTF-16 units. */
+function codePointLength(value: string): number {
+  return Array.from(value).length;
+}
+
+export const displayNameSchema = z
+  .string()
+  .max(400)
+  .transform(normalizeDisplayName)
+  .refine((value) => value === null || codePointLength(value) <= DISPLAY_NAME_MAX, {
+    message: `Keep it to ${DISPLAY_NAME_MAX} characters.`,
+  })
+  .refine((value) => value === null || !value.includes('@'), {
+    // resolveDisplayName rejects address-shaped names (F-06); so does this.
+    message: 'Use a name, not an email address.',
+  });
+
+export const studyDefaultsSchema = z.object({
+  sessionCardCount: z.number().int().min(MIN_SESSION_CARD_COUNT).max(MAX_SESSION_CARD_COUNT),
+  newCardsPerSession: z.number().int().min(0).max(MAX_NEW_CARDS_PER_SESSION),
+});
+
+export type StudyDefaults = z.infer<typeof studyDefaultsSchema>;
+
+function clampInt(value: unknown, min: number, max: number, fallback: number): number {
+  const number = typeof value === 'number' ? value : Number.NaN;
+  if (!Number.isFinite(number)) return fallback;
+  return Math.min(max, Math.max(min, Math.round(number)));
+}
+
+/**
+ * A row, or no row, as settings. Defensive about the row even though the
+ * table's CHECKs make a bad one impossible: a missing migration or a hand
+ * edit must degrade to defaults, never to a session of NaN cards.
+ */
+export function settingsFromRow(row: UserSettingsRow | null | undefined): UserSettings {
+  if (!row) return DEFAULT_USER_SETTINGS;
+
+  const name = typeof row.display_name === 'string' ? normalizeDisplayName(row.display_name) : null;
+
+  return {
+    displayName: name && codePointLength(name) <= DISPLAY_NAME_MAX && !name.includes('@') ? name : null,
+    sessionCardCount: clampInt(
+      row.session_card_count,
+      MIN_SESSION_CARD_COUNT,
+      MAX_SESSION_CARD_COUNT,
+      DEFAULT_SESSION_CARD_COUNT,
+    ),
+    newCardsPerSession: clampInt(row.new_cards_per_session, 0, MAX_NEW_CARDS_PER_SESSION, NEW_CARDS_PER_SESSION),
+  };
+}
diff --git a/supabase/migrations/202610010900_user_settings.sql b/supabase/migrations/202610010900_user_settings.sql
new file mode 100644
index 0000000..5d8b9fe
--- /dev/null
+++ b/supabase/migrations/202610010900_user_settings.sql
@@ -0,0 +1,53 @@
+-- ===================================================================
+-- Per-account settings (COGNIT_SIDEBAR_SETTINGS_PLAN.md §3.1, DATA-01).
+--
+-- One row per user, written by the first save. A missing row means "every
+-- default", so no backfill and no signup trigger. Only what must follow the
+-- account across devices lives here: theme and sound/haptics stay in the
+-- browser (plan §5.4, §5.6).
+-- ===================================================================
+
+create table if not exists public.user_settings (
+  user_id uuid primary key references auth.users (id) on delete cascade,
+  -- Null = derive it (resolveDisplayName). Trimmed and control-free in the app.
+  display_name text
+    check (display_name is null or char_length(display_name) between 1 and 40),
+  -- Mirrors MIN/MAX_SESSION_CARD_COUNT and DEFAULT_SESSION_CARD_COUNT (src/lib/study.ts).
+  session_card_count smallint not null default 10
+    check (session_card_count between 5 and 50),
+  -- Mirrors NEW_CARDS_PER_SESSION. Zero is allowed: reviews only.
+  new_cards_per_session smallint not null default 5
+    check (new_cards_per_session between 0 and 20),
+  created_at timestamptz not null default now(),
+  updated_at timestamptz not null default now()
+);
+
+alter table public.user_settings enable row level security;
+
+-- All four commands (policy completeness, 202609060920), each reading
+-- auth.uid() as an InitPlan (202609170950, assertion 13).
+drop policy if exists "Users read their own settings" on public.user_settings;
+create policy "Users read their own settings"
+  on public.user_settings for select
+  to authenticated
+  using ((select auth.uid()) = user_id);
+
+drop policy if exists "Users create their own settings" on public.user_settings;
+create policy "Users create their own settings"
+  on public.user_settings for insert
+  to authenticated
+  with check ((select auth.uid()) = user_id);
+
+drop policy if exists "Users update their own settings" on public.user_settings;
+create policy "Users update their own settings"
+  on public.user_settings for update
+  to authenticated
+  using ((select auth.uid()) = user_id)
+  with check ((select auth.uid()) = user_id);
+
+-- "Reset to defaults" deletes the row.
+drop policy if exists "Users delete their own settings" on public.user_settings;
+create policy "Users delete their own settings"
+  on public.user_settings for delete
+  to authenticated
+  using ((select auth.uid()) = user_id);
diff --git a/supabase/migrations/202610010910_shell_reads.sql b/supabase/migrations/202610010910_shell_reads.sql
new file mode 100644
index 0000000..7ac44b2
--- /dev/null
+++ b/supabase/migrations/202610010910_shell_reads.sql
@@ -0,0 +1,64 @@
+-- ===================================================================
+-- Two reads for the sidebar and Settings (COGNIT_SIDEBAR_SETTINGS_PLAN.md
+-- §3.2, DATA-02 and DATA-03). Both SECURITY INVOKER with a pinned
+-- search_path (production assertions 2 and 3).
+-- ===================================================================
+
+-- ── Sidebar counts: trashed and shared decks, in one round trip ────
+-- The restrictive "Trashed decks are hidden" policy (202609240900) hides
+-- trashed rows; the transaction-local flag lifts it for this read only. The
+-- owner policies still decide whose rows are visible, so this counts only the
+-- caller's decks. The 30-day bound matches purge_expired_trash, so the badge
+-- never counts a deck the trash page is about to purge on open.
+create or replace function public.get_sidebar_counts()
+returns table (trashed_count integer, shared_count integer)
+language plpgsql
+volatile
+security invoker
+set search_path = public
+as $$
+#variable_conflict use_column
+begin
+  if (select auth.uid()) is null then
+    raise exception 'Unauthorized' using errcode = '28000';
+  end if;
+
+  perform set_config('cognit.include_trashed', 'on', true);
+
+  return query
+    select (count(*) filter (
+              where d.deleted_at is not null
+                and d.deleted_at >= now() - interval '30 days'))::integer,
+           (count(*) filter (
+              where d.deleted_at is null
+                and d.is_public = true
+                and d.share_token is not null))::integer
+      from public.decks d
+     where d.user_id = (select auth.uid());
+end;
+$$;
+
+-- ── AI usage over the window reserve_ai_call enforces ──────────────
+-- Same sum as the daily ceiling in reserve_ai_call v2 (202609170900): calls,
+-- not rows, over a rolling 24 hours. Reads through the existing owner SELECT
+-- policy on ai_usage_logs and its (user_id, created_at desc) index.
+create or replace function public.get_ai_usage_summary()
+returns table (calls_used integer, oldest_call_at timestamptz)
+language sql
+stable
+security invoker
+set search_path = public
+as $$
+  select coalesce(sum(coalesce((l.metadata->>'calls')::integer, 1)), 0)::integer,
+         min(l.created_at)
+    from public.ai_usage_logs l
+   where l.user_id = (select auth.uid())
+     and l.created_at >= now() - interval '24 hours';
+$$;
+
+-- Supabase's default privileges grant anon EXECUTE directly, so revoke it
+-- from anon as well as public (as 202609270900 does).
+revoke all on function public.get_sidebar_counts() from public, anon;
+revoke all on function public.get_ai_usage_summary() from public, anon;
+grant execute on function public.get_sidebar_counts() to authenticated;
+grant execute on function public.get_ai_usage_summary() to authenticated;
diff --git a/supabase/verify/production-assertions.sql b/supabase/verify/production-assertions.sql
index c430ade..45ee5ea 100644
--- a/supabase/verify/production-assertions.sql
+++ b/supabase/verify/production-assertions.sql
@@ -221,6 +221,33 @@ where a.created_at > now() - interval '30 days'
 group by a.mode, a.usage->>'prompt_version'
 order by attempts desc;
 
+-- 18. Account deletion reaches every row (sidebar plan §5.11, SET-10).
+--     Deleting an auth user must remove every row it owns. A row passes when
+--     on_delete = 'c' (user_id cascades from auth.users), or when
+--     cascades_from names a parent that is itself removed with the user
+--     (decks, cards, a synthesis table). Anything else keeps rows after an
+--     account is deleted and blocks SET-10 until a migration fixes it.
+select cl.relname as table_name,
+       a.attname as column_name,
+       coalesce(con.confdeltype::text, 'none') as on_delete,
+       (select string_agg(ref.relname, ', ' order by ref.relname)
+          from pg_constraint fk
+          join pg_class ref on ref.oid = fk.confrelid
+         where fk.conrelid = cl.oid
+           and fk.contype = 'f'
+           and fk.confdeltype = 'c') as cascades_from
+from pg_attribute a
+join pg_class cl on cl.oid = a.attrelid and cl.relkind = 'r'
+join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
+left join pg_constraint con
+  on con.conrelid = cl.oid
+ and con.contype = 'f'
+ and a.attnum = any (con.conkey)
+ and con.confrelid = 'auth.users'::regclass
+where a.attname in ('user_id', 'reporter_id')
+  and not a.attisdropped
+order by on_delete, table_name;
+
 -- ── Query plans ────────────────────────────────────────────────────
 -- Substitute a real deck id. Expect "Index Scan using
 -- cards_embedding_hnsw_idx", NOT "Seq Scan on cards".
```

## Appendix C2 — Palette and shortcuts patch (SET-06 step 1, SET-11)

6 files; it applies with or without C1. Extract it the same way as C1, with `patch:C2` as the marker:

```bash
awk '/<!-- patch:C2 -->/{m=1} m && /^```diff$/{f=1; next} f && /^```$/{exit} f' COGNIT_SIDEBAR_SETTINGS_PLAN.md > /tmp/cognit-sidebar-c2.patch
```

`shortcuts.test.ts` stays red until SET-06 steps 2 and 3 land. Apply C2 in the same commit as those steps.

<!-- patch:C2 -->
```diff
diff --git a/src/components/ui/shared/CommandPalette.tsx b/src/components/ui/shared/CommandPalette.tsx
index 20e0028..75b354f 100644
--- a/src/components/ui/shared/CommandPalette.tsx
+++ b/src/components/ui/shared/CommandPalette.tsx
@@ -19,7 +19,7 @@ import {
   type PaletteCommand,
   type PaletteDeck,
 } from '@/lib/command-palette';
-import { OPEN_COMMAND_PALETTE_EVENT, requestOpenCreateDeck } from '@/lib/dashboard-events';
+import { OPEN_COMMAND_PALETTE_EVENT, requestOpenCreateDeck, requestOpenShortcuts } from '@/lib/dashboard-events';
 import { removeDeckTagFromTitle } from '@/lib/deck-tags';
 import { pageShortcutBlocked } from '@/lib/hotkeys';
 import { formatActionError } from '@/lib/ai-feedback';
@@ -78,6 +78,8 @@ export function CommandPalette({ decks, sessionHref, totalDue }: CommandPaletteP
   const [errorMessage, setErrorMessage] = useState<string | null>(null);
   const listRef = useRef<HTMLDivElement>(null);
   const triggerRef = useRef<HTMLButtonElement>(null);
+  /** Whatever had focus when the palette opened: the sidebar's Search, or the page. */
+  const openerRef = useRef<HTMLElement | null>(null);
   const reduced = useReducedMotion();
 
   const close = useCallback(() => {
@@ -95,6 +97,13 @@ export function CommandPalette({ decks, sessionHref, totalDue }: CommandPaletteP
     initialFocus: (dialog) => dialog.querySelector<HTMLInputElement>('input'),
   });
 
+  // Remember the opener before useModalDialog moves focus into the input (it
+  // does so a frame later), so an effect that opens a second dialog can hand
+  // focus back to it: the sidebar's Search button, or wherever ⌘K was pressed.
+  useEffect(() => {
+    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+  }, [open]);
+
   // ⌘K / Ctrl+K closes an open palette and opens one over any page no other
   // dialog covers; the rail's search button opens it through the same event
   // so both triggers share one dialog.
@@ -148,26 +157,34 @@ export function CommandPalette({ decks, sessionHref, totalDue }: CommandPaletteP
     (effect: NonNullable<PaletteCommand['effect']>) => {
       close();
 
-      if (effect === 'toggle-theme') {
-        toggleTheme();
-        return;
+      /*
+       * Exhaustive on purpose. This used to end in a bare `void logout()`, so
+       * any effect it did not name signed the user out — adding one would
+       * have made "Keyboard shortcuts" a sign-out button (sidebar plan §5.12).
+       */
+      switch (effect) {
+        case 'toggle-theme':
+          toggleTheme();
+          return;
+        case 'new-deck':
+        case 'show-shortcuts':
+          /*
+           * Hand focus back to whatever opened the palette *before* asking for
+           * the next dialog, which restores focus to the element active when
+           * it opened; by then this palette's input has unmounted.
+           */
+          openerRef.current?.focus();
+          if (effect === 'new-deck') requestOpenCreateDeck();
+          else requestOpenShortcuts();
+          return;
+        case 'sign-out':
+          void logout();
+          return;
+        default: {
+          const unhandled: never = effect;
+          throw new Error(`Unhandled palette effect: ${String(unhandled)}`);
+        }
       }
-
-      if (effect === 'new-deck') {
-        /*
-         * Hand focus back to this palette's own trigger *before* asking for the
-         * next dialog. The create-deck dialog restores focus to whatever was
-         * active when it opened, and by then this palette's input has
-         * unmounted — without this the chain ends with focus on <body>.
-         */
-        triggerRef.current?.focus();
-        // The dialog is mounted by the shell layout, so this reaches it from
-        // any chromed route — including a deck page, where it did not exist.
-        requestOpenCreateDeck();
-        return;
-      }
-
-      void logout();
     },
     [close, toggleTheme]
   );
diff --git a/src/lib/command-palette.test.ts b/src/lib/command-palette.test.ts
index d101a5f..cf61859 100644
--- a/src/lib/command-palette.test.ts
+++ b/src/lib/command-palette.test.ts
@@ -29,9 +29,14 @@ describe('buildPaletteCommands', () => {
     const ids = build().map((command) => command.id);
     expect(ids).toEqual([
       'start-session',
-      'decks',
+      'today',
+      'drills',
       'stats',
+      'shared',
+      'trash',
+      'settings',
       'new-deck',
+      'show-shortcuts',
       'toggle-theme',
       'sign-out',
       'deck:a',
@@ -78,6 +83,7 @@ describe('buildPaletteCommands', () => {
       .map((c) => [c.id, c.effect, c.href]);
     expect(effects).toEqual([
       ['new-deck', 'new-deck', undefined],
+      ['show-shortcuts', 'show-shortcuts', undefined],
       ['toggle-theme', 'toggle-theme', undefined],
       ['sign-out', 'sign-out', undefined],
     ]);
@@ -108,7 +114,7 @@ describe('filterPaletteCommands', () => {
 
   it('never reorders the rows it keeps', () => {
     const ids = filterPaletteCommands(build(), 'deck').map((c) => c.id);
-    expect(ids).toEqual(['decks', 'new-deck', 'deck:a', 'deck:b']);
+    expect(ids).toEqual(['today', 'new-deck', 'deck:a', 'deck:b']);
   });
 
   it('does not surface a destructive command for a single unrelated letter', () => {
@@ -122,7 +128,7 @@ describe('groupPaletteCommands', () => {
   it('collects consecutive rows under one heading', () => {
     const sections = groupPaletteCommands(build());
     expect(sections.map((s) => s.group)).toEqual(['Actions', 'Decks']);
-    expect(sections[0].commands).toHaveLength(6);
+    expect(sections[0].commands).toHaveLength(11);
     expect(sections[1].commands.map((c) => c.id)).toEqual(['deck:a', 'deck:b']);
   });
 
diff --git a/src/lib/command-palette.ts b/src/lib/command-palette.ts
index a2766fc..b9ff78f 100644
--- a/src/lib/command-palette.ts
+++ b/src/lib/command-palette.ts
@@ -21,7 +21,7 @@ export type PaletteCommand = {
   /** Where a navigation command goes. Absent on commands that are not routes. */
   href?: string;
   /** Non-navigation commands name their effect for the dialog to dispatch. */
-  effect?: 'new-deck' | 'toggle-theme' | 'sign-out';
+  effect?: 'new-deck' | 'show-shortcuts' | 'toggle-theme' | 'sign-out';
 };
 
 export type PaletteDeck = {
@@ -68,13 +68,21 @@ export function buildPaletteCommands({
 
   commands.push(
     {
-      id: 'decks',
-      label: 'Go to decks',
+      id: 'today',
+      label: 'Today',
       hint: '/dashboard',
       group: 'Actions',
-      keywords: 'dashboard index home library',
+      keywords: 'dashboard index home library decks due',
       href: '/dashboard',
     },
+    {
+      id: 'drills',
+      label: 'Drills',
+      hint: '/dashboard/drills',
+      group: 'Actions',
+      keywords: 'synthesis drill connect connections exam practice',
+      href: '/dashboard/drills',
+    },
     {
       id: 'stats',
       label: 'Statistics',
@@ -83,6 +91,30 @@ export function buildPaletteCommands({
       keywords: 'stats statistics analytics retention forgetting curve progress',
       href: '/dashboard/stats',
     },
+    {
+      id: 'shared',
+      label: 'Shared',
+      hint: '/dashboard/shared',
+      group: 'Actions',
+      keywords: 'share shared link links public directory',
+      href: '/dashboard/shared',
+    },
+    {
+      id: 'trash',
+      label: 'Trash',
+      hint: '/dashboard/trash',
+      group: 'Actions',
+      keywords: 'trash deleted restore recently removed bin',
+      href: '/dashboard/trash',
+    },
+    {
+      id: 'settings',
+      label: 'Settings',
+      hint: '/dashboard/settings',
+      group: 'Actions',
+      keywords: 'settings preferences profile account options name password export',
+      href: '/dashboard/settings',
+    },
     {
       id: 'new-deck',
       label: 'New deck',
@@ -90,6 +122,13 @@ export function buildPaletteCommands({
       keywords: 'create add deck new',
       effect: 'new-deck',
     },
+    {
+      id: 'show-shortcuts',
+      label: 'Keyboard shortcuts',
+      group: 'Actions',
+      keywords: 'keyboard shortcuts keys hotkeys help',
+      effect: 'show-shortcuts',
+    },
     {
       id: 'toggle-theme',
       label: themeCommandLabel,
diff --git a/src/lib/dashboard-events.ts b/src/lib/dashboard-events.ts
index 9f2ee9d..bed5e34 100644
--- a/src/lib/dashboard-events.ts
+++ b/src/lib/dashboard-events.ts
@@ -11,6 +11,7 @@
  */
 export const OPEN_CREATE_DECK_EVENT = 'cognit:open-create-deck';
 export const OPEN_COMMAND_PALETTE_EVENT = 'cognit:open-command-palette';
+export const OPEN_SHORTCUTS_EVENT = 'cognit:open-shortcuts';
 
 function dispatch(name: string) {
   if (typeof window === 'undefined') return;
@@ -24,3 +25,7 @@ export function requestOpenCreateDeck() {
 export function requestOpenCommandPalette() {
   dispatch(OPEN_COMMAND_PALETTE_EVENT);
 }
+
+export function requestOpenShortcuts() {
+  dispatch(OPEN_SHORTCUTS_EVENT);
+}
diff --git a/src/lib/shortcuts.test.ts b/src/lib/shortcuts.test.ts
new file mode 100644
index 0000000..b2dc501
--- /dev/null
+++ b/src/lib/shortcuts.test.ts
@@ -0,0 +1,53 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+import { SHORTCUTS, SHORTCUT_SCOPES, groupShortcuts, isShortcutsHotkey, keycapLabel } from './shortcuts';
+
+const COMPONENTS = path.resolve(__dirname, '../components/ui/shared');
+
+function sourceOf(owner: string): string | null {
+  for (const candidate of [`${owner}.tsx`, `synthesis/${owner}.tsx`]) {
+    try {
+      return readFileSync(path.join(COMPONENTS, candidate), 'utf8');
+    } catch {
+      // try the next folder
+    }
+  }
+  return null;
+}
+
+describe('SHORTCUTS', () => {
+  it('has unique ids and a known scope for every row', () => {
+    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
+    expect(new Set(ids).size).toBe(ids.length);
+    expect(SHORTCUTS.every((shortcut) => SHORTCUT_SCOPES.includes(shortcut.scope))).toBe(true);
+  });
+
+  it('names an owner that exists and still listens for keys', () => {
+    for (const shortcut of SHORTCUTS) {
+      const source = sourceOf(shortcut.owner);
+      expect(source, `${shortcut.owner}.tsx`).not.toBeNull();
+      expect(source, `${shortcut.owner} binds ${shortcut.id}`).toMatch(/keydown|onKeyDown/);
+    }
+  });
+
+  it('groups in scope order', () => {
+    expect(groupShortcuts().map((group) => group.scope)).toEqual(SHORTCUT_SCOPES);
+  });
+});
+
+describe('keycaps and the ? hotkey', () => {
+  it('renders Mod per platform', () => {
+    expect(keycapLabel('Mod', true)).toBe('⌘');
+    expect(keycapLabel('Mod', false)).toBe('Ctrl');
+    expect(keycapLabel('S', true)).toBe('S');
+  });
+
+  it('opens on ? (typed with Shift) and on nothing else', () => {
+    const base = { metaKey: false, ctrlKey: false, altKey: false };
+    expect(isShortcutsHotkey({ ...base, key: '?' })).toBe(true);
+    expect(isShortcutsHotkey({ ...base, key: '?', metaKey: true })).toBe(false);
+    expect(isShortcutsHotkey({ ...base, key: '/' })).toBe(false);
+  });
+});
diff --git a/src/lib/shortcuts.ts b/src/lib/shortcuts.ts
new file mode 100644
index 0000000..989496a
--- /dev/null
+++ b/src/lib/shortcuts.ts
@@ -0,0 +1,61 @@
+/**
+ * Every keyboard shortcut the app answers to, in one list (sidebar plan
+ * §5.7, SET-06). The shortcuts dialog (`?`) and Settings → Keyboard
+ * shortcuts both render from here, so what is documented is what exists.
+ *
+ * This is documentation, not wiring: each binding still lives in the
+ * component that owns it (the file is named per row), and every one of those
+ * handlers calls `pageShortcutBlocked` first. A binding added without a row
+ * here is a bug the review should catch.
+ */
+
+export type ShortcutScope = 'Anywhere' | 'Today' | 'Deck page' | 'Study' | 'Quiz' | 'Drill';
+
+export type Shortcut = {
+  id: string;
+  /** Rendered as one keycap per entry. `Mod` renders ⌘ on Apple platforms, Ctrl elsewhere. */
+  keys: readonly string[];
+  label: string;
+  scope: ShortcutScope;
+  /** The component that binds it. */
+  owner: string;
+};
+
+export const SHORTCUTS: readonly Shortcut[] = [
+  { id: 'search', keys: ['Mod', 'K'], label: 'Search', scope: 'Anywhere', owner: 'CommandPalette' },
+  { id: 'new-deck', keys: ['Mod', 'N'], label: 'New deck', scope: 'Anywhere', owner: 'CreateDeckModal' },
+  { id: 'shortcuts', keys: ['?'], label: 'Keyboard shortcuts', scope: 'Anywhere', owner: 'KeyboardShortcutsDialog' },
+  { id: 'start-session', keys: ['S'], label: 'Start session', scope: 'Today', owner: 'DueNowBand' },
+  { id: 'review-deck', keys: ['R'], label: 'Review this deck', scope: 'Deck page', owner: 'DeckReviewHotkey' },
+  { id: 'flip', keys: ['Space'], label: 'Flip card', scope: 'Study', owner: 'FlashcardReviewClient' },
+  { id: 'grade', keys: ['1', '2', '3', '4'], label: 'Grade: again, hard, good, easy', scope: 'Study', owner: 'FlashcardReviewClient' },
+  { id: 'study-pause', keys: ['P'], label: 'Pause', scope: 'Study', owner: 'FlashcardReviewClient' },
+  { id: 'quiz-answer', keys: ['1', '2', '3', '4'], label: 'Pick an answer', scope: 'Quiz', owner: 'MCQMode' },
+  { id: 'quiz-pause', keys: ['P'], label: 'Pause', scope: 'Quiz', owner: 'QuizAssessmentClient' },
+  { id: 'drill-check', keys: ['Mod', 'Enter'], label: 'Check your answer', scope: 'Drill', owner: 'SynthesisDrillClient' },
+  { id: 'drill-confidence', keys: ['1', '2', '3'], label: 'Set confidence', scope: 'Drill', owner: 'SynthesisDrillClient' },
+  { id: 'drill-skip', keys: ['S'], label: 'Skip', scope: 'Drill', owner: 'SynthesisDrillClient' },
+  { id: 'drill-revise', keys: ['R'], label: 'Revise', scope: 'Drill', owner: 'SynthesisDrillClient' },
+  { id: 'drill-next', keys: ['N'], label: 'Next drill', scope: 'Drill', owner: 'SynthesisDrillClient' },
+];
+
+export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['Anywhere', 'Today', 'Deck page', 'Study', 'Quiz', 'Drill'];
+
+/** Shortcuts grouped by scope, in SHORTCUT_SCOPES order, empty scopes dropped. */
+export function groupShortcuts(shortcuts: readonly Shortcut[] = SHORTCUTS): Array<{ scope: ShortcutScope; shortcuts: Shortcut[] }> {
+  return SHORTCUT_SCOPES.map((scope) => ({ scope, shortcuts: shortcuts.filter((shortcut) => shortcut.scope === scope) })).filter(
+    (group) => group.shortcuts.length > 0,
+  );
+}
+
+/** A keycap's text. `apple` comes from the client (navigator); the server renders Ctrl-neutral "Mod". */
+export function keycapLabel(key: string, apple: boolean): string {
+  if (key === 'Mod') return apple ? '⌘' : 'Ctrl';
+  if (key === 'Enter') return apple ? '↩' : 'Enter';
+  return key;
+}
+
+/** `?` opens the shortcuts dialog. Shift is how `?` is typed, so it is allowed; other modifiers are not. */
+export function isShortcutsHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
+  return event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey;
+}
```

---

## Appendix D — Not in this plan

| Item | Why not now |
|---|---|
| In-sidebar search results (mockup C) | D1. Revisit if the palette's usage says so. There is no analytics today, so that data doesn't exist yet. |
| Sound and haptics on study grades and drill checks | Only the quiz fires feedback today. Wiring `fireFeedback` into `FlashcardReviewClient` and `SynthesisDrillClient` is small, but it changes how those screens feel and deserves its own check. |
| Theme synced across devices | D4: appearance is per device by choice. |
| An upcoming-drills schedule on the Drills page | `loadDueDrillsByDeck` reads due drills only. A future read would need its own bounded query. |
| Full account data export (JSON of every table) | Export all covers the cards. Review history and drills would need a server-side dump and a size cap. |
| Email change and avatar upload | There's no storage bucket, and email change needs a confirmation flow Supabase runs by email. Neither is in the mockups. |
| A ⌘, shortcut for Settings | D9. |

