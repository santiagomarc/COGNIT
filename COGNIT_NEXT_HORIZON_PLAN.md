# Cognit — Next Horizon Plan

**Revision:** 1.1 · 2026-09-23. Rev 1.1 records execution corrections: five more KBD-01 handlers (§3.4), the `synthesis.ts` line references past line 840 (§1.3–§1.5, §3.5), the tooling state (§1.2.1), and the test counts that follow (§3.9, §4.5, §7).
**Baseline:** `main` @ `bb045b3` (pushed; in sync with `origin/main`). The audit began on `f164797`; `bb045b3` landed at 08:56 +08 while it ran, and every finding below was re-verified against it.
**Scope:** forensic verification of four flagged hazards · full-spectrum audit (design-system conformance, pedagogy, WCAG 2.2 AA, performance) · a phased roadmap whose code has been compiled, tested and — where possible — executed.
**Companions:** `COGNIT_DESIGN_SYSTEM.md` (Rev. C) · `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` (D1–D20) · `COGNIT_MICRO_SYNTHESIS_AUDIT_II.md`.

---

## How to read this document

- **§0** is the one-page answer. **§1** is the evidence. **§2** is the roadmap. **§3–§6** are the phases, each ending in a gate. **§7** collects every gate in one matrix. Appendices hold the raw evidence and the ready-to-apply Phase 0 patch.
- Findings carry stable IDs (`AUTH-01`, `KBD-01`, …) and a severity: **S0** blocks shipping or loses data at scale · **S1** user-visible defect · **S2** quality, accessibility or performance debt · **S3** polish.
- Every `file:line` refers to `bb045b3` unless marked otherwise.

### Evidence standard

Nothing in §1 is inferred where it could be measured. What was run:

| Question | Method |
|---|---|
| Is `getClaims()` real, and what does it do here? | Read `@supabase/auth-js` 2.89.0 as installed; fetched the project's public JWKS; decoded the header of the stored test token (header and `exp` only — no secret printed). |
| Which migrations are applied? | `supabase migration list --linked`; `npm run verify:deployment` (anon, read-only); `supabase gen types --linked` diffed against the committed types. |
| What is in production? | `supabase inspect db db-stats / table-stats / outliers` (read-only). |
| Does 0.62 hold for `gemini-embedding-001`? | Three live probes with the app's exact request shape (36 synthetic cards, 59 queries), then the same numbers reproduced through the app's own `embedTexts` in a new live test. |
| Does it build, and what ships to the browser? | `tsc`, ESLint, Vitest and `next build` in an isolated APFS clone; per-route first-load JS computed from the build's client-reference manifests. |
| Do the proposed fixes work? | Phase 0 implemented in a clone: `tsc` clean · ESLint 0 problems · **419/419** tests · `next build` ✓ · `git apply --check` clean against this repo · the live retrieval gate passing. Phases 1–3 TypeScript: `tsc` clean · **437/437** tests · build ✓. SQL: parsed by PostgreSQL's own parser (libpg_query) — 54 statements, 11 PL/pgSQL bodies, 5 SQL bodies. `@google/genai` adapter typechecked against 2.24.0 and embedding parity measured live. Nonce CSP verified on a running `next start` in both rollout modes. |
| What could not be verified | Anything behind a signed-in session, the Vercel dashboard, or a SQL editor — listed in §1.7 with the exact check to run. |

---

## 0. Executive summary

### 0.1 Verdicts on the four flagged hazards

| # | Flagged hazard | Verdict | What is actually wrong | Fix |
|---|---|---|---|---|
| **H1** | `proxy.ts` `getClaims()` throws a TypeError | **False alarm.** `getClaims()` ships and is typed in the installed `@supabase/auth-js` 2.89.0. | (a) It rethrows non-Auth errors, so a hand-tampered session cookie yields a 500 instead of a login redirect (AUTH-01, S3). (b) The project still signs with the legacy **HS256** secret — the JWKS is empty — so every `getClaims()` silently falls back to a `getUser()` network round-trip: two serial Auth calls precede every chromed navigation (AUTH-02, S2). | §3.3 fail-closed wrapper · §6.3 ES256 signing keys |
| **H2** | Unapplied migrations, schema drift | **No migration is unapplied.** All 48 files are recorded remotely; the live schema generates exactly the committed types. | The drift ran the other way: regenerating types in `f164797` dropped hand-added `\| null` on three RPC arguments, which failed `tsc` and therefore `next build` — **fixed by `bb045b3` during this audit**, as was the uncommitted edit to applied migration `202609170960`. Still open: that migration's tolerant `DO` blocks may have left the HNSW settings unset (DB-03). | §3.2 one SQL check · §3.8 deploy + extended probe |
| **H3** | `MIN_CONTEXT_SIMILARITY = 0.62` causes premature refusals | **Holds.** Covered questions score ≥ 0.678; 0 of 27 refused. | The same constant is reused for card↔card similarity, where every same-topic pair scores ≥ 0.75 — a no-op filter (RAG-02). The question-bank floor of **0.45** sits below the off-topic band, so a Macbeth essay question "matches" 8 of 8 operating-systems cards (RAG-03, S1). No production telemetry exists to recalibrate (RAG-04). | §3.5 calibrated floors + telemetry + live gate |
| **H4** | `after()` terminated early in production | **Safe on the current target** (Next 16.1.0, Node runtime, Vercel). | Background work shares the route's `maxDuration`, and the study route never pins one (LC-01). A background Supabase call that lands inside the 90 s refresh margin rotates the refresh token after the response is gone — the browser keeps the revoked one and reuse detection can sign the user out (LC-02, S2). | §3.7 session headroom + pinned budget |

### 0.2 What the audit found that nobody flagged

1. **KBD-01 (S1, data loss).** Page shortcuts fire *behind* modal dialogs. On the drill canvas, pressing **S** while "Leave this drill?" is open skips the drill and deletes the saved answer the dialog just promised to keep. In the quiz, **1–4** answers the MCQ behind the quit dialog. → §3.4.
2. **The micro-synthesis loop has never run in production.** Production holds 4 decks, 195 cards and **0** drills, attempts or questions: whatever version is deployed, no drill has ever been generated there. The floors (RAG-02/03) and the exam-date bug (PED-06) can be fixed before any student meets them. → §3.5–§3.6.
3. **PED-06 (S1).** "Exam in N days" is one day long — tomorrow reads "2 days", exam day reads "1 day" — and the server's final-days ladder engages a day late. → §3.6.
4. **MOB-01 (S1).** Every drill slot, the plan form, the question-bank box, the "unfair" note and the exam-date input override the 16 px mobile font the input primitives set, which is precisely the iOS Safari zoom-on-focus bug `input.tsx` documents. → §5.1.
5. **PERF-01.** `MotionProvider` claims to lazy-load Framer Motion's feature set but imports `domMax` statically, so it ships in every first load. → §5.6.

### 0.3 Roadmap at a glance

| Phase | Goal | Size | Exit gate |
|---|---|---|---|
| **0** | Ship the build that works; stop the data loss; correct the floors and the dates; harden the auth edges | ~1 day — the patch is in Appendix D | G0 (§3.9) |
| **1** | Deck lifecycle (trash + undo, duplicate, merge, CSV/Anki export, opt-in directory) · key integrity · concept map · voice | 8–12 days | G1 (§4.5) |
| **2** | Mobile canvas · focus and screen-reader flow · chart accessibility · design-system conformance (Rev. D) · information architecture · bundle | 5–7 days | G2 (§5.7) |
| **3** | `@google/genai` · nonce CSP · ES256 signing keys · synthesis read-RPCs · load, drift and calibration gates · observability | 6–9 days | G3 (§6.7) |

Sizes are single-developer estimates and include writing the tests each section names.

---

## 1. Forensic findings

### 1.1 H1 — `proxy.ts` and `getClaims()`

**Installed versions** (from `node_modules/*/package.json`): `@supabase/ssr` 0.8.0 · `@supabase/supabase-js` 2.89.0 · `@supabase/auth-js` 2.89.0 · `next` 16.1.0.

**The method exists.** `node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts:588` declares `getClaims(jwt?, options?)`, implemented at `GoTrueClient.js:2732`, and `JwtPayload` is exported and typed. The call now sits at `src/proxy.ts:49`; the brief's line 42 falls inside the `IMPORTANT` comment block just above it. **No TypeError is possible**; no replacement is needed.

**What it does in this version:**

1. `getSession()` — refreshes the session when the access token is within `EXPIRY_MARGIN_MS` = 90 s of expiry (`constants.js:13`).
2. `decodeJWT(token)` — `JSON.parse` on the header and payload.
3. `validateExp(payload.exp)` — throws a plain `Error('JWT has expired')`.
4. If the header's `alg` starts with `HS`, has no `kid`, or WebCrypto is missing: **`getUser(token)` — a network round-trip to the Auth server.**
5. Otherwise it fetches the JWKS (cached module-wide in `GLOBAL_JWKS`, keyed by storage key, for `JWKS_TTL` = 10 min — so per-request clients do share it) and verifies the signature locally.
6. Its `catch` returns `AuthError`s as `{ error }` and **rethrows everything else**.

**Measured state of this project:**

- `GET https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` → `{ "keys": [] }`.
- The stored test token's header: `"alg": "HS256"`.

So step 4 runs on every call. The code already says so (`proxy.ts:46–48`, `session.ts:40–44`), but the precondition it names — migrating to asymmetric keys — has not happened, and `(shell)/layout.tsx:29–30` still describes the check as local. Per chromed navigation that is **two serial Auth round-trips** before any data query: one in the proxy, one in the render (shared by layout and page through `React.cache`). Server Actions pay the same two.

**Secondary findings.**

- **AUTH-01 (S3).** Steps 2–3 throw non-Auth errors, which `getClaims()` rethrows and `proxy.ts` does not catch. Reaching them requires a hand-edited session cookie (a merely corrupted cookie fails earlier, harmlessly, as "no session"), so only the tamperer sees the 500 — but an auth gate should fail closed. Fix: §3.3.
- **AUTH-03 (S3).** The verified-email backstop reads `claims.user_metadata.email_verified` (`proxy.ts:76`). `user_metadata` is writable by its owner through `auth.updateUser({ data })`. Supabase refuses sessions to unconfirmed addresses, so this is a backstop, not a hole — but a backstop should not be forgeable. Optional fix: §6.3.

### 1.2 H2 — Migration state and schema drift

**Applied state.** `supabase migration list --linked` shows all **48** local versions present remotely, `20260306` through `202609210920` (Appendix A.2). `npm run verify:deployment` finds all 17 probed RPCs, all guarded against anonymous callers, and every synthesis table and Phase 3/4 column (A.3).

**Types.** `supabase gen types typescript --linked --schema public` differs from `src/lib/database.types.ts` only by the `graphql_public` block the `--schema public` flag excludes. **Zero drift.**

**Where the brief's list came from.** `COGNIT_MICRO_SYNTHESIS_AUDIT_II.md` line 5 records `202609210900/0910/0920` as "written, **not applied**" on 2026-09-21. They have been pushed since.

**Timeline of the real breakage** (all times +08):

| When | Event |
|---|---|
| 09-17 18:21 | `2605c90` adds `202609170960` with `set hnsw.ef_search = 100` inline in `CREATE FUNCTION` — which, per the later fix's own comment, a non-superuser role on managed Postgres is refused (42501). |
| 09-19 14:52 | `dbe01eb`: `database.types.ts` is hand-edited — `p_before?`, `p_client_attempt_id?`, `p_pull_forward_not_after?` all `\| null`. |
| 09-21 23:48 | `f164797` regenerates the types. The generator cannot express a nullable argument, so the three `\| null` disappear: **`tsc` fails 3×, `next build` fails at "Running TypeScript" (reproduced in a clean clone), CI is red, and any Vercel build of this commit fails.** |
| 09-23 08:28 | `202609170960` is edited: the inline `SET` becomes two `DO` blocks that swallow any error. |
| 09-23 08:34 | The Supabase CLI runs (its `cli-latest` stamp) — most likely the push that applied the edited file. |
| 09-23 08:56 | **`bb045b3`** commits the migration edit, the regenerated types, `p_before ?? undefined` and two `(… ?? null) as string` casts. Re-verified in a clean clone: `tsc` ✓ · ESLint 2 warnings · 407/407 · `next build` ✓ · types = live. |

**What remains open.**

- **DB-03 (S2).** Because both `ALTER FUNCTION … SET` statements now sit inside `exception when others`, the migration "succeeds" whether or not the settings took. If they did not, `search_user_cards_by_embedding` still suffers the post-filter under-fill the migration exists to fix (the command palette's cross-deck semantic search returns 0–2 rows once other users' vectors dominate the HNSW candidate set). One query decides it: §3.2.
- **DB-02 (S3).** `scripts/verify-deployment.mjs` does not probe `get_analytics_snapshot` or `decks.exam_at`: §3.8.
- **BLD-03 (S3).** The `as string` casts in `bb045b3` are functionally correct — `null` still reaches SQL, which is what `record_synthesis_attempt` needs, since those two parameters have no default and omitting them would break PostgREST's function resolution. They do switch type-checking off for those two arguments. Optional helper: §3.1.
- **Process lesson.** Never hand-edit `database.types.ts` (the next regeneration silently reverts it), and never edit an applied migration (write a new one). Phase 3.5 adds a CI gate for both.

**Production reality** (`supabase inspect db`, read-only): 15 MB database; `decks` 4 rows · `cards` 195 · `study_logs` 140 · `card_mastery_state` 80 · `deck_chat_messages` 14 · `synthesis_drills`, `synthesis_attempts`, `synthesis_attempt_feedback`, `synthesis_questions` **0**. `pg_stat_statements` is dominated by dashboard introspection and migration bodies. Scalability findings in this plan are forward-looking; correctness is what is urgent.

The TypeScript → database dependency map is Appendix C.

#### 1.2.1 The zero-downtime push sequence

Every migration in this plan is expand-only, so the sequence is always the same:

1. **Author expand-only.** Add columns (nullable or defaulted), functions, indexes and policies. Never drop or rename in the same release. A new policy must not narrow reads of *existing* rows — the trash policy in §4.1 qualifies only because `deleted_at` starts `NULL` everywhere.
2. **Check syntax locally:** `node scripts/sqlcheck.mjs supabase/migrations/<new>.sql` (Appendix A.7). *Not in the repo yet:* `bb045b3` has no `scripts/sqlcheck.mjs`, and `libpg-query` is not a dependency (the audit ran it from a scratch directory). Both are added at the start of Phase 1, before its first migration: `npm i -D libpg-query`, then write the script from A.7.
3. **Dry run:** `supabase db push --linked --dry-run`.
4. **Push:** `supabase db push --linked`. Each file runs in its own transaction.
5. **Regenerate types:** `npm run db:types`, then `npx tsc --noEmit`. This is the step that would have caught BLD-01 before it was committed.
6. **Verify:** `npm run verify:deployment`, then `supabase/verify/production-assertions.sql` in the SQL editor (queries 1–3 and 12–15 must return zero rows).
7. **Ship the code** that calls the new objects: merge → CI → Vercel. The database always leads the code.
8. **Contract later.** Drops wait until no deployment — preview builds included — references the old object.

Update the CLI first: 2.75.0 is installed and 2.117.0 is current (OPS-01). *Done 2026-09-23 during Phase 0: `brew upgrade supabase` → 2.117.0.*

### 1.3 H3 — RAG threshold calibration

**The pipeline as built.** Model `gemini-embedding-001` (`env-server.ts:26`) at `outputDimensionality: 768` (`embeddings.ts:34`). Cards are embedded as `` `${front}\n${back}` `` with `RETRIEVAL_DOCUMENT` (`chat.ts:105–107`, `card.ts:147`), queries with `RETRIEVAL_QUERY`. The HNSW index uses `vector_cosine_ops` (`202609060900:28`), and similarity is `1 − (a <=> b)`.

**Probe design.** Three topics × 12 term/definition cards. 49 chat-style questions labelled covered (27), partial (3), near-miss — same subject, not in the deck (10), and off-topic (9). Top-1 similarity is taken within the question's own deck, since the RPC is deck-scoped. Full data: Appendix B.

| Question class | n | min | p10 | median | max |
|---|---|---|---|---|---|
| Covered | 27 | **0.678** | 0.700 | 0.732 | 0.784 |
| Partial | 3 | 0.604 | — | 0.633 | 0.686 |
| Near-miss | 10 | 0.540 | 0.558 | 0.581 | **0.644** |
| Off-topic | 9 | 0.449 | 0.459 | 0.495 | **0.544** |

Top-1 retrieval accuracy on covered questions: 26/27.

| Floor | Covered refused | Near-miss grounded | Off-topic grounded |
|---|---|---|---|
| 0.58 | 0/27 | 5/10 | 0/9 |
| **0.62** | **0/27** | **2/10** | **0/9** |
| 0.65 | 0/27 | 0/10 | 0/9 |
| 0.68 | 1/27 | 0/10 | 0/9 |
| 0.70 | 4/27 | 0/10 | 0/9 |

**Verdict.** 0.62 does not cause premature refusals: the weakest covered question clears it by +0.058. It grounds 2 of 10 near-miss questions, and for those the grounded prompt already says to "say what is missing" (`rag.ts:101`) — the right bias for a study tool. The evidence supports anything from 0.62 to 0.66. **Keep 0.62** until production telemetry (§3.5) says otherwise.

**The defects are elsewhere.**

- **RAG-02 (S2) — a query floor applied to card↔card similarity.** `synthesis.ts:270` (drill clustering) and `:1496` (repair partner) compare a card's stored `RETRIEVAL_DOCUMENT` vector against other cards. That is a different distribution. Within one topic every card pair scored 0.746–0.942, and *related* pairs (min 0.822) overlapped *unrelated* ones (max 0.836). Across topics pairs scored 0.664–0.788 (p95 0.766). So `≥ 0.62` rejects nothing: clustering never refuses a neighbour, and the repair path picks the `distinguish` format for every card that has an embedding. Calibrated replacements: a **neighbour floor of 0.76** (rejects 92 % of cross-topic pairs and 2 % of within-topic ones; each card's nearest neighbour stayed in-topic 36/36 in a mixed deck) and a **confusable floor of 0.86** (above the within-topic unrelated maximum of 0.836, below the genuinely confusable pairs at 0.88–0.94).
- **RAG-03 (S1) — the question-bank floor is below the off-topic band.** `QUESTION_MATCH_FLOOR = 0.45` (`synthesis.ts:1090`). Exam-style questions against the operating-systems deck:

  | Question | Class | Top | Cards ≥ 0.45 | Cards ≥ 0.62 |
  |---|---|---|---|---|
  | Discuss how the choice of time quantum affects round-robin… | covered | 0.731 | 8/8 | 4/8 |
  | Explain why thrashing occurs and how a working-set model… | covered | 0.757 | 8/8 | 4/8 |
  | Describe the four necessary conditions for deadlock… | partial | 0.697 | 8/8 | 4/8 |
  | Explain how a journaling file system recovers after a crash | near | 0.570 | 8/8 | 0/8 |
  | Analyse the use of imagery in Shakespeare's *Macbeth* | off | 0.497 | **8/8** | 0/8 |
  | Describe the structure of DNA and semi-conservative replication | off | 0.481 | **6/8** | 0/8 |

  Every question reads as "8 cards matched", and a plan generated from a pasted question is built from the cards it mapped to — so an uncovered question produces a key from unrelated cards, and its "deck lacks" list is computed against the wrong material. Fix: the query floor plus a band under the best match (§3.5).
- **RAG-04 (S2).** The chat route records `grounded` but not `topSimilarity` (`api/chat/route.ts:262–275`), so no production data exists to recalibrate from.
- **RAG-01 (S3).** `rag.ts:9` still says the value was a "starting point for text-embedding-004".
- **RAG-05 (S3).** `scripts/calibrate-threshold.mjs` needs `SUPABASE_USER_ACCESS_TOKEN`; the one in `.env.local` expired 2026-09-08 16:30 UTC. Refresh it with `node --env-file=.env.local scripts/get-user-token.mjs` before measuring a real deck.

**Two facts that bound future work.** At 768 dimensions the vectors are **not unit-length** (|v| ≈ 0.59), which is harmless under cosine and wrong under inner product (`<#>`): normalise before ever switching operator class. And the legacy SDK and `@google/genai` return **identical** vectors for the same input (cosine 1.000000, measured) — the SDK migration in §6.1 needs no re-embedding.

**Caveat.** The probe is synthetic, English, and made of short term/definition cards. PDF-derived cards with long backs, or another language, may shift the distributions. The telemetry (§3.5) and the live retrieval gate (§6.5) exist to catch that.

### 1.4 H4 — `after()` in production

**Environment.** Next 16.1.0. Every route segment runs on the Node runtime (the chat route pins `runtime = 'nodejs'`); there is no edge runtime, no `output: 'export'`, no custom server. `vercel.json` (crons) marks Vercel as the host, where `after()` hands its promise to the platform's `waitUntil`; under a self-hosted `next start` the long-lived process simply finishes it. **`after()` is supported on this target.**

| Site | Work queued | Route (budget) |
|---|---|---|
| `study.ts:85` | lapse mnemonic — one model call | study page — **no `maxDuration`** (platform default) |
| `card.ts:139` | re-embed the edited card | deck page — 60 s |
| `synthesis.ts:854` | repair-drill generation — model call, 12 s deadline, one retry | synthesis page — 60 s, shared with the check itself (up to 2 parallel samples, 8 s deadline, one non-timeout retry) |
| `synthesis.ts:1069` | `enrichCards` then `syncEmbeddings` — Server Actions invoked from inside `after()` | synthesis page — 60 s |

- **LC-01 (S2) — the budget is shared.** `maxDuration` bounds the response *and* its `after()` work. The worst case on the synthesis page is about 17 s of checking plus about 25 s of repair generation — inside 60 s, but only because that page pins it. The study page does not: without Fluid compute the platform default is 10–15 s, which a slow mnemonic call can exceed. Whether Fluid compute is enabled is unverified (§1.7). Fix: pin it (§3.7).
- **LC-02 (S2) — refresh after the response.** `@supabase/ssr` sets `autoRefreshToken: false` on the server client, but `getSession()` still refreshes on demand inside the 90 s margin, and every PostgREST call goes through it. A background call that lands in that window rotates the refresh token server-side; the new pair cannot be written, because the response has already gone and `server.ts:24–28` swallows the cookie error. The browser keeps the revoked refresh token, and once the 10 s reuse interval has passed, Supabase's reuse detection revokes the session — the user is signed out. The exposure is the fraction of requests whose token sits between 90 s and 90 s + *t* from expiry, where *t* is the time to the background call: ≤ 1.7 % of such requests at the default 1-hour expiry, and far less for the short mnemonic path. Fix: §3.7.
- **LC-03 (S3).** Background failures are only `logger.warn`ed — there is nothing to alert on. §6.6.
- **LC-04 (note).** `enrichCards` and `syncEmbeddings` re-authenticate from cookies inside `after()`, which Server Actions allow, and call `revalidatePath` after the payload has gone, which is harmless. No change.

**Verdict.** No change of hosting or runtime is needed. Two small changes — pinning the study route's budget and refreshing the session *before* scheduling background work — close the real risks.

### 1.5 Defect inventory

Two items were resolved during the audit and are kept for the record. Everything else is open and assigned to a section.

**Resolved in `bb045b3` (verified)**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| BLD-01 | S0 | `tsc` failed at `quiz.ts:159` and `synthesis.ts:780, 824`, so `next build` failed on `f164797` | reproduced in a clean clone of `f164797`; clean on `bb045b3` |
| DB-01 | S1 | `202609170960` was edited after being applied, and the edit was uncommitted — `git` HEAD held the version the fix's own comment says is refused (42501) | `git diff` at session start; committed in `bb045b3` |

**Open**

| ID | Sev | Area | Location | Finding | § |
|---|---|---|---|---|---|
| KBD-01 | S1 | Keyboard | `SynthesisDrillClient.tsx:547–582` · `MCQMode.tsx:75–100` · `QuizAssessmentClient.tsx:400–416` · `FlashcardReviewClient.tsx:592` | Page shortcuts fire behind modal dialogs. Drill canvas: **S** skips the drill and deletes its saved answer behind "Leave this drill?"; **1–3** and **⌘⏎** act behind it. Quiz: **1–4** answers the MCQ behind the quit dialog (`MCQMode` receives `disabled={isPaused}` only) | 3.4 |
| RAG-03 | S1 | Pedagogy | `synthesis.ts:1090, 1359` | Question-bank floor 0.45 is below the off-topic band; every question maps to ~8 cards and plans are built from the wrong ones | 3.5 |
| PED-06 | S1 | Scheduling | `schedule.ts:37–42` · `ExamDateControl.tsx:19–24` | `Math.ceil` over an end-of-day timestamp: tomorrow shows "2 days", exam day "1 day"; the final-days ladder engages a day late | 3.6 |
| MOB-01 | S1 | Mobile | `AnswerForm.tsx:32–33` · `PlanForm.tsx:26–27` · `CheckFeedback.tsx:89` · `QuestionBankForm.tsx:62` · `ExamDateControl.tsx:71` | Text fields forced below 16 px on mobile, which triggers iOS Safari's zoom-on-focus — the bug `input.tsx:21–26` documents | 5.1 |
| RAG-02 | S2 | Pedagogy | `synthesis.ts:270, 1496` | Query floor reused for card↔card similarity: a no-op filter; the repair path always picks `distinguish` | 3.5 |
| RAG-04 | S2 | Observability | `api/chat/route.ts:262–275` | `topSimilarity` is never recorded | 3.5 |
| LC-02 | S2 | Lifecycle | the four `after()` sites | A background refresh rotates the refresh token after the response; the stale browser token then trips reuse detection | 3.7 |
| LC-01 | S2 | Lifecycle | `(focus)/[deckId]/study/page.tsx` | No `maxDuration` on a route whose action queues background model work | 3.7 |
| DB-03 | S2 | Database | `202609170960:100–117` | HNSW settings may never have been applied (errors swallowed) | 3.2 |
| AUTH-02 | S2 | Auth · perf | project configuration | HS256 signing: `getClaims()` is always a network `getUser()`; two serial Auth calls per navigation | 6.3 |
| PED-01 | S2 | Pedagogy | `prompts.ts` · `validateDrillDraft` | No near-duplicate check: one idea reworded counts as two required links | 4.2 |
| PED-02 | S2 | Pedagogy | `prompts.ts` · `validateDrillDraft` | A key whose every link cites a single card passes — recall disguised as synthesis | 4.2 |
| PED-03 | S2 | Pedagogy | generation path | An exemplar is never checked against its own key in production (only in the live test) | 4.2 |
| PED-05 | S2 | Pedagogy | `CheckFeedback` → `rateSynthesisAttempt` | "Unfair" ratings are stored and never acted on | 4.2 |
| SOFT-01 | S2 | Data safety | `deck.ts:66–98` | Deck delete is an immediate cascade with no undo | 4.1 |
| A11Y-01 | S2 | A11y | `(focus)/layout.tsx:23` + `<main>` in `SynthesisDrillClient.tsx:708`, `FlashcardReviewClient.tsx:844`, `QuizAssessmentClient.tsx:709` | A `<main>` nested inside `role="main"` | 5.2 |
| A11Y-02 | S2 | A11y | `AnswerForm` / `PlanForm` `disabled={locked}` | Slots are disabled during a check, which drops focus to `<body>`; it is not restored on failure, Revise or Try again | 5.2 |
| A11Y-03 | S2 | A11y | `SynthesisDrillClient.tsx:694` | An `aria-live="polite"` region whose text changes every second | 5.2 |
| A11Y-04 | S2 | A11y | `DrillResult.tsx:86` × `DrillSessionSummary.tsx:116` | The sprint summary renders one `id="drill-verdict"` per drill: duplicate IDs, wrong accessible names, several `.raised` planes | 5.2 |
| A11Y-05 | S2 | A11y | `RetrievabilityHistogram.tsx:29–33` · `RetentionTrend.tsx:45–49` · `SynthesisInsights.tsx:170` | `role="img"` charts whose labels carry no data; the per-bar `<title>`s are unreachable | 5.3 |
| A11Y-06 | S2 | A11y | `TopicHeatmap.tsx:31–39` | A data table built as a list; column headers are visual only and hidden below `sm` (WCAG 1.3.1) | 5.3 |
| A11Y-07 | S2 | A11y · mobile | `ConfidencePicker` 28 px · `CheckFeedback` 24 px · `ExamDateControl` 24–28 px · term chips 24 px | Touch targets below the design system's 44 px (§9) — including the confidence picker every check requires | 5.1 |
| MOB-02 | S2 | Mobile · charts | analytics SVGs (`h-auto w-full`, 400-unit viewBox) | Axis text scales with the container: ~7.7 px on a phone, ~25 px in a full-width desktop panel | 5.3 |
| MOB-04 | S2 | Mobile | `SynthesisDrillClient.tsx:824` | The sticky action row competes with the on-screen keyboard; no `interactive-widget` | 5.1 |
| UX-01 | S2 | IA | `[deckId]/page.tsx:388–392` | The question-bank form sits in Overview for every deck, exam or not | 5.5 |
| UX-02 | S2 | IA | `[deckId]/page.tsx:352–361` | "Mastery %" and "Proven x/y" are the same number; this quiz-based "mastery" is not the SM-2 "mastered" the Stats page uses | 5.5 |
| DS-01 | S2 | Design system | `[deckId]/page.tsx:487–509` | Insights segment: five `.surface` panels and no `.raised` (design system §7.1, §11.11) | 4.3 |
| DS-02 | S2 | Design system | `SynthesisDrillClient.tsx:700` (sprint timer), `:818` (error text) · `ExamDateControl` countdown · `QuestionBank` missing-concept chips · `DrillResult` diff underline | State hues on facts that are not memory state, while the document never records the verdict→state mapping the synthesis surfaces rely on | 5.4 |
| DS-03 | S2 | Design system | `MasteryConfetti.tsx:38` (used at `QuizAssessmentClient.tsx:721`) | Indigo, cyan and pink hex plus a canvas loop on an authenticated surface (design system §1.1, §2.3) | 5.4 |
| PERF-01 | S2 | Bundle | `MotionProvider.tsx:3, 23` | A static `domMax` import defeats `LazyMotion` | 5.6 |
| PERF-02 | S2 | Bundle | `LoginClient.tsx`, `update-password/page.tsx`, `AddCardForm.tsx`, `CreateDeckModal.tsx` → `@/lib/schemas` | Full zod v4 in the browser, including on `/login` (275 kB gz first load) | 5.6 |
| PERF-05 | S2 | Correctness at scale | `loaders.ts:432–440, 463–470` | Insights aggregate the newest 300 attempts and 120 drills in Node; "30 d" figures silently truncate | 6.4 |
| SEC-01 | S2 | Security | `next.config.ts:45–47` | `script-src 'unsafe-inline'` in production | 6.2 |
| AUTH-01 | S3 | Auth | `proxy.ts:49` · `session.ts:48` | `getClaims()` rethrows non-Auth errors → 500 instead of a login redirect | 3.3 |
| AUTH-03 | S3 | Auth | `proxy.ts:76` | The verified-email backstop reads a user-writable claim | 6.3 |
| AUTH-04 | S3 | Consistency | `deck.ts:73` · `chat.ts:292` · `api/chat/route.ts:56` … | Direct `auth.getUser()` beside the cached `getSessionUser()` | 6.3 |
| BLD-02 | S3 | Lint | `synthesis.ts:51, 731` | Unused import `digestPlanExemplar`; unused `output` | 3.1 |
| BLD-03 | S3 | Types | `synthesis.ts:783, 830` | `(… ?? null) as string` disables checking of two RPC arguments | 3.1 |
| DB-02 | S3 | Ops | `scripts/verify-deployment.mjs` | No probe for `get_analytics_snapshot` or `decks.exam_at` | 3.8 |
| RAG-01 | S3 | Docs | `rag.ts:6–15` | Docstring cites `text-embedding-004` | 3.5 |
| RAG-05 | S3 | Ops | `.env.local` | Calibration token expired 2026-09-08 | 1.3 |
| PED-04 | S3 | Pedagogy | `prompts.ts:379–385` | `namedConceptCount` matches substrings (`ip` in "relationship"), unlike the UI's word-bounded `isNamed` | 4.2 |
| A11Y-08 | S3 | A11y | term chips | `aria-pressed` on an action that is not a toggle | 5.2 |
| A11Y-09 | S3 | A11y | `QuestionBankForm.tsx:110` | Every row's button is named "Remove question" | 5.2 |
| A11Y-10 | S3 | A11y | `SynthesisDrillClient.tsx:875` | A `⌘⏎` keycap on every platform; no `aria-keyshortcuts` | 5.2 |
| A11Y-11 | S3 | A11y | `SynthesisDrillClient.check()` | ⌘⏎ does nothing, silently, when the answer is empty, over the limit, or unrated | 5.2 |
| MOB-03 | S3 | Mobile | `DrillSessionSummary.tsx:78` | `grid-cols-4` at 375 px — "Contradicted" overflows | 5.1 |
| UX-03 | S3 | UX | `stats/page.tsx:116–130` | Empty charts render beneath the "not enough history" panel | 5.5 |
| UX-04 | S3 | UX | `AnswerForm.tsx:82–84` | A chip tapped before any slot has focus does nothing | 5.2 |
| UX-05 | S3 | UX | `SynthesisInsights.tsx:154–157` | The sparkline draws straight across days with no attempts | 5.3 |
| DS-04 | S3 | Design system | `LandingBackground.tsx:371` | A raw `z-50` | 5.4 |
| DS-05 | S3 | Design system | `DueNowBand`, `DeckSessionLauncher`, `SignalPanel`, `Flashcard`, `Wordmark` … | 17 hard-coded sizes ≥ 24 px — numeric readouts with no step on the scale | 5.4 |
| DS-06 | S3 | Design system | synthesis surfaces | Legacy `text-muted-foreground` | 5.4 |
| DS-07 | S3 | Design system | `layout.tsx` `<Toaster richColors>` | Dead configuration, neutralised by `.sonner-toast` `!important` | 5.4 |
| PERF-03 | S3 | Bundle | build output | Two 62.6 kB-gz zod + Radix chunks (login group, shell group): signing in downloads the payload twice | 5.6 |
| PERF-04 | S3 | Queries | `loaders.ts:328–376` | The drill queue reads in three serial waves. Worth a read-RPC only past ~150 ms (execution plan D20) | 6.4 |
| SEC-02 | S3 | Feature prerequisite | `next.config.ts:70` | `Permissions-Policy: microphone=()` blocks dictation | 4.4 |
| LC-03 | S3 | Observability | `after()` sites | Background failures are only logged | 6.6 |
| OPS-01 | S3 | Ops | Supabase CLI | 2.75.0 installed; 2.117.0 current | 3.8 |
| OPS-02 | S3 | CI | `.github/workflows/ci.yml` | No migration-replay or types-drift gate; no scheduled live-AI gate | 6.5 |

