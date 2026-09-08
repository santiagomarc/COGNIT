# Cognit — Engineering Handoff

**Written:** 2026-09-08 · **Commit:** `b7a41a7` · **Branch:** `main` · **Tree:** clean
**Purpose:** single self-contained document for picking this project up in a fresh
conversation with no prior context.

---

## 0. Read this first

Cognit is an AI-powered spaced-repetition study app: upload a PDF → AI writes
flashcards → study with SM-2 → quiz yourself → chat with your own deck.

A five-phase production hardening program was executed against
`COGNIT_PRODUCTION_EXECUTION_PLAN.md`. **All five phases are complete and committed.**

**Verified state right now** (every command below was actually run at handoff time):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS |
| `npm run lint` | ✅ PASS |
| `npm test` | ✅ **187 passed / 20 files** |
| `npm run build` | ✅ **15 routes** |
| `npm run verify:deployment` | ✅ 10/10 RPCs live and guarded |
| Migrations | ✅ **31 applied, in sync with remote** |

**The single most important thing to know:** the code is verified, but **the
authenticated application has never been exercised end to end by a human or an agent.**
Everything below flows from that.

---

## 1. Stack and shape

- **Next.js 16** App Router, Turbopack, React Compiler · **React 19** · TypeScript strict
- **Tailwind v4** · **Framer Motion 12** (via `LazyMotion` + `domMax`)
- **Supabase** — Postgres, RLS, pgvector · **Gemini 2.5 Flash** + `text-embedding-004`
- **Zod 4** · **Vitest 4**

```
src/
  app/
    actions/        Server Actions — deck, card, study, quiz, share,
                    ai-generate, ai-enrich, ai-assist, chat, _shared
    api/chat/       SSE streaming deck chat (the only significant route handler)
    s/[token]/      Public shared-deck preview (works logged out)
    dashboard/      Dashboard, deck detail, study, quiz
  lib/              ai-retry, action-guard, embeddings, rag, pdf-chunking,
                    card-generation, distractors, starter-decks, feedback-effects,
                    logger, env-server, env-public, sm2, fuzzy, study
  components/       MotionProvider, ui/shared/* (FlipCard, MCQMode, DeckChatWidget…)
supabase/
  migrations/       31 files, applied in filename order
  verify/           production-assertions.sql
scripts/            verify-deployment.mjs, calibrate-threshold.mjs
```

### Architectural invariants — do not break these

1. **Every AI call goes through `withGeminiRetry`** (`src/lib/ai-retry.ts`) and **every
   AI Server Action through `guardAction`** (`src/lib/action-guard.ts`). A rejected
   Server Action surfaces as an opaque 500 and leaves client loading state stuck forever.
   That bug shipped once already.
2. **`'use server'` files may only export async functions.** Pure helpers live in
   `src/lib/*`. This broke the build twice during the program.
3. **Every RPC is `SECURITY INVOKER`** with a pinned `search_path` and an explicit
   ownership check. There are currently **zero** `SECURITY DEFINER` functions, and the
   assertion suite enforces that.
4. **History tables are append-only** at the database layer (`study_logs`,
   `quiz_results`, `quiz_card_results`, `ai_usage_logs`) via DENY policies.
5. **`logQuizResult` re-grades every answer server-side** from `cards.front`. The client's
   verdict is never trusted. 11 tests pin this — do not "optimise" it away.
6. **`src/proxy.ts` excludes `/api/**`.** That is what lets SSE stream unbuffered, and it
   means route handlers must authenticate themselves.
7. **AI spend is reserved BEFORE the call**, not after (`reserveAiCall`). Recording only
   on success made every failed call free and unlimited.

---

## 2. What to do next — prioritised

### P0 — Before showing this to anyone (½ day, mostly manual)

**P0.1 — Repair the local dependency tree.**
`npm install` fails with `Cannot read properties of null (reading 'edgesOut')`. Extraneous
`@emnapi/*` packages have desynced `node_modules` from the lockfile. Pre-existing; not
introduced by the program. `npm ci` is unaffected, so CI is fine.
```bash
rm -rf node_modules && npm ci
npm install --save-dev @vitest/coverage-v8   # unblocks npm run test:coverage
```

**P0.2 — Run the UAT. This is the biggest open risk.**
`COGNIT_PRODUCTION_EXECUTION_PLAN.md` §5.2 has an 8-section script (A–H, ~70 numbered
steps). **None of it has been run.** Prioritise:
- **Section G (cross-user isolation)** — two accounts. A bug here is a real incident.
- **Section F (sharing)** — especially F3: confirm a share-link visitor sees **no** study
  history, quiz scores, mastery %, or chat.
