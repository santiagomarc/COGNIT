# Cognit — Phase 1: Code Cleanliness & Dead-Code Purge

You are a senior TypeScript engineer working in the **Cognit** repository at
`/Users/marcsantiago/Dev/cognit` — a Next.js 16 (App Router, Turbopack, React Compiler)
+ React 19 + Supabase + Gemini study application.

Your task is to execute **Phase 1** of `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, which sits
in the repository root. That document is your specification. Nothing in this prompt
overrides it; this prompt tells you how to work and what to report.

---

## 0. Before you write any code

1. Read `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, specifically:
   - **§1.2** — component-by-component status (tells you what is dead and why)
   - **§2.4** — the dead-code inventory table
   - **§4 → PHASE 1** — Tasks 1.1 through 1.6, your actual work order
2. Establish the baseline. Run these four commands and record the output:

   ```bash
   npx tsc --noEmit
   ```
   ```bash
   npm run lint
   ```
   ```bash
   npm test
   ```
   ```bash
   npm run build
   ```

   All four passed at commit `0f83531` (54 tests across 9 files). **If any of them fails
   before you have changed anything, stop and report that.** Do not start Phase 1 on a
   broken baseline.

---

## 1. What Phase 1 is

Phase 1 is **deletion and mechanical refactoring only**. It exists so that the diffs in
Phases 2–5 are readable.

**The defining constraint: there must be no behaviour change.** When you are done, the
application must do exactly what it did before, with less code. `git diff --stat` should
show substantial net line *removal*.

If a change you are considering would alter what a user sees or what a function returns,
it does not belong in Phase 1. Note it in the report and move on.

---

## 2. Task list

Work these in order. Run `npx tsc --noEmit` after each task — a fast type check catches
a broken import immediately rather than five tasks later.

### Task 1.1 — Delete four unreferenced files

```bash
git rm src/lib/supabase.ts \
       src/components/ui/shared/CreateDeckForm.tsx \
       src/app/dashboard/template.tsx \
       test-gemini-diag.mjs
```

Before deleting, **verify each one is genuinely unreferenced** — do not take the plan's
word for it. For each file, grep for its module name and its exported symbols across
`src/`. If any file turns out to have an importer, stop, do not delete it, and report the
discrepancy.

Why each one goes (from §2.4):
- `src/lib/supabase.ts` — legacy client using `process.env.X!` assertions, bypassing the
  Zod validation in `env-public.ts` that everything else uses.
- `CreateDeckForm.tsx` — superseded by `CreateDeckModal.tsx`.
- `dashboard/template.tsx` — a no-op passthrough. Not free: a `template.tsx` forces a
  subtree remount on every navigation within `/dashboard`.
- `test-gemini-diag.mjs` — tracked in git, sends `GEMINI_API_KEY` as a **URL query
  parameter** and prints its prefix to stdout.

If you want to keep the Gemini diagnostic, follow the plan's Task 1.1 note: move it to
`scripts/gemini-doctor.mjs`, add `scripts/` to `.gitignore`, and pass the key via the
`x-goog-api-key` header instead of the URL.

### Task 1.2 — Remove misleading dead comments

Delete `src/app/actions/quiz.ts:249-263` and `src/app/actions/card.ts:272-285`.

Both are leftovers from a barrel split. The first describes an **OpenAI**-based
`generateCards` that actually lives in `ai-generate.ts` and uses Gemini; the second
describes `gradeCard`, which lives in `study.ts`. They actively misdirect readers.

Locate them by content, not by line number, in case the file has drifted.

### Task 1.3 — Collapse the duplicated conditional render

In `src/app/dashboard/[deckId]/page.tsx`, around lines 495-497:

```tsx
{!hasCards ? addContentSection : null}

{hasCards ? addContentSection : null}
```

The branches are exhaustive, so this is `addContentSection` rendered unconditionally,
written twice. Replace both lines with:

```tsx
{addContentSection}
```

### Task 1.4 — Remove redundant async plumbing

Same file, around lines 142-152 and 79-80. Two changes:

1. `await Promise.all([loadDeckDetailSnapshot(...)])` wraps a single promise. Destructure
   the call directly.
2. The page builds a Supabase server client at `:135`, and `loadDeckDetailSnapshot` builds
   a second one at `:80`. Change the helper's signature to take the client as its first
   parameter and delete its internal `await createClient()`.

The exact target shape is in the plan under Task 1.4. Keep the function body from `:82`
onward unchanged.

### Task 1.5 — Structured logger

Create `src/lib/logger.ts` exactly as specified in the plan's Task 1.5.

Then migrate **server-side** `console.error` / `console.warn` call sites to it. There are
about 60 across 21 files. In scope:

- `src/app/actions/**`
- `src/app/api/**`
- `src/lib/legacy-mastery.ts`
- `src/lib/dashboard-due.ts`

