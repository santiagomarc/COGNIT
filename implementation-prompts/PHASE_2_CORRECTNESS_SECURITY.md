# Cognit — Phase 2: Correctness & Security Hardening

You are a senior TypeScript + PostgreSQL engineer working in the **Cognit** repository at
`/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 + Supabase
(Postgres, RLS, pgvector) + Gemini 2.5 Flash.

Your task is to execute **Phase 2** of `COGNIT_PRODUCTION_EXECUTION_PLAN.md` in the
repository root. That document is your specification.

> **If the user pasted a `## Carry-forward from Phase 1` section above this prompt, read
> it first.** It tells you what moved, what was deleted, and what was left half-done.
> If there is no such section, verify Phase 1 landed (`src/lib/logger.ts` should exist and
> `src/lib/supabase.ts` should not) before starting.

---

## 0. Before you write any code

1. Read `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, specifically:
   - **§2.1** — reliability findings R-1 through R-9 (what you are fixing)
   - **§2.2** — security findings S-1 through S-6
   - **§2.3** — performance findings P-2, P-3, P-7
   - **§2.5** — *what is already good.* Read this. It lists guarantees you must not
     regress, notably server-side quiz re-grading.
   - **§3.1** — full source for `ai-retry.ts` and `action-guard.ts`
   - **§3.11** — token-cost economics, which motivates Task 2.4
   - **§4 → PHASE 2** — Tasks 2.1 through 2.11, your work order
2. Confirm a green baseline:

   ```bash
   npx tsc --noEmit && npm run lint && npm test && npm run build
   ```

---

## 1. Sequencing correction — read this before Task 2.1

The plan places `src/lib/embeddings.ts` in Phase 3 (§3.5), but Phase 2 Tasks 2.1 and 2.3
already call `embedTexts()`. **Create that file in Phase 2.**

Specifically:

- Create `src/lib/embeddings.ts` now, with the full `embedTexts()` implementation from
  **§3.5**.
- **Also put `toVectorLiteral()` in `src/lib/embeddings.ts`**, not in `src/lib/rag.ts` as
  §3.4 shows. Move it out of `src/app/actions/chat.ts` (it is currently a private function
  around line 37) and update chat.ts to import it.
- Phase 3 will create `src/lib/rag.ts` and import `toVectorLiteral` from
  `@/lib/embeddings`. Do not define it twice.

`embedTexts` depends on `withGeminiRetry`, so build `src/lib/ai-retry.ts` first.

---

## 2. What Phase 2 is

Phase 2 fixes the things that break for real users today and the things that could cost
real money or leak real data. It is the highest-value phase in the plan.

Three findings are user-visible failures right now, and they share one root cause — **an
unhandled promise rejection escaping a Server Action**:

- `src/app/actions/chat.ts` calls `embedText` (~line 348), `model.generateContent`
  (~line 409), and `JSON.parse` via `parseDeckChatResponse` (~line 435) with **no
  try/catch**. One Gemini 429 rejects the action.
- `DeckChatWidget.tsx` places `setIsSending(false)` *after* the await (~line 210). When
  the above fires, **the Send button stays disabled until a page reload**, with no toast.
- `SemanticSearchModal.tsx` (~line 62) has the identical shape: `status` never leaves
  `'loading'`.

Fix the root cause structurally (Task 2.1), not by adding try/catch at each call site.

---

## 3. Task list

Run `npx tsc --noEmit` after each task.

### Task 2.1 — Make it structurally impossible for a Server Action to reject

**(fixes R-1, R-2, R-3, R-4)**

1. Create `src/lib/ai-retry.ts` verbatim from **§3.1**. Exponential backoff with **full
   jitter** — the jitter is load-bearing: enrichment fans out 3 concurrent batches, and
   fixed delays would resynchronise them into the same rate-limit window.
2. Create `src/lib/action-guard.ts` verbatim from **§3.1**.
3. Create `src/lib/embeddings.ts` per §1 above.
4. Wrap **every exported AI Server Action** in `guardAction`:
   - `src/app/actions/chat.ts` — `chatWithDeck`, `syncEmbeddings`, `semanticSearchCards`
   - `src/app/actions/ai-enrich.ts` — `enrichCards`
   - `src/app/actions/ai-generate.ts` — `generateCards`
   - `src/app/actions/ai-assist.ts` — `sanitizeNotes`, `getHint`
   The plan shows the full rewritten `semanticSearchCards` under Task 2.1; follow that
   shape for the rest.
5. In `ai-enrich.ts`, **move `getGeminiJsonModel()` (~line 119) inside the guarded body.**
   It currently sits outside the try/catch and throws when `GEMINI_API_KEY` is unset.
6. Fix the two client call sites with `try/finally`, per the plan:
   `DeckChatWidget.tsx` and `SemanticSearchModal.tsx`. The `finally` block is the point.
7. Create `src/lib/ai-retry.test.ts` from the plan's Task 2.1 — all three describe blocks.

### Task 2.2 — Stop auto-syncing embeddings on page load (fixes R-5)

`DeckChatWidget.tsx` runs a `syncEmbeddings` loop in a mount effect (~lines 75-107). It
fires on **every visit to a deck page**, whether or not the user opens chat, burning
embedding spend and the 40/hr `sync_embeddings` budget.

Delete that effect. Replace with:
- A `getDeckIndexStatus(deckId)` action (new, in `actions/chat.ts`) — **two COUNT queries,
  no AI calls**, so it consumes no rate limit.
- A visible amber banner with an **"Index now"** button.
- Auto-run the sync **once**, only when the user sends their first message in a session
  and `pending > 0`.

Add a `total` field to `syncEmbeddings`'s return so the banner stays accurate mid-sync.
Full code is in the plan under Task 2.2.

### Task 2.3 — Re-embed edited cards (fixes R-8)

`src/app/actions/card.ts` (~line 93) sets `embedding: null` on update with nothing to
restore it. With Task 2.2 removing the auto-sync, an edited card would stay unsearchable
indefinitely. Re-embed inline after the successful UPDATE, in a try/catch — the edit
already succeeded, so a failed re-embed must be non-fatal (leave the row NULL; the next
"Index now" picks it up).

### Task 2.4 — Close the rate-limit bypass (fixes S-2)

This is the highest-leverage security fix in the phase. Today `enforceAiRateLimit` COUNTs,
then the action runs, then `recordAiUsage` inserts — **only on the success path.** Every
failed, timed-out or aborted AI call is therefore free and unlimited, on a metered API.

1. Add `reserveAiCall()` to `src/app/actions/_shared.ts` per the plan — reserve *before*
   the AI call.
2. Add `enforceDailyAiBudget()` from **§3.11**.
3. Change `recordAiUsage` to **update** the reservation row's metadata rather than insert
   a second row — the limiter counts rows, so a double insert would double-charge.
4. Create `supabase/migrations/202609060915_atomic_ai_reservation.sql` with the
   `reserve_ai_call` RPC (uses `pg_advisory_xact_lock` to close the concurrent-request
   race).
5. Create `supabase/migrations/202609060910_ai_daily_budget.sql` (the index from §3.11).
6. Keep the TypeScript path as a fallback when the RPC is missing — that is the pattern
   used consistently in this codebase.

### Task 2.5 — Pin the auth redirect origin (fixes S-1)

`src/app/auth/actions.ts` derives the redirect base URL from the `Origin` /
`X-Forwarded-Host` request headers in three places (~:99, ~:127, ~:158). Both headers are
client-controllable, and confirmation and password-reset links are built from that base.

- Add optional `NEXT_PUBLIC_SITE_URL` to `src/lib/env-public.ts`.
- Replace all three header-derived blocks with a single `resolveBaseUrl()` that **throws
  in production** when the variable is unset and only falls back to headers in dev.
- Create `src/lib/env-server.ts` (validates `GEMINI_API_KEY`, `CRON_SECRET`, etc.) and
  `.env.example`. Both are in the plan.

### Task 2.6 — Harden the auth callback redirect (fixes S-4)

`src/app/auth/callback/route.ts` (~line 48) accepts a protocol-relative `//evil.com`.
Not exploitable as written, but inconsistent with the correct guard at
`auth/actions.ts:57`. Reject `//` **and** switch from string concatenation to
`new URL(safePath, origin)` so the guarantee is structural.

