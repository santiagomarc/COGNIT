# Cognit — Progress Log

What was built, when, and why. This is the main raw material for the course report's
implementation and timeline sections.

**Adding an entry:** after you finish a feature or fix, add an entry at the **top** of
"Entries". Use this format:

```
### YYYY-MM-DD · <your name> · <short title>
- **What:** what changed, from a user's or developer's point of view.
- **Why:** the problem it solves.
- **Files:** the main files touched.
- **Commit(s):** short SHA(s).
- **Tests:** what proves it works (unit tests, e2e spec, manual check).
```

If you made a choice someone could question later, also add it to [decisions.md](decisions.md).

---

## Current status (2026-11-09)

**Health:**
- `main` is green in CI (`verify` and `database` jobs).
- 727 unit tests in 82 files. `tsc`, lint and build are clean.
- Production: https://cognit-nine.vercel.app

**Open items:**
| Item | Owner | Notes |
|---|---|---|
| `CRON_SECRET` not set in Vercel Production | owner | `GET /api/keep-alive` returns 500, so nothing stops the free-tier Supabase project from pausing. Set it, redeploy, and re-enable the cron-job.org job. The check is that an unauthenticated request returns 401. |
| Migrations possibly not pushed | owner | `202610150900`, `202610160900`, `202610180900` (maybe `202610020900`). Check with `supabase migration list --linked`. |
| AUTH-02 (ES256 signing keys) | owner | [runbooks/auth-es256.md](runbooks/auth-es256.md) |
| E2E with a signed-in account | anyone | `npm run e2e` needs `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD` in `.env.local` |

**Next up** (from the queue in [plans/uiux-plan.md](plans/uiux-plan.md), "Where to continue"):
1. Finish U1: run `npm run build && npm run e2e` with a test account, and fix what the
   signed-in specs find.
2. ~~UX-06: local day~~ code done; **owner pushes `202611100900`, then runs `npm run db:types`** (see the entry below).
3. ~~IA-04: Cards-tab filter~~ done (see the entry below; needs a manual check with real data).
4. ~~COPY-02 / COPY-06 / IA-02~~ done as a relabel (see the entry below); the plan's Retention and Mastered redefinitions are not built.
5. ~~Revoke `anon` EXECUTE on the RPCs~~ migration written (see the entry below); **owner pushes `202611130900`**.

---

## Entries

### 2026-11-24 · santiagomarc · Francine's review, phase 1: deck rows and visible bugs (items 12, 13, 18 text, 24)
- **What:**
  - Deck rows have one always-visible "⋯" menu (Rename, Duplicate, Move to trash) instead of three hover-only icons that covered the numbers. Arrow keys, Escape and focus return work.
  - Rename covers the row (its input was 26px wide), takes two lines on a phone, saves on Enter, cancels on Escape, and stays open if saving fails.
  - Deck names wrap to two lines. From `lg` the name is capped and the number columns spread out, still aligned with their headings.
  - Next 7 Days shows its counts on phones. "1 cards", "1 days overdue" and "1 cards due" are singular.
  - The "85% target" label sits above the retention plot, not on the line.
  - The "All decks" count no longer overlaps the sort buttons at 375px.
- **Why:** Francine's UI review. Item 11 (deck pagination) was already done.
- **Files:** `DeckActions.tsx`, `DeckActionsMenu.tsx` (new), `DeckRow.tsx`, `DeckGrid.tsx`, `DueNowBand.tsx`, `RetentionTrend.tsx`, `e2e/focus.spec.ts` (its trash check looked for a button the deck page no longer has).
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** 762 tests, tsc, lint and build pass. `/dashboard` is 212.9 kB (budget 214). Driven in Chrome with mock data at 1440, 1024, 375 and 320px, light and dark: menu by keyboard and mouse, trash cancelled, rename cancelled. **Not run signed in, and the updated e2e check has not been run** (no test account).

### 2026-11-23 · santiagomarc · Pages in the dashboard's All decks list
- **What:** "All decks" shows 10 decks per page with the same pager as the Cards tab; the header reads "1–10 of 34 decks". Changing the sort returns to page 1; counts and sorting still cover every deck. No pager at 10 decks or fewer.
- **Why:** A long library pushed everything into one list.
- **Files:** `DeckGrid.tsx`, `Pager.tsx`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** tsc, lint, unit tests, build. Not checked signed in.

