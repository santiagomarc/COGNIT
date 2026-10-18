# Cognit — Performance Plan (light AI, snappy app)

**Revision:** 1.4 · 2026-10-18. Rev 1.4: P3's code landed uncommitted on top of `4427194` (P2's commit), §7.5. Rev 1.3 · 2026-10-17: P2's code landed uncommitted on top of `cbc5bce` (P1's commit), measured before/after in production builds (§6.4). Rev 1.2 · 2026-10-16: P1's code landed uncommitted on top of `404dd24` (P0's commit); the B.6 distractor review failed its gate on the agent's reading, so P1 keeps AI distractors as a background job and uses deck-sourced options only as the instant fallback (§5.6). Rev 1.1 · 2026-10-15: the owner decided OD-1 (chat follow-ups dropped) and OD-3 (mnemonics removed entirely, not throttled); both moved into P0, and P0's code landed uncommitted on top of `73eabb5` (§4.7 has the execution notes). Rev 1.0 · 2026-10-14.
**Baseline:** `main` @ `73eabb5` (clean tree; re-checked at the end of the audit). Line references in §2 and the appendices are to this baseline; P0 has since moved some of them.
**Scope:** where Cognit's AI calls go and which of them a user waits on; what else makes the signed-in app slower than it needs to be; and the phased plan that makes AI light and the app snappy. No application code was changed by this audit.
**Companions:** `COGNIT_UIUX_PLAN.md` (Rev 1.0, called **UIUX** below; PERF-06…09 and FLOW-06 live there and are scheduled here, not restated) · `COGNIT_NEXT_HORIZON_PLAN.md` (Rev 1.4; the AUTH-02 runbook in §6.3, the LC series, house style) · `COGNIT_MICRO_SYNTHESIS_AUDIT_II.md` (§2: live thinking measurements on `gemini-3.5-flash-lite`).

---

## How to read this document

- **§0** is the one-page answer. **§1** answers the question that started this: where the AI calls go. **§2** holds the findings, what is verified good, and what could not be checked. **§3** is the roadmap, the targets and the standing rules. **§4–§9** are the phases, each ending in a gate. **§10** lists the owner's decisions, **§11** what is out of scope. Appendices hold the evidence, the gate queries and the lists.
- Finding IDs continue the existing series: **AI-09…**, **PERF-10…**, **LC-05**. Referenced, not restated: **AUTH-02** (Next Horizon §6.3); **PERF-06, PERF-07, PERF-08, PERF-09, FLOW-06** (UIUX).
- Severity: **S0** blocks use or loses data · **S1** user-visible defect, or a flow that fails its purpose · **S2** quality or consistency debt · **S3** polish.
- Every `file:line` refers to `73eabb5`; `next/dist/…` refers to the installed `next@16.1.0` under `node_modules`.
- **Code in this plan is a sketch**: none of it has been compiled. The tests named beside each item are the contract; where a sketch and its test disagree, the test wins.

### Evidence standard

| Question | Method |
|---|---|
| How much AI does the app use, and for what? | Read-only SQL against production: `ai_usage_logs` reservations and their `metadata.calls`, coverage of every AI-derived card field, deck sizes, and the lapse distribution in `study_logs` (Appendix A.1–A.3). |
| What does the database spend its time on? | `supabase inspect db db-stats / outliers / calls --linked` (pg_stat_statements, 23 h 44 min since its last reset) (A.4). |
| Where does each piece run? | `supabase projects list` (region), the `x-vercel-id` response header (function region), the project's JWKS (A.5). |
| How fast are public responses? | `curl` over one warm connection from the owner's region (UTC+8), seven samples per URL after a discarded first round (A.6). |
| What does Next.js actually do with Server Actions? | The installed source: the router's action queue and the action handler's revalidation path (A.7). |
| What ships to the browser? | APFS clone of `73eabb5` → `next build` ✓ → `node scripts/bundle-report.mjs .next --budgets scripts/bundle-budgets.json` (every route within budget), then each chunk attributed by gzip size and the strings it contains (A.8). |
| Does model "thinking" cost latency? | Not re-measured. Audit II §2 measured it live: `gemini-3.5-flash-lite` defaults to *minimal* thinking; a small JSON call took 1.6–2.1 s; forcing `high` cost 4× the latency and 8× the output tokens. |
| **What could not be verified** | **Signed-in screens, live**: there is no test account in `.env.local` (`LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD`), and this audit does not create accounts in production. Signed-in findings are read from code and marked *code*. **Per-call AI latency**: nothing durable records it (AI-16); the Vercel logs that do are owner-only. **Whether Fluid compute is on** (V3). |

---

## 0. Executive summary

**Verdict.** Fewer AI calls make Cognit lighter, but the app feels slow mostly because of *where* its AI calls sit, and because of a few things that aren't AI at all. The model is already the fast, minimal-thinking one. The database is tiny and fully cached. Earlier plans already flattened the page loaders into single parallel waves. What still makes people wait:

1. **AI work runs as browser-invoked Server Actions, and Next.js runs a tab's Server Actions one at a time.** After a PDF or bulk import, the background enrichment holds every later save in that tab (add, edit, delete, share, the end-of-quiz save) until it finishes.
2. **Some AI calls sit right in front of the user.** A quiz can start by enriching its cards; a deck's first chat question first runs the whole embedding sync; a chat turn isn't "done" until a second model call writes follow-up chips.
3. **Every signed-in request pays two serial Supabase Auth round-trips**, because the project still signs JWTs with HS256: about 1,625 Auth user lookups in the last 24 h, against 1,795 data requests.
4. **In the browser,** the quiz re-renders four times a second and rewrites the whole session to `sessionStorage` on each tick, and study spends about 0.9 s per card on animation (UIUX PERF-06).

**On AI volume.** In the last 30 days the app made about 53 generative model calls: lapse mnemonics 20 (38%), enrichment 16 (30%), PDF generation 14, note clean-up 2, the removed hint 1. This plan cuts that by more than half at the same usage:

- **Mnemonics are removed** (Rev 1.1, P0). The owner reviewed real ones and judged them unhelpful for conceptual decks; they were the largest share of recent calls.
- **Chat follow-up chips are removed** (Rev 1.1, P0): one model call fewer per chat turn.
- **Quiz distractors and identification prompts** come from the deck itself, with no model call.
- **PDF cards** get their tags from generation.

More important for snappiness, the plan leaves **no AI call between a user's action and the next thing they need to see**, except where the user asked for AI output (generate from PDF, chat, clean up notes).

**Top problems**

| # | Finding | Why it matters |
|---|---|---|
| 1 | **PERF-10 (S1)** `enrichCards` and `syncEmbeddings` are called from the browser as Server Actions. `next@16.1.0` puts every action in one queue per tab and starts the next only when the pending one finishes; only navigations skip ahead (`app-router-instance.js:129–158`). | After an import, the user's next save waits behind seconds to a minute of enrichment; a quiz finished meanwhile can't save its result until enrichment ends. |
| 2 | **AI-10 (S1)** A deck's first chat question waits for `runSync()` (`DeckChatWidget.tsx:235–238`): up to 20 sequential sync actions, each up to 200 embeddings, under the free tier's 100-texts-a-minute cap with waits of up to 35 s. 87% of cards have no embedding, so nearly every deck takes this path. | The first answer, which is the feature's first impression, can take tens of seconds. |
| 3 | **AI-13 (S1)** Nothing embeds a card when it's created. Embeddings come only from the chat widget, card edits and synthesis; 50 of 387 cards have one. | The command palette's search can find 13% of the user's cards. |
| 4 | **AI-09 (S2)** A quiz needs a stored AI question and three stored AI distractors per card; starting a quiz enriches the cards that lack them (45 do). | Quiz start depends on a model call. Every non-empty deck has at least 7 cards, so the deck's own terms can be the distractors, with no model at all. |
| 5 | **AUTH-02 (S2, open since Next Horizon)** HS256 signing: the JWKS is still `{"keys":[]}`, so `getClaims()` falls back to a network `getUser()` in the proxy and again in the render or action. | A tax on every navigation and every Server Action, removable from the Supabase dashboard in about 15 minutes. |

Close behind:
- **PERF-12:** the quiz clock causes 4 re-renders and 4 full `sessionStorage` writes a second.
- **PERF-11** (fixed in P0): `gradeCard`'s `revalidatePath` re-rendered the study page inside every grade, ≈ 6 extra Supabase reads per card.
- **AI-11** (fixed in P0): chat's "done" waited for the follow-up call.
- **AI-15** (fixed in P0, by removal): a mnemonic was written for every first lapse.
- **PERF-06 (UIUX):** ≈ 0.9 s of animation per card.
- **PERF-13:** the deck page loads 57 kB gz of UI nobody has opened yet.

**Roadmap**

| Phase | Goal | Size | Exit gate |
|---|---|---|---|
| **P0** | Measure, and take the free wins: remove mnemonics and chat follow-ups, ES256 signing keys (owner, ≈ 15 min), a durable record of every AI call, no page re-render inside each grade, count-before-reserve, a thinking guard. **Code done 2026-10-15** (§4.7) | 1–1.5 days | G0 (§4.6) |
| **P1** | AI off the user's path: quiz data from the deck, embeddings when cards are made, no browser-invoked enrichment. **Code done 2026-10-16** (§5.6) | 2.5–3.5 days | G1 (§5.5) |
| **P2** | Study and quiz feel instant: the quiz clock and its persistence; UIUX PERF-06/07 if U2 hasn't run. **Code done 2026-10-17** (§6.4) | 0.5 day (+2.5 UIUX) | G2 (§6.3) |
| **P3** | Chat and search: no pre-send sync, small decks in full context, instant lexical search, semantic search by a cancellable route **Code done 2026-10-18** (§7.5) | 1.75–2.25 days | G3 (§7.4) |
| **P4** | Lighter pages: load unopened UI on open, lower budgets, keep the proxy off static pages | 1–1.5 days | G4 (§8.3) |
| **P5** | PDF generation by section, streamed, with tags in the same call (UIUX OD-8) | 2 days | G5 (§9.2) |