### Task 2.7 — Security headers (fixes S-3)

Add the `headers()` block to `next.config.ts` from the plan.

**Be careful with the CSP.** A CSP that blocks Supabase or Google Fonts is worse than no
CSP. `connect-src` must include `NEXT_PUBLIC_SUPABASE_URL`; `font-src` must include
`https://fonts.gstatic.com`. `'unsafe-inline'` in `script-src` is currently required —
Next.js inlines a bootstrap script and `layout.tsx:68` has the inline theme script.

After the change, load `/`, `/login` and `/dashboard` in a browser and confirm **zero CSP
violations in the console.** Report what you saw.

### Task 2.8 — Complete the RLS policy set (fixes S-5, S-6)

Create `supabase/migrations/202609060920_policy_completeness.sql`:
1. Add the `auth.uid()` double-check to `get_due_cards_by_deck` — the one RPC of ten
   missing it. RLS already enforces isolation, so this is defence in depth, not a live
   leak. Say so accurately in your report.
2. Add DELETE policies to `card_mastery_state` and `deck_chat_embedding_metadata`, which
   have SELECT/INSERT/UPDATE but no DELETE. The mastery one is needed by a Phase 4
   feature.

### Task 2.9 — Fold mastery into the quiz transaction (fixes R-9)

`apply_quiz_sm2_batch` updates cards + `study_logs` atomically, but `card_mastery_state`
is written by three further round trips *outside* that transaction
(`quiz.ts` ~:205-237). A failure between them desynchronises quiz history from mastery.

