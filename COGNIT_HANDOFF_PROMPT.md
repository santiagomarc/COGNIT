# Opening prompt for the next Cognit session (2026-11-03)

Copy everything between `--- PROMPT START ---` and `--- PROMPT END ---` into a fresh
conversation. It replaces `COGNIT_NEXT_SESSION_PROMPT.md` and `COGNIT_HANDOFF.md`, which
date from 2026-09-08 and are now historical.

---

--- PROMPT START ---

## 1. Context

You are continuing work on **Cognit** at `/Users/marcsantiago/Dev/cognit`, a spaced-repetition
study app. A user uploads a PDF and Gemini writes flashcards from it. The user then studies them
with SM-2 scheduling, quizzes themselves, runs synthesis drills, and chats with their own deck.

**Stack:**
- Next.js 16.1.0: App Router, Turbopack, React Compiler.
- React 19 and TypeScript strict.
- Tailwind v4, CSS-first. Tokens are in `src/app/globals.css`.
- Framer Motion 12 through `LazyMotion`. Import `m`, never `motion`.
- Supabase: Postgres, RLS, pgvector and pg_trgm. The region is `ap-south-1`.
- Vercel, with functions in `bom1`. Production is https://cognit-nine.vercel.app.
- Gemini on the **free tier**, model `gemini-3.5-flash-lite`.
- Zod 4 and Vitest.

The repo has one owner and one developer. They work directly on `main`. **They commit and push
themselves, often mid-session and sometimes with half-finished work, to keep a commit streak.**
Run `git log --oneline -5 && git status --short` before every step, and again before reporting.
Never assume the tree is as you left it.

## 2. Standing rules (all from the owner; don't relitigate them)

1. **Don't commit, push or open a PR unless the owner asks.** Finish each step by giving the
   owner a one-line suggested commit message.
2. **Shell commands you give the owner to paste must not contain inline `#` comments.** zsh
   passes them as arguments.
3. **Supabase CLI:**
   - `--linked` commands need the sandbox disabled.
   - Production use stays **read-only**.
   - `supabase db push` is the owner's job. Never run it.
4. **Never create accounts in production.** The signed-in test account comes from the owner
   (§6).
5. **Never send the owner's email address to any external service.**
6. **No AI calls in tests.** Mock `@/lib/gemini`. Live AI scripts (`npm run ai:*`) spend free-tier
   quota, so run them only when a gate requires it.
7. **Bundle budgets only move down.** `scripts/bundle-budgets.json` is a ratchet. Never raise a
   budget to make CI pass.
8. **Measure, don't estimate.**
   - Bundle effects: compare clean before/after production builds from APFS clones, joined by
     route name. Turbopack regroups shared chunks non-locally, and attributing chunks by
     strings overstated savings by about 6× in perf P4.
   - UI timing: `playwright-core` with system Chrome, `channel: 'chrome'`.
9. **Match the surrounding code.** Comment density, naming and idiom should follow what's
   already there. The codebase explains *why* in block comments and cites plan IDs
   (for example `(performance plan AI-18)`); follow that.
10. **Every new keyboard binding** adds a row to `SHORTCUTS` in `src/lib/shortcuts.ts`, in the
    same commit, and passes `shortcuts.test.ts`.
11. **Ask before starting a new phase.** Within a phase, proceed item by item without asking.

## 3. Machine facts

- **No Docker and no `psql`.** You can't run `supabase start` locally. Supabase CLI `--linked`
  commands work, but the pooler connection failed on 2026-10-23, so retry and say so if it
  fails again.
- **`gh` is not installed.** Read CI status through the GitHub REST API with `curl`. Map a
  commit SHA to its Vercel deployment through the GitHub deployments API. Hashed deployment
  URLs are frozen; production is the alias.
- **Use the session scratchpad for scratch builds and scripts.** macOS deletes files there
  that haven't been touched for about 3 days.
  - If `playwright-core` has been purged, reinstall it in the scratchpad with
    `npm i --no-save playwright-core@1.64.0`.
  - Build in an APFS clone (`cp -c -R`) of the repo, so the working tree's `.next` stays put.