- **Section E (streaming chat)** — E2 (opening a deck fires *no* embedding traffic) and
  E8 (retry after a failure leaves the composer usable).

**P0.3 — Run the SQL assertions.**
Paste `supabase/verify/production-assertions.sql` into the Supabase SQL editor. Queries
1–3 must return **zero rows**. Query 5 must show exactly two `%shared%` policies, each
requiring `is_public = true AND share_token IS NOT NULL`.

**P0.4 — Calibrate the retrieval threshold.**
`MIN_CONTEXT_SIMILARITY = 0.62` in `src/lib/rag.ts` is an **estimate, not a measurement**.
Too high silently refuses good questions; too low reintroduces hallucination.
```bash
node scripts/calibrate-threshold.mjs --deck <uuid> \
  --relevant "a question your deck covers" \
  --irrelevant "a question it does not"
```
If the two distributions overlap, the problem is `taskType`, not the number.

**P0.5 — Regenerate the database types.**
`src/lib/database.types.ts` was hand-edited to add the sharing columns. Migrations are
applied now, so:
```bash
supabase gen types typescript --linked > src/lib/database.types.ts
npx tsc --noEmit
```

### P1 — Soon after launch (1–2 weeks)

**P1.1 — Delete the migration fallbacks.** Nine files carry `@deprecated` TypeScript
fallbacks for un-applied migrations. All 31 migrations are applied and in sync, so these
are dead weight roughly doubling the branching in the data layer. `grep -rl "@deprecated" src/`

**P1.2 — Verify the study flip on real Safari.** `FlipCard` nests
`transform-style: preserve-3d` inside a dragged, rotating parent — a known Safari trouble
spot. Confirm both the flip *and* swipe-to-grade still work.

**P1.3 — `DockNav` links to two routes that don't exist** (`/dashboard/stats`,
`/dashboard/profile`), rendered as permanently-disabled buttons. Build or remove.

**P1.4 — Add undo for destructive actions.** `bulkDeleteCards` removes up to 200 cards
behind one confirm dialog with no recovery path.

**P1.5 — Onboarding checklist.** The current panel vanishes after the first deck. A
persistent "3 of 5 done" card converts substantially better.

**P1.6 — Tighten the CSP.** `'unsafe-eval'` is now dev-only, but `'unsafe-inline'` on
`script-src` remains, needed by the inline theme script in `layout.tsx` and Next's
bootstrap. Nonces would close it.

**P1.7 — Rate-limit auth endpoints.** Supabase provides some protection, but signup and
password-reset have no application-level throttle.

### P2 — Scaling, in dependency order (1–3 months)

**Cost bites before scale does.** Plan §3.11 puts the worst case at ~$2.24/user/hour
against a 300-call daily ceiling.

1. **Cache embeddings by content hash.** Cloned decks currently re-embed identical cards
   per user — and cloning is the growth loop that just shipped. Cheapest large win.
2. **Move enrichment to a queue.** It runs inline in a Server Action; a 200-card import
   blocks a request for tens of seconds.
3. **Per-user cost telemetry.** `ai_usage_logs` holds the rows; nothing aggregates them.
   Without this you learn about a runaway user from the bill.
4. **`getQuizHistory` still fetches up to 20,000 `quiz_card_results` rows** (finding P-9,
   never fixed — it was LOW). It will bite a heavy user first.
5. **pgvector HNSW is fine to ~100k vectors/user.** Past that, partition `cards` by
   `deck_id` or move vectors to a dedicated store.
6. **Public deck directory.** Sharing primitives exist; a browsable index is a small step
   and the natural acquisition channel.
7. **Collaborative decks** need a real `deck_members` table and a rethink of the
   ownership model, which is single-owner throughout. **Do not bolt this on.**

### Explicitly NOT recommended yet

- **Native mobile** — the PWA path is far cheaper until retention justifies it.
- **Multi-provider AI** — `withGeminiRetry` makes this easy later; doing it now doubles
  the prompt-tuning surface for no user-visible gain.
- **Raising AI rate limits** — they are the only thing between you and an unbounded bill.
  Raise them when telemetry shows real users hitting them.

---

## 3. Final findings

### 3.1 The pattern that matters

The original audit predicted 41 findings. Eight more surfaced only during implementation,
and **the dangerous ones all failed silently.** Not one was a crash.

