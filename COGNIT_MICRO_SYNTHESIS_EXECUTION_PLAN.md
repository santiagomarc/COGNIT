# Cognit — Micro-Synthesis Execution Plan (Audit II → code)

**Executes:** `COGNIT_MICRO_SYNTHESIS_AUDIT_II.md` · **Written:** 2026-09-21 · **Against:** `main` @ `dbe01eb` · **Status column** is updated as items land (§9).
**Principle:** every item below is stated as a decision already made, a file to touch, a test that proves it, and a gate. Where a decision could have gone another way it is marked *(assumption)* so it can be overturned in one line. Nothing here changes the invariants in `COGNIT_HANDOFF.md` §1 (RLS own-rows, append-only attempts, reserve-before-spend, server verdict, no `SECURITY DEFINER`).

---

## 0. Decisions (read these first — each is one line to overturn)

| # | Decision | Why | Overturn by |
|---|---|---|---|
| D1 | `jsonGenerationConfig` becomes **model-family-aware**: family = `'3'` if the model name contains `gemini-3`, else `'2.5'`; env `GEMINI_MODEL_FAMILY` overrides. On 3.x: temperature **1.0**, no `thinkingConfig` unless asked (`thinking: 'low' \| 'high'` → `thinkingLevel`); on 2.5: caller temperature (default 0.1), `thinkingBudget` 0 / 1024 / 8192. The text model factory is untouched *(assumption: the text calls work today at 0.4–0.5; the audit measured only JSON)* | Audit II P0, verified live | change the family table in `_shared.ts` |
| D2 | **Generation routes to `GEMINI_MODEL_GENERATION`** (optional env, default = `GEMINI_MODEL`) with `GEMINI_GENERATION_THINKING` (`none \| low \| high`, default `none`). Checks stay on `GEMINI_MODEL` with no thinking | Audit II A3, §6.5 | env only |
| D3 | **Key floor**: 3-card cluster ≥ 3 links, 2-card ≥ 2; every card cited by ≥ 1 link; every link has `kind ∈ mechanism \| condition \| evidence` and `core: boolean`; `condition` links are core by definition; a 3-card key must contain ≥ 1 non-mechanism link *(assumption: every 3-concept relation in a study deck has a statable boundary)* | Audit II G2 | `validateDrillDraft` constants |
| D4 | **Verdict**: `sound` = no link `missing` **and** every `core` link `covered`; non-core links may be `partial`. `covered` with no located evidence → **`partial`** (`demoted_covered` counted). Off-target and contradiction rules unchanged | Audit II G1, G5(a) | `computeVerdict`, `reconcileDiagnostic` |
| D5 | **Stems** rotate per batch from a per-format list (server picks); a draft whose first five words repeat another draft's in the same batch is rejected `duplicate_stem` | Audit II G2 | `EXAM_STEMS` in `prompts.ts` |
| D6 | **Prompt variants**: generation returns 2 rewordings of the same question (`prompt_variants`); the canvas serves variant `attempt_count mod 3`; the check receives `prompt_variant` (0–2) and renders that wording to the model; stored in the attempt's `usage.prompt_variant` | Audit II G4 | `PROMPT_VARIANTS = 0` |
| D7 | **Gap note**: second person, no link/card ids (instruction + a `stripKeyIds` safety net), ends with one self-question | Audit II G3 | prompt text |
| D8 | **`prompt_version`** = `SYNTHESIS_PROMPT_VERSION` constant in `prompts.ts`, written to `generation_meta` and `usage` | Audit II 6.7 | — |
| D9 | **Live tests** live in `src/test/live/*.live.ts`, run by `vitest.live.config.ts` (never by `npm test`), load `.env.local` themselves, skip cleanly without a key. `npm run ai:smoke` (1 call) and `npm run ai:calibrate` (the §11.3 set) | Audit II 6.8 | — |
| D10 | **Calibration set** is a checked-in JSON (`src/test/live/synthesis-calibration.json`): the Appendix A cluster + a second cluster, 30 hand-labelled answers | Audit II 6.8 | edit the JSON |
| D11 | **Formats** added: `evaluate`, `apply`, `distinguish`, `elaborate`. `apply` carries a `scenario` (new column, ≤ 400 chars) rendered above the question. Slot labels per format in Appendix B terms. Existing three formats unchanged | Audit II F3 | `SYNTHESIS_FORMATS` |
| D12 | **Evidence slot**: a fifth optional outline slot `evidence` (≤ 220 chars), rendered as `Evidence:` to the model, shown when the drill's key has an `evidence` link (the canvas learns kinds only, never texts) or in Plan mode | Audit II F4 | `CanvasDrill.linkKinds` |
| D13 | **Sprint mode**: `?mode=sprint&minutes=8` — countdown, results withheld until the end, auto-finish on zero; client-only | Audit II F5 | — |
| D14 | **Worked example**: when a deck has **no attempts at all**, the first served drill carries its exemplar and the canvas shows it *before* answering, once; the attempt records `usage.worked_example = true` *(assumption: "novice on this deck" ⇔ zero attempts)* | Audit II U1 | `loadSynthesisQueue` |
| D15 | **Plan mode** (F1): `synthesis_drills.kind = 'plan'`, `question_text`, `command_word`; key links `kind ∈ mechanism \| evidence \| evaluation` (+ `condition`); response `{ thesis, points[3] { claim, mechanism, evidence, limit }, conclusion }` ≤ 250 words; band `developing \| secure \| strong` computed server-side; ladder `[1, 3, 7]` days; generated from 4–8 cards of one topic; own rate limit `synthesis_plan_generate 6/h` | Audit II F1 | — |
| D16 | **Question bank** (F2): paste up to 20 questions → each embedded, mapped to ≤ 6 cards by the deck's vector RPC, missing concepts named by one small model call per question, stored in `synthesis_questions`; *Plan this* creates the Plan drill from the mapped cards. PDF extraction reuses the existing pipeline later *(not in this pass)* | Audit II F2 | — |
| D17 | **Repair drills** (F7): a verified contradiction schedules (`after()`) one `elaborate` or `distinguish` drill anchored on the contradicted card + its nearest neighbour, `generation_meta.repair_of`, due 24 h after the pull-forward; at most one open repair drill per card | Audit II F7 | — |
| D18 | **Difficulty** (F9): `bloom` per drill from the generator; at step 2 the queue prefers `evaluate`/`apply` for the same cards | Audit II F9 | — |
| D19 | **Exam date** (F8): `decks.exam_at`; ladders `[0, 0.5, 1]` ≤ 3 d, `[0, 1, 2]` ≤ 14 d, `[1, 3, 7]` beyond; set from the deck header | Audit II F8 | — |
| D20 | **Deferred, with reasons**: concept map (F6 — a layout engine is a week on its own; the data is in place), cross-deck (F10), voice (F11), sharing (F12), `@google/genai` migration (6.6 — after the live gate exists), the read-RPC (6.3 — ≤ 150 ms, do after everything above) | scope | — |