### 1.6 Verified good

Worth knowing before changing anything:

- **Contrast.** Every ink and edge token clears its floor on every plane in both themes (`npm run contrast`).
- **Lazy heavy libraries.** KaTeX (74.7 kB gz) and highlight.js (17.9 kB gz) are separate chunks absent from every route's first load.
- **Charts cost nothing in the browser.** `RetrievabilityHistogram`, `RetentionTrend`, `LoadForecast`, `TopicHeatmap` and `ActivityHeatmap` are Server Components.
- **One-wave deck page.** Seven independent reads run in a single `Promise.all` (`[deckId]/page.tsx:178–207`).
- **`useModalDialog`** — Tab trap, Escape, scroll lock, restore-to-trigger — is correct. KBD-01 is about the *page's* listeners, not the dialog's.
- **Idempotent checks.** `client_attempt_id` plus an advisory lock in `record_synthesis_attempt` make a retried check return the first attempt.
- **Database hygiene, by construction.** The migrations define no `SECURITY DEFINER` function, pin every `search_path`, wrap every policy's `auth.uid()` as an InitPlan (`202609170950`) and index every FK (`202609170940`), and `supabase/verify/production-assertions.sql` pins all four. This audit had no SQL editor, so re-run that file to confirm them on the live database.
- **Deep links** from the new surfaces (`?scope=due`, `?scope=unmastered_only`, `?cards=`) all resolve in the study route.
- **Tests.** 407/407 on `bb045b3`; the committed types equal the live schema.

### 1.7 Open verifications — access this audit did not have

| # | Check | How | Decides |
|---|---|---|---|
| V1 | Is `bb045b3` the live production deployment? | Vercel → Deployments, or `vercel ls` | Whether the Phase 4 UI is live yet |
| V2 | Is Fluid compute on? | Vercel → Settings → Functions | LC-01 exposure (10–15 s vs 300 s default) |
| V3 | Did the HNSW settings land? | the SQL in §3.2 | DB-03 |
| V4 | Refresh-token reuse detection and interval | Supabase → Authentication → Sessions | LC-02 severity |
| V5 | Real-deck similarity distribution | §3.5 telemetry after a week, or `calibrate-threshold.mjs` with a fresh token | Whether 0.62 should move |

---

## 2. Roadmap overview

```
Phase 0 ── ship bb045b3 · KBD-01 · floors · exam days · auth edges · after() headroom
   │
   ├── Phase 1 ── §4.1a trash ──► §4.1b duplicate/merge    (merge trashes its source)
   │              §4.1c export · §4.1d directory (behind a flag)
   │              §4.2 key integrity
   │              §4.3 concept map ──► resolves DS-01      (the one .raised object)
   │              §4.4 voice (needs SEC-02)
   │
   ├── Phase 2 ── mobile · focus/SR · charts · Rev. D · IA · bundle   (independent of 1)
   │
   └── Phase 3 ── @google/genai · nonce CSP · ES256 · read-RPCs · gates · observability
```

Phases 1 and 2 can run in parallel. Phase 3's read-RPC and gates can start any time after Phase 0. Every migration follows §1.2.1.

---

## 3. Phase 0 — Immediate critical fixes and deployment

**One patch covers §3.1 and §3.3–§3.8** — 18 files changed (including `package.json`), 8 added. It is reproduced in full in Appendix D and was verified against `bb045b3`: `tsc` clean · ESLint 0 problems · **419/419** tests · `next build` ✓ · `git apply --check` clean · the live retrieval gate run and passing. The sections below explain each change and show the new code; the diff is the source of truth. Phase 0 has **no migration** unless §3.2's check says otherwise.

### 3.1 Build hygiene — BLD-01 · BLD-02 · BLD-03

- **BLD-01 and DB-01 are resolved in `bb045b3`.** The remaining action is V1: confirm Vercel built and promoted it.
- **BLD-02** (in the patch): drop the unused `digestPlanExemplar` import (`synthesis.ts:51`) and destructure only `finishReason` at `:731`. ESLint goes from 2 warnings to 0.
- **BLD-03** (optional, not in the patch). Replace the two `(… ?? null) as string` casts with a helper that keeps every other argument checked. Compiled against the real `supabase.rpc` signature, including a negative case:

```ts
// src/lib/supabase/rpc-args.ts
import type { Database } from '@/lib/database.types';

type PublicFunctions = Database['public']['Functions'];
export type RpcName = keyof PublicFunctions;
export type RpcArgs<F extends RpcName> = PublicFunctions[F]['Args'];

/**
 * `supabase gen types` renders every SQL argument as non-nullable: it cannot
 * say "required, and NULL is a meaningful value" — which is exactly what
 * `record_synthesis_attempt(p_client_attempt_id uuid, …)` means. PostgREST
 * forwards a JSON null as SQL NULL, so the call is right and only the type is
 * narrow. Name the keys that may be null; every other key stays checked.
 *
 * Never hand-edit database.types.ts instead: the next regeneration drops it
 * silently (f164797).
 */
export type NullableRpcArgs<F extends RpcName, K extends keyof RpcArgs<F>> =
  Omit<RpcArgs<F>, K> & { [P in K]: RpcArgs<F>[P] | null };

export function withNullableArgs<F extends RpcName, K extends keyof RpcArgs<F>>(args: NullableRpcArgs<F, K>): RpcArgs<F> {
  return args as unknown as RpcArgs<F>;
}
```

```ts
// synthesis.ts — checkSynthesisAttempt
const { data: recorded, error: recordError } = await supabase.rpc(
  'record_synthesis_attempt',
  withNullableArgs<'record_synthesis_attempt', 'p_client_attempt_id' | 'p_pull_forward_not_after'>({
    p_drill_id: drillId,
    p_deck_id: deckId,
    p_client_attempt_id: parsed.data.client_attempt_id ?? null,
    p_attempt: { /* unchanged */ },
    p_schedule: { /* unchanged */ },
    p_pull_forward_card_ids: pullCandidates,
    p_pull_forward_not_after: pullCandidates.length > 0 ? notAfterIso : null,
  }),
);
```

### 3.2 DB-03 — did the HNSW settings land?

Run in the SQL editor:

```sql
select p.proname,
       p.proconfig,
       (select extversion from pg_extension where extname = 'vector') as pgvector
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'search_user_cards_by_embedding';
-- Healthy: proconfig contains 'hnsw.ef_search=100'
--          and, when pgvector >= 0.8, 'hnsw.iterative_scan=relaxed_order'.
```

**Only if a setting is missing**, add this migration. `set_config(…, true)` at call time is an ordinary USERSET change and needs no privilege, so it works where the persistent `ALTER FUNCTION … SET` was refused. The language and volatility change; the signature and return type do not, so `CREATE OR REPLACE` is allowed. Parser-checked.

```sql
-- supabase/migrations/2026092409xx_vector_search_session_gucs.sql
create or replace function public.search_user_cards_by_embedding(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_limit integer default 8
)
returns table (
  id uuid,
  deck_id uuid,
  deck_title text,
  front text,
  back text,
  similarity double precision
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.ef_search', '100', true);
  begin
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  exception when others then
    null;  -- pgvector < 0.8: the function is still correct, only less complete under a filter
  end;

  return query
    select cards.id,
           cards.deck_id,
           decks.title,
           cards.front,
           cards.back,
           1 - (cards.embedding <=> p_query_embedding)
      from public.cards
      join public.decks on decks.id = cards.deck_id
     where decks.user_id = (select auth.uid())
       and decks.user_id = p_user_id
       and cards.embedding is not null
     order by cards.embedding <=> p_query_embedding
     limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;
```

### 3.3 AUTH-01 — `getClaims()` fails closed

```ts
// src/lib/supabase/claims.ts (new)
import type { JwtPayload } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/** Just the one method this needs, so the proxy's and the render's clients both fit. */
type ClaimsClient = {
  auth: { getClaims(): Promise<{ data: { claims: JwtPayload } | null; error: unknown }> };
};

/**
 * `auth.getClaims()`, failing closed.
 *
 * auth-js returns an AuthError as `error` but RETHROWS anything else:
 * `decodeJWT` JSON-parses the cookie's payload (a SyntaxError on a tampered
 * or truncated cookie) and `validateExp` throws a plain `Error`. Unwrapped,
 * either becomes a 500 on every route the proxy matches. A token that cannot
 * be verified is a signed-out request.
 */
export async function verifiedClaims(supabase: ClaimsClient): Promise<JwtPayload | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    return error || !data ? null : data.claims;
  } catch (error) {
    logger.warn('auth', 'getClaims threw; treating the request as signed out', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}
```

Call sites: `src/proxy.ts:49–50` becomes `const claims = await verifiedClaims(supabase);`, and `getSessionUser()` (`session.ts:48–51`) does the same. Nothing else in either function changes. `src/lib/supabase/claims.test.ts` (3 tests, in the patch) covers success, a returned AuthError, and both throw paths.

### 3.4 KBD-01 — page shortcuts stand down while a dialog is open

**Cause.** Every shortcut is a `window` keydown listener, and so is every dialog's Escape/Tab handler. Nothing stops propagation, so both run for the same key. On the drill canvas the only dialog check is `if (quitDialogOpen) return` inside the **Escape** branch.

```ts
// src/lib/hotkeys.ts (new)
/**
 * Page-level keyboard shortcuts and the dialogs that sit above them.
 *
 * Every shortcut in this app is a `window` keydown listener, and so is every
 * dialog's Escape/Tab handler — nothing stops propagation, so both run for
 * the same key. Without a guard, `S` pressed while "Leave this drill?" is
 * open skips the drill *behind* the dialog and deletes the answer the dialog
 * just promised to keep.
 *
 * A page shortcut stands down while any modal dialog is open. An overlay the
 * page drives itself — the quiz's pause overlay, whose `P` resumes — opts out
 * with `data-page-shortcuts="allow"`; its page is then responsible for
 * disabling whatever must not fire underneath it (the quiz already does).
 */
const BLOCKING_DIALOG = '[aria-modal="true"]:not([data-page-shortcuts="allow"])';

/** A field the user is typing into; page shortcuts must not steal its keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** A modal dialog is open over the page, so the page is out of use. */
export function isBlockingDialogOpen(root: ParentNode = document): boolean {
  return root.querySelector(BLOCKING_DIALOG) !== null;
}

/**
 * Whether a page-level shortcut must ignore this event: a blocking dialog is
 * open, or an IME composition is in progress (the key belongs to the
 * composer). Call it first in every window-level keydown handler.
 */
export function pageShortcutBlocked(event: Pick<KeyboardEvent, 'isComposing'>, root: ParentNode = document): boolean {
  return event.isComposing || isBlockingDialogOpen(root);
}
```

**Applied to all ten page-level handlers.** The Appendix D patch covers the five this audit first found. A sweep during execution (`rg "(window|document)\.addEventListener\(['\"]keydown" src`) found five more that fired behind dialogs. Those are guarded in a follow-up commit on the same branch, which is not part of Appendix D:

| # | Handler | Key | Behind a dialog, before the guard | Change | In |
|---|---|---|---|---|---|
| 1 | `SynthesisDrillClient` | ⌘⏎ · Esc · S N R · 1–3 | **S** skipped the drill and deleted its saved answer | first line `pageShortcutBlocked`; private `isTypingTarget` replaced by the shared one | Appendix D |
| 2 | `MCQMode` — answer | 1–4 | answered the MCQ behind the quit dialog | first line `pageShortcutBlocked` | Appendix D |
| 3 | `MCQMode` — advance | Space / Enter | advanced past feedback | first line `pageShortcutBlocked` | Appendix D |
| 4 | `QuizAssessmentClient` | P | paused or resumed behind the quit dialog | first line `pageShortcutBlocked`; the pause overlay (`:995`) declares `data-page-shortcuts="allow"` | Appendix D |
| 5 | `FlashcardReviewClient` | P · Space / Enter · 1–4 | paused, flipped or graded behind a dialog | first line `pageShortcutBlocked` | Appendix D |
| 6 | `IdentificationMode` | Enter / Space | **Enter on the quiz quit dialog's button also resolved the question behind it** (same S1 class as #2; the mode had only `disabled={isPaused}`) | handler body replaced by `isAdvanceKey(event)` in `hotkeys.ts`, which checks the dialog guard, a typing target, the key and repeat | follow-up |
| 7 | `DueNowBand` | S | navigated to a session behind a dashboard dialog | first line `pageShortcutBlocked` | follow-up |
| 8 | `DeckReviewHotkey` | R | submitted the deck page's review form behind a dialog | first line `pageShortcutBlocked` | follow-up |
| 9 | `CreateDeckPanel` | ⌘N | opened the create-deck dialog over another dialog | first line `pageShortcutBlocked` | follow-up |
| 10 | `CommandPalette` | ⌘K | opened the palette over another dialog | **opening path only**: `paletteOpenAfterHotkey(open, pageShortcutBlocked(event))` in `command-palette.ts`. An open palette is itself `aria-modal`, so a blanket guard would trap it open. ⌘K and Esc still close it, and the rail's search button (a click, not a key) is unchanged | follow-up |

The dialogs' own handlers (`ConfirmDialog`, `BulkImportModal`, `use-modal-dialog`) are exempt: they are the dialog, not the page. The quiz's pause overlay keeps MCQ and identification keys inert through the existing `disabled={isPaused}`. Every dialog is rendered conditionally inside `AnimatePresence`, so the guard lifts once the exit animation (about 150–200 ms) ends; it never sticks.

**Rule for new code:** any window-level keydown handler calls `pageShortcutBlocked` first, and any overlay whose page keeps handling keys declares `data-page-shortcuts="allow"`. The one exception is a shortcut that closes the dialog it opened (⌘K): guard only its opening path.

`src/lib/hotkeys.test.ts` has 5 tests in the patch: no dialog, an open dialog, a page-driven overlay, a real dialog stacked on a page-driven overlay, and IME composition. The follow-up adds 3 `isAdvanceKey` tests to the same file (Enter behind the quit dialog does not advance, verified to fail with the guard removed; Enter or Space advance with no dialog; typing target, repeat and other keys ignored) and 3 `paletteOpenAfterHotkey` tests to `command-palette.test.ts` (opens with no dialog; closes an open palette; will not open over another dialog or during IME composition). That makes **425** tests, still in 37 files.

### 3.5 RAG-01 · RAG-02 · RAG-03 · RAG-04 — calibrated floors and telemetry

```ts
// src/lib/similarity.ts (new)
/**
 * Cosine-similarity floors for `gemini-embedding-001` at 768 dimensions
 * (`outputDimensionality: 768`, `vector_cosine_ops`, pgvector `1 - (a <=> b)`).
 *
 * Measured 2026-09-23 on a synthetic three-topic set with the app's exact
 * request shape (COGNIT_NEXT_HORIZON_PLAN.md §1.3, Appendix B). Two different
 * distributions, so two families of constants — never reuse one for the other:
 *
 *   query → card   RETRIEVAL_QUERY against RETRIEVAL_DOCUMENT (deck chat, the
 *                  question bank). Covered questions ≥ 0.678, same-subject
 *                  questions the deck lacks ≤ 0.644, off-topic ≤ 0.544.
 *   card ↔ card    RETRIEVAL_DOCUMENT on both sides (drill clustering, the repair
 *                  partner). Within one topic every pair is ≥ 0.746; across
 *                  topics ≤ 0.788 (p95 0.766). A query floor applied here
 *                  rejects nothing.
 *
 * The vectors are NOT unit length at 768 dimensions (|v| ≈ 0.59). Cosine
 * distance does not care; an inner-product operator (`<#>`) would. Normalise
 * before ever switching operator class.
 *
 * Re-measure with `npm run ai:retrieval` before changing any value.
 */

/** Query → card: below this, a retrieved card is not evidence the deck covers the question. */
export const QUERY_CARD_FLOOR = 0.62;

/** A past-paper question maps only to cards within this band of its best match. */
export const QUESTION_MATCH_BAND = 0.06;

/** Card ↔ card: a neighbour that may share a drill. Rejects ~92 % of cross-topic pairs, ~2 % within a topic. */
export const NEIGHBOUR_FLOOR = 0.76;

/** Card ↔ card: close enough to be confused, so a repair drill asks to *distinguish* them. */
export const CONFUSABLE_FLOOR = 0.86;

type ScoredCard = { id: string; similarity: number | null };

/**
 * The cards a pasted exam question actually reaches: the best match must
 * clear the query floor, and only cards within `QUESTION_MATCH_BAND` of it
 * count. The old flat floor of 0.45 sat below the off-topic band, so every
 * question — a Macbeth essay against an operating-systems deck included —
 * "matched" all eight cards it was offered.
 */
export function questionMatches(rows: readonly ScoredCard[]): string[] {
  const scored = rows.filter((row): row is { id: string; similarity: number } => row.similarity !== null);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((row) => row.similarity));
  if (best < QUERY_CARD_FLOOR) return [];
  const floor = Math.max(QUERY_CARD_FLOOR, best - QUESTION_MATCH_BAND);
  return scored.filter((row) => row.similarity >= floor).map((row) => row.id);
}
```

Wiring (in the patch):

| Site | Before | After |
|---|---|---|
| `synthesis.ts:270` — clustering | `>= MIN_CONTEXT_SIMILARITY` | `>= NEIGHBOUR_FLOOR` |
| `synthesis.ts:1496` — repair partner | `>= MIN_CONTEXT_SIMILARITY` | `>= CONFUSABLE_FLOOR` (below it, the existing tag → `elaborate` fallback runs) |
| `synthesis.ts:1090, 1359` — question bank | `QUESTION_MATCH_FLOOR = 0.45` filter | `questionMatches(data ?? [])` |
| `rag.ts:15` | `= 0.62` with a text-embedding-004 docstring | `= QUERY_CARD_FLOOR`, docstring corrected |
| `api/chat/route.ts:270` | — | `top_similarity: context.topSimilarity` in the usage metadata |

The question-bank test fixture moves from similarities (0.70, 0.60, 0.20) to (0.72, 0.68, 0.55), so it exercises both the floor and the band. `src/lib/similarity.test.ts` adds 4 tests: an off-topic question maps nothing, the band keeps only close matches, the floor always wins, and null similarities are ignored.

**Reading the telemetry** after a week of traffic:

```sql
select width_bucket((metadata ->> 'top_similarity')::float, 0.40, 0.90, 10) as bucket,
       round(0.40 + (width_bucket((metadata ->> 'top_similarity')::float, 0.40, 0.90, 10) - 1) * 0.05, 2) as similarity_from,
       count(*) as turns,
       round(avg(((metadata ->> 'grounded')::boolean)::int), 2) as grounded_share
  from public.ai_usage_logs
 where action = 'chat_with_deck'
   and metadata ->> 'top_similarity' is not null
   and created_at > now() - interval '30 days'
 group by 1, 2
 order by 1;
```

If a lot of refused turns sit in 0.58–0.62 and a sample of those messages (`deck_chat_messages`) turns out to be covered by the deck, lower the floor. If grounded answers in 0.62–0.66 keep saying the deck "does not fully cover" the question, raise it. Either way, rerun `npm run ai:retrieval` afterwards.

**The live retrieval gate** (in the patch, with its 105-line fixture `src/test/live/retrieval-calibration.json`). It runs the calibration set through the app's own `embedTexts` and fails if the floors stop separating. Run during this audit, it passed and reproduced the probe exactly: covered min 0.678 · off-topic max 0.544 · near-miss grounded 20 % · neighbour floor rejects 92 % cross / 2 % within. Three embedding requests per run.

```ts
// src/test/live/retrieval-calibration.live.ts (new)
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLocalEnv } from './env';

const hasKey = loadLocalEnv();

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by the retrieval gate'); } }));

type Kind = 'covered' | 'partial' | 'near' | 'off';
type Fixture = {
  decks: Record<string, [term: string, definition: string][]>;
  questions: Record<string, { text: string; kind: Kind }[]>;
};

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

describe.skipIf(!hasKey)('live retrieval — the similarity floors still separate', () => {
  it('query → card and card ↔ card floors hold on the calibration set', async () => {
    const { embedTexts } = await import('@/lib/embeddings');
    const { NEIGHBOUR_FLOOR, QUERY_CARD_FLOOR } = await import('@/lib/similarity');
    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/retrieval-calibration.json'), 'utf8')) as Fixture;

    const cards = Object.entries(set.decks).flatMap(([deck, rows]) => rows.map(([term, definition]) => ({ deck, text: `${term}\n${definition}` })));
    const questions = Object.entries(set.questions).flatMap(([deck, rows]) => rows.map((row) => ({ deck, ...row })));
    const cardVectors = await embedTexts(cards.map((card) => card.text), { taskType: 'RETRIEVAL_DOCUMENT' });
    const questionVectors = await embedTexts(questions.map((question) => question.text), { taskType: 'RETRIEVAL_QUERY' });

    const topByKind: Record<Kind, number[]> = { covered: [], partial: [], near: [], off: [] };
    questions.forEach((question, qi) => {
      const top = Math.max(...cards.flatMap((card, ci) => (card.deck === question.deck ? [cosine(questionVectors[qi], cardVectors[ci])] : [])));
      topByKind[question.kind].push(top);
    });

    const within: number[] = [];
    const across: number[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        (cards[i].deck === cards[j].deck ? within : across).push(cosine(cardVectors[i], cardVectors[j]));
      }
    }

    const coveredMin = Math.min(...topByKind.covered);
    const offMax = Math.max(...topByKind.off);
    const nearGrounded = topByKind.near.filter((score) => score >= QUERY_CARD_FLOOR).length / topByKind.near.length;
    const crossRejected = across.filter((score) => score < NEIGHBOUR_FLOOR).length / across.length;
    const withinRejected = within.filter((score) => score < NEIGHBOUR_FLOOR).length / within.length;
    console.log(`retrieval · covered min ${coveredMin.toFixed(3)} · off-topic max ${offMax.toFixed(3)} · near grounded ${(nearGrounded * 100).toFixed(0)}% · neighbour floor rejects ${(crossRejected * 100).toFixed(0)}% cross / ${(withinRejected * 100).toFixed(0)}% within`);

    // Measured 2026-09-23: 0.678 / 0.544 / 20 % / 92 % / 2 %.
    expect(coveredMin).toBeGreaterThanOrEqual(QUERY_CARD_FLOOR + 0.02);
    expect(offMax).toBeLessThan(QUERY_CARD_FLOOR - 0.03);
    expect(nearGrounded).toBeLessThanOrEqual(0.3);
    expect(crossRejected).toBeGreaterThanOrEqual(0.85);
    expect(withinRejected).toBeLessThanOrEqual(0.05);
  });
});
```

The patch also adds two `package.json` scripts: `"ai:retrieval"` (this gate) and `"db:types"` (`supabase gen types typescript --linked --schema public > src/lib/database.types.ts`, step 5 of §1.2.1).

### 3.6 PED-06 — exam days count calendar days

`exam_at` is stored as 23:59 local time on the exam day (`ExamDateControl.tsx:40`). Flooring the remaining time therefore counts calendar days; `Math.ceil` counted one too many.

| Now (local) | Exam | Old (`ceil`) | New (`floor`) |
|---|---|---|---|
| day D, 10:00 | D 23:59 | 1 — "Exam in 1 day" | **0 — "Exam today"** |
| day D, 10:00 | D+1 23:59 | 2 | **1** |
| day D, 00:30 | D+3 23:59 | 4 — not yet the final-days ladder | **3 — final-days ladder** |

```ts
// src/lib/synthesis/schedule.ts
/**
 * Whole days left before the exam: 0 on the exam day, 1 the day before, -1
 * once it has passed; null without a date. `exam_at` is stored as 23:59 local
 * time on the exam day (ExamDateControl), so flooring the remaining time
 * counts calendar days. `Math.ceil` read one day long: "in 2 days" for
 * tomorrow, "in 1 day" on the day itself, and the final-days ladder engaged
 * a day late.
 */
export function daysToExam(examAt: string | null | undefined, now: Date): number | null {
  if (!examAt) return null;
  const at = Date.parse(examAt);
  if (Number.isNaN(at)) return null;
  const remaining = at - now.getTime();
  return remaining < 0 ? -1 : Math.floor(remaining / (24 * 60 * 60_000));
}
```

`ExamDateControl` now calls the same function, so client and server can never disagree, and renders `days === 0` as "Exam today · drills return within the day". `schedule.test.ts` changes its 2.5-day expectation from 3 to 2 and adds the same-evening (0) and next-evening (1) cases. Residual: a DST change can shift the count by one inside the last hour before midnight.

### 3.7 LC-01 · LC-02 — `after()` headroom and budget

```ts
// src/lib/supabase/session.ts (added)
/**
 * Work queued with `after()` runs once the response has been flushed, when a
 * refreshed session can no longer reach the browser's cookies. supabase-js
 * refreshes on demand whenever the access token is within 90 s of expiry, and
 * Supabase rotates the refresh token when it does: a background write in that
 * window strands the browser on a revoked token, and reuse detection then
 * signs the user out. Call this before `after()` — if the token would enter
 * the window before the work can finish (maxDuration 60 s + the 90 s margin),
 * refresh it now, while this action can still set cookies.
 */
export async function ensureSessionHeadroom(minSeconds = 180): Promise<void> {
  try {
    const supabase = await getRequestClient();
    const { data } = await supabase.auth.getSession();
    const expiresAt = data.session?.expires_at;
    if (!expiresAt || expiresAt * 1000 - Date.now() >= minSeconds * 1000) return;
    const { error } = await supabase.auth.refreshSession();
    if (error) logger.warn('session', 'pre-background refresh failed', { message: error.message });
  } catch (error) {
    // Best-effort: the action it protects must never fail because of it.
    logger.warn('session', 'session headroom check skipped', { message: error instanceof Error ? error.message : String(error) });
  }
}
```

It is called as `await ensureSessionHeadroom();` immediately before each of the four `after(…)` calls. It reads `expires_at` only, never `session.user`, so it does not trigger supabase-js's insecure-`getSession` warning. The `try/catch` is not decoration: while building the patch, five existing tests failed until it was added, because their mocked client has no `auth.getSession` — exactly the kind of fault that must never break a grade or a check.

`(focus)/[deckId]/study/page.tsx` pins `export const maxDuration = 60;`, matching the deck and synthesis routes.

### 3.8 Deployment sequence

```bash
# 0. Tooling
brew upgrade supabase                         # CLI 2.75.0 → current (OPS-01)

# 1. Apply the Phase 0 patch (Appendix D is the only ```diff block in this file)
git switch -c fix/phase-0-hardening
awk '/^```diff$/{f=1;next} /^```$/{f=0} f' COGNIT_NEXT_HORIZON_PLAN.md > /tmp/cognit-phase0.patch
git apply --check /tmp/cognit-phase0.patch && git apply /tmp/cognit-phase0.patch

# 2. Local gate
npx tsc --noEmit && npm run lint && npm test && npm run build

# 3. Database: nothing, unless §3.2 found a missing setting (then: §1.2.1 steps 2–6)

# 4. Ship
git commit -am "fix: phase 0 — modal-aware shortcuts, calibrated floors, exam days, auth and after() hardening"
gh pr create --fill                           # CI: tsc · lint · test · build
# merge → Vercel production deploy

# 5. After the deploy
npm run verify:deployment                     # now probes get_analytics_snapshot and decks.exam_at
npm run ai:retrieval                          # live gate for the new floors
```

### 3.9 Gate G0

| Check | Command or step | Pass |
|---|---|---|
| Types | `npx tsc --noEmit` | no output |
| Lint + contrast | `npm run lint` | 0 problems; "every ink/edge token clears its floor" |
| Unit | `npm test` | **419** passed, 37 files, with Appendix D alone (`hotkeys`, `similarity` and `claims` included); **425** passed, 37 files, with the §3.4 follow-up guards |
| Build | `npm run build` | "Compiled successfully"; 11/11 static pages |
| Live floors | `npm run ai:retrieval` | 1 passed; the log line inside the ranges asserted |
| Deployment | `npm run verify:deployment` | 18 RPCs ✅ and 6 table/column probes ✅ |
| Schema | `supabase migration list --linked` | local = remote |
| **UAT — KBD-01** | Drill canvas: type an answer → **Esc** → with the dialog open press **S**, **1**, **⌘⏎** → **Keep writing** | Nothing changed behind the dialog; the answer is intact |
| UAT — KBD-01 | Quiz, MCQ: open the quit dialog → press **2** → Cancel | No option selected, no result recorded |
| UAT — pause | Quiz: **P** pauses → **P** resumes | Resumes (the overlay opts out) |
| UAT — KBD-01 follow-up · identification | Quiz, identification question: submit an answer so the result shows → open the quit dialog → Tab to **Cancel** → press **Enter** | The dialog closes; the same question's result is still on screen; no result recorded, question not advanced |
| UAT — KBD-01 follow-up · dashboard | Dashboard: open the account dialog (or any dialog) → press **S**, then **⌘N** | No navigation to a session; the create-deck dialog does not open on top |
| UAT — KBD-01 follow-up · deck page | Deck page: open any dialog (e.g. delete deck) → press **R** → cancel | No review started |
| UAT — KBD-01 follow-up · palette | **⌘K** opens → **⌘K** closes → **⌘K** opens → **Esc** closes → open a dialog → **⌘K** → rail search button with no dialog open | Opens, closes, opens, closes; does not open over the dialog; the rail button opens it |
| UAT — RAG-03 | Question bank: paste "Analyse the imagery in Macbeth." into a science deck | "0 cards matched" |
| UAT — PED-06 | Set the exam to tomorrow, then to today | "Exam in 1 day", then "Exam today" |
| UAT — RAG-04 | Ask one deck-chat question | The newest `ai_usage_logs` row for `chat_with_deck` has `metadata.top_similarity` |

---

## 4. Phase 1 — Feature polish and deferred high-impact expansions

Four expand-only migrations, `202609240900` to `…0930`, each pushed with §1.2.1. All functions are `SECURITY INVOKER` with a pinned `search_path`, so `production-assertions.sql` queries 2–3 stay green. The TypeScript here was compiled against the types `supabase gen types` will produce for these functions, tested (deck export 10 tests, concept graph 5, key integrity 6), linted with the React Compiler rules, and built (`/api/decks/[deckId]/export` and `/explore` both ƒ). The SQL was parsed by PostgreSQL's parser; its column and type references were checked by hand against the schema, but it has not been executed — run §1.2.1 steps 3–6 before trusting it.

### 4.1 Advanced deck operations

#### 4.1a Trash with undo — SOFT-01

**Design.** A deck gets `deleted_at`. A **restrictive** policy hides trashed rows from every read. Because the four `cards` own-deck policies resolve ownership through `select id from public.decks …` (`202609170950`), a trashed deck's cards disappear with it — from `get_due_cards_by_deck`, both vector searches, the analytics snapshot, the palette and the breadcrumb — without one query changing.

The trash RPCs lift the filter with a transaction-local flag (`cognit.include_trashed`). The flag is a UX filter, not a security boundary: the permissive owner policies still decide *whose* rows are visible, so setting it reveals only your own trash — which is why no `SECURITY DEFINER` is needed.

One subtlety is built into every RPC. An `UPDATE` whose `WHERE` reads the row is also checked against the SELECT policies **for the new row**, so a row becoming trashed fails them unless the flag is already set.

**Reads keyed on `user_id` rather than the deck** do not inherit the filter. Audit them with:

```bash
rg -n "\.eq\('user_id'" src/lib src/app | rg -v "decks|\.test\."
```

Today one needs changing, `loadDueDrillsByDeck`. Its `.select('deck_id')` becomes `.select('deck_id, decks!inner(id)')`, and the inner embed inherits the decks policies (compiled). The analytics effort series (`study_logs` by user) keeps a trashed deck's reviews until it is purged — deliberate: they happened.

```sql
-- supabase/migrations/202609240900_deck_trash.sql
-- ===================================================================
-- Soft delete with a 30-day trash (COGNIT_NEXT_HORIZON_PLAN.md §4.1a).
-- A RESTRICTIVE policy hides trashed decks; the cards own-deck policies
-- (202609170950) resolve through decks, so their cards vanish with them.
-- Only the RPCs below lift the filter, via a transaction-local flag — a UX
-- filter, not a security boundary: the owner policies still decide WHOSE
-- rows are visible. Everything stays SECURITY INVOKER.
-- ===================================================================

alter table public.decks add column if not exists deleted_at timestamptz;

create index if not exists decks_user_trash_idx
  on public.decks (user_id, deleted_at)
  where deleted_at is not null;

drop policy if exists "Trashed decks are hidden" on public.decks;
create policy "Trashed decks are hidden"
  on public.decks
  as restrictive
  for all
  to public
  using (
    deleted_at is null
    or (select coalesce(current_setting('cognit.include_trashed', true), '') = 'on')
  )
  with check (
    deleted_at is null
    or (select coalesce(current_setting('cognit.include_trashed', true), '') = 'on')
  );

