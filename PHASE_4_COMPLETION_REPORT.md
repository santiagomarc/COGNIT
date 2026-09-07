# Phase 4 Completion Report — UI/UX Polish & Friend-Ready Features

**Date:** 2026-09-07

## 1. Status

**COMPLETE for code.** Migrations written but **NOT applied** (see §7).

## 2. Verification gate

Every command below was actually run.

| Command | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | exit 0 |
| `npm run lint` | ✅ PASS | no errors, no warnings |
| `npm test` | ✅ PASS | **149 tests / 17 files** (was 118 / 15) |
| `npm run build` | ✅ PASS | **15 routes** — `/s/[token]` now present |

New tests: `starter-decks.test.ts` (22), `next-review-summary.test.ts` (7), plus 2 added
to `card-generation.test.ts`.

---

## 3. Tasks

### 4.1 Deck sharing — DONE

- `202609070910_deck_sharing.sql` — `share_token` / `shared_at` / `clone_count`,
  two public SELECT policies, `set_deck_sharing` and `clone_shared_deck` RPCs.
- `src/app/actions/share.ts` — `setDeckSharing`, `cloneSharedDeck`.
- `src/app/s/[token]/page.tsx` — logged-out preview with `generateMetadata` for link
  unfurls and `robots: { index: false }`.
- `ShareDeckButton` (copy / rotate / stop) mounted in the deck header;
  `CloneDeckButton` on the public page.

**Privacy, by construction:** both new policies require
`is_public = true AND share_token IS NOT NULL` — two flags, so revoking does not
invalidate the token and a stray `is_public` write cannot expose a tokenless deck.
`study_logs`, `quiz_results`, `quiz_card_results`, `card_mastery_state` and
`deck_chat_*` policies are **untouched**. `clone_shared_deck` copies content only —
no SM-2 state, embeddings, mastery or history.

The share page is the **first use of the 3D `Flashcard` outside the deck grid**, so a
logged-out visitor's first interaction with Cognit is flipping a card.

### 4.2 First-time user experience — DONE

- `src/lib/starter-decks.ts` — **three decks, 60 real cards**: learning science
  (meta-appropriate), world capitals (concrete, attemptable with no prior knowledge),
  and CS fundamentals (the likely first audience).
- `DashboardOnboarding` replaces the bare "No decks yet" line for a new account.
  One click creates the deck, imports the cards, and routes straight into study.
- Three dead-end empty states now offer a next action: `DeckCardsManager`,
  the study "You're all caught up!" screen (quiz / study-ahead), and the quiz
  "No cards available" screen (jump to `#add-content`).

`starter-decks.test.ts` asserts every card passes the app's **own** rules
(`isValidTermFront`, `isEnumerationLike`) and the real `bulkImportSchema`.

### 4.3 Study & quiz ergonomics — DONE

- **`FlipCard` extracted** from `Flashcard.tsx`; `Flashcard` is now a thin
  uncontrolled wrapper, so the deck grid and share page are unchanged. The study view
  uses `FlipCard` directly and keeps `showAnswer` in its own state — that state also
  drives keyboard grading and drag-to-grade. The study card is a **real 3D flip**
  instead of a cross-fade.
- **Identification keyboard gap closed** — `Enter` or `Space` now advances from the
  feedback screen, and the shortcut panel says so instead of admitting the gap.
- **`MasteryConfetti`** fires at ≥80%, harder at 100%. Canvas, no dependency, no
  layout impact, and it returns `null` outright under `prefers-reduced-motion`.
- **Next-review row** in the study summary. `gradeCard` already returned
  `nextReviewAt` and the client was discarding it; it now reads e.g.
  *"8 cards tomorrow · 3 cards in 6 days"*.

### 4.4 Sound & haptics — DONE