---

## 1. Sprint 0 — stop the bleeding (½ day)

| Task | Files | Test | Gate |
|---|---|---|---|
| 0.1 Model-family-aware `jsonGenerationConfig` (D1); `getGeminiJsonModel({ purpose })` routes `generation` to `GEMINI_MODEL_GENERATION` (D2); env schema gains the three optional vars | `_shared.ts`, `env-server.ts` | `_shared.test.ts`: per-family objects; 3.x never carries `thinkingBudget`; `low`/`high` map correctly | tsc · lint · test |
| 0.2 Live smoke (`ai:smoke`): one check-shaped call with the production config; fails on non-200, `finishReason ≠ STOP`, Zod failure | `vitest.live.config.ts`, `src/test/live/smoke.live.ts`, `package.json` | runs green with the local key | `npm run ai:smoke` |

## 2. Sprint 1 — grading integrity (1–2 days)

| Task | Files | Test |
|---|---|---|
| 1.1 G1: `covered` needs located evidence, else `partial` + `demoted_covered` | `verdict.ts`, `synthesis.ts` (usage) | `verdict.test.ts` |
| 1.2 D4 verdict: core/kind aware `computeVerdict`; condition links core | `verdict.ts`, `types.ts` | `verdict.test.ts` |
| 1.3 D3/D5 key floor: generation instruction (key first, both directions, kinds, core, condition, stems, two graded exemplars), schema (`kind`, `core`, `prompt_variants`, `bloom`), validator (floor, cited cards, non-mechanism link, duplicate stem) | `prompts.ts`, `schemas.ts`, `synthesis.ts` | `prompts.test.ts` |
| 1.4 D6 prompt variants end to end: column, `toCanvasDrill` picks the variant, check input `prompt_variant`, `renderPromptForModel` | `202609210900` migration, `loaders.ts`, `schemas.ts` (input), `synthesis.ts`, `SynthesisDrillClient.tsx` | `loaders.test.ts`, `synthesis.test.ts` |
| 1.5 D7 gap note + `stripKeyIds` | `prompts.ts`, `text.ts`, `verdict.ts` | `text.test.ts` |
| 1.6 D8 `prompt_version` | `prompts.ts`, `synthesis.ts` | `synthesis.test.ts` |
| 1.7 D10 calibration set (30 answers, two clusters) + `ai:calibrate` harness reporting §11.3 metrics | `src/test/live/synthesis-calibration.json`, `synthesis-calibration.live.ts` | `npm run ai:calibrate` |
| 1.8 Spec §7.4 / §6.3 / §11.3 updated | spec | — |

