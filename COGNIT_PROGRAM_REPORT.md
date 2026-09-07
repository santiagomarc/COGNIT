# Cognit — Five-Phase Program Report

**Period:** 2026-09-05 → 2026-09-08
**From:** `0f83531` · **To:** working tree (uncommitted)
**Scope:** the full `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, plus a Phase 2.5 correction pass.

---

## 1. Outcome at a glance

| | Before | After |
|---|---|---|
| Tests | 54 / 9 files | **187 / 20 files** |
| Routes | 13 | **15** (`/api/chat`, `/s/[token]`) |
| Migrations | 22 | **31** (9 new, all applied) |
| `console.*` in server code | 60 | **0** (structured logger) |
| Server Actions with tests | 0 | 3 (`quiz`, `share`, `_shared`) |
| Deck sharing | none | token links + clone |
| Deck chat | blocking action | **SSE streaming** |
| Client chunks | 2.5 MB | **2.3 MB** |

**Current gate — every command actually run:**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS |
| `npm run lint` | ✅ PASS |
| `npm test` | ✅ **187 passed** |
| `npm run build` | ✅ 15 routes |
| `npm run verify:deployment` | ✅ 10/10 RPCs live and guarded |

Live database check confirms all nine new RPCs exist, each refuses an anonymous
caller, and **an anonymous client sees 0 decks** — the sharing policy is correctly
scoped.

---

## 2. What each phase delivered

**Phase 1 — dead-code purge.** Four unreferenced files deleted, two misleading comment
blocks removed (one described an OpenAI implementation that never existed here), a
duplicated conditional render collapsed, and 60 `console.*` calls replaced with a
structured logger behind a `no-console` lint rule.

**Phase 2 — correctness & security** (Gemini) **+ Phase 2.5 — corrections** (me).
Closed the three bugs that broke the app for real users: unguarded `await`s in AI
actions, and the two clients whose loading state never reset — the Send button stayed
disabled until reload. Reserved AI spend *before* the call rather than after, closing a
bypass where every failed call was free. Pinned the auth redirect origin, added security
headers, folded quiz mastery into one transaction, and bounded two unbounded queries.

**Phase 3 — AI pipeline.** Created the SSE streaming route (which did not exist —
chat was a blocking Server Action). Added a similarity floor to retrieval and **deleted
the fallback that answered from the five oldest cards** when vector search failed.
Replaced silent 120k-character truncation with chunked PDF ingestion. Enforced exactly
three de-duplicated MCQ distractors. Swapped IVFFlat for HNSW.

**Phase 4 — UX & sharing.** Token-based deck sharing with a logged-out preview page and
clone-to-library. Onboarding with 60 hand-written starter cards. A real 3D card flip in
study, the Identification keyboard gap closed, confetti, and WebAudio/haptic feedback.
21 unreadable light-theme colours fixed.

**Phase 5 — hardening.** README rewritten from `create-next-app` boilerplate. CI
workflow, cron config, SQL assertion suite, deployment verification script, and the
first tests for Server Actions — including 11 that pin the anti-cheat guarantee.

---

## 3. Bugs found that were *not* in the original plan

The audit predicted 41 findings. These eight surfaced only during implementation, and
several were more consequential than what the audit caught:

| # | Finding | Why it mattered |
|---|---|---|
| 1 | `recordAiUsage` wrote nothing — RLS `FOR UPDATE USING(false)` made the update match zero rows, which PostgREST reports as **success** | Cost-monitoring audit trail was silently empty |
| 2 | `get_due_cards_by_deck` was "fixed" to `coalesce(auth.uid(), p_user_id)` | **Inverted** the security finding it was meant to close |
| 3 | `guardAction` stringified Zod errors | Users saw `{"message":["Message is too short"]}` in toasts |
| 4 | `isEnumerationLike` counted repeated ordinals | Silently rejected **every queue/FIFO card in any CS deck** |
| 5 | `domAnimation` (as my own plan specified) excludes `drag`/`layout`/`layoutId` | Would have silently killed swipe-to-grade, the deck grid, and the dock pill |
| 6 | `'use server'` files cannot export non-async functions | Broke the build; forced three helper modules to be extracted — which made them testable |
| 7 | `focus_unproven` capped by a small fetch pool | UI promised "all N unproven cards" and delivered ~20 |
| 8 | Pagination broke deck-wide counts | A fully-enriched 200-card deck read "60/200 quiz-ready" forever |

**Three of these (1, 2, 4) fail silently.** That is the pattern worth noting: the
dangerous defects in this codebase were never crashes, they were writes that appeared to
succeed and heuristics that quietly discarded good data.

---

## 4. Open issues

### Must fix before public launch

**4.1 — No end-to-end verification of the authenticated app.** *(High)*
Every authenticated route was built and type-checked but never exercised: onboarding,
starter decks, share→clone, streaming chat against live Gemini, confetti, the study
flip. I could not create a session without your credentials. **§5.2 of the plan is an
8-section UAT script; it has not been run.** This is the single largest gap.

**4.2 — Local `npm install` is broken.** *(Medium)*
`Cannot read properties of null (reading 'edgesOut')` — extraneous `@emnapi/*` packages
desync `node_modules` from the lockfile. Pre-existing; not introduced here. `npm ci`
works, so CI is unaffected. Fix: `rm -rf node_modules && npm ci`.

**4.3 — `@vitest/coverage-v8` not installed.** *(Medium)*
Blocked by 4.2. Coverage is configured in `vitest.config.ts` but unmeasurable. I did not
add it to `package.json` because a dependency without a matching lockfile entry breaks
`npm ci` — which would have broken the CI I just added.

**4.4 — Similarity threshold is an estimate.** *(Medium)*
`MIN_CONTEXT_SIMILARITY = 0.62` in `src/lib/rag.ts` is my guess, not a measurement.
`scripts/calibrate-threshold.mjs` exists to fix that but needs a real deck and a user
token. Too high silently refuses good questions; too low reintroduces hallucination.

**4.5 — `database.types.ts` is hand-edited.** *(Low)*
The sharing columns were added by hand. Now that migrations are applied:
```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

### Should fix soon

**4.6 — Safari 3D flip inside the drag wrapper.** Nesting `transform-style: preserve-3d`
in a dragged, rotating parent is a known Safari trouble spot. Untested on real Safari.

**4.7 — Migration-fallback paths still present.** Every RPC call has a TypeScript
fallback marked `@deprecated`. All migrations are now applied, so these are dead weight
roughly doubling the branching in the data layer. Delete one release from now.

**4.8 — `DockNav` links to two routes that don't exist** (`/dashboard/stats`,
`/dashboard/profile`), rendered as permanently-disabled buttons. Build or remove.

**4.9 — CSP still needs `'unsafe-inline'` for scripts.** Scoped `'unsafe-eval'` to dev,
but the inline theme script in `layout.tsx` and Next's bootstrap need nonces to remove
the remaining hole.

**4.10 — No rate limiting on auth endpoints.** Supabase provides some, but signup and
password-reset have no application-level throttle.

---

## 5. Where this stands

**Genuinely production-ready:** the data layer (RLS, `SECURITY INVOKER` RPCs,
append-only history), the AI fault-tolerance layer, spend control, SM-2 scheduling, and
the anti-cheat guarantee — the last of which now has 11 tests pinning it.

**Ready with a known limitation:** the streaming chat (mechanically verified, never seen
end to end), sharing (RPCs live and guarded, flow unexercised), and PDF chunking
(unit-tested, never run against a real 100-page document).

**I would not launch publicly without:** running the §5.2 UAT, and calibrating the
retrieval threshold. Both need a session I cannot create.

**For sharing with a handful of friends today** — which is what you actually asked for
at the start — it is in good shape, provided you walk the UAT yourself first.

---

## 6. Suggested roadmap

### Now — close the loop (½ day, mostly yours)

1. `rm -rf node_modules && npm ci`, then install the coverage provider.
2. Run the 8-section UAT in `COGNIT_PRODUCTION_EXECUTION_PLAN.md` §5.2. Sections **F**
   (sharing) and **G** (cross-user isolation) matter most — G is the one where a bug
   would be a real incident.
3. Run `supabase/verify/production-assertions.sql` in the SQL editor.
4. Calibrate the threshold with `scripts/calibrate-threshold.mjs`.
5. Regenerate `database.types.ts`.

### Next — polish for the first 50 users (1–2 weeks)

- **Delete the migration fallbacks** (4.7). Biggest single readability win available.
- **Onboarding checklist** — a persistent "3 of 5 done" card converts far better than a
  one-time panel that vanishes after the first deck.
- **Deck-level analytics** — the data for retention curves already exists in
  `study_logs`; nothing surfaces it. `/dashboard/stats` is already stubbed in the dock.
- **Undo for destructive actions.** `bulkDeleteCards` can remove 200 cards behind one
  confirm dialog with no recovery.
- **Mobile study ergonomics.** Swipe works, but one-handed reach on the grade buttons
  is untested.

### Then — scale (1–3 months, in dependency order)

**Cost is the first thing that will bite.** §3.11 puts the worst case at ~$2.24/user/hour
against a 300-call daily ceiling. At 100 active users that is real money.
1. **Cache embeddings by content hash.** Identical cards across cloned decks currently
   re-embed per user — and cloning is the growth loop you just shipped.
2. **Move enrichment to a queue.** It runs inline in a Server Action today; a 200-card
   import blocks a request for tens of seconds.
3. **Per-user cost telemetry.** `ai_usage_logs` has the rows; nothing aggregates them.
   Without this you learn about a runaway user from a bill.

**Then database:**
4. `pgvector` HNSW is fine to ~100k vectors/user. Past that, partition `cards` by
   `deck_id` or move vectors to a dedicated store.
5. `getQuizHistory` still fetches up to 20,000 `quiz_card_results` rows (finding P-9,
   never fixed — it was LOW). It will bite a heavy user first.

**Then product:**
6. **Public deck directory.** The sharing primitives are built; a browsable index is a
   small step and the natural acquisition channel.
7. **Collaborative decks** — needs a real `deck_members` table and a rethink of the
   ownership model, which is currently single-owner throughout. Do not bolt this on.

### Explicitly not recommended yet

- **Native mobile.** The PWA path is far cheaper until retention justifies it.
- **Multi-provider AI.** `withGeminiRetry` makes this easy later; doing it now doubles
  the prompt-tuning surface for no user-visible gain.
- **Raising the AI rate limits.** They are the only thing between you and an unbounded
  bill. Raise them when telemetry shows real users hitting them, not preemptively.

---

## 7. Artifacts

| File | Contents |
|---|---|
| `COGNIT_PRODUCTION_EXECUTION_PLAN.md` | Original audit + 5-phase plan (4,398 lines) |
| `PHASE_2_AUDIT.md` | Review of Gemini's Phases 1–2; 6 defects, 2 gaps |
| `PHASE_3_COMPLETION_REPORT.md` | Phase 2.5 + 3 |
| `PHASE_4_COMPLETION_REPORT.md` | Phase 4 |
| `COGNIT_PROGRAM_REPORT.md` | This document |
| `supabase/verify/production-assertions.sql` | Post-migration SQL assertions |
| `scripts/verify-deployment.mjs` | `npm run verify:deployment` |
| `scripts/calibrate-threshold.mjs` | Retrieval threshold calibration |
| `implementation-prompts/` | The five phase prompts |

**Nothing is committed.** 113 files changed, +13,228 / −1,906 since `0f83531`, with
12 files still uncommitted in the working tree.
