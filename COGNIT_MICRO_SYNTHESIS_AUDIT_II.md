# Cognit — Micro-Synthesis Audit II: exam effectiveness, grading, pipeline, product

**Companion to:** `COGNIT_MICRO_SYNTHESIS_SPEC.md` (Rev. B.1, Phases 0–3), `COGNIT_MICRO_SYNTHESIS_AUDIT.md` (Audit I, 2026-09-15), `COGNIT_EXHAUSTIVE_IMPROVEMENT_PLAN.md` (§3 close-out, implemented 2026-09-17) · **Audited:** 2026-09-21 · **Against:** `main` @ `dbe01eb`
**Question asked:** how to make the feature *actually* effective for a student facing essay-based exams and trying to deepen conceptual knowledge — the feature itself, UI/UX, grading, the AI pipeline, and what to build next.
**Status (2026-09-21, same day):** executed through `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` — the P0, the grading and generation findings, the pipeline items, the UI/UX items and the feature additions F1–F5, F7, F8, plus §6.8's live gate and calibration harness. Gate after: `npm test` **407 / 34**, tsc and lint clean, build clean, `npm run ai:gate` and `npm run ai:calibrate` passing live (per-link 99.1 %, run-to-run 98.6 %, contradiction precision 100 %). Three migrations written (`202609210900`, `…0910`, `…0920`), **not applied**. Deferred per the plan's D20: F6 concept map, F10 cross-deck, F11 voice, F12 sharing, the `@google/genai` migration, the read-RPC. Spec §12.2d records the result.
**Method:** the whole feature was re-read at `dbe01eb` (the check now writes through `record_synthesis_attempt`; the absorption loop, rich text and the shared `jsonGenerationConfig` landed since Audit I). Where a claim depends on the model, it was **measured, not assumed**: 27 live calls against `gemini-3.5-flash-lite` with the app's real prompts, schemas and reconciliation code (§2). The vendor documentation for thinking, Gemini 3 and caching was read for the pipeline section. Learning-science claims cite the primary literature. Nothing in the code was changed by this audit.

---

## 0. Executive summary

**One production-breaking finding, verified live.** `jsonGenerationConfig` (`_shared.ts:111`) sends `thinkingConfig: { thinkingBudget: 0 }` on every JSON call. On the default model, `gemini-3.5-flash-lite`, the API answers **400 "Request contains an invalid argument"** — reproduced 4/4 times with the real check prompt (and 4/4 at temperature 1.0); the same request without that field, or with `thinkingLevel`, succeeded 11/11 times, and generation 4/4. Five call sites use the builder (`synthesis.ts:272, :632`, `ai-generate.ts:271`, `ai-enrich.ts:205`, `chat/route.ts:385`): with the default model, **drill generation, drill checks, card generation, enrichment and deck chat all fail** since commit `2605c90` (2026-09-17). `classifyAiError` maps the 400 to `bad_request` → "temporarily unavailable". Gemini 3.x replaced the budget with `thinking_level` (`low | medium | high`, `minimal` on some models, default *minimal* on 3.5-flash-lite); the budget is only meaningful on 2.5. **Fix: make the builder model-family-aware (§6.1) — five lines.** A live-key gate in CI (one call, ¢0.01) would have caught it; it is proposed as §6.8.

**The feature is well-built and narrow.** It does the one thing it set out to do — retrieval of mechanism links between 2–3 cards with grounded feedback — reliably and cheaply (1.5–2 s per check, 870 in / 280 out tokens, well under a tenth of a cent). Measured against what essay exams reward, it covers explanation of mechanism and, partly, evaluation; it does not yet touch **application to a set question, evidence, structure, or time** — the four things students lose most marks on. Deepening conceptual knowledge needs the two generative moves the literature rates highest that the feature lacks: **comparison across cases** (schema induction) and **mapping** the structure of a topic.

**Grading is honest but shallow in two places.** (1) A `covered` status stands even when the model's evidence quote cannot be found in the answer — the one path where a hallucinated pass can reach the ladder (§5.1). (2) Generation returns the **minimum key**: 4/4 live drafts produced exactly two links, one direction only, with near-identical stems — a key against which a shallow answer is "sound" (§5.2). Both are prompt/validator changes, not architecture.

**Top proposals, in order of leverage** (§8): **Essay Plan mode** (a set question → thesis + 3 points, each with mechanism · evidence · limit, checked against a rubric key generated at question time — the exam-day artefact, on the existing architecture); **past-paper ingestion** (questions in, coverage gaps out); **three new formats** (Evaluate, Apply-to-scenario, Distinguish); **evidence as a first-class slot**; **prompt variants per key** to stop exemplar contamination on the second attempt; **Sprint mode** (timed, feedback withheld); **concept map** from the links the deck already has; **misconception-repair drills** from verified contradictions.