## 3. Sprint 2 — exam realism (3–4 days)

| Task | Files |
|---|---|
| 2.1 D11 formats: `SynthesisFormat`, `FORMAT_RULES`, `SLOT_LABELS/PLACEHOLDERS`, generation instruction per format, `scenario` column + render, DB CHECK, launcher format chips (all / pick) | `types.ts`, `ui.ts`, `prompts.ts`, `schemas.ts`, migration, `SynthesisDrillClient.tsx`, `SynthesisLauncher.tsx`, `schemas.ts` (input formats) |
| 2.2 D12 evidence slot: response schema, `renderResponseForModel`, `AnswerForm` fifth slot, `CanvasDrill.linkKinds`, result labels by kind | `schemas.ts`, `text.ts`, `AnswerForm.tsx`, `DrillResult.tsx`, `loaders.ts` |
| 2.3 D13 sprint mode | `SynthesisDrillClient.tsx`, `synthesis/page.tsx`, `SynthesisLauncher.tsx` |
| 2.4 D14 worked example | `loaders.ts`, `synthesis/page.tsx`, `SynthesisDrillClient.tsx` |
| 2.5 U2 structure meter + dimming chips; U3 revision diff (`wordDiff` in `text.ts`); U4 per-drill history (≤ 5) | `AnswerForm.tsx`, `text.ts`, `loaders.ts`, `DrillResult.tsx` |
| 2.6 D18 bloom + queue preference at step 2 | `schedule.ts`, `loaders.ts` |

## 4. Sprint 3 — the plan (1–2 weeks)

