# Cognit — Exhaustive Improvement Plan

**Audited:** 2026-09-16 · **Against:** `main` @ `80006cd` (tree clean) · **Gate at audit time:** `npx tsc --noEmit` clean · `npm test` **336 passed / 32 files** · 35 migrations on disk, `202609150900_micro_synthesis_phase3.sql` **not applied**
**Method:** every Server Action, the SSE route, the proxy, both dashboard layouts, all five route pages, the pure libraries, all 35 migrations, the design tokens and the seven synthesis components were read end to end. Where a claim depends on library behaviour (the Gemini SDK's config merge, pgvector's filtered-scan semantics) it was verified against `node_modules` or the vendor docs, not assumed. Contrast ratios were computed, not copied from the design system.
**Companions:** `COGNIT_HANDOFF.md` (invariants), `COGNIT_MICRO_SYNTHESIS_SPEC.md` (§12 status), `COGNIT_MICRO_SYNTHESIS_AUDIT.md` (Phase 3 record), `COGNIT_DESIGN_SYSTEM.md`.

---

## 0. Executive summary — read this if nothing else

The codebase is in far better shape than most at this stage: RLS everywhere, `SECURITY INVOKER` only, append-only history, atomic AI reservations, server-side re-grading, a pure and tested scheduling layer. The hardening program and the synthesis audit did their jobs. What remains is a different class of problem — **the seams between well-built parts**, plus a handful of places where an invariant was broken quietly after it was written down.

Three things correct a premise in the brief:

1. **Micro-Synthesis Phase 2 is already implemented and committed** (`b1a0e2b`, `80006cd`): `StudyCapstoneOffer` is mounted in `FlashcardReviewClient.tsx:859`, `DueNowBand` carries the `dueDrills` reading (`DueNowBand.tsx:28,138–156`), `DeckSessionLauncher` hosts `SynthesisLauncher`, and `AddAsCardForm` exists. What is *not* done is the deploy (`supabase db push`, `gen types`) and the absorption loop's back half — provenance, enrichment and embedding of the absorbed card. §3 is scoped to that, not to re-writing components that exist.
2. **The model is not Gemini 2.5 Flash.** `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` (`src/lib/env-server.ts:14`) and the embedding model is `gemini-embedding-001` (`:15`). The second one matters: `MIN_CONTEXT_SIMILARITY = 0.62` (`src/lib/rag.ts:15`) was set for `text-embedding-004` and has not been re-measured since the swap (`22de6f5`). Every grounded/ungrounded decision in deck chat, and every embedding-neighbour cluster in drill generation, runs on an uncalibrated threshold.
3. **The stats destination is not "long-disabled" — it was deleted** with the dock (`AppRail.tsx:19–23`). §4.1 designs `/dashboard/stats` from scratch on top of the aggregation RPCs that already exist.

**The ten findings that matter most**, in the order I would fix them:

| # | Finding | Where | Class |
|---|---|---|---|
| A1 | `updateCard` makes an **unmetered, unguarded embedding call** on every edit — breaks invariants #1 and #7 | `src/app/actions/card.ts:110–135` | Spend / invariant |
| A2 | `gradeCard` runs the mnemonic model call **inline**; the client blocks the next grade on it (`isSubmittingGrade`) — a 1–4 s stall on exactly the "Again" press | `study.ts:115–126`, `FlashcardReviewClient.tsx:330` | UX latency |
| A3 | Request-level `generationConfig` **replaces** the model-level one in `@google/generative-ai` 0.24 — `generateCards`, `enrichCards`, deck-chat followups silently run at the model default temperature, not 0.1 | `ai-generate.ts:255`, `ai-enrich.ts:197`, `route.ts:306` (verified in `dist/index.mjs:1375`) | Determinism |
| A4 | `/api/chat` ignores `request.signal` — a client abort leaves the model streaming, the turn persisted and the follow-up call running | `route.ts:107–229` | Spend |
| A5 | **"Due" means two different things**: the dashboard counts `new` cards as due (`get_due_cards_by_deck`), the deck page excludes them (`get_deck_schedule_breakdown`). The two numbers disagree on every deck with unstudied cards | `202609070900_phase25_corrections.sql`, `202609141000_schedule_summary_rpcs.sql` | Correctness |
| A6 | Study queue order is **creation time**, not reviews-before-new; `next_review_at.is.null` is dead (column is `NOT NULL DEFAULT now()`); no daily new-card cap | `study/page.tsx:63–88`, `20260402_core…sql:26` | Pedagogy |
| A7 | **Zero** RLS policies wrap `auth.uid()` in `(select …)`; the `cards` policies nest an `EXISTS` over `decks` that is re-evaluated per row | all 35 migrations (`grep -c "(select auth.uid())" → 0`) | DB perf |
| A8 | **Nine FK columns have no index**, incl. `study_logs(card_id)` and `card_mastery_state(card_id)` — every card delete cascades through a sequential scan of the two largest tables | §5.1 | DB perf |
| A9 | Three `auth.getUser()` network calls per navigation (proxy, layout, page) and `loadDueByDeckRows` runs twice per dashboard render | `proxy.ts:45`, `(shell)/layout.tsx:43,56`, `(shell)/page.tsx:267,241` | Latency |
| A10 | `--ink-dimmer` fails AA on the dark `.raised` plane (4.31:1) and the light `.well` (4.40:1); `--border-control` fails 1.4.11 on dark `.raised` (2.77:1) | `globals.css:280,292,201`, `DeckSessionLauncher.tsx:114,130,165` | A11y |

Everything below is organised so that §2 can be executed in one day, §3 in one afternoon plus a deploy, §5 in one migration, and §4 as three separate scoped projects.

---

## 1. Forensic audit & vulnerability matrix

Severity: **S0** silent data/spend loss or invariant breach · **S1** user-visible defect or measurable perf cost · **S2** debt that will bite at scale · **S3** hygiene.

### 1.1 Server Actions and route handlers

| ID | Sev | File:line | Finding | Consequence | Fix (§) |
|---|---|---|---|---|---|
| SA-01 | S0 | `src/app/actions/card.ts:110–135` | `updateCard` calls `embedTexts` directly: no `reserveAiCall`, no `guardAction`, no rate-limit row. | Unbounded, uncounted embedding spend from a free-text edit loop; also adds 300–800 ms to every card save. | §2.1 |
| SA-02 | S0 | `src/app/actions/ai-assist.ts:90–169` | `generateMnemonicForCard(supabase, userId, …)` is **exported from a `'use server'` file**, so Next registers it as a public POST endpoint. It is not guarded; a crafted call throws into a 500. | Unintended public surface; invariant #2's spirit. No data exposure (no privileged client), but it is a footgun that will be "fixed" wrongly later. | §2.2 |
| SA-03 | S1 | `src/app/actions/study.ts:115–126` | Mnemonic generation runs inline inside `gradeCard`, after the RPC. | The grade round-trip becomes 1–4 s on the first lapse of any card. `FlashcardReviewClient.tsx:330` refuses the next grade while `isSubmittingGrade` — the optimistic UI is defeated exactly when the student is struggling. | §2.2 |
| SA-04 | S1 | `src/app/actions/ai-generate.ts:89` | Reservation taken **before** deck ownership, file type, size, magic bytes and PDF quality are checked (lines 94–177). | An image-only PDF or a 12 MB upload burns one of 20 hourly `generate_cards` slots and a daily-ceiling row for nothing. | §2.3 |
| SA-05 | S1 | `ai-generate.ts:244–304` | Chunks processed **sequentially**; `MAX_CHUNKS = 12`, each with `maxAttempts: 2` and up to 8 s backoff. | Worst case ≈ 12 × (call + retry) ≈ 60–96 s against `maxDuration = 60` on the invoking page. A long PDF 504s with the reservation spent and no cards saved. | §2.3 |
| SA-06 | S1 | `ai-generate.ts:255–258`, `ai-enrich.ts:197–200`, `api/chat/route.ts:306–309` | Request-level `generationConfig` **replaces** the model-level config (`GenerativeModel.generateContent` spreads request params over `{ generationConfig: this.generationConfig, … }` — `node_modules/@google/generative-ai/dist/index.mjs:1375`). `synthesis.ts:266` already restates everything for this reason; the other three do not. | Extraction and enrichment run at the model's default temperature (1.0 on Gemini 2.5/3.5 families), not the intended 0.1. "Same PDF → same cards" is not true today. `maxOutputTokens` is also dropped. | §2.4 |
| SA-07 | S0 | `src/app/api/chat/route.ts:107–229` | The `ReadableStream` never observes `request.signal`; there is no `cancel()` handler. `use-deck-chat-stream.ts:52` aborts on navigation / re-send. | Every cancelled turn still consumes the full model stream, persists a turn the user never saw, and runs the follow-up call. On mobile (backgrounded tab) this is the common case. | §2.5 |
| SA-08 | S2 | `route.ts:251–294`, `:196` | `persistTurn` writes `followup_suggestions: []`; the follow-ups generated at `:196` are streamed but never stored. | Reopening a session loses every follow-up chip. The schema column is dead weight. | §2.5 |
| SA-09 | S2 | `route.ts:156–173` vs `actions/chat.ts:393–418` | Two full implementations of deck chat (streaming route + non-streaming action). The action is referenced only by the barrel `src/app/actions.ts:18`; no component calls it. | Two prompts, two persistence paths, two places to fix A4. | §2.5 (delete) |
| SA-10 | S1 | `src/app/actions/_shared.ts:189` | `reserve_ai_call` failure handling treats **any** `P0001` as a rate limit. The RPC also raises `'Unauthorized'` with the default `P0001`. | An expired session inside an AI action shows "AI limit reached … try again in 60 minutes". | §2.6 |
| SA-11 | S1 | `_shared.ts:117–132` + `reserve_ai_call` | Daily ceiling is a separate TS round-trip before the RPC and **fails open** (`if (error) return null`). One reservation covers up to 5 drill calls / 8 enrichment batches / 2 chat calls, so the ceiling counts rows, not calls. | One extra query per AI action; a transient DB error disables the ceiling silently; the 300/day figure over-states protection by 2–8×. | §5.3 |
| SA-12 | S1 | `src/app/actions/quiz.ts:103–214` | `apply_quiz_sm2_batch` (atomic) is followed by two **separate** inserts into append-only tables. | If `quiz_card_results` fails, a `quiz_results` row with no details exists forever (DENY policies forbid cleanup). | §5.2 |
| SA-13 | S1 | `src/app/actions/synthesis.ts:688–765` | Cards → attempt → drill are three statements; a duplicate `client_attempt_id` (two tabs, double-tap after timeout) reaches the insert **after** the model call and fails `23505` with "The check ran but could not be saved." | The idempotency key protects the *sequential* replay only; the concurrent case pays twice and shows an error. `attempt_count` is read-modify-write (`:757`). | §5.2 |
| SA-14 | S2 | `study.ts:78–112`, `quiz.ts:117–169`, `(shell)/page.tsx:127–143`, `[deckId]/page.tsx:135–142,168–185,228–260` | "Migration not applied" TypeScript fallbacks still exist (handoff P1.1). `study.ts`'s fallback does the card update and the `study_logs` insert as two statements, un-atomically, and would also run if the RPC failed for an *ownership* reason. | Doubles the branch count in the data layer; the study fallback is a weaker security posture than the RPC it shadows. | §2.7 |
| SA-15 | S2 | `src/app/actions/deck.ts:56–106` | `deleteDeck`/`updateDeck` return `undefined` on success, take unvalidated positional strings, and do not report "0 rows affected". `deleteCard(cardId, deckId)` (`card.ts:184`) likewise. | Callers cannot distinguish success from a no-op on a wrong id; a typo'd id is silently "deleted". | §2.7 |
| SA-16 | S3 | `study.ts:143–147` | `finishStudySession` is unauthenticated and revalidates arbitrary `/dashboard/${deckId}`. | Cheap, but it is the only action with no auth at all. | §2.7 |
| SA-17 | S2 | `quiz.ts:258–263` | `getQuizHistory` still fetches up to 20 000 `quiz_card_results` rows (handoff P2.4). | The Insights tab for a heavy user ships megabytes for a list that shows misses only. | §5.4 |
| SA-18 | S2 | `ai-enrich.ts:246–270` | One `UPDATE` per enriched card, in windows of 3. | A 200-card import is ~200 statements under RLS. `apply_card_embeddings_batch` already shows the pattern. | §5.2 |
| SA-19 | S3 | `src/app/api/keep-alive/route.ts:25–28` | Secret compared with `!==`. | Not constant-time. Use `timingSafeEqual`. | §2.7 |

### 1.2 Database, RLS and query tier

