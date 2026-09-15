# Cognit — Micro-Synthesis Feature Audit

**Companion to:** `COGNIT_MICRO_SYNTHESIS_SPEC.md` (Rev. B.1, Phases 0–2) · **Audited:** 2026-09-15 · **Against:** `main` @ `983830d` + the Phase 2 working tree
**Method:** every file the feature touches was read end to end — the three Server Actions, the pure library, the loaders, the migration, the seven components, the three route pages, the CSS block — and traced against the two shared layers it depends on (`_shared.ts` reservations, `action-guard.ts`, `ai-retry.ts`). Findings are ranked by real-world impact on a student mid-sprint, not by how easy they are to see.

Gate at audit time: `npx tsc --noEmit` clean · `npm run lint` clean · `npm test` 313 / 31 · `npm run build` 16 routes.

**Status (2026-09-15, same day):** implemented as spec §12.2c "Phase 3" — every R and P item, U1–U5, F1–F5. Gate after: `npm test` **336 / 32**, lint and tsc clean, build 16 routes. Migration `202609150900_micro_synthesis_phase3.sql` written, **not applied**. Not done, deliberately: card-text sanitisation (R9 — false positives on legitimate `System:` / `User:` definitions), F6 exam-date cadence, F7 edit/regenerate, F8 voice, F9 shared-deck drills. The ✅ marks below say what landed; the original text is kept as the record of why.

---

## 0. Executive summary — what to do first