- **The connection to Gemini from this Mac is sometimes flaky** (`fetch failed` on connect).
  Production runs from `bom1` and doesn't see it.

## 4. Verified state at handoff (2026-11-03, HEAD `dda8bc4`, tree clean)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` (eslint + contrast script) | ✅ clean |
| `npm test` | ✅ 719 tests in 80 files |
| `npm run build` | ✅ |
| **CI `verify` job** | ❌ **Red on every commit since `7c609fd` (2026-10-29)**, at the last step, "Bundle budgets". `a26c15c` was the last green run. `/dashboard/(focus)/[deckId]/study/page` is **201.4 kB against a 199 kB budget**. Quiz (201.1 of 202) and deck (238.4 of 242) are within budget but close. |
| Vercel deploys | ✅ Succeeding. The bundle step is CI-only. |
| `GET /api/keep-alive` on production | ❌ **500 "Server configuration error: CRON_SECRET is not configured."** Nothing is keeping Supabase from pausing for inactivity (§6). |
| JWKS | Still `{"keys":[]}`. AUTH-02 (ES256) is not done. |
| `.env.local` test account | Absent. `LOAD_TEST_EMAIL` and `LOAD_TEST_PASSWORD` are not set. |
| `e2e/`, `playwright.config.ts` | Don't exist. U1 is not started. |

## 5. The plan documents, and where each one really stands

Read the parts you need. Don't re-audit.

### `COGNIT_PERFORMANCE_PLAN.md` (Rev 1.6): complete

P0–P5 all shipped:

| Phase | Commit |
|---|---|
| P0 | `404dd24` |
| P1 | `cbc5bce` |
| P2 | `4427194` |
| P3 | `0b17d22` |
| P4 | `17b32a1` |
| Quiz pause fix | `892a478` |
| P5 | `66f5082` + `26edf07` |

§9.3 holds the P5 execution notes, including the open items carried into §7 below.

### `COGNIT_UIUX_PLAN.md`: in progress, despite its header

The header still says "Revision 1.0 · 2026-10-01" and has no execution notes. **That is wrong,
and fixing it is task T2.**

Its code sketches and every `file:line` reference were written against `bc66b1d`. The code has
moved a lot since then, so treat the sketches as intent and re-find every location. Where a
sketch and its named test disagree, the test wins.

Status, verified against code and git on 2026-11-03:

| Phase | Item | Status |
|---|---|---|
| **U0** | COPY-03 PDF preview order | ✅ `4a7ea91` (Oct 7) |
| | FLOW-05 signup from a share link keeps the deck | ✅ `f80506d` (Oct 12) |
| | COPY-01 · COPY-04 honest landing, footer | ✅ `3abf478`, `01d741c` (Oct 25). OD-5: social proof deleted. |
| | FLOW-07 unfurls: `SITE_URL`, OG image | ✅ `a26c15c` (Oct 27) |
| | IA-01 Explore frame | ✅ `92c0fda` (Oct 28) |
| **U1** | TEST-01 harness | ❌ not started |
| **U2** | UX-07 · MOB-06 card fits, "More below" cue | ✅ `c438c17` (Oct 5), `c596dc6` (Oct 8). Also `study-type.ts`, `use-overflow.ts`, and the `--type-study-*` tokens. |
| | A11Y-13 card a screen reader can read | ✅ `7c609fd`, `77ccee8` (Oct 29–31). Also `spokenInterval`, `plainText`. |
| | FLOW-01 · VIS-04 (study) honest chunk, "Keep going", "Starts with…" on Today | ✅ `0e7eff7` (Nov 1). Also `getStudyContinuation` in `study.ts`, and "Recalled" on the summary. |
| | FLOW-03 undo last grade (`Z`) | ✅ `dda8bc4` (Nov 2). Also `held-grade.ts`, and the `study-undo` row in `SHORTCUTS`. |
| | PERF-06 transitions (flip 320 ms, flash 120 ms, `popLayout`) · PERF-07 no 1 s re-render | ✅ via perf P2 `4427194`, using `ElapsedTelemetry` and `session-clock.ts`, with saves on events |
| | **REF-01** split `FlashcardReviewClient` | ❌ The file is now **1,327 lines**. |
| | **UX-08** Space/Enter grade Good after the reveal | ❌ OD-3 isn't recorded as decided. |
| | **FLOW-02** edit a card in-session (`E`, `EditCardSheet`) | ❌ |
| | **MOB-05** swipe shows its grade | ❌ |
| **U3** | FLOW-06 honest PDF wait | ✅ Superseded by perf P5. It's a streamed route handler, not a Server Action. Cards stream as saved. Stop button, elapsed counter, `beforeunload`. Tags and distractors come in the generation call itself, so item 1's `enrichCards` scheduling no longer applies. |
| | IA-04 find a card by its words | ◐ **⌘K half done** by perf P3: `GET /api/search`, RPC `search_user_cards_lexical`, pg_trgm, migration `202610180900`. **Cards-tab filter field not done.** `DeckCardsManager.tsx` has no search. |
| | COPY-02 · COPY-06 · IA-02 one meaning per word | ◐ Only "Recalled" on the study summary is done. Today's "Retention", DeckRow's "Mastery", "+2d", and "Merge" on Overview are all unchanged. |
| | UX-06 local day | ❌ Needs a migration. |
| | FLOW-04 onboarding · FB-01 delete undo · COPY-05 · PERF-08 voice, error copy, loading | ❌ |
| **U4** | DS-08/09/10, VIS-01/02/03, VIS-04 (quiz), A11Y-12/14/15 | ❌ Not started. Evidence: "Flawless Victory" and "Speed Demon" are still in `QuizAssessmentClient.tsx:278,286`, and the letter grade at `:681` (OD-7). Nested `<main>` is still in `MCQMode.tsx:151`, `IdentificationMode.tsx:107`, `FlashcardReviewClient`, `QuizAssessmentClient`, `SynthesisDrillClient`, `synthesis/loading.tsx` and `explore/page.tsx`. |
| | DS Rev. F | ❌ `COGNIT_DESIGN_SYSTEM.md` is still Rev. E, even though some Rev. F tokens are already in `globals.css`: `--dur-flip: 320ms` and `--type-study-*`. |
| **U5** | PERF-09 `rum_samples`, funnel | ❌ |

### Other documents

- **`COGNIT_SIDEBAR_SETTINGS_PLAN.md` (SSP):** landed. `db8843f` (2026-10-03) brought the
  sidebar, `user_settings` (`session_card_count`, `new_cards_per_session`) and the `SHORTCUTS`
  registry. Owner UAT is still owed.
- **`COGNIT_DESIGN_SYSTEM.md`:** Rev. E. It's the visual contract: one `.raised` per screen,
  hue only for state, `type-*` utilities.

## 6. Owner-only actions (you can't do these; remind them once, briefly, at the start)

1. **Urgent: `CRON_SECRET`.**
   - Set it in Vercel → Production env and redeploy.
   - Re-enable the cron-job.org job with header `Authorization: Bearer <secret>`.
   - Verify: an unauthenticated `curl https://cognit-nine.vercel.app/api/keep-alive` returns
     **401, not 500**.
   - `vercel.json` also runs a daily cron at 06:00.
2. **`supabase db push`.** These migrations are probably unpushed:
   - `202610150900_ai_call_outcomes`
   - `202610160900_apply_card_background_enrichment_batch`
   - `202610180900_search_user_cards_lexical`, which production ⌘K text search needs
   - possibly `202610020900_account_deletion_cascade`

   You can verify read-only with `supabase migration list --linked` (sandbox disabled). If the
   pooler refuses, probe PostgREST for the RPC with the anon key: a "function not found" error
   means it isn't applied.
3. **ES256 signing keys (AUTH-02).** A Supabase dashboard switch. Every navigation pays extra
   Auth round-trips until it's done.
4. **A test account for U1 and every signed-in gate (UIUX OD-4).** Add `LOAD_TEST_EMAIL` and
   `LOAD_TEST_PASSWORD` to `.env.local`. Specs only ever touch decks titled `[e2e] …`.