### 2026-11-23 · santiagomarc · Pages on the Cards tab
- **What:**
  - A deck's Cards tab shows 12 cards at a time with Previous, page numbers and Next, instead of 60 and "Load more cards". Below `lg` it is "Page 2 of 9" between the two buttons. The filter's matches page the same way and show a real count ("1–12 of 49 matching").
  - Turning a page scrolls to the top of the cards and moves focus to them, so a screen reader announces the new range. Cards not read yet show skeletons; a failed read shows "Try again".
  - "Select all" is now "Select page" plus "Select all *n*" (up to 200, the delete limit). A selection carries across pages, so the delete button states its count.
  - Card numbers count from the deck's real total. They used to count only the loaded cards, so the newest of 240 read #60.
  - Fixed on the way: pages could repeat or skip cards that share a `created_at` (a generated batch does), so `id` now breaks the tie; a refresh while a delete was still in its undo window could bring the card back; an edit to a card found by the filter didn't show until reload.
- **Why:** 60 cards in one column of rows was too much to read or find anything in.
- **Files:** `DeckCardsManager.tsx`, `Pager.tsx` (new), `src/lib/card-pages.ts` (new, + test), `FlashcardWithActions.tsx`, `actions/card.ts`, `[deckId]/page.tsx`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `card-pages.test.ts` (11); 762 tests, tsc, lint and build pass. `/dashboard/[deckId]` is 223.8 kB (budget 226). Driven in Chrome with a stubbed action and 137 cards: paging, jump to last, delete, undo, commit, edit past card 60, filter, select, failed read and retry, at 1280 and 390 px. **Not run against the real database signed in.**

### 2026-11-20 · santiagomarc · UIUX plan U4 and the rest of U3 (accessibility, type scale, quiz result, onboarding, delete with undo)
- **What, by finding:**
  - **A11Y-14 · touch targets.** Every `Button` is 44 px tall under a coarse pointer (`pointer-coarse:` in `button.tsx`); so are the launcher chips and count input, the drill launcher's chips, login's "Forgot password?", "Sign up"/"Sign in", "use a different email" and show-password, the theme toggle, the card hover actions, the PDF count select and Remove. Deck rows go 38 → 48 px. Desktop density is unchanged.
  - **A11Y-15 · the PDF drop zone** is a `<label>` for a visually hidden but focusable file input, not a `div role="button"` with a button inside it; Remove sits outside it.
  - **A11Y-12 · landmarks** were already fixed in `d09dde5`; confirmed: axe finds no landmark, region or skip-link rule on any public page.
  - **Landing hero contrast (found by axe):** the subtitle used `text-slate-100`, 1.05:1 in light mode, so it was invisible. Now `text-ink-dim`.
  - **VIS-02 · no tilt.** `Flashcard` (Cards tab, share page) lost its ±8° cursor tilt and both springs; the flip stays.
  - **VIS-03.** "Correct answer" is ink, not the lapse hue; the drill's "Checking" tick is neutral.
  - **VIS-04 (quiz half).** The quiz result is the screen's one `.raised` plane; its three stat tiles are labelled numbers inside it; "Focus next" and "Question diagnostics" are wells. The letter grade and badges stay (OD-7).
  - **DS-08 · type utilities.** `type-label`, `type-sm`, `type-cap`, `type-body`, `type-h3`, `type-study-*` exist. A codemod (scratch, not committed) replaced 147 label strings and 151 raw sizes in 85 files; 22 reviewed exceptions remain. `cn()` now knows `type-*` as font sizes, so tailwind-merge resolves them against `text-sm` as it did against `text-[12px]`.
  - **DS-09 · display sizes on the scale.** New `type-display-md` (28 px) and `type-hero` (landing only); the mobile page titles, preview card faces, login specimen, drill prompt, sidebar heading, landing headings and `Wordmark sm` read steps. `Wordmark xl`/`2xl` (no consumers) are gone.
  - **DS-10 · design system Rev. F.** `docs/design-system.md` matches the code: scale, study steps and measure, button heights, motion budgets, anti-patterns, touch targets, accessible names, the `cognit-tz` day, the glossary (§12), self-check items 16–19.
  - **FLOW-04 · onboarding.** The three ways in are "Fastest", "From your material" and "By hand", not "Step 1/2/3"; the starter deck holds the one filled button; the costs read "~5 s", "about a minute", "a few minutes".
  - **FB-01 · delete with undo.** Deleting cards on the Cards tab (one or many) hides them at once with "*n* cards deleted · Undo" for 6 s; the server call waits out the toast, or runs on `pagehide`. Undo sends nothing. A failed delete puts the cards back. A confirm remains only above 50 cards at once.