| ID | Sev | Where | Finding | Consequence | Fix |
|---|---|---|---|---|---|
| DB-01 | S1 | every policy in every migration | `auth.uid()` is never wrapped as `(select auth.uid())`. Postgres treats the bare call as volatile-per-row; wrapped, it is an InitPlan evaluated once. | Measured elsewhere at 10–100× on wide scans; here it hits every `cards` read (the `cards` SELECT policy is `EXISTS (select 1 from decks …)` per row). | §5.1 |
| DB-02 | S1 | `study_logs(card_id)`, `card_mastery_state(card_id)`, `card_mastery_state(deck_id)`, `synthesis_attempts(deck_id)`, `synthesis_attempts(revision_of)`, `synthesis_attempt_feedback(user_id)`, `deck_chat_sessions(user_id)`, `deck_chat_messages(user_id)`, `deck_chat_embedding_metadata(user_id)` | FK columns with no leading-column index. `card_mastery_state`'s PK is `(user_id, deck_id, card_id)` — useless for a lookup by `card_id`. | `bulkDeleteCards` of 200 cards = 200 × seq scan of `study_logs` + 200 × seq scan of `card_mastery_state`. Deleting a deck cascades through `synthesis_attempts` unindexed. | §5.1 |
| DB-03 | S3 | `cards_deck_id_idx` vs `cards_deck_id_created_at_idx`; `decks_user_id_idx` created twice; `cards_next_review_at_idx` | Redundant indexes on the hottest write table (`cards` is written on every grade). | Write amplification; `cards_next_review_at_idx` (global) is likely never chosen — every due query filters by deck or user first. | §5.1 |
| DB-04 | S1 | `search_user_cards_by_embedding` (`202609011400…sql`) | Cross-user HNSW scan with a post-filter on `decks.user_id`. pgvector returns `ef_search` (40) nearest candidates *globally*, then filters. | Once the table holds more than a few thousand vectors from other users, a user's own 300 cards mostly fall outside the 40 candidates → the palette's semantic search returns 0–2 rows regardless of `limit`. Per-deck search is safe (planner uses the `deck_id` b-tree and sorts exactly). | §5.1 |
| DB-05 | S1 | `get_due_cards_by_deck` vs `get_deck_schedule_breakdown` | Different definitions of "due" (see A5). | Dashboard band, `DeckGrid.dueCount`, `CommandPalette.totalDue` and the rail all say one number; the deck header and launcher say another. | §5.2 |
| DB-06 | S2 | `reserve_ai_call` | The `count(*)` per reservation scans `(user_id, created_at)` then filters `action` in the heap. | Fine at 300 rows/day; add `action` to the index before it isn't. | §5.1 |
| DB-07 | S2 | `get_card_schedule_summary`, `get_due_cards_by_deck`, `get_weakest_concepts`, `search_user_cards_by_embedding` | Take `p_user_id` **and** check `auth.uid()`. | Harmless but every caller passes a value the function then ignores; drop the parameter to remove the "what if they differ" question. | §5.3 |
| DB-08 | S2 | `202609150900…sql` | Unapplied. Code already writes `confidence`, `client_attempt_id`, `revision_of`, `link_count`, `last_links_covered`. | **Every synthesis check in production fails at the attempt insert, after the model call**, until this is pushed (spec §12.0). | §3.1 |