| # | Finding | Why it mattered | Status |
|---|---|---|---|
| 1 | `recordAiUsage` wrote nothing — RLS `FOR UPDATE USING(false)` made the UPDATE match zero rows, which PostgREST reports as **success** | Cost audit trail silently empty | ✅ Fixed |
| 2 | `get_due_cards_by_deck` "fixed" to `coalesce(auth.uid(), p_user_id)` | **Inverted** the security finding it was meant to close | ✅ Fixed |
| 3 | `guardAction` stringified Zod errors | Users saw `{"message":["Message is too short"]}` in toasts | ✅ Fixed |
| 4 | `isEnumerationLike` counted repeated ordinals | Silently rejected **every queue/FIFO card in any CS deck** | ✅ Fixed |
| 5 | `domAnimation` excludes `drag`/`layout`/`layoutId` | Would have silently killed swipe-to-grade, deck grid, dock pill | ✅ Fixed (`domMax`) |
| 6 | `'use server'` cannot export non-async functions | Broke the build; forced three helper modules out — which made them testable | ✅ Fixed |
| 7 | `focus_unproven` capped by a small fetch pool | UI promised "all N unproven cards", delivered ~20 | ✅ Fixed |
| 8 | Pagination broke deck-wide counts | Fully-enriched 200-card deck read "60/200 quiz-ready" forever | ✅ Fixed |

**Findings 1, 2 and 5 are the instructive ones.** Two were introduced by a *fix* for an
earlier finding, and one came from my own plan being wrong. When reviewing work on this
codebase, "the tests pass and the build is green" is not sufficient evidence that a
database write or an animation actually happened.

### 3.2 What is genuinely production-ready

- Data layer — RLS, `SECURITY INVOKER` RPCs, append-only history, verified live
- AI fault tolerance — retry/backoff with full jitter, typed failure classification
- Spend control — atomic reservation via `pg_advisory_xact_lock`, reserved before the call
- SM-2 scheduling — pure, tested, unchanged
- Anti-cheat — server-side re-grading, now with 11 tests pinning it

### 3.3 Ready, with a known limitation

- **Streaming chat** — route verified live (401 unauthenticated), SSE frame buffering
  tested including one-character-at-a-time delivery. Never seen end to end against Gemini.
- **Sharing** — RPCs live and correctly guarded; anon sees 0 decks. Flow unexercised.
- **PDF chunking** — 11 unit tests. Never run against a real 100-page document.
- **60 starter cards** — asserted against the app's own quality rules. Never seen rendered.

### 3.4 Known gaps

- **No end-to-end verification of any authenticated route.** The largest gap by far.
- **`npm install` broken locally** (P0.1). CI unaffected.
- **Coverage unmeasurable** until P0.1 is resolved. `vitest.config.ts` is configured;
  the provider is deliberately not in `package.json` because a dependency without a
  matching lockfile entry would break `npm ci`.
- **Threshold uncalibrated** (P0.4).
- **`database.types.ts` hand-edited** (P0.5).

---

## 4. Useful commands

```bash
npm run dev                 # dev server
npm test                    # 187 tests
npm run build               # 15 routes
npm run verify:deployment   # every RPC exists + anon sees 0 decks
supabase migration list --linked
```

`npm run verify:deployment` is the fastest way to confirm a deployment is sound — it uses
the anon key and checks for "could not find the function", which is what an unapplied
migration looks like and otherwise only surfaces as a silent fallback in production.

---

## 5. Document map

| File | Contents |
|---|---|
| `COGNIT_HANDOFF.md` | **This file** — start here |
| `COGNIT_PRODUCTION_EXECUTION_PLAN.md` | Original audit + full plan (4,398 lines). **§5.2 is the unrun UAT script** |
| `COGNIT_PROGRAM_REPORT.md` | Five-phase outcome summary |
| `PHASE_2_AUDIT.md` | Review of Phases 1–2; 6 defects, 2 gaps |
| `PHASE_3_COMPLETION_REPORT.md` | Phase 2.5 + 3 detail |
| `PHASE_4_COMPLETION_REPORT.md` | Phase 4 detail |
| `README.md` | Setup, architecture, troubleshooting |
| `supabase/verify/production-assertions.sql` | Post-migration SQL assertions |
| `implementation-prompts/` | The five phase prompts (historical) |

---

## 6. Suggested opening prompt for the next conversation

> I'm working on Cognit at `/Users/marcsantiago/Dev/cognit` — a Next.js 16 + Supabase +
> Gemini spaced-repetition study app. Read `COGNIT_HANDOFF.md` in the repo root first;
> it has the full state, architectural invariants, and a prioritised task list.
>
> A five-phase production hardening program is complete and committed at `b7a41a7`.
> Gate is green: tsc, lint, 187 tests, build, and all 31 migrations applied.
>
> I want to work on **[P0.x / P1.x from §2]**.
>
> Two things to know before you start: the authenticated app has never been exercised
> end to end, and this codebase has a history of defects that fail *silently* — see §3.1.
> Don't treat a green build as proof that a database write or an animation happened.