| # | Finding | Area | Impact | Effort |
|---|---|---|---|---|
| R1 ✅ | Four action calls run inside `startTransition` with no `try/catch`; a network or platform failure throws into `dashboard/error.tsx` and the drill canvas is replaced by the error page | Reliability | **High** — the most likely failure (a function timeout) destroys the screen | S |
| R2 ✅ | No `maxDuration` on the two pages that invoke the actions; worst case for a check is ≈ 17 s, for generation ≈ 25 s — over the non-Fluid platform default (10 s Hobby / 15 s Pro) | Reliability | **High** — silent 504s, spend reserved, nothing saved | S |
| R3 ✅ | `finishReason` is never read; output caps of 640 / 768 tokens are tight for a thinking-capable model, and a truncated JSON is retried once then reported as "AI could not produce a valid drill" | Reliability | High | S |
| R4 ✅ | Strict Zod maxima (`evidence ≤ 200`, `gap_note ≤ 400`, `ai_assessment ≤ 300`, …) reject the *whole* model output for a length overrun; the fix is to clamp, not reject | Reliability | High | S |
| R5 ✅ | Deleted anchor cards leave "zombie" active drills that count toward the 40-drill cap but are never served, so they cannot be archived from the UI — generation eventually locks | Correctness | High (slow-burn) | S |
| R6 ✅ | Contradiction verification is exact normalised substring on both sides; most model contradictions fail it and are shown as *Unverified · outside deck* with the **card's** words presented as the "AI assessment" — misleading, and the feature's only card effect (pull-forward) rarely fires | Correctness / UX | **High** | M |
| R7 ✅ | `Esc` during `checking` leaves the page (`dirty` is false once the phase leaves `answering`); the paid diagnostic is saved but never shown | UX / spend | Medium | S |
| R8 ✅ | No idempotency on `checkSynthesisAttempt`; a client retry after a platform timeout runs a second model call and inserts a second attempt | Reliability / spend | Medium | M |
| P1 ✅ | Deck overview awaits two heavy reads (drills with JSONB + ≤ 300 attempts with JSONB) serially, before first paint, to show three numbers | Performance | High on the most-visited page | M |
| P2 ✅ (reads) | Check action: 8 sequential DB round trips around the model call; 3 can be parallelised. Generation's embedding fallback is up to 30 sequential round trips | Performance | Medium | S–M |
| P3 ✅ | Answer key (`required_links`, `exemplar`) and card definitions ship to the browser at page load, before the student answers | Integrity / payload | Medium | M |
| U1 ✅ | No end-of-launch summary: after the last drill the student is dropped on the deck page | UX | High | M |
| U2 ✅ | Focus never moves on phase changes; the four slots have no per-slot focus indicator (only the container's brackets) | A11y | Medium | S |
| F1 ✅ | Confidence rating before the check → calibration feedback; the single highest-leverage learning-science addition | Effectiveness | **High** | M |
| F2 ✅ | Two-stage feedback: gap note first, one optional *Revise*, then the exemplar | Effectiveness | High | M |
| F3 ✅ | `focus_topic` exists in the action and schema but has no UI; Weak links lists cards and offers nothing to do about them | Effectiveness | High | S |

Recommended order: R1 → R2 → R7 → R4 → R3 → R5 (one afternoon, all small) · then R6 + P3 together (they touch the same seam) · then P1/P2 · then U1/U2 · then F1–F3 as a "Phase 3". *(Done in that order; P2's write-side parallelism was left alone on purpose — the attempt insert must precede the drill update so a failed insert never advances the ladder — and the daily-ceiling fold into `reserve_ai_call` is a shared-RPC change outside this feature.)*

---

## 1. Reliability and correctness

### R1 — Unguarded action calls inside transitions  ·  **fix first**

`src/components/ui/shared/synthesis/SynthesisDrillClient.tsx:183` (`checkSynthesisAttempt`), `:262` (`archiveSynthesisDrill`), `GenerateSynthesisDrillsButton.tsx:29`, `AddAsCardForm.tsx:48`.

`guardAction` guarantees the action *resolves* when it runs, but a Server Action call still **rejects** on the client when the request itself fails: a platform function timeout (see R2), a dropped connection on mobile, a deploy mid-session. In React 19 an error thrown inside a `startTransition` async function is delivered to the nearest error boundary — here `src/app/dashboard/error.tsx` — which unmounts the canvas. The student's half-typed answer survives in `sessionStorage`, but the check that *did* run server-side (attempt inserted, schedule advanced, cards pulled) is never shown, and "try again" is the natural next step: a second model call.

`FlashcardReviewClient.tsx:351` already does this right (`try { await gradeCard(...) } catch { toast }`). Mirror it: wrap all four calls, route the failure to the existing inline `checkError` / toast, and in the check case reset `phase` to `answering`.

### R2 — Function duration  ·  **fix first**

Worst cases, from the constants in `src/app/actions/synthesis.ts`:

- **Check:** `CHECK_TIMEOUT_MS = 8_000` × `maxAttempts: 2` + backoff + ≈ 8 DB round trips ≈ **17 s**.
- **Generation:** `GENERATION_TIMEOUT_MS = 12_000` × 2 per cluster, five clusters in parallel, + the embedding fallback's sequential queries ≈ **25 s+**.

`src/app/api/chat/route.ts:35` sets `export const maxDuration = 60` for the streaming route; nothing sets it for Server Actions. Next.js applies the `maxDuration` of the **page that invokes** the action, so add `export const maxDuration = 60` to `src/app/dashboard/(focus)/[deckId]/synthesis/page.tsx` (check) and `src/app/dashboard/(shell)/[deckId]/page.tsx` (generate, archive). If the Vercel project is on Fluid compute the default is already 300 s and this is a no-op safety net; if it is not, today's default is 10 s (Hobby) / 15 s (Pro) and every slow check dies with the spend already reserved.

Also worth tightening: a single check attempt should not be allowed to burn 8 s twice. Retry the model call only on `rate_limited` / `unavailable` / `malformed_output`, not on `timeout` (a second 8 s wait after an 8 s timeout is almost never what the student wants); `withGeminiRetry` already classifies, so this is a one-line option if it exposes a retry predicate, or a `maxAttempts: 1` for the check with the client offering the retry.

### R3 — Truncated model output is invisible

`synthesis.ts:191` and `:448` read `result.response.text()` and never look at `candidates[0].finishReason`. If the output hits `maxOutputTokens` the JSON is cut mid-string, `JSON.parse` throws, `withGeminiRetry` classifies it `malformed_output`, retries once at the same cap, fails the same way, and the student sees "AI could not produce a valid drill from this deck" — a message that blames the deck for a budget setting.

Two things compound it:

- The caps are tight: 768 tokens for a drill (format + prompt + 4 links + exemplar can run 450–550 tokens of JSON) and 640 for a check (4 coverage rows with 20-word quotes + 3 contradictions + 3 outside claims + gap note can exceed 600).
- `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite` (`env-server.ts:14`). On thinking-capable Gemini models, thinking tokens are drawn from the same output budget unless `thinkingConfig.thinkingBudget` is set; the legacy `@google/generative-ai` 0.24 SDK has no type for it, but it forwards unknown `generationConfig` fields to the REST body unchanged — the same mechanism `propertyOrdering` already relies on in `schemas.ts`.

Fix: (1) read `finishReason`; on `MAX_TOKENS` throw an `AiServiceError('bad_request')` so it is *not* retried at the same cap, and log `usageMetadata.thoughtsTokenCount` (also available on the legacy response object at runtime); (2) raise the caps to 1,024 / 1,024 — the schema, not the cap, is what keeps the output short; (3) pass `thinkingConfig: { thinkingBudget: 0 }` (cast) for the check, whose temperature is 0.1 and whose task is classification, and a small budget for generation if quality benefits. Record `finish_reason` in `generation_meta` and the attempt's `usage` so §11.3 calibration can see it.

### R4 — Strict maxima reject the whole output

`src/lib/synthesis/schemas.ts:63–85`: `evidence.max(200)`, `statement.max(240)`, `card_says.max(240)`, `ai_assessment.max(300)`, `term_suggestion.max(60)`, `gap_note.max(400)`. A model that writes a 41-word assessment or a 22-word quote fails the whole check — after a successful model call — and the student pays for a retry that has no reason to differ.

Principle: **lenient parse, strict store.** Keep the minimums (they catch empty output), replace each maximum with a `.transform((s) => s.slice(0, N))`, and keep the DB CHECKs (`gap_note ≤ 400`) as the last line. `verdict.ts` already truncates `gapNote` and `aiAssessment` on the way out — the schema is the only place that turns an overrun into a failure.

### R5 — Zombie drills lock generation

Deleting a card is not reflected in `synthesis_drills.card_ids` (no FK, by design — migration §1). `loadSynthesisQueue` drops a drill with fewer than two surviving anchors (`loaders.ts:186`) and reports `activeDrillCount` as the *served* count, but `generateSynthesisDrills` counts **all** active rows (`synthesis.ts:257`). Delete enough cards over a term and the deck reaches "This deck already has 40 active drills. Archive some first." while the canvas shows none of them — the student has no way to archive what they cannot see. A silent, slow failure that presents as "the generate button stopped working".

Fix: when the queue or the generation read finds an orphaned drill, archive it (`status = 'archived'`, `generation_meta.archived_reason = 'anchors_deleted'`) — a filtered update under RLS, no RPC. Additionally exclude orphans from the cap by counting only drills whose `card_ids` all exist (one `cards` read is already in hand in the generation path).

### R6 — Contradictions almost never survive, and the fallback misleads  ·  **highest correctness impact**

`text.ts:71` `verifyQuote` requires the normalised quote to be a substring of the normalised text; `verdict.ts:41` requires **both** the card quote and the student quote to pass. Models quote imperfectly — they drop an article, change tense, merge two clauses. In practice a large share of true contradictions fail one side. Two consequences:

1. `contradicted` becomes rare, so the ladder's contradiction branch and the pull-forward — the feature's one card effect, and its whole "successive relearning" argument (§8.1) — rarely run. The feature is safe but toothless on exactly the errors it exists to catch.
2. The demotion path (`verdict.ts:86–96`) turns the failed contradiction into an outside claim with `verified: false` and `aiAssessment = card_says`. The student then reads: **Unverified · outside deck — "⟨their statement⟩" — ⟨the card's decisive words⟩**. The tag says the deck does not cover it; the "assessment" is the deck covering it. That is the opposite of what happened.

Fix, in two parts:

- **Verification:** keep the strict check for *display* (a quote shown as the student's words must be found verbatim), but accept the contradiction on a **fuzzy** match for *classification*: e.g. ≥ 80 % of the quote's tokens found in order within the text (token-level longest-common-subsequence ratio), or a sliding-window Jaccard ≥ 0.6 over 12-token windows. When the fuzzy match passes but the exact one fails, display the *server-located* span (the window that matched) instead of the model's paraphrase — the guarantee "we only show text we found" still holds. Add the two matchers to `text.ts` with tests on paraphrase, tense change and dropped-article cases.
- **Fallback presentation:** an entry that fails even the fuzzy match is *not* an outside claim. Either drop it, or render it as a third kind — *Possible conflict · check ⟨term⟩* — with the card's words clearly labelled *card says* and no "AI verified/unverified" tag. Never surface `card_says` as `aiAssessment`.

Calibrate before and after with §11.3's planted-contradiction items; the target is that a planted, clearly-worded contradiction is caught ≥ 90 % of the time.

### R7 — Leaving mid-check

`SynthesisDrillClient.tsx:161` `dirty = phase === 'answering' && wordCount > 0`; `:280` `Escape` → `requestQuit` → navigates immediately when not dirty. During `checking` the answer is no longer "unchecked" from the code's point of view, but the diagnostic has not arrived. Esc (or the *Back to deck* button) at second 3 of a 4-second check throws away a paid result and leaves the drill advanced on the ladder without the student ever seeing why. Treat `checking` as dirty (or simply ignore quit while checking and say so beside the *Checking…* reading).

### R8 — No idempotency on checks

A client that retries after an ambiguous failure (R1/R2) causes a second reservation, a second model call, a second attempt row and a double ladder advance. Add `client_attempt_id uuid` to the action input (generated once per `check()` in the client and kept until the result arrives) and a `unique (drill_id, client_attempt_id)` on `synthesis_attempts`; on conflict, return the existing attempt's diagnostic instead of re-running. The reservation should happen *after* the uniqueness check so a replay costs nothing.

### R9 — Smaller correctness items

- **`attempt_count` is read-modify-write** (`synthesis.ts:563`). Two concurrent checks on one drill lose an increment. Low impact; note it, or move the drill update into a tiny `SECURITY INVOKER` RPC that increments in SQL when R8 lands.
- **Structure vs verdict inconsistency.** A `sound` verdict can render *"Boundary slot empty"* beneath it (`DrillResult.tsx:113`). Either let `tradeoffPresent === false` demote `sound` to `partial` (§3.2 chose links-only, but a synthesis without a boundary is the exact "Bloom 4 vs 6" gap the format exists for), or drop the note when the verdict is sound.
- **`claim_present` is model-judged even in outline mode**, where the server knows whether the Claim slot is empty. Compute it structurally for outline answers; ask the model only for free text.
- **Card text goes to the model unsanitised** (`renderClusterCards`, `renderAnchorCards`), while the answer goes through `sanitizeAiInputText`. The instructions call card text untrusted DATA and the server computes the verdict, so the blast radius is small — but a card containing "ignore the answer key" can still shape `gap_note` and `outside_claims`. Run card text through the same sanitiser (it is the student's own text, so `[redacted]` is a non-event).
- **Daily ceiling under-counts generation.** One reservation covers up to five model calls (`synthesis.ts:264`); `DAILY_AI_CALL_CEILING = 300` counts rows, so a batch of five costs one. Either reserve `count` rows or accept and document it — the per-hour limit of 12 batches already bounds it to 60 calls/hour.
- **Language.** Neither prompt says what language to write in. A deck in Spanish yields English drills, gap notes and assessments. Add a one-line rule to both instructions ("Write prompt_text, required_links, exemplar and gap_note in the language of the CARDS") — the model detects it reliably; no new data needed.

---

## 2. Performance

### P1 — The deck overview pays for insights it does not show

`(shell)/[deckId]/page.tsx:435` awaits `loadSynthesisReadings` **serially**, after every other deck read and before any HTML is sent, on every overview render. That loader (`loaders.ts:284`) runs `loadDeckDrills` (up to 120 rows, each with `required_links` and `exemplar` JSONB) and `loadAttemptRows` (up to 300 rows, each with `coverage` and `outside_claims` JSONB) — to produce `DUE 2 · LINKS 12/18 · LAST 3d`. For an active deck that is 50–150 KB of JSON parsed on the server for three numbers, added to the critical path of the most-visited page in the app.

Fix, in order of return:

1. **Denormalise at write time.** `checkSynthesisAttempt` already updates the drill row; add `last_links_covered smallint` and `link_count smallint` (set at insert). Readings then become one narrow select of active drills — `next_due_at, last_links_covered, link_count, last_attempt_at` — and the attempts read disappears from the overview entirely. One migration, ten lines in the action, `deckReadings` simplified.
2. Until then, move the launcher's synthesis block under its own `Suspense` (it is a `.surface` in the right column; the skeleton exists) so it stops blocking first paint, and run the two reads inside `Promise.all` (they are independent).
3. `loadDeckDrills` should not select `exemplar` and `required_links` for readings at all; `DRILL_COLUMNS` is right for the canvas, wrong for a count.

### P2 — Sequential round trips in the actions

**Check** (`synthesis.ts:380–600`), in order: auth → deck → drill → anchors → daily-ceiling count → `reserve_ai_call` → *model* → cards update → attempt insert → drill update → revalidate → log. Eight database round trips bracket the model call; on a remote Postgres that is 250–500 ms of pure latency on a ≈ 3 s interaction.

- Drill and anchors are independent once the deck is known → `Promise.all` (−1 RTT). The anchors read can even be keyed by `deck_id` + `card_ids` without waiting for the drill if the client sends the card ids — but do not; the drill row is the source of truth.
- The attempt insert needs the pull-forward result; the drill update does not → run the drill update in parallel with the attempt insert (−1 RTT). Keep the documented order *cards → attempt* for the record's sake.
- `enforceDailyAiBudget` is a separate count query before the `reserve_ai_call` RPC; fold the daily ceiling into the RPC (it already counts the hourly window) (−1 RTT for every AI action in the app, not just these).

**Generation** (`synthesis.ts:116–186`): the embedding fallback selects one card's `embedding` and calls the neighbour RPC **per seed, sequentially**, up to `needed × 3` seeds — 30 round trips in the worst case, each carrying a 768–3072-float vector as a string. Batch it: one select of `id, embedding` for the shuffled seed slice, then the RPC calls in `Promise.all` with a concurrency cap of 3. And `synthesis.ts:230` selects `explanation` for up to 400 cards to render at most 15; select it only for the chosen cluster ids in a second small query, or cap it in SQL with `left(explanation, 600)` via a view.

**Synthesis page** (`(focus)/[deckId]/synthesis/page.tsx`): auth → deck → drills → cards → attempts, five in series. The deck ownership check and the drills read can run together (RLS already scopes the drills; the deck read only decides `notFound`). −1 RTT on every canvas open.

### P3 — The answer key is in the page payload

`SynthesisDrillClient` receives `drills: SynthesisDrill[]` (with `requiredLinks` and `exemplar`) and `anchorsByDrill` (with `definition` and `explanation`) as props, so the RSC payload of the canvas carries the answer key and the card backs for every served drill before the student writes a word. Three costs: payload (≈ 1–2 KB per drill, minor), integrity (a student can read the exemplar in DevTools — self-defeating rather than a security issue, but the product promise is *retrieval*), and coupling (`DrillResult` reads link text from the drill prop instead of the diagnostic).

Fix: serve the canvas a `DrillForCanvas` projection — `id, format, promptText, cardIds, step, nextDueAt, attemptCount, lastVerdict` — and anchors as `{ id, key, term }` only. Return `requiredLinks` (id + text) alongside `exemplar` from `checkSynthesisAttempt`, and have `DrillResult` render from the result. The definitions the result panel should show (see U4) come back with the check as well. Net: smaller payload, no key in the browser until it has been earned, and the result panel becomes self-contained.

### P4 — Small things

- The hotkey `useEffect` in `SynthesisDrillClient` re-subscribes on every keystroke because `check` depends on `response`. Harmless, but a `useRef` for the latest handler removes the churn.
- `field-sizing: content` (`globals.css` `.drill-editor`) has no Firefox support yet; the `min-h-[22vh]` fallback is fine — note it so nobody files it as a bug.
- The `revalidatePath` after every check invalidates the whole deck page; acceptable, but once P1 lands the launcher block could be a separately-tagged fetch.

---

## 3. UI / UX and accessibility

### U1 — No end of session

`goNext` on the last drill (`SynthesisDrillClient.tsx:223`) pushes to the deck page. A student who just did three drills gets no recap: verdicts, links covered across the launch, which cards were pulled forward, when the next drill is due. The study session has a completion screen for exactly this reason (and Phase 2's capstone hangs off it). Add a `diagnosed`-style final state — one `.surface` with a three-row list (verdict tick · links · prompt), a *Cards pulled forward* line with terms, *Next due* and two actions: *Back to deck* (primary) and *Review pulled cards now* → `/study?scope=...` limited to those ids (a real, cheap "successive relearning" affordance). Keep it in the client: everything it needs is already in memory.

### U2 — Focus and focus indication

- No focus moves on phase change. After the check resolves, focus should land on the verdict heading (`#drill-verdict`, add `tabIndex={-1}`); after *Next drill*, on the prompt or the first slot. Screen-reader users currently hear nothing when the result arrives except the `aria-live` region emptying.
- The four slots render with `focus-visible:outline-0` (`AnswerForm.tsx:27`) and rely on `.raised:focus-within .brk` (`globals.css:1269`) — the **container** shows focus, not the slot. A keyboard user tabbing through Claim → Mechanism 1 → … sees the same brackets throughout. Add `label:focus-within .slot-label { color: var(--ink) }` (and a 1px bottom rule in `--accent` if the design allows) so the active slot is identifiable without hunting for the caret. WCAG 2.4.7 is arguably met by the caret; 2.4.11 is not.
- `Kbd` reads `⌘⏎` on every platform (also `⌘K` elsewhere — cross-cutting). A tiny `usePlatformKey()` returning `⌘`/`Ctrl` would fix all of them at once.

### U3 — The checking and generating waits

- *Checking…* → *Still checking…* at 4 s is good; with R2's retry it can run 16 s with nothing else changing. Show the elapsed check time in the same reading (`Checking · 6 s`) and, past 10 s, a one-line "Taking longer than usual — your answer is saved in this tab."
- Generation is a button label (*Generating…*) for 5–12 s, then a `router.refresh()`. There is no sense of progress and no preview. Cheapest improvement: an optimistic skeleton strip in the launcher (three `glass-skeleton` rows) while pending, and a toast that names what arrived ("3 drills · scheduling, deadlock, memory") using `topic_tag`. Better: generate into a `pending` status and stream them in — but that is a Phase 3 item, not a fix.

### U4 — The result panel could close the loop harder

`DrillResult` shows the checklist, contradictions (with the card's decisive words), the gap note, outside claims, the exemplar and the student's answer. It does **not** show the anchor cards themselves. Feedback is most effective when it carries the correct information (Butler 1988; Hattie & Timperley 2007) — and the definitions are already loaded. Add a third well, *Cards* (term — definition, explanation collapsed), below the exemplar. On a contradiction row, link the term chip to the card (`/dashboard/[deckId]?tab=cards&card=…`): in real decks the **card** is sometimes the thing that is wrong, and the student should be one tap from fixing it rather than being told they are.

### U5 — Smaller UX items

- **Archive has no undo and no confirmation.** A ghost button in the diagnosed state, one tap, gone; there is no archived list anywhere. Add an undo toast (`Drill archived · Undo` → `status = 'active'`), and an *Archived (n)* disclosure in the launcher.
- **Empty canvas** (`SynthesisDrillClient.tsx:315`) says "Generate drills from the deck page" without a link or the button; `GenerateSynthesisDrillsButton` is a client component and can render right there.
- **`Words 152/150` uses `tone="due"`** (`:370`). Hue is the SM-2 state channel (design system §2.2); over-limit is an input error. Use `--state-lapsed` or, better, no hue and the word *over* (`152/150 · over`).
- **Off-target copy** — "so nothing was learned from it" reads as a verdict on the student. "so it was not graded" says the same thing about the system.
- **Previous attempt disclosure** shows verdict, links, age and gap note but not the previous answer. Hiding it during answering is right (retrieval); after the check, offer *Show last answer* inside the result so the student can see what changed.
- **Timer keeps running in a background tab.** `duration_ms` therefore overstates time on task. Pause on `visibilitychange` (the study client has `P`; the canvas needs nothing visible, just the accounting).
- **Insights → nothing to do.** *Weak links* rows are inert text; *Drill history* rows reopen the drill. Give weak links two actions: *Study these* (a study session scoped to the listed card ids) and *Drill this topic* (see F3).
- **Outside claim → Add as card** creates a card with no `topic_tags`, so it never joins a tag cluster. Pass the drill's `topic_tag` (extend `createCardSchema` with optional `topic_tags`), and mark `source: 'synthesis'` so the deck can show where it came from.
- **Capstone offer on mobile**: the completion screen's action row plus the offer plus the stats is a long scroll; consider placing the offer *above* the four stat tiles when present — it is the one thing on that screen with a decision attached.

---

## 4. Learning effectiveness (product)

The design's core is sound and stays sound: answer key at generation time, classification not judgement, server-owned verdict, non-destructive card effect, exam-sprint ladder, no gate. The gaps are around the edges of the loop.

- **No metacognitive signal.** The student never says how sure they are; the system never tells them they were wrong about that. Calibration feedback is one of the most robust findings in the field (judgments of learning; Dunlosky & Rawson 2012) and the confidence × verdict cell is a better scheduling input than the verdict alone. → **F1**.
- **Feedback arrives all at once.** Gap note *and* exemplar land together, so the student reads the model answer instead of repairing their own. A single revise step before the exemplar turns feedback into a second retrieval (Butler & Roediger 2008: feedback followed by re-attempt beats feedback alone). → **F2**.
- **Partial is one bucket.** 3/4 covered with a paraphrase problem and 0/4 with a blank slot both schedule +24 h. Keep the qualitative verdict (§3.2), but let `partial` with **no `missing` link** advance the step (it was a wording gap, not a knowledge gap) and let `partial` with **every link missing** stay due now with a *Try again* like off-target.
- **The queue does not know about the exam.** `[0, 1, 2]` days is right for a sprint, but a deck with an exam date could compress to `[0, 0.5, 1]` in the last three days and expand to `[1, 3, 7]` a month out. → **F6**.
- **Sound needs a boundary.** See R9; a synthesis without a trade-off is the specific Bloom-6 gap this format targets.

---

## 5. High-impact feature proposals

Each is scoped to fit the existing architecture (no new AI calls unless stated, no new RPCs, one migration at most).

### F1 — Confidence before the check  ·  *M*

A three-state control in the actions row, left of *Check*: **Unsure · Fairly sure · Sure** (`1 / 2 / 3` keys, default unset, required before ⌘⏎ — one tap, no friction). Store `confidence smallint` on the attempt (append-only, one column). In the result, one line above the checklist: *You were sure · 2 of 4 links* in `--ink`, or *You were unsure · sound* — no hue, no praise, the mismatch is the message. Schedule input: `sure × partial/contradicted` → 12 h instead of 24 h (overconfidence is the thing to fix first); `unsure × sound` → no change (the student is already calibrated toward caution). Insights gains a `CALIBRATION` reading: share of attempts where confidence matched the verdict, 30 d.

### F2 — Two-stage feedback with one revise  ·  *M*

After a `partial` verdict, show the checklist and the gap note, but keep the exemplar behind *Show exemplar* and offer **Revise** (`R`): the form reopens with the answer intact, the gap note pinned above it, one attempt. The revise is a second `checkSynthesisAttempt` (one more model call, ≈ $0.001) with `revision_of uuid` on the attempt row so history shows the pair. The verdict of the revision **does** update the ladder (the student retrieved again, unaided); the exemplar is shown after it regardless. Rate: one revise per drill per launch. This is the single change most likely to move "links covered on the *next* day", which is the number that matters.

### F3 — Topic-directed generation and the weak-links loop  ·  *S*

`generateSynthesisDrills` already accepts `focus_topic` (`schemas.ts:223`); nothing sends it. The deck page already loads topic-tag counts (`get_deck_topic_tag_counts`). Add a topic `<select>` (or chips for the top 6 tags) to the launcher's generate row — *Generate 3 drills on ⟨scheduling⟩* — and make Weak links' *Drill this topic* call it with the card's most common tag. This turns Insights from a report into a loop: weak card → drill on its topic → link covered or not → weak links updates.

### F4 — Session summary + review pulled cards  ·  *M*  (= U1)

Described in U1. The *Review pulled cards now* action needs the study page to accept `?cards=id,id,id` (a scope the study loader does not have yet — small addition to `normalizeStudyScope`). It is the concrete mechanism for "successive relearning" that §8.1 promises and the current UI only implies.

### F5 — Verdict feedback for calibration  ·  *S–M*

A `👍 / 👎` pair at the bottom of the result (`Was this check fair?`), stored as `synthesis_attempt_feedback (attempt_id, rating, note)` — a separate small table so `synthesis_attempts` stays append-only — plus a one-line `production-assertions.sql` query for the disagreement rate by verdict. §11.3's calibration set is a one-time exercise; this is the ongoing one, and it is the only way to find out whether R6's fuzzy threshold is right in the field.

### F6 — Exam date → cadence  ·  *M*

`decks.exam_at timestamptz null` (one column; the deck header already has a natural place for it). `nextSchedule` takes `daysToExam` and picks the ladder: `≤ 3 d → [0, 0.5, 1]`, `≤ 14 d → [0, 1, 2]` (today's), `> 14 d → [1, 3, 7]`. The launcher shows *Exam in 4 d* beside `DUE`. The dashboard band's drills reading can then say *2 drills due · exam Friday*. Bonus: the study scheduler could use the same column later.

### F7 — Edit and regenerate a drill  ·  *M*

Today a bad drill can only be archived. Two additions: **Regenerate** (same cluster, new call, replaces the row's `prompt_text / required_links / exemplar`, resets the ladder — keeps `attempt_count` history via the attempts table) and an owner-only **Edit prompt** (text only; the key stays). A teacher-shaped deck owner will want the latter; everyone hits the former when a prompt is clumsy. Both reuse `generateDrillForCluster` and `validateDrillDraft`.

### F8 — Voice answers on mobile  ·  *S–M*

Free-text mode + the Web Speech API (`webkitSpeechRecognition`, Chrome/Safari) gives a walk-and-talk retrieval mode at zero server cost: a mic button in the free-text slot, transcript appended live, the 150-word counter unchanged. Progressive enhancement — render the button only when the API exists. Explaining a mechanism aloud is closer to the exam's oral/essay reality than typing, and it removes the thumb-typing tax that the outline slots only partly solve.

### F9 — Drill data on the shared deck  ·  *L, later*

`/s/[token]` shows no drills (J9, by design). A read-only *Try a drill* on a shared deck — served from the owner's drills, checked under the viewer's own reservation, attempts stored against the viewer — is the feature's obvious growth surface. It needs a policy pass (drills are owner-scoped today) and is out of scope for a reliability sprint; noted so the schema does not close the door (it does not).

---

## 6. Security and integrity notes

Nothing here is a vulnerability; the invariants in `COGNIT_HANDOFF.md` §1 hold (RLS own-rows plus deck ownership on every write, attempts append-only, no `SECURITY DEFINER`, reservation before spend, server-computed verdict, quotes verified before display).

- **Answer key in the client** (P3) is an integrity-of-the-exercise issue, not a data-exposure one — it is the student's own data.
- **Prompt injection** is fenced with a nonce and flagged, and the verdict cannot be moved by the model's free text. R9's card-text sanitisation closes the remaining seam.
- **`archiveSynthesisDrill` is not wrapped in `guardAction`** — deliberate (no AI call), but it also means a thrown Supabase client error rejects to the client (R1 applies).
- **Rate limits** (`12/h` generate, `40/h` check) are appropriate; a student in a real sprint does 10–20 checks in an hour. The daily ceiling counts a five-drill batch as one (R9).
- **`reserve_ai_call`'s CHECK constraint** was extended in the migration; if the migration is ever applied *after* a deploy, every synthesis call fails at reservation with a constraint error surfaced as "Unable to check AI usage limits" — the deploy order in §12.2 ("`supabase db push`, then the app") is load-bearing and `scripts/verify-deployment.mjs` probes the tables, not the constraint. Add a probe that inserts-and-rolls-back a `synthesis_check` row, or reads `pg_constraint`.

---

## 7. Suggested sequencing

| Sprint | Items | Outcome |
|---|---|---|
| **Fix week** (≈ 2 days) | R1, R2, R7, R4, R3, R5, R9 (language, sanitiser), U5 (empty state, undo, hue, copy) | No screen-destroying failures; no output-length or truncation failures; no zombie lock; drills in the deck's language |
| **Correctness** (≈ 2–3 days) | R6 (fuzzy verification + fallback presentation), P3 (canvas projection, result carries links + cards), U4 (cards well, card link), R8 (idempotency) | Contradictions actually fire; the result panel closes the loop; retries are free |
| **Performance** (≈ 1–2 days) | P1 (denormalised readings, Suspense), P2 (parallel reads, batched fallback) | Deck overview off the critical path; check −200–400 ms; generation fallback −seconds |
| **Session** (≈ 2 days) | U1/F4 (summary + review pulled cards), U2 (focus), U3 (waits) | A launch has an ending; keyboard and screen-reader users are first-class |
| **Phase 3** (≈ 1 week) | F1 (confidence), F2 (revise), F3 (topic loop), F5 (feedback), F6 (exam date) | The loop gets a metacognitive signal, a second retrieval, a direction and a way to measure itself |

Everything in the first three rows can ship without a migration except the `last_links_covered` column (P1.1) and the idempotency key (R8), which can share one file.