| # | Finding / proposal | Area | Impact | Effort |
|---|---|---|---|---|
| P0 | `thinkingBudget: 0` → 400 on the default model; every JSON AI call fails | Pipeline | **Critical** | XS |
| G1 | `covered` without located evidence is still `covered` — demote to `partial` | Grading | High | XS |
| G2 | Keys are minimal (2 links, one direction, templated stems) | Grading | High | S |
| G3 | Gap notes leak link ids (`m3`) and speak in the third person | UX / grading | Medium | XS |
| G4 | Exemplar contamination: the second attempt on a drill is recall of the exemplar | Effectiveness | High | S |
| A1 | Temperature and thinking policy contradict Gemini 3 guidance; measured: no quality gain from thinking, 4× latency | Pipeline | Medium | S |
| A2 | No live-model gate; no calibration harness; no `prompt_version` on attempts | Pipeline | High | S |
| A3 | Generation model = check model; key quality is the ceiling of everything downstream | Pipeline | High | XS |
| F1 | Essay Plan mode | Product | **Highest** | L |
| F2 | Past-paper question ingestion | Product | High | M |
| F3 | Evaluate / Apply / Distinguish / Elaborate formats | Product | High | M |
| F4 | Evidence slot and evidence links | Product | High | M |
| F5 | Sprint (timed, batched feedback) mode | Product | Medium | S |
| F6 | Concept map from required links | Product | Medium | M |
| F7 | Misconception-repair drills | Product | Medium | S |
| U1 | Worked example on the first drill, then faded; live structure meter; term chips that dim when used | UX | Medium | S |

---

## 1. Where the feature stands (2026-09-21)

Since Audit I: the write side of a check is one `SECURITY INVOKER` RPC under a per-drill advisory lock (`202609170980`), so concurrent replays and `attempt_count` are correct; outside claims become provenance-tracked cards that are enriched and embedded after the response (`202609170970`, `absorbOutsideClaim`); prompts, exemplars and cards render through `RichText`; the session-scoped Supabase client removes the auth round-trip; every JSON call goes through `jsonGenerationConfig`. 367 tests, 17 routes. The Phase 3 and later migrations are still to be pushed; the deploy order remains load-bearing (plan §3.1).

What a student experiences today: generate 3 drills → read a prompt naming 2–3 concepts → fill four slots (or free text, ≤ 150 words) → say how sure → check (≈ 2 s) → verdict, per-link checklist with quotes, contradictions with the card's words, gap note, outside claims (add as card), calibration line → revise once or see the exemplar and the cards → next → summary → review pulled cards. Drills come back on a 0 / 1 / 2-day ladder; the capstone offers one after a study session; the dashboard counts drills due.

---

## 2. Live probe — the empirical base

27 calls (8 of them the 400 reproduction, run twice), `gemini-3.5-flash-lite`, the app's real `buildDrillCheckInstruction` / `buildCheckUserTurn` / `DRILL_CHECK_SCHEMA` and `buildDrillGenerationInstruction` / `DRILL_GENERATION_SCHEMA`, a three-card scheduling cluster, and one hand-labelled answer (m1 covered-but-flawed, m2 covered, m3 missing, one deliberate contradiction against the "context switch" card, trade-off slot empty). Probe deleted after the run; nothing committed.

### 2.1 Check

| Config | Runs | Result | Latency | Tokens (in / out / thoughts) |
|---|---|---|---|---|
| **A — production:** T 0.1 + `thinkingBudget: 0` | 4 | **400 Bad Request** ×4 | — | — |
| B — T 1.0 + `thinkingBudget: 0` | 4 | **400 Bad Request** ×4 | — | — |
| E — T 0.1, no thinking config (model default *minimal*) | 3 | m1 covered · covered · partial; m2 covered ×3; m3 missing ×3; contradiction found 3/3, verbatim quote | 1.6–2.1 s | 870 / 286–301 / — |
| C — T 1.0, model default | 5 | m1 covered ×2 · partial ×3; m2 covered ×5; m3 missing ×4, **omitted** ×1 (server fills `missing`); contradiction 5/5 | 1.5–1.7 s | 870 / 257–296 / — |
| D — T 1.0 + `thinkingLevel: 'low'` | 2 | accepted; m1 covered · partial; m3 omitted once | 1.6 s | 870 / 241–277 / — |
| F — T 1.0 + `thinkingLevel: 'high'` | 1 | m1 covered, m2 covered, m3 missing; same contradiction | **7.5 s** | 870 / 183 / **2,260** |

Readings: the borderline link (m1: the mechanism is stated but wrapped in the contradicted claim) flips between `covered` and `partial` at both temperatures — run-to-run agreement ≈ 67 % on that link, 100 % on the clear ones. Lowering temperature does not remove the variance; it is in the item. Thinking at `high` costs 8× the output tokens and 4× the latency for the same answer. `thoughtsTokenCount` **is** surfaced by the legacy SDK at runtime (2,260 above), so the app's `usageOf` capture works. Structure came back `{claim_present: true, tradeoff_present: false}` every time — correct. Every gap note referenced the missing link as "(m3)" and spoke of "the student" (§5.4).

### 2.2 Generation

| Config | Runs | Valid drafts | Links per draft | Latency | Tokens (in / out) |
|---|---|---|---|---|---|
| T 0.6, model default | 2 | 2/2 | **2, 2** | 1.7–1.9 s | 471 / 238–246 |
| T 1.0, model default | 2 | 2/2 | **2, 2** | 1.7–1.9 s | 471 / 257–263 |

