# Phase 2.5 + Phase 3 Completion Report

**Date:** 2026-09-07 · **Base:** `132e99a`

## 1. Status

**Phase 2.5: COMPLETE** — all six defects and both gaps from `PHASE_2_AUDIT.md` closed.
**Phase 3: COMPLETE for code; migrations written but NOT applied** (see §8).

## 2. Verification gate

Every command below was actually run; these are its real results.

| Command | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | exit 0 |
| `npm run lint` | ✅ PASS | no errors, no warnings |
| `npm test` | ✅ PASS | **118 tests / 15 files** (was 66 / 10) |
| `npm run build` | ✅ PASS | 14 routes — `/api/chat` now present |

New test files: `action-guard.test.ts` (6), `pdf-chunking.test.ts` (11),
`distractors.test.ts` (8), `card-generation.test.ts` (14), `sse-parsing.test.ts` (9).

---

## 3. Phase 2.5 — audit fixes

| ID | Fix | Where |
|---|---|---|
| **D1** | `recordAiUsage` no longer issues an UPDATE that RLS silently discards. `ai_usage_logs` has `FOR UPDATE USING(false)`, so the write matched zero rows and PostgREST reported success. The reservation row is now the single record; post-hoc detail goes to the structured log. | `_shared.ts` |
| **D2** | `get_due_cards_by_deck` restored to `auth.uid() AND p_user_id`. The shipped `coalesce(auth.uid(), p_user_id)` inverted finding S-5 — it created a path that trusts a caller-supplied id. | `202609070900` |
| **D3** | `guardAction` keeps Zod `fieldErrors` structured so `formatActionError` can flatten them. Users were seeing `{"message":["Message is too short"]}` in toasts. Unrecognised error shapes now fall back to generic copy rather than leaking internals. | `action-guard.ts` |
| **D4** | `select_quiz_cards` gained `p_focus_unproven`, and the quiz page derives its fetch limit from the real unproven count. The deck page promises "all unproven cards (N)" and now delivers them. | `202609070900`, `quiz/page.tsx` |
| **D5** | `ORDER BY priority, random()` inside each tier. Selection was fully deterministic, so a repeat quiz drew the same ~20 cards. | `202609070900` |
| **D6** | `quizReadyCards` and `topTopics` now come from deck-wide RPCs (`count_quiz_ready_cards`, `get_deck_topic_tag_counts`) instead of the 60-card page. A fully-enriched 200-card deck read "60/200 quiz-ready" permanently. | `[deckId]/page.tsx` |
| **G1** | `src/lib/env-server.ts` created and wired into the Gemini factories. A missing `GEMINI_API_KEY` now fails with one precise message; `CRON_SECRET` is enforced in production. | `env-server.ts`, `_shared.ts` |
| **G2** | CSP `'unsafe-eval'` scoped to development only; `object-src 'none'` added. Verified live: `curl -D -` shows the header with `object-src 'none'`. | `next.config.ts` |

**Nits also fixed:** user-facing feature names (`'sanitizeNotes'` → `'Note cleanup'`,
`'getHint'` → `'Hint generation'`), and `gradeCard` restored `revalidatePath('/dashboard/{deckId}')`
so a mid-session back-navigation isn't stale.

---

## 4. Phase 3 — tasks

### 3.1 Streaming chat route — DONE
New: `src/app/api/chat/route.ts`, `src/lib/rag.ts`, `src/lib/use-deck-chat-stream.ts`.
SSE with `meta` / `delta` / `done` / `error` frames. `meta` is emitted before the first
token so source chips render while the model is still generating.

The route authenticates itself — documented in its header comment — because
`proxy.ts` excludes `/api/**`, so no session refresh runs there.

### 3.2 DeckChatWidget rewritten — DONE
Optimistic user message; live streaming bubble with a caret; source chips from `meta`;
Retry button preserving any partial answer; un-grounded answers rendered in amber with a
"Not covered by this deck" label. The composer's `disabled` is derived from stream state,
so there is no `setIsSending(false)` an early return can skip — R-2 cannot recur.
The Phase 2 "Index now" banner is intact.

### 3.3 Retrieval threshold — DONE
`MIN_CONTEXT_SIMILARITY = 0.62` with a floor applied in `retrieveDeckContext`.
**The oldest-cards fallback is deleted** — verified by grep; the only remaining
`created_at ascending` orders are the embedding queue and chat history. When the vector
RPC fails, both the route and the action now degrade loudly instead of answering from
unrelated cards.

### 3.4 Batch embeddings + HNSW — DONE (code), migrations unapplied
`syncEmbeddings` now does one `batchEmbedContents` per 100 cards and one
`apply_card_embeddings_batch` RPC, with the per-card loop kept only as a
missing-migration fallback. Migrations `202609060900` (HNSW) and `202609060905`
(batch apply + partial index) written.

