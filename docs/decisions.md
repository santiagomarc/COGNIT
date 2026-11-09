# Cognit — Decision Log

Design and engineering decisions that still shape the code, with the reason for each. Most were
extracted from planning documents that are now retired. To read the full original context, run
the command in the **Source** line (the documents live at the git tag
`archive/pre-docs-cleanup`; see [README.md](README.md#retired-plans)).

**Adding a decision:** when you make a choice someone could reasonably question later, add an
entry under the right area. Use the next free number, and add the date and your name.

```
### D-<AREA>-<n>: <the decision, in one line>
- **Date:** YYYY-MM-DD · **By:** <name>
- **Decision:** what was chosen (and what was not).
- **Why:** the reason or evidence.
- **Source:** where it was discussed (plan §, PR, meeting).
```

Decisions about the in-progress UI/UX work (OD-1…OD-11) stay in
[plans/uiux-plan.md §10](plans/uiux-plan.md). Decisions about the synthesis feature's core
design stay in [specs/micro-synthesis-spec.md §12](specs/micro-synthesis-spec.md).

---

## Architecture and data (DATA)

### D-DATA-1: All mutations are Server Actions; route handlers only for streaming, cron and fetch APIs
- **Date:** 2026-09-05
- **Decision:** Writes go through `src/app/actions/*`. Route handlers exist only where a Server
  Action can't do the job: SSE chat, streamed PDF generation, search-as-you-type, export, cron.
- **Why:** One authenticated, typed path for writes. The proxy skips `/api/**` so streams stay
  unbuffered (architecture invariant 6).
- **Source:** `COGNIT_PRODUCTION_EXECUTION_PLAN.md` §1, §3

### D-DATA-2: Security lives in the database (RLS, `SECURITY INVOKER`, append-only history)
- **Date:** 2026-09-05 → 2026-09-08
- **Decision:** RLS on every table. Every RPC is `SECURITY INVOKER` with an ownership check.
  History tables are append-only through DENY policies. `production-assertions.sql` checks all
  of this after every push.
- **Why:** A bug in application code can't leak or rewrite another user's data.
- **Source:** `COGNIT_HANDOFF.md` "Architectural invariants"; `COGNIT_PROGRAM_REPORT.md`

### D-DATA-3: Account deletion uses the Supabase Admin API with an optional, production-only service key
- **Date:** 2026-09-30
- **Decision:** One server action deletes the user through the Admin API using
  `SUPABASE_SERVICE_ROLE_KEY`, set in Vercel **Production only**. Without the key, Settings says
  deletion is unavailable.
- **Why:** Assertions forbid `SECURITY DEFINER`, and preview deployments share the production
  database, so they must not hold a key that can delete users.
- **Source:** `COGNIT_SIDEBAR_SETTINGS_PLAN.md` §2 D8

### D-DATA-4: Migrations are expand-only, and the database leads the code
- **Date:** 2026-09-23
- **Decision:** Add, never drop or rename, in the same release. Push the migration, regenerate
  types, verify, then ship the code. Drops wait until nothing references the old object.
- **Why:** Vercel previews and production share one database, so code and schema must work in
  both orders during a deploy.
- **Source:** `COGNIT_NEXT_HORIZON_PLAN.md` §1.2.1 → [runbooks/migrations.md](runbooks/migrations.md)

### D-DATA-5: Soft delete with a 30-day trash
- **Date:** 2026-09-24
- **Decision:** Decks get `deleted_at`. Trashed decks are hidden by policy and become
  purgeable after 30 days, through the per-user `purge_expired_trash()` RPC. A global
  `pg_cron` job is written but commented out in migration `202609240900`. Merging decks trashes the source instead of deleting it.
- **Why:** Undo for the most destructive action in the app.
- **Source:** `COGNIT_NEXT_HORIZON_PLAN.md` §4.1a

### D-DATA-6: Per-account settings in `user_settings`; per-device settings in `localStorage`
- **Date:** 2026-09-30
- **Decision:** Display name and session sizes are stored per account. Theme and sound/haptics
  are stored per browser.
- **Why:** Study defaults should follow the user. Theme and vibration belong to the device.
- **Source:** `COGNIT_SIDEBAR_SETTINGS_PLAN.md` §2 D4

### D-DATA-7: Stay in the Mumbai region
- **Date:** 2026-10-15
- **Decision:** Supabase (`ap-south-1`) and Vercel (`bom1`) stay where they are.
- **Why:** Moving means a new Supabase project and a data migration. Revisit with real-user
  latency data.
- **Source:** `COGNIT_PERFORMANCE_PLAN.md` §10 OD-5

## AI pipeline (AI)

### D-AI-1: Every AI call is retried, guarded and paid for in advance
- **Date:** 2026-09-07
- **Decision:** `withGeminiRetry` wraps every call, `guardAction` wraps every AI action, and
  `reserveAiCall` reserves quota **before** the call.
- **Why:** Unguarded throws became opaque 500s with stuck spinners, and recording usage only on
  success made failures free and unlimited.
- **Source:** `COGNIT_HANDOFF.md` invariants 1 and 7

### D-AI-2: Model settings depend on the model family
- **Date:** 2026-09-21
- **Decision:** `jsonGenerationConfig` detects the family (`3` if the name contains `gemini-3`,
  else `2.5`; `GEMINI_MODEL_FAMILY` overrides). On 3.x the temperature is 1.0 and thinking is
  off unless asked for. On 2.5, the caller's temperature applies and `thinkingBudget` is used.
- **Why:** Measured live: the 3.x models misbehave at low temperatures and reject the 2.5
  thinking parameters.
- **Source:** `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` §0 D1

### D-AI-3: Generation can use its own model; live AI tests never run in `npm test`
- **Date:** 2026-09-21
- **Decision:** `GEMINI_MODEL_GENERATION` and `GEMINI_GENERATION_THINKING` are optional
  overrides. Live tests live in `src/test/live/*.live.ts`, run only with
  `vitest.live.config.ts`, and skip cleanly without a key. Calibration sets are checked-in JSON.
- **Why:** Unit tests must be free and deterministic. Live gates spend free-tier quota.
- **Source:** `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` §0 D2, D9, D10

### D-AI-4: Synthesis grading rules
- **Date:** 2026-09-21
- **Decision:** An answer is `sound` only if no link is `missing` and every core link is
  `covered`. A `covered` link with no located evidence is demoted to `partial`. Answer keys have
  minimum sizes (3-card clusters need ≥ 3 links, with at least one non-mechanism link).
- **Why:** Live measurements showed the model over-credits answers that don't cite evidence.
- **Source:** `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` §0 D3, D4

### D-AI-5: Synthesis feature set (formats, plan mode, question bank, repair drills, exam date)
- **Date:** 2026-09-21
- **Decision:** These were added:
  - formats `evaluate`, `apply`, `distinguish` and `elaborate`
  - Plan mode (essay outline; rate-limited to 6 per hour)
  - a question bank (paste up to 20 questions; each is mapped to cards by vector search)
  - repair drills scheduled after a verified contradiction
  - per-deck `exam_at`, which compresses the review ladder
  - Sprint mode (client-only countdown)

  The concept map, cross-deck drills, voice and sharing were deferred at the time. The concept
  map shipped later, in Next Horizon Phase 1.
- **Why:** Audit II found the feature didn't yet prepare students for essay exams.
- **Source:** `COGNIT_MICRO_SYNTHESIS_EXECUTION_PLAN.md` §0 D11–D20

### D-AI-6: Take AI off the user's path
- **Date:** 2026-10-15 → 2026-10-23
- **Decision:**
  - Quiz distractors come from the deck itself, or from the generation call.
  - Embeddings are computed when cards are made.
  - Lexical search is instant (pg_trgm), and semantic search goes through a cancellable route.
  - PDF generation streams cards section by section.
  - Every AI call's outcome is recorded in `ai_call_outcomes`.
- **Why:** Users were waiting on model calls that could happen earlier, later, or not at all.
- **Source:** `COGNIT_PERFORMANCE_PLAN.md` P0–P5

### D-AI-7: Removed mnemonics, chat follow-up chips, and quiz hints
- **Date:** 2026-10-14 / 2026-10-15
- **Decision:** All three are gone. The quiz offers "Don't know" instead of an AI hint. The
  `ai_hint` column and the `get_hint` CHECK value are kept on purpose (so the migrations stay
  expand-only).
- **Why:** The owner judged them low-value after reviewing real outputs (~1–2% of AI calls were
  hints), and each one cost an extra model call.
- **Source:** `COGNIT_PERFORMANCE_PLAN.md` §10 OD-1, OD-3; commit `6914dbc`

### D-AI-8: Decks under 4 cards get identification questions only; existing AI distractors are kept
- **Date:** 2026-10-15
- **Decision:** Small decks skip multiple choice instead of calling the model for distractors.
  The 342 cards that already had AI distractors keep them, and the background job may still
  write them (`AI_DISTRACTORS = true`).
- **Why:** This keeps the quiz model-free. Existing distractors were already paid for.
- **Source:** `COGNIT_PERFORMANCE_PLAN.md` §10 OD-2, OD-6, OD-7

## UI and design (UI)

### D-UI-1: "Obsidian Telemetry" visual language
- **Date:** 2026-09-09
- **Decision:**
  - Neutral obsidian chassis with zinc rules, where the accent colour is ink. Colour is reserved
    for SM-2 state.
  - Decks render as rows, not tiles.
  - The floating dock is gone (rail/sidebar + ⌘K).
  - Instrument Serif is used for card prompts and display headings ≥ 24 px.
  - Light mode is a first-class theme.
- **Why:** Locked at the design review. The full spec is [design-system.md](design-system.md).
- **Source:** `COGNIT_REDESIGN_EXECUTION_PLAN.md` "Decisions locked by the design review"

### D-UI-2: Sparse screens get panels, and radius/elevation are scales
- **Date:** 2026-09-09
- **Decision:**
  - "Flat" applies to dense surfaces only.
  - Radius and elevation are 5-step and 3-step scales.
  - The study card has no fill and no border, only corner brackets.
  - No orbs, glow, sparkles, indigo, or backdrop blur outside modal scrims.
- **Why:** The first redesign made sparse screens look unfinished. These rules are folded into
  design-system Rev. B.
- **Source:** `COGNIT_UI_CORRECTIONS_PLAN.md` §1.5

### D-UI-3: Sidebar navigation (Rev. E)
- **Date:** 2026-09-30
- **Decision:**
  - The sidebar is 256 px expanded and 48 px collapsed. The stored state is read from a cookie,
    so the server renders it without a reflow.
  - Phones get a drawer, not a bottom bar.
  - Sidebar Search opens the existing ⌘K palette.
  - "Decks" is renamed "Today".
  - Settings is one page with anchored sections.
  - There is no ⌘, shortcut.
  - Explore is shown only with `EXPLORE_ENABLED`.
- **Why:** Search works one way everywhere. Browsers reserve ⌘,. Focus routes own the bottom
  band for grading.
- **Source:** `COGNIT_SIDEBAR_SETTINGS_PLAN.md` §2 D1–D3, D5–D7, D9–D12

## Process (PROC)

### D-PROC-1: Measure, don't estimate
- **Date:** 2026-09-23
- **Decision:**
  - Performance and AI-quality claims need a measurement: a production build, a bundle
    manifest, or a live call.
  - Bundle budgets in `scripts/bundle-budgets.json` only ever go down.
- **Why:** Attributing bundle chunks by string search overstated one saving by about 6×.
- **Source:** `COGNIT_NEXT_HORIZON_PLAN.md` evidence standard; `COGNIT_PERFORMANCE_PLAN.md` P4

### D-PROC-2: Every keyboard shortcut is registered in one table
- **Date:** 2026-09-23
- **Decision:** A new key binding adds a row to `SHORTCUTS` in `src/lib/shortcuts.ts`, in the
  same commit. `shortcuts.test.ts` checks it.
- **Why:** The shortcuts dialog and the command palette read from this one source.
- **Source:** `COGNIT_NEXT_HORIZON_PLAN.md` KBD-01

### D-PROC-3: The team commits directly to `main`
- **Date:** 2026-11-09 · **By:** owner
- **Decision:** No feature branches or PRs. Everyone pulls with rebase before working and
  before pushing, runs the local gates, and never leaves CI red.
- **Why:** Small team, short project. The owner chose simplicity over PR overhead.
- **Source:** team decision when the group joined the project