All four prompts open "By what mechanism does … Time quantum too small …" — the same stem, the same direction (only *too small*), with the third card ("Interactive process") attached loosely. None asked about the *too large* direction the card states, none reached three links, none included a condition. This is the model doing exactly what the instruction allows (`required_links … 2-4`, "Ask by what mechanism …").

---

## 3. Effectiveness for essay-based exams — gap analysis

What examiners reward is stable across systems (UK assessment objectives AO1–AO3, IB criteria, US analytic rubrics, law problem questions, medicine short-answer): **knowledge** (precise terms, named evidence), **application** to the question actually set, **analysis** (mechanism, causation, chains of "because"), **evaluation** (limits, counter-positions, conditions, a judgement), and **structure under time** (a thesis that answers the question, paragraphs that each make one point with evidence and link back, a conclusion). Marks are lost far more often on application, evidence and evaluation than on knowledge.

| Exam demand | What the feature does today | Gap | Proposal |
|---|---|---|---|
| Precise knowledge, named terms | Cards; prompts name the concepts; chips | Prompts *give* the terms — the exam does not | Cold-prompt variant in Plan mode (topic only); term chips that dim once used (U1) |
| Mechanism / analysis | **Core strength** — required links, evidence quotes | Keys are minimal (§5.2) | G2: ≥ 3 links across all cards, both directions, one condition link |
| Application to a *set* question | Generic prompts ("by what mechanism…") | No question-shaped prompts; no scenario | F3 Apply format; F1 Plan mode; F2 past-paper ingestion |
| Evidence (study, case, data, example) | Not asked for; cards' examples ignored | Whole assessment objective absent | F4 Evidence slot + evidence links from card explanations |
| Evaluation / counter-position / judgement | Trade-off slot; counterfactual format | Not required for `sound`; no counter-argument format | F3 Evaluate format; `sound` requires the boundary when the key has one (§5.3) |
| Structure: thesis → points → conclusion | Four slots (claim · 2 mechanisms · trade-off) | Paragraph-level structure is not exercised | F1 Plan mode with a structure rubric |
| Time pressure | Elapsed clock | No constraint, feedback after every item | F5 Sprint mode |
| Question phrasing ("To what extent…", "Discuss…", "Compare…") | One stem per format | Students never see the stems they will meet | Stem rotation in generation (§5.2); F2 |

The through-line: **the drill is the right unit for the mechanism layer; the exam needs one more layer on top of it — the plan.** F1 builds that layer on the same architecture (key generated at question time, single-pass classification, server verdict), so nothing below changes.

---

## 4. Deepening conceptual knowledge — what the literature says the feature is missing

The feature already stands on the strongest evidence in the field: retrieval practice (Roediger & Karpicke 2006; Dunlosky et al. 2013 rate practice testing and distributed practice highest), spacing (Cepeda et al. 2008), interleaving of formats and clusters (Rohrer & Taylor 2007), feedback with the correct information (Butler & Roediger 2008; Hattie & Timperley 2007), successive relearning of contradicted cards (Rawson & Dunlosky 2011), judgements of learning and the hypercorrection effect — high-confidence errors are the ones corrected best when feedback follows (Butterfield & Metcalfe 2001; Metcalfe 2017), which is exactly what `sure × partial → 12 h` exploits.

Five well-evidenced mechanisms are absent or weak:

1. **Comparison across cases → schema induction** (Gick & Holyoak 1983). Comparing two instances of a principle is how the abstract principle is extracted; a single instance rarely transfers. The comparative format compares *concepts*, not *cases*. → F3 *Compare-cases* variant of Apply.
2. **Mapping** — building the structure of a topic (Nesbit & Adesope 2006 meta-analysis; Fiorella & Mayer 2016 "generative learning"). The deck's `required_links` *are* a map — card → card with a mechanism on the edge — and the coverage history colours every edge. → F6.
3. **Elaborative interrogation and self-explanation** ("why?" chains; Pressley et al. 1987; Chi et al. 1994). The gap note could end with the one question that would make the answer complete; a format could ask for a three-deep *why* chain. → F3 *Elaborate*, G3.
4. **Transfer to a novel scenario** — the essence of "apply" marks. → F3 *Apply*.
5. **Avoiding the exemplar becoming the answer.** After a check, the student has seen a model answer for that exact prompt; the next attempt on the same drill is largely recall of the exemplar (a worked example is excellent for a novice and counter-productive once the student can already produce the answer — the expertise-reversal effect, Kalyuga et al. 2003). Two consequences: the ladder's `sound` at step 1–2 over-states mastery, and "links covered" inflates. → G4 prompt variants.

One thing the feature should *not* do, on the evidence: turn into an essay grader. Retrieval-with-feedback beats concept mapping *when the retrieval is active* (Karpicke & Blunt 2011); a 40-minute essay with a 14-second grade is neither active retrieval nor spaced. The plan (F1) is the highest-value unit above the drill precisely because it stays short, structured and repeatable.

---

## 5. Grading and diagnostic quality

### G1 — `covered` must be earned by evidence  ·  **fix first, five lines**

