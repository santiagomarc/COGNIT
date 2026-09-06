# Cognit — Phased Implementation Prompts

Five prompts, one per phase of `COGNIT_PRODUCTION_EXECUTION_PLAN.md`. Run each in its
own conversation, in order.

| # | File | Phase | Est. | Depends on |
|---|---|---|---|---|
| 1 | `PHASE_1_CODE_CLEANLINESS.md` | Dead-code purge | 0.5 d | — |
| 2 | `PHASE_2_CORRECTNESS_SECURITY.md` | Correctness & security | 2 d | Phase 1 |
| 3 | `PHASE_3_AI_PIPELINE_STREAMING.md` | AI pipeline & streaming | 3 d | Phase 2 |
| 4 | `PHASE_4_UX_SHARING.md` | UI/UX & sharing | 3 d | Phase 3 |
| 5 | `PHASE_5_PRODUCTION_HARDENING.md` | Hardening & rollout | 1.5 d | Phase 4 |

## How to use

1. Open a new conversation with your coding agent, rooted at `/Users/marcsantiago/Dev/cognit`.
2. Paste the whole phase file as your first message.
3. When it finishes, **save the completion report it produces.**
4. Start the next conversation by pasting the previous report *above* the next prompt,
   under the heading `## Carry-forward from Phase N`.

Step 3 matters. Each prompt ends by requiring a structured report, and each prompt
begins by looking for the previous one. That handoff is the only state that survives
between conversations.

## Rules that apply to every phase

Repeated inside each prompt so they survive being pasted standalone:

- **The plan is the specification.** `COGNIT_PRODUCTION_EXECUTION_PLAN.md` is in the
  repo root. Read the sections each prompt names before writing code.
- **Do not expand scope.** If you spot a problem outside your phase, record it in the
  report. Do not fix it.
- **Do not claim success without running the command.** Every verification gate must be
  actually executed and its real output pasted into the report.
- **When the plan and the code disagree, stop and report.** The plan was written against
  commit `0f83531`. If a line reference has drifted, find the construct by name, note
  the drift, and continue — but never guess at intent.
- **Never commit.** Leave changes in the working tree unless explicitly asked.

## Sequencing correction (applies to Phase 2)

Plan §3.5 puts `src/lib/embeddings.ts` in Phase 3, but Phase 2 Tasks 2.1 and 2.3 already
call `embedTexts()`. **Phase 2 creates that file**; Phase 3 only consumes it. `toVectorLiteral`
also lives there, not in `src/lib/rag.ts` as §3.4 shows. The Phase 2 and Phase 3 prompts
both carry this correction.
