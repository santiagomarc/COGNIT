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
5. A small migration revoking `anon` EXECUTE on the Phase 1 RPCs.

---

## Entries

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