`verdict.ts:87–88`: a link's status is taken from the model; the evidence quote is located and displayed if found, nulled if not — *the status stands either way*. The model is instructed to quote (`prompts.ts:104`), so a `covered` with no locatable quote means one of two things: a paraphrase the fuzzy matcher (≥ 80 % tokens in order, ±2 window) still could not place, or a hallucinated pass. Audit I kept the status because "coverage drives no card state"; it does drive the **ladder** (`sound` → step + 1 → 2 days away) and the LINKS reading. Rule: `covered` with no located evidence → `partial` (`status: 'partial', evidence: null`); `partial` needs none. With the live matcher this demotes almost nothing legitimate and closes the only path where an unsupported pass advances the schedule. Log the demotion count next to `dropped_contradictions`.

### G2 — The key is the ceiling of everything: make generation produce a real one

Measured: 4/4 drafts at the minimum of two links, one direction, one stem. Changes, all in `prompts.ts` / `validateDrillDraft`:

- **Key first, then question.** Ask for `required_links` before `prompt_text` (`propertyOrdering` already exists) and instruct: "3–4 links for three cards, 2–3 for two; every card must appear in at least one link; where a card states a condition or a boundary, one link must be that condition; where a relation runs both ways (too small / too large), cover both."
- **Validator:** for a three-card cluster require ≥ 3 links and every card cited at least once (reject `too_few_links` / `card_uncited`); require at least one link whose text contains a condition marker ("when", "if", "unless", "only", "as long as", "until") or is flagged `kind: 'condition'` by the model.
- **Link kinds.** `required_links[].kind: 'mechanism' | 'condition' | 'evidence'` and `core: boolean`. The verdict can then require all `core` links for `sound` and treat a missing `evidence` link as *partial*; the result panel can label rows; Insights can report "conditions covered" separately (that is the AO3 number).
- **Stem rotation.** Rotate the opening across exam stems — *Explain why…*, *By what mechanism…*, *Under what conditions…*, *To what extent…*, *Compare … in the case of…* — by passing a `stem` in the instruction from a per-format list, and reject a draft whose opening repeats the previous drill's stem in the same batch.
- **Two exemplars in the instruction**, one good, one rejected with the reason ("only one direction", "restates the definition") — few-shot on the *quality bar*, not the format. Costs ≈ 200 input tokens; generation runs 12×/hour at most.
- **Difficulty tag.** Ask the model for `bloom: 'analyse' | 'evaluate' | 'create'` and store it; the ladder can prefer harder formats at step 2 (§8, F9).

### G3 — Gap notes: address the student, never leak ids

Live: every gap note said "The student misses the optimal tuning link (m3)". Two instruction lines: "Address the student as *you*. Never mention link ids or card keys (m1, c2); name the concept instead." And end with **one question** the student could ask themselves next time ("Ask: what should the quantum be *just above*?") — elaborative interrogation for free, in the sentence the student reads most.

### G4 — Exemplar contamination: prompt variants per key

Generation stores `prompt_variants: string[]` (2–3 rewordings and perspective shifts on the same key: reverse the direction, name a different concept first, cast it as a scenario). The canvas serves variant `attempt_count mod n`; the check key is unchanged; the exemplar is shown after a check but *the next attempt asks a different question*. One extra field in the generation schema, ≈ 80 output tokens, zero extra calls. This is the cheapest large gain in this document: it converts repeated attempts from recall of the model answer into repeated retrieval of the relation.

### G5 — Verdict semantics for the exam

Keep the four qualitative verdicts. Two refinements: (a) `sound` requires the key's `condition` link when it has one (today a "sound" answer can carry *"Boundary slot empty"* — §Audit I R9); (b) for Plan mode use **bands** — `developing · secure · strong` — because that is how essays are marked, and it maps to the same server-side logic (all core points + evidence + evaluation → strong). Never numeric marks by default (§11).

### G6 — Borderline variance: accept it, measure it, do not buy it down with tokens

The borderline link flipped at both temperatures; `thinkingLevel: high` did not change it and cost 4× latency. The right tools are (1) rubric anchors in the instruction — one sentence each defining *covered / partial / missing* with an example, which reduces rater drift more than sampling does; (2) a **calibration harness** that measures agreement on the §11.3 set after every prompt change (§6.8); (3) for Plan mode only, a second sample with `covered` = intersection, `partial` = union, since a plan is higher stakes and checked less often.

### G7 — Misconception kinds

Contradictions carry `kind: 'reversal' | 'overgeneralisation' | 'conflation' | 'wrong_condition'` (model-classified, display-only). Feedback becomes teachable ("you reversed the direction of the effect") and Insights can show which kind a student makes — the single most useful analytic for a tutor.

### G8 — Off-target guard

`off_target` is model-judged and costs a full call. Two cheap client-side pre-checks before spending: fewer than 12 words, or none of the anchor terms present → an inline "This looks short / doesn't name any of the concepts — check anyway?" (one tap to override). No model involvement.

---

## 6. AI pipeline — architecture and efficiency

### 6.1 The P0: model-aware generation config