| Task | Files |
|---|---|
| 3.1 D15 schema: `kind`, `question_text`, `command_word`, `band`, word-count CHECK to 400, format CHECK, `synthesis_questions` | migration `202609210910` |
| 3.2 Plan generation: topic clusters of 4–8 cards, instruction + schema (question, command word, 4–8 links with kinds, exemplar plan), validator, action `generatePlanQuestions`, rate limit | `clusters.ts`, `prompts.ts`, `schemas.ts`, `synthesis.ts`, `_shared.ts` |
| 3.3 Plan check: `mode: 'plan'` response shape, render, check instruction block (thesis answers the question / judgement), band computation, ladder by kind, RPC untouched (band travels in `p_attempt`) | `schemas.ts`, `text.ts`, `prompts.ts`, `verdict.ts` (`computeBand`), `schedule.ts`, `synthesis.ts` |
| 3.4 Plan UI: `PlanForm`, `PlanResult` (band, checklist by kind, structure notes, exemplar plan), launcher block, queue `?kind=plan` | `synthesis/*`, `SynthesisLauncher.tsx`, `synthesis/page.tsx` |
| 3.5 D16 question bank: table, `ingestQuestions`, `QuestionBank` panel (paste, coverage, *Plan this*) | migration, `synthesis.ts`, `SynthesisInsights.tsx` or a new panel, deck page |
| 3.6 G6 for plans: second sample, `covered` = intersection | `synthesis.ts` |

## 5. Sprint 4 — deepening (1 week)

| Task | Files |
|---|---|
| 4.1 D17 repair drills | `synthesis.ts` (`after()` in the check), `loaders.ts` (open repair per card) |
| 4.2 G7 misconception kinds (`contradictions[].kind`) | `schemas.ts`, `verdict.ts`, `DrillResult.tsx`, Insights |
| 4.3 D19 exam date + ladders | migration (`decks.exam_at`), `schedule.ts`, deck header control, launcher reading |
| 4.4 Insights: per-format sound-rate, calibration/links sparklines, misconception kinds | `insights.ts`, `SynthesisInsights.tsx` |

## 6. Gates

Every sprint ends green on `npx tsc --noEmit` · `npm run lint` · `npm test` · `npm run build`, plus `npm run ai:smoke` from Sprint 0 on, and `npm run ai:calibrate` after any prompt change from Sprint 1 on (targets: per-link agreement ≥ 85 %, run-to-run ≥ 90 %, contradiction precision ≥ 0.9, zero contradictions on the outside-knowledge answers). Migrations are written, never pushed, by this plan; each is additive with defaults; the deploy order stays *db push, then app*.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The key floor over-rejects on thin decks (two-sentence cards) | reject reasons are logged per draft; the batch reports `failed`; floor constants are one place |
| Temperature 1.0 on 3.x raises borderline variance | measured: no worse than 0.1 on the probe; calibration harness watches it |
| Plan mode is large; a half-built plan mode is worse than none | it lands behind `kind`; nothing serves plans until the launcher block exists; each sub-task keeps the gate green |
| Question ingestion needs embeddings the deck may not have | coverage falls back to tag/term overlap; the UI says "sync embeddings for better matches" |
| Repair drills could multiply | one open repair per card, `MAX_ACTIVE_DRILLS_PER_DECK` still applies |

## 8. Out of scope in this plan

Concept map, cross-deck, voice, sharing, SDK migration, the read RPC — see D20.

---

## 9. Status

Updated as items land. Format: ✅ done · ⏳ in progress · ⏸ not started.