-- ── Trash ──────────────────────────────────────────────────────────
create or replace function public.trash_deck(p_deck_id uuid)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  -- An UPDATE whose WHERE reads the row is also checked against the SELECT
  -- policies for the NEW row, which a trashed row fails without the flag.
  perform set_config('cognit.include_trashed', 'on', true);

  update public.decks
     set deleted_at = now(),
         is_public = false          -- a trashed deck stops being shared
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is null
  returning deleted_at into v_deleted_at;

  if v_deleted_at is null then
    raise exception 'Deck not found or access denied.';
  end if;

  return v_deleted_at;
end;
$$;

-- ── Restore ────────────────────────────────────────────────────────
create or replace function public.restore_deck(p_deck_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  update public.decks
     set deleted_at = null,
         updated_at = now()
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is not null;

  if not found then
    raise exception 'That deck is not in your trash.';
  end if;
end;
$$;

-- ── List ───────────────────────────────────────────────────────────
create or replace function public.list_trashed_decks()
returns table (
  id uuid,
  title text,
  deleted_at timestamptz,
  purge_after timestamptz,
  card_count bigint
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  perform set_config('cognit.include_trashed', 'on', true);

  return query
    select d.id,
           d.title,
           d.deleted_at,
           d.deleted_at + interval '30 days',
           (select count(*) from public.cards c where c.deck_id = d.id)
      from public.decks d
     where d.user_id = (select auth.uid())
       and d.deleted_at is not null
     order by d.deleted_at desc;
end;
$$;

-- ── Delete forever ─────────────────────────────────────────────────
create or replace function public.purge_deck(p_deck_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  -- Only a trashed deck can be purged; a live deck goes to the trash first.
  -- ON DELETE CASCADE removes its cards and history; referential actions
  -- bypass RLS, so the append-only deny policies do not block them.
  delete from public.decks
   where id = p_deck_id
     and user_id = (select auth.uid())
     and deleted_at is not null;

  if not found then
    raise exception 'That deck is not in your trash.';
  end if;
end;
$$;

-- ── Lazy expiry: called whenever the trash is opened ────────────────
create or replace function public.purge_expired_trash()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    return 0;
  end if;

  perform set_config('cognit.include_trashed', 'on', true);

  delete from public.decks
   where user_id = (select auth.uid())
     and deleted_at is not null
     and deleted_at < now() - interval '30 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.trash_deck(uuid) from public;
revoke all on function public.restore_deck(uuid) from public;
revoke all on function public.list_trashed_decks() from public;
revoke all on function public.purge_deck(uuid) from public;
revoke all on function public.purge_expired_trash() from public;

grant execute on function public.trash_deck(uuid) to authenticated;
grant execute on function public.restore_deck(uuid) to authenticated;
grant execute on function public.list_trashed_decks() to authenticated;
grant execute on function public.purge_deck(uuid) to authenticated;
grant execute on function public.purge_expired_trash() to authenticated;

-- Optional, once pg_cron is enabled (Dashboard → Integrations → Cron). It
-- runs as postgres, so RLS does not apply and accounts that never come back
-- are purged too. Kept out of `public`, so the assertions are unaffected.
-- select cron.schedule('purge-deck-trash', '17 3 * * *',
--   $$delete from public.decks where deleted_at < now() - interval '30 days'$$);
```

**Server Actions** — one file for the whole lifecycle, including §4.1b and §4.1d:

```ts
// src/app/actions/deck-lifecycle.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardAction } from '@/lib/action-guard';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

/*
 * Deck lifecycle (plan §4.1): trash with undo, restore, delete forever,
 * duplicate, merge, and directory listing. Every write is one SECURITY
 * INVOKER RPC (202609240900–0930); these actions validate, call it once and
 * revalidate.
 */

const deckId = z.uuid();
const duplicateSchema = z.object({ deck_id: z.uuid(), title: z.string().trim().max(120).optional(), keep_progress: z.boolean().default(false) });
const mergeSchema = z.object({ source_id: z.uuid(), target_id: z.uuid() }).refine((value) => value.source_id !== value.target_id, { message: 'Choose two different decks.' });
const listingSchema = z.object({ deck_id: z.uuid(), listed: z.boolean() });

async function signedIn() {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  return user ? { supabase, user } : null;
}

export type TrashedDeck = { id: string; title: string; deletedAt: string; purgeAfter: string; cardCount: number };

/** Moves a deck to the trash. The toast's Undo calls `restoreDeck`. */
export async function trashDeck(id: string) {
  return guardAction('Deck delete', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data, error } = await session.supabase.rpc('trash_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to delete the deck.') };

    revalidatePath('/dashboard');
    return { success: true as const, deletedAt: data };
  });
}

export async function restoreDeck(id: string) {
  return guardAction('Deck restore', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { error } = await session.supabase.rpc('restore_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to restore the deck.') };

    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/${parsed.data}`);
    return { success: true as const };
  });
}

/** The trash, after purging anything past its 30 days (no cron needed for active users). */
export async function listTrashedDecks() {
  return guardAction('Trash', async () => {
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    await session.supabase.rpc('purge_expired_trash');
    const { data, error } = await session.supabase.rpc('list_trashed_decks');
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to load the trash.') };

    const decks: TrashedDeck[] = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      deletedAt: row.deleted_at,
      purgeAfter: row.purge_after,
      cardCount: Number(row.card_count),
    }));
    return { success: true as const, decks };
  });
}

export async function purgeDeck(id: string) {
  return guardAction('Deck purge', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { error } = await session.supabase.rpc('purge_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to delete the deck.') };
    return { success: true as const };
  });
}

export async function duplicateDeck(input: z.input<typeof duplicateSchema>) {
  return guardAction('Deck duplicate', async () => {
    const parsed = duplicateSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data: newDeckId, error } = await session.supabase.rpc('duplicate_deck', {
      p_deck_id: parsed.data.deck_id,
      p_keep_progress: parsed.data.keep_progress,
      ...(parsed.data.title ? { p_title: parsed.data.title } : {}),
    });
    if (error || !newDeckId) return { error: sanitizeDatabaseError(error, 'Failed to duplicate the deck.') };

    revalidatePath('/dashboard');
    return { success: true as const, deckId: newDeckId };
  });
}

export async function mergeDecks(input: z.input<typeof mergeSchema>) {
  return guardAction('Deck merge', async () => {
    const parsed = mergeSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data: moved, error } = await session.supabase.rpc('merge_decks', {
      p_source_id: parsed.data.source_id,
      p_target_id: parsed.data.target_id,
    });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to merge the decks.') };

    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/${parsed.data.target_id}`);
    return { success: true as const, movedCards: Number(moved ?? 0) };
  });
}

export async function setDeckListing(input: z.input<typeof listingSchema>) {
  return guardAction('Deck listing', async () => {
    const parsed = listingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data, error } = await session.supabase.rpc('set_deck_listing', {
      p_deck_id: parsed.data.deck_id,
      p_listed: parsed.data.listed,
    });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to update the listing.') };

    revalidatePath(`/dashboard/${parsed.data.deck_id}`);
    revalidatePath('/explore');
    return { success: true as const, listedAt: data ?? null };
  });
}
```

**UI — `DeckActions.tsx`.** Delete becomes trash-with-undo, reusing the existing optimistic rollback to put the row back:

```tsx
import { useRouter } from 'next/navigation';
import { updateDeck } from '@/app/actions/deck';
import { restoreDeck, trashDeck } from '@/app/actions/deck-lifecycle';
import { formatActionError } from '@/lib/ai-feedback';
// …
    const router = useRouter();

    // Trash, not delete (plan §4.1a): the toast's Undo restores the deck and
    // reuses the optimistic rollback to put its row back.
    async function handleDelete() {
        setIsLoading(true);
        onDeleteOptimistic?.();
        const result = await trashDeck(deckId);
        if ('error' in result && result.error) {
            onDeleteRollback?.();
            toast.error(formatActionError(result.error, 'Failed to delete the deck.'));
        } else {
            toast.success('Deck moved to the trash', {
                description: 'You can restore it for 30 days.',
                action: {
                    label: 'Undo',
                    onClick: () => {
                        void restoreDeck(deckId).then((restored) => {
                            if ('error' in restored && restored.error) {
                                toast.error(formatActionError(restored.error, 'Could not restore the deck.'));
                                return;
                            }
                            onDeleteRollback?.();
                            router.refresh();
                        });
                    },
                },
            });
        }
        setIsLoading(false);
        setShowDeleteConfirm(false);
    }
// ConfirmDialog copy:
//   title="Move this deck to the trash?"
//   description="It disappears everywhere now and is deleted for good after 30 days. You can restore it until then."
//   confirmLabel="Move to trash"
```

**UI — `TrashPanel`** (new client component). Mount it once at the foot of `/dashboard`, below `DeckGrid`. It loads only when opened, and opening it purges anything expired:

```tsx
// src/components/ui/shared/TrashPanel.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { listTrashedDecks, purgeDeck, restoreDeck, type TrashedDeck } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * "Recently deleted" (plan §4.1a). Loads only when opened — the dashboard pays
 * nothing for it — and the load itself purges anything past its 30 days.
 */
export function TrashPanel() {
  const router = useRouter();
  const [decks, setDecks] = useState<TrashedDeck[] | null>(null);
  const [purging, setPurging] = useState<TrashedDeck | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => startTransition(async () => {
    const result = await listTrashedDecks();
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not load the trash.'));
      return;
    }
    setDecks(result.decks);
  });

  const restore = (deck: TrashedDeck) => startTransition(async () => {
    const result = await restoreDeck(deck.id);
    if ('error' in result && result.error) {
      toast.error(formatActionError(result.error, 'Could not restore the deck.'));
      return;
    }
    setDecks((current) => current?.filter((row) => row.id !== deck.id) ?? null);
    toast.success(`${deck.title} restored`);
    router.refresh();
  });

  const purge = (deck: TrashedDeck) => startTransition(async () => {
    const result = await purgeDeck(deck.id);
    setPurging(null);
    if ('error' in result && result.error) {
      toast.error(formatActionError(result.error, 'Could not delete the deck.'));
      return;
    }
    setDecks((current) => current?.filter((row) => row.id !== deck.id) ?? null);
  });

  return (
    <details
      className="well px-3.5 py-2"
      onToggle={(event) => {
        if (event.currentTarget.open && decks === null) load();
      }}
    >
      <summary className={`${LABEL} cursor-pointer py-1`}>Recently deleted</summary>
      {decks === null ? (
        <p className="py-2 text-[13px] text-ink-dim" aria-live="polite">{isPending ? 'Loading…' : ''}</p>
      ) : decks.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-dim">Nothing in the trash.</p>
      ) : (
        <ul>
          {decks.map((deck) => (
            <li key={deck.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{deck.title}</span>
              <span className="font-mono text-[12px] tnum text-ink-dimmer">
                {deck.cardCount} cards · deleted for good {DATE.format(new Date(deck.purgeAfter))}
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => restore(deck)} aria-label={`Restore ${deck.title}`}>
                Restore
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setPurging(deck)} aria-label={`Delete ${deck.title} forever`}>
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => { if (!open) setPurging(null); }}
        title="Delete this deck forever?"
        description="Its cards, review history and drills are removed now. This cannot be undone."
        confirmLabel="Delete forever"
        variant="destructive"
        loading={isPending}
        onConfirm={() => { if (purging) purge(purging); }}
      />
    </details>
  );
}
```

#### 4.1b Duplicate and merge

**Duplicate** copies content, enrichment and embeddings verbatim. They are the owner's own, so reusing them costs nothing — unlike `clone_shared_deck`, which must re-embed on the *cloner's* budget. Scheduling resets to the column defaults unless `p_keep_progress` is set.

**Merge** moves cards into the target, keeping their ids, so `study_logs` follows automatically. It also moves `card_mastery_state`, archives the source's drills, and trashes the emptied source. Drills are archived rather than moved because `synthesis_attempts` denies `UPDATE`: a drill cannot be re-parented together with its history. The upside is that the merged deck can generate drills linking cards that used to live apart — the deferred cross-deck goal (F10), obtained without a cross-deck schema.

```sql
-- supabase/migrations/202609240910_deck_copy_merge.sql   (requires 202609240900)

-- ── Duplicate ──────────────────────────────────────────────────────
create or replace function public.duplicate_deck(
  p_deck_id uuid,
  p_title text default null,
  p_keep_progress boolean default false
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text;
  v_description text;
  v_card_count integer;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  select d.title, d.description
    into v_title, v_description
    from public.decks d
   where d.id = p_deck_id
     and d.user_id = v_uid;

  if not found then
    raise exception 'Deck not found or access denied.';
  end if;

  select count(*) into v_card_count from public.cards where deck_id = p_deck_id;
  if v_card_count > 5000 then
    raise exception 'Deck is too large to duplicate (limit 5000 cards).';
  end if;

  insert into public.decks (user_id, title, description)
  values (
    v_uid,
    coalesce(nullif(btrim(p_title), ''), left(v_title, 113) || ' (copy)'),
    v_description
  )
  returning id into v_new_id;

  -- Content, enrichment and embeddings copy verbatim: they are this user's
  -- own and cost nothing to reuse. Scheduling resets to the column defaults
  -- unless the caller keeps progress. Absorption provenance points at
  -- attempts on the original deck, so it is not copied.
  if p_keep_progress then
    insert into public.cards (
      deck_id, front, back, explanation, source, imported_by, mcq_distractors,
      id_question, topic_tags, ai_hint, mnemonic, embedding,
      state, "interval", ease_factor, repetition_count, next_review_at, last_review_at
    )
    select v_new_id, c.front, c.back, c.explanation, c.source, c.imported_by, c.mcq_distractors,
           c.id_question, c.topic_tags, c.ai_hint, c.mnemonic, c.embedding,
           c.state, c."interval", c.ease_factor, c.repetition_count, c.next_review_at, c.last_review_at
      from public.cards c
     where c.deck_id = p_deck_id;
  else
    insert into public.cards (
      deck_id, front, back, explanation, source, imported_by, mcq_distractors,
      id_question, topic_tags, ai_hint, mnemonic, embedding
    )
    select v_new_id, c.front, c.back, c.explanation, c.source, c.imported_by, c.mcq_distractors,
           c.id_question, c.topic_tags, c.ai_hint, c.mnemonic, c.embedding
      from public.cards c
     where c.deck_id = p_deck_id;
  end if;

  return v_new_id;
end;
$$;

-- ── Merge ──────────────────────────────────────────────────────────
create or replace function public.merge_decks(p_source_id uuid, p_target_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owned integer;
  v_moved integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  if p_source_id = p_target_id then
    raise exception 'Choose two different decks.';
  end if;

  -- Lock both rows, in id order, so two merges cannot interleave.
  select count(*)
    into v_owned
    from (
      select d.id
        from public.decks d
       where d.id in (p_source_id, p_target_id)
         and d.user_id = v_uid
       order by d.id
         for update
    ) locked;

  if v_owned <> 2 then
    raise exception 'Deck not found or access denied.';
  end if;

  -- Cards keep their ids, so study_logs (keyed on card_id) follow them.
  update public.cards set deck_id = p_target_id where deck_id = p_source_id;
  get diagnostics v_moved = row_count;

  update public.card_mastery_state
     set deck_id = p_target_id
   where deck_id = p_source_id
     and user_id = v_uid;

  -- A drill's attempts are append-only (synthesis_attempts denies UPDATE),
  -- so a drill cannot be re-parented together with its history. Archive
  -- the source's drills; the merged deck generates new ones.
  update public.synthesis_drills
     set status = 'archived'
   where deck_id = p_source_id
     and user_id = v_uid
     and status = 'active';

  update public.decks set updated_at = now() where id = p_target_id;

  -- The emptied source goes to the trash for 30 days, keeping its quiz
  -- history, chat and drill attempts until it is purged.
  perform set_config('cognit.include_trashed', 'on', true);
  update public.decks
     set deleted_at = now(),
         is_public = false
   where id = p_source_id;

  return v_moved;
end;
$$;

revoke all on function public.duplicate_deck(uuid, text, boolean) from public;
revoke all on function public.merge_decks(uuid, uuid) from public;
grant execute on function public.duplicate_deck(uuid, text, boolean) to authenticated;
grant execute on function public.merge_decks(uuid, uuid) to authenticated;
```

**UI.** "Duplicate" is an icon button in `DeckActions` that calls `duplicateDeck({ deck_id, keep_progress: false })` and routes to the new deck. "Merge" lives in the deck header's overflow, as a dialog that states every consequence before the click:

```tsx
// src/components/ui/shared/MergeDeckDialog.tsx
'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mergeDecks } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';

export type MergeTarget = { id: string; title: string; cardCount: number };

export type MergeDeckDialogProps = {
  sourceDeckId: string;
  sourceTitle: string;
  /** The user's other decks; the source is filtered out here too. */
  targets: MergeTarget[];
};

/**
 * Merge this deck into another (plan §4.1b). The consequences are stated
 * before the click, in the dialog's own words, because they are not all
 * obvious: drill history cannot move (attempts are append-only).
 */
export function MergeDeckDialog({ sourceDeckId, sourceTitle, targets }: MergeDeckDialogProps) {
  const router = useRouter();
  const selectId = useId();
  const candidates = targets.filter((target) => target.id !== sourceDeckId);
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const target = candidates.find((candidate) => candidate.id === targetId);

  if (candidates.length === 0) return null;

  const merge = () => startTransition(async () => {
    const result = await mergeDecks({ source_id: sourceDeckId, target_id: targetId });
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not merge the decks.'));
      return;
    }
    setOpen(false);
    toast.success(`${result.movedCards} cards moved into ${target?.title ?? 'the deck'}`);
    router.push(`/dashboard/${targetId}`);
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="text-[13px] text-ink-dim">Merge into</label>
      <select
        id={selectId}
        value={targetId}
        onChange={(event) => setTargetId(event.target.value)}
        className="h-[44px] rounded-[var(--radius-md)] border border-[var(--border-control)] bg-transparent px-2 text-base text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:h-[34px] sm:text-sm"
      >
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.title} · {candidate.cardCount} cards
          </option>
        ))}
      </select>
      <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)} disabled={!target}>
        Merge…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Merge ${sourceTitle} into ${target?.title ?? '…'}?`}
        description={`Its cards move with their review history and quiz progress. ${sourceTitle} then goes to the trash for 30 days with its quiz and drill history; its drills are archived, and new drills can link cards from both decks.`}
        confirmLabel="Merge"
        loading={isPending}
        onConfirm={merge}
      />
    </div>
  );
}
```

#### 4.1c Export — CSV and Anki

**Format decisions.**

- **CSV** follows RFC 4180, with a UTF-8 BOM (so Excel opens it correctly) and OWASP formula neutralisation (a cell starting with `= + - @` gets a leading `'`).
- **Anki** ships as tab-separated text with Anki's file headers rather than `.apkg`. An `.apkg` is a zipped SQLite database — a native or WASM dependency for no gain — while Anki 2.1.55+ imports the headered text with no dialog choices. A GUID column makes re-importing update notes instead of duplicating them.
- **The naming trap** (design system §7.6) is handled at this boundary: the schema's `back` is the *prompt* and `front` is the *answer*, so Anki's Front is `back`.
- **Math** is tokenised with the renderer's own `parseRichText`, so `$…$` becomes MathJax `\(…\)` while "costs $5 and $10" stays text — exactly as the card displays it.

```ts
// src/lib/deck-export.ts
import { parseRichText } from '@/lib/rich-text';

/** The card columns an export reads (PostgREST select list below). */
export type ExportCard = {
  id: string;
  front: string;
  back: string;
  explanation: string | null;
  topic_tags: string[] | null;
  state: string | null;
  interval: number | null;
  ease_factor: number | null;
  next_review_at: string | null;
};

export type ExportFormat = 'csv' | 'anki';

export const EXPORT_COLUMNS = 'id, front, back, explanation, topic_tags, state, interval, ease_factor, next_review_at';

/* ── CSV (RFC 4180) ───────────────────────────────────────────────── */

/** Spreadsheet apps execute a cell that starts with one of these (CSV injection, OWASP). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text.trim() !== text ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = ['question', 'answer', 'explanation', 'tags', 'state', 'interval_days', 'ease', 'next_review_at', 'cognit_id'].join(',');

/**
 * One CSV row. The schema's field names are backwards — `back` is the prompt
 * and `front` the answer (design system §7.6) — so the export maps them here
 * and names its columns for what they are.
 */
export function toCsvRow(card: ExportCard): string {
  return [
    card.back,
    card.front,
    card.explanation,
    (card.topic_tags ?? []).join('; '),
    card.state,
    card.interval,
    card.ease_factor,
    card.next_review_at,
    card.id,
  ].map(csvCell).join(',') + '\r\n';
}

/* ── Anki (tab-separated text import with file headers, Anki ≥ 2.1.55) ── */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A card face as an Anki HTML field. Cognit writes TeX as `$…$` / `$$…$$`
 * (rich-text.ts) and Anki's MathJax reads `\(…\)` / `\[…\]`. Tokenising with
 * the renderer's own parser keeps "costs $5 and $10" as text, exactly as the
 * card displays it. A tab or a newline would break the row, so tabs become
 * spaces and newlines `<br>`.
 */
export function toAnkiField(text: string): string {
  return parseRichText(text)
    .map((segment) => {
      if (segment.kind === 'math') {
        const tex = escapeHtml(segment.value);
        return segment.display ? `\\[${tex}\\]` : `\\(${tex}\\)`;
      }
      if (segment.kind === 'code') {
        const code = escapeHtml(segment.value);
        return segment.block ? `<pre><code>${code}</code></pre>` : `<code>${code}</code>`;
      }
      return escapeHtml(segment.value);
    })
    .join('')
    .replace(/\t/g, '    ')
    .replace(/\r?\n/g, '<br>');
}

/** Anki tags cannot contain spaces; `cognit::` nests them under one parent. */
export function toAnkiTags(tags: string[] | null): string {
  return (tags ?? [])
    .map((tag) => tag.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_:-]/gu, ''))
    .filter(Boolean)
    .map((tag) => `cognit::${tag}`)
    .join(' ');
}

/** The deck as Anki names it, nested under "Cognit". */
export function ankiDeckName(title: string): string {
  const clean = title.replace(/::/g, ' - ').replace(/[\t\r\n]/g, ' ').trim();
  return `Cognit::${clean || 'Deck'}`;
}

/**
 * Headers Anki reads before the rows, so the file imports with no dialog
 * choices: the Basic note type, the deck, the tag column and a GUID column —
 * re-importing the same deck updates its notes instead of duplicating them.
 */
export function ankiHeader(deckTitle: string): string {
  return [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:${ankiDeckName(deckTitle)}`,
    '#columns:Front\tBack\tTags\tGUID',
    '#tags column:3',
    '#guid column:4',
  ].join('\n') + '\n';
}

/** Anki Front is the prompt (`back`), Back is the answer (`front`) plus the explanation. */
export function toAnkiRow(card: ExportCard): string {
  const answer = card.explanation?.trim()
    ? `${toAnkiField(card.front)}<br><br><small>${toAnkiField(card.explanation)}</small>`
    : toAnkiField(card.front);
  return [toAnkiField(card.back), answer, toAnkiTags(card.topic_tags), `cognit-${card.id}`].join('\t') + '\n';
}