Facts (vendor docs, verified live): Gemini 2.5 Flash / Flash-Lite accept `thinkingBudget: 0`; 2.5 Pro cannot disable thinking (minimum 128); **Gemini 3.x uses `thinking_level` (`low | medium | high`, `minimal` on some models) — `gemini-3.5-flash-lite` defaults to *minimal*, and sending `thinkingBudget: 0` returns 400**; the two parameters cannot be combined. Gemini 3's guidance is also to keep **temperature at 1.0** — lowering it "may produce looping behaviour or degraded performance" on reasoning tasks (measured here: no harm at 0.1 on this item, but no benefit either).

```ts
// _shared.ts — replace the hard-coded thinkingConfig
type Family = '2.5' | '3';
const family = (model: string): Family => (/gemini-3/.test(model) ? '3' : '2.5');

export function jsonGenerationConfig(input: { responseSchema?: Schema; temperature?: number; maxOutputTokens?: number; thinking?: 'none' | 'low' | 'high' } = {}): GenerationConfig {
  const env = getServerEnv();
  const fam = family(env.GEMINI_MODEL);
  const thinkingConfig =
    input.thinking === 'high' ? (fam === '3' ? { thinkingLevel: 'high' } : { thinkingBudget: 8192 })
    : input.thinking === 'low' ? (fam === '3' ? { thinkingLevel: 'low' } : { thinkingBudget: 1024 })
    : fam === '3' ? undefined /* model default = minimal; never send a budget */ : { thinkingBudget: 0 };
  return {
    temperature: fam === '3' ? 1.0 : (input.temperature ?? 0.1),
    topP: 0.95,
    maxOutputTokens: input.maxOutputTokens ?? env.GEMINI_MODEL_MAX_TOKENS,
    responseMimeType: 'application/json',
    ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
    ...(thinkingConfig ? ({ thinkingConfig } as object) : {}),
  };
}
```

Keep `GEMINI_MODEL_FAMILY` as an env override for models whose name does not say. Add a unit test per family on the produced object, and the live gate (§6.8) so a model rename cannot do this again.

### 6.2 Model routing: generation deserves the better model

Key quality is the ceiling of the check, the ladder, the readings and every proposal in §8; generation runs at most 12×/hour per user and is not latency-critical (it already shows *Generating…*). Checks run 40×/hour and are. Add `GEMINI_MODEL_GENERATION` (default = `GEMINI_MODEL`) and route `generateDrillForCluster` — and later Plan-question generation — through it; a Flash-class model with `thinking: 'low'` for keys, Flash-Lite for checks. Cost at the measured 471 in / 250 out tokens is negligible either way.

### 6.3 Latency budget for a check (measured 1.5–2.1 s model time)

Today: session client (cached) → drill → anchors → replay lookup → revision lookup → `reserve_ai_call` → **model** → `record_synthesis_attempt` → `revalidatePath` → log. Three reads before the reservation can be one `SECURITY INVOKER` read RPC (`load_drill_for_check(p_drill_id, p_client_attempt_id, p_revision_of)` returning the drill, its anchors, the replayed attempt if any and the revision validity) — two round trips saved, ≈ 80–150 ms on a remote Postgres, and the replay path becomes free of the model call *and* of the extra reads. `revalidatePath` after every check invalidates the deck page; once readings are denormalised (they are) it can be replaced by a tag on the launcher block only. Target: p50 ≤ 2.5 s end-to-end at the action.

### 6.4 Pre-generation: never make the student wait for a drill

Generation is user-initiated and synchronous (5–12 s). A per-deck **pool** changes the experience entirely: after any check or study session that leaves the deck with fewer than N (say 3) never-attempted drills, schedule generation with `after()` (the absorption loop already does this); a nightly cron (the `keep-alive` route pattern with `CRON_SECRET`) tops up pools for decks studied in the last 7 days. Off-peak generation can use the **Batch API at half price** — irrelevant at today's spend, relevant if pools are ever generated for every deck. The launcher's "Generate 3" becomes the exception, not the entry.

### 6.5 What *not* to spend on

- **Context caching**: implicit caching needs ≥ 4,096 prompt tokens on 3.x Flash (≥ 2,048 on 2.5); a check is 870. Do not restructure prompts to chase it.
- **Thinking on checks**: measured 8× output tokens and 4× latency for no change on the item. Reserve `thinking: 'low'` for generation and Plan-question keys.
- **A second model call per check by default** (self-consistency): the variance is on borderline links and the honest fix is rubric anchors + measurement. Reserve for Plan mode (§5 G6).
- **Full-essay grading** (§11).

### 6.6 SDK

`@google/generative-ai` 0.24 is the deprecated library; three fields this pipeline relies on are untyped passthroughs (`propertyOrdering`, `thinkingConfig`, `thoughtsTokenCount`) and `thinkingLevel` is a fourth. Plan §4.5's migration to `@google/genai` is the right call and is now *cheaper to do than to keep deferring*: the probe shows the passthroughs work today, but each new model family adds another. Gate it with the live gate (§6.8) and the calibration set.

### 6.7 Prompt versioning and provenance

Add `prompt_version` (a string constant bumped with any prompt/schema change) to `synthesis_attempts.usage` and `synthesis_drills.generation_meta`. Without it, the calibration rate and the feedback table cannot be read across a prompt change, and §5's changes are exactly such a change.