### 3.5 PDF chunking — DONE
`src/lib/pdf-chunking.ts` with `chunkDocumentText`, `assessPdfQuality`,
`describePdfQuality`. `generateCards` now chunks instead of truncating at 120k chars
(raised to a 600k outer bound; `MAX_CHUNKS = 12` is what actually bounds spend).
Each chunk has its own try/catch, and `partial` / `failedChunks` surface in
`PDFUploadZone` as a warning toast.

**Preserved unchanged as instructed:** `hasPdfMagicBytes`, the `finally { pdf.destroy() }`,
and the whole ranking pipeline.

### 3.6 Distractor quality — DONE
Schema now `minItems: 3, maxItems: 3` with `propertyOrdering`; prompt carries the five
explicit rules; `selectUsableDistractors` rejects exact and near-duplicates (0.85
similarity) against both the answer and siblings, requiring exactly 3.
`MCQMode` de-dups client-side, gates at `options.length < 4`, and keys by index.

**All quiz-ready gates aligned to 3 distractors** — `QuizAssessmentClient` (×2),
`DeckCardsManager`, `enrichCards`. These were still at 2, which would have marked
3-option cards as ready and never re-enriched them.

### 3.7 Generation schema + temperature — DONE
`minItems`/`maxItems`/`propertyOrdering` + field descriptions on the card schema.
`getGeminiJsonModel` now defaults to **temperature 0.1** for extraction with
`topP: 0.95`; deck chat opts into 0.4 explicitly. `pickBalancedCards` fixed (R-12) —
it selects the remainder by score instead of truncating the advanced band.

### 3.8 Retry coverage — DONE
All **9** Gemini call sites go through `withGeminiRetry`. `enrich_cards` uses
`maxAttempts: 2` because `ENRICH_CONCURRENCY` fans out three batches.

---

## 5. Fallback matrix audit (§3.10)

| Row | Implemented | Where |
|---|---|---|
| Chat 429 → retry then friendly error | ✅ | `withGeminiRetry` + `error` frame |
| Stream dies mid-answer → keep partial | ✅ | `error` frame carries `partial` |
| Vector RPC missing → **no** oldest-cards substitute | ✅ **verified deleted** | `rag.ts` returns `degraded: true` |
| Nothing over threshold → prompt refuses | ✅ | `buildDeckChatSystemInstruction` branches on `grounded` |
| Chunk fails → others still produce cards | ✅ | per-chunk try/catch |
| All chunks fail → clear message | ✅ | distinct copy when `failedChunks > 0` |
| Scanned PDF → OCR instructions | ✅ | `describePdfQuality` |
| Enrichment 429 → `failedCardIds` | ✅ | unchanged, still works |
| <3 usable distractors → excluded | ✅ | `selectUsableDistractors` |
| MCQ runtime gate → Identification | ✅ | `options.length < 4` |
| Embeddings fail → rows stay NULL | ✅ | banner shows pending count |
| Search failure → modal stays usable | ✅ | Phase 2 fix retained |
| No `GEMINI_API_KEY` → clear message | ✅ | `getServerEnv` + `guardAction` |

**Client-side random distractors: deliberately NOT implemented**, per §3.10 and Appendix C.

---

## 6. What I verified, and what I could not

**Verified by running it:**
- `/api/chat` is live and enforces auth — `POST` without a session returns
  `HTTP 401 {"error":"You must be logged in."}`.
- Security headers are applied, including the new `object-src 'none'`.
- SSE frame buffering, including a stream delivered **one character at a time** and a
  chunk that splits the `\n\n` separator — 9 tests in `sse-parsing.test.ts`.
- The D3 regression empirically: a test asserts the toast reads
  `Message is too short`, not `{"message":[...]}`.

**NOT verified — be aware:**
- **End-to-end streaming against live Gemini.** That needs an authenticated session,
  which I can't create without your credentials. The route, the parser and the auth
  gate are each verified; the joined-up path is not.
- **First-token latency (<1.5s target).** Requires the above.
- **Query plans.** No `explain analyze` was run — see §8.
- **Threshold calibration.** `scripts/calibrate-threshold.mjs` is written but needs a
  real deck and a user token. **0.62 remains my estimate, not a measurement.**

---

## 7. Deviations & discoveries

1. **`'use server'` blocks non-async exports.** The plan has `selectUsableDistractors`
   and the ranking helpers exported from action files. The build fails with
   *"Server Actions must be async functions."* I extracted them into
   `src/lib/distractors.ts`, `src/lib/card-generation.ts` and `src/lib/text-normalize.ts`.
   Cleaner anyway — they're now unit-testable, which is what §3.8/§3.9 wanted.

2. **`propertyOrdering` is missing from the SDK's types.** It's a real Gemini field but
   absent from `@google/generative-ai` 0.24's `ObjectSchema`. Spread in with a cast and a
   comment; drop it when the types catch up.