- **Not done, on purpose:** FLOW-04's shortcut that opens the new deck on the PDF uploader (the uploader loads lazily after render, so a jump could land before it exists; unverifiable without a signed-in run). REF-01 and U5 (owner's call). VIS-01 dropped (OD-7).
- **Files:** `button.tsx`, `button-class.ts`, `utils.ts`, `globals.css`, `PDFUploadZone.tsx`, `LoginClient.tsx`, `ThemeToggle.tsx`, `DeckRow.tsx`, `DeckSessionLauncher.tsx`, `SynthesisLauncher.tsx`, `Flashcard.tsx`, `FlashcardWithActions.tsx`, `DeckCardsManager.tsx`, `QuizAssessmentClient.tsx`, `SynthesisDrillClient.tsx`, `DashboardOnboarding.tsx`, `Wordmark.tsx`, `HeroSection.tsx`, landing headings, 85 files touched by the DS-08 codemod, `src/lib/pending-delete.ts` (+ test), `src/lib/type-scale.test.ts`, `scripts/bundle-budgets.json`, `docs/design-system.md`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests and checks:**
  - `pending-delete.test.ts` (6, fake timers), `type-scale.test.ts` (arbitrary-size ceiling 22; every serif size a step), `button-class.test.ts` updated for the touch height. 751 tests, tsc, lint (incl. contrast) pass.
  - DS-08 pixel check: production builds before and after the codemod, five public pages × desktop and touch phone × both themes: **all 20 renders pixel-identical.** Nine label strings that lacked `leading-[1.5]` gain it; they're on signed-in screens (quiz modes, quiz result, share button), unchecked.
  - axe on every public page at 375 and 1280: clean. `e2e/a11y.spec.ts` (empty allow-list) passes on landing and login in both themes.
  - Bundles: `/dashboard/[deckId]` 230.3 → 222.3 kB, `/s/[token]` 184.3 → 177.1 (the tilt springs); budgets lowered to 226 and 181. Every route within budget.
  - **Not seen signed in:** the quiz result layout, the Cards-tab delete and Undo, onboarding, the touch sizes on a real phone.