### 6.8 A live gate and a calibration harness

- **Live gate** (`scripts/ai-smoke.mjs`, run in CI when `GEMINI_API_KEY` is present, ¢0.01): one check-shaped call with the production `jsonGenerationConfig` and the real schema; fail on non-200, on `finishReason ≠ STOP`, on a Zod failure. This alone would have caught the P0 on 2026-09-17.
- **Calibration harness** (`scripts/calibrate-synthesis.mjs`): the §11.3 set (30 answers, hand labels) run 3× against the live model through `reconcileDiagnostic` and `computeVerdict`; report per-link agreement, run-to-run agreement, contradiction precision, outside-claim accuracy, p50/p95. Run after every prompt change; store the report next to the prompt version. The set does not exist yet as a file — writing it (Appendix A deck, 30 answers) is a half-day and the single best investment in grading quality this quarter.

### 6.9 Cost and limits (for the record)

Check ≈ 1.15k tokens, generation ≈ 0.7k tokens per drill — each well under a tenth of a cent at Flash-Lite list prices. A student doing 30 checks and 10 drills a day costs on the order of a cent. The 40/h check and 12/h generate limits are right; the daily ceiling (300 rows) is the binding one at ≈ 200 checks/day — fine.

---

## 7. UI / UX

The canvas is disciplined and fast; the findings are about *learning* affordances, not chrome.

- **U1 — Worked example, then fade.** On a student's first drill *in a deck*, show the exemplar **before** answering (a worked example is the fastest way for a novice to learn what "sound" looks like); never again for that deck. One boolean in `localStorage` per deck; the check still records the attempt as normal with `worked_example: true` in `usage` so Insights can exclude it.
- **U2 — Live structure meter and term chips that dim.** While answering: `Claim ✓ · Mechanisms 2/2 · Boundary —` in the label step under the slots, computed from slot emptiness only (no model), and each concept chip dims once its term appears in the answer. Both are free and both train the two exam habits — name the concepts, state the limit — without hinting at content.
- **U3 — Revision diff.** After a revise, show the previous answer with word-level changes highlighted beside the new one; today the previous answer is gone. Small (`diff` of two strings), and it makes the revise visible as *a repair*, which is what the student should be learning to do in the last five minutes of an exam.
- **U4 — Per-drill history.** In the result footer: a row of ticks for the last five attempts on this drill (verdict + links). Progress on *one relation over days* is the motivating signal spaced practice never shows.
- **U5 — Sprint mode entry** (F5) in the launcher: *3 drills · 8 min · feedback at the end*.
- **U6 — Insights**: the concept map (F6) as the panel above Weak links; a per-format row (sound-rate by causal / counterfactual / comparative); calibration and links-covered as 30-day sparklines; misconception kinds (G7).
- **U7 — Copy**: gap notes in the second person (G3); the verdict word *Sound* is right for a drill, but Plan mode should say the band. Keyboard: add `E` (show exemplar) and `C` (jump to cards); platform-aware `⌘/Ctrl` label (cross-cutting, still open).
- **U8 — Mobile**: voice input for free text (Web Speech API, progressive) is the one addition that changes *where* a student can drill; the slots already thumb-type well.
- **U9 — Onboarding line** in the launcher's empty state: one sentence on what a drill is *for* ("argue the link between concepts the way an exam answer does — two minutes, feedback on every link"), and the first-drill worked example (U1) does the rest.

---

## 8. Feature proposals

Each is scoped to the existing architecture: the key is generated once, the check is one classification call, the server computes the verdict, cards are touched only by pull-forward. Effort: S ≤ 1 day, M ≤ 3 days, L ≈ 1–2 weeks.

### F1 — Essay Plan mode  ·  *L*  ·  **the exam-day artefact**

*What the student does:* picks (or pastes, F2) a question — "To what extent does the choice of time quantum determine the responsiveness of an interactive system?" — and in 6–8 minutes writes a **plan**: a one-line thesis that answers the question; three points, each with *claim · mechanism · evidence/example · limitation*; a one-line conclusion. Exactly the first eight minutes of a real essay exam.

*What the system does at question time* (one generation call, better model, `thinking: 'low'`): builds a **rubric key** from 4–8 cards — required points (each a mechanism link with `core`), required evidence items (from card explanations / examples), one required evaluation (a condition, counter-position or limitation), the stems of the question's command word ("to what extent" → a judgement is required) — plus an exemplar plan. Stored in `synthesis_drills` with `kind: 'plan'`, `required_links[].kind ∈ mechanism | evidence | evaluation`, `question_text`, `command_word`.

*At check time:* the same single-pass classification, extended with a structure block — `thesis_answers_question`, `points_link_back`, `conclusion_present`, `judgement_present` — and the server computes a **band**: *developing* (< half the core points), *secure* (all core points), *strong* (all core + evidence + evaluation + thesis answers the question). Feedback: the checklist by point, the examiner-style note ("your thesis describes; the question asks you to judge"), the exemplar plan behind a disclosure, and the cards.