### 1.3 Next.js / React mechanics

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| NX-01 | S1 | `proxy.ts:45`, `(shell)/layout.tsx:43`, `(shell)/page.tsx:267`, every action | `supabase.auth.getUser()` is a network call to Supabase Auth. Three per navigation; the layout and page each also run `loadDueByDeckRows`. | §2.8: `React.cache`'d `getSessionUser()`; `getClaims()` in the proxy. |
| NX-02 | S1 | `[deckId]/page.tsx:293,318,443` | Three sequential waves: snapshot → (quiz-ready, topics) → synthesis readings. | §2.8: one wave, or one RPC (§5.2 `get_deck_overview`). |
| NX-03 | S1 | `study/page.tsx:34–90` | Three sequential waves: deck → count → (cards, capstone). The count exists only for the empty state. | §2.8 |
| NX-04 | S2 | `[deckId]/page.tsx:275–283` | The 60-card page (with `mcq_distractors`, `topic_tags`) is fetched for **every** tab, including `chat` and `insights`. | Gate on `activeTab`. |
| NX-05 | S2 | `FlashcardReviewClient.tsx:566–585` | Grade hotkeys ignore `event.repeat`. A held `3` after the pending grade resolves commits the next card. | `if (event.repeat) return;` |
| NX-06 | S2 | `FlashcardReviewClient.tsx:330` | `commitGrade` returns while `isSubmittingGrade`. Grades are not queued. | §2.2: outbox with sequential flush; never block input on the network. |
| NX-07 | S3 | `src/app/actions.ts` | Barrel re-export of every action keeps `chatWithDeck` (dead) alive and defeats per-route action tree-shaking. | Delete after §2.5. |
| NX-08 | S3 | `next.config.ts:36` | `script-src 'unsafe-inline'` in production (handoff P1.6). | §4.4 nonce CSP. |
| NX-09 | S3 | `MotionProvider.tsx` | `domMax` is loaded for one `drag` (`FlashcardReviewClient.tsx:890`). | Correct as is; do not "optimise" (handoff §3.1 #5). Noted so nobody does. |

### 1.4 AI pipeline

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| AI-01 | S0 | `src/lib/rag.ts:15`, `env-server.ts:15` | Threshold tuned for `text-embedding-004`; model is `gemini-embedding-001` @ 768 dims. The two models have visibly different cosine distributions (gemini-embedding-001 sits higher for unrelated pairs). | §2.9: run `scripts/calibrate-threshold.mjs` before anything else in this list; store the result in `rag.ts` with the model name in the comment. |
| AI-02 | S1 | all `getGeminiJsonModel()` callers | No `thinkingConfig`. On thinking-capable models thinking tokens are billed and drawn from the output budget. `synthesis.ts` logs `thoughtsTokenCount` but nothing sets a budget. | §2.4: `thinkingConfig: { thinkingBudget: 0 }` for classification (check, enrich, extraction); small budget only where quality measurably benefits. |
| AI-03 | S2 | `package.json` | `@google/generative-ai` 0.24 is the deprecated SDK (no types for `thinkingConfig`, `propertyOrdering`, `cachedContent` helpers, no `signal` on stream). | §4.5: migrate to `@google/genai`. |
| AI-04 | S1 | `ai-generate.ts:180–196`, `ai-enrich.ts:163–180`, `ai-assist.ts:114,203,287`, `rag.ts:89` | Untrusted-data clauses are present everywhere (good). But none of the *system* prompts use a delimiter/nonce for the untrusted block; only the drill check does (`prompts.ts:104`). | §2.4: adopt the nonce fence from `prompts.ts` in `rag.ts` and `ai-generate.ts`. |
| AI-05 | S2 | `_shared.ts:100–103` | `sanitizeAiInputText` redacts `^(system|assistant|developer|user)\s*:` — flagged in the synthesis audit (R9) as a false-positive source on systems/HCI decks. | Scope the pattern to line-start **after a blank line or at text start**, and log redaction counts so the false-positive rate is measurable. |
| AI-06 | S2 | `route.ts:196,297–319` | Two model calls per chat turn (answer + follow-ups) on one reservation. | Either count both (`reserveAiCall(…, { calls: 2 })`, §5.3) or generate follow-ups in the same call by asking for a trailing `\n\n---\n{"suggestions":[…]}` block and splitting at the marker. |
| AI-07 | S1 | `ai-enrich.ts:72–100` | The parser drops a card when the model returns 2 usable distractors. Correct — but `failedCardIds` is returned and no retry with a *different* prompt is attempted. | Retry failed ids once with "produce five candidates; the server will select three" — `selectUsableDistractors` already filters. |
| AI-08 | S2 | `embeddings.ts:5` comment | "text-embedding-004 caps at 100" — the model is gemini-embedding-001 (cap is 100 as well but 250 for `batchEmbedContents` on newer versions). | Comment drift; verify and fix. |

### 1.5 UI / UX / accessibility

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| UX-01 | S1 | `globals.css:280` (`--ink-dimmer` dark `#82828b`), `:292` (`--raised-bg` dark `#1f1f23`), `:201` (`--recess` light `#f4f4f5`) | Computed ratios: `ink-dimmer` on dark `.raised` **4.31:1**, on light `.well` **4.40:1**. Both carry 10–12 px text (`DeckSessionLauncher.tsx:114,130,165,168`; deck page recent-cards well `:562`). `--border-control` on dark `.raised` **2.77:1** (< 3:1, WCAG 1.4.11) — the chips at `DeckSessionLauncher.tsx:136,192`. | §2.10: one token per theme. |
| UX-02 | S1 | `src/components/ui/textarea.tsx:15`; `AddAsCardForm.tsx:80,92`; `DeckActions.tsx:51`; `CreateDeckModal.tsx:175`; `PDFUploadZone.tsx:248`; `TopicGenerateRow.tsx:37`; `DashboardSearch.tsx:24` | Text controls below 16 px on mobile. `input.tsx:27` got this right (`text-base sm:text-sm`); every `<textarea>`, every `<select>`, and two raw `<input>`s did not, and `AddAsCardForm` actively overrides the fix. | §2.10 |
| UX-03 | S1 | `CommandPalette.tsx`, `AccountControl.tsx`, `ConfirmDialog.tsx`, `BulkImportModal.tsx` | No body scroll lock; the page behind a modal scrolls on iOS (scroll bleed). `useModalDialog` traps focus but not scroll. | §2.10: `useScrollLock` in `useModalDialog`. |
| UX-04 | S2 | `FlashcardReviewClient.tsx:890–897` | Swipe threshold is offset-only (`±120px`); a fast short flick is ignored, a slow drag past 120 px commits even when released back to centre. | Use `info.velocity.x` as well: commit if `|offset| > 120 || |velocity| > 500`. |
| UX-05 | S2 | `StudyCapstoneOffer.tsx:38` | `dismissed` is component state; the study page's resume path re-renders the offer after a reload. | Persist the dismissed drill id in `sessionStorage` under the study session key. |
| UX-06 | S2 | `AddAsCardForm.tsx:50` | Absorbed card is created with `source: 'manual'`, no `imported_by`, not enriched, not embedded; "Added" state is local. | §3.3 |
| UX-07 | S2 | `(shell)/page.tsx:413` | Dashboard drills reading links to the deck **overview**, not to the drill canvas. | `/dashboard/${deckId}/synthesis?count=3` — one click fewer. |
| UX-08 | S2 | `DeckGrid.tsx` | Rows show cards due, not drills due, so the dashboard's drills reading has no per-deck counterpart. | §3.2 |
| UX-09 | S3 | `AppRail.tsx` | Rail has three destinations; there is no route for stats/analytics at all. | §4.1 |
| UX-10 | S3 | `FlipCard.tsx:77,82`, `MCQMode.tsx:166`, `SynthesisDrillClient.tsx` | Card text is rendered as plain text nodes. No math, no code. | §4.2 |

---

## 2. Immediate P0 quick wins — one working day

Each item is independent, small, and covered by an existing test file or gets one. Order is by leverage per minute.

### 2.1 Stop the unmetered embedding call in `updateCard` (SA-01)

The action already nulls `embedding` (`card.ts:94`), which is the right thing — an edited card *should* drop its stale vector. The inline re-embed is the problem. Two acceptable designs: (a) drop it and let `DeckChatWidget`'s existing pending-count + sync button re-embed lazily; (b) keep it but reserve, guard, and move it off the response path with `after()`. (b) preserves today's "chat sees my edit immediately" behaviour, so:

```ts
// src/app/actions/card.ts — replace lines 108–139
import { after } from 'next/server';
import { reserveAiCall, recordAiUsage } from './_shared';

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);
  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');

  // Re-embed off the response path. Reserved like every other model call
  // (invariant #7); a rate-limited edit simply leaves `embedding` null and the
  // deck-chat sync button picks it up.
  after(async () => {
    const reservation = await reserveAiCall(supabase, user.id, 'sync_embeddings', { card_id: result.data.id, trigger: 'update_card' });
    if (!reservation.ok) return;
    try {
      // embedTexts already runs under withGeminiRetry — do not wrap it again.
      const [vector] = await embedTexts([`${result.data.front}\n${result.data.back}`], { taskType: 'RETRIEVAL_DOCUMENT' });
      if (!vector) return;
      const { error } = await supabase
        .from('cards')
        .update({ embedding: toVectorLiteral(vector) })
        .eq('id', result.data.id)
        .eq('deck_id', result.data.deck_id);
      if (error) logger.warn('updateCard', 'embedding write failed', { cardId: result.data.id, message: error.message });
      await recordAiUsage(supabase, user.id, 'sync_embeddings', { card_id: result.data.id, synced_cards: 1 }, reservation.reservationId);
    } catch (error) {
      logger.warn('updateCard', 'embedding skipped', { cardId: result.data.id, message: error instanceof Error ? error.message : String(error) });
    }
  });

  return { success: true };
```

`after()` runs once the response has been sent and keeps the function alive on Vercel; the Supabase client created from request cookies stays valid for its duration. **Test:** `card.test.ts` — mock `after` to invoke immediately; assert `reserveAiCall` is called with `'sync_embeddings'` and the response resolves before `embedTexts` is awaited.

### 2.2 Take the mnemonic call out of the grade path (SA-02, SA-03, NX-06)

Move the function out of the `'use server'` file so it stops being an endpoint, then schedule it after the response.

```ts
// src/lib/mnemonic.ts  (moved verbatim from ai-assist.ts:90–169; no 'use server')
export async function generateMnemonicForCard(supabase, userId, deckId, card) { /* unchanged */ }
```

```ts
// src/app/actions/study.ts:115–126 → 
  if (shouldGenerateMnemonic) {
    after(() =>
      generateMnemonicForCard(supabase, user.id, result.data.deck_id, {
        id: card.id, front: card.front, back: card.back, mnemonic: card.mnemonic,
      }).catch((error) => logger.warn('gradeCard', 'mnemonic generation skipped', { error })),
    );
  }
```

Then stop gating input on the network in the client. Replace the `isSubmittingGrade` early-return at `FlashcardReviewClient.tsx:330` with a per-session outbox:

```ts
// FlashcardReviewClient.tsx — new ref + flush; commitGrade no longer awaits the action
const outbox = useRef<Array<{ cardId: string; grade: StudyGrade; durationMs: number; rollback: () => void }>>([]);
const flushing = useRef(false);

const flushOutbox = useCallback(async () => {
  if (flushing.current) return;
  flushing.current = true;
  try {
    while (outbox.current.length > 0) {
      const job = outbox.current[0];
      try {
        const result = await gradeCard({ card_id: job.cardId, deck_id: deckId, grade: job.grade, duration_ms: job.durationMs });
        if (result?.success && typeof result.nextReviewAt === 'string') {
          setScheduledReviews((prev) => [...prev, result.nextReviewAt as string]);
        } else if (result?.error) {
          toast.error(typeof result.error === 'string' ? result.error : 'Failed to save grade');
          job.rollback();
          outbox.current = [];          // everything after a failed grade is stale
          return;
        }
      } catch {
        toast.error('Failed to save card grade. Please try again.');
        job.rollback();
        outbox.current = [];
        return;
      }
      outbox.current.shift();
    }
  } finally {
    flushing.current = false;
  }
}, [deckId]);
```

`commitGrade` pushes `{ …, rollback }` where `rollback` restores the pre-grade `sessionCards/index/showAnswer/gradeLog` snapshot it already captures at `:332–335`, then calls `void flushOutbox()`. The `beforeunload` guard at `:600` should also test `outbox.current.length > 0`. Keyboard: add `if (event.repeat) return;` at the top of `handleKeyDown` (`:548`) — NX-05.

### 2.3 Reserve after validation; parallelise chunks (SA-04, SA-05)

```ts
// ai-generate.ts — move lines 89–92 to just before "── 6. Call Gemini ──" (after line 177)
    const reservation = await reserveAiCall(supabase, user.id, 'generate_cards', {
      deck_id: parsed.data.deck_id, chunk_count: chunks.length, file_size_bytes: file.size,
    });
    if (!reservation.ok) return { error: reservation.error };
```

Replace the sequential `for (const chunk of chunks)` at `:244–304` with the same bounded pool `ai-enrich.ts` uses. Cross-chunk de-duplication (`usedFrontKeys`) stays correct because it is applied when *merging* results, not when *requesting* them — the "do not repeat these terms" hint in the user turn becomes best-effort (seed it from the previous wave only):

```ts
    const GENERATE_CONCURRENCY = 3;
    for (let i = 0; i < chunks.length; i += GENERATE_CONCURRENCY) {
      if (allCandidates.length >= parsed.data.count * 2) break;
      const wave = chunks.slice(i, i + GENERATE_CONCURRENCY);
      const knownTerms = [...usedFrontKeys].slice(-40);           // from earlier waves
      const settled = await Promise.allSettled(wave.map((chunk) => generateChunk(chunk, knownTerms)));
      for (const outcome of settled) {
        if (outcome.status === 'rejected') { failedChunks += 1; continue; }
        for (const candidate of parseAndRankGeneratedCards(outcome.value, sourceTextLower, usedFrontKeys)) {
          const key = normalizeFrontKey(candidate.front);
          if (!key || usedFrontKeys.has(key)) continue;
          usedFrontKeys.add(key);
          allCandidates.push(candidate);
        }
      }
    }
```

Worst case drops from ≈ 96 s to ≈ 4 waves × (12 s + retry) ≈ 30 s, inside `maxDuration = 60`.

### 2.4 One request builder; determinism restored (SA-06, AI-02, AI-04)

```ts
// src/app/actions/_shared.ts — add
import type { GenerationConfig, Schema } from '@google/generative-ai';

/**
 * Request-level generationConfig REPLACES the model-level one in SDK 0.24
 * (GenerativeModel.generateContent spreads the request over its own config).
 * Every JSON call must therefore restate temperature and the cap here, or it
 * silently runs at the model default. `thinkingBudget: 0` is deliberate for
 * classification/extraction: thinking tokens are billed and drawn from the
 * same output budget; none of these tasks benefit from them.
 */
export function jsonGenerationConfig(input: {
  responseSchema?: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}): GenerationConfig {
  const env = getServerEnv();
  return {
    temperature: input.temperature ?? 0.1,
    topP: 0.95,
    maxOutputTokens: input.maxOutputTokens ?? env.GEMINI_MODEL_MAX_TOKENS,
    responseMimeType: 'application/json',
    ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
    // Not in 0.24's types; forwarded to the REST body unchanged (same mechanism as propertyOrdering).
    ...({ thinkingConfig: { thinkingBudget: input.thinkingBudget ?? 0 } } as object),
  };
}
```

Call sites: `ai-generate.ts:255` → `generationConfig: jsonGenerationConfig({ responseSchema })`; `ai-enrich.ts:197` → `jsonGenerationConfig({ responseSchema: ENRICHMENT_RESPONSE_SCHEMA })`; `route.ts:306` → `jsonGenerationConfig({ temperature: 0.4, maxOutputTokens: 256 })`; `synthesis.ts:266,626` → `jsonGenerationConfig({ responseSchema: …, temperature: GENERATION_TEMPERATURE })` (generation may want a small thinking budget — measure with §11.3's calibration set before turning it on). **Test:** `_shared.test.ts` — snapshot the returned object; assert `temperature === 0.1` when omitted.

Prompt hardening: reuse the drill check's nonce fence for the two prompts that embed long untrusted text. In `rag.ts:89` wrap `contextText` as `<<<CARDS ${nonce}>>> … <<<END CARDS ${nonce}>>>` and say so in the instruction; in `ai-generate.ts:180` fence `chunk.text` the same way. The model already treats the text as data; the fence removes the ambiguity of *where* the data ends, which is the only injection that has ever worked against a Gemini system instruction in practice.

### 2.5 Honour aborts; persist follow-ups; delete the dead action (SA-07, SA-08, SA-09)

```ts
// src/app/api/chat/route.ts — inside POST, before the stream
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      …
        const result = await withGeminiRetry(
          () => textModel.generateContentStream({ … }, { signal: abort.signal }),   // 0.24 accepts RequestOptions.signal
          { label: 'deck_chat_stream', maxAttempts: 2, signal: abort.signal },
        );
        for await (const chunk of result.stream) {
          if (abort.signal.aborted) break;
          …
        }
        if (abort.signal.aborted) {
          // The user left. Persist what they saw (partial), skip follow-ups.
          await persistTurn(supabase, { …, answer, followupSuggestions: [], truncated: true });
          return;
        }
      …
    },
    cancel() { abort.abort(); },
  });
```

Persist follow-ups: extend `persistTurn` with `followupSuggestions: string[]`, generate them **before** the assistant insert (they are ≈ 400 ms; the `done` event waits on them anyway), and write them into the row. Then delete `chatWithDeck` from `actions/chat.ts:307–486` and the barrel `src/app/actions.ts`. `rag.ts`'s comment "shared by the streaming route and the non-streaming Server Action" becomes untrue — update it.

### 2.6 Distinguish "Unauthorized" from "rate limited" (SA-10)

```sql
-- supabase/migrations/202609170900_reserve_ai_call_errcodes.sql
create or replace function public.reserve_ai_call(…)  -- body unchanged except:
  if v_user_id is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  …
  if v_used >= p_max_requests then raise exception 'AI_RATE_LIMIT' using errcode = 'P0001'; end if;
```

```ts
// _shared.ts:189
    if (rpcError.message?.includes('AI_RATE_LIMIT')) { … }
    if ((rpcError as { code?: string }).code === '28000') return { ok: false, error: 'You must be logged in.' };
```

### 2.7 Delete the fallbacks; give every mutation a real result (SA-14, SA-15, SA-16, SA-19)

- `study.ts:78–112`, `quiz.ts:117–169`: replace the fallback block with `return { error: sanitizeDatabaseError(rpcError, 'Failed to save your review.') }`. The RPCs are live (`npm run verify:deployment`); the fallback is now only a way to persist a grade *without* the ownership check the RPC performs.
- `(shell)/page.tsx:127–143`, `[deckId]/page.tsx:135–146,168–189,228–260`: delete the row-based fallbacks; log and return the empty shape.
- `deck.ts`: zod-validate (`z.uuid()`), select the affected row (`.select('id').maybeSingle()`), return `{ success: true }` or `{ error: 'Deck not found or access denied.' }`. Same for `deleteCard`.
- `study.ts:143`: `finishStudySession` → require a user (`requireOwnedDeck(deckId)`).
- `keep-alive/route.ts:25`: `timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedAuth))` after a length check.

### 2.8 One auth call per request; one wave per page (NX-01..03)

```ts
// src/lib/supabase/session.ts
import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/** One Supabase client and one auth round-trip per request, shared by layout, page and nested server components. */
export const getRequestClient = cache(async () => createClient());
export const getSessionUser = cache(async () => {
  const supabase = await getRequestClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
export const getDueByDeck = cache(async (userId: string, nowIso: string) =>
  loadDueByDeckRows(await getRequestClient(), userId, nowIso));
```

Use it in `(shell)/layout.tsx`, `(shell)/page.tsx`, `[deckId]/page.tsx`, `study/page.tsx`, `synthesis/page.tsx`. `React.cache` is per-request on the server, so the layout's call and the page's call collapse into one. In `proxy.ts`, swap `getUser()` for `getClaims()` — with Supabase's asymmetric JWT signing keys enabled on the project it verifies locally with no network call, and the proxy only needs "is there a valid session" plus `email_confirmed_at`:

```ts
  const { data, error } = await supabase.auth.getClaims();
  const user = error ? null : data?.claims;                  // { sub, email, exp, … } — verified locally
```

One caveat, and it is a security one: `email_confirmed_at` is **not** a JWT claim, and `user_metadata.email_verified` is user-writable via `updateUser`, so it must not be trusted for the gate at `proxy.ts:61`. Two correct options: (a) keep the "Confirm email" requirement on in Supabase Auth (the sign-in action already refuses unconfirmed accounts at `auth/actions.ts:101`, so an unconfirmed user never holds a session cookie) and drop the proxy's redundant check; or (b) keep `getUser()` only for that check. Prefer (a) — it is what the code already assumes.

Pages: collapse waves. `study/page.tsx` — drop the standalone count (`:46–49`) and use `{ count: 'exact' }` on the card query when `explicitCardIds.length === 0`; run the deck read in the same `Promise.all`. `[deckId]/page.tsx` — move `loadSynthesisReadings` and the two `>60` RPCs into `fetchSnapshot()`'s `Promise.all` (they do not depend on `totalCards`; the `>60` branch only decides which result to *use*). Net: dashboard 9 → 6 network calls; deck page 3 waves → 1; study page 3 → 1.

### 2.9 Re-calibrate the retrieval floor for `gemini-embedding-001` (AI-01)

Do this **before** 2.4's fence change so the two are not confounded.

```bash
node scripts/calibrate-threshold.mjs --deck <uuid> \
  --relevant "a question this deck covers" \
  --irrelevant "a question it does not"
```

Record the separated value in `rag.ts:15` with the model name in the comment, and add the assertion the file lacks:

```ts
// src/lib/rag.test.ts
it('threshold is documented against the live embedding model', () => {
  expect(process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001').toBe('gemini-embedding-001');
  expect(MIN_CONTEXT_SIMILARITY).toBeGreaterThan(0.5); // guards an accidental reset to 0
});
```

If the distributions overlap, the fix is `taskType` (the code already uses the asymmetric `RETRIEVAL_QUERY`/`RETRIEVAL_DOCUMENT` pair — check `outputDimensionality: 768` is applied on **both** sides; a 3072-dim query against 768-dim documents fails loudly, but a mixed truncation does not).

### 2.10 Contrast, zoom, scroll (UX-01..03)

**Tokens** (`globals.css`). Two new tokens keep §2.2's "hue is state only" rule and fix the ratio on the planes that fail:

```css
:root {                    /* light */
  --ink-dimmer: #6b6b74;   /* 5.10:1 on --bg · 4.80:1 on --recess(#f4f4f5) — AA on every plane */
}
.dark {
  --ink-dimmer: #8b8b95;   /* 5.90:1 on --bg · 4.87:1 on --raised-bg(#1f1f23) */
  --border-control: #6f6f79; /* 3.31:1 on --raised-bg · 4.00:1 on --bg — WCAG 1.4.11 on every plane */
}
```

(Values verified with the same formula used for the audit table; re-run `scripts/contrast.mjs` — add it, 20 lines — in CI so the next token edit cannot regress silently.)

**Zoom** (`textarea.tsx:15`): `text-base sm:text-sm` exactly as `input.tsx:27`. Remove the `text-[13px]` overrides in `AddAsCardForm.tsx:80,92` (or make them `sm:text-[13px]` only). Wrap the five raw `<select>`s in a `Select` primitive with the same rule.

**Scroll lock** (`use-modal-dialog.ts`): add inside the `open` branch —

```ts
      const { overflow, paddingRight } = document.body.style;
      const gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = `${gap}px`;   // no layout shift on desktop scrollbars
      return () => { document.body.style.overflow = overflow; document.body.style.paddingRight = paddingRight; };
```

---

## 3. Micro-Synthesis finalisation — Phase 2 close-out

**What exists** (verified in code, not from the spec): `StudyCapstoneOffer` (`synthesis/StudyCapstoneOffer.tsx`, mounted at `FlashcardReviewClient.tsx:859`, chosen by `pickCapstoneDrill` at `:289–299`, candidates loaded in the study page's single `Promise.all` at `study/page.tsx:85–90`); `DueNowBand.dueDrills` (`DueNowBand.tsx:28,60,138–156`, fed by `loadDueDrillsByDeck` at `(shell)/page.tsx:249`); `SynthesisLauncher` inside `DeckSessionLauncher` with `DUE · LINKS · LAST · ACTIVE` and the topic row; `AddAsCardForm` in `DrillResult.tsx:183`; `?from=study` handling in the canvas page. **336 tests cover the pure layer and actions.**

**What is left** is the deploy, three integration gaps and the back half of the absorption loop. Everything below is additive.

### 3.1 Database push readiness — the deploy order is load-bearing

`checkSynthesisAttempt` writes `confidence`, `client_attempt_id`, `revision_of` (`synthesis.ts:739–741`), `generateSynthesisDrills` writes `link_count` (`:460`), and the launcher reads `link_count`/`last_links_covered`. Until `202609150900_micro_synthesis_phase3.sql` is applied, every check fails at the attempt insert **after** the model call (spec §12.0). The code on `main` is therefore not deployable ahead of the migration; the migration is safe ahead of the code (additive, defaults present).

**Pre-flight (run in order; each step is a gate):**

```bash
# 1. Confirm what the remote is missing.
supabase migration list --linked            # expect 202609150900 in the "local only" column, nothing else

# 2. Dry-run the migration against a fresh shadow DB so the backfill UPDATEs are exercised.
supabase db reset --linked=false && supabase db push --dry-run

# 3. Apply.
supabase db push

# 4. Regenerate the types (handoff P0.5 — database.types.ts is hand-edited today).
supabase gen types typescript --linked > src/lib/database.types.ts
npx tsc --noEmit                              # must be clean; a diff here is a hand-edit that drifted

# 5. Probe the columns and RPCs by name, as an anon client would.
npm run verify:deployment                     # 10/10 RPCs + the phase-3 column probes (scripts/verify-deployment.mjs)

# 6. Assertions — queries 1–3 must return zero rows; 9–11 check the feedback table's deny/own policies.
psql "$SUPABASE_DB_URL" -f supabase/verify/production-assertions.sql
```

Add one assertion the file lacks — that the partial unique index the idempotency path relies on exists:

```sql
-- supabase/verify/production-assertions.sql  (append as query 12)
select 'MISSING synthesis_attempts_client_key_idx' as problem
where not exists (
  select 1 from pg_indexes
  where schemaname = 'public' and indexname = 'synthesis_attempts_client_key_idx'
);
```

Deploy the app **after** step 6, then run UAT J1–J10 (spec §11.4) and the §11.3 calibration set — both are blocked on the migration today.

### 3.2 Due indicators — close the two gaps

**(a) Per-deck drill count on the deck index.** The page already has `dueDrills.decks` (`(shell)/page.tsx:238`); it is only used for the band's total. Thread it into `DeckGrid`:

```tsx
// (shell)/page.tsx — inside the DeckGrid map (line ~483)
const dueDrillsByDeck = new Map(dueDrills.decks.map((d) => [d.deckId, d.dueCount]));
…
  dueCount: dueByDeck.get(deck.id) ?? 0,
  dueDrillCount: dueDrillsByDeck.get(deck.id) ?? 0,
```

```tsx
// DeckGrid.tsx — DeckWithCount gains `dueDrillCount: number`; DeckRow renders it beside the due reading:
{deck.dueDrillCount > 0 ? (
  <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum" style={{ color: 'var(--state-due)' }}>
    {deck.dueDrillCount} {deck.dueDrillCount === 1 ? 'drill' : 'drills'}
  </span>
) : null}
```

The "Most due" sort (`DeckGrid.tsx:74`) should add `dueDrillCount` as the tiebreak so a deck with only drills due does not sink below one with nothing due.

**(b) Deep-link the band and the launcher to the canvas, not the overview.** `(shell)/page.tsx:413`:

```ts
  href: topDrillDeck ? `/dashboard/${topDrillDeck.deckId}/synthesis?count=${Math.min(3, topDrillDeck.dueCount)}&pull=1` : null,
```

`DeckSessionLauncher` already submits a GET form to the canvas — nothing to change there. `CommandPalette` gets one new static command, `Start due drills` (`command-palette.ts`), visible only when `totalDueDrills > 0`; pass the count from the shell layout alongside `totalDue` (one more `.select('deck_id')` bounded read, or fold into §5.2's `get_dashboard_snapshot`).

**(c) Capstone offer survives a reload** (UX-05):

```ts
// StudyCapstoneOffer.tsx
const key = `cognit:capstone-dismissed:${deckId}`;
const [dismissed, setDismissed] = useState(() => {
  try { return sessionStorage.getItem(key) === drill?.id; } catch { return false; }
});
const dismiss = () => { try { if (drill) sessionStorage.setItem(key, drill.id); } catch {} setDismissed(true); };
```

### 3.3 The "+ Add as card" absorption loop — make it a loop

Today (`AddAsCardForm.tsx:50`) the claim becomes a `source: 'manual'` card with no provenance, no distractors, no embedding, and the "Added to deck" state is lost on reload. A student who adds three lecture claims after a drill has three cards that are invisible to the quiz (not quiz-ready), invisible to deck chat (no vector) and indistinguishable from hand-typed ones in Insights. The loop closes when the absorbed card is **first-class within one round trip**.

**Migration** — provenance without touching the append-only attempt row:

```sql
-- supabase/migrations/202609170910_synthesis_absorption.sql
alter table public.cards drop constraint if exists cards_source_check;
alter table public.cards
  add constraint cards_source_check
  check (source in ('manual', 'ai_pdf', 'bulk_import', 'ai_cleaned', 'synthesis_claim'));

-- Which attempt and which claim a card was absorbed from. Attempts are
-- append-only, so the link lives on the card; one card per (attempt, claim).
alter table public.cards add column if not exists absorbed_from_attempt_id uuid
  references public.synthesis_attempts(id) on delete set null;
alter table public.cards add column if not exists absorbed_claim_index smallint
  check (absorbed_claim_index is null or absorbed_claim_index between 0 and 2);
create unique index if not exists cards_absorbed_claim_idx
  on public.cards (absorbed_from_attempt_id, absorbed_claim_index)
  where absorbed_from_attempt_id is not null;
create index if not exists cards_absorbed_from_attempt_idx
  on public.cards (absorbed_from_attempt_id) where absorbed_from_attempt_id is not null;
```

**Action** — one dedicated action instead of reusing `createCard`, so the loop can enrich and embed off the response path:

```ts
// src/app/actions/synthesis.ts — add
export const absorbOutsideClaimSchema = z.object({          // lives in lib/schemas.ts
  deck_id: z.uuid(), attempt_id: z.uuid(),
  claim_index: z.number().int().min(0).max(2),
  front: z.string().trim().min(1).max(1000),
  back: z.string().trim().min(1).max(2000),
});

export async function absorbOutsideClaim(data: AbsorbOutsideClaimInput) {
  return guardAction('Add as card', async () => {
    const parsed = absorbOutsideClaimSchema.safeParse(data);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors as never };
    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) return { error: deckAccess.error };
    const { supabase, user } = deckAccess;

    const { data: attempt } = await supabase
      .from('synthesis_attempts').select('id')
      .eq('id', parsed.data.attempt_id).eq('deck_id', parsed.data.deck_id).eq('user_id', user.id).maybeSingle();
    if (!attempt) return { error: 'Attempt not found or access denied.' };

    const { data: card, error } = await supabase
      .from('cards')
      .insert({
        deck_id: parsed.data.deck_id, front: parsed.data.front, back: parsed.data.back,
        source: 'synthesis_claim', imported_by: 'synthesis',
        absorbed_from_attempt_id: parsed.data.attempt_id, absorbed_claim_index: parsed.data.claim_index,
      })
      .select('id').single();
    if (error) {
      if (error.code === '23505') {                       // already absorbed — return the existing card
        const { data: existing } = await supabase.from('cards').select('id')
          .eq('absorbed_from_attempt_id', parsed.data.attempt_id).eq('absorbed_claim_index', parsed.data.claim_index).maybeSingle();
        return { success: true as const, cardId: existing?.id ?? null, duplicate: true };
      }
      return { error: sanitizeDatabaseError(error, 'Failed to add the card.') };
    }

    await touchDeckUpdatedAt(supabase, parsed.data.deck_id, user.id);
    revalidatePath(`/dashboard/${parsed.data.deck_id}`);

    // The back half of the loop: quiz-ready and chat-visible before the student looks for it.
    after(async () => {
      await enrichCards({ deck_id: parsed.data.deck_id, card_ids: [card.id] });      // reserves 'enrich_cards'
      await syncEmbeddings({ deck_id: parsed.data.deck_id });                         // reserves 'sync_embeddings'; embeds every pending card, this one included
    });

    return { success: true as const, cardId: card.id, duplicate: false };
  });
}
```

**Loader** — the result panel learns which claims are already absorbed, so the state survives a reload and a revision:

```ts
// loaders.ts — add; call from the canvas page for the pinned drill's latest attempt, and from checkSynthesisAttempt's replay branch
export async function loadAbsorbedClaims(supabase, input: { attemptIds: string[] }): Promise<Map<string, Map<number, string>>> {
  if (input.attemptIds.length === 0) return new Map();
  const { data } = await supabase.from('cards').select('id, absorbed_from_attempt_id, absorbed_claim_index')
    .in('absorbed_from_attempt_id', input.attemptIds);
  const out = new Map<string, Map<number, string>>();
  for (const row of data ?? []) {
    if (!row.absorbed_from_attempt_id || row.absorbed_claim_index === null) continue;
    const byIndex = out.get(row.absorbed_from_attempt_id) ?? new Map();
    byIndex.set(row.absorbed_claim_index, row.id);
    out.set(row.absorbed_from_attempt_id, byIndex);
  }
  return out;
}
```

**Component** — `AddAsCardForm` takes `attemptId`, `claimIndex`, `absorbedCardId?: string | null` and renders three states: *+ Add as card* → form → *Added · [Review card →]* (link to `/dashboard/${deckId}/study?cards=${cardId}`, which the study page already understands — `parseSessionCardIds`). Remove the `text-[13px]` overrides (UX-02). The `Diagnostic` type gains `absorbedCardIds: Record<number, string>`; `checkSynthesisAttempt` returns `{}` for a fresh attempt and the loader's map for a replay.

**Insights** — `outsideClaims30d` (`loaders.ts:451`) already lists claims; join the absorbed map so each row shows *absorbed* or *+ Add* — the second entry point into the loop, for the student who skipped it in the moment.

**Tests:** `synthesis.test.ts` — absorb inserts with `source: 'synthesis_claim'`; a second absorb of the same `(attempt, index)` returns `duplicate: true` without a second insert; `enrichCards` and `syncEmbeddings` are scheduled via the mocked `after`. `loaders.test.ts` — `loadAbsorbedClaims` groups by attempt.

### 3.4 Concurrency-safe checks (SA-13) — one RPC

The sequential replay works; the concurrent one does not. The whole write side (cards pull-forward → attempt insert → drill update) belongs in one `SECURITY INVOKER` RPC that (1) takes the advisory lock on the drill, (2) returns the existing attempt if the key matches, (3) otherwise does the three writes in one transaction. The full definition is in §5.2 (`record_synthesis_attempt`). The action's `:686–769` collapses to one call; the `23505` path disappears; `attempt_count` becomes `attempt_count + 1` in SQL. Keep the model call **outside** the RPC — the transaction must never hold a lock across a 3–8 s network wait — and move the replay lookup *before* the reservation (it already is, `:565`) so a replay costs nothing.

---

## 4. Architectural upgrades & feature expansions (P1 / P2)

### 4.1 Analytics Hub — `/dashboard/stats` (P1)

**Placement.** A fourth rail destination between *Decks* and *Search* (`AppRail.tsx:52–69` pattern; icon from §6's allowlist — the three-rule glyph's cousin, a two-bar miniature). Route: `src/app/dashboard/(shell)/stats/page.tsx`, chromed (rail + breadcrumb), `loading.tsx` shaped like the page. One `.raised` object (the retention reading), flat `.surface` panels, `.well` for the tables.

**Data: one RPC, one round-trip.** Every figure below is a `GROUP BY` over tables that already have the right indexes (`study_logs (user_id, created_at)`, `cards (deck_id, next_review_at)`, `card_mastery_state (user_id, deck_id)`). Node does no aggregation.

```sql
-- supabase/migrations/202609180900_analytics_snapshot.sql
create or replace function public.get_analytics_snapshot(
  p_now timestamptz default now(),
  p_days integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  owned_cards as (
    select c.id, c.deck_id, c.state, c.interval, c.ease_factor, c.repetition_count,
           c.next_review_at, c.last_review_at, c.topic_tags
    from public.cards c
    join public.decks d on d.id = c.deck_id
    where d.user_id = (select uid from me)
  ),
  logs as (
    select l.card_id, l.grade, l.review_duration_ms, l.created_at,
           (l.created_at at time zone 'UTC')::date as day
    from public.study_logs l
    where l.user_id = (select uid from me)
      and l.created_at >= p_now - make_interval(days => greatest(7, coalesce(p_days, 90)))
  ),
  -- 1. True retention per ISO week: share of review-state grades >= 3 (SM-2 "pass").
  --    Learning-state grades are excluded: they measure encoding, not retention.
  retention_weekly as (
    select date_trunc('week', l.created_at)::date as week_start,
           count(*)::integer as reviews,
           (count(*) filter (where l.grade >= 3))::double precision / nullif(count(*), 0) as pass_rate,
           avg(l.review_duration_ms)::integer as mean_ms
    from logs l
    join owned_cards c on c.id = l.card_id
    where c.repetition_count > 0
    group by week_start
  ),
  -- 2. Review load, next 30 days, per UTC day (the band's 7-day forecast, widened).
  load_30d as (
    select (next_review_at at time zone 'UTC')::date as due_date, count(*)::integer as cards
    from owned_cards
    where next_review_at > p_now
      and next_review_at < p_now + interval '30 days'
    group by due_date
  ),
  -- 3. Forgetting-curve forecast: predicted retrievability of every review-state
  --    card right now, bucketed. R = 0.9 ^ (elapsed / interval) is the SM-2
  --    convention (90% target at the scheduled interval). Cards with no last
  --    review are excluded — there is nothing to forget yet.
  retrievability as (
    select c.id, c.deck_id,
      power(0.9, extract(epoch from (p_now - c.last_review_at)) / 86400.0 / greatest(c.interval, 1)) as r
    from owned_cards c
    where c.state = 'review' and c.last_review_at is not null
  ),
  r_buckets as (
    select width_bucket(r, 0, 1.0000001, 10) as bucket, count(*)::integer as cards
    from retrievability group by bucket
  ),
  -- 4. Topic mastery: per tag, cards / mean ease / lapse rate / mastered share.
  --    A card contributes to each of its tags. Lapse = an 'again' on a review-state card.
  topic_rows as (
    select t.tag, c.id, c.ease_factor, c.state,
           exists (select 1 from public.card_mastery_state m
                   where m.user_id = (select uid from me) and m.card_id = c.id and m.correct) as mastered,
           (select count(*) from logs l where l.card_id = c.id and l.grade = 0) as lapses,
           (select count(*) from logs l where l.card_id = c.id) as reviews
    from owned_cards c
    cross join lateral unnest(coalesce(c.topic_tags, '{}')) as t(tag)
  ),
  topic_mastery as (
    select tag,
           count(*)::integer as cards,
           avg(ease_factor)::double precision as mean_ease,
           (sum(lapses))::double precision / nullif(sum(reviews), 0) as lapse_rate,
           (count(*) filter (where mastered))::double precision / count(*) as mastered_share,
           (count(*) filter (where state = 'new'))::integer as unseen
    from topic_rows
    group by tag
    having count(*) >= 3
  ),
  -- 5. Effort: minutes per day, last p_days.
  effort as (
    select day, (sum(review_duration_ms) / 60000.0)::numeric(8,1) as minutes, count(*)::integer as reviews
    from logs group by day
  ),
  -- 6. Interval distribution — how much of the collection is "long-term".
  intervals as (
    select case
             when state = 'new' then 'new'
             when interval < 1 then 'learning'
             when interval < 7 then '1-6d'
             when interval < 30 then '7-29d'
             when interval < 90 then '30-89d'
             else '90d+'
           end as band, count(*)::integer as cards
    from owned_cards group by band
  )
  select jsonb_build_object(
    'generated_at', p_now,
    'retention_weekly', coalesce((select jsonb_agg(to_jsonb(r) order by week_start) from retention_weekly r), '[]'),
    'load_30d',        coalesce((select jsonb_agg(to_jsonb(l) order by due_date) from load_30d l), '[]'),
    'retrievability',  coalesce((select jsonb_agg(to_jsonb(b) order by bucket) from r_buckets b), '[]'),
    'topic_mastery',   coalesce((select jsonb_agg(to_jsonb(t) order by lapse_rate desc nulls last, cards desc) from topic_mastery t), '[]'),
    'effort',          coalesce((select jsonb_agg(to_jsonb(e) order by day) from effort e), '[]'),
    'intervals',       coalesce((select jsonb_agg(to_jsonb(i)) from intervals i), '[]'),
    'totals', jsonb_build_object(
      'cards', (select count(*) from owned_cards),
      'review_state', (select count(*) from owned_cards where state = 'review'),
      'mean_r_now', (select avg(r) from retrievability),
      'at_risk_now', (select count(*) from retrievability where r < 0.8)
    )
  );
$$;

revoke all on function public.get_analytics_snapshot(timestamptz, integer) from public;
grant execute on function public.get_analytics_snapshot(timestamptz, integer) to authenticated;
```

`topic_rows`'s two correlated subqueries are per card × tag; at 5 000 cards × 3 tags that is 30 000 index probes on `study_logs(card_id)` — which is exactly why DB-02's `study_logs_card_id_idx` must land first. Past ~20 000 cards, pre-aggregate `logs` per card in a CTE and join.

**Page composition** (top to bottom; all readings use `--state-*` only where they *are* a state, per §2.2):

| Band | Plane | Content | Source key |
|---|---|---|---|
| Header | — | `Retention` hero: 30-day pass rate, mono, `--state-mastered` at ≥ 85 %, `--state-due` below 70 %, ink otherwise. Beside it: `Predicted recall now` (`totals.mean_r_now`) and `At risk` (`totals.at_risk_now`, `--state-due` when > 0) | `retention_weekly`, `totals` |
| Forecast | `.raised` | **Forgetting curve**: a 10-bar histogram of `retrievability` (x: 0–100 % predicted recall, y: cards). The bars left of 80 % take `--state-due`; the rest ink. Sub-line: "N cards below 80 % — [Review them now]" → `/dashboard/<deck>/study?scope=due` for the deck with most at-risk (needs `deck_id` in the bucket; add `group by bucket, deck_id` if you want the link) | `retrievability` |
| Load | `.surface` | 30-day review load as the band's forecast, widened. Same `ForecastSparkline`, 30 columns; weekends dimmed | `load_30d` |
| Mastery | `.surface` | **Topic heatmap**: rows = tags (≥ 3 cards), columns = `unseen · learning · lapse rate · mastered`. Cell colour is a *state*, so hue is allowed: `mastered_share` ≥ 0.7 → `--state-mastered`, `lapse_rate` ≥ 0.3 → `--state-lapsed`, else ink at reduced opacity by magnitude. Row click → `/dashboard/<deckId>/study?scope=unmastered_only` for the deck that owns most of the tag (needs `deck_id` per row — add `mode() within group (order by deck_id)`) | `topic_mastery` |
| Trend | `.surface` | Weekly true-retention line, 12 weeks, with the reviews count as the bar behind it; mean seconds/card as a second mono reading | `retention_weekly` |
| Effort | `.surface` | `ActivityHeatmap` (exists) fed by `effort` — minutes, not review counts; the existing heatmap on the dashboard keeps counts | `effort` |
| Collection | `.well` | Interval bands table: six rows, cards and share | `intervals` |

**Client boundary.** The page is a Server Component that awaits the RPC and hands typed props to three small client charts (`RetrievabilityHistogram`, `TopicHeatmap`, `RetentionTrend`), all SVG, no chart library — `ForecastSparkline` and `ActivityHeatmap` already set the pattern and the bundle stays where it is. Parse the JSONB with a zod schema in `src/lib/analytics.ts` (same discipline as `parseCardScheduleSummary`) so a shape change fails loudly.

**Tests.** `analytics.test.ts` for the parser and the bucket→percent labels; a SQL assertion (query 13) that the function exists and is `SECURITY INVOKER`; UAT: a user with zero logs sees the empty state ("Study for a week and this page fills in"), never a division-by-zero `null`.

### 4.2 Rich text: KaTeX and code in `FlipCard`, `MCQMode`, `SynthesisDrillClient` (P1)

**Scope.** Inline math `$…$`, display math `$$…$$`, fenced code ```` ```lang ```` and inline code `` `…` ``. Nothing else — no Markdown headings, links or images. Cards are answers, not documents.

**Parser** — pure, tested, no dependencies:

```ts
// src/lib/rich-text.ts
export type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean }
  | { kind: 'code'; value: string; lang: string | null; block: boolean };

const TOKEN = /(```(\w+)?\n([\s\S]*?)```|`([^`\n]+)`|\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$]))/g;

export function parseRichText(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of input.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ kind: 'text', value: input.slice(last, m.index) });
    if (m[3] !== undefined) out.push({ kind: 'code', value: m[3], lang: m[2] ?? null, block: true });
    else if (m[4] !== undefined) out.push({ kind: 'code', value: m[4], lang: null, block: false });
    else if (m[5] !== undefined) out.push({ kind: 'math', value: m[5], display: true });
    else if (m[6] !== undefined) out.push({ kind: 'math', value: m[6], display: false });
    last = m.index! + m[0].length;
  }
  if (last < input.length) out.push({ kind: 'text', value: input.slice(last) });
  return out;
}

/** Cheap gate so the ~280 KB KaTeX bundle loads only for decks that need it. */
export const hasRichText = (s: string) => /[$`]/.test(s);
```

The inline-math rule's look-arounds are the whole ballgame: `costs $5 and $10` must not become math. `(?<![\\$\w])\$(?!\s)…(?<!\s)\$(?![\w$])` requires no space just inside the delimiters and no word character just outside — the LaTeX convention, and it leaves prices alone. Pin it with tests: `"$5 and $10"` → text; `"$E=mc^2$"` → math; `"a $x$ b"` → three segments.

**Renderer** — a client component, lazy on both dependencies:

```tsx
// src/components/ui/shared/RichText.tsx
'use client';
import { lazy, Suspense, useMemo } from 'react';
import { hasRichText, parseRichText } from '@/lib/rich-text';

const MathSpan = lazy(() => import('./RichTextMath'));   // katex + katex.min.css
const CodeBlock = lazy(() => import('./RichTextCode'));  // highlight.js/lib/core + registered languages

export function RichText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => (hasRichText(text) ? parseRichText(text) : null), [text]);
  if (!segments) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={i}>{seg.value}</span>;
        if (seg.kind === 'math')
          return <Suspense key={i} fallback={<code>{seg.value}</code>}><MathSpan tex={seg.value} display={seg.display} /></Suspense>;
        return <Suspense key={i} fallback={<code>{seg.value}</code>}><CodeBlock code={seg.value} lang={seg.lang} block={seg.block} /></Suspense>;
      })}
    </span>
  );
}
```

```tsx
// RichTextMath.tsx — katex.renderToString is XSS-safe with trust:false; output is then inert HTML
import katex from 'katex';
import 'katex/dist/katex.min.css';
export default function RichTextMath({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' });
  return <span className={display ? 'math math--display' : 'math'} dangerouslySetInnerHTML={{ __html: html }} />;
}
```

```tsx
// RichTextCode.tsx — hljs escapes the source; only its own span tokens are emitted
import hljs from 'highlight.js/lib/core';
import ts from 'highlight.js/lib/languages/typescript';
import py from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import c from 'highlight.js/lib/languages/c';
hljs.registerLanguage('typescript', ts); hljs.registerLanguage('python', py); hljs.registerLanguage('sql', sql); hljs.registerLanguage('c', c);
export default function RichTextCode({ code, lang, block }) {
  const known = lang && hljs.getLanguage(lang);
  const html = known ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(code).value;
  return block
    ? <pre className="code code--block"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    : <code className="code" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

**Integration points.** `FlipCard.tsx:77,82` — `prompt`/`answer` are already `ReactNode`; the *callers* wrap: `<FlipCard prompt={<RichText text={active.id_question ?? active.back} />} answer={<RichText text={active.front} />} />` (`FlashcardReviewClient.tsx:900–902`). `MCQMode.tsx:166` (prompt) and each option label. `SynthesisDrillClient` — `promptText`, anchor terms, exemplar, and the four slot placeholders. `DrillResult` — `evidence` quotes and `cardSays` (they are verbatim card text; math inside them renders the same way). Deck chat answers: **no** — they are model prose, keep plain.

**Theme.** KaTeX inherits `color`, so it takes `--ink` on both themes for free; set `.math { font-size: 1.05em }` and `.math--display { display: block; margin: .5em 0; overflow-x: auto }` (long formulae scroll rather than overflow the card). Code uses `--font-mono`, `--surface-raised` background, `--border` rule; token colours come from hljs's class names mapped onto **two** ink shades only — this system does not have syntax hue, and §2.2 says hue is state. Keywords `--ink`, strings/comments `--ink-dim`, everything else inherits. It reads like a printed listing, which is what the serif card face wants beside it.

**Generation.** Tell the extraction prompt (`ai-generate.ts:180`) that formulas must be emitted as `$…$` LaTeX and code as fenced blocks, and add one rule to `card-generation.ts`'s validator: a front containing an unbalanced `$` is rejected. Add a `KaTeX` starter deck (`starter-decks.ts`) so the renderer is exercised on first run.

**CSP.** KaTeX injects no styles at runtime when its CSS is imported statically; `style-src 'unsafe-inline'` is already present. No change.

**Bundle.** `katex` ≈ 280 KB gz’d incl. fonts on first use, `highlight.js/lib/core` + 4 languages ≈ 25 KB. Both are behind `lazy()` and the `hasRichText` gate — a deck without `$` or backticks loads neither.

### 4.3 Advanced deck operations (P2)

Ordered by how often the sharing/cloning loop will need them.

1. **Undo delete via soft delete** (handoff P1.4). `decks.deleted_at timestamptz`, `cards.deleted_at timestamptz`; every SELECT policy gains `and deleted_at is null`; `deleteDeck`/`bulkDeleteCards` set the timestamp instead; the toast offers *Undo* for 8 s (`restoreDeck`); a daily `purge_soft_deleted(30)` RPC on the existing cron. The history tables keep their FKs — nothing cascades until purge.
2. **Move / copy cards between decks.** `move_owned_cards(p_card_ids uuid[], p_from uuid, p_to uuid)` — `SECURITY INVOKER`, checks both decks, resets `embedding` on move (deck-scoped RAG), keeps SM-2 state. Copy inserts with `state = 'new'` and `source` preserved.
3. **Merge decks.** Move all cards, then soft-delete the source; `deck_chat_sessions` re-parented.
4. **Bulk tag edit.** `retag_owned_cards(p_deck uuid, p_from text, p_to text)` on `topic_tags` — the Analytics heatmap is only as good as the tags.
5. **Export.** CSV (`front,back,tags`) from a route handler with `Content-Disposition`; JSON of the full card set for re-import. Anki `.apkg` is a SQLite-in-zip and not worth the dependency until asked for.
6. **Public directory** (handoff P2.6). `decks.is_public` and `share_token` exist; a `/explore` page listing `(title, card count, clone count)` ordered by clones needs a `deck_clones` counter and a policy on `decks` for anon reads of public rows only — the second `%shared%` policy already models this.

### 4.4 Nonce-based CSP (P1, handoff P1.6)

```ts
// src/proxy.ts — at the top of proxy()
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseOrigin} wss://*.supabase.co`,
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-nonce', nonce);
let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
supabaseResponse.headers.set('Content-Security-Policy', csp);
```

`layout.tsx:86` reads `(await headers()).get('x-nonce')` and sets `nonce={nonce}` on the theme script; Next applies it to its own bootstrap scripts automatically. Remove `script-src` from `next.config.ts`'s static header (keep the rest). The matcher must keep excluding `/api/**` (SSE) — those responses carry no HTML.

### 4.5 SDK migration: `@google/generative-ai` → `@google/genai` (P1)

The current SDK is deprecated; three things this codebase already needs are untyped casts in it (`propertyOrdering`, `thinkingConfig`, `thoughtsTokenCount`) and one is missing (per-request `abortSignal` on streams — 0.24 accepts `RequestOptions.signal` but does not document it for `generateContentStream`). The new SDK's surface is `ai.models.generateContent({ model, contents, config })` with `config` carrying everything (system instruction, schema, thinking, `abortSignal`). Migration is mechanical because every call already goes through `withGeminiRetry` and (after §2.4) one config builder: change `_shared.ts` (client + `jsonGenerationConfig` → `config`), `embeddings.ts` (`ai.models.embedContent` with `taskType`, `outputDimensionality`), and the six call sites' request shape. `classifyAiError` needs its string checks re-verified against the new error class (`ApiError` with a numeric `status`) — add `if (typeof error?.status === 'number')` first. Budget: one day, gated by `ai-retry.test.ts` and the synthesis calibration set.

### 4.6 Study queue policy (P1, pedagogical — A6)

Replace the single `order('next_review_at')` with a policy the study page can explain:

```ts
// study/page.tsx — three bounded reads in one wave, merged in order; NEW_CARDS_PER_SESSION = 5 default (user setting later)
const [overdue, learning, fresh] = await Promise.all([
  base.eq('state', 'review').lte('next_review_at', now).order('next_review_at').limit(sessionCardCount),
  base.in('state', ['learning', 'relearning']).lte('next_review_at', now).order('next_review_at').limit(sessionCardCount),
  base.eq('state', 'new').order('created_at').limit(NEW_CARDS_PER_SESSION),
]);
const cards = interleave([...learning, ...overdue], fresh, { every: 3 }).slice(0, sessionCardCount);
```

Reviews and (re)learning first — they decay; new cards are interleaved one per three so a session never opens with five unseen terms. Drop the dead `next_review_at.is.null` clause. Then make the two RPCs agree (§5.2) so the number the student was promised on the dashboard is the number the session contains.

---

## 5. Database & schema optimisations — production SQL

All statements are idempotent and `SECURITY INVOKER`. Index builds use `CONCURRENTLY` where the table is expected to hold user data at deploy time, which means those statements go in a file the migration runner executes **outside** a transaction — the same convention `202609060900_hnsw_embedding_index.sql` documents.

### 5.1 Indexes and RLS evaluation (DB-01, DB-02, DB-03, DB-04, DB-06)

```sql
-- supabase/migrations/202609170920_fk_indexes.sql
-- Run the CONCURRENTLY block by hand on a populated database (cannot run inside a transaction).

-- ── Missing FK indexes: every one of these is a cascade path that seq-scans today ──
create index concurrently if not exists study_logs_card_id_idx
  on public.study_logs (card_id);
create index concurrently if not exists card_mastery_state_card_id_idx
  on public.card_mastery_state (card_id);
create index concurrently if not exists card_mastery_state_deck_id_idx
  on public.card_mastery_state (deck_id);
create index concurrently if not exists synthesis_attempts_deck_id_idx
  on public.synthesis_attempts (deck_id);
create index concurrently if not exists synthesis_attempts_revision_of_idx
  on public.synthesis_attempts (revision_of) where revision_of is not null;
create index concurrently if not exists synthesis_attempt_feedback_user_id_idx
  on public.synthesis_attempt_feedback (user_id);
create index concurrently if not exists deck_chat_sessions_user_id_idx
  on public.deck_chat_sessions (user_id);
create index concurrently if not exists deck_chat_messages_user_id_idx
  on public.deck_chat_messages (user_id);
create index concurrently if not exists deck_chat_embedding_metadata_user_id_idx
  on public.deck_chat_embedding_metadata (user_id);

-- ── reserve_ai_call counts (user, action, window); put action in the key ──
create index concurrently if not exists ai_usage_logs_user_action_created_idx
  on public.ai_usage_logs (user_id, action, created_at desc);
drop index concurrently if exists public.ai_usage_logs_user_created_at_idx;   -- prefix-covered by the above

-- ── Redundant on the hottest write table ──
drop index concurrently if exists public.cards_deck_id_idx;         -- prefix of cards_deck_id_created_at_idx
drop index concurrently if exists public.cards_next_review_at_idx;   -- never the cheapest path: every due query filters by deck/user first
-- Verify before dropping the second one on a live DB:
--   select indexrelname, idx_scan from pg_stat_user_indexes where relname = 'cards';

-- ── Cross-user vector search: stop starving the post-filter (pgvector ≥ 0.8) ──
create or replace function public.search_user_cards_by_embedding(
  p_query_embedding vector(768),
  p_limit integer default 8
)
returns table (id uuid, deck_id uuid, deck_title text, front text, back text, similarity double precision)
language sql
stable
security invoker
set search_path = public
set hnsw.iterative_scan = 'relaxed_order'      -- keep pulling candidates until the filter yields p_limit rows
set hnsw.ef_search = 100
as $$
  select cards.id, cards.deck_id, decks.title, cards.front, cards.back,
         1 - (cards.embedding <=> p_query_embedding) as similarity
  from public.cards
  join public.decks on decks.id = cards.deck_id
  where decks.user_id = (select auth.uid())
    and cards.embedding is not null
  order by cards.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;
revoke all on function public.search_user_cards_by_embedding(vector, integer) from public;
grant execute on function public.search_user_cards_by_embedding(vector, integer) to authenticated;
drop function if exists public.search_user_cards_by_embedding(uuid, vector, integer);   -- p_user_id removed (DB-07); update chat.ts:526
```

**RLS rewrite for the four hot tables.** Same semantics, `auth.uid()` evaluated once per statement instead of once per row; the `cards` policies additionally stop re-running the `decks` subquery per row by lifting the owned-deck set into the InitPlan:

```sql
-- supabase/migrations/202609170930_rls_initplan.sql
-- decks ──────────────────────────────────────────────────────────────
drop policy if exists "Users can view their own decks"   on public.decks;
create policy "Users can view their own decks"   on public.decks for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own decks" on public.decks;
create policy "Users can insert their own decks" on public.decks for insert with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own decks" on public.decks;
create policy "Users can update their own decks" on public.decks for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own decks" on public.decks;
create policy "Users can delete their own decks" on public.decks for delete using ((select auth.uid()) = user_id);
-- "Anyone can view shared decks" (202609070910) is unchanged: it has no auth.uid() term.

-- cards ──────────────────────────────────────────────────────────────
-- `deck_id in (select …)` becomes a hashed InitPlan: one scan of the user's
-- decks per statement, then an O(1) probe per card row.
drop policy if exists "Users can view cards in their own decks"   on public.cards;
create policy "Users can view cards in their own decks"   on public.cards for select
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())));
drop policy if exists "Users can insert cards in their own decks" on public.cards;
create policy "Users can insert cards in their own decks" on public.cards for insert
  with check (deck_id in (select id from public.decks where user_id = (select auth.uid())));
drop policy if exists "Users can update cards in their own decks" on public.cards;
create policy "Users can update cards in their own decks" on public.cards for update
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())))
  with check (deck_id in (select id from public.decks where user_id = (select auth.uid())));
drop policy if exists "Users can delete cards in their own decks" on public.cards;
create policy "Users can delete cards in their own decks" on public.cards for delete
  using (deck_id in (select id from public.decks where user_id = (select auth.uid())));
-- "Anyone can view cards in shared decks" is unchanged.

-- study_logs ─────────────────────────────────────────────────────────
drop policy if exists "Users can view their own study logs"   on public.study_logs;
create policy "Users can view their own study logs"   on public.study_logs for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own study logs" on public.study_logs;
create policy "Users can insert their own study logs" on public.study_logs for insert with check ((select auth.uid()) = user_id);
-- the two DENY policies (202609050900) have no auth.uid() term.

-- card_mastery_state, quiz_results, synthesis_* — same mechanical rewrite of each `auth.uid() = user_id`;
-- generate with:
--   select format('drop policy if exists %I on %I.%I; create policy %I on %I.%I for %s using (%s)%s;',
--     policyname, schemaname, tablename, policyname, schemaname, tablename, lower(cmd),
--     replace(qual, 'auth.uid()', '(select auth.uid())'),
--     case when with_check is null then '' else format(' with check (%s)', replace(with_check, 'auth.uid()', '(select auth.uid())')) end)
--   from pg_policies where schemaname = 'public' and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
--     and qual not like '%(select auth.uid())%';
```

**Verify with the plan, not the docs:**

```sql
set role authenticated; set request.jwt.claims = '{"sub":"<a-real-user-uuid>","role":"authenticated"}';
explain (analyze, buffers) select id from public.cards where deck_id = '<deck>' and next_review_at <= now();
-- Before: "SubPlan 1" under the Filter, executed once per row ("loops=N").
-- After:  "InitPlan 1 (returns $0)" at the top, loops=1; Hash Semi Join or hashed SubPlan for the deck set.
reset role;
```

Add query 13 to `production-assertions.sql`: `select policyname from pg_policies where schemaname='public' and (qual ~ 'auth\.uid\(\)' and qual !~ '\(select auth\.uid\(\)\)')` must return zero rows.

### 5.2 Atomic RPCs (SA-12, SA-13, SA-18, DB-05)

**`record_synthesis_attempt`** — the write side of a check, idempotent under concurrency:

```sql
-- supabase/migrations/202609170940_record_synthesis_attempt.sql
create or replace function public.record_synthesis_attempt(
  p_drill_id uuid,
  p_deck_id uuid,
  p_client_attempt_id uuid,        -- nullable for legacy clients
  p_attempt jsonb,                 -- every synthesis_attempts column the action sets today, except ids
  p_schedule jsonb,                -- { step, next_due_at, last_links_covered }
  p_pull_forward_card_ids uuid[],  -- candidates; the function decides which actually move
  p_pull_forward_not_after timestamptz
)
returns table (attempt_id uuid, replayed boolean, pulled_forward_card_ids uuid[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing uuid;
  v_attempt uuid;
  v_pulled uuid[] := '{}';
begin
  if v_user_id is null then raise exception 'Unauthorized' using errcode = '28000'; end if;

  -- One check at a time per drill: the second concurrent request waits here
  -- and then finds the first one's row instead of inserting its own.
  perform pg_advisory_xact_lock(hashtext(p_drill_id::text));

  if not exists (select 1 from public.synthesis_drills d
                 where d.id = p_drill_id and d.deck_id = p_deck_id and d.user_id = v_user_id and d.status = 'active') then
    raise exception 'Drill not found or access denied.';
  end if;

  if p_client_attempt_id is not null then
    select a.id into v_existing from public.synthesis_attempts a
     where a.drill_id = p_drill_id and a.client_attempt_id = p_client_attempt_id and a.user_id = v_user_id;
    if v_existing is not null then
      return query select v_existing, true, (select a.pulled_forward_card_ids from public.synthesis_attempts a where a.id = v_existing);
      return;
    end if;
  end if;

  -- 1. Cards: pull forward, never push back (spec §8.4). RLS still applies.
  if coalesce(array_length(p_pull_forward_card_ids, 1), 0) > 0 then
    with moved as (
      update public.cards c
         set next_review_at = p_pull_forward_not_after
       where c.deck_id = p_deck_id and c.state = 'review'
         and c.id = any(p_pull_forward_card_ids)
         and c.next_review_at > p_pull_forward_not_after
      returning c.id)
    select coalesce(array_agg(id), '{}') into v_pulled from moved;
  end if;

  -- 2. The immutable record, with what actually happened.
  insert into public.synthesis_attempts (
    drill_id, deck_id, user_id, mode, response, word_count, duration_ms, verdict, coverage, contradictions,
    outside_claims, structure, gap_note, missing_card_ids, contradicted_card_ids, pulled_forward_card_ids,
    integrity, model, usage, confidence, client_attempt_id, revision_of)
  select p_drill_id, p_deck_id, v_user_id,
         a.mode, a.response, a.word_count, a.duration_ms, a.verdict, a.coverage, a.contradictions,
         a.outside_claims, a.structure, a.gap_note, a.missing_card_ids, a.contradicted_card_ids, v_pulled,
         a.integrity, a.model, a.usage, a.confidence, p_client_attempt_id, a.revision_of
    from jsonb_to_record(p_attempt) as a(
         mode text, response jsonb, word_count integer, duration_ms integer, verdict text, coverage jsonb,
         contradictions jsonb, outside_claims jsonb, structure jsonb, gap_note text, missing_card_ids uuid[],
         contradicted_card_ids uuid[], integrity jsonb, model text, usage jsonb, confidence smallint, revision_of uuid)
  returning id into v_attempt;

  -- 3. The ladder, in SQL, so a concurrent check cannot lose an increment.
  update public.synthesis_drills d
     set step = (p_schedule->>'step')::smallint,
         next_due_at = (p_schedule->>'next_due_at')::timestamptz,
         attempt_count = d.attempt_count + 1,
         last_verdict = (p_attempt->>'verdict'),
         last_attempt_at = now(),
         last_links_covered = (p_schedule->>'last_links_covered')::smallint,
         updated_at = now()
   where d.id = p_drill_id and d.user_id = v_user_id;

  return query select v_attempt, false, v_pulled;
end;
$$;
revoke all on function public.record_synthesis_attempt(uuid, uuid, uuid, jsonb, jsonb, uuid[], timestamptz) from public;
grant execute on function public.record_synthesis_attempt(uuid, uuid, uuid, jsonb, jsonb, uuid[], timestamptz) to authenticated;
```

`synthesis.ts:686–769` becomes one `supabase.rpc('record_synthesis_attempt', …)`; on `replayed = true` the action reads the stored row with `parseStoredAttempt` (the code at `:565–587` already does this) and returns it. `scheduleSaved` is always true.

**`log_quiz_result`** — fold the two inserts after `apply_quiz_sm2_batch` into it, so a quiz is one transaction:

```sql
-- Extend apply_quiz_sm2_batch's signature; the body keeps the existing card/study_logs/mastery CTEs and adds:
--   p_mode text, p_duration_ms integer, p_include_in_history boolean, p_card_results jsonb
--   … after the existing CTEs:
  insert into public.quiz_results (user_id, deck_id, mode, total_cards, correct_cards, duration_ms, include_in_history)
  values (v_user_id, p_deck_id, p_mode, jsonb_array_length(p_card_results),
          (select count(*) from jsonb_array_elements(p_card_results) r where (r->>'correct')::boolean),
          p_duration_ms, p_include_in_history)
  returning id into v_quiz_result_id;

  insert into public.quiz_card_results (quiz_result_id, card_id, correct, prompt_text, correct_answer_text, user_answer_text)
  select v_quiz_result_id, (r->>'card_id')::uuid, (r->>'correct')::boolean, r->>'prompt_text', r->>'correct_answer_text', r->>'user_answer_text'
    from jsonb_array_elements(p_card_results) r;
  return v_quiz_result_id;
```

The DENY policies on the history tables are unaffected: the function is `SECURITY INVOKER`, so the inserts run under the same INSERT policies the action uses today.

**`apply_card_enrichment_batch`** — the sibling of `apply_card_embeddings_batch`:

```sql
create or replace function public.apply_card_enrichment_batch(p_deck_id uuid, p_rows jsonb)
returns integer language sql security invoker set search_path = public as $$
  with rows as (
    select * from jsonb_to_recordset(p_rows) as r(id uuid, mcq_distractors text[], id_question text, topic_tags text[])
  ), updated as (
    update public.cards c
       set mcq_distractors = rows.mcq_distractors, id_question = rows.id_question, topic_tags = rows.topic_tags
      from rows
     where c.id = rows.id and c.deck_id = p_deck_id
       and c.deck_id in (select id from public.decks where user_id = (select auth.uid()))
     returning c.id)
  select count(*)::integer from updated;
$$;
```

**One definition of "due"** (DB-05). Decide, then make both RPCs say it. The right call for this product: **new cards are not "due"** — they are *available*. The band's hero figure should be reviews owed; new material is a separate, smaller reading ("+12 new"). So `get_due_cards_by_deck` gains `and cards.state <> 'new'`, and `get_dashboard_snapshot` (below) returns `new_by_deck` beside it. `DueNowBand` shows `12 due · 8 new`; `estimateSessionMinutes` uses due only; `sessionHref` falls back to `?scope=include_reviewed` when due = 0 and new > 0 (it already does).

**`get_dashboard_snapshot`** (NX-01, P1) — replace seven parallel calls with one:

```sql
create or replace function public.get_dashboard_snapshot(p_now timestamptz default now())
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'decks',       (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description,
                       'created_at', d.created_at, 'updated_at', d.updated_at,
                       'card_count', (select count(*) from public.cards c where c.deck_id = d.id)) order by d.created_at desc), '[]')
                    from public.decks d where d.user_id = (select auth.uid())),
    'due_by_deck', (select coalesce(jsonb_agg(row_to_json(x)), '[]') from public.get_due_cards_by_deck(p_now) x),
    'new_by_deck', (select coalesce(jsonb_agg(jsonb_build_object('deck_id', c.deck_id, 'new_count', count(*))), '[]')
                    from public.cards c join public.decks d on d.id = c.deck_id
                    where d.user_id = (select auth.uid()) and c.state = 'new' group by c.deck_id),
    'activity',    (select coalesce(jsonb_agg(row_to_json(x)), '[]') from public.get_study_activity_days() x),
    'mastery',     (select coalesce(jsonb_agg(row_to_json(x)), '[]') from public.get_deck_mastery_summary() x),
    'schedule',    public.get_card_schedule_summary(p_now, 7),
    'due_drills',  (select coalesce(jsonb_agg(jsonb_build_object('deck_id', deck_id, 'due_count', n)), '[]')
                    from (select deck_id, count(*) n from public.synthesis_drills
                          where user_id = (select auth.uid()) and status = 'active' and next_due_at <= p_now group by deck_id) t),
    'studied_total', (select count(*) from public.study_logs where user_id = (select auth.uid()))
  );
$$;
```

(The nested RPCs lose their redundant `p_user_id` parameter in the same migration — DB-07 — with the TS call sites updated in the same commit; `verify-deployment.mjs` catches a mismatch as "could not find the function".) The dashboard page's `loadDashboardSnapshot` becomes one call parsed by a zod schema; latency drops from `max(7 queries) + auth` to `1 query + auth`, and — with §2.8 — that auth call is shared with the layout.

### 5.3 Reservation v2 — ceiling in the lock, calls counted (SA-11, AI-06)

```sql
create or replace function public.reserve_ai_call(
  p_action text, p_window_minutes integer, p_max_requests integer,
  p_metadata jsonb default '{}'::jsonb,
  p_calls integer default 1,               -- model calls this reservation covers (drills: up to 5; enrich: batches; chat: 2)
  p_daily_ceiling integer default 300
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_user_id uuid := (select auth.uid()); v_used integer; v_daily integer; v_id uuid;
begin
  if v_user_id is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action));

  select coalesce(sum(coalesce((metadata->>'calls')::integer, 1)), 0) into v_daily
    from public.ai_usage_logs where user_id = v_user_id and created_at >= now() - interval '24 hours';
  if v_daily + p_calls > p_daily_ceiling then raise exception 'AI_DAILY_CEILING' using errcode = 'P0002'; end if;

  select count(*) into v_used from public.ai_usage_logs
   where user_id = v_user_id and action = p_action and created_at >= now() - make_interval(mins => p_window_minutes);
  if v_used >= p_max_requests then raise exception 'AI_RATE_LIMIT' using errcode = 'P0001'; end if;

  insert into public.ai_usage_logs (user_id, action, metadata)
  values (v_user_id, p_action, p_metadata || jsonb_build_object('calls', p_calls))
  returning id into v_id;
  return v_id;
end; $$;
```

`_shared.ts`: delete `enforceDailyAiBudget` and the TS fallback path entirely (the RPC is live); map `P0002` to the daily-ceiling copy; pass `calls` from `generateSynthesisDrills` (`count`), `enrichCards` (`batches.length`), the chat route (`2`), `generateCards` (`chunks.length`). The ceiling stops failing open and starts counting what it claims to count.

### 5.4 Quiz history pagination (SA-17)

Replace the two-step fetch with one RPC returning the last N quizzes **with their misses already nested** — `jsonb_agg` of the incorrect rows per quiz, limited by a `p_limit`/`p_before` cursor:

```sql
create or replace function public.get_quiz_history(p_deck_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (id uuid, mode text, total_cards integer, correct_cards integer, duration_ms integer, created_at timestamptz, misses jsonb)
language sql stable security invoker set search_path = public as $$
  select q.id, q.mode, q.total_cards, q.correct_cards, q.duration_ms, q.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('card_id', r.card_id, 'prompt', r.prompt_text,
                    'correct_answer', r.correct_answer_text, 'user_answer', r.user_answer_text))
                   from public.quiz_card_results r where r.quiz_result_id = q.id and not r.correct), '[]')
  from public.quiz_results q
  where q.deck_id = p_deck_id and q.user_id = (select auth.uid()) and q.include_in_history
    and (p_before is null or q.created_at < p_before)
  order by q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
```

`QuizHistoryList` gets a *Load older* button that passes the last row's `created_at`. The 20 000-row cap and the `quiz.ts:258–313` grouping code go away.

---

## 6. Implementation sequence & validation checklist

Each phase ends with the same gate — `npx tsc --noEmit · npm run lint · npm test · npm run build` — plus the phase-specific checks listed. Do not start a phase with a red gate from the previous one. Migrations deploy **before** the code that reads them, always (`README` deploy order; spec §12.0 for the synthesis case).

### Phase A — Calibrate and unblock (½ day, no user-visible change)

| Step | Action | Verify |
|---|---|---|
| A.1 | §2.9 — run `calibrate-threshold.mjs` on two real decks; commit the new `MIN_CONTEXT_SIMILARITY` with the model name | Relevant/irrelevant distributions separate; `rag.test.ts` passes |
| A.2 | §3.1 — `supabase db push` (phase 3), `gen types`, `verify:deployment`, assertions 1–12 | `migration list` shows nothing local-only; `tsc` clean against generated types; 0 rows from assertions 1–3 |
| A.3 | UAT J1–J10 (spec §11.4) + §11.3 calibration set against the now-live tables | Planted contradiction caught ≥ 90 %; a replayed `client_attempt_id` returns `replayed: true` with no new `ai_usage_logs` row |

```bash
# A.2 one-liner gate
supabase db push && supabase gen types typescript --linked > src/lib/database.types.ts \
  && npx tsc --noEmit && npm run verify:deployment \
  && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify/production-assertions.sql
```

### Phase B — P0 quick wins (1 day)

| Step | Items | Verify |
|---|---|---|
| B.1 | §2.4 config builder → every JSON call site; §2.6 error codes (needs its migration) | `_shared.test.ts` snapshot; `grep -rn "generationConfig: {" src/app` returns only `jsonGenerationConfig(` calls |
| B.2 | §2.1 `updateCard`; §2.2 mnemonic move + outbox + `event.repeat` | `card.test.ts`, `study.test.ts`: `reserveAiCall` called for every model call; `grep -rn "export async function" src/app/actions/ai-assist.ts` no longer lists `generateMnemonicForCard`. Manual: grade *Again* on a fresh card — the next card is gradeable immediately; the mnemonic appears on that card's next visit |
| B.3 | §2.3 reservation after validation; parallel chunks | `ai-generate.test.ts`: an invalid PDF makes **no** `reserveAiCall`; a 12-chunk doc issues ≤ 4 waves. Manual: upload a 100-page PDF — completes < 40 s, `partial` reported honestly |
| B.4 | §2.5 abort + follow-up persistence; delete `chatWithDeck` + barrel | `route.test.ts`: aborting the request signal stops the loop and persists `truncated`; reopening a session shows follow-ups. `grep -rn "from '@/app/actions'" src` → 0 |
| B.5 | §2.7 fallbacks deleted; results normalised; `finishStudySession` authed; keep-alive `timingSafeEqual` | `grep -rn "using fallback\|fallback persistence" src` → 0; `deleteDeck` on a foreign id returns `{ error }` not `undefined` |
| B.6 | §2.8 `getSessionUser` cache + `getClaims()` in proxy; single-wave pages | Count requests in Supabase logs for one dashboard load: **≤ 1** `/auth/v1/user`, `get_due_cards_by_deck` **once**. `study/page.tsx` has one `await Promise.all` |
| B.7 | §2.10 tokens, textarea/select sizes, scroll lock | `node scripts/contrast.mjs` (new) prints every ink token ≥ 4.5 on every plane and `--border-control` ≥ 3.0; iPhone Safari: focus the chat composer and the drill slots — no zoom; open ⌘K — page behind does not scroll |

```bash
# B.7 — scripts/contrast.mjs (20 lines): parse globals.css tokens for :root and .dark,
# compute WCAG ratios for {ink, ink-dim, ink-dimmer} × {bg, surface, raised-bg, recess}
# and {border-control} × the same, exit 1 on any failure. Wire into `npm run lint`.
```

### Phase C — Database (one migration set, ½ day + a maintenance window for CONCURRENTLY)

| Step | Items | Verify |
|---|---|---|
| C.1 | §5.1 FK indexes (CONCURRENTLY, by hand on prod), index drops, `ai_usage_logs` key | `select indexrelname from pg_indexes where schemaname='public'` contains all nine; `explain analyze delete from cards where id = …` shows Index Scan on `study_logs_card_id_idx`, not Seq Scan |
| C.2 | §5.1 RLS InitPlan rewrite (generated statement for the long tail) | assertion 13 → 0 rows; `explain (analyze)` on a `cards` read shows `InitPlan`, `loops=1` |
| C.3 | §5.1 `search_user_cards_by_embedding` v2; `chat.ts:526` updated | Palette semantic search on a user with 300 cards in a 50 k-vector table returns `limit` rows |
| C.4 | §5.2 `record_synthesis_attempt`, `apply_quiz_sm2_batch` v2, `apply_card_enrichment_batch`, due-definition change, `get_dashboard_snapshot`; DB-07 parameter removals | `synthesis.test.ts`: two concurrent checks with one key → one attempt row, second call `replayed`; dashboard "due" == deck-page "Due" for a deck with new cards; `verify:deployment` probes the new signatures |
| C.5 | §5.3 `reserve_ai_call` v2; TS fallback deleted | `_shared.test.ts`: `P0002` → daily-ceiling copy; `grep -n "enforceDailyAiBudget" src` → 0 |
| C.6 | §5.4 `get_quiz_history`; *Load older* | `quiz.test.ts`; `grep -n "limit(20000)" src` → 0 |

```sql
-- C.1 post-check: no FK without a leading-column index (should return zero rows)
select c.conrelid::regclass as tbl, a.attname as col
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and i.indkey[0] = a.attnum);
```

### Phase D — Synthesis close-out (½ day)

| Step | Items | Verify |
|---|---|---|
| D.1 | §3.2 per-deck drill counts, deep links, palette command, capstone dismissal | Deck index shows `2 drills` on the right deck; the band's link lands on the canvas with `?count=`; reload after *Skip* — offer stays hidden |
| D.2 | §3.3 absorption migration, `absorbOutsideClaim`, loader, three-state form, Insights join | After *Add card*: the card exists with `source = 'synthesis_claim'`; within ~10 s it has 3 distractors and an embedding (`select mcq_distractors, embedding is not null from cards where absorbed_from_attempt_id = …`); the result panel shows *Added · Review card →* after a reload; UAT J11 (new): absorb twice → one card |
| D.3 | §3.4 action rewired to the RPC | `scheduleSaved` removed from the client; 23505 path gone |

### Phase E — P1 features (three independent tracks)

| Track | Items | Verify |
|---|---|---|
| E.1 Analytics | §4.1 RPC → page → three SVG charts → rail entry | A user with < 7 days of logs sees the empty state; `at_risk_now` link opens a due session; heatmap rows with < 3 cards are absent; Lighthouse a11y ≥ 95 on `/dashboard/stats` |
| E.2 Rich text | §4.2 parser + tests → `RichText` → FlipCard/MCQ/drill call sites → prompt rule → starter deck | `rich-text.test.ts` (prices, balanced/unbalanced `$`, nested backticks); a deck without `$` loads no `katex` chunk (Network tab); `$E=mc^2$` renders on both faces and in an MCQ option |
| E.3 Platform | §4.6 study queue policy; §4.4 nonce CSP; §4.5 SDK migration | Study session opens with reviews, new cards interleaved 1-in-3; response headers carry `nonce-` and no `'unsafe-inline'` on `script-src`; `ai-retry.test.ts` + calibration set green on `@google/genai` |

### Phase F — P2 (as demand shows)

§4.3 in the listed order; handoff §2's P2 list stands (embedding cache by content hash first, then queued enrichment, then cost telemetry — the Analytics RPC is the natural home for a per-user AI-spend panel once `ai_usage_logs.metadata.calls` exists).

### The manual smoke script (run after every phase, ~6 minutes)

1. Sign in → dashboard: band due count, one auth request in the network tab.
2. Open a deck with new cards: header *Due* equals the band's figure for that deck (post-C.4).
3. Study 5 cards with keys only, hold `3` on the last one — exactly one grade recorded.
4. Grade *Again* on a review card → next card is gradeable instantly.
5. Chat: send, navigate away mid-stream → no assistant row longer than what was shown; reopen → follow-ups present.
6. Drill: check, close the tab during *Checking…*, reopen with the same key → *replayed*, no second usage row.
7. Add an outside claim as a card → appears in the Cards tab as *Synthesis*; quiz-ready within a minute.
8. Mobile (real iPhone): focus every textarea — no zoom; open ⌘K — no scroll bleed; swipe-grade with a short fast flick — commits.
9. Dark mode, deck launcher: micro-labels readable; run `scripts/contrast.mjs`.
10. `npm run verify:deployment` → all probes green.

---

## 7. What this plan deliberately does not recommend

- **Rewriting the synthesis components.** They exist, are tested, and match the spec. §3 is integration and deploy.
- **Swapping `domMax` for `domAnimation`.** It would silently kill swipe-to-grade (handoff §3.1 #5).
- **Moving vectors out of Postgres.** `search_deck_cards_by_embedding` is exact per deck; the cross-user path is fixed by iterative scan. Revisit past ~100 k vectors per user.
- **A chart library.** Three SVG components keep the bundle and the design language; the existing `ForecastSparkline`/`ActivityHeatmap` prove the pattern.
- **Multi-provider AI or raising rate limits** — handoff §2 still applies.
- **Collaborative decks.** Single-owner is baked into every policy and RPC; a `deck_members` model is a separate project.

## 8. Limits of this audit

Static analysis plus unit tests only: nothing here was executed against the linked Supabase project or a live Gemini key. The index and RLS claims follow from the migrations as written and Postgres' documented planner behaviour; **Phase C's `explain` steps are the proof**, and the FK-index query in Phase C.1 is the one thing to run first on production, because it is the cheapest way to confirm the schema on disk is the schema that is live.

---

## 9. Implementation status (2026-09-17)

Everything below was implemented on `main` after this plan was written. Gate after: `npx tsc --noEmit` clean · `npm run lint` clean (now includes `scripts/contrast.mjs`) · `npm test` **367 passed / 34 files** · `npm run build` **17 routes** (adds `/dashboard/stats`).

**Deploy order is load-bearing.** Nine new migrations (`202609170900` … `202609180900`) plus the still-unapplied `202609150900` must be pushed **before** this build: the code calls `reserve_ai_call` with six arguments, `log_quiz_result`, `get_quiz_history`, `record_synthesis_attempt`, `apply_card_enrichment_batch`, `get_analytics_snapshot`, and reads `new_count` from `get_due_cards_by_deck` and `absorbed_*` from `cards`. `npm run verify:deployment` probes every one of them by name. After the push, regenerate the types (`supabase gen types typescript --linked > src/lib/database.types.ts`) — the file was hand-edited for the new functions and columns — and run `production-assertions.sql` queries 12–15.

| Plan § | Item | Status |
|---|---|---|
| 2.1 | `updateCard` embedding reserved + off the response path (`after()`) | ✅ `card.ts` |
| 2.2 | `generateMnemonicForCard` moved to `src/lib/mnemonic.ts`; `gradeCard` schedules it with `after()`; grade **outbox** replaces the blocking gate; `event.repeat` ignored; swipe honours velocity | ✅ `study.ts`, `FlashcardReviewClient.tsx` |
| 2.3 | `generateCards` reserves after validation, fences the source with a nonce, runs chunks in waves of 3 | ✅ `ai-generate.ts` |
| 2.4 | `jsonGenerationConfig` (temperature, cap, `thinkingBudget: 0`) at every JSON call site; chat context fenced with a nonce | ✅ `_shared.ts`, `ai-enrich.ts`, `route.ts`, `synthesis.ts`, `rag.ts` |
| 2.5 | SSE route honours `request.signal` and `cancel()`; follow-ups persisted; dead `chatWithDeck` action and the `actions.ts` barrel deleted | ✅ `route.ts`, `chat.ts` |
| 2.6 / 5.3 | `reserve_ai_call` v2: daily ceiling inside the lock, `p_calls`, distinct error codes (28000 / P0001 / P0002); TypeScript fallback and `enforceDailyAiBudget` deleted | ✅ `202609170900`, `_shared.ts` |
| 2.7 | Fallback persistence paths deleted (study, quiz, dashboard, deck page, quiz page); `deleteDeck`/`updateDeck`/`deleteCard`/`bulkDeleteCards` validated and never `undefined`; `finishStudySession` authenticated; keep-alive `timingSafeEqual` | ✅ |
| 2.8 | `src/lib/supabase/session.ts` — `React.cache`'d client, user, clock and due-cards read shared by layout, pages and `requireOwnedDeck`; deck / study / quiz pages collapsed to one wave; the deck page reads the 60-card slice only on tabs that show it | ✅ (the proxy keeps `getUser()`: `email_confirmed_at` is not a JWT claim — see §2.8's caveat) |
| 2.9 | Threshold recalibration | ⏳ **needs a live key** — run `scripts/calibrate-threshold.mjs` (Phase A.1) |
| 2.10 | `--ink-dimmer` / dark `--border-control` retuned; `scripts/contrast.mjs` gate in `npm run lint`; every textarea/select/input ≥ 16 px on mobile; modal scroll lock | ✅ |
| 3.1 | Assertions 12–15; `verify-deployment.mjs` probes the new RPCs and columns | ✅ (the `db push` itself is the owner's) |
| 3.2 | Per-deck drill counts on the deck index (`+Nd`), "Most due" tiebreak, band deep-links to the canvas, palette *Statistics* command, capstone dismissal persisted | ✅ |
| 3.3 | Absorption loop: `202609170970`, `absorbOutsideClaim`, `loadAbsorbedClaims`, three-state `AddAsCardForm` with *Review card →*, auto-enrich + embed after the response, `Drill` source label | ✅ |
| 3.4 / 5.2 | `record_synthesis_attempt` — one transaction under an advisory lock; concurrent replay returns the first attempt; `attempt_count` incremented in SQL | ✅ `202609170980`, `synthesis.ts`, 25 tests |
| 4.1 | Analytics Hub: `get_analytics_snapshot`, `src/lib/analytics.ts` (10 tests), four SVG components, `/dashboard/stats` + skeleton, rail entry, breadcrumb | ✅ `202609180900` |
| 4.2 | Rich text: `src/lib/rich-text.ts` (10 tests), `RichText` with lazy KaTeX / highlight.js, wired into FlipCard, MCQ, Identification, drill canvas and result; generation prompt rule + validator; two starter cards | ✅ |
| 4.3 | Advanced deck operations | ⏸ not started (P2) |
| 4.4 | Nonce CSP | ⏸ **deliberately not done** — it forces every route dynamic (the landing and login pages are static today) and a wrong CSP blanks the whole app; needs a browser session to verify. Keep as P1. |
| 4.5 | `@google/genai` migration | ⏸ **deliberately not done** — touches every model call and cannot be verified without a live key. |
| 4.6 | Study queue policy: reviews and (re)learning first, new cards interleaved 1-in-3 with a per-session allowance, dead `is.null` clause removed | ✅ `study/page.tsx`, `lib/study.ts` (4 tests) |
| 5.1 | Nine FK indexes; `cards_deck_id_idx` and `ai_usage_logs_user_created_at_idx` dropped as prefixes; RLS InitPlan rewrite (hand-written for `cards`, mechanical for the rest, self-verifying); `search_user_cards_by_embedding` with iterative scan | ✅ `202609170940`, `202609170950`, `202609170960` |
| 5.2 | One definition of "due" (`state <> 'new'`) with `new_count` beside it; band shows `· N new`; `log_quiz_result`; `apply_card_enrichment_batch` | ✅ `202609170960`, `202609170920`, `202609170910` |
| 5.2 | `get_dashboard_snapshot`; DB-07 parameter removals | ⏸ not done — the dashboard is already one parallel wave; the remaining gain is one round-trip and the signature churn touches six RPCs |
| 5.4 | `get_quiz_history` with cursor; *Load older* | ✅ `202609170930` |