5. **Production checks after the P5 deploy:**
   - Upload a **6 MB PDF.** Vercel's 4.5 MB request-body limit may refuse it before the route
     runs; the fix would be upload-to-Storage first.
   - Judge the quality of the first real PDF cards, and raise `STREAM_ACCEPT_MIN_SCORE` if
     arrival order lets weak cards through.
   - Run the G5 SQL in perf plan §9.3.
6. **`CSP_ENFORCE`.** Report-only since 2026-09-29. Turning it on is the owner's call.

## 7. Task queue, in order

### T0. A hand-written card studies upside down (verify first, then fix: S1)

Found during the handoff check; no plan has caught it yet.

**The mismatch:**
- **This schema's naming trap:** `front` is the **answer** (the term) and `back` is the
  **question** (the prompt). Study shows `active.id_question ?? active.back` as the prompt and
  `active.front` as the answer (`FlashcardReviewClient.tsx` ~`:1197–1200`, `:852–855`). PDF
  generation, bulk import ("Term" → front, "Description" → back) and the PDF preview (fixed
  by COPY-03) all follow that mapping.
- **But `AddCardForm.tsx:74`** labels `front` **"Question"**, with the placeholder "e.g. What
  is closure in JavaScript?", and labels `back` "Answer". `handleSubmit` saves them as-is
  through `createCard`. So a card typed by hand shows its answer as the prompt.
- The validation messages agree with the wrong label. `schemas.ts:79–80` and `:91–92` say
  front → "Question is required", and `form-checks.ts:85,87` does the same.

**Steps:**
1. Confirm in a browser or a component test.
2. Fix the form so the user sees **Question first** (bound to `back`) and **Answer** (bound to
   `front`). Swap the placeholders, add the naming-trap comment, and swap the messages in both
   `schemas.ts` blocks and `form-checks.ts`. This also closes the message half of UIUX §5.8.
3. Grep every other `front`/`back` label: card edit dialogs, `FlashcardWithActions`,
   `DeckCardsManager`, the share page and Explore previews.
4. Add a test that fails on the current mapping.
5. **Existing data:** count the hand-written cards in production, read-only. Then ask the owner
   whether to swap them; a migration would be theirs to push. Don't write any data.

### T1. Get CI green without raising a budget

The study route is 201.4 kB against 199.

1. **Measure first.** Make two clean APFS clones, `a26c15c` (last green) and HEAD. Build each
   with CI's env; read `.github/workflows/ci.yml` for the env CI builds with. Then run
   `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json` in each, and
   join the results by route name. Find what grew study (and quiz) between them. The suspects
   are the A11Y-13, FLOW-01 and FLOW-03 additions to `FlashcardReviewClient`, `study.ts`,
   `held-grade.ts` and `shortcuts.ts`.
2. **Known lever (perf plan §8.4):** Turbopack copies `Button` (cva variants plus Radix `Slot`)
   and Next's link formatting into **both error-boundary chunks every route loads**.
   `src/app/error.tsx` and `src/app/dashboard/error.tsx` each import `Button` and `next/link`.
   This costs about 3 kB on study and quiz. Try styling those boundaries' two controls without
   the `Button` component, and keep their look identical; compare screenshots in both themes.
3. **Other levers, if still over:**
   - Load the parts of the study client that aren't on screen at first paint with
     `next/dynamic`: the summary, the pause overlay and the resume prompt.
   - Remove anything accidentally pulled into the client (a server-only helper, a big constant
     table).

   Don't do REF-01 here. It's behaviour-preserving work that needs U1's harness.
4. **Acceptance:** "0 route(s) over budget" from a clean build, plus tsc, lint, test and build
   all green. If you get headroom, lower the study and quiz budgets toward the new size, but
   never up. Tell the owner CI will show green on their next push. Then confirm via the API
   after they push.

### T2. Make `COGNIT_UIUX_PLAN.md` tell the truth