/** An ASCII file name, safe inside a Content-Disposition header. */
export function exportFilename(title: string, format: ExportFormat): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60);
  return `${base || 'deck'}.${format === 'anki' ? 'anki.txt' : 'csv'}`;
}
```

```ts
// src/app/api/decks/[deckId]/export/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import {
  CSV_HEADER,
  EXPORT_COLUMNS,
  ankiHeader,
  exportFilename,
  toAnkiRow,
  toCsvRow,
  type ExportCard,
  type ExportFormat,
} from '@/lib/deck-export';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PostgREST's default max-rows; the export pages through the deck in these. */
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/decks/[deckId]/export?format=csv|anki — the owner's deck as a
 * download, streamed a page at a time so a 5,000-card deck never sits in
 * memory. RLS scopes every read; the ownership check is only for a 404.
 * `/api` is outside the proxy matcher, so this route verifies the session
 * itself (the server client can still refresh it — route handlers may set cookies).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await context.params;
  if (!UUID.test(deckId)) {
    return NextResponse.json({ error: 'Invalid deck id.' }, { status: 400 });
  }
  const format: ExportFormat = request.nextUrl.searchParams.get('format') === 'anki' ? 'anki' : 'csv';

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!deck) {
    return NextResponse.json({ error: 'Deck not found.' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The BOM makes Excel open a UTF-8 CSV as UTF-8.
      controller.enqueue(encoder.encode(format === 'anki' ? ankiHeader(deck.title) : `﻿${CSV_HEADER}\r\n`));
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('cards')
          .select(EXPORT_COLUMNS)
          .eq('deck_id', deckId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          logger.error('export', 'card page read failed', { code: error.code, message: error.message });
          controller.error(new Error('Export failed.'));
          return;
        }
        const rows = (data ?? []) as ExportCard[];
        controller.enqueue(encoder.encode(rows.map(format === 'anki' ? toAnkiRow : toCsvRow).join('')));
        if (rows.length < PAGE) break;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': format === 'anki' ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(deck.title, format)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
```

```tsx
// src/components/ui/shared/ExportDeckMenu.tsx — next to ShareDeckButton in the deck header
import { Button } from '@/components/ui/button';

/**
 * Two downloads (plan §4.1c). Plain links to the export route: no client
 * JavaScript, and the browser's own download UI. Anki reads the file with
 * File → Import (2.1.55+), no dialog choices needed.
 */
export function ExportDeckMenu({ deckId }: { deckId: string }) {
  return (
    <div role="group" aria-label="Export this deck" className="flex items-center gap-1">
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/decks/${deckId}/export?format=csv`} download>Export CSV</a>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/decks/${deckId}/export?format=anki`} download>Export for Anki</a>
      </Button>
    </div>
  );
}
```

`src/lib/deck-export.test.ts` (10 tests, passing) covers the front/back mapping, formula neutralisation, negative numbers left alone, quoting, math conversion that leaves prices intact, one-line rows, HTML escaping, tags, headers and ASCII file names.

#### 4.1d Public deck directory — opt-in, behind a flag

**Consent model.** Sharing by link and *listing* are separate consents. Listing requires sharing, and unsharing or trashing a deck (which sets `is_public = false`) removes it from the directory at once, because the directory query requires both. The owner's identity is never returned.

**Moderation is the gating concern.** A reporter cannot unlist someone else's deck without `SECURITY DEFINER`, which this project bans, so auto-unlisting runs as a `pg_cron` job, which executes as `postgres`. **Ship behind `EXPLORE_ENABLED` and turn it on only once that job is scheduled.**

```sql
-- supabase/migrations/202609240930_explore_directory.sql

alter table public.decks add column if not exists listed_at timestamptz;

create index if not exists decks_listed_idx
  on public.decks (clone_count desc, listed_at desc)
  where listed_at is not null;

-- ── Owner: list or unlist ──────────────────────────────────────────
create or replace function public.set_deck_listing(p_deck_id uuid, p_listed boolean)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_listed_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  perform 1 from public.decks where id = p_deck_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Deck not found or access denied.';
  end if;

  update public.decks
     set listed_at = case when p_listed then coalesce(listed_at, now()) else null end
   where id = p_deck_id
     and user_id = (select auth.uid())
     and (not p_listed or (is_public = true and share_token is not null))
  returning listed_at into v_listed_at;

  if not found then
    raise exception 'Share the deck with a link before listing it.';
  end if;

  return v_listed_at;
end;
$$;

-- ── Anyone: browse ─────────────────────────────────────────────────
create or replace function public.list_public_decks(
  p_query text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  share_token text,
  title text,
  description text,
  card_count bigint,
  clone_count integer,
  listed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.share_token,
         d.title,
         d.description,
         (select count(*) from public.cards c where c.deck_id = d.id) as card_count,
         d.clone_count,
         d.listed_at
    from public.decks d
   where d.listed_at is not null
     and d.is_public = true
     and d.share_token is not null
     and (
       p_query is null
       or btrim(p_query) = ''
       or d.title ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by d.clone_count desc, d.listed_at desc, d.id
   limit greatest(1, least(coalesce(p_limit, 24), 48))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ── Reports ────────────────────────────────────────────────────────
create table if not exists public.deck_reports (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (deck_id, reporter_id)
);

-- The unique index leads with deck_id; reporter_id needs its own
-- (production-assertions.sql query 14: every FK has a leading index).
create index if not exists deck_reports_reporter_idx on public.deck_reports (reporter_id);

alter table public.deck_reports enable row level security;

drop policy if exists "Users can report listed decks" on public.deck_reports;
create policy "Users can report listed decks"
  on public.deck_reports for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.decks d
       where d.id = deck_id
         and d.listed_at is not null
    )
  );

drop policy if exists "Reporters can view their own reports" on public.deck_reports;
create policy "Reporters can view their own reports"
  on public.deck_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

revoke all on function public.set_deck_listing(uuid, boolean) from public;
revoke all on function public.list_public_decks(text, integer, integer) from public;
grant execute on function public.set_deck_listing(uuid, boolean) to authenticated;
grant execute on function public.list_public_decks(text, integer, integer) to anon, authenticated;

-- Auto-unlist on three reports since listing — pg_cron runs as postgres:
-- select cron.schedule('unlist-reported-decks', '*/15 * * * *', $$
--   update public.decks d
--      set listed_at = null
--    where d.listed_at is not null
--      and (select count(*) from public.deck_reports r
--            where r.deck_id = d.id and r.created_at > d.listed_at) >= 3
-- $$);
```

```tsx
// src/app/explore/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';

const PAGE_SIZE = 24;
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

export const metadata = { title: 'Explore decks — Cognit' };
/**
 * Rendered per request: the EXPLORE_ENABLED check must run at request time.
 * Left static, the build prerenders the flag-off 404 and flipping the flag
 * in production would never show the page.
 */
export const dynamic = 'force-dynamic';

/** Anonymous, cookie-less: the directory is the same for everyone. */
function directoryClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The public deck directory (plan §4.1d), behind EXPLORE_ENABLED until
 * moderation is in place. Deck rows, not tiles (design system §7.5); each
 * opens the existing shared-deck page, which already offers "Save a copy".
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  if (process.env.EXPLORE_ENABLED !== 'true') notFound();

  const { q, page } = await searchParams;
  const query = q?.trim().slice(0, 80) ?? '';
  const pageIndex = Math.max(0, Number.parseInt(page ?? '0', 10) || 0);
  const { data, error } = await directoryClient().rpc('list_public_decks', {
    ...(query ? { p_query: query } : {}),
    p_limit: PAGE_SIZE,
    p_offset: pageIndex * PAGE_SIZE,
  });
  const decks = error ? [] : data ?? [];

  return (
    <main id="main-content" className="container mx-auto flex max-w-3xl flex-col gap-4 p-4 md:py-10">
      <header>
        <p className={LABEL}>Directory</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Explore decks</h1>
      </header>
      <form role="search" className="flex gap-2">
        <label htmlFor="explore-q" className="sr-only">Search deck titles</label>
        <input
          id="explore-q"
          name="q"
          defaultValue={query}
          placeholder="Search titles"
          className="h-[44px] min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-control)] bg-transparent px-3 text-base text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:text-sm"
        />
      </form>
      {decks.length === 0 ? (
        <p className="surface p-5 text-sm text-ink-dim">{error ? 'The directory is unavailable right now.' : 'No listed decks match.'}</p>
      ) : (
        <ul className="well overflow-hidden px-3.5">
          {decks.map((deck) => (
            <li key={deck.share_token} className="border-b border-border last:border-b-0">
              <Link
                href={`/s/${deck.share_token}`}
                className="flex items-center gap-3 py-3 outline-hidden hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{deck.title}</span>
                  {deck.description ? <span className="block truncate text-[13px] text-ink-dim">{deck.description}</span> : null}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[13px] tnum text-ink-dim">{deck.card_count}</span>
                <span className="w-20 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer">{deck.clone_count} saves</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pages" className="flex justify-between text-sm">
        {pageIndex > 0 ? <Link href={`/explore?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageIndex - 1) })}`}>Previous</Link> : <span />}
        {decks.length === PAGE_SIZE ? <Link href={`/explore?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(pageIndex + 1) })}`}>Next</Link> : null}
      </nav>
    </main>
  );
}
```

Two build notes. The first draft of this page had no `dynamic` export, and `next build` prerendered it as a static 404 (○): the flag check runs before `searchParams` is awaited, so flipping `EXPLORE_ENABLED` in production would never have shown the page. With the export it builds as ƒ. Second, the listing toggle is a checkbox beside `ShareDeckButton`, rendered only when the deck has a share token; `ShareDeckButton` itself is untouched:

```tsx
// src/components/ui/shared/DeckListingToggle.tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setDeckListing } from '@/app/actions/deck-lifecycle';
import { formatActionError } from '@/lib/ai-feedback';

/**
 * Sharing by link and listing publicly are separate consents (plan §4.1d).
 * Rendered beside ShareDeckButton, and only once the deck has a share link.
 */
export function DeckListingToggle({ deckId, initialListedAt }: { deckId: string; initialListedAt: string | null }) {
  const [listed, setListed] = useState(initialListedAt !== null);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: boolean) => startTransition(async () => {
    const result = await setDeckListing({ deck_id: deckId, listed: next });
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not update the listing.'));
      return;
    }
    setListed(next);
    toast.success(next ? 'Listed in the public directory' : 'Removed from the public directory');
  });

  return (
    <label className="inline-flex min-h-[44px] items-center gap-2 text-[13px] text-ink-dim sm:min-h-0">
      <input
        type="checkbox"
        checked={listed}
        disabled={isPending}
        onChange={(event) => toggle(event.target.checked)}
        className="h-4 w-4 accent-[var(--ink)]"
      />
      List in the public directory
    </label>
  );
}
```

### 4.2 Key integrity — PED-01 · PED-02 · PED-03 · PED-04 · PED-05

The validators already enforce a lot: position-mapped keys, banned recall stems, "every card cited", condition and evaluation kinds, word caps. Four gaps let trivial or self-contradicting keys through, and one feedback signal goes nowhere. All of this was implemented in the clone, and the existing fixtures of known-good drills and plans **all still pass** (431 → 437 tests), so the rules are not over-strict on anything the suite knows.

| Gap | Rule | Where |
|---|---|---|
| PED-01 — one idea counted twice | Reject when two links' content-word Jaccard overlap is ≥ 0.7 → `duplicate_links` | drill and plan validators |
| PED-02 — recall disguised as synthesis | At least one link must cite ≥ 2 cards → `no_cross_card_link` | drill validator |
| PED-03 — an exemplar that would fail its own key | `exemplarGaps()`: core links sharing no content word with the exemplar and naming none of their cards. **Recorded** in `generation_meta.exemplar_gaps` first; enforce once `npm run ai:generation` shows how often it fires on drafts the checker grades sound | generation |
| PED-04 — "ip" found in "relationship" | `namedConceptCount` matches on word boundaries, like the UI's `isNamed` | `prompts.ts:379` |
| PED-05 — "Unfair" goes nowhere | Two "unfair" ratings on one drill's checks retire the drill: its key, not the student, is wrong | `rateSynthesisAttempt` |

```ts
// src/lib/synthesis/prompts.ts — namedConceptCount, now word-bounded
function namedConceptCount(text: string, cluster: ClusterCard[]): number {
  const normalised = ` ${normaliseForQuote(text)} `;
  return cluster.filter((card) => {
    const term = normaliseForQuote(card.term);
    return term.length > 0 && normalised.includes(` ${term} `);
  }).length;
}

/* ── Key integrity (plan §4.2) ───────────────────────────────────── */

const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'with', 'that', 'this', 'from', 'into', 'than', 'then', 'when', 'which', 'each', 'more', 'less', 'its', 'has', 'have', 'can', 'will', 'was', 'were', 'been', 'being', 'because', 'also']);

function contentWords(text: string): Set<string> {
  return new Set(normaliseForQuote(text).split(' ').filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

/** Jaccard overlap of content words: near 1 is the same claim, reworded or not. */
export function linkOverlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Two links this similar are one idea counted twice (PED-01). */
export const DUPLICATE_LINK_OVERLAP = 0.7;

function hasDuplicateLinks(links: RequiredLink[]): boolean {
  for (let i = 0; i < links.length; i += 1) {
    for (let j = i + 1; j < links.length; j += 1) {
      if (linkOverlap(links[i].text, links[j].text) >= DUPLICATE_LINK_OVERLAP) return true;
    }
  }
  return false;
}

/**
 * Core links the exemplar never touches: no shared content word and no named
 * card. A cheap proxy for "the exemplar would fail its own key" (PED-03) —
 * recorded in generation_meta first, enforced once `npm run ai:generation`
 * shows how often it fires on drafts the checker grades sound.
 */
export function exemplarGaps(links: RequiredLink[], exemplarText: string, cluster: ClusterCard[]): string[] {
  const words = contentWords(exemplarText);
  const text = ` ${normaliseForQuote(exemplarText)} `;
  const termById = new Map(cluster.map((card) => [card.id, normaliseForQuote(card.term)]));
  return links
    .filter((link) => link.core)
    .filter((link) => {
      const sharesWord = [...contentWords(link.text)].some((word) => words.has(word));
      const namesCard = link.cardIds.some((id) => {
        const term = termById.get(id);
        return term ? text.includes(` ${term} `) : false;
      });
      return !sharesWord && !namesCard;
    })
    .map((link) => link.id);
}

// validateDrillDraft — after the existing `card_uncited` check:
  // A synthesis key must relate cards: a key whose every link cites one card is recall (PED-02).
  if (!requiredLinks.some((link) => link.cardIds.length >= 2)) {
    return { ok: false, reason: 'no_cross_card_link' };
  }
  if (hasDuplicateLinks(requiredLinks)) {
    return { ok: false, reason: 'duplicate_links' };
  }

// validatePlanDraft — after `too_few_links`:
  if (hasDuplicateLinks(requiredLinks)) return { ok: false, reason: 'duplicate_links' };
```

```ts
// src/app/actions/synthesis.ts — generateSynthesisDrills: generation_meta gains
          exemplar_gaps: exemplarGaps(drill.requiredLinks, [drill.exemplar.claim, ...drill.exemplar.mechanisms, drill.exemplar.tradeoff].join(' '), cluster.cards).length,

// src/app/actions/synthesis.ts — above rateSynthesisAttempt
/** Two "unfair" ratings on one drill's checks mean its key, not the student, is wrong (PED-05). */
const UNFAIR_RETIRE_THRESHOLD = 2;

async function retireIfRepeatedlyUnfair(
  supabase: SupabaseServerClient,
  input: { drillId: string; deckId: string; userId: string },
): Promise<boolean> {
  const { count, error } = await supabase
    .from('synthesis_attempt_feedback')
    .select('id, synthesis_attempts!inner(drill_id)', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .eq('rating', 'unfair')
    .eq('synthesis_attempts.drill_id', input.drillId);
  if (error || (count ?? 0) < UNFAIR_RETIRE_THRESHOLD) return false;

  const { data: archived, error: archiveError } = await supabase
    .from('synthesis_drills')
    .update({ status: 'archived' })
    .eq('id', input.drillId)
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .select('id');
  if (archiveError) {
    logger.warn('rateSynthesisAttempt', 'could not retire an unfair drill', { drill_id: input.drillId, message: archiveError.message });
    return false;
  }
  if (archived?.length) logger.info('rateSynthesisAttempt', 'drill retired after repeated unfair ratings', { drill_id: input.drillId });
  return Boolean(archived?.length);
}

// rateSynthesisAttempt: select 'id, drill_id' on the attempt; after a successful upsert:
    const retired = parsed.data.rating === 'unfair'
      ? await retireIfRepeatedlyUnfair(supabase, { drillId: attempt.drill_id, deckId: parsed.data.deck_id, userId: user.id })
      : false;
    if (retired) revalidatePath(`/dashboard/${parsed.data.deck_id}`);

    return { success: true as const, retired };
```

`CheckFeedback` should then say so when `retired` comes back: "Thanks — this drill has been retired and will be regenerated."

```ts
// src/lib/synthesis/integrity.test.ts (6 tests, passing)
import { describe, expect, it } from 'vitest';
import type { ClusterCard } from '@/lib/synthesis/clusters';
import { exemplarGaps, linkOverlap, validateDrillDraft, type DrillGenerationDraft } from '@/lib/synthesis/prompts';

const CLUSTER: ClusterCard[] = [
  { id: 'a', term: 'Time quantum', definition: 'The CPU slice a round-robin scheduler gives each process.', explanation: null, tags: ['scheduling'] },
  { id: 'b', term: 'Context switch', definition: 'Saving one process state and loading another; pure overhead.', explanation: null, tags: ['scheduling'] },
  { id: 'c', term: 'Throughput', definition: 'Processes completed per unit time.', explanation: null, tags: ['scheduling'] },
];

const EXEMPLAR = {
  claim: 'A smaller time quantum means more context switches.',
  mechanisms: ['Each context switch is overhead.', 'Overhead is time not spent on throughput.'] as [string, string],
  tradeoff: 'Above typical burst length the effect fades.',
};

function draft(links: DrillGenerationDraft['required_links']): DrillGenerationDraft {
  return {
    format: 'causal',
    prompt_text: 'Why does shrinking the time quantum raise context switch overhead and cut throughput?',
    prompt_variants: [],
    required_links: links,
    exemplar: EXEMPLAR,
  };
}

const PREEMPT = { text: 'A smaller quantum pre-empts more often, so more context switches occur.', card_keys: ['c1', 'c2'], kind: 'mechanism' };
const OVERHEAD = { text: 'Every context switch is overhead that completes no process work, lowering throughput.', card_keys: ['c2', 'c3'], kind: 'mechanism' };
const BOUNDARY = { text: 'Only while the quantum is shorter than typical CPU bursts.', card_keys: ['c1'], kind: 'condition' };

describe('key integrity (plan §4.2)', () => {
  it('accepts a key whose links relate cards', () => {
    expect(validateDrillDraft(draft([PREEMPT, OVERHEAD, BOUNDARY]), CLUSTER).ok).toBe(true);
  });

  it('rejects one idea counted twice (PED-01)', () => {
    const reworded = { ...PREEMPT, text: 'More context switches occur because a smaller quantum pre-empts more often.' };
    expect(linkOverlap(PREEMPT.text, reworded.text)).toBeGreaterThanOrEqual(0.7);
    expect(validateDrillDraft(draft([PREEMPT, reworded, OVERHEAD, BOUNDARY]), CLUSTER)).toEqual({ ok: false, reason: 'duplicate_links' });
  });

  it('rejects recall disguised as synthesis: no link cites two cards (PED-02)', () => {
    const single = [
      { text: 'The quantum is the slice each process gets.', card_keys: ['c1'], kind: 'mechanism' },
      { text: 'A switch saves and loads process state.', card_keys: ['c2'], kind: 'mechanism' },
      { text: 'Only for CPU-bound work is throughput the measure.', card_keys: ['c3'], kind: 'condition' },
    ];
    expect(validateDrillDraft(draft(single), CLUSTER)).toEqual({ ok: false, reason: 'no_cross_card_link' });
  });

  it('keeps unrelated links apart', () => {
    expect(linkOverlap(PREEMPT.text, OVERHEAD.text)).toBeLessThan(0.2);
  });

  it('names concepts only on word boundaries (PED-04)', () => {
    const ip: ClusterCard[] = [
      { id: 'x', term: 'IP', definition: 'Internet Protocol.', explanation: null, tags: [] },
      { id: 'y', term: 'Router', definition: 'Forwards packets.', explanation: null, tags: [] },
    ];
    const noIp = { ...draft([{ text: 'A router forwards by IP address.', card_keys: ['c1', 'c2'], kind: 'mechanism' }, { text: 'Routing tables map prefixes.', card_keys: ['c2'], kind: 'mechanism' }]), prompt_text: 'How does a router use the relationship between hops?' };
    // "relationship" contains "ip" but does not name IP: only one concept is named.
    expect(validateDrillDraft(noIp, ip)).toEqual({ ok: false, reason: 'prompt_does_not_name_concepts' });
  });

  it('flags a core link the exemplar never touches (PED-03, telemetry)', () => {
    const links = validateDrillDraft(draft([PREEMPT, OVERHEAD, BOUNDARY]), CLUSTER);
    if (!links.ok) throw new Error('fixture invalid');
    expect(exemplarGaps(links.drill.requiredLinks, 'A smaller quantum means more context switches, each one overhead that lowers throughput; only below typical CPU bursts.', CLUSTER)).toEqual([]);
    expect(exemplarGaps(links.drill.requiredLinks, 'Scheduling is complicated.', CLUSTER)).toEqual(['m1', 'm2', 'm3']);
  });
});
```

**Also in this section** — RAG-02 (§3.5) is the other half of drill quality. With `NEIGHBOUR_FLOOR` in place, a cluster no longer forms from cards the embedding space calls unrelated, so the generator stops being asked to invent a relation between "Mutex" and "Paging".

### 4.3 Interactive concept map — deferred F6, resolves DS-01

The execution plan deferred F6 because "a layout engine is a week on its own; the data is in place". The data is in place: every active drill's `required_links[].card_ids` names card pairs, and the latest attempt's `coverage[]` says whether each link held. What changes the estimate is not needing a layout *engine*. A deterministic Fruchterman–Reingold pass over at most 60 nodes runs on the server in a few milliseconds, the map ships as positioned SVG, and the client component only does highlighting and navigation.

It lands in the Insights segment as that segment's **one `.raised` object**, which fixes DS-01 (five `.surface` panels, no `.raised`).

```sql
-- supabase/migrations/202609240920_concept_graph.sql
create or replace function public.get_concept_graph(
  p_deck_id uuid,
  p_max_nodes integer default 80
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  drills as (
    select d.id, d.required_links
      from public.synthesis_drills d
     where d.deck_id = p_deck_id
       and d.user_id = (select uid from me)
       and d.status = 'active'
  ),
  latest as (
    select distinct on (a.drill_id) a.drill_id, a.coverage
      from public.synthesis_attempts a
      join drills on drills.id = a.drill_id
     where a.user_id = (select uid from me)
     order by a.drill_id, a.created_at desc
  ),
  links as (
    select dr.id as drill_id,
           link ->> 'id' as link_id,
           array(select jsonb_array_elements_text(link -> 'card_ids')) as card_ids
      from drills dr
      cross join lateral jsonb_array_elements(dr.required_links) as link
  ),
  statuses as (
    select l.card_ids,
           coalesce(hit.entry ->> 'status', 'unseen') as status
      from links l
      left join latest lt on lt.drill_id = l.drill_id
      left join lateral (
        select entry
          from jsonb_array_elements(coalesce(lt.coverage, '[]'::jsonb)) as entry
         where entry ->> 'link_id' = l.link_id
         limit 1
      ) hit on true
  ),
  pairs as (
    select least(a.id, b.id) as source,
           greatest(a.id, b.id) as target,
           s.status
      from statuses s
      cross join lateral unnest(s.card_ids) as a(id)
      cross join lateral unnest(s.card_ids) as b(id)
     where a.id < b.id
  ),
  edges as (
    select source,
           target,
           count(*) as links,
           count(*) filter (where status = 'covered') as covered,
           count(*) filter (where status = 'partial') as partial,
           count(*) filter (where status = 'missing') as missing
      from pairs
     group by source, target
  ),
  weights as (
    select id, sum(links) as weight
      from (
        select source as id, links from edges
        union all
        select target as id, links from edges
      ) ends
     group by id
  ),
  kept as (
    select id
      from weights
     order by weight desc, id
     limit greatest(1, least(coalesce(p_max_nodes, 80), 150))
  ),
  contradicted as (
    select hit.card_id::text as id, count(*) as n
      from public.synthesis_attempts a
      cross join lateral unnest(a.contradicted_card_ids) as hit(card_id)
     where a.deck_id = p_deck_id
       and a.user_id = (select uid from me)
       and a.created_at > now() - interval '30 days'
     group by hit.card_id
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'term', c.front,          -- `front` is the term/answer (design system §7.6)
               'state', c.state,
               'contradicted', coalesce(x.n, 0)
             ) order by c.front)
        from public.cards c
        join kept k on k.id = c.id::text
        left join contradicted x on x.id = c.id::text
       where c.deck_id = p_deck_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'source', e.source,
               'target', e.target,
               'links', e.links,
               'covered', e.covered,
               'partial', e.partial,
               'missing', e.missing
             ) order by e.source, e.target)
        from edges e
       where e.source in (select id from kept)
         and e.target in (select id from kept)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_concept_graph(uuid, integer) from public;
grant execute on function public.get_concept_graph(uuid, integer) to authenticated;
```

```ts
// src/lib/concept-graph.ts
import { z } from 'zod';

/*
 * The concept map's data (get_concept_graph, 202609240920) and its layout.
 * Parsing and layout run on the server; the client component receives
 * positioned nodes and imports only the types from here.
 */

const nodeSchema = z.object({
  id: z.string(),
  term: z.string(),
  state: z.enum(['new', 'learning', 'review', 'relearning']).nullable(),
  contradicted: z.number().int().nonnegative(),
});

const edgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  links: z.number().int().positive(),
  covered: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
});

const graphSchema = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) });

export type ConceptNode = z.infer<typeof nodeSchema>;
export type ConceptEdge = z.infer<typeof edgeSchema>;
export type ConceptGraph = z.infer<typeof graphSchema>;
export type PositionedNode = ConceptNode & { x: number; y: number; degree: number };

export function parseConceptGraph(raw: unknown): ConceptGraph | null {
  const parsed = graphSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type LayoutOptions = { width: number; height: number; iterations?: number; padding?: number };

/**
 * A deterministic force-directed layout (Fruchterman–Reingold), computed on
 * the server so the map ships as positioned SVG — no layout library, no
 * client work. Same graph in, same picture out: nodes start on a circle in id
 * order and every step is plain arithmetic, no Math.random.
 * O(n² · iterations): 60 nodes × 300 steps is ~0.5 M pair visits, a few ms.
 */
export function layoutConceptGraph(graph: ConceptGraph, options: LayoutOptions): PositionedNode[] {
  const { width, height, iterations = 300, padding = 48 } = options;
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const n = nodes.length;
  if (n === 0) return [];

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const degree = new Array<number>(n).fill(0);
  const springs: { a: number; b: number; weight: number }[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    springs.push({ a, b, weight: Math.min(3, edge.links) });
    degree[a] += edge.links;
    degree[b] += edge.links;
  }

  const k = Math.sqrt(((width - 2 * padding) * (height - 2 * padding)) / n);
  const pos = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: width / 2 + (width / 3) * Math.cos(angle), y: height / 2 + (height / 3) * Math.sin(angle) };
  });

  let temperature = width / 8;
  const cooling = temperature / (iterations + 1);
  for (let step = 0; step < iterations; step += 1) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.01 * (j - i);
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const push = (k * k) / dist;
        disp[i].x += (dx / dist) * push;
        disp[i].y += (dy / dist) * push;
        disp[j].x -= (dx / dist) * push;
        disp[j].y -= (dy / dist) * push;
      }
    }
    for (const { a, b, weight } of springs) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const pull = ((dist * dist) / k) * (0.5 + 0.25 * weight);
      disp[a].x -= (dx / dist) * pull;
      disp[a].y -= (dy / dist) * pull;
      disp[b].x += (dx / dist) * pull;
      disp[b].y += (dy / dist) * pull;
    }
    for (let i = 0; i < n; i += 1) {
      const length = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
      const move = Math.min(length, temperature);
      pos[i].x = Math.min(width - padding, Math.max(padding, pos[i].x + (disp[i].x / length) * move));
      pos[i].y = Math.min(height - padding, Math.max(padding, pos[i].y + (disp[i].y / length) * move));
    }
    temperature -= cooling;
  }

  return nodes.map((node, i) => ({ ...node, x: Math.round(pos[i].x), y: Math.round(pos[i].y), degree: degree[i] }));
}
```

`src/lib/concept-graph.test.ts` (5 tests, passing) covers determinism, bounds, linked-closer-than-unlinked on two disjoint triangles, weighted degree, and rejection of a malformed payload.

```tsx
// src/components/ui/shared/synthesis/ConceptMapPanel.tsx — Server Component
import { ConceptMap } from '@/components/ui/shared/synthesis/ConceptMap';
import { layoutConceptGraph, parseConceptGraph } from '@/lib/concept-graph';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

const WIDTH = 1000;
const HEIGHT = 520;
const MAX_NODES = 60;
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The Insights segment's one `.raised` object (design system §7.1): the deck's
 * concepts and how the drills have tested the relations between them. Graph
 * read, parse and layout all happen here, on the server.
 */
export async function ConceptMapPanel({ deckId }: { deckId: string }) {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_concept_graph', { p_deck_id: deckId, p_max_nodes: MAX_NODES });
  if (error) logger.warn('concept-map', 'get_concept_graph failed', { message: error.message });
  const graph = error ? null : parseConceptGraph(data);

  if (!graph || graph.edges.length === 0) {
    return (
      <section className="surface p-5 md:p-6" aria-labelledby="concept-map-heading">
        <h2 id="concept-map-heading" className={LABEL}>Concept map</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-dim">
          The map draws itself from your drills: every link a drill asks for joins two concepts. Generate a few drills to see how this deck connects.
        </p>
      </section>
    );
  }

  const nodes = layoutConceptGraph(graph, { width: WIDTH, height: HEIGHT });

  return (
    <section className="raised spec relative p-4 md:p-5" aria-labelledby="concept-map-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="concept-map-heading" className={LABEL}>Concept map</h2>
        <p className={`${LABEL} tnum`}>
          {graph.nodes.length} concepts · {graph.edges.length} relations
        </p>
      </div>
      <ConceptMap deckId={deckId} nodes={nodes} edges={graph.edges} width={WIDTH} height={HEIGHT} />
    </section>
  );
}
```

```tsx
// src/components/ui/shared/synthesis/ConceptMap.tsx — Client Component
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConceptEdge, PositionedNode } from '@/lib/concept-graph';

export type ConceptMapProps = {
  deckId: string;
  /** Laid out on the server by `layoutConceptGraph`, in the viewBox below. */
  nodes: PositionedNode[];
  edges: ConceptEdge[];
  width: number;
  height: number;
};

type Relation = { id: string; term: string; status: 'holds' | 'weak' | 'untested' | 'mixed' };

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * How a relation is going, from the latest attempt on each drill that asks
 * for it. The hues follow the synthesis mapping of the state channel (design
 * system Rev. D): holds → mastered, keeps going missing → due; an untested
 * relation is a dashed hairline, never a colour.
 */
function relationStatus(edge: ConceptEdge): Relation['status'] {
  const seen = edge.covered + edge.partial + edge.missing;
  if (seen === 0) return 'untested';
  if (edge.covered / edge.links >= 0.7) return 'holds';
  if (edge.missing > edge.covered) return 'weak';
  return 'mixed';
}

const STROKE: Record<Relation['status'], { stroke: string; dash?: string }> = {
  holds: { stroke: 'var(--state-mastered)' },
  weak: { stroke: 'var(--state-due)' },
  mixed: { stroke: 'var(--ink-dim)' },
  untested: { stroke: 'var(--border-strong)', dash: '3 4' },
};

const STATUS_WORD: Record<Relation['status'], string> = {
  holds: 'holds',
  weak: 'keeps going missing',
  mixed: 'partly covered',
  untested: 'not drilled yet',
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The concept map (deferred F6): cards as nodes, the links the deck's drills
 * ask for as edges. Desktop gets the SVG; below `md` the same data renders as
 * a list, where a 1000-unit graph would be unreadable. Every node is a real
 * link — Tab walks them alphabetically, and each one's accessible name reads
 * out its relations, so the picture is never the only way in (WCAG 1.1.1).
 */
export function ConceptMap({ deckId, nodes, edges, width, height }: ConceptMapProps) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const relations = useMemo(() => {
    const map = new Map<string, Relation[]>();
    for (const edge of edges) {
      const status = relationStatus(edge);
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      map.set(source.id, [...(map.get(source.id) ?? []), { id: target.id, term: target.term, status }]);
      map.set(target.id, [...(map.get(target.id) ?? []), { id: source.id, term: source.term, status }]);
    }
    return map;
  }, [byId, edges]);
  const ordered = useMemo(() => [...nodes].sort((a, b) => a.term.localeCompare(b.term)), [nodes]);
  const lit = active ? new Set((relations.get(active) ?? []).map((relation) => relation.id)) : null;

  const describe = (node: PositionedNode) => {
    const own = relations.get(node.id) ?? [];
    const parts = own.map((relation) => `${relation.term}, ${STATUS_WORD[relation.status]}`);
    const contradicted = node.contradicted > 0 ? ` Contradicted ${node.contradicted} times in 30 days.` : '';
    return `${node.term}. ${own.length} ${own.length === 1 ? 'relation' : 'relations'}: ${parts.join('; ')}.${contradicted} Opens a review of this card.`;
  };

  const open = (id: string) => router.push(`/dashboard/${deckId}/study?cards=${id}`);

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="hidden h-auto w-full md:block"
        role="group"
        aria-label={`Concept map: ${nodes.length} concepts, ${edges.length} relations`}
      >
        <g aria-hidden="true">
          {edges.map((edge) => {
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) return null;
            const tone = STROKE[relationStatus(edge)];
            const dimmed = lit !== null && edge.source !== active && edge.target !== active;
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={tone.stroke}
                strokeDasharray={tone.dash}
                strokeWidth={edge.links >= 3 ? 2 : edge.links === 2 ? 1.5 : 1}
                opacity={dimmed ? 0.15 : 0.9}
              />
            );
          })}
        </g>
        {ordered.map((node) => {
          const dimmed = lit !== null && node.id !== active && !lit.has(node.id);
          return (
            <a
              key={node.id}
              href={`/dashboard/${deckId}/study?cards=${node.id}`}
              aria-label={describe(node)}
              onClick={(event) => {
                event.preventDefault();
                open(node.id);
              }}
              onFocus={() => setActive(node.id)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(node.id)}
              onMouseLeave={() => setActive(null)}
              className="concept-node outline-hidden"
              style={{ opacity: dimmed ? 0.35 : 1 }}
            >
              <title>{node.term}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.min(9, 4 + node.degree)}
                fill="var(--surface)"
                stroke={node.contradicted > 0 ? 'var(--state-lapsed)' : 'var(--ink-dim)'}
                strokeWidth={node.id === active ? 2 : 1}
              />
              <text x={node.x + 12} y={node.y + 4} className="fill-[var(--ink)] text-[14px]">
                {truncate(node.term, 24)}
              </text>
            </a>
          );
        })}
      </svg>

      {/* Below md: the same relations as a list. */}
      <ul className="flex flex-col md:hidden">
        {ordered.map((node) => {
          const own = relations.get(node.id) ?? [];
          return (
            <li key={node.id} className="border-b border-border py-2.5 last:border-b-0">
              <button
                type="button"
                onClick={() => open(node.id)}
                className="min-h-[44px] text-left text-sm text-ink underline-offset-[3px] outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {node.term}
              </button>
              <p className="mt-0.5 text-[13px] text-ink-dim">
                {own.map((relation) => `${relation.term} · ${STATUS_WORD[relation.status]}`).join('  —  ')}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Every swatch ships with its word (design system §2.2b). */}
      <p className={`${LABEL} mt-2 flex flex-wrap gap-x-4 gap-y-1`}>
        {(Object.keys(STROKE) as Relation['status'][]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <svg width="14" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="14" y2="2" stroke={STROKE[status].stroke} strokeDasharray={STROKE[status].dash} strokeWidth="2" />
            </svg>
            {STATUS_WORD[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-[var(--state-lapsed)]" aria-hidden="true" />
          contradicted in 30 days
        </span>
      </p>
    </div>
  );
}
```

```css
/* src/app/globals.css — the node's own focus ring; CSS outranks the SVG presentation attribute. */
.concept-node:focus-visible circle {
  stroke: var(--accent);
  stroke-width: 2;
}
```

**Integration.** The Insights segment (`[deckId]/page.tsx:487`) opens with `<Suspense fallback={<SynthesisInsightsSkeleton />}><ConceptMapPanel deckId={deckId} /></Suspense>`, above `WeakestConcepts`.

**Type sizing.** Labels are 14 viewBox units in a 1000-unit box, rendered at `w-full h-auto` from `md` up. That comes to 10.75 px at 768 px wide and 14 px at 1000 px — never below the design system's 10 px label step. Below `md` the map does not render; the list does.

### 4.4 Voice dictation — deferred F11

**Prerequisite (SEC-02).** `next.config.ts:70` must change from `microphone=()` to `microphone=(self)`, otherwise the browser refuses the permission outright.

**Where it helps.** iOS and Android keyboards already dictate into any field, so the button matters most on desktop Chrome and Edge, and in Android Chrome where a hardware keyboard is attached. Browsers without the API — Firefox — never see the button.

**Privacy.** Chrome sends the audio to Google's speech service and Safari to Apple's. The button's `title` says so; add a line to the privacy policy.

```ts
// src/lib/use-dictation.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * The Web Speech API is not in TypeScript's DOM lib. These are the members
 * this hook touches, nothing more.
 */
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { readonly isFinal: boolean; readonly length: number; readonly [index: number]: RecognitionAlternative };
type RecognitionEvent = { readonly resultIndex: number; readonly results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { readonly error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export type DictationStatus = 'unsupported' | 'idle' | 'listening';
export type DictationError = 'not-allowed' | 'no-speech' | 'network' | 'audio-capture' | 'other';

const KNOWN_ERRORS: readonly DictationError[] = ['not-allowed', 'no-speech', 'network', 'audio-capture'];

/**
 * Speech to text for the drill slots (deferred F11). Chrome/Edge (desktop and
 * Android) and Safari implement it; Firefox does not, and the hook reports
 * `unsupported` there. Support is detected after mount, so the server render
 * and the first client render agree.
 *
 * Privacy: Chrome sends the audio to Google's speech service and Safari to
 * Apple's. The button's first use says so.
 */
export function useDictation(options: { onFinal: (text: string) => void; onInterim?: (text: string) => void; lang?: string }) {
  const [status, setStatus] = useState<DictationStatus>('unsupported');
  const [error, setError] = useState<DictationError | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const handlersRef = useRef(options);
  useEffect(() => {
    handlersRef.current = options;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus(recognitionConstructor() ? 'idle' : 'unsupported'), 0);
    return () => {
      window.clearTimeout(timer);
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor || recognitionRef.current) return;

    const recognition = new Constructor();
    recognition.lang = handlersRef.current.lang ?? (document.documentElement.lang || navigator.language || 'en-US');
    recognition.continuous = true;
    recognition.interimResults = Boolean(handlersRef.current.onInterim);
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim() ?? '';
        if (!text) continue;
        if (result.isFinal) handlersRef.current.onFinal(text);
        else interim += `${text} `;
      }
      handlersRef.current.onInterim?.(interim.trim());
    };
    recognition.onerror = (event) => {
      setError(KNOWN_ERRORS.includes(event.error as DictationError) ? (event.error as DictationError) : 'other');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      handlersRef.current.onInterim?.('');
      setStatus('idle');
    };

    recognitionRef.current = recognition;
    setError(null);
    setStatus('listening');
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setStatus('idle');
      setError('other');
    }
  }, []);

  return { status, error, start, stop, supported: status !== 'unsupported' };
}
```

```tsx
// src/components/ui/shared/synthesis/DictationButton.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDictation } from '@/lib/use-dictation';

export type DictationButtonProps = {
  /** Each final phrase; the form inserts it at the caret of the last-focused slot. */
  onText: (text: string) => void;
  /** True while a check is in flight: dictation stops and the button disables. */
  disabled?: boolean;
  lang?: string;
};

/**
 * "Dictate" beside the term chips (design system §6: a label, not a glyph —
 * a microphone is not on the permitted icon list). Renders nothing where the
 * browser has no speech recognition, so no one meets a dead control.
 */
export function DictationButton({ onText, disabled = false, lang }: DictationButtonProps) {
  const [interim, setInterim] = useState('');
  const { status, error, start, stop, supported } = useDictation({ onFinal: onText, onInterim: setInterim, lang });
  const listening = status === 'listening';

  useEffect(() => {
    if (disabled && listening) stop();
  }, [disabled, listening, stop]);

  if (!supported) return null;

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={listening}
        onClick={listening ? stop : start}
        disabled={disabled}
        title="Speech is transcribed by your browser's speech service"
        className="h-[44px] px-2 text-[12px] sm:h-[24px]"
      >
        {listening ? 'Stop dictating' : 'Dictate'}
      </Button>
      <span className="sr-only" aria-live="polite">{listening ? 'Listening' : ''}</span>
      {interim ? (
        <span className="max-w-[24ch] truncate text-[13px] text-ink-dimmer" aria-hidden="true">{interim}</span>
      ) : null}
      {error === 'not-allowed' ? (
        <span role="status" className="text-[13px] text-ink-dim">Microphone blocked — allow it in the site settings.</span>
      ) : null}
    </span>
  );
}
```

**`AnswerForm` integration** (compiled). It also fixes UX-04, a chip tapped before any slot had focus doing nothing:

```tsx
import { DictationButton } from '@/components/ui/shared/synthesis/DictationButton';
// …
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Where a chip or dictation lands before any slot has had focus (UX-04).
  const claimRef = useRef<HTMLInputElement | null>(null);
  const freeRef = useRef<HTMLTextAreaElement | null>(null);
// …
  // A term chip — or a dictated phrase — goes in at the caret of the
  // last-focused slot, or the first slot when none has had focus yet.
  const insertText = useCallback((term: string) => {
    const target = lastFocused.current ?? (mode === 'free' ? freeRef.current : claimRef.current);
    if (!target || disabled) return;
    /* …unchanged body of the old insertTerm… */
  }, [disabled, mode, onFreeTextChange, onOutlineChange, outline]);
// chips:        onClick={() => insertText(anchor.term)}
// after chips:  <DictationButton onText={insertText} disabled={locked} />
// claim input:  <Input ref={claimRef} name="claim" … />
// free slot:    <Textarea ref={freeRef} name="free" … />
```

`PlanForm` takes the same three changes, with `thesisRef` as its default target.

### 4.5 Gate G1

| Check | Command or step | Pass |
|---|---|---|
| Migrations | §1.2.1 for `202609240900` → `…0930`, in order | dry-run clean; push clean; `npm run db:types` → `tsc` clean |
| Assertions | `production-assertions.sql` 1–3, 12–15 | zero rows (the new table has policies; every new function is INVOKER with a pinned path; the new FK is indexed) |
| Trash policy | `select policyname, permissive from pg_policies where tablename = 'decks';` | "Trashed decks are hidden" with `permissive = 'RESTRICTIVE'` |
| Unit | `npm test` | Phase 0's 425 plus `deck-export` 10, `concept-graph` 5, `integrity` 6 = **446** (440 against the Appendix D patch alone) |
| Build | `npm run build` | `ƒ /api/decks/[deckId]/export`, `ƒ /explore` |
| Live | `npm run ai:generation` | passes; `exemplar_gaps` recorded on the generated drills |
| UAT — trash | Delete a deck → **Undo** in the toast | Deck and row return; the due counts on dashboard and palette include it again |
| UAT — trash | Delete → reload → Recently deleted → Restore / Delete forever | Restore brings it back; Delete forever removes cards (`select count(*) from cards where deck_id = …` → 0) |
| UAT — trash scope | Trash a deck that has due drills | The dashboard's drills-due reading drops by that deck's count |
| UAT — duplicate | Duplicate a deck with embeddings | New deck, same card count, all `new`, chat answers from it with **no** embedding sync |
| UAT — merge | Merge A into B | B has both card sets and A's quiz-proven states; A is in the trash; A's drills archived |
| UAT — export | Export CSV → open in Excel and in Sheets | UTF-8 intact; question/answer columns the right way round; a card starting with `=` shows literally |
| UAT — export | Export for Anki → Anki desktop 2.1.55+ → File → Import | Notes land in `Cognit::<title>`, math renders, re-import says "updated", not "added" |
| UAT — concept map | Insights on a deck with ≥ 3 attempted drills; Tab through nodes | Each node announces its relations; focus ring visible; Enter opens a review of that card; below `md` a list renders instead |
| UAT — voice | Chrome desktop: **Dictate** → speak → **Stop** | Text lands at the caret (or in Claim when no slot had focus); Firefox shows no button |
| UAT — directory | `EXPLORE_ENABLED=true`: list a shared deck; open `/explore` signed out | Listed deck visible; unsharing removes it at once; no owner identity anywhere in the payload |

---

## 5. Phase 2 — UI/UX refinement and ergonomic polish

No migrations. The new components here — `ChartDataTable`, the rebuilt `RetrievabilityHistogram`, `TopicHeatmap` as a table, `ShortcutHint`, and the `LazyMotion` change — were compiled, linted and built, and the bundle saving in §5.6 is measured, not estimated. The inline patterns for `SynthesisDrillClient` (MOB-04 in §5.1, focus and announcements in §5.2) are sketches against its current state and were not compiled; they are marked where they appear.

### 5.1 Mobile canvas — MOB-01 · MOB-03 · MOB-04 · A11Y-07

**MOB-01 — iOS zoom, fixed where no `className` can undo it.** The primitives already set 16 px below `sm` (`input.tsx:21–26`, `textarea.tsx`), and five components override them for density. Patching the five fixes today; a guard at the platform level fixes tomorrow:

```css
/* src/app/globals.css
 * iOS Safari zooms any focused text field under 16px and does not zoom back
 * (input.tsx documents it). Components keep overriding the primitives'
 * 16px-on-mobile rule for density — the drill slots at 15px, the "unfair"
 * note at 12px — so the guard lives here, where no className can undo it.
 * `-webkit-touch-callout` exists only in iOS Safari: nothing else changes.
 */
@supports (-webkit-touch-callout: none) {
  input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='color']):not([type='file']),
  textarea,
  select {
    font-size: max(16px, 1em) !important;
  }
}
```

No text field in the app is styled above 16 px (checked), so `max(16px, 1em)` only ever enlarges. Then tidy the sources, so desktop density is expressed only at `sm:`:

| File | Before | After |
|---|---|---|
| `AnswerForm.tsx:32–33`, `PlanForm.tsx:26–27` (`SLOT_CLASS`) | `text-[15px] sm:text-[15px]` | `text-base sm:text-[15px]` |
| `CheckFeedback.tsx:89` | `h-[28px] … text-[12px] sm:text-[12px]` | `h-[44px] text-base sm:h-[28px] sm:text-[12px]` |
| `QuestionBankForm.tsx:62` | `text-[13px]` | `text-base sm:text-[13px]` |
| `ExamDateControl.tsx:71` | `h-[28px] … text-xs` | `h-[44px] text-base sm:h-[28px] sm:text-xs` |

**A11Y-07 — targets.** The design system (§9) says 44 × 44 px; WCAG 2.2 SC 2.5.8 says at least 24 px. The confidence picker, which every check requires, is 28 px.

| Control | Change |
|---|---|
| `ConfidencePicker` buttons | `h-[44px] sm:h-[28px]` |
| `CheckFeedback` Fair / Unfair / Send, worked-example Hide | `h-[44px] sm:h-[24px]` |
| `ExamDateControl` Save / Clear / Cancel / Change | `h-[44px] sm:h-[26px]` |
| `.term-chip` | `@media (pointer: coarse) { .term-chip { height: 40px; padding: 0 12px; } }` — 40 px plus the 8 px gap meets 44 px of spacing |

**MOB-04 — the keyboard and the sticky action row.** Two parts:

1. **Android.** Add `interactiveWidget: 'resizes-content'` to `export const viewport` in `layout.tsx`; Next 16's `Viewport` type accepts it (`extra-types.d.ts:53`). Chrome on Android then shrinks the layout viewport when the keyboard opens, so `sticky bottom-0` sits above the keyboard instead of under it.
2. **iOS**, which ignores that hint. While a slot has focus on a coarse pointer, the sticky row shows only **Check**, and the confidence picker renders inline after the last slot:

```tsx
// SynthesisDrillClient.tsx — sketch (not compiled)
const [typing, setTyping] = useState(false);
const coarse = useSyncExternalStore(
  (notify) => {
    const query = window.matchMedia('(pointer: coarse)');
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  },
  () => window.matchMedia('(pointer: coarse)').matches,
  () => false,
);
// on the canvas wrapper (a <div> after A11Y-01):
//   onFocus={(event) => setTyping(isTypingTarget(event.target))}
//   onBlur={() => setTyping(false)}
const compactActions = coarse && typing && phase === 'answering';
// actions row: {compactActions ? <CheckButton /> : <>…ConfidencePicker, Skip, Check…</>}
// after the form: {compactActions ? <ConfidencePicker … /> : null}
```

**MOB-03.** `DrillSessionSummary.tsx:78`: `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`.

### 5.2 Focus and screen-reader flow — A11Y-01 · 02 · 03 · 04 · 08 · 09 · 10 · 11 · UX-04

| ID | Change |
|---|---|
| A11Y-01 | `(focus)/layout.tsx` already provides `role="main"`. The inner `<main>` in `SynthesisDrillClient.tsx:708`, `FlashcardReviewClient.tsx:844` and `QuizAssessmentClient.tsx:709` becomes a `<div>` (clears axe `landmark-main-is-top-level` and `landmark-no-duplicate-main`). |
| A11Y-02 | Slots take `readOnly={locked}` instead of `disabled={locked}`, and the `.raised` form container gets `aria-busy={locked}`. A read-only field keeps focus through the check; chips and buttons stay `disabled`. |
| A11Y-02 | Restore focus on every phase change, not only success (below). |
| A11Y-03 | One persistent live region announces phase changes; the ticking counter is `aria-hidden` (below). |
| A11Y-04 | `DrillResult` gains `idPrefix?: string` (default `'drill'`, so `#drill-verdict` still resolves) and `plane?: 'raised' \| 'well'` (default `'raised'`). `DrillSessionSummary` passes `idPrefix={\`sprint-${entry.drillId}\`}` and `plane="well"`: unique IDs, correct accessible names, one `.raised` per screen. |
| A11Y-08 | Term chips drop `aria-pressed` (an insert action is not a toggle) and take `aria-label={named ? \`Insert ${term} — already in your answer\` : \`Insert ${term}\`}`. |
| A11Y-09 | `QuestionRowActions` gains `questionText` and labels its button `` `Remove question: ${questionText.slice(0, 60)}` ``. |
| A11Y-10 | The Check button gets `aria-keyshortcuts="Meta+Enter Control+Enter"` and shows `<ShortcutHint apple="⌘⏎" other="Ctrl ⏎" />`. |
| A11Y-11 | A blocked **⌘⏎** says why, in the live region and a toast: "Write a claim first.", "Over the word limit — trim to N words.", or (already present) "How sure? Pick one". |
| UX-04 | Fixed with dictation (§4.4): an insert with no focused slot lands in the first slot. |