1. Create `supabase/migrations/202609060925_quiz_batch_with_mastery.sql` — adds a
   `correct` field to the JSONB payload and a `mastery` CTE with the same highest-ever
   semantics as the TypeScript (`correct = existing OR new`).
2. In `quiz.ts`, add `correct` to the RPC payload (zip `sm2Updates` with
   `evaluatedResults`, which already carries it) and **move** the separate mastery block
   into the `if (batchRpcResult.error)` fallback branch. Do not delete it outright — the
   fallback still needs it.

### Task 2.10 — Bound the unbounded card queries (fixes P-2, P-3)

1. Create `supabase/migrations/202609060930_quiz_card_selection_rpc.sql`
   (`select_quiz_cards`). `dashboard/[deckId]/quiz/page.tsx` currently selects **every
   card in the deck** (~:104-108) to shuffle 10 in Node.
2. Rewrite that page to call the RPC, keeping the existing selection logic as a fallback.
3. Paginate `dashboard/[deckId]/page.tsx` at 60 cards with `.range()`, and add a
   `getDeckCardsPage(deckId, offset)` action + a "Load more" control in
   `DeckCardsManager`. Below 60 cards nothing changes visually.

### Task 2.11 — Stop revalidating the dashboard on every grade (fixes P-7)

`actions/study.ts` (~:131) calls `revalidatePath('/dashboard')` **per card graded** — 40
times in a 40-card session. Drop it to the deck path only, and add a
`finishStudySession(deckId)` action called from `FlashcardReviewClient`'s completion
branch and from `saveAndExit`.

---

## 4. Migrations

You create five migration files this phase:

```
202609060910_ai_daily_budget.sql
202609060915_atomic_ai_reservation.sql
202609060920_policy_completeness.sql
202609060925_quiz_batch_with_mastery.sql
202609060930_quiz_card_selection_rpc.sql
```

**Do not apply them to production.** Inspect first:

```bash
supabase migration list --linked
```
```bash
supabase db diff --linked --schema public
```

Apply to a local or staging database only, then run the assertion queries from **§5.1**
of the plan. Every one must return **zero rows**:
- no `public` table without RLS
- no RPC with `prosecdef = true` (all must be SECURITY INVOKER)
- no function without a pinned `search_path`

