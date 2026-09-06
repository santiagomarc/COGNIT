# Cognit — Phase 5: Production Hardening, Smoke Test & Rollout

You are a senior engineer responsible for shipping **Cognit** to real users, working in
`/Users/marcsantiago/Dev/cognit` — Next.js 16 + React 19 + Supabase + Gemini, deployed on
Vercel.

Your task is to execute **Phase 5** of `COGNIT_PRODUCTION_EXECUTION_PLAN.md` in the
repository root. This is the last phase. After it, the app goes to real people.

> **If the user pasted a `## Carry-forward from Phase 4` section above this prompt, read
> it first** — particularly anything marked unfixed or any migration not yet applied.
> If there is no such section, verify Phase 4 landed: `src/app/s/[token]/page.tsx` and
> `src/lib/starter-decks.ts` must exist.

---

## 0. Before you write any code

1. Read `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, specifically:
   - **§4 → PHASE 5** — Tasks 5.1 through 5.5
   - **§5.1** — local verification commands and the SQL assertion queries
   - **§5.2** — the full manual UAT script, sections A through H
   - **§5.3** — the rollout checklist, rollback triggers, and the first-week watch list
   - **§3.11** — token-cost economics, which sets the billing alert threshold
2. Confirm a green baseline: `npx tsc --noEmit && npm run lint && npm test && npm run build`

---

## 1. What Phase 5 is

Two halves, and the second is the one that matters.

**Build work (Tasks 5.1–5.5)** is small: a README, a cron config, a test harness, a CI
workflow, a logger sink.

**Verification work (§5.1–§5.3)** is the real deliverable. You will run a database
assertion suite, an eight-section manual UAT covering signup through quiz completion, and
produce a rollout checklist the user can actually follow.

Phases 1–4 changed a great deal: new RLS policies that widen read access, a new public
route, a CSP, a rewritten AI pipeline, a new streaming endpoint, eight migrations. **Your
job is to prove none of it is broken before a stranger touches it.**

---

## 2. Build tasks

Run `npx tsc --noEmit` after each.

### Task 5.1 — Rewrite the README

`README.md` is untouched `create-next-app` boilerplate — 36 lines that reference Geist
fonts this project does not use. Replace with the content from the plan's Task 5.1.

Two things it must get right, because both silently break setup:
- **Step 4**: adding `NEXT_PUBLIC_SITE_URL` to Supabase → Authentication → Redirect URLs.
  Without it, auth links fail with no useful error.
- The migration step must run **before** the first `npm run dev`, or every RPC falls into
  a fallback path.

Add `test:watch` and `test:coverage` to `package.json`.

### Task 5.2 — Keep-alive cron

`src/app/api/keep-alive/route.ts` exists and is tested, but **nothing calls it**. On the
Supabase free tier, an idle project pauses.

Create `vercel.json` with the daily cron. Vercel sends `Authorization: Bearer $CRON_SECRET`
automatically when `CRON_SECRET` is set in project env — which is exactly what the route
checks. Verify both directions after deploy:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/keep-alive
```
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/keep-alive
```

Expect `401` then `{"success":true,...}`.

### Task 5.3 — Test coverage for the untested critical paths

Current coverage is 54+ tests, **all on pure library functions. Zero on Server Actions** —
which is exactly where the security-critical logic lives.

1. Create `src/test/supabase-mock.ts` from the plan.
2. Write the priority tests in the plan's order. The first one is the most important test
   in the repository:

   **`src/app/actions/quiz.test.ts`** — `logQuizResult` must (a) reject results
   referencing cards outside the deck, (b) **re-grade every answer server-side from
   `cards.front`, ignoring anything the client claims**, (c) apply the 0.7 similarity
   threshold in identification mode.

   That anti-cheat guarantee is listed in §2.5 as already-good and currently has **no test
   pinning it**. Someone will eventually refactor `logQuizResult`. This test is what stops
   them from quietly removing it.

   Then: `share.test.ts` (new public attack surface from Phase 4), `_shared.test.ts`
   (rate-limit window arithmetic and the prod-only missing-table guard).
3. Add the coverage thresholds to `vitest.config.ts`: lines 60, functions 60, branches 50.

60% is deliberately modest — high enough to catch regressions in the paths that matter,
low enough that nobody games it. **Do not raise it to look better.** Do not write assertion-
free tests to reach it.

### Task 5.4 — CI

Create `.github/workflows/ci.yml` from the plan. Note the build step needs placeholder
`NEXT_PUBLIC_*` values — `env-public.ts` throws without them.

### Task 5.5 — Error tracking

Extend `src/lib/logger.ts` per the plan. `error.tsx` and `dashboard/error.tsx` already
surface `error.digest`, which is what a tracker correlates on.

**Do not add a Sentry dependency.** At this stage Vercel's log drain plus `digest`
correlation covers the need. The plan says to add a tracker when volume justifies it; that
is a later decision, not this phase's.

---

## 3. Database verification

Apply any outstanding migrations to a staging database, then run **every** assertion query
from §5.1. All five must return **zero rows** (or, for the index check, the expected name):

1. No `public` table without RLS
2. No RPC with `prosecdef = true` — all must be SECURITY INVOKER
3. No function without a pinned `search_path`
4. `cards_embedding_hnsw_idx` exists; `cards_embedding_ivfflat_idx` does **not**
5. Exactly two `%shared%` policies, both requiring `is_public = true AND share_token IS NOT NULL`

Also run the two query-plan checks from §5.1.

**Paste the real output of every query into your report.** If you cannot reach a database,
say so plainly and mark this section **not executed**. Do not infer results from reading
the SQL.

---

## 4. Manual UAT — the main deliverable

Execute **all eight sections** of §5.2, A through H, in a fresh private window. Report a
pass/fail for **every numbered row**, with what you actually observed.

Do not summarise. "Section D passed" is not a report — the value is in the row-level
detail, because that is where a regression hides.

| Section | Covers | Rows |
|---|---|---|
| A | Signup → email confirm → first deck (FTUX) | A1-A7 |
| B | Content creation: manual, bulk, PDF, edge cases | B1-B11 |
| C | Study & SM-2, resume, keyboard, swipe | C1-C10 |
| D | Quiz: MCQ, identification, hints, confetti, rematch | D1-D13 |
| E | Deck chat streaming & semantic search | E1-E10 |
| F | Sharing & cloning | F1-F9 |
| G | **Cross-user isolation** — two accounts | G1-G6 |
| H | Responsive & theme | H1-H7 |

Rows that deserve extra care, because each pins a specific finding this project fixed:

- **A3** — an unconfirmed account must NOT reach `/dashboard`.
- **B8** — a scanned PDF must give **specific OCR guidance**, not a generic failure.
- **B10** — a `.txt` renamed to `.pdf` must be rejected by the magic-byte check.
- **B11** — a 100-page PDF must produce cards from **throughout**, not just the first 40.
- **D1** — every MCQ shows **4 distinct** options, exactly one correct.
- **D7** — a hint must not contain the answer, its acronym, or its first letter.
- **D9** — reduced motion: **no confetti**, summary still renders.
- **E2** — opening a deck page fires **no embedding traffic**. Check the Network tab.
- **E6** — a question the deck does not cover gets a refusal, **not a confident wrong answer**.
- **E8** — after a failed chat, Retry works and the composer is usable. This is the
  regression test for the stuck-Send-button bug.
- **F3** — a share-link visitor sees **no** study history, quiz scores, mastery, or chat.
- **G1-G6** — the entire cross-user isolation section. Run it with two real accounts.

**If a row fails, report it as failed.** A UAT that passes everything on the first run is
usually a UAT that was not run.

---

## 5. Rollout package

Produce the §5.3 checklist filled in for this project, not copied blank:

- **Pre-deploy** — env vars, Supabase redirect URLs, staging migrations, the billing alert
  (§3.11 puts the worst case at ~$2.24/user/hour, so set the threshold deliberately),
  backups.
- **Deploy order** — `supabase db push` **before** the app deploy. New code calls new RPCs;
  the reverse order means every request falls into a fallback path or errors.
- **Post-deploy smoke** — the 10-minute production run-through.
- **Rollback triggers** — the four in the plan.
- **First-week watch list** — the six metrics with their alarm thresholds.

One nuance to restate accurately in your report: the migrations are additive (new columns,
new policies, `create or replace` on functions), so a **code rollback does not require a
database rollback**. The single exception is the HNSW index swap — reverting the app is
safe, but the IVFFlat index is gone. That is acceptable (the vector RPCs work without any
index, just slower) and is why that migration is kept separate.

---

## 6. Rules

- **Do not raise the coverage thresholds** or write hollow tests to hit them.
- **Do not add new features.** If the UAT reveals a bug, fix the bug; do not redesign.
- **Do not deploy to production** unless the user explicitly asks. Your deliverable is a
  verified build plus a checklist they execute.
- **Do not mark a UAT row passed that you did not run.** Mark it NOT RUN and say why. An
  honest gap is useful; a fabricated pass is worse than no report.
- **Do not commit.**

---

## 7. Required completion report

```markdown
## PHASE 5 COMPLETION REPORT

