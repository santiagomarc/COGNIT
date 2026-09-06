# Cognit — Phase 3: AI Pipeline & Streaming Upgrade

You are a senior full-stack engineer with production RAG and streaming experience, working
in the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router)
+ React 19 + Supabase (Postgres, pgvector) + Gemini 2.5 Flash and `text-embedding-004`.

Your task is to execute **Phase 3** of `COGNIT_PRODUCTION_EXECUTION_PLAN.md` in the
repository root.

> **If the user pasted a `## Carry-forward from Phase 2` section above this prompt, read
> it first** — especially the exported signatures of `withGeminiRetry`, `guardAction`,
> `embedTexts` and `toVectorLiteral`. Phase 3 builds directly on them.
> If there is no such section, verify Phase 2 landed: `src/lib/ai-retry.ts`,
> `src/lib/action-guard.ts` and `src/lib/embeddings.ts` must all exist.

---

## 0. Before you write any code

1. Read `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, specifically **all of §3**. It contains
   complete implementations, not sketches:
   - **§3.0** — competitive benchmark; explains *why* this phase matters
   - **§3.2** — full `src/app/api/chat/route.ts` source + the SSE wire protocol
   - **§3.3** — full `src/lib/use-deck-chat-stream.ts` source
   - **§3.4** — `src/lib/rag.ts`, the similarity threshold
   - **§3.5** — batch embeddings + the `apply_card_embeddings_batch` migration
   - **§3.6** — the IVFFlat → HNSW migration
   - **§3.7** — `src/lib/pdf-chunking.ts` + the rewritten `generateCards` loop
   - **§3.8** — distractor schema, prompt, and `selectUsableDistractors`
   - **§3.9** — card-generation schema and temperature
   - **§3.10** — the fallback matrix. **This is a contract the UI must honour.**
   - **§3.11** — token-cost economics
   - **§4 → PHASE 3** — Tasks 3.1 through 3.8, your work order
2. Confirm a green baseline: `npx tsc --noEmit && npm run lint && npm test && npm run build`

---

## 1. Two things to understand before starting

**First: `src/app/api/chat/route.ts` does not exist.** Deck chat is currently a blocking
Server Action, `chatWithDeck` in `src/app/actions/chat.ts` (~line 300). The only route
handlers in the repo are `api/keep-alive` and `auth/callback`. You are **creating** the
streaming route, not refactoring one.

**Second: `src/proxy.ts` deliberately excludes `/api/**`** (see its `matcher`, ~line 84).
Two consequences:
- Good: nothing buffers your SSE response.
- Important: **no Supabase session refresh runs on that route.** Your handler must call
  `supabase.auth.getUser()` itself. If a token expires mid-conversation the user gets a
  401; the client hook surfaces it, and a page navigation (which does pass through the
  proxy) refreshes the session. Document this in the route's header comment.

### Sequencing note carried from Phase 2

Phase 2 created `src/lib/embeddings.ts` with **both** `embedTexts` and `toVectorLiteral`.
When you create `src/lib/rag.ts` from §3.4, **import `toVectorLiteral` from
`@/lib/embeddings` instead of redefining it.** §3.4 shows a local copy; that is superseded.

---

## 2. Task list

Run `npx tsc --noEmit` after each task.

### Task 3.1 — Create the streaming chat route

Create four files verbatim from §3.2 – §3.5:

| File | Source |
|---|---|
| `src/app/api/chat/route.ts` | §3.2 (handler + `persistTurn` + `generateFollowups`) |
| `src/lib/rag.ts` | §3.4 |
| `src/lib/use-deck-chat-stream.ts` | §3.3 |
| `src/lib/embeddings.ts` | extend the Phase 2 version if anything is missing |

**Verify streaming works before touching any UI.** This ordering matters — debugging SSE
through a React component is far harder than through curl:

```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H "Cookie: <your dev session cookie>" \
  -d '{"deck_id":"<a real deck uuid>","message":"explain the key concept in this deck"}'
```

Expect `event: meta` **immediately**, then a stream of `event: delta` frames, then
`event: done`. If the entire body arrives at once, something is buffering — check
`X-Accel-Buffering` and that you are not accidentally awaiting the full stream.

Paste the first ~15 lines of that output into your report.

### Task 3.2 — Rewrite DeckChatWidget for streaming

Five behavioural changes beyond streaming itself, all of them in §4 Task 3.2:

1. **Optimistic user message** — today the user's own text does not appear until the
   assistant replies. Push it to the list immediately.
2. **Render the streaming answer as a live message**, not a spinner.
3. **Source chips from the `meta` frame**, before the first token. Retrieval is the slow
   part; showing *what was found* while the answer streams is the single biggest
   perceived-latency win.
4. **Retry button** when the `error` frame carries `retryable: true`, preserving any
   partial answer.
5. **Un-grounded answers rendered distinctly**, so "your deck doesn't cover this" does not
   look like a normal reply.

Bind the composer's `disabled` to `isStreaming` **derived from stream state** — not to a
manually managed boolean. That is what makes finding R-2 (the permanently stuck Send
button) structurally impossible to reintroduce.

Keep the Phase 2 "Index now" banner and `getDeckIndexStatus` behaviour intact.

### Task 3.3 — Ship the retrieval threshold (fixes R-10, R-11)

1. Point the non-streaming `chatWithDeck` at `retrieveDeckContext` too.
2. **Delete the oldest-cards fallback** at `src/app/actions/chat.ts` ~:365-380. When the
   vector RPC fails it currently grabs the 5 oldest cards by `created_at` and feeds them
   to the model as "deck context" — producing a confident answer built from unrelated
   material. That is worse than an error. Degrade loudly instead (`degraded: true`).
3. Calibrate the `MIN_CONTEXT_SIMILARITY = 0.62` floor against real data before trusting
   it. Write `scripts/calibrate-threshold.mjs`, run it against a seeded dev deck with a
   set of questions the deck *does* cover and a set it does *not*, print both similarity
   distributions, and place the floor between them.

   **Report the actual numbers you measured.** If the two distributions overlap heavily,
   the embeddings are the problem, not the threshold — check that `taskType` is being set
   (`RETRIEVAL_QUERY` for queries, `RETRIEVAL_DOCUMENT` for cards).

### Task 3.4 — Batch the embedding pipeline (fixes P-4, P-6, P-8, P-1)

1. Rewrite `syncEmbeddings`'s inner loop (`chat.ts` ~:134-164) per Task 3.4 — one
   `batchEmbedContents` call per 100 cards instead of one HTTP call per card, then a
   single `apply_card_embeddings_batch` RPC instead of up to 200 UPDATEs.
2. Create `supabase/migrations/202609060905_apply_card_embeddings_batch.sql` (§3.5) —
   includes the partial index `cards_deck_pending_embedding_idx`.
3. Create `supabase/migrations/202609060900_hnsw_embedding_index.sql` (§3.6).

**About the HNSW migration.** The existing `cards_embedding_ivfflat_idx` was created with
`lists = 10` in the same migration that added the column — i.e. trained on an empty table.
IVFFlat computes centroids at build time, so its recall never recovers without a rebuild.

Two operational cautions:
- On a populated table, `drop index` + `create index` takes an **ACCESS EXCLUSIVE lock**.
  If the target database holds real user data, use `create index concurrently` in a
  separate, non-transactional migration.
- Keep this migration **separate from the others** — it is the one change that is not
  cleanly reversible alongside a code rollback.

Then prove the index is used:

```sql
explain (analyze, buffers)
select id, 1 - (embedding <=> '[...]'::vector(768)) as similarity
from cards
where deck_id = '<uuid>' and embedding is not null
order by embedding <=> '[...]'::vector(768)
limit 5;
```

Expect `Index Scan using cards_embedding_hnsw_idx`. **A `Seq Scan` means the task is not
done.** Paste the real plan output into your report.

### Task 3.5 — PDF chunking (fixes A-3)

Today `pdf-parse` extracts the whole document and `ai-generate.ts` (~:354) truncates to
120,000 characters — roughly 40 pages — **silently**. A 200-page textbook yields cards
from its first fifth with no user-visible signal.

1. Create `src/lib/pdf-chunking.ts` verbatim from §3.7: `chunkDocumentText`,
   `assessPdfQuality`, `describePdfQuality`.
2. Rewrite `generateCards`'s extraction + generation section per §3.7.
   **Preserve unchanged:** the magic-byte check (`hasPdfMagicBytes`), the
   `finally { await pdf.destroy() }`, and the entire candidate-ranking pipeline
   (`parseAndRankGeneratedCards`, `scoreCandidateCard`, `isValidTermFront`,
   `isEnumerationLike`). That ranking code is the best-engineered part of the AI path.
3. Wrap each chunk in its own try/catch — one bad section must not lose the document.
4. Return `partial: failedChunks > 0` and surface it in `PDFUploadZone` as a warning
   toast, per Task 3.5.
5. Create `src/lib/pdf-chunking.test.ts` from the plan.

The `MAX_CHUNKS = 12` ceiling is a **cost control**, not a performance tweak — it bounds
the worst-case upload at ~290k input tokens. Do not raise it.

### Task 3.6 — Distractor quality (fixes R-6, R-7)

Three compounding problems today: the enrichment schema has no cardinality constraints,
the parser accepts as few as 2 distractors, and nothing checks a distractor against the
correct answer. A distractor equal to `card.front` produces a duplicate React key, two
options rendered "correct", and a question with no wrong answer.

Apply **all of §3.8**:
1. Schema with `minItems: 3, maxItems: 3` and `propertyOrdering`.
2. The rewritten prompt with the five explicit distractor rules.
3. `selectUsableDistractors` — server-side rejection of exact and near-duplicates, using
   the existing `similarity()` from `src/lib/fuzzy.ts`. **Require exactly 3**; a 3-option
   MCQ is a materially easier question (33% guess floor vs 25%).
4. In `MCQMode.tsx`: client-side de-dup, raise the render gate from `< 2` to `< 3`, and
   key options by **index** rather than by value.
5. Create `src/lib/distractors.test.ts` from the plan.

Cards that fail validation land in `failedCardIds`, which `enrichCards` already returns
and `QuizAssessmentClient` already tolerates via `onFallbackToIdentification`. Verify that
path still works.

### Task 3.7 — Card-generation schema and temperature

Per §3.9:
- `minItems` / `maxItems` / `propertyOrdering` on `CARD_GENERATION_SCHEMA`.
- Split `getGeminiJsonModel` so extraction runs at **temperature 0.1** (same PDF should
  yield the same cards) while chat keeps some warmth.
- Apply the fixed `pickBalancedCards` from §3.7 — the current version's final
  `.slice(0, maxCount)` drops the highest-scoring *advanced* candidates whenever the other
  two bands over-fill, which is the opposite of the stated balance goal.
- Export the pure helpers (`isValidTermFront`, `scoreCandidateCard`, `pickBalancedCards`,
  `isEnumerationLike`) and create `src/lib/card-generation.test.ts`.

### Task 3.8 — Route every remaining Gemini call through the retry layer

Eight call sites, listed in the plan's Task 3.8 table. Each `model.generateContent(...)`
becomes `withGeminiRetry(() => model.generateContent(...), { label })`.

Use `maxAttempts: 2` for `enrich_batch` — three concurrent batches × 3 attempts against a
rate-limited endpoint makes things worse.

---

## 3. The fallback matrix is a contract

§3.10 defines the required degraded state for every failure mode. Walk the table and
confirm each row is actually implemented. Two rows deserve specific attention:

- **"vector RPC missing" → no oldest-cards substitute.** Verify Task 3.3 deleted it.
- **"nothing over threshold" → the prompt refuses and suggests cards to add.** Verify the
  system instruction branches on `context.grounded`.

**Deliberate omission — do not implement it.** The original brief asked for a client-side
random-distractor fallback. §3.10 and Appendix C explain why it is excluded: distractors
assembled from other cards are trivially eliminable (wrong domain, wrong grammatical form)
and train the wrong discrimination. The correct degraded mode is Identification, which
already exists. **Do not add it back.**

---

## 4. Verification gate

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

`npm test` must include three new files: `pdf-chunking.test.ts`, `distractors.test.ts`,
`card-generation.test.ts`.

**Performance targets — measure, don't assume:**

| Target | How to measure |
|---|---|
| First token < 1.5 s on a warm deck | Browser Network tab, time to first `delta` frame |
| HNSW index used | `explain (analyze, buffers)` — must not say `Seq Scan` |
| Pending-embedding query uses its index | `explain` on the `embedding is null` query |
| 100-page PDF draws cards throughout | Upload one; spot-check that cards reference late-document content |

---

## 5. Rules

- **Do not build Phase 4 work.** No sharing, no onboarding, no confetti, no sound, no
  `FlipCard`, no `LazyMotion`.
- **Preserve the ranking pipeline in `ai-generate.ts`.** You are changing how text reaches
  it, not how it scores.
- **Keep `chatWithDeck` as a non-streaming fallback.** Do not delete it this phase.
- **Do not raise `MAX_CHUNKS` or the rate limits** to make something feel faster.
- **Never claim a command or a query plan passed without running it.** Paste real output.
- **Do not commit.**

---

## 6. Required completion report

```markdown
## PHASE 3 COMPLETION REPORT

### 1. Status
COMPLETE | PARTIAL | BLOCKED

### 2. Verification gate
| Command | Result | Notes |
|---|---|---|
| npx tsc --noEmit | | |
| npm run lint | | |
| npm test | | test count: __ (3 new files expected) |
| npm run build | | |

### 3. Streaming proof
Paste the first ~15 lines of the `curl -N` SSE output. Confirm `meta` arrives before the
first `delta`.

### 4. Performance measurements
| Metric | Target | Measured | Pass? |
|---|---|---|---|
| Time to first token (warm deck) | < 1.5 s | | |
| Vector query plan | Index Scan on cards_embedding_hnsw_idx | | |
| Pending-embedding query plan | Index Scan on cards_deck_pending_embedding_idx | | |
| syncEmbeddings round trips (200 cards) | 2 HTTP + 1 RPC | | |

Paste the actual `explain (analyze, buffers)` output for the vector query.

### 5. Threshold calibration
- Similarity distribution for questions the deck DOES cover: min/median/max
- Similarity distribution for questions it does NOT cover: min/median/max
- Floor chosen and why
- Whether 0.62 held or you moved it

### 6. Fallback matrix audit
Walk every row of §3.10. For each: implemented / not implemented, and where.
Explicitly confirm the oldest-cards fallback is DELETED.

### 7. Tasks completed
For each of 3.1 - 3.8: task ID, files touched, what changed, how verified.

### 8. Migrations
| File | Written | Applied to | Index verified |
|---|---|---|---|
State whether the HNSW swap ran against a populated table, and whether you used
`create index concurrently`.

### 9. Where I stopped
Exact task ID and sub-step.

### 10. Deviations & discoveries
- Drifted line references
- Anything in §3's code that did not compile as written, and your fix
- Anything you did differently, and why

### 11. Carry-forward for Phase 4
- Final signature of `useDeckChatStream` and the SSE event shapes
- Whether `chatWithDeck` (non-streaming) is still wired anywhere
- Current `DeckChatWidget` structure — Phase 4 does not touch it, but Phase 4 touches
  neighbouring deck-page components
- Whether `Flashcard.tsx` is still untouched (Phase 4 extracts `FlipCard` from it)
- Any migration NOT yet applied

### 12. Validation steps for the user
Action → expected result. Cover at minimum:
- Chat streams token by token; source chips appear before the first token
- Asking something the deck does NOT cover produces a refusal, not a confident wrong answer
- Killing the network mid-stream keeps the partial answer and offers Retry
- Retry works and the composer is usable afterwards
- Uploading a 100-page PDF yields cards from throughout the document
- Uploading a scanned PDF gives specific OCR guidance
- Every MCQ shows exactly 4 distinct options
- A card with too few usable distractors falls back to Identification cleanly
- Indexing a 200-card deck completes in a handful of requests, not hundreds
```