*Why it is the highest-value item:* planning is the strongest single predictor of essay quality under time (Kellogg 1988; Graham & Perin 2007 on pre-writing and strategy instruction), it is short enough to repeat and space, and it exercises exactly the three assessment objectives the drill cannot — application to a set question, evidence, evaluation-with-judgement. It reuses the ladder (plans on a `[1, 3, 7]`-day cadence), the reservation, the RPC, the result panel and Insights.

*Data:* `synthesis_drills.kind`, `question_text`, `command_word`; `required_links[].kind`; `synthesis_attempts.band`; a `plan` response shape in `checkSynthesisAttemptSchema`. Plan-question generation needs its own `AI_RATE_LIMITS` entry (`synthesis_plan_generate: 6/h`).

### F2 — Past-paper question ingestion  ·  *M*

Paste 1–20 past-paper questions (or extract from a PDF with the existing pipeline). For each: embedding search over the deck (the `search_deck_cards_by_embedding` RPC) → the 4–8 most relevant cards → a Plan question (F1) — and a **coverage report**: "this question needs *virtual memory* and *TLB reach*; your deck has neither" — the gap list becomes a to-do that the card generator can fill. Store in `synthesis_questions (deck_id, text, source: 'paper' | 'generated', mapped_card_ids, coverage)`. Students study *to the paper*; this is the feature that makes them open the app the week before the exam.

### F3 — Four formats  ·  *M*

- **Evaluate** — "To what extent / Assess / Discuss": slots *Position · For (mechanism) · Against (mechanism or limit) · Judgement*; key requires one counter-position link and a judgement; `sound` needs the judgement.
- **Apply** — the generator writes a 2–3 sentence **scenario** from the cards (a system, a case, a patient, a market) and asks what happens and why; key = concept → scenario mappings; slots *What happens · Because (concept) · Because (concept) · Unless*. Transfer to a novel case is the "apply" mark and the schema-induction move (§4).
- **Distinguish** — pairs of cards that are embedding-near but distinct (the *conflation* misconception): "Distinguish A from B and say when each applies"; key = the distinguishing feature + one condition each. Cheap to cluster (nearest-neighbour pairs with different tags), and it targets the single most common loss of marks in definitions-heavy exams.
- **Elaborate** — a three-deep *why* chain from one card: "Why does A hold? → why does that hold? → …"; key = three links, each a `mechanism` at increasing depth. Elaborative interrogation, structured.

All four are `FORMAT_RULES` entries, slot label sets (Appendix B), and validator rules; the check is unchanged.

### F4 — Evidence as a first-class slot  ·  *M*

An optional fifth slot *Evidence* (study / case / data / quotation) whose key links are `kind: 'evidence'` drawn from card explanations. Cards without evidence yield keys without evidence links, so nothing is penalised that the deck cannot support. Insights gains *Evidence used*. Where a deck has no evidence at all, the launcher says so — the single most actionable coverage message for an essay student ("your cards have no examples").

### F5 — Sprint mode  ·  *S*

`?mode=sprint&count=3&minutes=8`: a visible countdown, no result until the last drill is checked (results queue client-side; the actions run as today), then the summary shows all three. Trains pacing and tolerance of not knowing how the last answer went — the actual exam condition. One client state flag and a different summary; zero server change.

### F6 — Concept map from the deck's links  ·  *M*

Nodes = cards in any drill; edges = `required_links` (label = mechanism text); edge colour by the latest coverage status (`--state-mastered / --state-due / empty`), contradicted cards outlined in `--state-lapsed`. A force layout in SVG (the analytics hub already has SVG components), tap a node → its drills, tap an edge → the link text and last quote. This is the "mapping" generative activity (Nesbit & Adesope 2006) on data the feature already stores; for a student it is the first time the deck looks like a *subject* instead of a list.

### F7 — Misconception-repair drills  ·  *S*

A verified contradiction creates (with `after()`) a one-card **repair drill** anchored on the contradicted card plus its closest neighbour, format Elaborate or Distinguish, due 24 h after the pulled-forward review — so the sequence is *review the card → re-argue the relation*. `generation_meta.repair_of = attempt_id`. Weak links gains *repair drills done*.

### F8 — Exam-date cadence  ·  *M*  (Audit I F6, unchanged)

`decks.exam_at`; ladders `[0, 0.5, 1]` inside three days, `[0, 1, 2]` inside two weeks, `[1, 3, 7]` beyond; plans on the longer ladder; the dashboard band reads *exam in 4 d*.

### F9 — Progressive difficulty  ·  *S*

`bloom` per drill (G2); at step 2 the queue prefers `evaluate`/`apply` formats for the same cluster and, once a cluster has been `sound` twice, generates its next drill one level up ("now argue the opposite position"). Prevents the ladder from rewarding the same easy relation three times.

### F10 — Cross-deck synthesis  ·  *L, later*

Clusters across the decks of one exam (a *module group*): `card_ids` already carry no FK, but ownership checks, the launcher and Insights are deck-scoped. Needs a `deck_groups` table and a group-scoped canvas; worth it for degree-level exams that draw on several modules.

### F11 — Voice answers  ·  *S–M*  (Audit I F8)