```tsx
// SynthesisDrillClient.tsx — focus restoration and announcements (A11Y-02, A11Y-03) — sketch (not compiled)
const restoreFocusRef = useRef<HTMLElement | null>(null);
const [announcement, setAnnouncement] = useState('');

// check(): before setPhase('checking')
restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
setAnnouncement('Checking your answer.');

// every failure path in check(), after setPhase('answering'):
requestAnimationFrame(() => restoreFocusRef.current?.focus());
setAnnouncement('The check did not come back. Your answer is still here.');

// revise() and retryInPlace(), after setPhase('answering'):
requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-slot="first"]')?.focus());

// thresholds, announced once each instead of every second:
useEffect(() => {
  if (phase !== 'checking') return;
  const slow = window.setTimeout(() => setAnnouncement('Still checking.'), SLOW_CHECK_MS);
  const verySlow = window.setTimeout(() => setAnnouncement('Taking longer than usual. Your answer is saved in this tab.'), VERY_SLOW_CHECK_MS);
  return () => { window.clearTimeout(slow); window.clearTimeout(verySlow); };
}, [phase]);

// rendered once, always mounted:
<p className="sr-only" aria-live="polite">{announcement}</p>
// the visible "Checking · 3s" span: aria-hidden="true", aria-live removed
// the first slot of AnswerForm and PlanForm: data-slot="first"
```

```tsx
// src/components/ui/ShortcutHint.tsx (compiled)
'use client';

import { useEffect, useState } from 'react';
import { Kbd } from '@/components/ui/Kbd';

/**
 * A keycap that matches the keyboard in front of the user (plan §5.2,
 * A11Y-10): ⌘ on Apple platforms, Ctrl elsewhere. Decorative — the control
 * carries `aria-keyshortcuts` — so it is hidden from assistive technology.
 * Starts as the Apple form on the server and the first client render, then
 * corrects itself after mount, so hydration never disagrees.
 */
export function ShortcutHint({ apple, other }: { apple: string; other: string }) {
  const [isApple, setIsApple] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <Kbd aria-hidden="true">{isApple ? apple : other}</Kbd>;
}
```

### 5.3 Charts — A11Y-05 · A11Y-06 · MOB-02 · UX-05

**One rule: SVG or flex for geometry, HTML for type, a table for assistive technology.** Geometry may stretch with the panel; text never does.

```tsx
// src/components/ui/shared/analytics/ChartDataTable.tsx (compiled)
/**
 * A chart's numbers as a real table, for assistive technology (plan §5.3).
 * The picture is `aria-hidden`; this is what a screen reader reads, and it
 * can be navigated cell by cell — which a `role="img"` label cannot.
 */
export function ChartDataTable({ caption, columns, rows }: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => <th key={column} scope="col">{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (cellIndex === 0 ? <th key={cellIndex} scope="row">{cell}</th> : <td key={cellIndex}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```tsx
// src/components/ui/shared/analytics/RetrievabilityHistogram.tsx — replaces the SVG version (compiled)
import type { retrievabilityHistogram } from '@/lib/analytics';
import { ChartDataTable } from '@/components/ui/shared/analytics/ChartDataTable';

type Bar = ReturnType<typeof retrievabilityHistogram>[number];

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The forgetting-curve forecast (improvement plan §4.1): ten bars of
 * predicted recall over every review-state card. Bars below 80 % take
 * `--state-due` — that IS a state — the rest stay ink.
 *
 * Geometry stretches with the panel; type does not (plan §5.3, MOB-02). The
 * bars are flex items and the labels are HTML at the 10 px label step, so a
 * phone never gets 7.7 px axis text and a wide panel never gets 25 px. The
 * picture is aria-hidden; the numbers are in a real table.
 */
