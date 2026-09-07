# Audit — Phases 1 & 2 as implemented

**Reviewed:** `3dd83f7` (Phase 1) and `132e99a` (Phase 2) against
`COGNIT_PRODUCTION_EXECUTION_PLAN.md` and the phase prompts.
**Date:** 2026-09-07

## Verdict

**Phase 1: complete and correct.** All six tasks, no deviations found.

**Phase 2: substantially complete (~85%).** All eleven tasks were attempted, the headline
fixes are real, and the discipline about *not* doing Phase 3 work was excellent. Six
defects and two gaps found — none block Phase 3, but four are user-visible and two touch
code Phase 3 will also modify, so fixing them first is cheaper.

### Gates (verified by running them)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ clean |
| `npm test` | ✅ 66 passed (54 baseline + 12 new `ai-retry.test.ts`) |
| `npm run build` | ✅ 13 routes |
| `console.*` in `src/app/actions`, `src/app/api`, `src/lib` | ✅ zero remaining |

---

## What landed correctly

**Phase 1** — all four files deleted (`src/lib/supabase.ts`, `CreateDeckForm.tsx`,
`dashboard/template.tsx`, `test-gemini-diag.mjs`); both misleading comment blocks gone;
duplicated `addContentSection` collapsed to one unconditional render
(`[deckId]/page.tsx:506`); `Promise.all([single])` and the double Supabase client both
removed; `logger.ts` created and every server call site migrated; `no-console` lint rule
added; deprecation JSDoc applied without deleting any fallback.

**Phase 2 headline fixes — all genuinely done:**

- `ai-retry.ts` and `action-guard.ts` faithful to §3.1, including full jitter.
- **All 8 AI actions wrapped in `guardAction`**; all 7 Gemini call sites go through
  `withGeminiRetry`.
- `getGeminiJsonModel()` moved inside the guard in `ai-enrich.ts` (was R-4).
- **R-2 fixed**: `DeckChatWidget.handleSendMessage` now has `try/catch/finally` with
  `setIsSending(false)` in the `finally`.
- **R-3 fixed**: `SemanticSearchModal.runSearch` wrapped in try/catch.
- **R-5 fixed**: the mount-time embedding sync loop is gone, replaced by
  `getDeckIndexStatus` (two COUNTs, no AI calls) + a manual "Index now" button +
  auto-sync-once on first message guarded by `hasAutoSyncedRef`.
- **R-8 fixed**: `updateCard` re-embeds inline, non-fatally.
- **R-9 fixed**: `apply_quiz_sm2_batch` now folds `card_mastery_state` into the same
  transaction; `quiz.ts` threads `correct` through and keeps the old path in the fallback
  branch only.
- **S-2 fixed**: `reserveAiCall` reserves *before* the AI call, with an atomic
  `pg_advisory_xact_lock` RPC and a TypeScript fallback. This was the highest-value fix
  in the phase and it is correct.
- **S-1 fixed**: `resolveBaseUrl()` pins to `NEXT_PUBLIC_SITE_URL` and throws in production.
- **S-4 fixed**: callback now rejects `//` *and* `\`, and uses `new URL(path, origin)`.
- **P-2 / P-3 fixed**: quiz page no longer fetches the whole deck; deck page paginates at
  60 with a working "Load more".
- `totalCards` correctly uses the exact `count`, not `cards.length` — mastery % and
  session bounds stay accurate under pagination.

**Correctly deferred to Phase 3** (verified still present, as intended): the oldest-cards
RAG fallback, the per-card embedding UPDATE loop, `temperature: 0.4`, distractor
de-duplication, and the HNSW migration.

---

## Defects

### D1 — `recordAiUsage` is silently blocked by RLS · MEDIUM

`_shared.ts:228-241` updates the reservation row:

```ts
.from('ai_usage_logs').update({ metadata: {...} }).eq('id', reservationId)
```

But `202609050900_immutable_table_deny_policies.sql:88` created:

```sql
CREATE POLICY "Users cannot update ai usage logs"
  ON public.ai_usage_logs FOR UPDATE USING (false) WITH CHECK (false);
