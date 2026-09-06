# Cognit — Phase 4: UI/UX Polish & Friend-Ready Features

You are a senior product engineer with strong front-end and interaction-design judgement,
working in the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16
(App Router) + React 19 + Tailwind v4 + Framer Motion 12 + Supabase.

Your task is to execute **Phase 4** of `COGNIT_PRODUCTION_EXECUTION_PLAN.md` in the
repository root.

> **If the user pasted a `## Carry-forward from Phase 3` section above this prompt, read
> it first.** If there is no such section, verify Phase 3 landed:
> `src/app/api/chat/route.ts`, `src/lib/rag.ts` and `src/lib/pdf-chunking.ts` must exist.

---

## 0. Before you write any code

1. Read `COGNIT_PRODUCTION_EXECUTION_PLAN.md`, specifically:
   - **§4 → PHASE 4** — Tasks 4.1 through 4.6, with full component source
   - **§1.2** — the client-component status table
   - **§2.5** — what is already good; the reduced-motion handling in particular is
     thorough and you must not regress it
   - **§5.2 sections E, F, H** — the UAT scripts your work has to satisfy
2. Confirm a green baseline: `npx tsc --noEmit && npm run lint && npm test && npm run build`

---

## 1. What Phase 4 is for

Phases 1–3 made Cognit correct, safe and fast. Phase 4 is the difference between an app
that works and an app someone sends to a friend.

Two gaps dominate:

- **Nothing can be shared.** `decks.is_public` exists in the schema, is validated by
  `createDeckSchema`, and is **never written or read**. There is no share link, no public
  view, no clone. For an app whose growth loop is "my friend sent me their deck", this is
  the missing feature.
- **A new user lands on a dead end.** `/dashboard` for a fresh account shows a "0 due"
  card, a streak of 0, and one line of grey text: *"No decks yet. Create one to get
  started!"* Nothing explains what Cognit does, and the fastest path to value — upload a
  PDF — is two clicks inside a deck they have not created.

Everything else in this phase is polish on top of those two.

---

## 2. Task list

Run `npx tsc --noEmit` after each task.

### Task 4.1 — Deck sharing

This is the headline feature. Build it in this order:

1. **Migration** `supabase/migrations/202609060935_deck_sharing.sql` (full SQL in the
   plan): adds `share_token`, `shared_at`, `clone_count`; two public SELECT policies; the
   `set_deck_sharing` and `clone_shared_deck` RPCs.
2. **Actions** `src/app/actions/share.ts` — `setDeckSharing`, `cloneSharedDeck`.
3. **Public route** `src/app/s/[token]/page.tsx` — logged-out deck preview with
   `generateMetadata` for link unfurls.
4. **Components** `ShareDeckButton.tsx` (owner side) and `CloneDeckButton.tsx`.
5. **Mount** `ShareDeckButton` in the deck header (`dashboard/[deckId]/page.tsx`, near the
   card-count badges), and add `share_token, is_public` to that page's deck `select`.

**Read the security note in the plan under Task 4.1 before writing the migration.** These
are the first policies in the codebase that widen read access beyond the owner. They are
scoped by `is_public = true AND share_token IS NOT NULL` — **two flags, not one**, so that
revoking sharing does not invalidate the token, and so a stray `is_public` write cannot
expose a deck that has no token.

**What must NOT become visible:** `study_logs`, `quiz_results`, `quiz_card_results`,
`card_mastery_state`, `deck_chat_*`. A visitor sees card text and nothing about how the
owner studied. Do not touch those policies. You will verify this explicitly in the UAT.

Three details that are easy to get wrong:
- `clone_shared_deck` copies **content only** — no SM-2 state, no embeddings, no mastery,
  no history. The clone must start fresh for its new owner, and embeddings are regenerated
  on that user's own budget.
- The share page uses the existing `Flashcard` component. This is its **first use outside
  the deck grid**, and it means a logged-out visitor's first interaction with Cognit is
  flipping a card. That is deliberate — keep it.
- `generateMetadata` sets `robots: { index: false, follow: false }`. Shared decks are user
  content and must stay out of search indexes.

### Task 4.2 — First-time user experience

1. Create `src/lib/starter-decks.ts` with **three** starter decks.
2. Create `src/components/ui/shared/DashboardOnboarding.tsx` from the plan.
3. Wire it into `dashboard/page.tsx` — render it instead of the bare `DeckGrid` when
   `deckRows.length === 0`.
4. Fix the three other dead-end empty states listed in the plan's Task 4.2 table:
   `DeckCardsManager`, the study "You're all caught up!" screen, and the quiz "No cards
   available" screen. Each currently ends the journey; each should offer a next action
   using routes that already exist.

**On the starter decks: this is real content work, not scaffolding.** The plan shows five
example cards for `learning_science`. You need roughly **20 cards per deck, three decks**.
Write them properly:

- `learning_science` — "How Learning Works". Spacing effect, active recall, forgetting
  curve, desirable difficulty, interleaving, testing effect, elaborative interrogation,
  and so on. Meta-appropriate: the user learns why the app works while trying it.
- A second deck that is **concrete and universally attemptable** — world capitals, SI
  units, or similar. Someone with no domain knowledge must be able to get some right and
  feel the loop.
- A third matching the likely first audience — CS fundamentals, say.

Every card must satisfy the app's own quality rules, which are enforced in
`ai-generate.ts`: front is a **term of 1-4 words**, never a question, never a sentence,
no trailing punctuation; back is a **concise factual definition** of 1-3 sentences, not an
enumeration. Read `isValidTermFront` and `isEnumerationLike` and write cards that would
pass them.

The onboarding flow's promise is "reviewing in about five seconds" — the starter-deck
button creates the deck, imports the cards, and routes straight into study. Keep that
path intact and handle its two failure modes honestly (deck created but import failed →
say so and route to the deck, don't pretend it worked).

### Task 4.3 — Study & quiz ergonomics

**4.3a — Use the real card flip in study.** `FlashcardReviewClient` renders a cross-fade
between two `<p>` elements. A proper 3D flip with cursor tilt and reduced-motion handling
already exists in `Flashcard.tsx` — and is only used in the deck grid.

Extract the visual into `src/components/ui/shared/FlipCard.tsx` taking a **controlled**
`isFlipped` prop. The study view must keep `showAnswer` in its own state — it drives
keyboard handling and drag-to-grade. Then make `Flashcard.tsx` a thin uncontrolled wrapper
so the deck grid and the share page are unchanged.

Watch the drag interaction: `FlashcardReviewClient` has a `drag="x"` motion wrapper with
`onDragEnd` grading. Nesting a `transform-style: preserve-3d` element inside a dragged,
rotating parent can break the flip in Safari. Test both together.

**4.3b — Fix the Identification keyboard gap.** In MCQ, `Space` advances after feedback.
Identification has no equivalent — the shortcut panel currently admits it in its own copy:
*"Use keyboard focus + Enter to trigger Continue"*. Add the effect from the plan, then
update the panel to state it plainly: **Enter** check answer → **Enter / Space** continue.

**4.3c — Quiz completion celebration.** Create `MasteryConfetti.tsx` from the plan and
fire it at **≥ 80%**, with higher intensity at 100%.

It must be **suppressed under `prefers-reduced-motion`** — a burst of moving particles is
precisely what that setting exists to prevent. The component returns `null` in that case;
verify it, don't assume it.

**4.3d — Review completion summary.** The study summary reports counts but never says when
the work pays off, which is the entire point of SM-2. `gradeCard` already returns
`nextReviewAt` and `interval` and the client **discards them**. Capture them into session
state and add a "Next review" row — e.g. *"8 cards due tomorrow · 3 in 6 days"*.

### Task 4.4 — Sound & haptics

Create `src/lib/feedback-effects.ts` from the plan and wire it into `MCQMode` (on resolve),
`IdentificationMode` (on result), and `QuizAssessmentClient` (on completion). Add a small
toggle pair in the quiz header next to the existing Shortcuts button — no settings page.

**Ship haptics ON, sound OFF.** Vibration is invisible on desktop and on iOS Safari (which
does not implement `navigator.vibrate`), so it degrades silently and costs nothing. Sound
in a library or a lecture hall is a liability — make the user ask for it.

This is the section most likely to make the app feel cheap if overdone. Two constraints
from the plan worth restating: the incorrect tone is a **single low tone, deliberately not
a harsh buzz** — getting it wrong is the point of the exercise and must not feel like
punishment. And the audio is **synthesised with WebAudio**, not shipped as files: zero
bundle bytes, zero network requests, and the `AudioContext` is created lazily on first use
so autoplay policies are satisfied by the user's own click.

### Task 4.5 — Responsive audit

Work the six-row table in the plan's Task 4.5. Use the browser tooling rather than
eyeballing it:

```
preview_start { name: "cognit-dev" }
resize_window { preset: "mobile" }    → screenshot every route
resize_window { preset: "tablet" }    → screenshot every route
resize_window { preset: "desktop", colorScheme: "light" }
```

**Light theme needs a real pass.** Several components hardcode dark-only colours:
the deck page's Top Concepts chips (`text-sky-200`), `WeakestConcepts.tsx`
(`text-red-400`, `text-amber-400`), `DeckChatWidget`'s suggestion chips
(`text-emerald-300`). `DeckGrid.tsx` does this correctly — `text-sky-700 dark:text-sky-300`.
Apply that pattern to the rest. Anything you add in this phase must work in both themes
from the start.

### Task 4.6 — Bundle size

Add `LazyMotion` + `domAnimation` per the plan, wrap in `layout.tsx` inside
`ThemeProvider`, and convert `motion.*` to `m.*` across components. `strict` mode makes
the compiler catch anything you miss.

Measure before and after — report both numbers, not just "it should be smaller".

---

## 3. Verification gate

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm test
```
```bash
npm run build
```

Then the two checks that actually matter for this phase:

**Sharing end-to-end, in a real private window:**
1. Share a deck → copy the link.
2. Open it in a **private/incognito window** (genuinely logged out).
3. Confirm the deck preview renders and the cards flip.
4. Confirm **no** study history, quiz scores, mastery %, or chat is visible anywhere.
5. Sign in as a **second account** → clone → confirm the cards arrived and SM-2 state is
   fresh.
6. Owner clicks "Stop sharing" → the visitor's URL 404s.
7. Owner rotates the link → the old URL 404s, the new one works.

**Reduced motion:** enable the OS setting, score 100% on a quiz. **No confetti.** The
summary still renders. No orb pulse, no card tilt, everything still functional.

---

## 4. Rules

- **Do not weaken any RLS policy** to make sharing work. The two new policies are additive
  and narrowly scoped. If sharing seems to need broader access, you have the design wrong
  — stop and report.
- **Do not regress the reduced-motion handling.** §2.5 calls it out as already-good: CSS
  guards that work pre-hydration plus `useReducedMotion` in components. Everything you add
  must respect both.
- **Do not skimp on the starter-deck content.** 60 real cards. Cards that would fail the
  app's own `isValidTermFront` check make the product look worse than an empty state.
- **Do not add a settings page.** Feedback toggles live inline in the quiz header.
- **Do not add a confetti or audio dependency.** Both are hand-rolled in the plan for good
  reasons — canvas confetti has no layout impact, WebAudio tones cost zero bytes.
- **Do not build Phase 5 work** (README, CI, cron, coverage thresholds).
- **Never claim a check passed without running it.** Screenshots and real output.
- **Do not commit.**

---

## 5. Required completion report

```markdown
## PHASE 4 COMPLETION REPORT

### 1. Status
COMPLETE | PARTIAL | BLOCKED

### 2. Verification gate
| Command | Result | Notes |
|---|---|---|
| npx tsc --noEmit | | |
| npm run lint | | |
| npm test | | |
| npm run build | | |

### 3. Sharing end-to-end proof
| Step | Expected | Observed | Pass? |
|---|---|---|---|
| Share link generated | | | |
| Opens in a logged-out private window | | | |
| Cards flip for the visitor | | | |
| Study history / scores / mastery NOT visible | | | |
| Second account can clone | | | |
| Clone has fresh SM-2 state, no owner history | | | |
| Stop sharing → 404 | | | |
| Rotate link → old 404s, new works | | | |

State exactly how you verified the privacy row — which tables you checked and how.

### 4. Starter decks
| Key | Title | Card count | All pass isValidTermFront? |
|---|---|---|---|
Paste 3 sample cards from each deck.

### 5. Accessibility & motion
| Check | Result |
|---|---|
| Confetti suppressed under prefers-reduced-motion | |
| Card tilt suppressed | |
| Background orbs suppressed | |
| Keyboard: Tab reaches every new control | |
| Keyboard: Enter/Space advances Identification feedback | |
| Focus trapped and restored in the share dialog | |

### 6. Responsive & theme
Screenshots or explicit findings at 375 / 768 / 1280, in BOTH themes, for:
/, /login, /dashboard, /dashboard/[deckId], /dashboard/[deckId]/study,
/dashboard/[deckId]/quiz, /s/[token]
List every dark-only colour you found and fixed.

### 7. Bundle size
| Build | First Load JS (dashboard route) |
|---|---|
| Before LazyMotion | |
| After LazyMotion | |

### 8. Tasks completed
For each of 4.1 - 4.6: task ID, files touched, what changed, how verified.

### 9. Where I stopped
Exact task ID and sub-step.

### 10. Deviations & discoveries
- Anything in the plan's component source that did not work as written
- Interaction bugs found (especially FlipCard nested inside the drag wrapper)
- Anything you did differently, and why

### 11. Carry-forward for Phase 5
- New routes that need UAT coverage (/s/[token] in particular)
- The sharing migration's status (written / applied where)
- Any responsive or theme issue you found but did not fix
- Anything in Phase 5's UAT script (§5.2) that your changes have invalidated

### 12. Validation steps for the user
Action → expected result. Cover at minimum:
- A brand-new account sees onboarding, not "No decks yet"
- A starter deck goes from click to studying in one step
- Share → open logged out → clone from a second account
- Quiz at 85% fires confetti; at 60% it does not
- Reduced motion: no confetti, everything still works
- Identification: Enter checks, Enter/Space continues
- Study card does a real 3D flip; swipe-to-grade still works
- Study summary shows when cards are next due
- Haptics fire on Android; sound is off until enabled
- Light theme has no unreadable text on any route
```