### 2026-11-20 · santiagomarc · The product's voice (COPY-05)
- **What:**
  - No more exclamation marks: "Reset email sent!" → "Check your email for a reset link.", "Check your email!" → "Check your email to confirm your account.", "*n* cards generated and saved!" → "*n* cards added to this deck.", "Password updated successfully!" → "Password updated.", and the study empty state "You're all caught up!" → "Nothing due in this deck".
  - Sentence case: Start over · Resume · Back to deck · Review again (study); Quiz result · Avg. per question · Quit quiz · Back to deck (quiz).
  - Creating a deck opens it without a "Deck created successfully" toast on top; the toast now shows only if the deck can't be opened.
  - The app error screen no longer claims "The error has been logged." (a client error isn't logged anywhere a person can read). Its reference line already showed only when an error has a digest.
- **Why:** The product spoke in two voices: calm, factual telemetry on most screens and excited toasts on a few.
- **Files:** `LoginClient.tsx`, `auth/actions.ts`, `PDFUploadZone.tsx`, `FlashcardReviewClient.tsx`, `QuizAssessmentClient.tsx`, `CreateDeckModal.tsx`, `app/error.tsx`, `src/lib/voice.test.ts`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `voice.test.ts` fails on any string literal in `src` that ends a word with "!" (checked against the old code: it names all four). It can't see JSX text, so headings are still a review item. 743 tests, tsc and lint pass. Copy only, so no bundle change worth measuring.

### 2026-11-17 · santiagomarc · Loading states for Explore and shared decks; honest dashboard error title (PERF-08, part of COPY-05)
- **What:**
  - `/explore` and `/s/[token]` now show a skeleton in the page's own frame (wordmark, title, then rows or cards) while their data loads, in place of a blank page.
  - The shared-deck read is wrapped in `cache()`, so `generateMetadata` and the page share one query instead of running it twice.
  - The dashboard error screen says "This page failed to load", not "This deck failed to load": it catches every dashboard route.
- **Why:** A visitor arriving from a pasted link waited on a blank page for the deck and its cards. Both public pages made the user stare at nothing.
- **Files:** `src/app/explore/loading.tsx`, `src/app/s/[token]/loading.tsx`, `src/app/s/[token]/page.tsx`, `src/app/dashboard/error.tsx`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** no unit tests (markup only). Both skeletons rendered in Chrome in light and dark and checked against their pages' frames; tsc, lint and 742 tests pass, and `/s/[token]` is 184.3 kB against a 187 budget. The `cache()` change is unrun against a real shared deck: open one share link once.
- **Not done from COPY-05:** the voice sweep (trailing `!` in toasts, Title Case buttons) and "quote this reference" only when `error.digest` exists.

### 2026-11-13 · santiagomarc · Signed-out clients can run one function (anon revoke)
- **What:** Migration `202611130900_revoke_anon_rpcs.sql` revokes `anon`'s EXECUTE on every app-defined function in `public` except `list_public_decks` (37 functions), and revokes the default for future ones. Assertion 19 in `production-assertions.sql` returns zero rows when it holds.
- **Why:** Supabase's default privileges granted `anon` EXECUTE on every new function, and `revoke … from public` never undid it. Each function still refused an anonymous caller (all are `SECURITY INVOKER` with `auth.uid()` or RLS checks), so this was defense in depth, not a leak; now the call fails with "permission denied" before the body runs.
- **How it was found:** a read-only `has_function_privilege('anon', …)` query against production listed the 38 callable functions (plus pgvector's own, which are excluded).
- **Checked against the code:** only `list_public_decks` is called signed-out (Explore). The share page and keep-alive read tables through RLS, not RPCs.
- **Files:** `supabase/migrations/202611130900_revoke_anon_rpcs.sql`, `supabase/verify/production-assertions.sql`, `docs/decisions.md` (D-DATA-2 addendum), `docs/architecture.md`, `docs/runbooks/migrations.md`.
- **Owner pushes:** `supabase db push --linked --dry-run`, then `supabase db push --linked`, then run assertion 19 in the SQL editor (zero rows) and `npm run verify:deployment`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `sqlcheck.mjs` parses it. Not run against a database. The statement set is derived from the live catalog, so what it revokes is what the read-only query listed. No TypeScript changed.

### 2026-11-10 · santiagomarc · One meaning per word (COPY-02, COPY-06, IA-02)
- **What:**
  - **Quiz-proven, not "Retention" or "Mastery".** Today's greeting ("Retention") and activity panel ("Recall accuracy · 30d"), the deck list and deck readings ("Mastery"), and the quiz result and history copy all described one number: the share of cards whose last quiz answer was correct. They now say **Quiz-proven**. "Retention" now appears only where it is true, on Stats' 30-day figure.
  - **No green for quiz-proven.** The deck-list bar and the deck readings bar no longer step to `--state-mastered` at 70%, and a deck's tick can no longer be `mastered`. That hue is for SM-2 mastery (interval ≥ 21 days).
  - **Merge** is folded into a "Merge into another deck…" disclosure at the foot of Overview, no longer open on the page you study from.
  - COPY-06 ("+2d" → "2 drills" after the title) was already done in `fdad208`.
- **Why:** Three words ("retention", "mastery", "recall") named one quiz-based number, while Stats' "Retention · 30d" meant something else, so Today and Stats disagreed under the same word.
- **Deviations from the plan (§6.2):** the plan redefines Retention and Mastered with new RPC columns (`retention_passed`, `mastered_by_deck`). That needs a migration and a re-wire of Today; the relabel gets the honesty without either. Today therefore shows no 30-day Retention figure and no SM-2 "Mastered" share yet. Merge is a disclosure, not an item in `DeckActions` (which is a row of icon buttons with no list of other decks).
- **Files:** `src/lib/deck-row.ts` (+ test; `deckState` moved out of `DeckRow`), `DeckRow.tsx`, `DeckReadings.tsx`, `GreetingHeader.tsx`, `SignalPanel.tsx`, `QuizAssessmentClient.tsx`, `QuizHistoryList.tsx`, `[deckId]/page.tsx`.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `deck-row.test.ts` (due beats everything; quiz-proven never yields `mastered`). 742 tests, tsc, lint (incl. contrast) and build pass; every bundle budget holds. Not seen signed in: check Today, the deck list and a deck's Overview once.

### 2026-11-10 · santiagomarc · A day is the user's day (UX-06)
- **What:** Today's streak, "reviewed today", activity heatmap and seven-day forecast cut days at the user's local midnight, not UTC's. A user in UTC+8 who studied at 7 am no longer studied "yesterday". The first dashboard visit renders in UTC, writes a `cognit-tz` cookie and refreshes once; every later visit is right on the first byte.
- **Why:** UTC midnight is 8 am in UTC+8, so streaks broke and "reviewed today" reset mid-morning.
- **Files:** `src/lib/timezone.ts` (+ test), `src/lib/request-timezone.ts`, `src/components/TimezoneCookie.tsx` (mounted in `dashboard/layout.tsx`), `src/lib/dashboard-forecast.ts` (zone parameter, default UTC), `src/app/dashboard/(shell)/page.tsx`, `supabase/migrations/202611100900_local_day_rpcs.sql`, `src/lib/database.types.ts` (hand-written overload entries), `scripts/verify-deployment.mjs`.
- **Migration (owner pushes):** adds `get_study_activity_days(uuid, text)` and `get_card_schedule_summary(uuid, text, timestamptz, integer)` beside the UTC signatures, which stay until a later contract migration. anon's EXECUTE is revoked on the new ones. **Push it before the code deploys:** until it is applied, the Today page's two reads fail, are logged, and render an empty streak and forecast.
- **Not covered:** `get_analytics_snapshot` (Stats' weekly charts) and `get_synthesis_insights` still bucket by UTC.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `timezone.test.ts` (Manila vs New York day at 23:30 UTC, bad zones, key arithmetic); `dashboard-forecast.test.ts` gains the zone cases. `sqlcheck.mjs` parses the migration. 738 tests, tsc, lint and build pass; study 193.9 kB of 195. The RPCs themselves are unrun: `npm run db:types` after the push should confirm the hand-written types.

### 2026-11-09 · santiagomarc · Find a card on the Cards tab (IA-04)
- **What:** The deck's Cards tab has a "Find a card by its words" field. Typing two or more characters shows only the cards whose term or description contains them (case-insensitive), with "Load more matches" past 60. Clearing it restores the list. Select and bulk delete act on what is shown.
- **Why:** A deck of a few hundred cards paged 60 at a time had no way to find one card. ⌘K only searches across decks and shows 8.
- **Files:** `src/components/ui/shared/DeckCardsManager.tsx`, `src/app/actions/card.ts` (`getDeckCardsPage` takes an optional `query`), `src/lib/card-filter.ts` + test.
- **Commit(s):** see `git log` (uncommitted when written).
- **Tests:** `card-filter.test.ts` (pattern, minimum length, PostgREST syntax and LIKE wildcards stripped). Bundle: deck page 229.8 kB gz against a 232 budget. **Not yet exercised against a signed-in database**; try it on a real deck.

### 2026-11-09 · owner · Repository cleanup for the team
- **What:**
  - Moved all docs into `docs/` and retired 15 finished plans. Their decisions and invariants
    were extracted into `decisions.md` and `architecture.md`.
  - Added `CLAUDE.md`, this log and two runbooks.
  - Removed unused assets and editor config.
- **Why:** Group members are joining for the Advanced Software Engineering final project.
- **Files:** `docs/**`, `CLAUDE.md`, `README.md`, `.gitignore`, `.env.example`
- **Tests:** `tsc`, lint, unit tests, build.

---

## History before the team joined (one developer)

Reconstructed from `git log` and the retired plans. Each line is a milestone, with its main
commit(s).

### 2025-12 → 2026-06: Prototype
- **2025-12-19:** Created with create-next-app. Login and deck form.
- **2026-02-27 → 03-03:** Deck detail, flashcard UI, toasts, landing page. SM-2 scheduling,
  keyboard shortcuts, session summary (`6aba3b5`).
- **2026-03-04:** Gemini integration. PDF upload → AI-generated flashcards (`160d5bd`).
- **2026-03-06 → 03-14:** Quick-Sync importer, the Dynamic Quizzer (MCQ + identification),
  quiz history and diagnostics, deck mastery.
- **2026-03-25 → 04-04:** First hardening: authorization fixes, server-side quiz scoring,
  rate-limited AI usage logging, core RLS migration, a verified-email gate.
- **2026-04-08 → 05-29:** Deck tags, topic tags, deck chat, card scope options, batch grading in
  SQL, background AI enrichment.
- **2026-06-04:** Database keep-alive route (`620e386`).

### 2026-09: Production hardening and redesign
- **09-01:** Weakest concepts and semantic search (`25ce774`).
- **09-05 → 09-08:** Five-phase production program:
  - immutable RLS policies, AI guards, retries and reservations (`132e99a`)
  - MCQ distractor hardening, PDF chunking
  - SSE deck chat
  - Vitest coverage

  Record: [history/2026-09-program-report.md](history/2026-09-program-report.md).
- **09-09 → 09-11:** "Obsidian Telemetry" redesign:
  - design system approved
  - app rail, command palette, breadcrumb
  - study/quiz/dashboard re-laid out (`67d7bb6`, `f6bcaf7`)
- **09-12 → 09-21:** Micro-synthesis drills:
  - spec Rev. B.1, drills and attempts (`983830d`), capstone (`b1a0e2b`)
  - Phase 3 fixes (`80006cd`)
  - Phase 4: formats, plan mode, question bank, exam date, live calibration gates (`f164797`)

  Spec: [specs/micro-synthesis-spec.md](specs/micro-synthesis-spec.md).
- **09-14:** Dashboard schedule aggregated in Postgres, with no query waterfall (`13ef1a7`).
- **09-23 → 09-29:** Next Horizon plan, Phases 0–3:
  - keyboard integrity (`7f90bbb`)
  - deck trash, duplicate/merge, export, concept map (`1181dd5`)
  - `@google/genai` SDK migration (`69d6942`)
  - migrations replayable on a fresh database, with a CI types-drift check (`7b2f255`)
  - nonce-based CSP on Vercel (`d99c996`)

### 2026-10: Sidebar, settings and performance
- **10-01 → 10-03:** Sidebar navigation, account menu, Settings page, `user_settings`, account
  deletion, exam countdown (`0a386ab`, `c032f10`, `db8843f`). Design system Rev. E.
- **10-05 → 10-12:** UIUX U0/U2 begins:
  - study cards fit their text, with a "More below" cue (`c438c17`)
  - PDF preview order (`4a7ea91`)
  - signup from a share link keeps the deck (`f80506d`)
- **10-14:** AI hint replaced by "Don't know" (`6914dbc`).
- **10-15 → 10-23:** Performance plan P0–P5 (AI off the user's path):
  - AI call outcomes (`404dd24`)
  - quiz data from the deck (`cbc5bce`)
  - session clock (`4427194`)
  - lexical and semantic search (`0b17d22`)
  - lazy shell dialogs (`17b32a1`)
  - streamed PDF generation (`66f5082`, `26edf07`)
- **10-25 → 10-31:**
  - honest landing page and footer (`3abf478`, `01d741c`)
  - share-link unfurls and OG image (`a26c15c`)
  - Explore frame (`92c0fda`)
  - a study card a screen reader can read (`7c609fd`, `77ccee8`)

### 2026-11: Study flow polish
- **11-01:** Honest study chunks, "Keep going" (`0e7eff7`).
- **11-02:** Undo the last grade with `Z` (`dda8bc4`).
- **11-05:** Playwright + axe e2e harness (`c3a2d59`).
- **11-05:** Edit a card mid-session with `E` (FLOW-02, `4263986`).
- **11-06:** Swipe gestures show the grade (MOB-05, `7c0a049`).
- **11-07 → 11-08:** Due-drill count fix, landmark clean-up (`fdad208`, `d09dde5`).