`src/lib/feedback-effects.ts` + `use-feedback-prefs.ts`. **Haptics on, sound off** by
default. Tones are synthesised with WebAudio (zero bundle bytes, zero requests, context
created lazily so autoplay policy is satisfied by the user's own click). The incorrect
tone is a single low note, deliberately not a buzzer.

Feedback fires at **selection** time, not on Continue — for rapid quiz runs the delay
would be obvious. Both quiz modes gained an `onAnswered` callback for this.

Toggles sit inline in the quiz header next to Shortcuts. No settings page.

### 4.5 Responsive & theme — DONE

- **21 dark-only text colours fixed** across 6 files to the `text-X-700 dark:text-X-300`
  pattern `DeckGrid` already used. `text-emerald-300` on a `/10` tint is effectively
  invisible in light mode; this affected the entire quiz results screen.
- Quiz header now wraps (`flex-wrap`) with a truncating deck title — it packed 7 items
  into one row and overflowed at 375px.
- Study card `h-[22rem] sm:h-[20rem]` so long definitions stop clipping on mobile.
- Search modal padded by `env(keyboard-inset-height)` for the iOS keyboard.
- Deck page study/quiz forms moved from `lg:grid-cols-2` to `md:grid-cols-2`.

### 4.6 Bundle size — DONE, with a correction

`MotionProvider` + conversion of **139 `motion.*` call sites across 29 files** to `m.*`.

**Chunk total: 2.5M → 2.3M.**

> **The plan was wrong here and I changed it.** §4 Task 4.6 specified
> `domAnimation`. This app uses `drag` (swipe-to-grade), `layout` (DeckGrid) and
> `layoutId` (the DockNav active pill) — **none of which `domAnimation` includes**, and
> the failure is silent: the animations simply stop happening. Switched to `domMax`.
> Smaller saving, nothing broken.

`strict` throws at runtime on a missed conversion, so this was verified two ways:
grep proves zero `motion.<element>` and zero `motion` imports remain, and the pages were
loaded in a browser with **zero console errors**.

---

## 4. What I verified in a browser

| Check | Result |
|---|---|
| Landing page renders after the motion conversion | ✅ zero console errors |
| Login page renders (dark) | ✅ |
| Login page renders (light) | ✅ verified after forcing `cognit-theme=light` |
| Mobile 375×812 landing — no horizontal overflow | ✅ |

One false alarm worth recording: downscaled screenshots (0.42–0.5) of the dark login page
looked blank. The DOM showed `opacity: 1` and correct bounding boxes, and a full-scale
screenshot rendered perfectly. **It was my screenshot scaling, not the app.**

## 5. What I could NOT verify

The authenticated routes — dashboard, deck, study, quiz — and the share page need a
session I cannot create without your credentials. So these are **built and type-checked
but not visually confirmed**:

- Onboarding panel for a brand-new account
- Starter-deck one-click flow end to end
- Share → open logged out → clone from a second account
- Confetti firing at ≥80%, and its suppression under reduced motion
- The 3D flip inside the drag-to-grade wrapper (**worth a real look — nesting
  `transform-style: preserve-3d` inside a dragged, rotating parent is exactly where
  Safari misbehaves**)
- Light theme on the quiz results screen, where most of the 21 colour fixes landed

## 6. Discoveries

1. **`isEnumerationLike` had a false positive on "first-in-first-out".** It counted raw
   ordinal hits, so "first" appearing twice in one compound term read as a list. This
   silently rejected **every queue/FIFO card in any CS deck** — not just my starter card.
   Fixed to require two *distinct* ordinals, with tests both ways. The starter-deck test
   is what surfaced it.

2. **`'use server'` bit again.** `summariseNextReviews` couldn't be imported from the
   client component for testing because that pulls in `study.ts`. Moved to `lib/study.ts`.

3. **`database.types.ts` is generated and predates the sharing columns.** Hand-edited
   with a comment; regenerate with `supabase gen types typescript --linked` once
   `202609070910` is applied.

4. **A one-file regex miss.** `button.tsx` imports framer-motion with double quotes; my
   conversion only matched single. Caught by `tsc`, then by the residual grep.

5. **Onboarding and the create-deck modal are sibling client islands** under a server
   component, in different grid areas. Rather than hoist the layout into one client
   component, they talk through a named `CustomEvent` (`src/lib/dashboard-events.ts`).

## 7. Migrations — WRITTEN, NOT APPLIED

`202609070910_deck_sharing.sql` joins the eight already outstanding. **Nine total.**

I did not apply them: the Supabase CLI is linked to remote `idmmivsxdgpqweofseud` and
there is no local stack. Until they run, `setDeckSharing` and `cloneSharedDeck` will
fail — **sharing is the one Phase 4 feature that cannot work at all without its
migration.** Everything else degrades gracefully.

## 8. Validation steps for you

Apply the migrations to staging first, then:

**Sharing**
1. Open a deck → **Share deck** → copy the link.
2. Open it in a **private window**. → Preview renders, cards flip, no login needed.
3. Confirm **no** study history, quiz scores, mastery % or chat appear anywhere.
4. Sign in as a **second account** → **Save to my library** → cards arrive, SM-2 fresh.
5. Owner → **Stop sharing** → the visitor's URL 404s.
6. Owner → rotate (↻) → old URL 404s, new one works.

**FTUX**
7. Register a brand-new account → dashboard shows **onboarding**, not "No decks yet".
8. Click a starter deck → studying within a couple of seconds.
9. Empty deck → the card area offers three next actions rather than a dead end.

**Ergonomics**
10. Study a card → press Space → a **real 3D flip**.
11. Swipe the card sideways on mobile → still grades. *(Please check this one.)*
12. Finish a session → summary shows **"Next review"**.
13. Identification quiz → answer → press **Enter** → advances.
14. Score ≥80% → confetti. Score 60% → none.
15. Enable OS reduce-motion → score 100% → **no confetti**, summary still renders.

**Feedback**
16. Quiz header → speaker icon toggles sound; it persists across reload.
17. On Android, answering vibrates. On iOS it is a silent no-op, by design.

**Theme**
18. Switch to light and open a quiz results screen → every count and badge is readable.