- Bump it to **Rev 1.1 · 2026-11-03**, with a one-line changelog in the header.
- Add an **"Execution status"** section in the house style of perf plan §9.3. It needs:
  - the table in §5 above, with commits and dates;
  - deviations from the sketches: FLOW-06 and half of IA-04 were done by the perf plan in a
    different shape, and PERF-06/07 came from perf P2;
  - the T0 finding as a new ID, **COPY-07** (S1) unless a free ID fits better; check §1.2's
    list;
  - the owner decisions that are now effectively made: OD-4 (chunk, "Keep going"), OD-5
    (delete social proof) and OD-9 (320/120 ms). Mark OD-3, OD-6, OD-7, OD-10 and OD-11 as
    still open.
- Update the memory file `project_performance_plan.md` or add a UIUX one, and update
  `MEMORY.md` to match. Memory currently says the UIUX plan is "uncommitted, Rev. F", which is
  stale.

### T3. U1: the UI test harness (UIUX §4)

**Ask the owner for the test account before you start.** Without it:
- Build the harness, the CI job (`E2E_MODE=local` against `supabase start` on the runner,
  §4.5) and the public-surface specs (axe, targets).
- Say plainly that the signed-in specs are unverified until CI runs them, or until the account
  exists.

**Notes:**
- GU1 expects "491 tests (or more)". The suite is 719 now; just make sure Vitest doesn't
  collect `e2e/`.
- Check the env names that `supabase status -o env` prints on the CLI version CI installs.
- **No AI in specs.** `E2E_FAKES=1` is only for the CI job.
- The P5 PDF route now streams. A fake for it should speak the same SSE protocol: `start`,
  `card`, `section`, `more`, `done`, `error`. See `route.test.ts`'s fake streaming model and
  `src/lib/sse-parsing.ts`.
- The latency spec commits today's measured medians as the budget. U2 tightens them to reveal
  ≤ 200 ms and advance ≤ 300 ms.

**Ask before starting this phase.**

### T4. Finish U2 (UIUX §5.1, §5.7 UX-08, §5.8, §5.9, gate §5.10)

Run these in order, with `study.spec.ts` green before and after each.

1. **REF-01 split.** One behaviour-preserving commit.
   - The plan's file table predates undo, continuation and the screen-reader text, so map the
     current code instead:
     - the held-grade and undo logic goes into `useGradeOutbox` (`hold`, `undo`), reusing
       `held-grade.ts`;
     - continuation goes into `StudySummary`;
     - the A11Y-13 live text goes into `StudyCard`/`StudyHeader`.
   - Target: `FlashcardReviewClient.tsx` under 250 lines.
   - Add `useStudySession.test.ts` driving the reducer with no DOM.
   - GU2 requires study to stay within 199 kB.
2. **UX-08 Space as Good.**
   - Confirm OD-3 with the owner in one line first.
   - Add the registry row `grade-good-space`.
   - Show the one-time hint (`localStorage` `cognit-hint-space-good`, wrapped in try/catch).
   - The `event.repeat` guard must still hold.
3. **FLOW-02 `EditCardSheet`.**
   - `E` or a header ghost button opens it; register `E` in the registry.
   - Use `useModalDialog`. Map `question` → `back` and `answer` → `front`.
   - Save through `updateCard`, which re-syncs the embedding via `after()`.
   - Delete through `deleteCard`, with a confirm, and drop the card from the queue.
   - Pause the clock while the sheet is open. `pageShortcutBlocked` keeps 1–4 and Space inert
     behind it.
   - The message swap is already done by T0.
4. **MOB-05 swipe labels.**
   - Show "Again" or "Good" past ±40 px, filling at the commit threshold, and give the matching
     key its `data-down` at the same moment.
   - One-time `cognit-hint-swipe` hint on coarse pointers.
5. **Run gate GU2.** Do the parts you can. List the manual ones for the owner: VoiceOver
   (V3), real phones (V6) and the undo interval check.

### T5 onward: U3 → U4 → U5

Ask before each phase.

- **U3 remaining:**
  - UX-06 local day. It brings a migration with four RPC signatures that revoke `anon`. Write
    it, never push it, and hand the owner the exact `supabase db push` step.
  - COPY-02/06 · IA-02.
  - FLOW-04 onboarding.
  - FB-01 act-now-commit-later deletes (`pending-delete.ts`).
  - COPY-05 · PERF-08: voice, error-boundary copy, `loading.tsx` for `/s/[token]` and
    `/explore`, and the share page's deck read wrapped in `cache()`.
  - IA-04's Cards-tab filter. Reuse P3's lexical search RPC or `ilike` with PostgREST's
    reserved characters stripped, rather than adding a third search path.