If you cannot reach a database, say so plainly in the report and mark the migrations
**written but unverified**. Do not claim they work.

---

## 5. Verification gate

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

`npm test` must now be **54 + your new `ai-retry.test.ts` cases**, all passing.

Then run the **failure-injection check** — this is the whole point of Task 2.1:

1. Temporarily unset `GEMINI_API_KEY` in `.env.local` and restart the dev server.
2. Open a deck, send a chat message. Expect: a **toast with a friendly message**, and the
   **Send button becomes usable again**. Not a stuck spinner, not a blank 500.
3. Open "Search all decks", run a search. Expect: an **inline error**, and the modal
   still works.
4. Restore the key.

Report exactly what you observed. If the button stays disabled, Task 2.1 is not done.

---

## 6. Rules

- **Do not regress the guarantees in §2.5.** In particular, `logQuizResult` must keep
  re-grading answers server-side from `cards.front` — the client's verdict is never
  trusted. If your Task 2.9 edit touches that logic, re-read §2.5 first.
- **Do not build Phase 3 work.** No streaming route, no `rag.ts`, no HNSW migration, no
  PDF chunking, no distractor de-duplication. `embeddings.ts` is the one exception,
  explained in §1.
- **Do not weaken a security control to make a test pass.**
- **Never claim a command passed without running it.** Paste real output.
- **Do not commit.**
- **If the plan's line numbers have drifted**, find the construct by name, note the drift,
  continue.

---

## 7. Required completion report

```markdown
## PHASE 2 COMPLETION REPORT

### 1. Status
COMPLETE | PARTIAL | BLOCKED

### 2. Verification gate
| Command | Result | Notes |
|---|---|---|
| npx tsc --noEmit | | |
| npm run lint | | |
| npm test | | test count: __ (was 54) |
| npm run build | | |

### 3. Failure-injection check (GEMINI_API_KEY unset)
| Scenario | Expected | Observed | Pass? |
|---|---|---|---|
| Deck chat send | friendly toast, Send re-enabled | | |
| Semantic search | inline error, modal usable | | |
| Quiz enrichment | falls back to Identification | | |

### 4. Findings closed
Confirm each, with the file:line where the fix landed:
R-1, R-2, R-3, R-4, R-5, R-8, R-9, S-1, S-2, S-3, S-4, S-5, S-6, P-2, P-3, P-7
Mark any NOT closed and say why.

### 5. Tasks completed
For each of 2.1 - 2.11: task ID, files touched, what changed, how verified.

### 6. Migrations
| File | Written | Applied to | Assertions passed |
|---|---|---|---|
State plainly whether you had database access. If not, mark them **written but
unverified** — do not imply they ran.

### 7. Where I stopped
Exact task ID and sub-step. If COMPLETE, say so.

### 8. Deviations & discoveries
- Drifted line references and where the construct actually was
- Anything in the plan that did not match the code
- Anything you did differently, and why
- Problems found but deliberately NOT fixed (Phase 3-5 territory)

### 9. Carry-forward for Phase 3
Critical. Phase 3 builds directly on this:
- Exact exported signatures of `withGeminiRetry`, `guardAction`, `embedTexts`,
  `toVectorLiteral`, `AiServiceError`, `aiFailureMessage`
- Where `toVectorLiteral` now lives and who imports it
- Which actions are wrapped in `guardAction` and which are not
- Current shape of `syncEmbeddings`'s return type
- Any migration NOT yet applied

### 10. Validation steps for the user
Action → expected result. Cover at minimum:
- Chat and search recover from AI failure instead of locking (the headline fix)
- Opening a deck page fires NO embedding traffic (check the Network tab)
- "Index now" appears when cards are unindexed, and works
- Editing a card keeps it findable in semantic search
- A quiz still updates mastery %, and history matches
- A 40-card study session no longer thrashes the dashboard
- `curl -sI http://localhost:3000/ | grep -i content-security-policy` returns a header
- No CSP violations in the console on /, /login, /dashboard
- Signup confirmation links point at NEXT_PUBLIC_SITE_URL
```