### 1. Status
COMPLETE | PARTIAL | BLOCKED

### 2. Verification gate
| Command | Result | Notes |
|---|---|---|
| npx tsc --noEmit | | |
| npm run lint | | |
| npm test | | test count: __ |
| npm run build | | routes: __ |
| npm run test:coverage | | lines __% / functions __% / branches __% |

### 3. Database assertions
For each of the five queries in §5.1: paste the query and its REAL output.
If you had no database access, state that here and mark the section NOT EXECUTED.

| Assertion | Expected | Actual |
|---|---|---|
| No table without RLS | 0 rows | |
| No SECURITY DEFINER function | 0 rows | |
| No unpinned search_path | 0 rows | |
| HNSW index present, IVFFlat gone | | |
| Exactly 2 shared-deck policies, correctly scoped | | |

Plus both `explain (analyze, buffers)` outputs.

### 4. Manual UAT results
Row-by-row for all eight sections. Do not summarise.

| Row | Action | Expected | Observed | Pass? |
|---|---|---|---|---|
| A1 | | | | |
| ... | | | | |
| H7 | | | | |

Totals: __ passed / __ failed / __ not run.
List every failure with the file:line you believe is responsible.

### 5. Build tasks completed
For each of 5.1 - 5.5: files touched, what changed, how verified.

### 6. Coverage detail
| Area | Coverage | Notes |
|---|---|---|
| src/lib/** | | |
| src/app/actions/** | | |
Call out any critical path still at 0%.

### 7. Rollout package
The filled-in §5.3 checklist: pre-deploy, deploy order, post-deploy smoke, rollback
triggers, first-week watch list. Mark each item done / pending / needs-user-action.

### 8. Where I stopped
Exact task or UAT row.

### 9. Outstanding issues
Everything found across ALL five phases that is still unfixed. For each:
- What it is, where (file:line)
- Severity
- Whether it blocks launch
- Suggested fix

### 10. Launch readiness assessment
Your honest call: is this ready for friends and public users?
- What is genuinely production-ready
- What is acceptable-for-now with a known limitation
- What you would not ship without fixing
Be direct. An overstated "ready" here is the most expensive error in the whole project.

### 11. Validation steps for the user
The final 10-minute production smoke test, as numbered steps with expected results —
the thing they run themselves right after deploying.
```