- **U4:** apply Rev. F (UIUX §9) to `COGNIT_DESIGN_SYSTEM.md` first, then do the items in §7.
  - The `type-label` utility exists, but about 67 files still repeat the raw classes.
  - The gamification badges and letter grade go if the owner confirms VIS-01/OD-7.
- **U5:** first-party `rum_samples`, plus `supabase/verify/funnel.sql`. OD-11 is still open.

## 8. Known bugs and loose ends (fix only when you're already in the file, or when asked)

- **Resume-prompt hydration mismatch.** The quiz and study clients read `sessionStorage` in a
  `useState` initializer. Move the read into an effect or `useSyncExternalStore`. Perf plan
  §6.4, "Still open".
- **Phase 1 RPCs still grant `anon` EXECUTE.** Only the insights RPC revokes it. A small
  migration is owed.
- **The sharing RLS policy lets any anon-key holder list every shared deck,** not just open one
  by its token. Product decision: a "link-only" share isn't private.
- **`public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg` and `window.svg`** are unused
  create-next-app leftovers.
- **`QuizAssessmentClient` (~1,050 lines) and the drill client (~995)** get split only when
  their own UX work arrives.

## 9. Architecture you'll trip over

- **The card naming trap.** `front` is the answer (term) and `back` is the question (prompt).
  `id_question`, when present, overrides `back` as the study prompt. Every UI boundary maps
  explicitly and carries a comment saying so.
- **Route handlers** (`/api/chat`, `/api/generate`, `/api/search*`, `/api/decks/backfill`) sit
  **outside the proxy matcher**, which covers `/dashboard`, `/s/` and
  `/login/update-password`. So they:
  - authenticate themselves;
  - call `ensureSessionHeadroom()` before streaming, because a token refresh can't set cookies
    once the response has started;
  - need `router.refresh()` on the client afterwards, because unlike a Server Action they
    can't purge the router cache (`staleTimes.dynamic = 30`).
- **SSE over POST** is shared by chat and PDF generation: `src/lib/sse-parsing.ts` with
  `formatSseFrame`, `takeCompleteFrames`, `parseFrame` and `readSseStream`.
- **AI budget.**
  - `reserve_ai_call` has a per-action window that counts rows, plus a daily ceiling that
    counts calls.
  - Telemetry goes to `ai_call_outcomes` through `recordAiUsage`.
  - Background work runs through `after(() => runBackground(...))`.
  - `ai_usage_logs` is immutable.
- **Next 16 runs a tab's Server Actions one at a time.** Any `revalidatePath` in an action
  re-renders the current page, so `gradeCard` deliberately has none.
- **`serverActions.bodySizeLimit` is `4mb`.** The largest Server Action body is the 200-card
  bulk import. PDF uploads go to the route handler, with a 10 MB app cap.
- **CSP uses a nonce**, through a bridge policy that's still report-only. Never add an inline
  script; use bundled client components (as UIUX §6.1 and §8.1 do).
- **CI** (`.github/workflows/ci.yml`, job `verify`): `npm ci` → tsc → lint → test → build →
  bundle budgets.

## 10. How to work and report

- Before each step, re-check HEAD (§1). After each step, run:
  `npx tsc --noEmit && npm run lint && npm test && npm run build`, plus the bundle report when
  client code changed.
- Report results faithfully. If something fails, paste the failing output. If you skipped a
  check, say which one and why.
- End each step with:
  - what changed, with clickable file references;
  - what you verified, and how;
  - what is left for the owner;
  - a one-line suggested commit message.

  Then stop if the next step needs an owner decision. Otherwise go on.
- Keep `COGNIT_UIUX_PLAN.md`'s execution-status section current as items land.

**Start with:** the §6 reminder (two lines), then T0, then T1, then T2. Stop after T2 and ask
whether to start U1.

--- PROMPT END ---