3. **`toVectorLiteral` lives in `embeddings.ts`**, not `rag.ts` as §3.4 shows — following
   the Phase 2 sequencing correction. `rag.ts` imports it.

4. **`recordAiUsage` lost its completion metadata (D1).** I deliberately did *not* add a
   `SECURITY DEFINER` function to work around the deny policy: Phase 5's assertion suite
   requires zero `prosecdef = true` functions, and the append-only guarantee is worth more
   than the diagnostic fields. The detail is in the structured log instead.

5. **`quizReadyCards` needed two new RPCs.** Pagination (P-3) had broken the badge; the
   fix needs deck-wide aggregates, so `202609070900` adds `count_quiz_ready_cards` and
   `get_deck_topic_tag_counts` with TypeScript fallbacks.

6. **A test of mine was wrong, not the code.** I asserted `pickBalancedCards` dedups by
   front; it didn't (callers do). I made it hold standalone since it's cheap — but
   flagging that the test drove the change.

---

## 8. Migrations — WRITTEN, NOT APPLIED

Three new files this phase, plus the five from Phase 2, are **unapplied**:

| File | Purpose |
|---|---|
| `202609060900_hnsw_embedding_index.sql` | IVFFlat → HNSW (P-1) |
| `202609060905_apply_card_embeddings_batch.sql` | Batch apply + partial index (P-4, P-6) |
| `202609070900_phase25_corrections.sql` | D2, D4, D5, D6 |

**I did not apply them.** The Supabase CLI is linked to remote project
`idmmivsxdgpqweofseud`, and Docker isn't running so there's no local stack. Applying to a
remote database is not something I'll do unattended — especially the HNSW swap, which
takes an **ACCESS EXCLUSIVE lock** on `cards` for the duration of the index build.

**If `cards` already holds real data**, use the `CREATE INDEX CONCURRENTLY` variant
commented at the bottom of `202609060900` and run it by hand — it cannot live in a
transaction, so it cannot be a normal migration.

Consequence: until they're applied, every new RPC falls into its TypeScript fallback.
The app works; it just isn't getting the performance or correctness wins yet.

---

## 9. Carry-forward for Phase 4

- **`useDeckChatStream`** returns `{ state, send, cancel, reset }`.
  `state: { status: 'idle'|'retrieving'|'streaming'|'done'|'error', answer, references,
  followupSuggestions, grounded, degraded, sessionId, errorMessage, retryable }`.
  SSE events: `meta` / `delta` / `done` / `error`.
- **`chatWithDeck` (non-streaming) is still exported** and threshold-aware, but **no
  longer called by any UI**. It's the documented fallback; delete it a release after
  streaming is proven.
- **`Flashcard.tsx` is untouched** — Phase 4 can still extract `FlipCard` from it.
- **New lib modules** Phase 4 may want: `card-generation.ts`, `distractors.ts`,
  `text-normalize.ts`, `rag.ts`, `pdf-chunking.ts`, `env-server.ts`.
- **Light-theme debt paid down slightly** — the index banner and suggestion chips now
  have `dark:` variants. The rest of the audit list in Task 4.5 still stands.
- **All eight migrations remain unapplied.**

---

## 10. Validation steps for you

Apply the migrations to a staging database first, then:

**Streaming chat**
1. Open a deck with indexed cards → ask a question it covers.
   → Your message appears **instantly**; source chips appear **before** the first token;
   text streams in word by word.
2. Ask something the deck does *not* cover.
   → An **amber** bubble labelled "Not covered by this deck", suggesting cards to add —
   not a confident answer.
3. Kill wifi mid-answer.
   → Partial text is kept, plus a **Retry** button.
4. Restore wifi, click Retry.
   → Re-sends, and the composer is usable afterwards.

**PDF**
5. Upload a 100-page text PDF → spot-check that cards reference **late-document** content.
6. Upload a scanned PDF → specific OCR guidance, not a generic failure.

**Quiz**
7. Start an MCQ quiz → every question has **exactly 4 distinct** options.
8. Run the same quiz twice → **different cards** (requires `202609070900`).
9. Tick "Force include all unproven cards (N)" on a deck with many unproven cards →
   the quiz covers all N, not ~20.
10. Open a fully-enriched 200-card deck → header reads **"200/200 quiz-ready"**, not 60/200.

**Regressions from Phase 2.5**
11. Type "hi" (2 chars) in deck chat → the Send button stays disabled (client guard);
    if you bypass it, the toast reads plain text, never raw JSON.
12. `curl -sI http://localhost:3000/ | grep -i content-security-policy` → includes
    `object-src 'none'`.

**Threshold calibration (recommended before trusting 0.62)**
```bash
node scripts/calibrate-threshold.mjs --deck <uuid> \
  --relevant "a question your deck covers" \
  --irrelevant "a question it does not"
```