| Item | Status | Notes |
|---|---|---|
| 0.1 | ✅ | `modelFamily`, `resolveModelName`, `jsonGenerationConfig({ thinking, model })`; env `GEMINI_MODEL_FAMILY`, `GEMINI_MODEL_GENERATION`, `GEMINI_GENERATION_THINKING`; 4 tests |
| 0.2 | ✅ | `npm run ai:smoke` — passes on gemini-3.5-flash-lite (1.9 s) |
| 1.1 | ✅ | `demotedCovered`; `covered` without located evidence → `partial` |
| 1.2 | ✅ | `computeVerdict(d, links)`: no `missing`, every core `covered`; condition links core |
| 1.3 | ✅ | key-first instruction, `EXAM_STEMS`, kinds/core, two graded exemplars, floor + `duplicate_stem` |
| 1.4 | ✅ | `prompt_variants` column, `toCanvasDrill` rotation, `prompt_variant` on the check |
| 1.5 | ✅ | second person, no ids, closing question; `stripKeyIds` |
| 1.6 | ✅ | `SYNTHESIS_PROMPT_VERSION` in `generation_meta` and `usage` |
| 1.7 | ✅ | `synthesis-calibration.json` (30 answers) + `npm run ai:calibrate` — **passes**: per-link 98.6 %, run-to-run 97.2 %, precision 100 %, recall 100 %, 0 contradictions on outside knowledge, verified 27/27, injection 6/6, p50 1.7 s. Two planted "outside" falsehoods were in fact contradicted by the cards and were replaced; one defensible extra catch is marked `allowedContradictions` |
| 1.8 | ✅ | spec §12.2d, §7.4; Audit II status line |
| 2.1 | ✅ | four formats, `scenario`, labels, mix select in the launcher (`FORMAT_MIXES`) |
| 2.2 | ✅ | `evidence` slot, `linkKinds` on the canvas drill, rendered to the model and in the result |
| 2.3 | ✅ | `?mode=sprint&minutes=`; countdown; results withheld and replayed in the summary; unreached drills count as skipped |
| 2.4 | ✅ | worked example when the deck has no attempts; `usage.worked_example` |
| 2.5 | ✅ | structure meter + dimming chips; `wordDiff` revision view; "Before this" history row |
| 2.6 | ✅ | `bloom`; queue prefers a harder drill on cards whose drill reached step 2 |
| 3.1 | ✅ | `202609210910`: `kind`, `question_text`, `command_word`, wider CHECKs, `band`, `mode 'plan'`, `record_synthesis_attempt` writes `band`, `synthesis_questions` |
| 3.2 | ✅ | `selectPlanCluster`, `buildPlanGenerationInstruction`, `validatePlanDraft`, `PLAN_GENERATION_SCHEMA`, `generatePlanQuestions` (reservation reuses `synthesis_generate` — no allow-list change; D15's own limit not needed) |
| 3.3 | ✅ | `PlanResponse`, `renderResponseForModel('plan')`, plan-aware check instruction and turn, `computeBand` (developing / secure / strong with a real middle), `PLAN_LADDER_DAYS`, `usage.samples` |
| 3.4 | ✅ | `PlanForm`, plan branches in `DrillResult`, plan mode in the canvas (`?kind=plan`), `PlanLauncherRow` with `PLANS · DUE`, `GeneratePlanQuestionButton` |
| 3.5 | ✅ | `ingestQuestions` (embedding → `search_deck_cards_by_embedding`, floor 0.45), `deleteQuestion`, `loadQuestionBank`, `QuestionBank` panel on the overview, *Make a plan* / *Plan it* per question, `missing_concepts` from the generator |
| 3.6 | ✅ | plans check twice, `mergeReconciled` (covered only when both agree) |
| 4.1 | ✅ | `generateRepairDrill` after a verified contradiction (`after()`), `distinguish` when embedding-near else `elaborate`, one open repair per card, due 48 h |
| 4.2 | ✅ | `contradictions[].kind`, `MISCONCEPTION_LABEL`, stored and replayed, shown on the result and in *Drill signals* |
| 4.3 | ✅ | `202609210920` `decks.exam_at`; `ladderFor` / `daysToExam`; `setExamDate`; `ExamDateControl` in the launcher |
| 4.4 | ✅ | `formatSoundRates`, `misconceptionCounts`, `dailyLinkSeries`; `DrillSignals` panel (sparkline, by-format, mistakes) |
| Live | ✅ | `npm run ai:gate` (smoke + generation), `npm run ai:calibrate` — all passing on `gemini-3.5-flash-lite` at prompt `2026-09-21.2` |