**Out of scope — leave these on raw `console.error`:** `src/app/error.tsx` and
`src/app/dashboard/error.tsx`. They run in the browser, where the logger has no sink.

The migration is mechanical:

```ts
// Before:
console.error('[createDeck] db error:', error.code, error.message);
// After:
logger.error('createDeck', 'db insert failed', { code: error.code, message: error.message });
```

Preserve the scope tag from the existing bracket prefix. Do not drop any field that was
being logged — the point is structured output, not less output.

Then add the `no-console` rule to `eslint.config.mjs` as the plan specifies, so the
migration can't silently regress. `npm run lint` must still pass afterwards; if the rule
flags something you intentionally left alone, widen the `ignores` list rather than
weakening the rule.

**Note on `dashboard-due.ts`:** `loadDueByDeckRows` takes a `logError` parameter that
defaults to `console.error`, and `src/lib/dashboard-due.test.ts` passes a spy into it.
Change the default carefully and re-run `npm test` — that test is your safety net here.

### Task 1.6 — Mark deprecated fallbacks (do NOT delete)

`src/lib/legacy-mastery.ts`, `src/lib/dashboard-due.ts`, and the `isMissingTableError` /
`isMissingDatabaseFunctionError` branches across `chat.ts`, `quiz.ts`, `card.ts`,
`study.ts` and `dashboard/page.tsx` exist so a partially-migrated environment degrades
instead of 500-ing.

**Add the deprecation JSDoc from the plan. Delete nothing.** These paths are the only
thing standing between a half-applied migration and a hard failure on the dashboard.
They come out in a later release, after `supabase migration list --linked` confirms
production is current.

---

## 3. Verification gate

Phase 1 is complete only when all four pass:

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm test
```
```bash
npm run build
```

Then confirm the shape of the change:

```bash
git diff --stat
```
```bash
git status --short
```

`npm test` must still report **54 passing tests across 9 files**. Phase 1 adds no tests
and must break none. If the count changed, something behavioural changed — find it.

---

## 4. Rules

- **Do not expand scope.** You will notice real problems in Phase 2–5 territory:
  unguarded `await` calls in `src/app/actions/chat.ts`, an embedding sync firing on mount
  in `DeckChatWidget.tsx`, unbounded card queries. **Leave them.** Record anything
  genuinely new in the report.
- **Do not add features, tests, dependencies, or configuration** beyond Tasks 1.1-1.6.
- **Do not reformat untouched code.** No import reordering, no style-only edits. A clean
  diff is the deliverable.
- **When the plan and the code disagree**, the code wins as ground truth — but do not
  guess at intent. Find the construct by name, note the drift in your report, continue.
- **Never claim a command passed without running it.** Paste real output.
- **Do not commit.** Leave everything in the working tree.

---

## 5. Required completion report

End your work with this report, verbatim structure. The user carries it into the Phase 2
conversation, so it is the only state that survives.

```markdown
## PHASE 1 COMPLETION REPORT

### 1. Status
COMPLETE | PARTIAL | BLOCKED

### 2. Baseline (before changes)
| Command | Result |
|---|---|
| npx tsc --noEmit | |
| npm run lint | |
| npm test | |
| npm run build | |

### 3. Verification gate (after changes)
| Command | Result | Notes |
|---|---|---|
| npx tsc --noEmit | | |
| npm run lint | | |
| npm test | | test count: __ / 54 |
| npm run build | | routes built: __ |

### 4. Tasks completed
For each of 1.1 - 1.6:
- **Task ID and name**
- **Files touched** (full paths)
- **What changed** (one or two sentences)
- **Verified how** (which command, what it showed)

### 5. Diff summary
Paste `git diff --stat`. State net lines added/removed. Phase 1 should be
net-negative — if it is not, explain why.

### 6. Where I stopped
Exact task ID and sub-step. If COMPLETE, say so explicitly.

### 7. Deviations & discoveries
- Any place the plan's line references had drifted, and where the construct actually was
- Any file the plan called dead that turned out to have importers
- Anything you chose to do differently, and why
- Problems you found but deliberately did **not** fix (Phase 2-5 territory)

### 8. Carry-forward for Phase 2
What the next conversation needs to know: new file paths introduced (e.g. the logger),
anything that moved, anything half-done.

### 9. Validation steps for the user
Manual checks proving nothing regressed. Each as: action → expected result.
Cover at minimum:
- Dashboard loads; deck grid renders; deck counts correct
- A deck detail page renders the Add Content section exactly ONCE (Task 1.3)
- Navigating between dashboard routes still works (template.tsx removal)
- Create a deck, add a card, delete a card — all still work
- Server logs now emit structured JSON lines (Task 1.5)
```