About **8.75–11.25 days** (P0's code is already done), plus the 2.5 UIUX days P2 may absorb. Order: **P0 → P1 → P2 → P3 → P4 → P5**. P2 and P4 don't depend on P1 and can run in parallel with it.

**Targets.** Every gate re-measures these with Appendix B.

| Measure | Now | Target |
|---|---|---|
| Generative model calls per 30 days, same usage | ≈ 53 | ≤ 33 (estimate after P0: ≈ 33; after P1: ≈ 30 with AI distractors kept, §5.6; ≈ 21 if OD-7 turns them off) |
| AI calls between a user action and the next screen: quiz start · first chat question · a save after an import | 1 · up to 20 sync rounds · queued behind enrichment | 0 · 0 · 0 |
| Model calls before a chat turn is "done" | 2, plus a query embedding | 1 since P0, plus an embedding only on decks over 80 cards after P3 |
| Supabase Auth user lookups per day | ≈ 1,625 | ≤ 100 (token refreshes) |
| Supabase requests per study grade | ≈ 8 (+ 2 Auth) | 2 (+ 0 Auth) |
| Quiz `sessionStorage` writes | 4 a second | one per answer, plus one when the tab hides |
| Deck page first-load JS | 245.5 kB gz | ≤ 195 kB gz |
| Warm TTFB of a prerendered public page, from UTC+8 | 129–137 ms | ≈ 60 ms (a static asset today: 58 ms) |
| Cards with an embedding | 13% | 100% |

---

## 1. Where the AI calls go

### 1.1 The inventory

Model calls are `ai_usage_logs` reservations weighted by `metadata.calls` (default 1). A chat turn is one reservation but three model calls.

| Feature | `action` | What one use does | Fired by | Does the user wait? | Calls all-time · 30 d | This plan |
|---|---|---|---|---|---|---|
| ~~Lapse mnemonics~~ | `generate_mnemonic` | One plain-text call: a two-sentence memory hook shown on the answer face | `gradeCard` on a first lapse, in `after()` | No (background), but it spent the shared per-minute quota | 30 · 20 | **Removed in P0** (Rev 1.1, OD-3) |
| **Enrichment** | `enrich_cards` | Per 25 cards, one JSON call returning an identification question, 3 MCQ distractors and 2–5 topic tags (`ai-enrich.ts:25–58`); 3 batches at a time (`:166`) | The browser after a bulk import (`BulkImportModal.tsx:120–127`) and after PDF generation (`PDFUploadZone.tsx:150–158`); the quiz on start, for cards missing data (`QuizAssessmentClient.tsx:310–345`); synthesis absorb in `after()` (`synthesis.ts:1093`) | At quiz start, yes. Everywhere else it blocks the tab's other actions (PERF-10) | 59 · 16 | AI-09 (§5.1): questions and distractors from the deck. PERF-10 (§5.3): tags only, in the background |
| **PDF → cards** | `generate_cards` | Per text section, one JSON call; waves of 3 inside a 48 s budget (`ai-generate.ts:54–67`, `:339–360`) | "Generate" | Yes; it's the task | 20 · 14 | AI-18 (§9): by section, streamed; tags in the same call |
| **Embedding sync** | `sync_embeddings` | Embeds up to 200 cards (`chat.ts:42–169`) | Chat widget: "Index" or the first question (`DeckChatWidget.tsx:101–118`, `:235–238`); `updateCard` in `after()` (`card.ts:139`); synthesis absorb | First chat question: yes | 30 · 0 | AI-13 · AI-14 (§5.2, §4.4): at creation, backfilled on visit, never reserved for nothing |
| **Deck chat** | `chat_with_deck` | Query embedding → vector search → streamed answer (`api/chat/route.ts:144`, `:188–213`); the follow-up chips call was removed in P0 | Send | Yes | 9 turns (≈ 27 calls) · 0 | AI-11 done in P0; AI-10 (§7.1) |
| **Card search** | `semantic_search` | Query embedding → vector search over the user's cards (`chat.ts:286–340`) | The palette's "Search cards" row (`CommandPalette.tsx:130–150`) | Yes | 0 · 0 | AI-12 (§7.3): lexical as you type, semantic on request |
| **Note clean-up** | `sanitize_notes` | One text call reformatting pasted notes | "Clean up" in bulk import | Yes; asked for | 2 · 2 | Keep |
| **Synthesis drills** | `synthesis_generate`, `synthesis_check` | Drill and plan generation, answer checks | Drill pages | Yes | 0 · 0 | Out of scope (§11) |
| ~~Hint~~ | `get_hint` | Removed in `6914dbc` (2026-10-14) | — | — | 2 · 1 | Done |

**Mnemonics, in plain terms (removed in P0).** When a card you knew slipped back into relearning, Cognit asked Gemini for a short memory hook and showed it on the answer face next time. It never slowed a review, but it was the largest share of recent model calls, and it fired on first lapses that mostly never recurred (37 of 42). The owner reviewed real ones, such as "Think of Reusability like LEGO blocks…" and "Think of **U**nicorns **M**aking **L**andscapes" for UML, and judged them unhelpful for conceptual decks, so P0 removed the feature (§4.0).

**Enrichment, in plain terms.** Enrichment makes a card quiz-able. It writes the description as a question for Identification mode, three wrong options for multiple choice, and topic tags for the weakest-concepts and topics views. The quiz needs the first two before it can show a card. Today they come from a model, so a fresh deck's first quiz waits for one. So does anything else in the tab when the browser launched it. Yet the deck already holds better raw material for the wrong options: its other terms.

### 1.2 What a call costs in time

On the free tier a small JSON call takes 1.6–2.1 s (Audit II §2), and calls have been seen at 2–61 s, with 504s at about 60 s under congestion (owner's 2026-09-27/28 runs). Embeddings are capped at 100 texts a minute. None of this is stored per call: with a reservation, `recordAiUsage` writes only a console line (`_shared.ts:150–157`), so per-call latency lives only in Vercel's logs. AI-16 adds the record first, so every later gate can measure itself in SQL.

### 1.3 The AI-derived data in production

| Field | Cards | Share |
|---|---|---|
| Identification question + 3 distractors | 342 of 387 | 88% |
| Topic tags | 209 | 54% |
| Embedding | 50 | 13% |
| Mnemonic | 15 | 4% |

Non-empty decks hold 7, 10, 10, 12, 15, 15, 33, 35, 38, 40, 48 and 124 cards; four decks are empty. Of 421 reviews, 49 were *Again*: 42 cards lapsed at least once, 5 at least twice, 2 three times or more.

---

## 2. Findings

### 2.1 Findings

| ID | Sev | Area | Location | Finding | Evidence | Fix |
|---|---|---|---|---|---|---|
| **PERF-10** | S1 | Server Actions | `BulkImportModal.tsx:120–127`, `PDFUploadZone.tsx:150–158`, `QuizAssessmentClient.tsx:289–345`, `DeckChatWidget.tsx:101–118`; `next/dist/client/components/app-router-instance.js:100–158`, `next/dist/client/app-call-server.js:17–18` | Long AI work runs as browser-invoked Server Actions. Every client call to a Server Action is dispatched as `ACTION_SERVER_ACTION` through the router's single action queue. With one pending, the next is appended and waits (`:151–157`); only a navigation jumps the queue (`:139–150`). A background `enrichCards` (3 parallel batches, up to 2 attempts each) therefore holds every later save in the tab: adding, editing or deleting a card, the share toggle, palette search, the quiz's final `logQuizResult`. | measured (source) + code | §5.3 ✓ P1 |
| **AI-10** | S1 | Chat | `DeckChatWidget.tsx:235–238`, `:101–118`; `chat.ts:109` | A deck's first question awaits `runSync()` before it is sent: a loop of up to 20 `syncEmbeddings` actions, each embedding up to 200 cards, with `maxServerDelayMs: 35_000` against the free tier's 100-texts-a-minute cap. 337 of 387 cards are unembedded, so nearly every deck takes this path. | code + prod coverage | §7.1 ✓ P3 |
| **AI-13** | S1 | Search | `card.ts:32` (`createCard`), `:164` (`bulkImportCards`), `ai-generate.ts` (`generateCards`) | No path embeds a card when it is created; embeddings come only from the chat widget, `updateCard` (`card.ts:139`) and synthesis absorb (`synthesis.ts:1093–1095`). With 13% coverage, `search_user_cards_by_embedding` can return at most 13% of cards. | measured (prod) | §5.2 ✓ P1 |
| **AI-09** | S2 | Quiz | `QuizAssessmentClient.tsx:155`, `:289–345`; `count_quiz_ready_cards` (`202609070900_phase25_corrections.sql`); `[deckId]/page.tsx:135`, `:219`, `:402`; `DeckSessionLauncher.tsx:169` | Quiz data comes only from a model: MCQ needs 3 stored distractors and Identification a stored question. A quiz starts by enriching up to 50 cards that lack them, and MCQ falls back to Identification meanwhile. 45 cards lack them today. Every non-empty deck has ≥ 7 cards. The other cards' terms are the standard distractor pool (Quizlet's Learn mode works this way), and masking the term in the description gives an identification prompt with no model. | measured (prod) + code | §5.1 ✓ P1 |
| **AI-11** | S2 | Chat | `api/chat/route.ts:237–254`, `:372–389` | `done`, which ends the turn in the UI, is sent only after a second model call for follow-up chips returns. The answer is already on screen; the input stays busy for one more call (≈ 1.6–2 s at best). The call is capped at 256 output tokens, parsed as JSON, and its failures are swallowed to `[]`. | code | §4.0 ✓ P0 |
| **AI-12** | S2 | Search | `CommandPalette.tsx:130–150`, `chat.ts:286–340` | Card search is semantic only: an Auth check, a reservation, the query embedding, then the vector search, in sequence, as a Server Action, so it can't be cancelled and queues behind PERF-10. There is no lexical search, so finding a term you know still costs a model call and sees only embedded cards. | code | §7.3 ✓ P3 |
| **AI-15** | S2 | Study | `study.ts:50–53`, `:81–96`; `mnemonic.ts:53–75` | A mnemonic is written for every first lapse: 38% of recent model calls, though 37 of 42 lapsed cards never lapsed again. It runs in the background, but on the same per-minute quota as chat and generation. | measured (prod) + code | §4.0 ✓ P0 (removed) |
| **AI-16** | S2 | Observability | `_shared.ts:143–168` | No durable per-call record of latency, outcome, tokens or finish reason: with a reservation, completion is a console line. `ai_usage_logs` is deliberately immutable (`202609050900_immutable_table_deny_policies.sql:81–91`), so it can't be updated in place either. | code | §4.2 ✓ P0 |
| **AI-18** | S2 | Generation | `ai-generate.ts:54–67`, `:339–360`; `PDFUploadZone.tsx:116–165` | PDF generation is all-or-nothing from the user's view: no card shows until every wave finishes or the 48 s budget runs out, and the generated cards need a second model call (enrichment) for tags and quiz data. | code | §9 |
| **PERF-11** | S2 | Server | `study.ts:103`; `next/dist/server/web/spec-extension/revalidate.js:199–203`; `next/dist/server/app-render/action-handler.js:806–826` | Any `revalidatePath` inside a Server Action makes Next render the *current* page into the action's response, whatever path it names. Next's own comment: `// TODO: only revalidate if the path matches`. `gradeCard` revalidates the deck path on every grade, so every grade re-renders the study page (deck, count, capstone candidates, two card reads, settings): ≈ 6 Supabase reads on top of the grade's own 2. The UI doesn't wait, because grades are queued (`FlashcardReviewClient.tsx:199–208`), but the queue drains slower and the session end waits for it. Every dashboard page is dynamic, so the call only purges a 30 s client cache (`next.config.ts` `staleTimes`) that a study session has long outlived. | measured (source) + code | §4.3 ✓ P0 |
| **PERF-12** | S2 | Quiz runtime | `QuizAssessmentClient.tsx:172–186`, `:190–229` | A 250 ms interval sets `sessionDurationMs`, re-rendering the whole ≈ 1,000-line client four times a second. The persistence effect depends on it, so every session card and result is `JSON.stringify`'d and written synchronously to `sessionStorage` 4 times a second: ≈ 2,400 writes in a 10-minute quiz. Study does the same once a second (UIUX PERF-07). | code | §6.1 ✓ P2 |
| **AI-14** | S3 | Embeddings | `chat.ts:55` vs `:59–80` | `syncEmbeddings` reserves an AI call before counting pending cards, so a sync with nothing to do still spends a reservation (against the hourly and 24 h limits) and four round-trips. | code | §4.4 ✓ P0 |
| **AI-17** | S3 | Model config | `gemini.ts:84`, `:148–155` | On Gemini 3, `thinking: 'none'` sends no thinking config, and text calls never send one. That is fast only because `gemini-3.5-flash-lite` defaults to minimal. Pointing `GEMINI_MODEL` at a 3.x model with a higher default would silently add up to 4× latency to every call. | code + Audit II §2 | §4.5 ✓ P0 |
| **PERF-13** | S3 | Bundle | `AddContentPanel.tsx:18–58`; `(shell)/layout.tsx:95–101`; `synthesis/GenerateSynthesisDrillsButton.tsx` | The deck page loads 30.2 kB gz of add-content UI (card form, bulk-import preview, PDF upload) that sits in a `<details>` closed on every deck with cards. It also loads 12.9 kB of drill and plan generation UI before any drill is asked for. Every shell page loads 13.8 kB of shell dialogs (create deck, shortcuts, palette) before ⌘K, ⌘N or ? is pressed. | measured (build) | §8.1 |
| **PERF-14** | S3 | Edge | `proxy.ts:120–125`; `csp.ts:33` | The proxy runs on every non-API page, including prerendered pages that are neither nonce routes nor session readers. Warm TTFB from UTC+8: `/login` 129 ms and `/` 137 ms, against 58 ms for a `_next/static` asset, which skips the proxy. | measured | §8.2 |
| **LC-05** | S3 | Background | `mnemonic.ts:53–75`; `ai-retry.ts` defaults | Background model calls use the interactive retry policy (3 attempts) and ignore the server's retry delay. Under rate limiting they spend more of the minute's quota, and more function time, on work nobody is waiting for. | code | §4.0 ✓ P0 (removed) |

**Referenced, still open, not restated here**

| ID | Where | State on 2026-10-14 | Scheduled |
|---|---|---|---|
| **AUTH-02** (S2) | Next Horizon §6.3 | JWKS `{"keys":[]}`. New evidence: Supabase Auth ran its per-lookup queries 1,624–1,631 times in 23 h 44 min, against 1,795 PostgREST requests (A.4): about one Auth lookup per data request. | P0 (§4.1) |
| **PERF-06** (S2) | UIUX §5.7 | ≈ 0.9 s of animation from a grade to the next readable card; `AnimatePresence mode="wait"` is still at `FlashcardReviewClient.tsx:849`. | **Done in P2** (§6.4); UX-08 not included |
| **PERF-07** (S3) | UIUX §5.1 | The study clock (`:220–230`) still drives a full re-render and the `sessionStorage` write (`:564–589`) every second. | **Done in P2** (§6.4); the REF-01 split stays in UIUX |
| **PERF-08** (S3) | UIUX §6.6 | No `loading.tsx` under `src/app/s/[token]/` or `src/app/explore/`. | UIUX U3 |
| **PERF-09** (S2) | UIUX §8 | No real-user metrics. Needed to confirm P2 and P4 in the field. | After P3 (§3.2) |
| **FLOW-06** | UIUX §6.4 | Item 1 (move PDF enrichment into `after()`) is superseded by §5.3; items 2–4 (an honest counter, `beforeunload`, no infinite animation) stand and move to P5. | P5 |

### 2.2 Verified good: don't break these

- **Co-located:** Vercel functions run in `bom1` and Supabase in `ap-south-1`, both in Mumbai, so a database round-trip never crosses a region.
- **The database is not the bottleneck:** 15 MB, index and table hit rates 1.00. The PostgREST request preamble averaged 0.8 ms over 1,795 calls.
- **The page loaders are single parallel waves:** Today 7 reads (`(shell)/page.tsx:211–244`), the deck page ≈ 10 (`[deckId]/page.tsx:193`), study 6 (`study/page.tsx:73–96`).
- **Grades are queued and never awaited** by the study UI (`FlashcardReviewClient.tsx:199–208`).
- **The default model thinks minimally** (Audit II §2), and JSON calls on Gemini 2.5 send a zero budget (`gemini.ts:83–86`).
- **Already lazy:** KaTeX (74.2 kB gz) and highlight.js (17.8 kB) load only when needed, and Framer Motion's features load after hydration (`MotionProvider.tsx`).
- **Already configured:** React Compiler is on, the client router reuses dynamic pages for 30 s, and every route is inside its bundle budget.

### 2.3 Open verifications

| # | What | How | Needed for |
|---|---|---|---|
| V1 | Signed-in latency: navigation TTFB to `/dashboard` and a deck, and a Server Action round-trip | Appendix B.4 with a test account (OD-4) | G0, G3 |
| V2 | Per-action AI latency, p50 and p95 | AI-16, then a week of data (B.2) | every gate after G0 |
| V3 | Fluid compute on or off | Vercel → project → Settings → Functions | cold starts; the `after()` budget (LC-01) |
| V4 | The free tier's per-minute limit for the chat model | Google AI Studio → rate limits | pacing P1's background tag and embedding jobs (§5.2–§5.3) |

---

## 3. Roadmap

### 3.1 Phases

| Phase | Findings | Size | Gate |
|---|---|---|---|
| **P0** Measure, and the free wins | Mnemonic removal (AI-15, LC-05), AI-11, AUTH-02, AI-16, PERF-11, AI-14, AI-17 | 1–1.5 d | G0 |
| **P1** AI off the user's path | AI-09, AI-13, PERF-10 | 2.5–3.5 d | G1 |
| **P2** Study and quiz feel instant | PERF-12 (+ PERF-06, PERF-07 if UIUX U2 hasn't run) | 0.5 d (+2.5) | G2 |
| **P3** Chat and search | AI-10, AI-12 | 1.75–2.25 d | G3 |
| **P4** Lighter pages | PERF-13, PERF-14 | 1–1.5 d | G4 |
| **P5** PDF generation by section | AI-18 (UIUX OD-8, FLOW-06 items 2–4) | 2 d | G5 |

### 3.2 How this fits with UIUX and SSP

- **UIUX U2.** PERF-06 and PERF-07 belong to it. If U2 hasn't started when P2 begins, do them in P2 as UIUX specifies; PERF-06 is the biggest per-card snappiness win in the app.
- **UIUX FLOW-06.** Item 1 is replaced by §5.3; items 2–4 move to P5.
- **UIUX U5 (PERF-09).** It gives INP and LCP from real users, which is what proves P2 and P4 worked. Recommended right after P3.
- **SSP** is complete apart from owner UAT; nothing here conflicts with it.

### 3.3 Standing rules

1. No model call on a path the user waits on, unless the user asked for AI output (generate, chat, clean up).
2. AI started from the browser goes through a route handler (cancellable, outside the action queue) or is scheduled on the server with `after()`. Never a long Server Action.
3. Every AI path records its time, outcome and tokens (AI-16).
4. A Server Action revalidates only when the page it was called from shows the changed data.
5. Budgets move down, never up (the existing bundle rule).

---

## 4. Phase P0 — Measure, and the free wins (1–1.5 days)

**Status 2026-10-15:** code for §4.0 and §4.2–§4.5 is done, uncommitted, on top of `73eabb5` (§4.7). Still owed by the owner: §4.1 (a dashboard setting) and pushing the §4.2 migration.

### 4.0 Mnemonics and chat follow-ups — removed (OD-3, OD-1) · done

**Mnemonics (AI-15, LC-05).** The owner reviewed real ones and judged them unhelpful for conceptual decks (§1.1). Removed:
- the lapse trigger and its `after()` job in `gradeCard` (`study.ts`), and `src/lib/mnemonic.ts`;
- `mnemonic` from both study loaders' selects and mappings and from `StudySessionCard` (`src/lib/study.ts`);
- the answer-face slot: `FlashcardReviewClient`'s "Memory aid", `FlipCard`'s `answerAside`, the `.flip__aside` rules in `globals.css`;
- the study route's `maxDuration = 60`, which existed only to give that `after()` job a budget (LC-01);
- `generate_mnemonic` from `AiActionName` and the rate limits, its error copy (`ai-feedback.ts`) and its test, `generateMnemonicSchema`, and the clearing of `mnemonic` on card edit (`card.ts`);
- the mnemonic task in `scripts/benchmark-models.mjs`. `scripts/verify-deployment.mjs` probes `reserve_ai_call` with `sanitize_notes` (the probe is refused as anonymous before the action name matters).

**Chat follow-up chips (AI-11).** `api/chat/route.ts` sends `done` straight after the turn is saved, with an empty `followupSuggestions`; `generateFollowups` is gone. The wire field stays, so sessions saved earlier still show their chips.

**Kept on purpose:** the `cards.mnemonic` column (copy and merge RPCs in `202609240910_deck_copy_merge.sql` select it) and `generate_mnemonic` in `ai_usage_logs_action_check` (30 historical rows use it), so no migration. `database.types.ts` still lists the column.

### 4.1 AUTH-02 — ES256 signing keys (owner, ≈ 15 minutes) · owner

Follow Next Horizon §6.3, steps 1–4. No code changes: `getClaims()` (`claims.ts`) verifies locally once the JWKS holds an asymmetric key. Existing HS256 sessions stay valid until they expire (≤ 1 h).

**Verify:** `curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/.well-known/jwks.json"` lists an `ES256` key. A day later, `supabase inspect db calls --linked` shows Supabase Auth's `users` / `identities` / `mfa_factors` selects at refresh volume (≤ 100) instead of ≈ 1,625.

### 4.2 AI-16 — A durable record of every AI call · done (migration to push)

`ai_usage_logs` is an immutable audit log whose rows count against the user's limits, and the Phase 5 assertions forbid SECURITY DEFINER functions, so the outcome goes into its own insert-only table: one row per completed reservation.

- **Migration** `supabase/migrations/202610150900_ai_call_outcomes.sql`: `reservation_id` (PK, FK to `ai_usage_logs`, cascade), `user_id` (FK to `auth.users`, cascade, so account deletion passes assertion 18), `action`, `ms`, `ttft_ms`, `input_tokens`, `output_tokens`, `thought_tokens`, `finish_reason`, `created_at`. RLS with all four commands (select and insert for the owner, update and delete denied), `(select auth.uid())` throughout (assertion 13), and a leading `user_id` index (assertion 14). Parsed with `libpg-query` (12 statements).
- **No outcome column.** A reservation with no outcome row failed or was abandoned, so the failure rate is a left join (B.2) and no call site reports errors.
- **Wiring.** `reserveAiCall` returns `startedAt` with the reservation; `recordAiUsage` takes the whole reservation (every call site now passes `reservation`, not `reservation.reservationId`) and inserts the row with `ms = now − startedAt`. Token totals come from `src/lib/ai-outcome.ts` (`addUsage`, `finishReasonOf`) in note clean-up, enrichment (summed over batches) and PDF generation (summed over sections); chat records `ttft_ms` at its first `delta`. An insert error, including the table not existing yet, is logged and swallowed.
- **Types.** `database.types.ts` gained `ai_call_outcomes` by hand, in the generator's format (alphabetical columns, the one-to-one `reservation_id` relationship listed, `auth.users` not listed). After the push, `npm run db:types` should produce no diff; the CI `database` job compares the two.
- **Tests:** `_shared.test.ts` (reservation carries `startedAt`; the outcome row's fields; an insert error doesn't fail the call; a bare id writes nothing); `ai-outcome.test.ts`.

### 4.3 PERF-11 — Stop re-rendering the study page inside every grade · done

- `gradeCard` no longer calls `revalidatePath`; a comment at the spot explains why. `finishStudySession` still revalidates the deck and the dashboard once, when a session ends.
- The other repeated actions were left as planned: card add, edit and delete revalidate the deck page that shows the change; `logQuizResult` runs once per quiz.
- **Verify on production:** in the Network panel, a grade's response drops from tens of kB (the page payload) to under 1 kB and carries no `x-action-revalidated`.
- **Tests:** `study.test.ts`: `gradeCard` saves through `grade_owned_card` without revalidating; `finishStudySession` revalidates both paths.

### 4.4 AI-14 — Count before reserving · done

`syncEmbeddings` (`chat.ts`) runs both counts in parallel before the reservation and returns without reserving when nothing is pending. **Test:** `chat.test.ts`: zero pending cards, no `reserve_ai_call`.

### 4.5 AI-17 — A guard for model thinking · done

- `MINIMAL_THINKING_DEFAULT = ['gemini-3.5-flash-lite']` in `gemini.ts`; `warnIfThinkingDefaultUnverified(model)` logs once per model when a 3.x model isn't on it, and runs before every JSON, text and stream call. The family override is not an exemption: it sets the config dialect, not the thinking default.
- AI-16's `thought_tokens` makes a model change that starts thinking visible in SQL within a day (B.2).
- `ThinkingLevel.MINIMAL` is still not sent: Audit II found 3.x models differ in which levels they accept, and a rejected field is a 400 on every call.
- **Tests:** `gemini.test.ts` (quiet for 2.5 and for flash-lite; warns once for an unverified 3.x model); the existing test already pins that family 3 with `thinking: 'none'` sends no `thinkingConfig`.

### 4.6 Gate G0

| Check | State 2026-10-15 |
|---|---|
| The JWKS lists `ES256`; Auth lookups ≤ 100 a day, 24 h after the switch (B.5) | Owed by the owner (§4.1) |
| `ai_call_outcomes` holds rows from `npm run ai:smoke` with `ms` and token counts | Owed: push the migration, then run the smoke test |
| `npm run db:types` after the push shows no diff in `database.types.ts`; CI `database` green | Owed: after the push |
| A grade's response carries no page payload (PERF-11 verification) | Owed: after deploy |
| The B.1 and B.2 baseline outputs pasted into a new Appendix A.9 | Owed: a week after the push |
| `npm test`, `tsc --noEmit`, `npm run lint`, `next build` + bundle budgets | ✓ 589 tests in 61 files; build ✓; every route within budget (study 195.0, quiz 197.4 kB gz) |

### 4.7 Execution notes (2026-10-15)

- **Order to ship:** commit everything together (the deleted `src/lib/mnemonic.ts` included, or the build breaks on its missing imports), push the migration (`supabase db push`), then deploy. Deploying first is safe too: until the table exists, outcome inserts fail quietly with a logged warning.
- **Hand-written types are the one unverified piece:** no local Postgres here, so `database.types.ts` was written to the generator's conventions, not generated. If CI's `database` job reports drift on `ai_call_outcomes`, regenerate with `npm run db:types` after the push and commit the result.
- **Tests that changed shape:** `_shared.test.ts` uses `sanitize_notes` as its sample action and matches the reservation with `toMatchObject` (it now carries `startedAt`); `synthesis.test.ts` matches `recordAiUsage`'s reservation argument by `reservationId`; `background.test.ts` labels its sample task `update_card_embedding`.

---

## 5. Phase P1 — AI off the user's path (2.5–3.5 days)

**Status 2026-10-16:** code done, uncommitted, on top of `404dd24`; what was built differs from §5.1–§5.3 where §5.6 says so. Owed by the owner: pushing two migrations, and the B.6 review (§5.6).

### 5.1 AI-09 — Quiz data from the deck (1–1.5 days)

**Distractors.** `pickSiblingDistractors` in `src/lib/distractors.ts` takes the other cards' terms in the same deck as candidates and ranks them. It then passes the top candidates through the existing `selectUsableDistractors`, which already drops the answer, exact duplicates, and anything ≥ 0.85 similar to the answer or to an option already chosen.

```ts
// sketch
export function pickSiblingDistractors(
  card: { id: string; front: string; topic_tags: string[] | null },
  deck: Array<{ id: string; front: string; topic_tags: string[] | null }>,
): string[] {
  const words = (s: string) => s.trim().split(/\s+/).length;
  const tags = new Set(card.topic_tags ?? []);
  const ranked = deck
    .filter((other) => other.id !== card.id)
    .map((other) => ({
      front: other.front,
      score: 2 * (other.topic_tags ?? []).filter((t) => tags.has(t)).length // same topic
        - Math.abs(words(other.front) - words(card.front)),                  // parallel form
      tie: stableHash(card.id + other.id),                                   // same options every run
    }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, 8)
    .map((candidate) => candidate.front);
  return selectUsableDistractors(ranked, card.front); // 3 or []
}
```

**Identification prompt.** `maskTerm(back, front)` in `src/lib/study-prompt.ts` (new) replaces case-insensitive, whole-phrase occurrences of the term (and its simple plural) with `____`. `IdentificationMode`'s eyebrow (`IdentificationMode.tsx:57`) reads "Description" for a masked prompt.

**Where.**
- **Fill on the quiz page.** `(focus)/[deckId]/quiz/page.tsx:133` adds `cards.select('id, front, topic_tags').eq('deck_id', deckId)` to the same `Promise.all` as `select_quiz_cards`. It fills only what's missing, so the 342 cards' stored AI questions and distractors stay (OD-6).
- **Delete the browser enrichment.** Remove `QuizAssessmentClient.tsx:155` (`isEnriching`), `:289–308` (`applyEnrichment`) and `:310–345` (the effect), with the `enrichmentPending` props and notices in `MCQMode.tsx:23, 42, 142` and `IdentificationMode.tsx:124–129`.
- **Redefine quiz-ready.** With the deck as the distractor pool, a card is MCQ-ready whenever its deck has ≥ 4 distinct terms. Remove the "Quiz-ready" readouts (`[deckId]/page.tsx:402`, `DeckSessionLauncher.tsx:169`) and `loadQuizReadyCount` (`:135`, `:219`); they measured AI progress that no longer gates anything. MCQ is offered when the deck has ≥ 4 cards, Identification always. `count_quiz_ready_cards` stays in the database, unused, as later cleanup.
- **Decks under 4 cards** get Identification only. `MCQMode`'s existing `onFallbackToIdentification` covers a card whose siblings yield fewer than 3 options. No model call (OD-2).

**Quality gate before the AI path is deleted.** B.6 prints the AI set and the sibling set, in random order, for 30 random cards that have AI distractors. The owner marks the better set, or "equal". Ship if the sibling set loses on ≤ 10 of 30.

**Tests.**
- `distractors.test.ts`: picks 3 siblings; never the answer or a near-duplicate; the same result twice; `[]` when fewer than 3 are usable; a shared tag wins a tie.
- `study-prompt.test.ts`: masks one-word and multi-word terms, any case, a plural, a term next to punctuation; leaves text without the term untouched.
- A CI grep: `rg -n "enrichCards\(" src/components` returns nothing.

### 5.2 AI-13 — Embeddings when cards are made, and a backfill on visit (0.5–1 day)

- **The job.** `embedPendingCards(supabase, userId, deckId)` goes in `src/lib/card-embeddings.ts` (new; not a `'use server'` file, so not a public endpoint). It selects up to 100 cards with `embedding is null`, and reserves `sync_embeddings` only if there are any (AI-14). Then it makes one `embedTexts` call and applies the result with `apply_card_embeddings_batch`. It's the body of `syncEmbeddings` (`chat.ts:42–169`), which becomes a thin wrapper around it.
- **When cards are made.** `createCard`, `bulkImportCards` and `generateCards` schedule the job with `after(() => runBackground('embed_new_cards', …))`, after `ensureSessionHeadroom()` (LC-02).
- **Backfill on visit.** The deck snapshot gains a head-only count of cards with `embedding is null`, in its existing parallel wave. When it's above zero, the deck page's client fires `fetch('/api/embeddings/backfill', { method: 'POST', keepalive: true })` once per visit.
  - The route calls `ensureSessionHeadroom()` and schedules the job with `after()`. It's a route handler, not the page render, because only a route or an action can write a refreshed session cookie (LC-02).
  - Inside the job, it returns at once if the deck had a `sync_embeddings` reservation in the last 10 minutes.
- **Throughput.** One batch of ≤ 100 per run stays under the free tier's 100-texts-a-minute cap. The 337 missing embeddings fill in over a few deck visits, with no user wait.
- **Tests:** the job reserves only when cards are pending and sends ≤ 100 texts; `createCard` and `bulkImportCards` schedule `embed_new_cards` through a mocked `after`; the backfill route returns 202 and schedules once.

### 5.3 PERF-10 — No AI from the browser's action queue (0.5–1 day)

- **Delete the browser-side `enrichCards` calls** in `BulkImportModal.tsx:120–127` and `PDFUploadZone.tsx:150–158`. The quiz's call goes in §5.1.
- **Tags become a background job.** `tagUntaggedCards(supabase, userId, deckId)` goes in `src/lib/card-tags.ts` (new).
  - **Call shape:** one JSON call per 50 untagged cards, returning only `{ id, topic_tags }`: about 10 output tokens a card instead of about 70.
  - **Reservation:** it reserves `enrich_cards`, so the database CHECK doesn't change.
  - **Writes:** a new `apply_card_tags_batch(p_deck_id, p_rows)` RPC, with the ownership check and single statement of `apply_card_enrichment_batch`. That RPC can't be reused: it overwrites the question and distractors along with the tags (`202609170910_apply_card_enrichment_batch.sql:34–37`).
- **Who schedules tags:**
  - `bulkImportCards` and `generateCards`, through `after()`; `generateCards` only until P5 puts tags into the generation call.
  - Synthesis absorb (`synthesis.ts:1093–1095`), which swaps `enrichCards` + `syncEmbeddings` for `tagUntaggedCards` + `embedPendingCards` and updates its mocks in `synthesis.test.ts`.
  - `createCard`, but only when ≥ 10 of the deck's cards are untagged, checked inside the job.
- **Delete `enrichCards`.** It's a public Server Action endpoint. Remove it, with `enrichCardsSchema`, once nothing calls it.
- **Leave `generateCards` and `sanitizeNotes` as Server Actions.** They're the action the user is waiting on, so queuing behind them is expected. P5 moves generation to a route.
- **Tests:** the CI grep from §5.1; `bulkImportCards` schedules `tag_cards` and `embed_new_cards` through `after`; `apply_card_tags_batch` replays in the CI database job and leaves `mcq_distractors` and `id_question` untouched.

### 5.4 AI-15 · LC-05 — superseded

Mnemonics were removed in P0 (§4.0, OD-3) instead of being limited to second lapses.

### 5.5 Gate G1

| Check | State 2026-10-16 |
|---|---|
| A quiz on a freshly imported deck shows MCQ at once and creates no `enrich_cards` reservation from the quiz | ✓ by construction: the quiz has no enrichment call left; options come from the deck when none are stored (test: `distractors.test.ts`) |
| Right after an import, adding or editing a card returns in normal time while background work runs | ✓ by construction: no browser-invoked AI action remains; confirm in the Network panel after deploy |
| Every deck visited since P1 reaches 100% embedding coverage (B.3) | Owed: after the migrations are pushed and decks are visited |
| The distractor gate (B.6) | **Failed on the agent's reading** (§5.6); owner's review owed |
| 30-day generative calls tracking toward the revised target | Owed: a month of data |
| `npm test`, `tsc --noEmit`, `npm run lint`, `next build` + budgets | ✓ 620 tests in 67 files; build ✓; every route within budget |

### 5.6 Execution notes (2026-10-16)

**The B.6 review.** A blind A/B sheet of 30 random cards that already had AI distractors, with the deck-sourced set computed by the shipped `pickSiblingDistractors`, is at `/private/tmp/claude-501/-Users-marcsantiago-Dev-cognit/23ac7c57-ab06-4750-9955-0a0cee809810/scratchpad/b6/distractor-review.md`, with the answer key in `distractor-review-key.txt` beside it. It was generated from a read-only export by a scratchpad script, not a repo test (a one-off review). On the agent's reading the AI sets win about 15–17 of 30 and the deck's 3–4, the rest even, so the gate (deck loses on ≤ 10) fails:
- **Where the deck loses:** decks mix kinds of term. "Paciano" draws symbols, "University of Santo Tomas" draws Rizal's essays. Decks also hold near-synonym cards ("Data Transfer Cost" offered for "Data Transfer Pricing").
- **Where the AI loses, more rarely:** the answer itself among the options (#7), and near-synonyms ("Service Disruption" for "Interruption").
- **Two ranking fixes went in after the first pass:** shared content words now score (the other "… generation computers" for "Fifth generation computers"), and a term containing the answer is never offered. Deck terms use a 0.93 near-duplicate cut instead of 0.85, which rejected real parallel terms.

**What was built instead of §5.1/§5.3's deck-only design (a hybrid):**
- **The quiz never waits.** `fillSiblingDistractors` gives every card without three stored options a deck-sourced set on the quiz page; prompts are `quizPrompt()` (the stored AI question if any, else the masked description), in the browser and in `logQuizResult`'s stored text.
- **AI distractors are still written, in the background.** `src/lib/card-enrichment.ts` (`enrichPendingCards`) asks for three distractors (the old prompt's rules, plus "match the term in kind") and 2–4 tags per card, 25 cards a call, up to 4 calls a run, one attempt each, reserved as `enrich_cards`. Identification questions are no longer written: the masked description replaces them, which roughly halves the output. `AI_DISTRACTORS` in that file turns the distractor half off (OD-7).
- **The write** is a new RPC, `apply_card_background_enrichment_batch` (migration `202610160900`), which sets only non-empty tags and complete sets of three, leaving the stored question alone. The tags-only `apply_card_tags_batch` in §5.3 was never pushed and is not in the tree.
- **Removed:** the `enrichCards` Server Action and `enrichCardsSchema`, all three browser calls (bulk import, PDF upload, quiz start), the quiz's enrichment state and "pending" notices, the deck page's "Quiz-ready" readouts and `loadQuizReadyCount` (`count_quiz_ready_cards` stays in the database, unused), and the `enrich cards` error copy.

**Embeddings and the backfill (§5.2), as built:**
- `src/lib/card-embeddings.ts` (`embedPendingCards`) is the old `syncEmbeddings` body; the action is now a wrapper used by the chat widget's Index button.
- `src/lib/card-derived.ts` (`fillDerivedCardData`) runs one embedding batch, then enrichment, each even if the other fails. `bulkImportCards`, `generateCards` and synthesis absorb schedule it with `after()`.
- **Backfill route:** `POST /api/decks/backfill` (not `/api/embeddings/backfill`: it fills tags and distractors too). It is throttled to one run a minute per user (`derivedDataRanRecently`, the free tier's quota window), not ten minutes, so a 300-card import fills in minutes.
- **Manual cards:** `createCard` schedules nothing. The deck page counts cards missing an embedding, tags or distractors in its existing parallel wave, and `CardDataBackfill` asks the route again whenever that count changes. Cards added by hand are filled in batches, not one reservation per card against the hourly and 24 h limits.

**Tests added or changed:** `distractors.test.ts`, `study-prompt.test.ts`, `card-embeddings.test.ts`, `card-enrichment.test.ts`, `card-derived.test.ts`, `api/decks/backfill/route.test.ts`, `card.test.ts`; `synthesis.test.ts` mocks the fill job; `ai-generate.test.ts` and the live `pdf-generation.live.ts` mock `after`, the fill job and `ensureSessionHeadroom`.

**Order to ship:** push both migrations (`202610150900`, `202610160900`), then deploy. Before the push, deploying is safe: the outcome inserts and the background enrichment write fail quietly, and quizzes use deck-sourced options.

## 6. Phase P2 — Study and quiz feel instant (0.5 day, +2.5 if UIUX U2 hasn't run)

**Status 2026-10-17:** code done, uncommitted, on top of `cbc5bce`; measured in §6.4.

### 6.1 PERF-12 — The quiz clock and its persistence (0.5 day)

- **The clock.** Keep `startedAtMs` and `pausedTotalMs` in state and derive elapsed time when needed. An `<ElapsedReadout>` child owns the one-second interval for the telemetry readout (`QuizAssessmentClient.tsx:643`), so the quiz body stops re-rendering.
- **Persistence.** Save when `index`, `results`, `isPaused` or `hasSavedResult` change, and on `pagehide` or `visibilitychange` to hidden. Never on the clock.
- **Shared helpers.** Put the clock math and the snapshot in `src/lib/session-clock.ts` and `persistableQuizState()`, so UIUX §5.1's study fix (PERF-07) reuses them.
- **Tests:** pure tests for the clock (pause and resume, resume from storage) and for the snapshot, which must not contain the clock.

### 6.2 PERF-06 · PERF-07 — The study loop

If UIUX U2 hasn't run by now, do UIUX §5.7 (transitions: ≈ 0.9 s → ≤ 0.3 s per advance) and §5.1 (the study clock) here, as specified there.

### 6.3 Gate G2

| Check | State 2026-10-17 |
|---|---|
| No quiz-body re-renders from the clock | ✓ by construction: no interval in the quiz or study client; `ElapsedTelemetry` alone ticks |
| `sessionStorage` writes: per answer and per hide, never on the clock | ✓ measured: 0 writes in 5 s idle on both pages (before: 20 quiz, 5 study); study 2 per card (before: 3.8) |
| Grade → next card readable ≤ 300 ms; Space → answer readable ≤ 200 ms (UIUX budgets) | ✓ measured: 229 ms and 175–195 ms (before: 963 ms; flip settled at 540 ms, the face showing at half of the 520 ms flip by the CSS, not measured) |
| INP p75 on `/quiz` and `/study` ≤ 200 ms | Owed: needs PERF-09 (UIUX U5) |
| `npm test`, `tsc --noEmit`, `npm run lint`, `next build` + budgets | ✓ 625 tests in 68 files; build ✓; study 196.2 kB gz (≤ 199), quiz 197.4 (≤ 202) |

### 6.4 Execution notes (2026-10-17)

**What was built.**
- **Shared clock.** `src/lib/session-clock.ts` (`foldSegment`, the shared `formatDuration`, with tests) and `src/components/ui/shared/ElapsedTelemetry.tsx`: the only component that re-renders each second, keyed by running state and base time so each running segment counts from its own start.
- **Quiz (PERF-12).**
  - The 250 ms interval is gone. A running segment's start sits in a ref and folds into `durationRef` when the clock stops.
  - React runs that cleanup before the save-result effect in the same commit, so `logQuizResult` gets the folded total.
  - The session is saved when it changes and on `visibilitychange` → hidden and `pagehide`, with the duration read live from the refs.
- **Study (PERF-07).**
  - The 1 s interval is gone; `nowMs` moves on events only.
  - Saving follows the quiz pattern, adding `isPaused` to the dependencies so a paused clock is read as frozen.
  - This is UIUX §5.1's persistence and clock half; its file split (REF-01) is behaviour-preserving refactoring that stays in UIUX.
- **Transitions (PERF-06), as UIUX §5.7 specifies:**
  - `AnimatePresence mode="popLayout" initial={false}` on a `relative` container.
  - The card exits on a 90 ms opacity tween; it enters with the spring on `y` and opacity on a 120 ms tween.
  - The commit flash goes 160 → 120 ms, and `--dur-flip` 520 → 320 ms. `motionTransitions.flip` (used by `Flashcard.tsx`) moves to 0.32 s too, so there is one flip speed.
  - UX-08 (Space grades Good) is a keyboard-behaviour change waiting on UIUX OD-3 and was not done.

**How it was measured.** Two scratch clones, `cbc5bce` and P2, each with a throwaway `/p2-preview` route rendering the real study and quiz clients with eight cards and a stubbed grade action. Both ran as production builds (`next start`), driven by `playwright-core` with system Chrome; timings are `requestAnimationFrame` polls from the key event, median of five cards.

| Measure | Before | After |
|---|---|---|
| Grade key → next card readable (opacity ≥ 0.99) | 963 ms | **229 ms** |
| … next card at rest (spring settled on `y`) | 963 ms | 362 ms |
| Space → answer face visible | — | 175–195 ms |
| Space → flip settled | 540 ms | 327 ms |
| Study saves while idle, 5 s | 5 | **0** |
| Study saves per card | 3.8 | 2 |
| Quiz saves while idle, 5 s | 20 | **0** |
| Quiz elapsed frozen while paused (2.5 s) | yes | yes |
| Quiz result duration, 8 answers, 6.8 s wall | "6s" | "6s" |

**Found along the way (not P2, not fixed):** after pausing and resuming a quiz with `P`, the next keyboard answer shows "Incorrect" with no option marked as chosen, and Space does not continue. It reproduces identically on `cbc5bce` and on P2, so it predates this work; without a pause the same key sequence completes all eight questions. Suspect `MCQMode`'s option shuffle (`Math.random` inside a `useMemo`) being re-run across the pause, so the chosen string no longer matches the displayed options. It needs its own fix and test.

## 7. Phase P3 — Chat and search (1.75–2.25 days)

**Status 2026-10-18:** code done, uncommitted, on top of `4427194`; §7.5 says where it differs from §7.1 and §7.3.

### 7.1 AI-10 — Chat never waits for indexing, and small decks need no index (0.75 day)

- **No pre-send sync.** Delete `DeckChatWidget.tsx:235–238`. The "Index" button stays as a manual nudge while a deck backfills.
- **Small decks in full context.** In `api/chat/route.ts`, before `retrieveDeckContext` (`:144`), a deck with ≤ 80 cards loads all of them (`id, front, back`) and skips the query embedding and the vector search.
  - 11 of the 12 non-empty decks qualify; the 124-card deck keeps retrieval.
  - At ≈ 60 tokens a card, that's at most ≈ 5k input tokens, small for flash-lite.
- **Large decks still backfilling.** `retrieveDeckContext` returns what's embedded and adds lexical matches (§7.3's RPC) for the rest.
- **Tests:** a small deck makes no `embedTexts` call; the widget sends without calling `syncEmbeddings`.

### 7.2 AI-11 — done in P0

Follow-up chips were dropped (OD-1), so `done` follows the answer directly (§4.0).

### 7.3 AI-12 — Instant lexical search; semantic search by route (1 day)

```sql
-- migration sketch
create extension if not exists pg_trgm with schema extensions;
create index if not exists cards_front_trgm_idx on public.cards using gin (lower(front) extensions.gin_trgm_ops);
create index if not exists cards_back_trgm_idx  on public.cards using gin (lower(back)  extensions.gin_trgm_ops);

create or replace function public.search_user_cards_lexical(p_query text, p_limit integer default 8)
returns table (card_id uuid, deck_id uuid, deck_title text, front text, back text)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select '%' || replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select c.id, c.deck_id, d.title, c.front, c.back
  from public.cards c
  join public.decks d on d.id = c.deck_id and d.user_id = (select auth.uid()) and d.deleted_at is null
  cross join q
  where length(trim(p_query)) >= 2
    and (lower(c.front) like q.pat or lower(c.back) like q.pat)
  order by (lower(c.front) like q.pat) desc, length(c.front)
  limit least(greatest(p_limit, 1), 20);
$$;
```

- **Routes.** `GET /api/search?q=` is lexical: no model, no reservation. `GET /api/search/semantic?q=` is today's semantic path, moved.
  - The palette calls both with `fetch` and an `AbortController`: lexical as you type (120 ms debounce, ≥ 2 characters), semantic from a "Search by meaning" row.
  - Both run outside the action queue and can be cancelled.
- **Cache.** A server-side LRU of query embeddings (200 entries, 10 minutes), so a repeated query costs no model call.
- **Tests:** the RPC replays in the CI database job; the lexical route never calls `reserve_ai_call`; a new keystroke aborts the previous request.

### 7.4 Gate G3

| Check | State 2026-10-18 |
|---|---|
| The first answer on a 40-card deck creates no `sync_embeddings` reservation and makes no query embedding | ✓ by construction: the widget no longer syncs before sending, and a deck within the limits is answered whole (`rag.test.ts`, `chat-context.test.ts`) |
| Chat `ttft_ms` p50 (B.2) below its P0 baseline | Owed: needs the migrations pushed and some chat use |
| `done` precedes follow-ups | Done in P0 (follow-ups removed) |
| A palette search for a known term returns text matches with no `semantic_search` reservation | ✓ unit tests (`card-search.test.ts`, `api/search/route.test.ts`) and a browser run (§7.5); server time ≤ 150 ms owed on production |
| `npm test`, `tsc --noEmit`, `npm run lint`, `next build` + budgets | ✓ 645 tests in 74 files; build ✓; every route within budget (shell pages +0.3 kB gz for the palette's second search) |

### 7.5 Execution notes (2026-10-18)

**Chat (AI-10).**
- **No pre-send sync.** `DeckChatWidget` sends the question straight away; the auto-sync and its ref are gone.
- **The index banner** shows only for decks too large to send whole, and now says the cards are being indexed in the background (P1's deck-visit backfill), with "Index now" kept as a manual nudge.
- **Whole-deck mode.** `src/lib/chat-context.ts`: `fitsWholeDeck` (≤ 80 cards and ≤ 24,000 characters of card text) and `rankReferences`, which picks the source chips by words shared with the question, a term match counting double.
  - `api/chat/route.ts` reads up to 81 of the deck's cards and, when they fit, sends them all, skipping the query embedding and the vector search.
  - `buildDeckChatSystemInstruction({ wholeDeck })` tells the model it has the whole deck and must say when the deck does not cover the question rather than answer from general knowledge.
  - Usage metadata records `context_mode` (`whole_deck` / `retrieved`).
- **Not done: the lexical fallback for large decks still being indexed.** A question is natural language, so a substring match on it finds little; it would need full-text search, a second migration. Only one deck is over the limit, and the deck-visit backfill (60 s pacing) indexes it within minutes of opening it. If chat on large decks gets used before then, add a `websearch_to_tsquery` fallback.

**Search (AI-12).**
- **The lexical function.** Migration `202610180900_search_user_cards_lexical.sql`: `pg_trgm` in the `extensions` schema, trigram GIN indexes on `cards.front` and `cards.back`, and `search_user_cards_lexical(p_query, p_limit)`.
  - `ILIKE` with LIKE wildcards escaped, term matches first, then shorter terms.
  - Filtered to the caller's own decks: RLS also exposes publicly shared decks' cards. Trashed decks are excluded.
  - Its query was run read-only against production with the owner's id in place of `auth.uid()`: "generation" returned the five computer generations in order; "%" matched only the two cards containing a literal percent sign.
- **The search module.** `src/lib/card-search.ts`: `searchCardsByText` and `searchCardsByMeaning`, the latter with `src/lib/query-embedding-cache.ts` (200 entries, 10 minutes, per instance, keyed case- and space-insensitively). A cached query spends no reservation and makes no model call.
- **Routes:** `GET /api/search?q=` (≥ 2 characters, no AI) and `GET /api/search/semantic?q=` (≥ 3), both `Cache-Control: private, no-store`. The `semanticSearchCards` Server Action is deleted.
- **The palette.**
  - Text matches load as you type (120 ms after the last key), with the previous request cancelled.
  - "Search by meaning for …" is its own row; its results list only cards not already shown as text matches, and clear on the next keystroke.
  - The old "open a deck's chat panel once to index it" copy is gone.
- **Browser run.** A production build of a scratch clone, with the two routes stubbed to return sample cards, driven in Chrome. Typing "mit" at 30 ms per key sent one `/api/search?q=mit`; "Mitosis" and "Mitochondria" listed under Cards; "Search by meaning" added only "Meiosis"; the next keystroke cleared it and searched "mito"; no page errors. A double border above the first result group was fixed (`first:border-t-0`).

**Tests added:** `chat-context.test.ts`, `rag.test.ts`, `query-embedding-cache.test.ts`, `card-search.test.ts`, `api/search/route.test.ts`, `api/search/semantic/route.test.ts`.

**Not verified here:** a real chat answer in whole-deck mode (needs a signed-in session and the live model). Ask a few questions on a small deck after deploying, including one the deck doesn't cover, which should be declined.

**Order to ship:** three migrations are now unpushed (`202610150900`, `202610160900`, `202610180900`); push them, then deploy. Before the push, palette text search returns an error (the function doesn't exist) and shows nothing; semantic search and chat work.

## 8. Phase P4 — Lighter pages (1–1.5 days)

### 8.1 PERF-13 — Load unopened UI when it's opened (0.5–1 day)

- **Add content.** A small client `<AddContentBody>` mounts `AddCardForm`, `BulkImportModal` and `PDFUploadZone` through `next/dynamic` only once the `<details>` opens (`onToggle`). When `hasCards` is false the panel starts open and loads at once.
- **Drill generation.** `GenerateSynthesisDrillsButton` loads through `next/dynamic` when `SynthesisLauncher` first needs it.
- **Shell dialogs.** A few-line listener, always mounted, handles ⌘K, ⌘N, ? and the open events. It imports `CommandPalette`, `CreateDeckModal` or `KeyboardShortcutsDialog` on first use, and prefetches them when the browser is idle (`requestIdleCallback`).
- **Budgets.** Lower them after measuring: the deck page 250 → ≈ 195 kB gz, other shell pages by about 13 kB each.
- **Tests:** the bundle report against the new budgets in CI. Manual: ⌘K opens the palette on a cold page in under 200 ms.

### 8.2 PERF-14 — Keep the proxy off static pages (0.25–0.5 day)

- **What the proxy is for.** Nonce CSP on `/dashboard` and `/s/` (`csp.ts:33`); redirects for `/dashboard` and `/login/update-password`; and a session-cookie refresh for pages that read the session. Prerendered pages (`/` and `/login`, both `x-vercel-cache: PRERENDER`) read no session on the server.
- **Change.** Set the matcher (`proxy.ts:120–125`) to `/dashboard/:path*`, `/s/:path*` and `/login/update-password`, plus any route the next step finds.
- **Check before merging.** Run `rg -n "getSessionUser\(|getRequestClient\(|cookies\(\)" src/app`. Every route that matches stays in the matcher; `/explore` and the auth callback are likely candidates.
- **Expect:** `/` and `/login` at static-asset TTFB, ≈ 60 ms warm from UTC+8 (B.4).

### 8.3 Gate G4

- The bundle report passes the lowered budgets.
- The B.4 probe shows `/` and `/login` within 20 ms of the static asset.
- Signing in, signing out and the password-reset link still work (manual).

---

## 9. Phase P5 — PDF generation by section, streamed (2 days)

### 9.1 AI-18

- **Stream by section.** `POST /api/generate` streams server-sent events, using the deck chat's pattern (`sse-parsing.ts`). It sends one event per section as it finishes, so the first cards show after one call instead of after the whole run. A real cancel (`AbortController`) stops the remaining sections and their reservations.
- **Tags in the same call.** Add `topic_tags` (2–4) to the generation schema (`ai-generate.ts:246–272`). PDF cards then need no second call: distractors and prompts come from the deck (§5.1), embeddings from `after()` (§5.2).
- **Save as you go.** Each section's cards are saved when it finishes, so a closed tab keeps the finished sections. UIUX FLOW-06 items 2–4 apply: an elapsed counter, `beforeunload`, no infinite animation.
- **No 48 s ceiling.** A long PDF runs as two requests driven by the client (a section `offset`), each inside the route's 60 s `maxDuration`.

### 9.2 Gate G5

- The first cards are visible within one section's latency (`ai_call_outcomes.ms` of the first section).
- Cancel stops further reservations.
- PDF cards have tags without an `enrich_cards` reservation.

---

## 10. Owner decisions

| # | Decision | Options | Recommended |
|---|---|---|---|
| **OD-1** | Chat follow-up chips | Keep them, sent after `done` · drop them | **Decided 2026-10-15: dropped** (§4.0). |
| **OD-2** | Decks under 4 cards | Identification only · keep AI distractors for them | **Identification only.** No such deck exists today, and it keeps the quiz model-free. |
| **OD-3** | Mnemonics | Second lapse · an on-demand button · off | **Decided 2026-10-15: removed entirely** (§4.0), after reviewing real examples. |
| **OD-4** | A test account | Add `LOAD_TEST_EMAIL` and `LOAD_TEST_PASSWORD` to `.env.local` | **Yes.** Every signed-in gate (V1) needs it; it's the same ask as UIUX. |
| **OD-5** | Region | Stay in Mumbai · move Supabase and Vercel to Singapore | **Stay.** A region move means a new Supabase project and a data migration; revisit with real-user data (PERF-09). |
| **OD-6** | The 342 cards that already have AI distractors | Keep them · recompute every card from the deck | **Keep.** They're already paid for, and the gate (B.6) compares against them. |
| **OD-7** | AI distractors in the background job | Keep (`AI_DISTRACTORS = true`) · deck options only | **Keep**, unless the owner's own B.6 review finds the deck sets lose on ≤ 10 of 30 (§5.6). Turning it off saves roughly 10–15 calls a month at current use. |

## 11. Out of scope

- **Synthesis drills.** Generation, checks and plans have 0 production calls, and their budgets live in the micro-synthesis plans. Revisit when they have users.
- **A different model or a paid tier.** The default model is already the fast, minimal-thinking one; a paid tier changes quotas, not this plan's structure.
- **Caching dashboard pages across requests** (`cacheComponents`, partial prerendering). Every dashboard route is per-user and carries a nonce, so the gain is small next to AUTH-02 and PERF-11. Revisit with real-user data.
- **The region move** (OD-5).

---

## Appendix A — Evidence (2026-10-14)

### A.1 AI usage by action

```sql
select action, count(*) as reservations,
       sum(coalesce((metadata->>'calls')::int, 1)) as model_calls,
       sum(coalesce((metadata->>'calls')::int, 1)) filter (where created_at > now() - interval '30 days') as calls_30d
from public.ai_usage_logs group by action order by model_calls desc;
```

| action | reservations | model calls | last 30 d |
|---|---|---|---|
| enrich_cards | 55 | 59 | 16 |
| sync_embeddings | 30 | 30 | 0 |
| generate_mnemonic | 30 | 30 | 20 |
| generate_cards | 20 | 20 | 14 |
| chat_with_deck | 9 | 9 (≈ 27 real: 3 per turn) | 0 |
| get_hint | 2 | 2 | 1 |
| sanitize_notes | 2 | 2 | 2 |

One user. Quizzes: Identification 5, MCQ 16.

### A.2 AI-derived fields and deck sizes

Cards 387 · question + 3 distractors 342 · tags 209 · embedding 50 · mnemonic 15. Decks not in trash, by card count: 0, 0, 0, 0, 7, 10, 10, 12, 15, 15, 33, 35, 38, 40, 48, 124.

### A.3 Lapses

`study_logs`: 421 reviews, 49 with `grade = 0` (*Again*). Cards with ≥ 1 lapse: 42; ≥ 2: 5; ≥ 3: 2.

### A.4 Database

`supabase inspect db db-stats --linked`: database 15 MB, index hit rate 1.00, table hit rate 1.00, 23 h 44 min since stats reset.

`supabase inspect db calls --linked`, top rows by calls:

| Statement (abridged) | Calls | Total time |
|---|---|---|
| PostgREST request preamble `select set_config('search_path', …)` | 1,795 | 1.39 s |
| Auth: `SELECT … FROM mfa_amr_claims …` | 1,631 | 0.04 s |
| Auth: `SELECT … FROM sessions …` | 1,631 | 0.10 s |
| Auth: `SELECT … FROM identities …` | 1,625 | 0.06 s |
| Auth: `SELECT … FROM mfa_factors …` | 1,625 | 0.04 s |
| Auth: `SELECT … FROM users …` | 1,624 | 0.11 s |

The `outliers` list held only CLI and migration-tool statements: no application query stands out.

### A.5 Where things run

- Supabase project `cognit`: region `ap-south-1`, Postgres 17.6.
- Vercel: a function response carries `x-vercel-id: hkg1::bom1::…` (edge Hong Kong, function Mumbai). Prerendered pages answer `hkg1::…` with `x-vercel-cache: PRERENDER`. `vercel.json` sets no `regions`.
- JWKS: `{"keys":[]}`.

### A.6 Warm TTFB from UTC+8

Seven requests each over one connection, after a discarded first round:

| URL | Mean | Samples (ms) |
|---|---|---|
| `/_next/static/chunks/ae95421e7ae69449.js` (no proxy) | 58 ms | 59 61 51 61 57 57 53 |
| `/login` (prerendered) | 129 ms | 130 130 155 133 114 121 117 |
| `/` (prerendered) | 137 ms | 136 118 126 200 116 150 111 |

### A.7 Next.js source (`next@16.1.0`)

- `client/app-call-server.js:17–18`: a Server Action call dispatches `ACTION_SERVER_ACTION` through the router's action queue.
- `client/components/app-router-instance.js:129–158`: an empty queue starts the action at once. A navigation marks the pending action discarded and runs first. Anything else "is added to the end of the queue. It will be started by runRemainingActions after the previous action finishes".
- `server/web/spec-extension/revalidate.js:199–203`: `revalidatePath` without a profile sets `pathWasRevalidated`, under the comment `// TODO: only revalidate if the path matches`.
- `server/app-render/action-handler.js:806–826`: the page is rendered into the action's response unless `pathWasRevalidated` is unset or `ActionDidNotRevalidate`.

### A.8 Bundle (`73eabb5`, `next build`, gzip)

| Route | First-load JS | Budget |
|---|---|---|
| `/dashboard/[deckId]` | 245.5 kB | 250 |
| `/dashboard` | 220.2 | 226 |
| `/dashboard/settings` | 213.6 | 219 |
| `/dashboard/[deckId]/quiz` | 197.5 | 202 |
| `/dashboard/[deckId]/study` | 195.1 | 199 |
| `/` | 184.0 | 188 |

- **Framework root** (React DOM + router): 118.5 kB of every route.
- **Deck page beyond the root** (126.5 kB): add-content UI 30.2 kB (deck page only), shell dialogs 13.8 kB (7 shell routes), drill generation UI 12.9 kB (deck page only). The rest is shared by 7–17 routes: toasts, error boundaries, auth form checks.
- **Lazy, in no first load:** KaTeX 74.2 kB, highlight.js 17.8 kB.

---

## Appendix B — Gate queries and probes

### B.1 Generative model calls, last 30 days

The A.1 query. Compare `calls_30d`, leaving out `sync_embeddings` and `semantic_search`: embedding requests are a separate, cheap quota and are counted on their own.

### B.2 Latency and completion per action (after AI-16)

A reservation with no outcome row failed or was abandoned, so completion is a left join.

```sql
select r.action,
       count(*) as reservations,
       count(o.reservation_id) as completed,
       round(100.0 * (count(*) - count(o.reservation_id)) / count(*), 1) as not_completed_pct,
       percentile_disc(0.5)  within group (order by o.ms) as p50_ms,
       percentile_disc(0.95) within group (order by o.ms) as p95_ms,
       percentile_disc(0.5)  within group (order by o.ttft_ms) filter (where o.ttft_ms is not null) as p50_ttft_ms,
       sum(o.output_tokens) as output_tokens,
       sum(o.thought_tokens) as thought_tokens
from public.ai_usage_logs r
left join public.ai_call_outcomes o on o.reservation_id = r.id
where r.created_at > now() - interval '7 days'
group by r.action order by r.action;
```

### B.3 Embedding coverage per deck

```sql
select d.title, count(c.id) as cards, count(c.embedding) as embedded
from public.decks d left join public.cards c on c.deck_id = d.id
where d.deleted_at is null group by d.id, d.title order by cards desc;
```

### B.4 TTFB probe

```bash
asset=/_next/static/chunks/<any chunk the page loads>.js
args=(); for i in 1 2 3 4 5 6 7 8; do args+=(-o /dev/null "https://cognit-nine.vercel.app$asset" -o /dev/null "https://cognit-nine.vercel.app/login" -o /dev/null "https://cognit-nine.vercel.app/"); done
curl -s -w "%{url_effective} %{time_starttransfer}\n" "${args[@]}" | tail -n +4
```

Signed-in routes need the test account (OD-4). Sign in once with `scripts/get-user-token.mjs`, send its cookies with `-b`, and probe `/dashboard` and a deck the same way.

### B.5 Auth lookups

Run `supabase inspect db calls --linked` 24 h after the ES256 switch and read the `users` / `identities` / `mfa_factors` selects; `db-stats` prints the stats window.

### B.6 Distractor comparison (owner review)

A live-style Vitest file, `src/test/live/distractor-compare.live.ts`, run by `npm run ai:distractors`:
1. It reads an export of `id, deck_id, front, back, topic_tags, mcq_distractors` from `supabase db query --linked`.
2. It draws 30 cards with AI distractors at a fixed seed.
3. For each card it prints the term, then sets A and B: the AI set and the sibling set, in random order, with the order saved to a key file.

The owner writes the better letter, or `=`, next to each card.

---

## Appendix C — Lists

### C.1 Every model call with a reservation (wrap with AI-16)

Done in P0: every site below passes the reservation to `recordAiUsage`; tokens where marked.

- `ai-assist.ts:26`: sanitize (tokens).
- `ai-enrich.ts:142`: enrich (tokens). Deleted in §5.3 and replaced by `card-tags.ts`.
- `ai-generate.ts:212`: generate (tokens).
- `card.ts:140`: update embedding.
- `chat.ts:55`: sync; `chat.ts:298`: semantic search.
- `api/chat/route.ts:85`: chat (`ttft_ms`).
- `synthesis.ts:397`, `:671`, `:1178`, `:1346`, `:1524`: synthesis.

### C.2 `revalidatePath` per action file

`card.ts` 12 · `synthesis.ts` 10 · `deck-lifecycle.ts` 10 · `deck.ts` 4 · `study.ts` 3 · `share.ts` 3 · `settings.ts` 3 · `ai-enrich.ts` 3 · `quiz.ts` 2 · `ai-generate.ts` 2.

The one that runs on every interaction is `gradeCard` (`study.ts:103`). Card mutations on the deck page revalidate the page they're shown on, which is correct.