```

No later migration adds a permissive UPDATE policy. RLS makes the UPDATE match **zero
rows**, which PostgREST reports as success — so the `if (error)` check never fires.

**Effect:** every `ai_usage_logs` row stays at `phase: 'reserved'` forever. Completion
metadata (`generated_count`, `response_chars`, `synced_cards`) is never written. Rate
limiting is unaffected (it counts rows), so this is not a security hole — but the audit
trail the §3.11 cost watch-list depends on is empty, and it fails silently.

**Fix — pick one:**
- Simplest: drop the update. Make the reservation row the record; move the metadata you
  care about into `reserveAiCall`'s initial insert where it is known up front.
- Or: add a scoped UPDATE policy allowing a user to update their own rows. This weakens
  the append-only guarantee the migration was written to enforce.
- Or: do the update inside a `SECURITY DEFINER` RPC that only touches `metadata`.

I'd take the first. The completion payload is nice-to-have; silent data loss is not.

### D2 — `get_due_cards_by_deck` was weakened, not hardened · MEDIUM

`202609060920_policy_completeness.sql:59`:

```sql
WHERE decks.user_id = coalesce(auth.uid(), p_user_id)   -- as implemented
```

The plan (S-5) specified:

```sql
WHERE decks.user_id = auth.uid() AND decks.user_id = p_user_id
```

`coalesce` inverts the intent: it creates a path that **falls back to trusting the
caller-supplied id** when `auth.uid()` is NULL. S-5 existed specifically to add the
double-check that the other nine RPCs carry.

**Not currently exploitable** — the function is `SECURITY INVOKER`, granted only to
`authenticated` (where `auth.uid()` is always non-null) and `service_role` (which bypasses
RLS anyway). But it is one refactor away from mattering, and it is the opposite of what
the finding asked for.

**Fix:** use the `AND` form from the plan.

### D3 — Zod validation errors reach the user as raw JSON · MEDIUM

`action-guard.ts:18-23` stringifies any non-string error:

```ts
error: typeof res.error === 'string' ? res.error : JSON.stringify(res.error),
```

Zod `fieldErrors` objects used to be returned as objects, and `formatActionError`
(`ai-feedback.ts:50-58`) flattens those into readable text. Now they arrive pre-stringified
and fall through to the "return the string verbatim" branch.

Verified empirically with a throwaway test:

```
>>> WITHOUT guardAction: "Message is too short"
>>> TOAST TEXT:          "{\"message\":[\"Message is too short\"]}"
```

**Reachable today:** `chatWithDeckSchema` requires `message` ≥ 3 chars, but
`DeckChatWidget.handleSendMessage` only checks `!trimmed`. Sending "hi" shows the user
`{"message":["Message is too short"]}`.

**Fix:** in `guardAction`, pass structured errors through unchanged and let
`formatActionError` do its job — or call the same flattening logic before stringifying.
Widen `ActionFailure['error']` to `string | Record<string, string[]>`.

### D4 — `focus_unproven` silently capped · MEDIUM

The deck page advertises **"Force include all unproven cards ({unprovenCards})"**
(`[deckId]/page.tsx:470`), where `unprovenCards = totalCards - masteredCards` — potentially
hundreds.

The quiz page now fetches only
`Math.min(Math.max(sessionCardCount * 2, 20), 100)` cards (`quiz/page.tsx:104`) and then
filters `focus_unproven` **within that pool** (`:151-177`). A deck with 100 unproven cards
and a session size of 10 fetches 20 candidates and can deliver at most 20.

The plan specified a 3-argument `select_quiz_cards(p_deck_id, p_limit, p_focus_unproven)`
so this filter could run in the database; the implemented RPC takes 2 arguments.

**Fix:** add `p_focus_unproven` to the RPC per the plan, and when it is set, pass a limit
derived from the real unproven count rather than the session size.

### D5 — Quiz card selection is deterministic · MEDIUM

`select_quiz_cards` orders by `CASE ... END, next_review_at ASC, created_at ASC` — no
`random()`. The plan specified `ORDER BY priority, random()`.

The page does shuffle the fetched pool client-side, so *within* a quiz the order varies —
but the **pool itself is the same top-N every time** until scheduling changes. On a
500-card deck the user cycles the same ~20 cards repeatedly, which invites positional
memorisation rather than recall.

**Fix:** add `random()` as the last `ORDER BY` term inside each priority tier.

### D6 — "quiz-ready" count broken by pagination · MEDIUM (trivial fix)

`[deckId]/page.tsx:172` computes `quizReadyCards` over `cards` — now only the **first 60**
— then displays it against `totalCards` at `:302`:

```
{quizReadyCards}/{totalCards} quiz-ready
```

A fully-enriched 200-card deck reads **"60/200 quiz-ready"** permanently, and the
"Some cards still need AI enrichment" hint at `:478` never goes away.

Same scope bug, lower stakes, in `topTopics` (`:211`) — Top Concepts now reflects only the
first 60 cards.

**Fix:** compute both with a `count`-only query (`head: true`) filtered on
`id_question IS NOT NULL`, or add a small aggregate RPC.

---

## Gaps

### G1 — `src/lib/env-server.ts` never created · MEDIUM

Task 2.5 required it. Consequences:
- `GEMINI_API_KEY` is unvalidated; a missing key surfaces as a runtime AI failure rather
  than a startup error.
- The production `CRON_SECRET` guard exists only inside the keep-alive route, so a
  misconfigured deploy is discovered when the cron first fires, not at boot.

Also minor: `auth/actions.ts:69` and `callback/route.ts:16` read
`process.env.NEXT_PUBLIC_SITE_URL` directly instead of the validated
`publicEnv.NEXT_PUBLIC_SITE_URL` that Phase 2 added.

### G2 — CSP is looser than specified · LOW

`next.config.ts` adds `'unsafe-eval'` to `script-src` (not in the plan) and omits
`object-src 'none'`. `'unsafe-eval'` is generally not needed by a production Next.js
build; if it was added to silence a dev-mode warning, scope it to development.

Everything else in the header set is correct, and the dynamic `connect-src` derivation
from `NEXT_PUBLIC_SUPABASE_URL` is a nice touch.

---

## Nits

- **`aiFailureMessage` gets camelCase feature names.** `ai-assist.ts:176,246` pass
  `'sanitizeNotes'` and `'getHint'`, producing *"sanitizeNotes is under heavy demand right
  now."* The other six call sites use proper names ("Deck chat", "Search", "Card
  generation", "Enrichment"). Change to "Note cleanup" and "Hint generation".
- **`gradeCard` dropped both `revalidatePath` calls**, not just `/dashboard`. The plan kept
  the deck path. `finishStudySession` covers the normal exits, so the only gap is a user
  who back-navigates mid-session seeing a stale deck page.
- **`eslint.config.mjs` has `'no-console': 'error'` listed twice** in the same rules object
  — harmless duplicate.
- **`apply_quiz_sm2_batch` uses `last_quiz_at = EXCLUDED.last_quiz_at`** where the plan had
  `greatest(existing, excluded)`. Equivalent in practice since `v_now` is always the
  newest — no action needed.

---

## Recommendation

Fix D1–D6 and G1 as a short "Phase 2.5" before starting Phase 3. Rationale:

- **D1 and D3 touch files Phase 3 rewrites** (`_shared.ts`, `action-guard.ts`,
  `chat.ts`). Fixing them now avoids conflicts and avoids Phase 3 inheriting a broken
  audit trail.
- **D4, D5 and D6 are user-visible** and each is a small, self-contained change.
- **D2 and G1 are security-posture items** that belong with the rest of Phase 2's security
  work rather than trailing into a later phase.

Estimated effort: 2–3 hours. None of it is architectural.