### F12 — Sharing and teacher keys  ·  *L, later*

Teacher-authored questions and keys (F1/F2) shared to a class; peer plans compared side by side. Out of scope for a study-tool sprint; the schema does not block it.

---

## 9. Data-model and architecture changes implied

```sql
-- drills
alter table synthesis_drills add column kind text not null default 'drill' check (kind in ('drill','plan'));
alter table synthesis_drills add column bloom text check (bloom in ('analyse','evaluate','create'));
alter table synthesis_drills add column prompt_variants jsonb not null default '[]'::jsonb;   -- G4
alter table synthesis_drills add column question_text text;                                   -- F1/F2
alter table synthesis_drills add column command_word text;                                    -- F1
-- required_links[].kind ('mechanism'|'condition'|'evidence'|'evaluation') and [].core live in the jsonb; validator enforces

-- attempts
alter table synthesis_attempts add column band text check (band in ('developing','secure','strong'));  -- F1
-- usage jsonb gains prompt_version, demoted_covered, worked_example                                   -- 6.7, G1, U1

-- questions (F2)
create table synthesis_questions (id, deck_id, user_id, text, source, command_word, mapped_card_ids uuid[], missing_concepts text[], drill_id uuid null, created_at);

-- decks
alter table decks add column exam_at timestamptz;                                             -- F8
```

Formats: `synthesis_drills.format` CHECK extended with `evaluate | apply | distinguish | elaborate`; `SynthesisFormat`, `SLOT_LABELS`, `FORMAT_RULES`, `Appendix B`. Actions: `generateSynthesisDrills` gains `kinds`/`formats`; a new `generatePlanQuestions`; `checkSynthesisAttempt` accepts a `plan` response shape. Reservation names: `synthesis_plan_generate`. Everything else — RPC, reconciliation, ladder, readings, Insights — is reused.

---

## 10. Sequencing and what to measure

| Sprint | Items | Measure |
|---|---|---|
| **0 — today** | P0 (§6.1) + live gate (§6.8) | the five AI features work on the default model; CI fails on a 400 |
| **1 — grading integrity** (2–3 d) | G1, G2, G3, G4, G5(a), `prompt_version`, calibration set as a file + harness | per-link agreement ≥ 85 %, contradiction precision ≥ 0.9 on the set; links per key ≥ 3 on three-card clusters |
| **2 — exam realism** (1 wk) | F3 Evaluate + Apply + Distinguish, F4 evidence, F5 sprint, U1–U4, A3 model routing, §6.3 read RPC | sound-rate by format; evidence-used rate; p50 check ≤ 2.5 s |
| **3 — the plan** (1–2 wk) | F1 Plan mode, F2 ingestion, bands, G6 second sample for plans | band progression per question over 7 days; "questions with coverage gaps" count going down |
| **4 — deepening** (1 wk) | F6 map, F7 repair drills, F9 difficulty, F8 exam date, G7 misconception kinds | links covered **next day** (the real retention number: covered on attempt *n+1* after `missing` on *n*); repair-drill sound-rate |
| later | F10, F11, F12, SDK migration (§6.6) | — |

The one metric to put on the Insights page and watch: **next-day link retention** — of links marked `missing` or `partial` on a day, the share `covered` on the drill's next attempt. Everything in this document is in service of that number and of the band on a set question.

---

## 11. What this audit deliberately does not recommend

- **Numeric marks by default.** Spec §3.2's argument stands; bands in Plan mode are the exam-shaped compromise.
- **Grading full essays.** Long, slow, ungrounded, and it displaces the retrieval that works (§4).
- **Exposing model reasoning** ("chain of thought") in feedback. The evidence quotes and the card's words are the explanation; thinking text is neither grounded nor stable.
- **Auto-editing a card from a contradiction.** The card may be wrong; the student decides (the *Review card* link exists).
- **More calls per check by default.** Measured: thinking buys nothing here; sampling twice belongs to Plan mode only.
- **Chasing context caching.** Below the threshold by 4×.

---

## Sources

Vendor: [Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking) · [Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3) · [Context caching](https://ai.google.dev/gemini-api/docs/caching) · [Thinking budget forum thread](https://discuss.ai.google.dev/t/how-to-disable-thinking-using-gemini-2-5-flash-thinkingbudget-0-not-working/80149) · [cline issue: thinkingBudget 0 incompatible with 2.5 Pro](https://github.com/cline/cline/issues/7735). The live-probe numbers in §2 are from this audit's own calls.

Literature: Roediger & Karpicke 2006; Dunlosky, Rawson, Marsh, Nathan & Willingham 2013; Cepeda et al. 2008; Rohrer & Taylor 2007; Butler & Roediger 2008; Hattie & Timperley 2007; Rawson & Dunlosky 2011; Butterfield & Metcalfe 2001; Metcalfe 2017; Gick & Holyoak 1983; Nesbit & Adesope 2006; Fiorella & Mayer 2016; Pressley et al. 1987; Chi, de Leeuw, Chiu & LaVancher 1994; Kalyuga, Ayres, Chandler & Sweller 2003; Karpicke & Blunt 2011; Kellogg 1988; Graham & Perin 2007.
