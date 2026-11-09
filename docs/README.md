# Cognit docs

Start with **architecture**, then **decisions**, then whichever spec covers the area you're
working in. Add to **progress-log** and **decisions** as you work.

| Doc | What it is | Read it when |
|---|---|---|
| [architecture.md](architecture.md) | Stack, topology, folder map, data model, **invariants**, quality gates | First, before touching code |
| [decisions.md](decisions.md) | Decision log: what was chosen and why | Before changing how something works; append your own |
| [progress-log.md](progress-log.md) | Current status, open items, and the project timeline | To see what's next; append after each feature |
| [design-system.md](design-system.md) | The visual language: tokens, components, motion, accessibility contract | Before any UI change |
| [specs/micro-synthesis-spec.md](specs/micro-synthesis-spec.md) | Technical spec of the synthesis drills feature | Working on drills/plan mode. A live test also reads it as fixture text |
| [plans/uiux-plan.md](plans/uiux-plan.md) | The **in-progress** UI/UX plan. "Where to continue" is the queue | Picking the next UI task |
| [runbooks/migrations.md](runbooks/migrations.md) | How to add a database migration safely | Before writing any SQL |
| [runbooks/auth-es256.md](runbooks/auth-es256.md) | Pending Supabase auth key migration (owner) | — |
| [project-proposal.md](project-proposal.md) | The original project concept (v0.2 alpha) | Writing the report's introduction/requirements |
| [history/2026-09-program-report.md](history/2026-09-program-report.md) | Record of the September 2026 production-hardening program | Background for the report |
| [assets/mockups/](assets/mockups/) | Approved redesign mockups (PNG) | Report figures |

## Retired plans

These planning documents were finished and removed from the tree on 2026-11-09. Their lasting
decisions are in [decisions.md](decisions.md), and their invariants are in
[architecture.md](architecture.md). Code comments and migrations still cite them by name and
section, for example `(COGNIT_PERFORMANCE_PLAN.md §7.3)`. To read one:

```
git show archive/pre-docs-cleanup:COGNIT_PERFORMANCE_PLAN.md
```

| File | What it was |
|---|---|
| `COGNIT_PRODUCTION_EXECUTION_PLAN.md` | 2026-09-05 audit and five-phase production hardening plan (UAT script in §5.2) |
| `COGNIT_HANDOFF.md` | 2026-09-08 handoff after that program: invariants and next steps |
| `COGNIT_NEXT_SESSION_PROMPT.md` / `COGNIT_HANDOFF_PROMPT.md` | Session-opening prompts for AI coding sessions (2026-09-08, 2026-11-03) |
| `COGNIT_REDESIGN_EXECUTION_PLAN.md` + `implementation-prompts/` | 2026-09-09 "Obsidian Telemetry" redesign, run in six prompts |
| `COGNIT_UI_CORRECTIONS_PLAN.md` | Corrections after the redesign (design system Rev. B) |
| `COGNIT_ESSAY_ENGINE_SPEC.md` | Rev. A essay engine spec, superseded by the micro-synthesis spec |
| `COGNIT_MICRO_SYNTHESIS_AUDIT.md` / `_AUDIT_II.md` | Feature audits of synthesis drills (2026-09-15, 2026-09-21) |
| `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` | Execution of Audit II (decisions D1–D20) |
| `COGNIT_EXHAUSTIVE_IMPROVEMENT_PLAN.md` | 2026-09-16 whole-app audit |
| `COGNIT_NEXT_HORIZON_PLAN.md` | 2026-09-23 audit and Phases 0–3 (trash, export, concept map, SDK migration, CSP) |
| `COGNIT_SIDEBAR_SETTINGS_PLAN.md` | 2026-09-30 sidebar, account menu and Settings |
| `COGNIT_PERFORMANCE_PLAN.md` | 2026-10 performance plan P0–P5 (AI off the user's path) |
| `COGNIT_UIUX_PLAN_PROMPT.md` | Prompt that produced the UI/UX plan |