export function RetrievabilityHistogram({ bars }: { bars: Bar[] }) {
  const peak = Math.max(1, ...bars.map((bar) => bar.cards));
  const total = bars.reduce((sum, bar) => sum + bar.cards, 0);

  if (total === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        No reviewed cards yet — the curve appears once cards reach the review state.
      </p>
    );
  }

  const atRisk = bars.filter((bar) => bar.atRisk).reduce((sum, bar) => sum + bar.cards, 0);

  return (
    <figure className="mt-3">
      <div className="flex h-[120px] items-end gap-[6px]" aria-hidden="true">
        {bars.map((bar) => (
          <span
            key={bar.bucket}
            title={`${bar.label}: ${bar.cards} ${bar.cards === 1 ? 'card' : 'cards'}`}
            className="block flex-1 rounded-t-[2px]"
            style={{
              height: bar.cards === 0 ? '2px' : `${Math.max(3, (bar.cards / peak) * 100)}%`,
              backgroundColor: bar.cards === 0 ? 'var(--border)' : bar.atRisk ? 'var(--state-due)' : 'var(--ink-dim)',
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-[6px]" aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={bar.bucket} className={`flex-1 text-center tnum ${LABEL}`}>
            {index % 3 === 0 || index === bars.length - 1 ? `${bar.label.split('–')[0]}%` : ''}
          </span>
        ))}
      </div>
      <ChartDataTable
        caption={`Predicted recall of ${total} reviewed cards; ${atRisk} below 80 percent.`}
        columns={['Predicted recall', 'Cards']}
        rows={bars.map((bar) => [bar.label, bar.cards])}
      />
      <figcaption className={`mt-1 flex items-center gap-4 ${LABEL}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-due)]" aria-hidden="true" />
          Below 80% · likely to lapse
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--ink-dim)]" aria-hidden="true" />
          Holding
        </span>
      </figcaption>
    </figure>
  );
}
```

**`RetentionTrend`.** Keep the SVG for the line only, with a fixed `h-[110px] w-full`, `preserveAspectRatio="none"` and `vectorEffect="non-scaling-stroke"` on the path and the 85 % hairline. Move the week labels and the "85% target" text to HTML, render the dots as absolutely positioned 5 px spans at `left: x/width·100%`, `top: y/height·100%` (a stretched `<circle>` becomes an ellipse), and add a `ChartDataTable` with week × reviews × retention.

**`DrillSignals` sparkline.** Same treatment, plus UX-05: start a new `M` segment after any day with no attempts, so the line no longer claims continuity it does not have.

```tsx
// src/components/ui/shared/analytics/TopicHeatmap.tsx — a real table (compiled; A11Y-06)
import Link from 'next/link';
import { topicTone, type TopicMastery } from '@/lib/analytics';

const TONE_COLOR = {
  mastered: 'var(--state-mastered)',
  lapsed: 'var(--state-lapsed)',
  ink: 'var(--ink)',
} as const;

const HEAD = 'py-2 text-right font-mono text-[10px] font-normal uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const CELL = 'py-2.5 text-right font-mono text-[13px] tnum';

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Topic mastery as a real table (plan §5.3, A11Y-06): a screen reader gets
 * column headers for every number, and the headers stay visible on a phone —
 * where Unseen and Ease drop out rather than the meaning of the rest.
 * The row's hue is a state (mastered or lapsing), and only its tick and its
 * one number carry it (§2.2).
 */
export function TopicHeatmap({ topics }: { topics: TopicMastery[] }) {
  if (topics.length === 0) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        Topics appear once enriched cards carry tags — three or more cards per tag.
      </p>
    );
  }

  return (
    <div className="well mt-3 overflow-x-auto px-3.5">
      <table className="w-full border-collapse">
        <caption className="sr-only">Topic mastery: cards, unseen cards, lapse rate, mastered share and mean ease per topic</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={`${HEAD} text-left`}>Topic</th>
            <th scope="col" className={HEAD}>Cards</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>Unseen</th>
            <th scope="col" className={HEAD}>Lapse</th>
            <th scope="col" className={HEAD}>Mastered</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>Ease</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => {
            const tone = topicTone(topic);
            const href = topic.deck_id ? `/dashboard/${topic.deck_id}/study?scope=unmastered_only` : null;
            return (
              <tr key={topic.tag} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-4 w-[2px] shrink-0 rounded-[1px]"
                      style={{ backgroundColor: tone === 'ink' ? 'var(--border-strong)' : TONE_COLOR[tone] }}
                    />
                    {href ? (
                      <Link
                        href={href}
                        className="truncate rounded-[var(--radius-control)] text-sm text-ink underline-offset-[3px] outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        title={`Review unmastered ${topic.tag} cards`}
                      >
                        {topic.tag}
                      </Link>
                    ) : (
                      <span className="truncate text-sm text-ink">{topic.tag}</span>
                    )}
                  </span>
                </th>
                <td className={`${CELL} text-ink-dim`}>{topic.cards}</td>
                <td className={`${CELL} hidden text-ink-dim sm:table-cell`}>{topic.unseen}</td>
                <td className={CELL} style={{ color: tone === 'lapsed' ? TONE_COLOR.lapsed : 'var(--ink-dim)' }}>{pct(topic.lapse_rate)}</td>
                <td className={CELL} style={{ color: tone === 'mastered' ? TONE_COLOR.mastered : 'var(--ink-dim)' }}>{pct(topic.mastered_share)}</td>
                <td className={`${CELL} hidden text-ink-dim sm:table-cell`}>{topic.mean_ease === null ? '—' : topic.mean_ease.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### 5.4 Design-system conformance — Rev. D addendum and DS-02…07

The synthesis surfaces already map verdicts onto the state channel consistently (`VERDICT_TICK`, `BAND_TICK`, `LINK_TICK`, `linksTone` in `src/lib/synthesis/ui.ts`), but `COGNIT_DESIGN_SYSTEM.md` §2.2 still says hue is reserved *exclusively* for SM-2 state. Every synthesis surface is therefore technically in violation of a rule the product has outgrown. Codify what is right, and fix what is not.

**Append to `COGNIT_DESIGN_SYSTEM.md` as Rev. D:**

```markdown
### 2.2c Synthesis on the state channel (Rev. D)

A synthesis verdict is a fact about the student's memory of a *relation*,
so it may use the state channel — through this mapping only:

| Fact | State |
|---|---|
| Verdict `sound` · link `covered` · plan band `strong` · relation holds | `--state-mastered` |
| Verdict `partial` · link `partial` · plan band `developing` · relation keeps going missing | `--state-due` |
| Plan band `secure` | `--state-learning` |
| Verdict `contradicted` · a contradicted card | `--state-lapsed` |
| Verdict `off_target` · link `missing` · relation untested | no hue (neutral or an empty tick) |

### 2.2d Errors
Error text and destructive confirmations use `--destructive` (= `--state-lapsed`).
Nothing else borrows it.

### 2.2e Time is not memory
Timers, countdowns and dates stay `--ink`. Urgency is a word ("last minute",
"exam today"), never a hue.
```

**Then make the code agree:**

| ID | Site | Change |
|---|---|---|
| DS-02 | Sprint timer (`SynthesisDrillClient.tsx:700`) | `tone="ink"`; under a minute, append "· last minute" |
| DS-02 | Exam countdown (`ExamDateControl.tsx:91`) | ink; the phrase already carries the urgency |
| DS-02 | "Deck lacks" chips (`QuestionBank.tsx:46`) | ink chips under their existing label |
| DS-02 | Revision diff (`DrillResult.tsx:262–275`) | `<ins>` / `<del>` with ink decoration — assistive technology can announce them |
| DS-03 | `MasteryConfetti` (canvas loop, indigo / cyan / pink) | Remove. The quiz completion screen's count-up is the moment (§1.1 bans per-frame loops and chromatic decoration on authenticated surfaces) |
| DS-04 | `LandingBackground.tsx:371` `z-50` | add `--z-grain: 50` to the §4.4 scale; use `z-[var(--z-grain)]` |
| DS-05 | 17 hard-coded ≥ 24 px sizes | add readout steps (below) and consume them |
| DS-06 | `text-muted-foreground` | `--muted-foreground` is already `var(--ink-dim)`, so a no-op rename: `rg -l "text-muted-foreground" src \| xargs sed -i '' 's/text-muted-foreground/text-ink-dim/g'` |
| DS-07 | `<Toaster richColors>` | drop `richColors` — `.sonner-toast` pins every color with `!important` |

```css
/* globals.css — numeric readout steps (DS-05): Geist Mono, tabular, off the serif scale */
:root {
  --type-readout-lg: 3.25rem;  /* 52px — due-now hero number */
  --type-readout:    2.75rem;  /* 44px — deck launcher */
  --type-readout-sm: 2rem;     /* 32px — signal panel */
}
@utility type-readout-lg { font-family: var(--font-mono); font-size: var(--type-readout-lg); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
@utility type-readout    { font-family: var(--font-mono); font-size: var(--type-readout);    line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
@utility type-readout-sm { font-family: var(--font-mono); font-size: var(--type-readout-sm); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

DS-01 — the Insights segment's missing `.raised` — is resolved by the concept map (§4.3).

### 5.5 Information architecture — UX-01 · UX-02 · UX-03

1. **An "Exam" segment (UX-01).** `DECK_TABS` becomes `['overview', 'cards', 'insights', 'exam', 'chat']`. The Exam segment holds `ExamDateControl`, `QuestionBank` and the plan launcher. Overview keeps one line, and only when there is an exam date or a saved question: "Exam in 4 days · 6 questions · Prepare →". A deck without an exam no longer carries a paste-your-past-papers form on its front page.
2. **One meaning per word (UX-02).** In the deck header, drop "Proven x/y" — it is "Mastery %" again — and rename "Mastery" to **"Quiz-proven"**, because it is `card_mastery_state.correct`, not SM-2. "Mastered" then means one thing everywhere: SM-2 interval ≥ 21 days, as on the Stats page. Only that reading may take `--state-mastered`.
3. **Stats empty state (UX-03).** When `!hasHistory`, render the header, the "not enough history" panel and Collection by interval — not four empty charts beneath a message saying they are empty.

### 5.6 Bundle — PERF-01 · PERF-02 · PERF-03

**PERF-01 — measured.** The change:

```ts
// src/components/motion-features.ts (new)
import { domMax } from 'framer-motion';

/**
 * Framer Motion's feature set, in its own module so MotionProvider can load
 * it with a dynamic import — a static `domMax` import puts the whole feature
 * set into every route's first load, which is what LazyMotion exists to avoid.
 */
export default domMax;

// src/components/MotionProvider.tsx
import { LazyMotion } from 'framer-motion';
const loadFeatures = () => import('./motion-features').then((mod) => mod.default);
// …
<LazyMotion features={loadFeatures} strict>
```

Its effect, built and measured:

| Route (first-load JS, gzip) | Before | After | Δ |
|---|---|---|---|
| `/dashboard/[deckId]` | 315.4 kB | 293.6 kB | −21.8 |
| `/dashboard` | 300.0 | 273.0 | −27.0 |
| `/dashboard/stats` | 281.6 | 254.6 | −27.0 |
| `/login` | 275.4 | 248.4 | −27.0 |
| `/dashboard/[deckId]/synthesis` | 234.5 | 207.4 | −27.1 |
| `/dashboard/[deckId]/quiz` | 224.3 | 197.2 | −27.1 |
| `/dashboard/[deckId]/study` | 219.1 | 193.6 | −25.5 |
| `/` | 209.8 | 182.8 | −27.0 |
| `/s/[token]` | 207.0 | 185.4 | −21.6 |

Drag — swipe-to-grade, the reason `domMax` rather than `domAnimation` — works once the features resolve, milliseconds after hydration. G2 includes a swipe check.

**PERF-02 — zod in the browser.** `LoginClient`, `update-password/page`, `AddCardForm` and `CreateDeckModal` import `@/lib/schemas`, which carries full zod v4 into the login and shell bundles. The server actions revalidate every input anyway, so give the four forms small hand-written checks (required, length, email shape) and keep zod server-side. If shared messages matter, move those four schemas to `zod/mini` in `src/lib/schemas.client.ts`. Measure with the budget script below; the zod + Radix chunk is 62.6 kB gz.

**PERF-03 — the duplicated chunk.** The login group and the shell group each get their own 62.6 kB-gz zod + Radix chunk (same length, different minification), so signing in downloads it twice. PERF-02 removes most of it; for the Radix remainder, keep both groups' imports on the same entry points (`radix-ui` vs `@radix-ui/react-*`) so the bundler can share one chunk.

**Budgets as a gate.** Commit this audit's report script as `scripts/bundle-report.mjs` (Appendix A.6 — it supports `--budgets` and exits 1 on any overrun, tested both ways), plus `scripts/bundle-budgets.json` and a CI step after `npm run build`:

```json
{ "/login/page": 255, "/dashboard/(shell)/page": 280, "/dashboard/(shell)/[deckId]/page": 300, "/dashboard/(focus)/[deckId]/study/page": 200, "/dashboard/(focus)/[deckId]/synthesis/page": 215, "/page": 190 }
```

```yaml
      - name: Bundle budgets
        run: node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json
```

These budgets are the measured post-PERF-01 sizes plus 5–8 kB, and they pass on that build. When PERF-02 lands, rebuild, rerun the report and lower each budget to the new size plus 5 kB. A budget file naming an unknown route also fails, so renames cannot silently drop a check.

### 5.7 Gate G2

| Check | How | Pass |
|---|---|---|
| Unit + build | `npm test && npm run build` | green |
| Bundle | `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json` | "All routes within budget"; after PERF-02 the budgets have been lowered to the new sizes + 5 kB |
| Contrast | `npm run contrast` | unchanged: every token clears |
| axe | axe DevTools on `/dashboard/stats`, `/dashboard/[deckId]?tab=insights`, the drill canvas in every phase, and the sprint summary | 0 violations of `landmark-*`, `duplicate-id-aria`, `aria-allowed-attr`, `label` |
| VoiceOver / NVDA | Drill canvas: write → ⌘⏎ → wait 12 s → verdict | Hears "Checking your answer", then "Still checking" once, then the verdict heading — no per-second chatter |
| VoiceOver / NVDA | Stats: forecast chart | Reads the table caption and ten recall/card rows |
| Focus | Fail a check (DevTools offline), then Revise, then Try again | Focus returns to the slot each time — never `<body>` |
| iOS Safari (device) | Tap every text field on the drill canvas, plan form, question bank, "unfair" note, exam date | No zoom |
| Android Chrome | Type in a drill slot | The action row sits above the keyboard |
| Touch | Confidence picker, Fair/Unfair, exam controls on a phone | Each ≥ 44 px tall |
| Swipe | Study: swipe to grade immediately after load | Works (async motion features) |
| Visual, both themes | Stats (HTML-typed charts), Insights (concept map as `.raised`), exam segment | Matches the design system; no state hue on a timer, countdown or error-free text |

---

## 6. Phase 3 — Production infrastructure and platform upgrades

### 6.1 `@google/genai` — the SDK migration

**Why now.** `@google/generative-ai` 0.24.1 is Google's superseded SDK. The code already carries its workarounds: a request-level `generationConfig` that *replaces* the model-level one (`_shared.ts:104–118`), and fields 0.24 never typed (`ai-generate.ts:232`, `ai-enrich.ts:37`). Execution plan D20 deferred this migration "until the live gate exists"; the gates exist now (`ai:smoke`, `ai:generation`, `ai:calibrate`, and `ai:retrieval` from §3.5).

**What was verified.** The adapter below typechecks against **`@google/genai` 2.24.0**. A live call proved that `embedContent` returns one vector per `Content` and that the vectors are **identical** to the legacy SDK's (cosine 1.000000), so stored embeddings stay valid and nothing is re-embedded.

```ts
// src/lib/ai/gemini.ts
import 'server-only';
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Schema,
} from '@google/genai';
import { getServerEnv } from '@/lib/env-server';

/*
 * The single seam between Cognit and the Gemini SDK (plan §6.1). Call sites
 * import these four functions, never '@google/genai' itself, so the next SDK
 * change is one file. Schemas move from the legacy `SchemaType.*` (lowercase
 * values) to `Type.*` (uppercase) in the same change.
 */

export type ThinkingEffort = 'none' | 'low' | 'high';
export type ModelFamily = '2.5' | '3';

export const EMBEDDING_DIMENSIONS = 768;
/** The Gemini API batches at most 100 texts per embedding request. */
const MAX_EMBED_BATCH = 100;

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: getServerEnv().GEMINI_API_KEY });
  return client;
}

/**
 * Generation config is dialect-aware (execution plan D1): 3.x takes a
 * thinking LEVEL and rejects a budget; 2.5 takes a budget. `none` on 3.x
 * omits the field (model default), as the legacy path does — `MINIMAL` is
 * the candidate to evaluate with `npm run ai:calibrate` before adopting.
 */
export function thinkingConfigFor(family: ModelFamily, effort: ThinkingEffort): GenerateContentConfig['thinkingConfig'] {
  if (family === '3') {
    return effort === 'none' ? undefined : { thinkingLevel: effort === 'low' ? ThinkingLevel.LOW : ThinkingLevel.HIGH };
  }
  return { thinkingBudget: effort === 'none' ? 0 : effort === 'low' ? 1024 : 8192 };
}

export type JsonRequest = {
  model: string;
  family: ModelFamily;
  systemInstruction: string;
  userText: string;
  responseSchema: Schema;
  temperature: number;
  maxOutputTokens: number;
  thinking?: ThinkingEffort;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** One schema-constrained JSON generation. The caller parses `response.text` with its zod schema. */
export async function generateJson(request: JsonRequest): Promise<GenerateContentResponse> {
  return ai().models.generateContent({
    model: request.model,
    contents: [{ role: 'user', parts: [{ text: request.userText }] }],
    config: {
      systemInstruction: request.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: request.responseSchema,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      thinkingConfig: thinkingConfigFor(request.family, request.thinking ?? 'none'),
      abortSignal: request.signal,
      httpOptions: request.timeoutMs ? { timeout: request.timeoutMs } : undefined,
    },
  });
}

export type StreamRequest = {
  model: string;
  systemInstruction: string;
  contents: Content[];
  temperature: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

/** Deck chat's token stream (src/app/api/chat/route.ts). */
export async function* streamText(request: StreamRequest): AsyncGenerator<string> {
  const stream = await ai().models.generateContentStream({
    model: request.model,
    contents: request.contents,
    config: {
      systemInstruction: request.systemInstruction,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      abortSignal: request.signal,
    },
  });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

/**
 * Embeddings, one request per 100 texts. Each text is its own `Content` —
 * a bare string[] would read as the parts of ONE content.
 */
export async function embed(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[][]> {
  const model = getServerEnv().GEMINI_EMBEDDING_MODEL;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_EMBED_BATCH) {
    const slice = texts.slice(i, i + MAX_EMBED_BATCH);
    const response = await ai().models.embedContent({
      model,
      contents: slice.map((text) => ({ role: 'user', parts: [{ text }] })),
      config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const vectors = (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
    if (vectors.length !== slice.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error(`Embedding batch invalid: expected ${slice.length}×${EMBEDDING_DIMENSIONS}.`);
    }
    out.push(...vectors);
  }
  return out;
}
```

**Call-site mapping** — 15 `generateContent`, 1 `generateContentStream`, 1 `batchEmbedContents`, across 7 files:

| Legacy (0.24) | New |
|---|---|
| `getGeminiJsonModel(…).generateContent({ systemInstruction, generationConfig, contents }, { timeout })` | `generateJson({ model, family, systemInstruction, userText, responseSchema, temperature, maxOutputTokens, thinking, timeoutMs, signal })` |
| `result.response.text()` | `response.text` (a getter; may be `undefined`) |
| `result.response.candidates?.[0]?.finishReason` / `FinishReason.STOP` | the same path and enum name, imported from `@google/genai` |
| `result.response.usageMetadata?.promptTokenCount` / `candidatesTokenCount` / `thoughtsTokenCount` | unchanged names on `response.usageMetadata` |
| `SchemaType.OBJECT` (value `'object'`) | `Type.OBJECT` (value `'OBJECT'`) — every schema in `synthesis/schemas.ts`, `ai-generate.ts`, `ai-enrich.ts` |
| `model.generateContentStream(…)` + `for await (const chunk of result.stream)` | `for await (const text of streamText(…))` |
| `model.batchEmbedContents({ requests })` | `embed(texts, taskType)` |
| `TaskType.RETRIEVAL_DOCUMENT` | the string `'RETRIEVAL_DOCUMENT'` |

**Make the retry classifier SDK-proof first — a behavior trap, caught while writing this plan.** `classifyAiError` (`ai-retry.ts:33`) matches error *messages*: "429", "quota", "timeout", "deadline". Under `@google/genai`, a request that passes `httpOptions.timeout` is aborted, and its error says neither "timeout" nor "deadline". It would be classified `unknown` and **retried** — silently breaking the synthesis check's deliberate `shouldRetry: kind !== 'timeout'`, so a student would wait out a second 8 s deadline. Classify by numeric `status` (both SDKs' errors carry one) and by abort, before the message fallback. Implemented and tested: the existing 14 retry tests plus 2 new ones pass, and so does the full suite.

```ts
// src/lib/ai-retry.ts — before the existing message matching, which stays as the fallback
/**
 * The HTTP status when the SDK error carries one — both the legacy
 * GoogleGenerativeAIFetchError and @google/genai's ApiError do (plan §6.1).
 */
function statusOf(error: unknown): number | null {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === 'number' ? status : null;
}

export function classifyAiError(error: unknown): AiFailureKind {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();

  if (error instanceof SyntaxError) return 'malformed_output';
  // @google/genai aborts a request that passes httpOptions.timeout; its
  // message says neither "timeout" nor "deadline".
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timeout';
  const status = statusOf(error);
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'unauthenticated';
  if (status === 400) return 'bad_request';
  if (status === 408 || status === 504) return 'timeout';
  if (status !== null && status >= 500) return 'unavailable';
  // …the existing message matching, unchanged
```

```ts
// src/lib/ai-retry.test.ts — appended
describe('classifyAiError — status and abort first (plan §6.1)', () => {
  it('reads a numeric status the way @google/genai ApiError carries it', async () => {
    const { classifyAiError } = await import('@/lib/ai-retry');
    const apiError = (status: number) => Object.assign(new Error('{"error":{"message":"…"}}'), { status });
    expect(classifyAiError(apiError(429))).toBe('rate_limited');
    expect(classifyAiError(apiError(403))).toBe('unauthenticated');
    expect(classifyAiError(apiError(400))).toBe('bad_request');
    expect(classifyAiError(apiError(504))).toBe('timeout');
    expect(classifyAiError(apiError(503))).toBe('unavailable');
  });

  it('treats an aborted request as a timeout, so the check still does not retry it', async () => {
    const { classifyAiError } = await import('@/lib/ai-retry');
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(classifyAiError(abort)).toBe('timeout');
  });
});
```

`withGeminiRetry` then wraps the adapter calls unchanged. The chat stream already checks `abort.signal.aborted` before classifying, so a user's cancel is never mistaken for a timeout.

**Order of work** — one pull request each, and each gated by `npm run ai:gate && npm run ai:calibrate && npm run ai:retrieval`:

1. Land the status-first `classifyAiError` (above) on its own. Then install `@google/genai` beside the legacy SDK and add the adapter.
2. Embeddings (parity already proven): `embeddings.ts` delegates to `embed`.
3. Enrichment and card generation (`ai-enrich.ts`, `ai-generate.ts`).
4. Mnemonic and hints (`ai-assist.ts`, `mnemonic.ts`).
5. Synthesis generation and check — the calibration set decides.
6. The chat stream.
7. Remove `@google/generative-ai`. `rg -n "@google/generative-ai" src` must return nothing.
8. Evaluate `ThinkingLevel.MINIMAL` in place of omission for `none` on 3.x — adopt only if `ai:calibrate` holds.

### 6.2 Nonce-based CSP — SEC-01

**Verified on a running `next start`, in both rollout modes** (Appendix A.8):

| Mode | `/` (static) | `/s/<token>` (dynamic) | Strict policy covers |
|---|---|---|---|
| Report-only (default) | baseline enforced | baseline enforced **+** strict report-only | 15/15 scripts |
| `CSP_ENFORCE=true` | baseline enforced | strict enforced (replaces the baseline) | 15/15 scripts |

**Two lessons from the test runs are built into the design.**

1. **The baseline stays in `next.config.ts`.** The first design moved the whole CSP into the proxy, which would have left production with *no enforced policy* during the report-only week.
2. **The proxy must never set a nonce-less enforcing header on a nonce route.** Next reads the nonce from the proxy's *response* CSP header as well as the request override; the second design enforced the baseline from the proxy, and Next stamped 0 of 15 scripts.

The shipped design keeps the baseline where it is, and the proxy adds exactly one strict header on nonce routes.

**Hashing the theme script.** Next stamps nonces only on its own scripts, so the root layout's inline theme bootstrap is allowed by **hash**. The script moves into a module, and the proxy hashes that same string, so the two cannot drift.

```ts
// src/lib/theme-script.ts
/**
 * Runs before first paint to prevent a theme flash (F-10). An explicit stored
 * choice always wins; with no stored value we follow the OS.
 *
 * Kept in its own module because the Content-Security-Policy allows it by
 * HASH (src/lib/csp.ts hashes this exact string): edit it here and the hash
 * follows, with no second copy to forget.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('cognit-theme');var d=t==='dark'||(t!=='light'&&!window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}})()`;
```

```ts
// src/lib/csp.ts
import { createHash } from 'node:crypto';
import { THEME_BOOTSTRAP } from '@/lib/theme-script';

/*
 * Content-Security-Policy (plan §6.2). Two policies:
 *
 *   nonce    dynamic routes (/dashboard, /s/): `'nonce-…' 'strict-dynamic'`.
 *            Next.js stamps the nonce on its own scripts when it finds it in
 *            the REQUEST's CSP header; the theme bootstrap is allowed by
 *            hash. No 'unsafe-inline' for scripts.
 *   legacy   prerendered routes (/, the static login pages): their HTML is
 *            built once and cannot carry a per-request nonce, so they keep
 *            the previous policy until they are made dynamic.
 *
 * Rollout (CSP_ENFORCE): until it is 'true', every route keeps ENFORCING the
 * legacy policy from next.config.ts and nonce routes additionally REPORT the
 * strict one; after it, nonce routes ENFORCE the strict policy.
 *
 * Styles keep 'unsafe-inline': React `style={…}` attributes are everywhere
 * and a nonce cannot cover attributes.
 */

const THEME_HASH = `'sha256-${createHash('sha256').update(THEME_BOOTSTRAP).digest('base64')}'`;

/** Route prefixes rendered per request, so their HTML can carry the nonce. */
export const NONCE_ROUTES = ['/dashboard', '/s/'] as const;

export const CSP_ENFORCE = process.env.CSP_ENFORCE === 'true';

export function wantsNonce(pathname: string): boolean {
  return NONCE_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

export function buildCsp(options: { nonce: string | null; supabaseOrigin: string; dev: boolean }): string {
  const scriptSrc = options.nonce
    ? `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic' ${THEME_HASH}${options.dev ? " 'unsafe-eval'" : ''}`
    : `script-src 'self' 'unsafe-inline'${options.dev ? " 'unsafe-eval'" : ''}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${options.supabaseOrigin} https://*.supabase.co wss://*.supabase.co`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp-report',
  ].join('; ');
}

/**
 * What the proxy sets on a nonce route: the REQUEST header Next reads to
 * stamp its scripts, and the one RESPONSE header for the strict policy —
 * report-only until CSP_ENFORCE, enforcing after. The legacy policy stays in
 * next.config.ts on every route as the baseline, so the report-only week is
 * never weaker than today. Once enforcing, the proxy's header replaces the
 * same-named baseline on nonce routes (measured), so they carry exactly the
 * strict policy.
 *
 * Measured on `next start`: an enforcing CSP set by the proxy on the
 * response is what Next reads for the nonce, so the proxy must never set a
 * nonce-less enforcing header on a nonce route — that is why the baseline
 * lives in next.config.ts, not here.
 */
export function strictCspHeaders(options: { nonce: string; supabaseOrigin: string; dev: boolean; enforce: boolean }) {
  const strict = buildCsp({ nonce: options.nonce, supabaseOrigin: options.supabaseOrigin, dev: options.dev });
  return {
    request: strict,
    responseName: options.enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
    response: strict,
  };
}
```

```ts
// src/proxy.ts — the only change: build the response through `forward()`
import { CSP_ENFORCE, newNonce, strictCspHeaders, wantsNonce } from '@/lib/csp';

const SUPABASE_ORIGIN = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
const DEV = process.env.NODE_ENV !== 'production';

export async function proxy(request: NextRequest) {
  const csp = wantsNonce(request.nextUrl.pathname)
    ? strictCspHeaders({ nonce: newNonce(), supabaseOrigin: SUPABASE_ORIGIN, dev: DEV, enforce: CSP_ENFORCE })
    : null;

  // Next reads the nonce from the REQUEST's CSP header and stamps it on its
  // own scripts; the browser enforces the RESPONSE header. Rebuilt after a
  // cookie refresh so Server Components see the refreshed cookies as well.
  const forward = () => {
    const headers = new Headers(request.headers);
    if (csp) headers.set('content-security-policy', csp.request);
    const response = NextResponse.next({ request: { headers } });
    if (csp) response.headers.set(csp.responseName, csp.response);
    return response;
  };

  let supabaseResponse = forward();
  // …createServerClient unchanged, except setAll() does `supabaseResponse = forward();`
```

```ts
// src/app/layout.tsx
import { THEME_BOOTSTRAP } from '@/lib/theme-script';
// …
<script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
```

```ts
// src/app/api/csp-report/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * CSP violation reports during the report-only week (plan §6.2). Browsers
 * POST `application/csp-report` (report-uri) or `application/reports+json`
 * (report-to); both are logged truncated, never echoed back.
 */
export async function POST(request: NextRequest) {
  const body = (await request.text()).slice(0, 4_000);
  logger.warn('csp', 'violation report', { report: body });
  return new NextResponse(null, { status: 204 });
}
```

**Rollout.**

1. Ship with `CSP_ENFORCE` unset.
2. Watch `csp violation report` in the logs for a week of real traffic — no legitimate violation should appear.
3. Set `CSP_ENFORCE=true`.
4. *Then*, optionally, bring `/login` under the strict policy: `export const dynamic = 'force-dynamic'` in `login/page.tsx` and `'/login'` in `NONCE_ROUTES`. The sign-in form is the page where script injection costs most, and making it dynamic costs one server render per visit.

### 6.3 Auth platform — AUTH-02 · AUTH-03 · AUTH-04

**Move to asymmetric JWT signing keys (AUTH-02).** A configuration change; no code.

1. Supabase Dashboard → Project Settings → JWT Keys → **Migrate JWT secret**. The legacy HS256 secret becomes a *previously used* key, still trusted for verification.
2. **Create a standby key**, ECC P-256 (ES256).
3. **Rotate** the standby key to current. New sessions receive ES256 tokens; existing HS256 tokens stay valid until they expire (≤ 1 h), because the legacy key is still in the verification set.
4. **Verify:** `curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/.well-known/jwks.json" | jq '.keys[].alg'` → `"ES256"`.
5. **Measure** the proxy and render time before and after in Vercel's function logs: the two serial Auth round-trips per navigation disappear, since `getClaims()` now verifies locally with the module-cached JWKS.
6. **Do not revoke the legacy secret** while the anon and service keys are legacy JWTs signed by it. Moving to Supabase's publishable/secret API keys is a separate change.

Then correct `(shell)/layout.tsx:29–30`, which describes the check as local today.

**A forge-proof email claim (AUTH-03, optional).** Enable in Dashboard → Authentication → Hooks → Custom Access Token (parser-checked):

```sql
-- supabase/migrations/202610010910_email_confirmed_claim.sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_confirmed boolean;
begin
  select u.email_confirmed_at is not null
    into v_confirmed
    from auth.users u
   where u.id = (event ->> 'user_id')::uuid;

  v_claims := jsonb_set(v_claims, '{email_confirmed}', to_jsonb(coalesce(v_confirmed, false)));
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
```

`proxy.ts:76` then prefers the top-level claim and falls back to metadata for tokens issued before the hook, over a one-hour window:

```ts
const confirmed = typeof claims.email_confirmed === 'boolean' ? claims.email_confirmed : claims.user_metadata?.email_verified;
```

**One identity path (AUTH-04).** `rg -n "auth\.getUser\(\)" src/app` lists the actions that still call the Auth server directly (`deck.ts:73`, `chat.ts:292`, `api/chat/route.ts:56`, …). Where only identity is needed, replace the call with `getSessionUser()`. Keep `getUser()` only where fresh server-side user data matters, such as `email_confirmed_at` in `login()`.

### 6.4 Read-RPCs — PERF-05 (and PERF-04, conditionally)

**PERF-05 first — it is a correctness issue at scale.** `get_synthesis_insights` computes every reading in one statement, uncapped, with the semantics of `src/lib/synthesis/insights.ts`: weak links ≥ 2 signals; calibration where *fairly sure* always matches; 30 zero-filled UTC days. Parser-checked:

```sql
-- supabase/migrations/202610010900_synthesis_insights_rpc.sql
create or replace function public.get_synthesis_insights(
  p_deck_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  attempts as (
    select a.id, a.drill_id, a.verdict, a.coverage, a.contradictions, a.outside_claims,
           a.missing_card_ids, a.contradicted_card_ids, a.confidence, a.duration_ms, a.created_at
      from public.synthesis_attempts a
     where a.deck_id = p_deck_id
       and a.user_id = (select uid from me)
  ),
  recent as (
    select * from attempts where created_at >= p_now - interval '30 days'
  ),
  signals as (
    select m.card_id, 'missing'::text as kind, a.created_at
      from attempts a
      cross join lateral unnest(a.missing_card_ids) as m(card_id)
    union all
    select c.card_id, 'contradicted'::text as kind, a.created_at
      from attempts a
      cross join lateral unnest(a.contradicted_card_ids) as c(card_id)
  ),
  weak as (
    select s.card_id,
           count(*) filter (where s.kind = 'missing') as missing,
           count(*) filter (where s.kind = 'contradicted') as contradicted,
           max(s.created_at) as last_at
      from signals s
     group by s.card_id
    having count(*) >= 2
  ),
  formats as (
    select d.format,
           count(*) as attempts,
           count(*) filter (where a.verdict = 'sound') as sound
      from attempts a
      join public.synthesis_drills d on d.id = a.drill_id
     where a.verdict <> 'off_target'
     group by d.format
  ),
  kinds as (
    select entry ->> 'kind' as kind, count(*) as n
      from recent r
      cross join lateral jsonb_array_elements(coalesce(r.contradictions, '[]'::jsonb)) as entry
     group by entry ->> 'kind'
  ),
  attempt_links as (
    select a.id,
           (a.created_at at time zone 'utc')::date as day,
           (select count(*)
              from jsonb_array_elements(coalesce(a.coverage, '[]'::jsonb)) as e
             where e ->> 'status' = 'covered') as covered,
           jsonb_array_length(coalesce(a.coverage, '[]'::jsonb)) as total
      from attempts a
  ),
  days as (
    select generate_series(
             (date_trunc('day', p_now at time zone 'utc') - interval '29 days')::date,
             (p_now at time zone 'utc')::date,
             interval '1 day'
           )::date as day
  ),
  daily as (
    select dy.day,
           count(al.id) as attempts,
           coalesce(sum(al.covered), 0) as links_covered,
           coalesce(sum(al.total), 0) as links_total
      from days dy
      left join attempt_links al on al.day = dy.day
     group by dy.day
  ),
  history as (
    select a.id as attempt_id,
           a.drill_id,
           d.prompt_text,
           d.format,
           a.verdict,
           (select count(*)
              from jsonb_array_elements(coalesce(a.coverage, '[]'::jsonb)) as e
             where e ->> 'status' = 'covered') as links_covered,
           jsonb_array_length(coalesce(d.required_links, '[]'::jsonb)) as links_total,
           a.duration_ms,
           a.created_at
      from attempts a
      join public.synthesis_drills d on d.id = a.drill_id
     order by a.created_at desc
     limit 20
  )
  select jsonb_build_object(
    'attempt_count', (select count(*) from attempts),
    'weak_links', coalesce((
      select jsonb_agg(jsonb_build_object(
               'card_id', w.card_id,
               'term', c.front,
               'missing', w.missing,
               'contradicted', w.contradicted,
               'last_at', w.last_at
             ) order by w.contradicted desc, w.missing desc, w.last_at desc)
        from weak w
        join public.cards c on c.id = w.card_id and c.deck_id = p_deck_id
    ), '[]'::jsonb),
    'format_rates', coalesce((
      select jsonb_agg(jsonb_build_object('format', f.format, 'attempts', f.attempts, 'sound', f.sound)
                       order by f.attempts desc)
        from formats f
    ), '[]'::jsonb),
    'outside_claims_30d', (
      select coalesce(sum(jsonb_array_length(coalesce(r.outside_claims, '[]'::jsonb))), 0) from recent r
    ),
    'misconceptions_30d', coalesce((
      select jsonb_object_agg(k.kind, k.n) from kinds k where k.kind is not null
    ), '{}'::jsonb),
    'calibration_30d', (
      select case
               when count(*) = 0 then null
               else (count(*) filter (
                       where r.confidence = 2
                          or (r.confidence = 3 and r.verdict = 'sound')
                          or (r.confidence = 1 and r.verdict <> 'sound')
                     ))::numeric / count(*)
             end
        from recent r
       where r.confidence is not null
         and r.verdict <> 'off_target'
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', d.day,
               'attempts', d.attempts,
               'links_covered', d.links_covered,
               'links_total', d.links_total
             ) order by d.day)
        from daily d
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.created_at desc) from history h
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_synthesis_insights(uuid, timestamptz) from public;
grant execute on function public.get_synthesis_insights(uuid, timestamptz) to authenticated;
```

**Its loader** (compiled). It returns `null` on any error, so the existing Node path stays as the fallback, and as the parity oracle, until the switch is proven:

```ts
// src/lib/synthesis/insights-rpc.ts
import { z } from 'zod';
import type { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { SynthesisInsights } from '@/lib/synthesis/loaders';
import { MISCONCEPTION_KINDS, isDrillVerdict, isSynthesisFormat, type MisconceptionKind } from '@/lib/synthesis/types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const insightsSchema = z.object({
  attempt_count: z.number(),
  weak_links: z.array(z.object({ card_id: z.string(), term: z.string(), missing: z.number(), contradicted: z.number(), last_at: z.string() })),
  format_rates: z.array(z.object({ format: z.string(), attempts: z.number(), sound: z.number() })),
  outside_claims_30d: z.number(),
  misconceptions_30d: z.record(z.string(), z.number()),
  calibration_30d: z.number().nullable(),
  daily: z.array(z.object({ date: z.string(), attempts: z.number(), links_covered: z.number(), links_total: z.number() })),
  history: z.array(z.object({
    attempt_id: z.string(),
    drill_id: z.string(),
    prompt_text: z.string(),
    format: z.string(),
    verdict: z.string(),
    links_covered: z.number(),
    links_total: z.number(),
    duration_ms: z.number(),
    created_at: z.string(),
  })),
});

/**
 * Insights from `get_synthesis_insights` (plan §6.4): the same readings as
 * the Node aggregation in insights.ts, computed in Postgres and uncapped, in
 * one round trip. Returns null on any error or unexpected shape, so the
 * caller can fall back to the Node path while both exist.
 */
export async function loadSynthesisInsightsRpc(
  supabase: SupabaseServerClient,
  input: { deckId: string; now?: Date },
): Promise<SynthesisInsights | null> {
  const { data, error } = await supabase.rpc('get_synthesis_insights', {
    p_deck_id: input.deckId,
    ...(input.now ? { p_now: input.now.toISOString() } : {}),
  });
  if (error) {
    logger.warn('synthesis', 'get_synthesis_insights failed', { message: error.message });
    return null;
  }
  const parsed = insightsSchema.safeParse(data);
  if (!parsed.success) {
    logger.error('synthesis', 'get_synthesis_insights returned an unexpected shape');
    return null;
  }
  const raw = parsed.data;

  const misconceptions30d: Partial<Record<MisconceptionKind, number>> = {};
  for (const kind of MISCONCEPTION_KINDS) {
    const count = raw.misconceptions_30d[kind];
    if (count) misconceptions30d[kind] = count;
  }

  return {
    attemptCount: raw.attempt_count,
    weakLinks: raw.weak_links.map((row) => ({ cardId: row.card_id, term: row.term, missing: row.missing, contradicted: row.contradicted, lastAt: row.last_at })),
    formatRates: raw.format_rates.flatMap((row) => (isSynthesisFormat(row.format) ? [{ format: row.format, attempts: row.attempts, sound: row.sound }] : [])),
    outsideClaims30d: raw.outside_claims_30d,
    misconceptions30d,
    calibration30d: raw.calibration_30d,
    daily: raw.daily.map((point) => ({ date: point.date, attempts: point.attempts, linksCovered: point.links_covered, linksTotal: point.links_total })),
    history: raw.history.flatMap((row) => (isSynthesisFormat(row.format) && isDrillVerdict(row.verdict)
      ? [{
        attemptId: row.attempt_id,
        drillId: row.drill_id,
        promptText: row.prompt_text,
        format: row.format,
        verdict: row.verdict,
        linksCovered: row.links_covered,
        linksTotal: row.links_total,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }]
      : [])),
  };
}
```

**Switching over.** `loadSynthesisInsights` tries the RPC first — `return (await loadSynthesisInsightsRpc(supabase, input)) ?? nodeAggregation()`. Delete the Node path once production has decks with ≥ 20 attempts, and a one-off comparison script shows the two agree on three of them: equal weak-link order and counts, and rates equal to 1e-9.

**PERF-04 — only if measured.** The drill canvas's queue read makes three serial reads (drills → anchors → attempts). Collapsing them in TypeScript would mean fetching attempts for every active drill to serve at most five — a bad trade. Execution plan D20 already set the bar: build the read-RPC when the read exceeds about 150 ms. When server timing shows that, this data-only RPC replaces the three waves; `orderQueue` stays in TypeScript, unchanged (parser-checked):

```sql
-- supabase/migrations/2026100109xx_synthesis_queue_rpc.sql — CONDITIONAL
create or replace function public.get_synthesis_queue_data(
  p_deck_id uuid,
  p_kind text default 'drill',
  p_history integer default 5
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  drills as (
    select d.id, d.deck_id, d.kind, d.question_text, d.command_word, d.format, d.prompt_text,
           d.prompt_variants, d.scenario, d.bloom, d.card_ids, d.topic_tag, d.required_links,
           d.exemplar, d.status, d.step, d.next_due_at, d.attempt_count, d.last_verdict, d.last_attempt_at
      from public.synthesis_drills d
     where d.deck_id = p_deck_id
       and d.user_id = (select uid from me)
       and d.status = 'active'
       and d.kind = coalesce(p_kind, 'drill')
     order by d.next_due_at asc
     limit 60
  ),
  anchors as (
    select c.id, c.front, c.back, c.explanation, c.state
      from public.cards c
     where c.deck_id = p_deck_id
       and c.id in (select unnest(dr.card_ids) from drills dr)
  ),
  ranked as (
    select a.id,
           a.drill_id,
           a.verdict,
           a.gap_note,
           (select count(*)
              from jsonb_array_elements(coalesce(a.coverage, '[]'::jsonb)) as e
             where e ->> 'status' = 'covered') as links_covered,
           jsonb_array_length(coalesce(a.coverage, '[]'::jsonb)) as links_seen,
           a.created_at,
           row_number() over (partition by a.drill_id order by a.created_at desc) as n
      from public.synthesis_attempts a
     where a.user_id = (select uid from me)
       and a.drill_id in (select id from drills)
  )
  select jsonb_build_object(
    'drills', coalesce((select jsonb_agg(to_jsonb(dr) order by dr.next_due_at) from drills dr), '[]'::jsonb),
    'anchors', coalesce((select jsonb_agg(to_jsonb(an)) from anchors an), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(r) - 'n' order by r.created_at desc)
        from ranked r
       where r.n <= greatest(1, coalesce(p_history, 5)) + 1
    ), '[]'::jsonb),
    'deck_attempts', (
      select count(*)
        from public.synthesis_attempts a
       where a.deck_id = p_deck_id
         and a.user_id = (select uid from me)
    )
  );
$$;

revoke all on function public.get_synthesis_queue_data(uuid, text, integer) from public;
grant execute on function public.get_synthesis_queue_data(uuid, text, integer) to authenticated;
```

Coverage is reduced to counts in SQL, so the worst case — 40 active drills (`MAX_ACTIVE_DRILLS_PER_DECK`) × 6 attempts — stays a few hundred small rows.

### 6.5 Gates — drift, replay, live AI, load (OPS-02)

**1. Database job in CI** — every migration replayed from scratch, and the committed types compared against what that schema generates. The repository has no `supabase/config.toml`; create it once with `supabase init` and commit it.

```yaml
# .github/workflows/ci.yml — a second job
  database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Replay every migration on a fresh database
        run: supabase db start && supabase db reset --local
      - name: Types match the replayed schema
        run: |
          supabase gen types typescript --local --schema public > /tmp/types.ts
          diff <(sed 's/[[:space:]]*$//' src/lib/database.types.ts) <(sed 's/[[:space:]]*$//' /tmp/types.ts)
```

Two notes. First, `npm run db:types` uses `--schema public`, so its first run drops the unused `graphql_public` block that `bb045b3` re-added; the CI diff uses the same flag. Second, the local image's `postgres` role may hold privileges the hosted one does not, so a 42501-class failure like `202609170960`'s can still pass here. The replay proves ordering and syntax, not hosted permissions; the post-push `production-assertions.sql` run covers those.

**2. Scheduled live-AI job** — model drift is caught on a schedule, not by a student:

```yaml
# .github/workflows/live-ai.yml
name: Live AI gates
on:
  schedule:
    - cron: '0 3 * * 1-5'
  workflow_dispatch:
jobs:
  live:
    runs-on: ubuntu-latest
    env:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      GEMINI_MODEL: ${{ vars.GEMINI_MODEL }}
      # env-public.ts validates these at import; the live tests never call Supabase.
      NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-key
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run ai:smoke
      - run: npm run ai:retrieval
      - run: npm run ai:generation
      - run: npm run ai:calibrate
```

**3. Load test** — against a preview deployment, never production. Use a dedicated test account.

```js
// scripts/k6-session.mjs — prints a Cookie header for the TEST account (never a real user's)
import { createServerClient } from '@supabase/ssr';

const jar = new Map();
const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: process.env.LOAD_TEST_EMAIL, password: process.env.LOAD_TEST_PASSWORD });
if (error) throw error;
console.log([...jar].map(([name, value]) => `${name}=${value}`).join('; '));
```

```js
// load/dashboard.k6.js — k6 run -e BASE_URL=… -e SESSION_COOKIE="$(node --env-file=.env.local scripts/k6-session.mjs)" -e DECK_ID=… load/dashboard.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 25 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{page:dashboard}': ['p(95)<800'],
    'http_req_duration{page:deck}': ['p(95)<900'],
    'http_req_duration{page:stats}': ['p(95)<900'],
  },
};

const headers = {
  Cookie: __ENV.SESSION_COOKIE,
  // Vercel preview protection, if enabled on the project.
  ...(__ENV.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': __ENV.VERCEL_BYPASS } : {}),
};

export default function () {
  const get = (path, page) => http.get(`${__ENV.BASE_URL}${path}`, { headers, tags: { page }, redirects: 0 });
  check(get('/dashboard', 'dashboard'), { 'dashboard 200': (res) => res.status === 200 });
  check(get(`/dashboard/${__ENV.DECK_ID}`, 'deck'), { 'deck 200': (res) => res.status === 200 });
  check(get('/dashboard/stats', 'stats'), { 'stats 200': (res) => res.status === 200 });
  sleep(1);
}
```

During the run, watch `supabase inspect db calls --linked` and `outliers`, plus the Supabase dashboard's connection and API panels. PostgREST's pool size depends on the compute tier; a render of the deck page issues seven PostgREST requests in parallel. Run the test once before §6.3 and once after it: the difference is the cost of HS256.

These scripts were not executed in this audit — there was no test account or preview URL.

### 6.6 Observability — LC-03

Every `after()` callback already records AI usage when it reaches the model. Add one field so outcomes are countable, not just loggable: `background: 'ok' | 'skipped' | 'failed'` in the usage metadata, with `'skipped'` for a refused reservation and `'failed'` from the `catch`. Watch it daily:

```sql
select action,
       metadata ->> 'background' as outcome,
       count(*)
  from public.ai_usage_logs
 where created_at > now() - interval '1 day'
   and metadata ? 'background'
 group by 1, 2
 order by 1, 2;
```

A `failed` share above a few percent is a timeout budget (LC-01) or a model regression, and the scheduled live-AI job (§6.5) says which.

### 6.7 Gate G3

| Check | How | Pass |
|---|---|---|
| SDK | `rg -n "@google/generative-ai" src` | no matches |
| Live AI | `npm run ai:smoke && npm run ai:retrieval && npm run ai:generation && npm run ai:calibrate` | all pass (calibration within `COGNIT_MICRO_SYNTHESIS_SPEC.md` §11.3 targets) |
| CSP, report week | `curl -sI $URL/dashboard` (signed in), `$URL/` | dashboard: baseline enforced + `Content-Security-Policy-Report-Only` with `nonce-`; `/`: baseline only |
| CSP, enforce | After a clean report week, `CSP_ENFORCE=true`; the Appendix A.8 script against `/s/<token>` | one enforced policy with `nonce-` and `'strict-dynamic'`; N/N scripts covered; DevTools console clean on every route |
| JWT | `curl -s $URL/auth/v1/.well-known/jwks.json \| jq '.keys \| length'` | ≥ 1, `alg` ES256 |
| Auth latency | Vercel function logs, p50 of `/dashboard`, before vs after §6.3 | two Auth round-trips gone |
| Insights RPC | three decks with ≥ 20 attempts: RPC vs Node aggregation | equal |
| Drift | CI `database` job | replay green; types diff empty |
| Load | k6 against preview | thresholds met; no PostgREST pool exhaustion |
| Background | the §6.6 query | `failed` < 2 % of background runs |

---

## 7. Verification gates — index

Each phase ends in its own gate table (§3.9, §4.5, §5.7, §6.7). This index is the order in which to run them and the minimum each must show.

| Gate | Blocks | Automated | Live (costs API calls) | Manual UAT |
|---|---|---|---|---|
| **G0** | Phase 1 and every production deploy after it | `npx tsc --noEmit` · `npm run lint` · `npm test` → **425** (419 with Appendix D alone) · `npm run build` · `npm run verify:deployment` → 18 RPCs + 6 probes | `npm run ai:retrieval` | KBD-01 (canvas + quiz), pause resumes, off-topic question maps 0, exam today/tomorrow, `top_similarity` logged |
| **G1** | Directory launch (`EXPLORE_ENABLED`) | §1.2.1 for four migrations · assertions · `npm test` → **446** · build shows `ƒ /explore`, `ƒ /api/decks/[deckId]/export` | `npm run ai:generation` | trash/undo/restore/purge · duplicate · merge · CSV in Excel + Sheets · Anki import + re-import · concept map by keyboard · dictation · directory signed out |
| **G2** | — | `npm test` · build · bundle budgets · `npm run contrast` | — | axe on four surfaces · VoiceOver/NVDA on canvas + charts · focus restoration · iOS no-zoom · Android keyboard · 44 px targets · swipe · both themes |
| **G3** | Turning on `CSP_ENFORCE` | CI `database` job · `rg` for the legacy SDK · the A.8 coverage script | `ai:smoke` · `ai:retrieval` · `ai:generation` · `ai:calibrate` (scheduled job) | report-week log review · JWKS ES256 · latency before/after · k6 thresholds · insights parity |

**Standing rules** after this plan lands:

- `npm run db:types` → `tsc` after every push. Never hand-edit `database.types.ts`.
- Never edit an applied migration; write a new one.
- Every window-level keydown handler calls `pageShortcutBlocked` first.
- Similarity floors change only with `npm run ai:retrieval` green.
- Bundle budgets move down, never up, without a written reason.

---

## Appendix A — Evidence log

### A.1 Environment

| Item | Value |
|---|---|
| Baseline | `bb045b3` (audit began at `f164797`) |
| Node packages | next 16.1.0 · react 19.2.3 · @supabase/ssr 0.8.0 · @supabase/supabase-js 2.89.0 · @supabase/auth-js 2.89.0 · @google/generative-ai 0.24.1 · framer-motion 12.34.3 · katex 0.18.7 · zod 4.2.1 · typescript 5.9.3 · vitest 4.0.18 |
| Supabase CLI | 2.75.0 (2.117.0 available) |
| Project | linked, ref `idmmivsxdgpqweofseud` |
| Hosting | Vercel (`vercel.json` cron `/api/keep-alive` 06:00 daily) |

### A.2 `supabase migration list --linked` (condensed)

```
   Local        | Remote       | Time (UTC)
  --------------|--------------|--------------
   20260306     | 20260306     | 20260306
   …            | …            | …                (48 rows; every local version present remotely)
   202609120900 | 202609120900 | 202609120900
   202609141000 | 202609141000 | 202609141000
   202609150900 | 202609150900 | 202609150900
   202609170900 | 202609170900 | 202609170900
   …   0910 · 0920 · 0930 · 0940 · 0950 · 0960 · 0970 · 0980 — all present
   202609180900 | 202609180900 | 202609180900
   202609210900 | 202609210900 | 202609210900
   202609210910 | 202609210910 | 202609210910
   202609210920 | 202609210920 | 202609210920
```

### A.3 `npm run verify:deployment` (anon, read-only)

```
✅ EXISTS    reserve_ai_call  (guarded: Unauthorized)
✅ EXISTS    apply_card_embeddings_batch  (guarded: Unauthorized)
✅ EXISTS    apply_quiz_sm2_batch  (guarded: Unauthorized)
✅ EXISTS    select_quiz_cards  (returned)
✅ EXISTS    count_quiz_ready_cards  (returned)
✅ EXISTS    get_deck_topic_tag_counts  (returned)
✅ EXISTS    get_due_cards_by_deck  (returned)
✅ EXISTS    set_deck_sharing  (guarded: Unauthorized)
✅ EXISTS    clone_shared_deck  (guarded: You must be signed in to save a deck.)
✅ EXISTS    search_deck_cards_by_embedding  (returned)
✅ EXISTS    search_user_cards_by_embedding  (returned)
✅ EXISTS    apply_card_enrichment_batch  (guarded: Unauthorized)
✅ EXISTS    log_quiz_result  (guarded: Unauthorized)
✅ EXISTS    get_quiz_history  (returned)
✅ EXISTS    record_synthesis_attempt  (guarded: Unauthorized)
✅ EXISTS    get_card_schedule_summary  (returned)
✅ EXISTS    get_deck_schedule_breakdown  (returned)
✅ decks sharing columns readable; anon sees 0 row(s) (expect 0 unless a deck is shared)
✅ EXISTS    table synthesis_drills with id, link_count, last_links_covered, prompt_variants, bloom, scenario, kind, question_text, command_word; anon sees 0 row(s) (expect 0)
✅ EXISTS    table synthesis_attempts with id, client_attempt_id, confidence, revision_of, band; anon sees 0 row(s) (expect 0)
✅ EXISTS    table synthesis_attempt_feedback with id, rating; anon sees 0 row(s) (expect 0)
✅ EXISTS    table synthesis_questions with id, mapped_card_ids, missing_concepts, drill_id; anon sees 0 row(s) (expect 0)
✅ EXISTS    table cards with id, absorbed_from_attempt_id, absorbed_claim_index; anon sees 0 row(s) (expect 0)

All RPCs present and guarded.
```

### A.4 Types versus the live schema

`supabase gen types typescript --linked --schema public` diffed against `src/lib/database.types.ts` at `bb045b3` shows only the `graphql_public` block (lines 15–39 and 1133–1135 of the committed file), which the `--schema public` flag excludes by design. No table, column, function or argument differs.

### A.5 Production volume (`supabase inspect db table-stats`, estimated rows)

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| cards | 195 | | decks | 4 |
| study_logs | 140 | | ai_usage_logs | 20 |
| card_mastery_state | 80 | | deck_chat_messages | 14 |
| quiz_results · quiz_card_results | 0 · 0 | | deck_chat_sessions | 3 |
| synthesis_drills · attempts · feedback · questions | 0 · 0 · 0 · 0 | | *database size* | 15 MB |

### A.6 Bundle report — script and baseline

Baseline on `bb045b3` (first-load JS, gzip). The §5.6 table was measured on the Phase 1 clone, hence differences of ≤ 0.3 kB in its "before" column.

| Route | kB gz | | Route | kB gz |
|---|---|---|---|---|
| `/dashboard/[deckId]` | 315.1 | | `/dashboard/[deckId]/quiz` | 224.1 |
| `/dashboard` | 299.8 | | `/dashboard/[deckId]/study` | 219.4 |
| `/dashboard/stats` | 281.6 | | `/` | 209.8 |
| `/login` | 275.4 | | `/s/[token]` | 207.0 |
| `/login/update-password` | 271.4 | | `/_not-found` | 194.2 |
| `/dashboard/[deckId]/synthesis` | 233.2 | | shared root (5 chunks) | 117.7 |

Largest chunks: KaTeX 74.7 kB gz (lazy) · react-dom 68.4 · zod + Radix 62.6 (**twice**: login group, shell group) · highlight.js 17.9 (lazy). CSS: 18.8 + 3.7 kB gz.

```js
#!/usr/bin/env node
/**
 * Per-route first-load JavaScript from a Next 16 (Turbopack) build: the root
 * main files plus every chunk in the route's client-reference manifest,
 * deduplicated, raw and gzip. Next 16 no longer prints sizes; this does.
 *
 *   node scripts/bundle-report.mjs .next
 *   node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json   # exit 1 on any overrun
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';

const NEXT = process.argv[2] ?? '.next';
const budgetsFlag = process.argv.indexOf('--budgets');
const budgets = budgetsFlag > 0 ? JSON.parse(readFileSync(process.argv[budgetsFlag + 1], 'utf8')) : null;

const build = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
const sizes = new Map();
function size(file) {
  if (!sizes.has(file)) {
    const buffer = readFileSync(join(NEXT, file));
    sizes.set(file, { raw: buffer.length, gz: gzipSync(buffer, { level: 9 }).length });
  }
  return sizes.get(file);
}

function manifests(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) manifests(path, out);
    else if (entry === 'page_client-reference-manifest.js') out.push(path);
  }
  return out;
}

const rows = [];
for (const file of manifests(join(NEXT, 'server/app'))) {
  const context = { globalThis: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), context);
  for (const [route, data] of Object.entries(context.globalThis.__RSC_MANIFEST ?? {})) {
    const files = new Set(build.rootMainFiles);
    for (const list of Object.values(data.entryJSFiles ?? {})) for (const chunk of list) files.add(chunk);
    let raw = 0;
    let gz = 0;
    for (const chunk of files) {
      if (!existsSync(join(NEXT, chunk))) continue;
      const s = size(chunk);
      raw += s.raw;
      gz += s.gz;
    }
    rows.push({ route, chunks: files.size, raw, gz });
  }
}

rows.sort((a, b) => b.gz - a.gz);
let over = 0;
console.log(`${'route'.padEnd(46)} ${'chunks'.padStart(6)} ${'raw kB'.padStart(8)} ${'gz kB'.padStart(7)}${budgets ? '  budget' : ''}`);
for (const row of rows) {
  const budget = budgets?.[row.route];
  const gzKb = row.gz / 1024;
  const verdict = budget === undefined ? '' : gzKb <= budget ? `  ≤ ${budget} ✓` : `  > ${budget} ✗`;
  if (budget !== undefined && gzKb > budget) over += 1;
  console.log(`${row.route.padEnd(46)} ${String(row.chunks).padStart(6)} ${(row.raw / 1024).toFixed(0).padStart(8)} ${gzKb.toFixed(1).padStart(7)}${verdict}`);
}
if (budgets) {
  const unknown = Object.keys(budgets).filter((route) => !rows.some((row) => row.route === route));
  for (const route of unknown) console.error(`budget names an unknown route: ${route}`);
  if (over > 0 || unknown.length > 0) {
    console.error(`\n${over} route(s) over budget.`);
    process.exit(1);
  }
  console.log('\nAll routes within budget.');
}
```

### A.7 SQL syntax gate — `scripts/sqlcheck.mjs`

Run on every new migration before `db push`. It passed all eight SQL artifacts in this plan and failed a deliberate `retrun` typo with exit 1.

```js
#!/usr/bin/env node
/**
 * Syntax-checks migration files with PostgreSQL's own parser (libpg_query):
 * every statement, every PL/pgSQL body, and every `language sql` body.
 * Column names and types are NOT checked — this catches what a typo would
 * otherwise reveal halfway through `supabase db push`.
 *
 *   npm i -D libpg-query
 *   node scripts/sqlcheck.mjs supabase/migrations/2026092409*.sql
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('libpg-query');

function sqlFunctionBodies(tree) {
  const bodies = [];
  for (const { stmt } of tree.stmts ?? []) {
    const fn = stmt?.CreateFunctionStmt;
    if (!fn) continue;
    const options = Object.fromEntries((fn.options ?? []).map((option) => [option.DefElem.defname, option.DefElem.arg]));
    const language = options.language?.String?.sval;
    const body = options.as?.List?.items?.[0]?.String?.sval;
    if (language === 'sql' && body) bodies.push({ name: fn.funcname.map((part) => part.String.sval).join('.'), body });
  }
  return bodies;
}

if (pg.loadModule) await pg.loadModule();
let failed = 0;
for (const file of process.argv.slice(2)) {
  const sql = readFileSync(file, 'utf8');
  try {
    const tree = await pg.parse(sql);
    const plpgsql = /language\s+plpgsql|do\s+\$/i.test(sql) ? (await pg.parsePlPgSQL(sql))?.plpgsql_funcs?.length ?? 0 : 0;
    const bodies = sqlFunctionBodies(tree);
    for (const { name, body } of bodies) {
      try {
        await pg.parse(body);
      } catch (error) {
        failed += 1;
        console.log(`FAIL ${basename(file)} :: body of ${name}: ${error.message}`);
      }
    }
    console.log(`ok   ${basename(file)}: ${tree.stmts.length} statements, ${plpgsql} PL/pgSQL bodies, ${bodies.length} SQL bodies`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${basename(file)}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
```

### A.8 CSP coverage — `scripts/csp-coverage.mjs`

It printed "15/15 scripts covered by the strict policy" on `/s/<token>` under `CSP_ENFORCE=true`, and exited 1 on `/`, which has no nonce policy by design.

```js
#!/usr/bin/env node
/**
 * Does the page's strict CSP cover every script it ships? Fetches the URL,
 * finds the nonce policy (enforcing or report-only), and checks each
 * <script>: allowed if it carries that nonce, or if it is inline and its
 * SHA-256 is listed. Exit 1 on any uncovered script.
 *
 *   node scripts/csp-coverage.mjs https://<host>/s/<token>
 *   COOKIE="$(node --env-file=.env.local scripts/k6-session.mjs)" node scripts/csp-coverage.mjs https://<host>/dashboard
 */
import { createHash } from 'node:crypto';

const url = process.argv[2];
const response = await fetch(url, { redirect: 'manual', headers: process.env.COOKIE ? { cookie: process.env.COOKIE } : {} });
const html = await response.text();
const policies = [...response.headers.entries()].filter(([name]) => name.startsWith('content-security-policy'));
for (const [name, value] of policies) console.log(`${name}: ${value.slice(0, 110)}…`);

const strict = policies.map(([, value]) => value).find((value) => value.includes("'nonce-"));
if (!strict) {
  console.error(`No nonce policy on ${url} (status ${response.status}).`);
  process.exit(1);
}
const nonce = strict.match(/'nonce-([^']+)'/)?.[1];
const hashes = [...strict.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]);
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const uncovered = scripts.filter(([, attributes, body]) => {
  if (attributes.match(/nonce="([^"]+)"/)?.[1] === nonce) return false;
  return /\bsrc=/.test(attributes) || !hashes.includes(createHash('sha256').update(body).digest('base64'));
});
console.log(`${scripts.length - uncovered.length}/${scripts.length} scripts covered by the strict policy`);
for (const [, attributes, body] of uncovered) console.log(`  ✗ <script${attributes.slice(0, 80)}> ${body.slice(0, 60)}`);
process.exit(uncovered.length ? 1 : 0);
```

### A.9 Auth state — reproducible checks

```bash
# JWKS — empty means HS256 only, so getClaims() always calls getUser()
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/.well-known/jwks.json" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# → {"keys":[]}          (2026-09-23)

# Header of any issued access token — decode the first segment only
node -e 'console.log(JSON.parse(Buffer.from(process.argv[1].split(".")[0], "base64url")))' "$TOKEN"
# → { alg: 'HS256', … }   (the stored test token, issued 2026-09-08)
```

### A.10 The `f164797` build failure, reproduced

```
✓ Compiled successfully in 5.1s
  Running TypeScript ...
Failed to compile.

./src/app/actions/quiz.ts:159:5
Type error: Type 'string | null' is not assignable to type 'string | undefined'.
  Type 'null' is not assignable to type 'string | undefined'.
Next.js build worker exited with code: 1 and signal: null
```

`tsc --noEmit` on the same commit also reported `synthesis.ts(780,7)` and `(824,7)`: `Type 'string | null' is not assignable to type 'string'`.

---

## Appendix B — Calibration data

All probes: `gemini-embedding-001`, `outputDimensionality: 768`, cards as `` `${term}\n${definition}` `` with `RETRIEVAL_DOCUMENT`, questions with `RETRIEVAL_QUERY`, cosine similarity, top-1 within the question's own deck. The fixture is `src/test/live/retrieval-calibration.json` in the Appendix D patch. Vector norm at 768 dimensions: |doc| 0.587, |query| 0.595.

### B.1 Probe 1 — chat-style questions (49)

| Top-1 | Class | Deck | Question |
|---|---|---|---|
| 0.784 | covered | os | explain thrashing |
| 0.779 | covered | os | how does paging avoid external fragmentation |
| 0.774 | covered | os | deadlock |
| 0.772 | covered | bio | photosynthesis organelle |
| 0.763 | covered | econ | why might government borrowing reduce private investment |
| 0.761 | covered | os | why do short jobs suffer behind a long one in FCFS |
| 0.747 | covered | econ | what counts in GDP |
| 0.745 | covered | os | what happens during a context switch |
| 0.745 | covered | econ | opportunity cost example |
| 0.741 | covered | os | what is a working set |
| 0.738 | covered | os | what is a page fault and when does it happen |
| 0.734 | covered | bio | what does an enzyme do to activation energy |
| 0.732 | covered | bio | where is most ATP made in the cell |
| 0.732 | covered | bio | how can adding more substrate overcome an inhibitor |
| 0.725 | covered | os | how does aging stop starvation? |
| 0.724 | covered | bio | net ATP from glycolysis? |
| 0.724 | covered | bio | what do ribosomes do |
| 0.717 | covered | econ | inflation unemployment tradeoff |
| 0.717 | covered | econ | what is the multiplier |
| 0.716 | covered | bio | how is active transport different from diffusion |
| 0.712 | covered | econ | how can government taxes shift aggregate demand |
| 0.708 | covered | bio | difference between mitosis and meiosis ¹ |
| 0.706 | covered | os | why does a really small time slice make round robin slower? |
| 0.700 | covered | econ | what tools does a central bank use |
| 0.698 | covered | bio | why does water move into a cell in a hypotonic solution |
| 0.690 | covered | econ | why do countries gain from trade even if one is better at everything |
| 0.686 | partial | os | mutex vs semaphore? |
| 0.678 | covered | econ | why does inflation hurt savers |
| 0.644 | near | os | how does the Linux CFS red-black tree choose the next task? |
| 0.639 | near | os | what is a TLB shootdown |
| 0.633 | partial | econ | how does quantitative easing work |
| 0.604 | partial | bio | explain the electron transport chain proton gradient in detail |
| 0.601 | near | os | explain copy-on-write after fork() |
| 0.597 | near | bio | what is the role of the Golgi apparatus |
| 0.581 | near | econ | what caused the 2008 financial crisis |
| 0.578 | near | bio | how do action potentials propagate along an axon |
| 0.565 | near | bio | how does CRISPR-Cas9 cut DNA |
| 0.565 | near | econ | what is a Nash equilibrium |
| 0.558 | near | econ | explain the Gini coefficient |
| 0.544 | off | os | best way to proof sourdough overnight |
| 0.540 | near | os | how does RAID 5 parity work |
| 0.508 | off | econ | how many bones are in the human body |
| 0.505 | off | bio | recommend a good sci-fi novel |
| 0.503 | off | bio | how do I change a car tire |
| 0.495 | off | bio | what is the capital of Australia |
| 0.493 | off | os | what year did the Berlin Wall fall |
| 0.483 | off | econ | how to train a puppy to sit |
| 0.459 | off | os | who painted the Mona Lisa |
| 0.449 | off | econ | who wrote Hamlet |

¹ The one top-1 "miss": the nearest card was *Meiosis* rather than *Mitosis*. Both are relevant, so for grounding purposes it counts as a hit.

### B.2 Probe 2 — card ↔ card within one topic (operating systems, 12 cards)

| Pairs a human would drill together | Pairs a human would not |
|---|---|
| quantum–round-robin **0.942** · starvation–aging 0.902 · thrashing–working set 0.885 · thrashing–page fault 0.878 · deadlock–mutex 0.869 · paging–page fault 0.859 · quantum–context switch 0.845 · convoy–round-robin 0.822 | 0.836 · 0.828 · 0.816 · 0.811 · 0.808 · 0.774 · 0.765 · **0.753** |

All 66 pairs score ≥ 0.753 (median 0.819), so a 0.62 floor rejects none. Related and unrelated pairs overlap (0.822 < 0.836): no absolute floor separates them inside one topic. Hence the neighbour floor filters across topics, and "confusable" (0.86) sits above the unrelated maximum.

### B.3 Probe 3 — across topics (36 cards, 3 topics)

| | n | min | p05 | median | p95 | max |
|---|---|---|---|---|---|---|
| Within a topic | 198 | 0.746 | 0.768 | 0.814 | 0.879 | 0.942 |
| Across topics | 432 | 0.664 | 0.698 | 0.732 | 0.766 | 0.788 |

| Floor | Cross-topic pairs rejected | Within-topic pairs rejected |
|---|---|---|
| 0.72 | 121/432 | 0/198 |
| 0.74 | 277/432 | 0/198 |
| **0.76** | **398/432 (92 %)** | **4/198 (2 %)** |
| 0.78 | 426/432 | 23/198 |
| 0.80 | 432/432 | 57/198 |

In a single mixed deck of all 36 cards, every card's nearest neighbour was in its own topic (36/36).

### B.4 Probe 4 — SDK parity

One card embedded through `@google/genai` 2.24.0 (`embedContent`, two `Content`s → two vectors) and through `@google/generative-ai` 0.24.1 (`batchEmbedContents`): cosine **1.000000**.

---

## Appendix C — TypeScript → database dependency map

Every object below is live (A.2–A.4).

| Object | Kind | Defined in | Used by |
|---|---|---|---|
| `synthesis_drills` | table | `202609120900` (+ `150900`, `210900`, `210910` columns) | `actions/synthesis.ts`, `lib/synthesis/loaders.ts` |
| `synthesis_attempts` | table | `202609120900` (+ `150900`, `210910`) | `actions/synthesis.ts`, `lib/synthesis/loaders.ts` |
| `synthesis_attempt_feedback` | table | `202609150900` | `actions/synthesis.ts` |
| `synthesis_questions` | table | `202609210910` | `actions/synthesis.ts`, `lib/synthesis/loaders.ts` |
| `decks.exam_at` | column | `202609210920` | `[deckId]/page.tsx`, `actions/synthesis.ts`, `actions/_shared.ts`, `ExamDateControl.tsx`, `lib/schemas.ts` |
| `cards.absorbed_from_attempt_id`, `absorbed_claim_index` | columns | `202609170970` | `actions/synthesis.ts`, `lib/synthesis/loaders.ts` |
| `record_synthesis_attempt` | RPC | `202609170980`, replaced in `202609210910` | `actions/synthesis.ts` |
| `get_analytics_snapshot` | RPC | `202609180900` | `(shell)/stats/page.tsx` |
| `reserve_ai_call` (v2 signature) | RPC | `202609170900` | `actions/_shared.ts` |
| `apply_card_enrichment_batch` | RPC | `202609170910` | `actions/ai-enrich.ts` |
| `log_quiz_result` | RPC | `202609170920` | `actions/quiz.ts` |
| `get_quiz_history` | RPC | `202609170930` | `actions/quiz.ts` |
| `get_due_cards_by_deck` (with `new_count`) | RPC | `202609170960` | `lib/dashboard-due.ts` |
| `search_user_cards_by_embedding` | RPC | `202609170960` (settings: DB-03) | `actions/chat.ts` |
| `search_deck_cards_by_embedding` | RPC | `202609011400`, `202609060900` | `lib/rag.ts`, `actions/synthesis.ts` |
| `get_card_schedule_summary`, `get_deck_schedule_breakdown` | RPCs | `202609141000` | `(shell)/page.tsx`, `[deckId]/page.tsx` |
| `apply_card_embeddings_batch` | RPC | `202609060905` | `actions/chat.ts` |

---

## Appendix D — The Phase 0 patch

Against `bb045b3`. Verified: `git apply --check` clean · `tsc` clean · ESLint 0 problems · 419/419 tests · `next build` ✓ · `npm run ai:retrieval` passing. Apply it as in §3.8. This is the only `diff` block in the document, so the extraction there is exact.

```diff
diff --git a/package.json b/package.json
index 5a24791..9899794 100644
--- a/package.json
+++ b/package.json
@@ -15,7 +15,9 @@
     "ai:smoke": "vitest run --config vitest.live.config.ts src/test/live/smoke.live.ts",
     "ai:calibrate": "vitest run --config vitest.live.config.ts src/test/live/synthesis-calibration.live.ts",
     "ai:generation": "vitest run --config vitest.live.config.ts src/test/live/generation.live.ts",
-    "ai:gate": "vitest run --config vitest.live.config.ts src/test/live/smoke.live.ts src/test/live/generation.live.ts"
+    "ai:gate": "vitest run --config vitest.live.config.ts src/test/live/smoke.live.ts src/test/live/generation.live.ts",
+    "db:types": "supabase gen types typescript --linked --schema public > src/lib/database.types.ts",
+    "ai:retrieval": "vitest run --config vitest.live.config.ts src/test/live/retrieval-calibration.live.ts"
   },
   "dependencies": {
     "@google/generative-ai": "^0.24.1",
diff --git a/scripts/verify-deployment.mjs b/scripts/verify-deployment.mjs
index b4c5b0b..8d6cc62 100755
--- a/scripts/verify-deployment.mjs
+++ b/scripts/verify-deployment.mjs
@@ -46,6 +46,8 @@ const RPCS = {
   record_synthesis_attempt:   { p_drill_id: DECK, p_deck_id: DECK, p_client_attempt_id: null, p_attempt: {}, p_schedule: {}, p_pull_forward_card_ids: [], p_pull_forward_not_after: null },
   get_card_schedule_summary:  { p_user_id: DECK, p_days: 7 },
   get_deck_schedule_breakdown:{ p_deck_id: DECK },
+  // Analytics Hub (202609180900). An anon caller gets an empty snapshot.
+  get_analytics_snapshot:     { p_now: new Date().toISOString(), p_days: 7 },
 };
 
 let missing = 0;
@@ -78,6 +80,8 @@ const SYNTHESIS_PROBES = [
   ['synthesis_questions', 'id, mapped_card_ids, missing_concepts, drill_id'],
   // Absorption provenance (202609170970).
   ['cards', 'id, absorbed_from_attempt_id, absorbed_claim_index'],
+  // Exam date (202609210920).
+  ['decks', 'id, exam_at'],
 ];
 for (const [table, columns] of SYNTHESIS_PROBES) {
   const probe = await supabase.from(table).select(columns).limit(1);
diff --git a/src/app/actions/card.ts b/src/app/actions/card.ts
index f98323b..e6eb2dd 100644
--- a/src/app/actions/card.ts
+++ b/src/app/actions/card.ts
@@ -12,6 +12,7 @@ import {
 import { sanitizeDatabaseError } from '@/lib/server-errors';
 import { recordAiUsage, requireOwnedDeck, reserveAiCall, touchDeckUpdatedAt } from './_shared';
 import { logger } from '@/lib/logger';
+import { ensureSessionHeadroom } from '@/lib/supabase/session';
 import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
 
 const BULK_DELETE_MAX_COUNT = 200;
@@ -136,6 +137,7 @@ export async function updateCard(data: UpdateCardInput) {
   const deckId = result.data.deck_id;
   const textToEmbed = `${result.data.front}\n${result.data.back}`.trim();
   if (textToEmbed) {
+    await ensureSessionHeadroom();
     after(async () => {
       const reservation = await reserveAiCall(supabase, user.id, 'sync_embeddings', { card_id: cardId, trigger: 'update_card' });
       if (!reservation.ok) {
diff --git a/src/app/actions/study.ts b/src/app/actions/study.ts
index 0909fdf..0ea29cd 100644
--- a/src/app/actions/study.ts
+++ b/src/app/actions/study.ts
@@ -11,6 +11,7 @@ import { sanitizeDatabaseError } from '@/lib/server-errors';
 import { generateMnemonicForCard } from '@/lib/mnemonic';
 import { logger } from '@/lib/logger';
 import { requireOwnedDeck } from './_shared';
+import { ensureSessionHeadroom } from '@/lib/supabase/session';
 
 export async function gradeCard(data: GradeCardInput) {
   const result = gradeCardSchema.safeParse(data);
@@ -79,6 +80,7 @@ export async function gradeCard(data: GradeCardInput) {
   }
 
   if (shouldGenerateMnemonic) {
+    await ensureSessionHeadroom();
     // Off the response path: the grade returns now, the model call runs after
     // the response is sent. The student who just lapsed a card should never
     // wait on a mnemonic for it — the next card is what they need.
diff --git a/src/app/actions/synthesis.test.ts b/src/app/actions/synthesis.test.ts
index 448520d..a019d18 100644
--- a/src/app/actions/synthesis.test.ts
+++ b/src/app/actions/synthesis.test.ts
@@ -864,7 +864,7 @@ describe('plans (execution plan D15 / D16)', () => {
         synthesis_questions: { data: [{ id: 'q1', text: 'Discuss the convoy effect.', mapped_card_ids: [CARD_A, CARD_D] }], error: null },
       },
       rpcs: {
-        search_deck_cards_by_embedding: { data: [{ id: CARD_A, similarity: 0.7 }, { id: CARD_D, similarity: 0.6 }, { id: CARD_B, similarity: 0.2 }], error: null },
+        search_deck_cards_by_embedding: { data: [{ id: CARD_A, similarity: 0.72 }, { id: CARD_D, similarity: 0.68 }, { id: CARD_B, similarity: 0.55 }], error: null },
       },
     });
     mocks.client = client;
@@ -875,7 +875,7 @@ describe('plans (execution plan D15 / D16)', () => {
     expect(result).toMatchObject({ success: true, unmapped: false, questions: [{ id: 'q1', mappedCards: 2 }] });
 
     const inserted = client.__inserted.synthesis_questions?.[0] as Array<Record<string, unknown>>;
-    // Only cards above the similarity floor are mapped.
+    // Only cards above the query floor AND within the band of the best match (0.72 - 0.06) are mapped.
     expect(inserted[0]).toMatchObject({ source: 'paper', mapped_card_ids: [CARD_A, CARD_D] });
     expect(mocks.reserveAiCall).toHaveBeenCalledWith(expect.anything(), 'user-1', 'semantic_search', expect.anything(), { calls: 1 });
   });
diff --git a/src/app/actions/synthesis.ts b/src/app/actions/synthesis.ts
index 4cec018..d6a36e4 100644
--- a/src/app/actions/synthesis.ts
+++ b/src/app/actions/synthesis.ts
@@ -10,7 +10,7 @@ import { guardAction } from '@/lib/action-guard';
 import { AiServiceError, withGeminiRetry } from '@/lib/ai-retry';
 import { getServerEnv } from '@/lib/env-server';
 import { logger } from '@/lib/logger';
-import { MIN_CONTEXT_SIMILARITY } from '@/lib/rag';
+import { CONFUSABLE_FLOOR, NEIGHBOUR_FLOOR, questionMatches } from '@/lib/similarity';
 import {
   absorbOutsideClaimSchema,
   archiveSynthesisDrillSchema,
@@ -46,9 +46,9 @@ import {
   type DrillCluster,
 } from '@/lib/synthesis/clusters';
 import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
+import { ensureSessionHeadroom } from '@/lib/supabase/session';
 import {
   DRILL_COLUMNS,
-  digestPlanExemplar,
   loadAbsorbedClaims,
   parseStoredAttempt,
   rowToDrill,
@@ -267,7 +267,7 @@ async function embeddingClusters(
     if (!seedCard) continue;
 
     const neighbourCards = neighbours
-      .filter((row) => row.id !== seedId && (row.similarity ?? 0) >= MIN_CONTEXT_SIMILARITY && !input.usedIds.has(row.id))
+      .filter((row) => row.id !== seedId && (row.similarity ?? 0) >= NEIGHBOUR_FLOOR && !input.usedIds.has(row.id))
       .map((row) => input.cardsById.get(row.id))
       .filter((card): card is ClusterCard => Boolean(card))
       .slice(0, 2);
@@ -728,7 +728,7 @@ export async function checkSynthesisAttempt(data: CheckSynthesisAttemptInput) {
     );
 
     const runs = await Promise.all(Array.from({ length: samples }, () => runCheck()));
-    const { output, finishReason } = runs[0];
+    const { finishReason } = runs[0];
     const usage: ModelUsage = runs.reduce<ModelUsage>(
       (sum, run) => ({
         in: sum.in === null && run.usage.in === null ? null : (sum.in ?? 0) + (run.usage.in ?? 0),
@@ -851,6 +851,7 @@ export async function checkSynthesisAttempt(data: CheckSynthesisAttemptInput) {
       const repairCardId = contradictedCardIds[0];
       const excludeCardIds = drill.cardIds;
       const attemptId = attempt.id;
+      await ensureSessionHeadroom();
       after(async () => {
         try {
           await generateRepairDrill({ deckId, cardId: repairCardId, attemptId, excludeCardIds });
@@ -1066,6 +1067,7 @@ export async function absorbOutsideClaim(data: AbsorbOutsideClaimInput) {
     // their own spend; a refused reservation leaves the card plain, which the
     // deck's enrich and sync controls pick up later.
     const cardId = card.id;
+    await ensureSessionHeadroom();
     after(async () => {
       try {
         await enrichCards({ deck_id: deckId, card_ids: [cardId] });
@@ -1086,8 +1088,6 @@ export async function absorbOutsideClaim(data: AbsorbOutsideClaimInput) {
 
 /** Bounded read for plan clusters and question mapping. */
 const MAX_CARDS_FOR_PLANS = 400;
-/** Similarity floor for mapping a pasted question to cards (plan D16). */
-const QUESTION_MATCH_FLOOR = 0.45;
 const QUESTION_MATCH_LIMIT = 8;
 
 type PlanCardRow = ClusterCardRow & { explanation: string | null };
@@ -1356,7 +1356,7 @@ export async function ingestQuestions(data: IngestQuestionsInput) {
         logger.warn('ingestQuestions', 'card mapping failed', { message: error.message });
         return { text, cardIds: [] as string[] };
       }
-      return { text, cardIds: (data ?? []).filter((row) => (row.similarity ?? 0) >= QUESTION_MATCH_FLOOR).map((row) => row.id) };
+      return { text, cardIds: questionMatches(data ?? []) };
     });
 
     const { data: inserted, error: insertError } = await supabase
@@ -1493,7 +1493,7 @@ async function generateRepairDrill(input: { deckId: string; cardId: string; atte
       p_query_embedding: vectorRow.embedding,
       p_limit: 4,
     });
-    const near = (neighbours ?? []).find((row) => row.id !== input.cardId && (row.similarity ?? 0) >= MIN_CONTEXT_SIMILARITY && cardsById.has(row.id));
+    const near = (neighbours ?? []).find((row) => row.id !== input.cardId && (row.similarity ?? 0) >= CONFUSABLE_FLOOR && cardsById.has(row.id));
     if (near) {
       partner = cardsById.get(near.id) ?? null;
       format = 'distinguish';
diff --git a/src/app/api/chat/route.ts b/src/app/api/chat/route.ts
index eee9a29..5390c09 100644
--- a/src/app/api/chat/route.ts
+++ b/src/app/api/chat/route.ts
@@ -268,6 +268,9 @@ export async function POST(request: NextRequest) {
             session_id: activeSessionId,
             context_count: context.cards.length,
             grounded: context.grounded,
+            // Production evidence for the grounding floor (plan §3.5): the best
+            // similarity seen, above or below it.
+            top_similarity: context.topSimilarity,
             prompt_chars: message.length,
             response_chars: answer.length,
           },
diff --git a/src/app/dashboard/(focus)/[deckId]/study/page.tsx b/src/app/dashboard/(focus)/[deckId]/study/page.tsx
index e3e92a8..55de0e4 100644
--- a/src/app/dashboard/(focus)/[deckId]/study/page.tsx
+++ b/src/app/dashboard/(focus)/[deckId]/study/page.tsx
@@ -16,6 +16,13 @@ import { DEFAULT_EASE_FACTOR } from '@/lib/sm2';
 import { removeDeckTagFromTitle } from '@/lib/deck-tags';
 import { loadCapstoneCandidates } from '@/lib/synthesis/loaders';
 
+/**
+ * `gradeCard` queues the lapse mnemonic with `after()`, and that work shares
+ * this route's budget. Pinned rather than left to the platform default, which
+ * is 10–15 s without Fluid compute.
+ */
+export const maxDuration = 60;
+
 type StudyPageProps = {
   params: Promise<{
     deckId: string;
diff --git a/src/components/ui/shared/FlashcardReviewClient.tsx b/src/components/ui/shared/FlashcardReviewClient.tsx
index 1f7aecf..f89815e 100644
--- a/src/components/ui/shared/FlashcardReviewClient.tsx
+++ b/src/components/ui/shared/FlashcardReviewClient.tsx
@@ -1,6 +1,7 @@
 'use client';
 
 import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
+import { pageShortcutBlocked } from '@/lib/hotkeys';
 import { m, AnimatePresence, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
 import { ArrowLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
 import Link from 'next/link';
@@ -590,6 +591,7 @@ export function FlashcardReviewClient({
     if (completed || resumeState) return;
 
     const handleKeyDown = (event: KeyboardEvent) => {
+      if (pageShortcutBlocked(event)) return;
       if (
         event.target instanceof HTMLInputElement ||
         event.target instanceof HTMLTextAreaElement
diff --git a/src/components/ui/shared/MCQMode.tsx b/src/components/ui/shared/MCQMode.tsx
index 729fb9e..1fd0743 100644
--- a/src/components/ui/shared/MCQMode.tsx
+++ b/src/components/ui/shared/MCQMode.tsx
@@ -6,6 +6,7 @@ import { CornerBrackets } from '@/components/ui/CornerBrackets';
 import { Kbd } from '@/components/ui/Kbd';
 import type { StudyGrade } from '@/lib/sm2';
 import { RichText } from '@/components/ui/shared/RichText';
+import { pageShortcutBlocked } from '@/lib/hotkeys';
 
 type MCQModeCard = {
   id: string;
@@ -74,6 +75,7 @@ export function MCQMode({
 
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
+      if (pageShortcutBlocked(event)) return;
       if (disabled || resolved) {
         return;
       }
@@ -103,6 +105,7 @@ export function MCQMode({
 
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
+      if (pageShortcutBlocked(event)) return;
       if (!resolved || disabled || !selectedOption) {
         return;
       }
diff --git a/src/components/ui/shared/QuizAssessmentClient.tsx b/src/components/ui/shared/QuizAssessmentClient.tsx
index 76e7ab4..9f74bd9 100644
--- a/src/components/ui/shared/QuizAssessmentClient.tsx
+++ b/src/components/ui/shared/QuizAssessmentClient.tsx
@@ -17,6 +17,7 @@ import { useRouter } from 'next/navigation';
 import { enrichCards } from '@/app/actions/ai-enrich';
 import { logQuizResult } from '@/app/actions/quiz';
 import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
+import { pageShortcutBlocked } from '@/lib/hotkeys';
 import { MasteryConfetti } from '@/components/ui/shared/MasteryConfetti';
 import { fireFeedback } from '@/lib/feedback-effects';
 import { useFeedbackPrefs } from '@/lib/use-feedback-prefs';
@@ -399,6 +400,7 @@ export function QuizAssessmentClient({
     }
 
     const handleKeyDown = (event: KeyboardEvent) => {
+      if (pageShortcutBlocked(event)) return;
       if (
         event.target instanceof HTMLInputElement ||
         event.target instanceof HTMLTextAreaElement
@@ -994,6 +996,7 @@ export function QuizAssessmentClient({
             <m.div
               role="dialog"
               aria-modal="true"
+              data-page-shortcuts="allow"
               aria-labelledby="quiz-paused-title"
               initial={{ opacity: 0, y: 16 }}
               animate={{ opacity: 1, y: 0 }}
diff --git a/src/components/ui/shared/synthesis/ExamDateControl.tsx b/src/components/ui/shared/synthesis/ExamDateControl.tsx
index fcb8f82..71e8895 100644
--- a/src/components/ui/shared/synthesis/ExamDateControl.tsx
+++ b/src/components/ui/shared/synthesis/ExamDateControl.tsx
@@ -6,6 +6,7 @@ import { toast } from 'sonner';
 import { setExamDate } from '@/app/actions/synthesis';
 import { Button } from '@/components/ui/button';
 import { formatActionError } from '@/lib/ai-feedback';
+import { daysToExam } from '@/lib/synthesis/schedule';
 
 const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
 
@@ -16,11 +17,9 @@ function toDateInput(iso: string | null): string {
   return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
 }
 
+/** The same count the ladder uses on the server (schedule.ts), so the two never disagree. */
 function daysUntil(iso: string | null): number | null {
-  if (!iso) return null;
-  const at = Date.parse(iso);
-  if (Number.isNaN(at)) return null;
-  return Math.ceil((at - Date.now()) / 86_400_000);
+  return daysToExam(iso, new Date());
 }
 
 /**
@@ -86,6 +85,8 @@ export function ExamDateControl({ deckId, examAt }: { deckId: string; examAt: st
         <span className={LABEL}>No exam date</span>
       ) : days < 0 ? (
         <span className={LABEL}>Exam passed</span>
+      ) : days === 0 ? (
+        <span className={LABEL}>Exam today · drills return within the day</span>
       ) : (
         <span className={`${LABEL} tnum`}>
           Exam in <span style={{ color: days <= 3 ? 'var(--state-due)' : 'var(--ink)' }}>{days}</span> {days === 1 ? 'day' : 'days'}
diff --git a/src/components/ui/shared/synthesis/SynthesisDrillClient.tsx b/src/components/ui/shared/synthesis/SynthesisDrillClient.tsx
index 62ec65d..7fc1627 100644
--- a/src/components/ui/shared/synthesis/SynthesisDrillClient.tsx
+++ b/src/components/ui/shared/synthesis/SynthesisDrillClient.tsx
@@ -17,6 +17,7 @@ import { DrillResult } from '@/components/ui/shared/synthesis/DrillResult';
 import { DrillSessionSummary, type SessionEntry, type StoredResult } from '@/components/ui/shared/synthesis/DrillSessionSummary';
 import { GenerateSynthesisDrillsButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
 import { formatActionError } from '@/lib/ai-feedback';
+import { isTypingTarget, pageShortcutBlocked } from '@/lib/hotkeys';
 import { countWords, maxWordsFor, responseText } from '@/lib/synthesis/text';
 import { EMPTY_PLAN, PlanForm, type PlanDraft } from '@/components/ui/shared/synthesis/PlanForm';
 import type {
@@ -105,15 +106,6 @@ function readPersistedAnswer(key: string): PersistedAnswer | null {
   }
 }
 
-function isTypingTarget(target: EventTarget | null): boolean {
-  return (
-    target instanceof HTMLInputElement
-    || target instanceof HTMLTextAreaElement
-    || target instanceof HTMLSelectElement
-    || (target instanceof HTMLElement && target.isContentEditable)
-  );
-}
-
 /** A UUID for the idempotency key, or null where the platform cannot mint one (an insecure context) — the check then simply runs without one. */
 function newClientAttemptId(): string | null {
   return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
@@ -546,6 +538,9 @@ export function SynthesisDrillClient({
   // 1 / 2 / 3 confidence outside inputs; Esc quit.
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
+      // A dialog above the canvas owns the keyboard: `S` here used to skip the
+      // drill behind "Leave this drill?" and delete the answer it promised to keep.
+      if (pageShortcutBlocked(event)) return;
       if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
         event.preventDefault();
         check();
diff --git a/src/lib/hotkeys.test.ts b/src/lib/hotkeys.test.ts
new file mode 100644
index 0000000..b942f2b
--- /dev/null
+++ b/src/lib/hotkeys.test.ts
@@ -0,0 +1,34 @@
+import { describe, expect, it } from 'vitest';
+import { isBlockingDialogOpen, pageShortcutBlocked } from '@/lib/hotkeys';
+
+/** A stand-in for `document` that answers only the selector the guard uses. */
+function rootWith(dialogs: { allow?: boolean }[]): ParentNode {
+  return {
+    querySelector: (selector: string) => {
+      const blocking = dialogs.some((dialog) => !dialog.allow);
+      return selector.includes('[aria-modal="true"]') && blocking ? ({} as Element) : null;
+    },
+  } as unknown as ParentNode;
+}
+
+describe('pageShortcutBlocked', () => {
+  it('lets shortcuts through when no dialog is open', () => {
+    expect(pageShortcutBlocked({ isComposing: false }, rootWith([]))).toBe(false);
+  });
+
+  it('stands down while a modal dialog is open (the drill quit dialog)', () => {
+    expect(pageShortcutBlocked({ isComposing: false }, rootWith([{}]))).toBe(true);
+  });
+
+  it('does not stand down for an overlay the page drives itself (quiz pause)', () => {
+    expect(isBlockingDialogOpen(rootWith([{ allow: true }]))).toBe(false);
+  });
+
+  it('still stands down when a real dialog opens above a page-driven overlay', () => {
+    expect(isBlockingDialogOpen(rootWith([{ allow: true }, {}]))).toBe(true);
+  });
+
+  it('ignores keys that belong to an IME composition', () => {
+    expect(pageShortcutBlocked({ isComposing: true }, rootWith([]))).toBe(true);
+  });
+});
diff --git a/src/lib/hotkeys.ts b/src/lib/hotkeys.ts
new file mode 100644
index 0000000..5770c98
--- /dev/null
+++ b/src/lib/hotkeys.ts
@@ -0,0 +1,39 @@
+/**
+ * Page-level keyboard shortcuts and the dialogs that sit above them.
+ *
+ * Every shortcut in this app is a `window` keydown listener, and so is every
+ * dialog's Escape/Tab handler — nothing stops propagation, so both run for
+ * the same key. Without a guard, `S` pressed while "Leave this drill?" is
+ * open skips the drill *behind* the dialog and deletes the answer the dialog
+ * just promised to keep.
+ *
+ * A page shortcut stands down while any modal dialog is open. An overlay the
+ * page drives itself — the quiz's pause overlay, whose `P` resumes — opts out
+ * with `data-page-shortcuts="allow"`; its page is then responsible for
+ * disabling whatever must not fire underneath it (the quiz already does).
+ */
+const BLOCKING_DIALOG = '[aria-modal="true"]:not([data-page-shortcuts="allow"])';
+
+/** A field the user is typing into; page shortcuts must not steal its keys. */
+export function isTypingTarget(target: EventTarget | null): boolean {
+  return (
+    target instanceof HTMLInputElement
+    || target instanceof HTMLTextAreaElement
+    || target instanceof HTMLSelectElement
+    || (target instanceof HTMLElement && target.isContentEditable)
+  );
+}
+
+/** A modal dialog is open over the page, so the page is out of use. */
+export function isBlockingDialogOpen(root: ParentNode = document): boolean {
+  return root.querySelector(BLOCKING_DIALOG) !== null;
+}
+
+/**
+ * Whether a page-level shortcut must ignore this event: a blocking dialog is
+ * open, or an IME composition is in progress (the key belongs to the
+ * composer). Call it first in every window-level keydown handler.
+ */
+export function pageShortcutBlocked(event: Pick<KeyboardEvent, 'isComposing'>, root: ParentNode = document): boolean {
+  return event.isComposing || isBlockingDialogOpen(root);
+}
diff --git a/src/lib/rag.ts b/src/lib/rag.ts
index 8041db9..d2d46e0 100644
--- a/src/lib/rag.ts
+++ b/src/lib/rag.ts
@@ -2,17 +2,16 @@ import type { createClient } from '@/lib/supabase/server';
 import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
 import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
 import { logger } from '@/lib/logger';
+import { QUERY_CARD_FLOOR } from '@/lib/similarity';
 
 /**
- * Cosine-similarity floor for deck-chat context.
- *
- * Starting point for text-embedding-004 on short term/definition pairs; below
- * this, matches are topically unrelated. Re-measure with
- * `scripts/calibrate-threshold.mjs` before changing it — the right value is
- * wherever the "deck covers this" and "deck does not cover this" distributions
- * separate for YOUR content.
+ * Cosine-similarity floor for deck-chat context — the query → card floor in
+ * `@/lib/similarity`, measured for gemini-embedding-001 at 768 dimensions
+ * (covered questions ≥ 0.678, uncovered same-subject questions ≤ 0.644).
+ * Re-measure with `npm run ai:retrieval` (or, against a real deck,
+ * `scripts/calibrate-threshold.mjs`) before changing it.
  */
-export const MIN_CONTEXT_SIMILARITY = 0.62;
+export const MIN_CONTEXT_SIMILARITY = QUERY_CARD_FLOOR;
 
 export type RetrievedCard = {
   id: string;
diff --git a/src/lib/similarity.test.ts b/src/lib/similarity.test.ts
new file mode 100644
index 0000000..1b6a864
--- /dev/null
+++ b/src/lib/similarity.test.ts
@@ -0,0 +1,32 @@
+import { describe, expect, it } from 'vitest';
+import { QUERY_CARD_FLOOR, questionMatches } from '@/lib/similarity';
+
+describe('questionMatches', () => {
+  it('maps nothing when even the best card is below the query floor (off-topic question)', () => {
+    // "Analyse the use of imagery in Macbeth" against an operating-systems deck.
+    const rows = [0.497, 0.489, 0.481, 0.47, 0.468, 0.462, 0.458, 0.451].map((similarity, index) => ({ id: `c${index}`, similarity }));
+    expect(questionMatches(rows)).toEqual([]);
+  });
+
+  it('keeps only the band under the best match for a covered question', () => {
+    const rows = [
+      { id: 'quantum', similarity: 0.731 },
+      { id: 'round-robin', similarity: 0.702 },
+      { id: 'context-switch', similarity: 0.668 },
+      { id: 'convoy', similarity: 0.604 },
+    ];
+    expect(questionMatches(rows)).toEqual(['quantum', 'round-robin']);
+  });
+
+  it('never drops below the query floor, however close the band', () => {
+    const rows = [
+      { id: 'a', similarity: QUERY_CARD_FLOOR + 0.01 },
+      { id: 'b', similarity: QUERY_CARD_FLOOR - 0.01 },
+    ];
+    expect(questionMatches(rows)).toEqual(['a']);
+  });
+
+  it('ignores rows without a similarity', () => {
+    expect(questionMatches([{ id: 'x', similarity: null }])).toEqual([]);
+  });
+});
diff --git a/src/lib/similarity.ts b/src/lib/similarity.ts
new file mode 100644
index 0000000..f6fc73f
--- /dev/null
+++ b/src/lib/similarity.ts
@@ -0,0 +1,52 @@
+/**
+ * Cosine-similarity floors for `gemini-embedding-001` at 768 dimensions
+ * (`outputDimensionality: 768`, `vector_cosine_ops`, pgvector `1 - (a <=> b)`).
+ *
+ * Measured 2026-09-23 on a synthetic three-topic set with the app's exact
+ * request shape (COGNIT_NEXT_HORIZON_PLAN.md §1.3, Appendix B). Two different
+ * distributions, so two families of constants — never reuse one for the other:
+ *
+ *   query → card   RETRIEVAL_QUERY against RETRIEVAL_DOCUMENT (deck chat, the
+ *                  question bank). Covered questions ≥ 0.678, same-subject
+ *                  questions the deck lacks ≤ 0.644, off-topic ≤ 0.544.
+ *   card ↔ card    RETRIEVAL_DOCUMENT on both sides (drill clustering, the repair
+ *                  partner). Within one topic every pair is ≥ 0.746; across
+ *                  topics ≤ 0.788 (p95 0.766). A query floor applied here
+ *                  rejects nothing.
+ *
+ * The vectors are NOT unit length at 768 dimensions (|v| ≈ 0.59). Cosine
+ * distance does not care; an inner-product operator (`<#>`) would. Normalise
+ * before ever switching operator class.
+ *
+ * Re-measure with `npm run ai:retrieval` before changing any value.
+ */
+
+/** Query → card: below this, a retrieved card is not evidence the deck covers the question. */
+export const QUERY_CARD_FLOOR = 0.62;
+
+/** A past-paper question maps only to cards within this band of its best match. */
+export const QUESTION_MATCH_BAND = 0.06;
+
+/** Card ↔ card: a neighbour that may share a drill. Rejects ~92 % of cross-topic pairs, ~2 % within a topic. */
+export const NEIGHBOUR_FLOOR = 0.76;
+
+/** Card ↔ card: close enough to be confused, so a repair drill asks to *distinguish* them. */
+export const CONFUSABLE_FLOOR = 0.86;
+
+type ScoredCard = { id: string; similarity: number | null };
+
+/**
+ * The cards a pasted exam question actually reaches: the best match must
+ * clear the query floor, and only cards within `QUESTION_MATCH_BAND` of it
+ * count. The old flat floor of 0.45 sat below the off-topic band, so every
+ * question — a Macbeth essay against an operating-systems deck included —
+ * "matched" all eight cards it was offered.
+ */
+export function questionMatches(rows: readonly ScoredCard[]): string[] {
+  const scored = rows.filter((row): row is { id: string; similarity: number } => row.similarity !== null);
+  if (scored.length === 0) return [];
+  const best = Math.max(...scored.map((row) => row.similarity));
+  if (best < QUERY_CARD_FLOOR) return [];
+  const floor = Math.max(QUERY_CARD_FLOOR, best - QUESTION_MATCH_BAND);
+  return scored.filter((row) => row.similarity >= floor).map((row) => row.id);
+}
diff --git a/src/lib/supabase/claims.test.ts b/src/lib/supabase/claims.test.ts
new file mode 100644
index 0000000..ad9b50b
--- /dev/null
+++ b/src/lib/supabase/claims.test.ts
@@ -0,0 +1,20 @@
+import { describe, expect, it } from 'vitest';
+import type { JwtPayload } from '@supabase/supabase-js';
+import { verifiedClaims } from '@/lib/supabase/claims';
+
+const CLAIMS = { sub: 'user-1', email: 'a@b.c' } as JwtPayload;
+
+describe('verifiedClaims (AUTH-01)', () => {
+  it('returns the claims when getClaims succeeds', async () => {
+    await expect(verifiedClaims({ auth: { getClaims: async () => ({ data: { claims: CLAIMS }, error: null }) } })).resolves.toBe(CLAIMS);
+  });
+
+  it('returns null when getClaims reports an AuthError', async () => {
+    await expect(verifiedClaims({ auth: { getClaims: async () => ({ data: null, error: new Error('invalid JWT') }) } })).resolves.toBeNull();
+  });
+
+  it('fails closed when getClaims throws — a tampered cookie payload or an expired token', async () => {
+    await expect(verifiedClaims({ auth: { getClaims: async () => { throw new SyntaxError('Unexpected token'); } } })).resolves.toBeNull();
+    await expect(verifiedClaims({ auth: { getClaims: async () => { throw new Error('JWT has expired'); } } })).resolves.toBeNull();
+  });
+});
diff --git a/src/lib/supabase/claims.ts b/src/lib/supabase/claims.ts
new file mode 100644
index 0000000..821ee6e
--- /dev/null
+++ b/src/lib/supabase/claims.ts
@@ -0,0 +1,28 @@
+import type { JwtPayload } from '@supabase/supabase-js';
+import { logger } from '@/lib/logger';
+
+/** Just the one method this needs, so the proxy's and the render's clients both fit. */
+type ClaimsClient = {
+  auth: { getClaims(): Promise<{ data: { claims: JwtPayload } | null; error: unknown }> };
+};
+
+/**
+ * `auth.getClaims()`, failing closed.
+ *
+ * auth-js returns an AuthError as `error` but RETHROWS anything else:
+ * `decodeJWT` JSON-parses the cookie's payload (a SyntaxError on a tampered
+ * or truncated cookie) and `validateExp` throws a plain `Error`. Unwrapped,
+ * either becomes a 500 on every route the proxy matches. A token that cannot
+ * be verified is a signed-out request.
+ */
+export async function verifiedClaims(supabase: ClaimsClient): Promise<JwtPayload | null> {
+  try {
+    const { data, error } = await supabase.auth.getClaims();
+    return error || !data ? null : data.claims;
+  } catch (error) {
+    logger.warn('auth', 'getClaims threw; treating the request as signed out', {
+      name: error instanceof Error ? error.name : typeof error,
+    });
+    return null;
+  }
+}
diff --git a/src/lib/supabase/session.ts b/src/lib/supabase/session.ts
index b4d3301..74ce6fe 100644
--- a/src/lib/supabase/session.ts
+++ b/src/lib/supabase/session.ts
@@ -2,6 +2,8 @@ import 'server-only';
 import { cache } from 'react';
 import { createClient } from '@/lib/supabase/server';
 import { loadDueByDeckRows } from '@/lib/dashboard-due';
+import { logger } from '@/lib/logger';
+import { verifiedClaims } from '@/lib/supabase/claims';
 
 /**
  * Per-request memoisation of the reads every chromed route repeats.
@@ -45,10 +47,9 @@ export type SessionUser = {
  */
 export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
   const supabase = await getRequestClient();
-  const { data, error } = await supabase.auth.getClaims();
-  if (error || !data) return null;
+  const claims = await verifiedClaims(supabase);
+  if (!claims) return null;
 
-  const { claims } = data;
   return {
     id: claims.sub,
     email: claims.email ?? null,
@@ -62,6 +63,30 @@ export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  */
 export const getRequestNow = cache(() => new Date());
 
+/**
+ * Work queued with `after()` runs once the response has been flushed, when a
+ * refreshed session can no longer reach the browser's cookies. supabase-js
+ * refreshes on demand whenever the access token is within 90 s of expiry, and
+ * Supabase rotates the refresh token when it does: a background write in that
+ * window strands the browser on a revoked token, and reuse detection then
+ * signs the user out. Call this before `after()` — if the token would enter
+ * the window before the work can finish (maxDuration 60 s + the 90 s margin),
+ * refresh it now, while this action can still set cookies.
+ */
+export async function ensureSessionHeadroom(minSeconds = 180): Promise<void> {
+  try {
+    const supabase = await getRequestClient();
+    const { data } = await supabase.auth.getSession();
+    const expiresAt = data.session?.expires_at;
+    if (!expiresAt || expiresAt * 1000 - Date.now() >= minSeconds * 1000) return;
+    const { error } = await supabase.auth.refreshSession();
+    if (error) logger.warn('session', 'pre-background refresh failed', { message: error.message });
+  } catch (error) {
+    // Best-effort: the action it protects must never fail because of it.
+    logger.warn('session', 'session headroom check skipped', { message: error instanceof Error ? error.message : String(error) });
+  }
+}
+
 /** Due cards per deck for the signed-in user, once per request. */
 export const getDueByDeck = cache(async (userId: string) => {
   const supabase = await getRequestClient();
diff --git a/src/lib/synthesis/schedule.test.ts b/src/lib/synthesis/schedule.test.ts
index dcab823..2a9ff1a 100644
--- a/src/lib/synthesis/schedule.test.ts
+++ b/src/lib/synthesis/schedule.test.ts
@@ -224,7 +224,10 @@ describe('exam-aware ladders (plan D19)', () => {
   it('counts whole days to the exam', () => {
     expect(daysToExam(null, NOW)).toBeNull();
     expect(daysToExam('not a date', NOW)).toBeNull();
-    expect(daysToExam(new Date(NOW.getTime() + 2.5 * DAY).toISOString(), NOW)).toBe(3);
+    expect(daysToExam(new Date(NOW.getTime() + 2.5 * DAY).toISOString(), NOW)).toBe(2);
+    // Stored as 23:59 on the exam day: the same evening is day 0, the next day's is day 1.
+    expect(daysToExam(new Date(NOW.getTime() + 6 * HOUR).toISOString(), NOW)).toBe(0);
+    expect(daysToExam(new Date(NOW.getTime() + 30 * HOUR).toISOString(), NOW)).toBe(1);
     expect(daysToExam(new Date(NOW.getTime() - DAY).toISOString(), NOW)).toBe(-1);
   });
 });
diff --git a/src/lib/synthesis/schedule.ts b/src/lib/synthesis/schedule.ts
index d3dcd8c..8601f51 100644
--- a/src/lib/synthesis/schedule.ts
+++ b/src/lib/synthesis/schedule.ts
@@ -33,12 +33,20 @@ export function ladderFor(kind: DrillKind, daysToExam: number | null): readonly
   return DISTANT_LADDER_DAYS;
 }
 
-/** Whole days from `now` to the exam, negative once it has passed, null without a date. */
+/**
+ * Whole days left before the exam: 0 on the exam day, 1 the day before, -1
+ * once it has passed; null without a date. `exam_at` is stored as 23:59 local
+ * time on the exam day (ExamDateControl), so flooring the remaining time
+ * counts calendar days. `Math.ceil` read one day long: "in 2 days" for
+ * tomorrow, "in 1 day" on the day itself, and the final-days ladder engaged
+ * a day late.
+ */
 export function daysToExam(examAt: string | null | undefined, now: Date): number | null {
   if (!examAt) return null;
   const at = Date.parse(examAt);
   if (Number.isNaN(at)) return null;
-  return Math.ceil((at - now.getTime()) / (24 * 60 * 60_000));
+  const remaining = at - now.getTime();
+  return remaining < 0 ? -1 : Math.floor(remaining / (24 * 60 * 60_000));
 }
 export const MAX_STEP: Step = 2;
 export const PARTIAL_RETRY_HOURS = 24;
diff --git a/src/proxy.ts b/src/proxy.ts
index 7fbc269..c505a10 100644
--- a/src/proxy.ts
+++ b/src/proxy.ts
@@ -2,6 +2,7 @@ import { createServerClient } from '@supabase/ssr';
 import { NextResponse, type NextRequest } from 'next/server';
 import type { Database } from '@/lib/database.types';
 import { publicEnv } from '@/lib/env-public';
+import { verifiedClaims } from '@/lib/supabase/claims';
 
 // ── Protected path prefixes ──
 const PROTECTED_PATHS = ['/dashboard'];
@@ -46,8 +47,7 @@ export async function proxy(request: NextRequest) {
   // `getUser()` did — minus the Auth-server round-trip that used to sit in
   // front of every page. While the project still signs with the legacy HS256
   // secret it falls back to `getUser()` on its own (see `getSessionUser`).
-  const { data: claimsData } = await supabase.auth.getClaims();
-  const claims = claimsData?.claims ?? null;
+  const claims = await verifiedClaims(supabase);
 
   const pathname = request.nextUrl.pathname;
   const isProtectedPath = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
diff --git a/src/test/live/retrieval-calibration.json b/src/test/live/retrieval-calibration.json
new file mode 100644
index 0000000..f741a63
--- /dev/null
+++ b/src/test/live/retrieval-calibration.json
@@ -0,0 +1,104 @@
+{
+  "note": "Synthetic calibration set (COGNIT_NEXT_HORIZON_PLAN.md Appendix B). Cards embed as `${term}\\n${definition}` exactly like the app.",
+  "decks": {
+    "os": [
+      ["Time quantum","The fixed CPU slice a round-robin scheduler gives a process before pre-empting it."],
+      ["Context switch","Saving the state of one process and loading another; pure overhead during which no user work runs."],
+      ["Round-robin scheduling","Pre-emptive scheduling that cycles through the ready queue giving each process one time quantum."],
+      ["Convoy effect","Short processes wait behind one long CPU-bound process under FCFS, lowering utilisation."],
+      ["Starvation","A process waits indefinitely because others are always chosen first, e.g. under strict priority scheduling."],
+      ["Aging","Gradually raising the priority of a waiting process so it cannot starve."],
+      ["Thrashing","The system spends more time paging than executing because the working sets exceed physical memory."],
+      ["Working set","The set of pages a process has referenced in its most recent window of execution."],
+      ["Paging","Dividing memory into fixed-size frames and processes into pages so memory need not be contiguous; eliminates external fragmentation."],
+      ["Page fault","A trap raised when a process touches a page not currently in physical memory."],
+      ["Deadlock","A set of processes each holding a resource and waiting for one held by another, so none can proceed."],
+      ["Mutex","A lock that allows only one thread at a time into a critical section."]
+    ],
+    "bio": [
+      ["Mitochondrion","Organelle that produces most of the cell ATP through oxidative phosphorylation."],
+      ["Ribosome","Molecular machine that translates mRNA into a polypeptide chain."],
+      ["Osmosis","Net movement of water across a selectively permeable membrane toward higher solute concentration."],
+      ["Active transport","Moving a substance against its concentration gradient using energy, usually ATP."],
+      ["Glycolysis","Cytoplasmic pathway splitting glucose into two pyruvate, netting 2 ATP and 2 NADH."],
+      ["Krebs cycle","Mitochondrial cycle oxidising acetyl-CoA to CO2 and producing NADH and FADH2."],
+      ["Mitosis","Nuclear division producing two genetically identical daughter nuclei."],
+      ["Meiosis","Two rounds of division producing four haploid gametes with genetic variation."],
+      ["Enzyme","A biological catalyst that lowers activation energy without being consumed."],
+      ["Competitive inhibition","An inhibitor binds the active site, competing with the substrate; overcome by more substrate."],
+      ["Cell membrane","Phospholipid bilayer with embedded proteins that controls what enters and leaves the cell."],
+      ["Chloroplast","Plant organelle where photosynthesis converts light energy into chemical energy."]
+    ],
+    "econ": [
+      ["Inflation","A sustained rise in the general price level, reducing the purchasing power of money."],
+      ["GDP","The market value of all final goods and services produced in an economy in a period."],
+      ["Fiscal policy","Government use of spending and taxation to influence aggregate demand."],
+      ["Monetary policy","Central bank control of interest rates and money supply to steer inflation and output."],
+      ["Opportunity cost","The value of the next best alternative given up when making a choice."],
+      ["Comparative advantage","Producing a good at a lower opportunity cost than another producer; basis for gains from trade."],
+      ["Price elasticity of demand","Responsiveness of quantity demanded to a change in price."],
+      ["Aggregate demand","Total spending on domestic output: consumption, investment, government spending and net exports."],
+      ["Multiplier effect","An initial change in spending causes a larger final change in national income."],
+      ["Unemployment rate","The share of the labour force that is without work and actively seeking it."],
+      ["Phillips curve","The short-run inverse relationship between inflation and unemployment."],
+      ["Crowding out","Government borrowing raises interest rates and reduces private investment."]
+    ]
+  },
+  "questions": {
+    "os": [
+      {"text":"why does a really small time slice make round robin slower?","kind":"covered"},
+      {"text":"what happens during a context switch","kind":"covered"},
+      {"text":"explain thrashing","kind":"covered"},
+      {"text":"how does aging stop starvation?","kind":"covered"},
+      {"text":"why do short jobs suffer behind a long one in FCFS","kind":"covered"},
+      {"text":"what is a working set","kind":"covered"},
+      {"text":"how does paging avoid external fragmentation","kind":"covered"},
+      {"text":"deadlock","kind":"covered"},
+      {"text":"mutex vs semaphore?","kind":"partial"},
+      {"text":"what is a page fault and when does it happen","kind":"covered"},
+      {"text":"how does the Linux CFS red-black tree choose the next task?","kind":"near"},
+      {"text":"what is a TLB shootdown","kind":"near"},
+      {"text":"explain copy-on-write after fork()","kind":"near"},
+      {"text":"how does RAID 5 parity work","kind":"near"},
+      {"text":"who painted the Mona Lisa","kind":"off"},
+      {"text":"best way to proof sourdough overnight","kind":"off"},
+      {"text":"what year did the Berlin Wall fall","kind":"off"}
+    ],
+    "bio": [
+      {"text":"where is most ATP made in the cell","kind":"covered"},
+      {"text":"what do ribosomes do","kind":"covered"},
+      {"text":"why does water move into a cell in a hypotonic solution","kind":"covered"},
+      {"text":"how is active transport different from diffusion","kind":"covered"},
+      {"text":"net ATP from glycolysis?","kind":"covered"},
+      {"text":"difference between mitosis and meiosis","kind":"covered"},
+      {"text":"how can adding more substrate overcome an inhibitor","kind":"covered"},
+      {"text":"photosynthesis organelle","kind":"covered"},
+      {"text":"what does an enzyme do to activation energy","kind":"covered"},
+      {"text":"how does CRISPR-Cas9 cut DNA","kind":"near"},
+      {"text":"what is the role of the Golgi apparatus","kind":"near"},
+      {"text":"explain the electron transport chain proton gradient in detail","kind":"partial"},
+      {"text":"how do action potentials propagate along an axon","kind":"near"},
+      {"text":"what is the capital of Australia","kind":"off"},
+      {"text":"how do I change a car tire","kind":"off"},
+      {"text":"recommend a good sci-fi novel","kind":"off"}
+    ],
+    "econ": [
+      {"text":"why does inflation hurt savers","kind":"covered"},
+      {"text":"what counts in GDP","kind":"covered"},
+      {"text":"how can government taxes shift aggregate demand","kind":"covered"},
+      {"text":"what tools does a central bank use","kind":"covered"},
+      {"text":"opportunity cost example","kind":"covered"},
+      {"text":"why do countries gain from trade even if one is better at everything","kind":"covered"},
+      {"text":"what is the multiplier","kind":"covered"},
+      {"text":"why might government borrowing reduce private investment","kind":"covered"},
+      {"text":"inflation unemployment tradeoff","kind":"covered"},
+      {"text":"what caused the 2008 financial crisis","kind":"near"},
+      {"text":"how does quantitative easing work","kind":"partial"},
+      {"text":"explain the Gini coefficient","kind":"near"},
+      {"text":"what is a Nash equilibrium","kind":"near"},
+      {"text":"how many bones are in the human body","kind":"off"},
+      {"text":"how to train a puppy to sit","kind":"off"},
+      {"text":"who wrote Hamlet","kind":"off"}
+    ]
+  }
+}
diff --git a/src/test/live/retrieval-calibration.live.ts b/src/test/live/retrieval-calibration.live.ts
new file mode 100644
index 0000000..31bf873
--- /dev/null
+++ b/src/test/live/retrieval-calibration.live.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it, vi } from 'vitest';
+import * as fs from 'node:fs';
+import * as path from 'node:path';
+import { loadLocalEnv } from './env';
+
+const hasKey = loadLocalEnv();
+
+vi.mock('@/lib/supabase/server', () => ({ createClient: async () => { throw new Error('not used by the retrieval gate'); } }));
+
+type Kind = 'covered' | 'partial' | 'near' | 'off';
+type Fixture = {
+  decks: Record<string, [term: string, definition: string][]>;
+  questions: Record<string, { text: string; kind: Kind }[]>;
+};
+
+const cosine = (a: number[], b: number[]) => {
+  let dot = 0;
+  let na = 0;
+  let nb = 0;
+  for (let i = 0; i < a.length; i += 1) {
+    dot += a[i] * b[i];
+    na += a[i] * a[i];
+    nb += b[i] * b[i];
+  }
+  return dot / Math.sqrt(na * nb);
+};
+
+/**
+ * The retrieval gate (plan §3.5 / §6.5): the similarity floors in
+ * src/lib/similarity.ts still separate what they are meant to separate, on
+ * the production embedding model and request shape. Three embedding
+ * requests. Run after any change to GEMINI_EMBEDDING_MODEL, the embedded
+ * text, the task types or the floors.
+ */
+describe.skipIf(!hasKey)('live retrieval — the similarity floors still separate', () => {
+  it('query → card and card ↔ card floors hold on the calibration set', async () => {
+    const { embedTexts } = await import('@/lib/embeddings');
+    const { NEIGHBOUR_FLOOR, QUERY_CARD_FLOOR } = await import('@/lib/similarity');
+    const set = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/test/live/retrieval-calibration.json'), 'utf8')) as Fixture;
+
+    const cards = Object.entries(set.decks).flatMap(([deck, rows]) => rows.map(([term, definition]) => ({ deck, text: `${term}\n${definition}` })));
+    const questions = Object.entries(set.questions).flatMap(([deck, rows]) => rows.map((row) => ({ deck, ...row })));
+    const cardVectors = await embedTexts(cards.map((card) => card.text), { taskType: 'RETRIEVAL_DOCUMENT' });
+    const questionVectors = await embedTexts(questions.map((question) => question.text), { taskType: 'RETRIEVAL_QUERY' });
+
+    const topByKind: Record<Kind, number[]> = { covered: [], partial: [], near: [], off: [] };
+    questions.forEach((question, qi) => {
+      const top = Math.max(...cards.flatMap((card, ci) => (card.deck === question.deck ? [cosine(questionVectors[qi], cardVectors[ci])] : [])));
+      topByKind[question.kind].push(top);
+    });
+
+    const within: number[] = [];
+    const across: number[] = [];
+    for (let i = 0; i < cards.length; i += 1) {
+      for (let j = i + 1; j < cards.length; j += 1) {
+        (cards[i].deck === cards[j].deck ? within : across).push(cosine(cardVectors[i], cardVectors[j]));
+      }
+    }
+
+    const coveredMin = Math.min(...topByKind.covered);
+    const offMax = Math.max(...topByKind.off);
+    const nearGrounded = topByKind.near.filter((score) => score >= QUERY_CARD_FLOOR).length / topByKind.near.length;
+    const crossRejected = across.filter((score) => score < NEIGHBOUR_FLOOR).length / across.length;
+    const withinRejected = within.filter((score) => score < NEIGHBOUR_FLOOR).length / within.length;
+    console.log(`retrieval · covered min ${coveredMin.toFixed(3)} · off-topic max ${offMax.toFixed(3)} · near grounded ${(nearGrounded * 100).toFixed(0)}% · neighbour floor rejects ${(crossRejected * 100).toFixed(0)}% cross / ${(withinRejected * 100).toFixed(0)}% within`);
+
+    // Measured 2026-09-23: 0.678 / 0.544 / 20 % / 92 % / 2 %.
+    expect(coveredMin).toBeGreaterThanOrEqual(QUERY_CARD_FLOOR + 0.02);
+    expect(offMax).toBeLessThan(QUERY_CARD_FLOOR - 0.03);
+    expect(nearGrounded).toBeLessThanOrEqual(0.3);
+    expect(crossRejected).toBeGreaterThanOrEqual(0.85);
+    expect(withinRejected).toBeLessThanOrEqual(0.05);
+  });
+});
```

