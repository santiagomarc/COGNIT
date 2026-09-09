## Carry-forward from Run 1 

Cognit Redesign — Run 1 Completion Report (Phases 0–3)
Section 1 — What I did
Baseline confirmed green before starting at c83c050, and the four "before" idiom counts matched the expected 37 / 24 / 190 / 7 exactly.

55 files modified, 7 added; +993 / −609.

Phase 0 — Blocking defects
Task	Change
0.1 z-index collision (F-01)	Added the §4.4 z-scale to globals.css. Moved DockNav → --z-rail (DockNav.tsx:65), quiz pause overlay → --z-overlay (QuizAssessmentClient.tsx:997), ConfirmDialog / BulkImportModal / SemanticSearchModal → --z-modal, theme fade overlay z-140 → --z-overlay, skip link → --z-skip. Also found an 8th raw value the prompt didn't list — z-50 on the theme toggle at update-password/page.tsx:70 — moved to --z-sticky.
0.2 Route-guard the dock	DockNav returns null on /dashboard/[deckId]/{study,quiz} via CHROMELESS_ROUTE, placed after all hooks so hook order stays stable. Verified against 9 path cases including trailing slashes and /quiz/results.
0.3 Truncated card text (F-02)	Deleted line-clamp-6 from both faces; h-[13rem] → min-h-[13rem] flex-1; face scrolls for real with overflow-y-auto overscroll-contain; type steps via clamp(1.0625rem, 2.2vw, 1.5rem).
One thing worth flagging on 0.3: the faces centre with my-auto on the paragraph rather than items-center on the face. With align-items: center on a scroll container, overflow at the start edge is unreachable — the top of a long answer would have been pushed above the scrollport with no way back. Auto margins collapse to zero once content overflows, so the first line stays at the scroll origin.

Phase 1 — Token foundation
Rewrote the token layer in globals.css as two layers: the design-system tokens (--bg, --surface, --ink*, three --border*, --state-*, radius, elevation, z, motion) as the source of truth, plus a compatibility layer aliasing the inherited shadcn names onto them. That aliasing is what makes ~9,800 LOC of existing utility classes re-skin without being edited.

1.1 Full dark + light ramps from §2.1, both complete, both explicit. Three border tokens including --border-control at 3.35:1 / 3.31:1.
1.2 State channel, per theme.
1.3 Radius (2px / 6px / 999px), --elevate (inner chamfer dark, hairline shadow light), z-scale.
1.4 .glass-card redefined in place → opaque surface. Radius deliberately not set on it: these rules are unlayered and would override the rounded-* utility each call site carries — and that utility now resolves to a legal step anyway.
1.5 .glow-title / .glow-border / .neon-focus neutralised to no-ops.
1.6 Deleted 3 orbs + grain overlay from layout.tsx, 2 orbs + the radial wash from StudyStreakCard.tsx, and the .bg-orb-pulse / orb-pulse / .grain-overlay rules.
1.7 --glow and --neon deleted outright, and all 26 references fixed across 15 files.
1.8 F-10 fixed in both places — the pre-paint script in layout.tsx and readInitialTheme() in ThemeProvider.tsx. Stored choice still wins and still persists; anti-flash preserved.
1.9 components.json verified, not changed — baseColor: "neutral" is now accurate, tailwind.config: "" is correct for v4 CSS-first, and every alias resolves.
Verified in the compiled CSS: new zinc ramps present, zero occurrences of 6366f1, 818cf8, 3b82f6, 020617, 0f172a, e2e8f0.

Phase 2 — Primitives
2.1 card.tsx → .surface; bg-card/60 backdrop-blur-md border-primary/10 gone.
2.2 button.tsx rewritten (F-09). No framer-motion, no longer a client component; active:translate-y-px replaces the whileTap spring. Variants per §7.2 with --border-control edges. asChild/Slot preserved.
2.3 input.tsx / textarea.tsx → control edges, 2px --accent outline at 2px offset.
2.4–2.7 New: Kbd.tsx, CornerBrackets.tsx, StateTick.tsx, Telemetry.tsx, GradeKey.tsx, plus their CSS (.kbd, .brk, .key, .odo).
2.8 motion-configs.ts rewritten to duration/easing tokens. Exactly one spring remains (cardLeaveSpring, 260/24). All 8 import sites updated.
GradeKey computes the real SM-2 interval rather than the old hard-coded ~2m hints. I extracted that projection into grade-interval.ts — pure scheduler logic belongs in lib/, where the coverage config and test conventions already live — and covered it with 9 new unit tests. One caught my own arithmetic error: easy raises the ease factor to 2.6 before the 30% stretch, so it's 34d, not 33d. The code was right; my expectation was wrong.

tiltSpring moved into FlipCard.tsx as a local constant. Removing the cursor tilt is F-08 / Phase 4.2 and out of scope here, but motion-configs.ts had to hold exactly one spring.

Phase 3 — Typography
3.1 Poppins + Orbitron removed; Geist, Geist Mono, Instrument Serif added via next/font/google; @theme inline updated.
3.2 .glow-title and all 11 call sites deleted (the plan says 13; 11 is what exists — see drift note in §5). .glow-border (21 files) and .neon-focus (5 sites) removed with their rules. The three raw <select>/<input> elements that relied on .neon-focus got real control edges and the accent outline, so nothing lost its focus indicator.
3.3 14px chrome base, text-wrap: balance on headings, app-chrome headings capped at 28px.
3.4 Numeric readouts converted to Geist Mono + tabular-nums across 14 files, plus the label step (10px mono, 0.16em, --ink-dimmer) applied to micro-labels in 9 files.
I also applied the serif to its one sanctioned role — card prompt and answer — in FlashcardReviewClient.tsx and Flashcard.tsx. Loading a font in 3.1 and never using it would have been dead weight; the full §7.6 canvas rebuild is still Phase 4.

Metrics
Metric	Before	After
Files with banned classes	37	32 ¹
Banned icons	24	24 ²
Indigo / legacy font refs	190	0
Raw z-index values	7	0
¹ All 32 are glass-card alone — retained deliberately per Task 1.4 and renamed per-component in Phases 4–9. glow-title / glow-border / neon-focus / bg-orb-pulse / grain-overlay are at 0.
² Icon removal is assigned to Phases 4–9; no icon task was in scope for this run.

Other DoD checks: line-clamp in FlashcardReviewClient = 0; springs in motion-configs.ts = 1; blur orbs / grain = 0; all 5 new primitives present; framer-motion in button.tsx = comment only.

Final gate

$ npx tsc --noEmit && npm run lint && npm test && npm run build

> cognit@0.1.0 lint
> eslint

> cognit@0.1.0 test
> vitest run

 RUN  v4.0.18 /Users/marcsantiago/Dev/cognit

 ✓ src/lib/sse-parsing.test.ts (9 tests) 3ms
 ✓ src/lib/ai-retry.test.ts (12 tests) 11ms
 ✓ src/app/api/keep-alive/route.test.ts (4 tests) 26ms
 ✓ src/lib/starter-decks.test.ts (22 tests) 7ms
 ✓ src/app/actions/share.test.ts (13 tests) 79ms
 ✓ src/app/actions/_shared.test.ts (14 tests) 12ms
 ✓ src/app/actions/quiz.test.ts (11 tests) 108ms
 ✓ src/lib/card-generation.test.ts (20 tests) 8ms
 ✓ src/lib/pdf-chunking.test.ts (11 tests) 9ms
 ✓ src/lib/distractors.test.ts (8 tests) 3ms
 ✓ src/lib/grade-interval.test.ts (9 tests) 2ms
 ✓ src/lib/action-guard.test.ts (6 tests) 5ms
 ✓ src/lib/sm2.test.ts (7 tests) 4ms
 ✓ src/lib/next-review-summary.test.ts (7 tests) 5ms
 ✓ src/lib/parser.test.ts (6 tests) 3ms
 ✓ src/lib/dashboard-due.test.ts (2 tests) 2ms
 ✓ src/lib/supabase-errors.test.ts (9 tests) 2ms
 ✓ src/lib/server-errors.test.ts (9 tests) 2ms
 ✓ src/lib/fuzzy.test.ts (7 tests) 2ms
 ✓ src/lib/ai-feedback.test.ts (6 tests) 1ms

 Test Files  20 passed (20)
      Tests  192 passed (192)
   Start at  10:20:54
   Duration  450ms

  Running TypeScript ...
✓ Generating static pages using 7 workers (10/10) in 162.7ms

Route (app)
┌ ○ /                          ├ ƒ /dashboard/[deckId]/quiz
├ ○ /_not-found                ├ ƒ /dashboard/[deckId]/study
├ ƒ /api/chat                  ├ ○ /icon.svg
├ ƒ /api/keep-alive            ├ ○ /login
├ ƒ /auth/callback             ├ ○ /login/update-password
├ ƒ /dashboard                 ├ ○ /robots.txt
├ ƒ /dashboard/[deckId]        ├ ƒ /s/[token]
                               └ ○ /sitemap.xml
Section 2 — What to check in the browser
Start with npm run dev.

Read this first — three things will look like regressions and are not:

Buttons now have a clearly visible border. --border-control is required to hit the 3:1 minimum for non-text contrast (WCAG 2.2 SC 1.4.11). The old border-primary/20 was well under that.
Most buttons are now outlined rather than filled. §7.2 makes default the neutral outlined control and primary the filled one, because the system spends fill on one button per screen. Screens get their variant="primary" assigned as each is rebuilt in Phases 4–9, so right now no screen has its filled CTA yet.
Panels no longer light up on hover. .glow-border was a no-op after Phase 1 and is now deleted (Tasks 1.5 / 3.2), so ~21 containers lost their hover glow. Interactive containers get it back via .surface--interactive as they're rebuilt.
Now the walkthrough:

/dashboard — Confirm no purple or indigo tint anywhere; borders read as neutral grey, not blue-grey. The h1 "Dashboard" is plain Geist at 28px with no neon text-shadow. Behind the content there should be nothing — no soft coloured blobs in the corners or centre. The streak card's interior panel is a flat surface, not a gradient wash.

/dashboard/[deckId]/study — Open a session. No floating dock anywhere on the route. Open (or create) a card with a long answer, reveal it, and put the cursor over the answer face: it scrolls, the first word is visible at the top with nothing cut off above it, and there is no ellipsis. I verified this directly with a 400-word answer — the face scrolls from word1 through word400 with a visible scrollbar. The card prompt is now Instrument Serif; "Card 3 of 20" and the timer are monospaced.

/dashboard/[deckId]/quiz — Start a quiz, press P. The scrim must cover the whole viewport with no dock floating above it, and there must be no way to navigate away except through the quit confirmation. This is now fixed twice over: the overlay is at --z-overlay (100) versus the dock's --z-rail (20), so DOM order can no longer decide it, and the dock returns null on the route entirely.

Theme toggle — Switch light/dark on /dashboard, a deck page, and /study. Check specifically that no element keeps one theme's text on the other's background. Watch the grade-key top edges and the state ticks, which are the only coloured things on screen.

OS theme (F-10) — DevTools → Application → Local Storage → delete cognit-theme. Set the OS to light. Hard-reload. The app must open in light. Then toggle to dark and reload — your choice must stick. (Headless Chromium with no stored value and a light OS preference now renders the app in light; before this change it rendered dark.)

Typography — No heading is Orbitron. Every number — due counts, ease factors, timers, percentages, dates — is monospaced and column-aligned; watch the quiz timer and confirm the label beside it doesn't shift as digits change.

Primitives, if you want to see them isolated — I built a temporary harness route to review all five new primitives in both themes and deleted it before finishing; the build's route list confirms it's gone. Everything in it renders through components that are still in the tree.

Section 3 — Findings deferred
Recorded, not fixed.

Finding	Location	Owner
Grade buttons still use four arbitrary Tailwind ramps, and Easy is sky-blue — a fourth hue §2.2 forbids. GradeKey already implements the correct mapping (easy → --state-neutral). Most visible non-conformance left on the study route.	FlashcardReviewClient.tsx:71-105	Phase 4.4
The two real <kbd> elements are still hidden sm:inline-flex (F-05). The new Kbd primitive is never hidden.	FlashcardReviewClient.tsx:835,840	Phase 4.5
Grade hints are hard-coded (~2m, ~6m, done) and drift from the scheduler. projectedInterval() computes them for real.	FlashcardReviewClient.tsx:74	Phase 4.4
Cursor tilt still active on the study canvas (F-08).	FlipCard.tsx:52-55	Phase 4.2
pb-28 at 7 sites (F-03).	dashboard/layout.tsx:16, dashboard/page.tsx:285, dashboard/loading.tsx:3, [deckId]/{study,quiz}/loading.tsx:3, QuizAssessmentClient.tsx:606, FlashcardReviewClient.tsx:587	Phase 8.5
getMasteryGlowColor returns hard-coded rgba() hues — violates §2.3 ("never hard-code a hex"). --deck-glow also survives as an inline custom property, though .surface now neutralises the shadow that consumed it.	DeckGrid.tsx:22-27	Phase 6.2
30 backdrop-blur uses outside modal scrims.	26 files	Phases 4–9 / 10.6
81 rounded-full, well beyond §4.2's "avatars only". Not fixable at the token layer — it's a Tailwind builtin.	across src/	Phases 4–9
ThemeToggle carries an inline spring (stiffness: 320) and a backdrop-blur outside a scrim.	ThemeToggle.tsx:14-17	Phase 8/9
Selection-mode toggle changes variant but has no aria-pressed, so its state isn't announced.	DeckCardsManager.tsx:217	Phase 7.1
Welcome back, {user.email} renders a raw email as a greeting.	dashboard/page.tsx:295	Phase 6.8
Landing page throws a hydration mismatch under prefers-reduced-motion (framer-motion SSRs initial styles the client then skips). Confirmed pre-existing — I stashed my work, re-ran the baseline, and reproduced it.	HeroSection.tsx et al.	Phase 9.2
Section 4 — Deviations from the spec
Four, all deliberate.

I collapsed the Tailwind radius scale onto the three role-based steps (rounded-sm/md → 2px, rounded-lg/xl/2xl/3xl/4xl → 6px). Task 1.3 says only "add the tokens". But "four+ competing radii" is on the §1.1 anti-pattern list, and this is the same "keep the class name, redefine what it means" technique Task 1.4 mandates for .glass-card — 7 lines that bring 208 call sites onto a legal value instead of leaving them at five competing radii for the rest of the programme. rounded-full is unaffected (deferred above).

I migrated all 152 border-primary/* occurrences to the real border tokens. This resolves a conflict inside the prompt: Phase 1's guidance is to keep class names and let the token layer re-skin them, but the Run 1 Definition of Done requires zero border-primary/ in src/. I followed the DoD, mapping by role per §2.1 — decorative opacities → --border, enclosures and hover edges → --border-strong, controls already handled in the primitives. Without this, borders would have rendered as a faint ink wash rather than true --border zinc.

I kept three compatibility button variants (outline, secondary, link) alongside §7.2's four. 29 call sites name outline, and TypeScript caught a computed 'secondary' at DeckCardsManager.tsx:217 that my grep for literal variant="secondary" had missed. Deleting them would have meant editing feature components assigned to Phases 4–9. They're documented in-file as retained and are pruned once no call site names them.

I applied the serif to card prompt/answer in Phase 3 rather than leaving it to Phase 4.6, as explained in §1.

One near-miss worth recording: the dev server served a stale Turbopack CSS chunk containing the old lavender --accent and none of the new surface tokens. My first screenshot pass showed broken primitives and a lavender primary button, which I nearly reported as real bugs. rm -rf .next/dev .next/cache and a restart fixed it; the production build was correct throughout. Worth knowing before Run 2's first screenshot.

Section 5 — Next steps
Run 1 is complete. Phases 0, 1, 2 and 3 are done, Phase 4 is not started, and the full gate passes. All changes are in the working tree — nothing committed.

Run 2 covers Phases 4–5: the study canvas and the quiz surface.

What Run 2 should know:

Five primitives are built, tested and awaiting wiring, none of them yet used by a feature component:
GradeKey — §7.4 complete: chamfered face, 2px state edge, 1px detent, odometer roll, guarded navigator.vibrate(10), correct grade→state mapping including easy → neutral. Wire it in 4.4.
Kbd — §7.3. Apply in 4.5 and 5.1/5.2. Never hide it responsively.
StateTick, Telemetry — for 4.7 and Phase 6.
CornerBrackets — the focus idiom for 4.1's data-state contract; the .brk CSS is already in globals.css, and .flip:focus-visible .brk { border-color: var(--accent) } is the hook.
projectedInterval(grade, card) in grade-interval.ts gives the real SM-2 consequence. Use it to replace the hard-coded ~2m hints.
Motion API changed: motionSprings.* → motionTransitions.* (durations/easings). The single surviving spring is exported as cardLeaveSpring — that is the one for 4.4's card leaving the stack, and nothing else.
.key, .kbd, .brk, .odo CSS already exists in globals.css, including the 64px mobile key height for 4.8.
F-07 naming trap holds: card.front is the answer, card.back is the question. Map to prompt/answer at the boundary in 4.3.
Line-reference drift from c83c050 — the plan says 13 .glow-title call sites; 11 existed. Every other line reference in the prompt was accurate. The prompt also listed 7 raw z-index values; there were 8 (the extra one at update-password/page.tsx:70), all now removed.

One thing I could not verify myself: /dashboard, /dashboard/[deckId], /study and /quiz all require an authenticated Supabase session, and I did not create an account against your live project. I verified the study canvas by driving the real FlashcardReviewClient with mock cards through a temporary route (since removed), and the primitives and token layer in both themes the same way — but the four authenticated routes have not been looked at by a human in either theme yet. Items 1–4 of the walkthrough above are the ones that still need your eyes.



----- [IMPLEMENT FROM HERE]

# Cognit Redesign — Run 2: Study Canvas & Quiz Surface (Phases 4–5)

You are a senior product engineer with strong front-end and interaction-design judgement, working in
the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 +
Tailwind v4 (CSS-first) + Framer Motion 12 + Supabase.

Cognit is an active-recall study app: flashcards on an SM-2 spaced-repetition scheduler, timed
quizzes, and AI deck chat. A full redesign is underway. **Run 1 (Phases 0–3) is complete.** Your task
is to execute **Phases 4 and 5** — and only those.

> **If the user pasted a `## Carry-forward from Run 1` section above this prompt, read it first.**
> If not, verify Run 1 landed: `src/components/ui/Kbd.tsx`, `src/components/ui/CornerBrackets.tsx`,
> `src/components/ui/shared/GradeKey.tsx` and `src/lib/grade-interval.ts` must all exist, and
> `grep -rn "border-primary/\|font-orbitron\|font-poppins" src` must return nothing.

---

## 0. Before you write any code

### 0.1 Read these two documents in full

| Document | What it is |
|---|---|
| `COGNIT_DESIGN_SYSTEM.md` | **The visual specification.** Non-negotiable. |
| `COGNIT_REDESIGN_EXECUTION_PLAN.md` | Phase definitions, defects F-01…F-10, acceptance criteria. |

For this run you must internalise design spec **§7.3** (Kbd), **§7.4** (grade key), **§7.6**
(FlipCard, all four states), **§7.7** (corner brackets), **§7.9** (telemetry header), **§5** (motion)
and **§8** (navigation — specifically that study and quiz carry *no* navigation chrome).

From the execution plan read §2 defects **F-05, F-07, F-08** and §4 Phases 4–5.

### 0.2 The single most important instruction

> **Do not pattern-match off neighbouring code.**

~32 files still carry `glass-card` and other legacy idioms. They are **not** references — they are
the backlog. Build what `COGNIT_DESIGN_SYSTEM.md` specifies.

Precedence: this prompt → `COGNIT_DESIGN_SYSTEM.md` → existing code.

### 0.3 Confirm a green baseline

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

If red, stop and report rather than building on it.

### 0.4 Clear the Turbopack cache before any visual check

Run 1 lost time to a stale dev CSS chunk that served the *old* palette while the production build was
correct. Before your first screenshot or dev-server review:

```bash
rm -rf .next/dev .next/cache && npm run dev
```

### 0.5 Record the "before" state

```bash
grep -rc "glass-card" src --include="*.tsx" | grep -v ":0$" | wc -l          # expect 32
grep -rn "<Sparkles \|<Brain \|<Wand2 \|<Rocket " src --include="*.tsx" | wc -l   # expect 24
grep -c "glass-card" src/components/ui/shared/FlashcardReviewClient.tsx      # expect 7
grep -c "glass-card" src/components/ui/shared/QuizAssessmentClient.tsx       # expect 8
```

---

## 1. What Run 1 already built for you

**Do not rebuild any of this. Wire it in.**

| Asset | Where | Use it for |
|---|---|---|
| `GradeKey` | `ui/shared/GradeKey.tsx` | Task 4.4. §7.4-complete: chamfered face, 2px state edge, 1px detent, odometer roll, guarded `navigator.vibrate(10)`, correct grade→state mapping **including `easy → --state-neutral`**. |
| `Kbd` | `ui/Kbd.tsx` | Tasks 4.5, 5.1, 5.2, 5.3. **Never hide it responsively.** |
| `CornerBrackets` | `ui/CornerBrackets.tsx` | Task 4.1 focus idiom. `.brk` CSS exists; the hook is `.flip:focus-visible .brk { border-color: var(--accent) }`. |
| `Telemetry` | `ui/shared/Telemetry.tsx` | Task 4.7 session header. |
| `StateTick` | `ui/shared/StateTick.tsx` | Available; mainly Run 3. |
| `projectedInterval(grade, card)` | `lib/grade-interval.ts` | **Task 4.4.** Real SM-2 projection, 9 passing tests. Replaces the hard-coded `~2m` / `~6m` / `done` hints. |
| `.key` `.kbd` `.brk` `.odo` CSS | `globals.css` | Already includes the **64px mobile key height** for Task 4.8. |

**Motion API changed in Run 1.** `motionSprings.*` no longer exists. Use `motionTransitions.*`
(durations + easings). Exactly one spring survives, exported as **`cardLeaveSpring`** (260/24) — it
is for Task 4.4's card leaving the stack and **nothing else**.

**Two Run-1 details to preserve, not "clean up":**

1. In `FlashcardReviewClient`, the card faces centre using `my-auto` on the paragraph, **not**
   `items-center` on the face. This is deliberate: with `align-items: center` on a scroll container,
   overflow at the start edge is unreachable and the top of a long answer gets pushed above the
   scrollport with no way back. Auto margins collapse to zero once content overflows. **Keep this
   technique in the rebuild.**
2. `tiltSpring` was moved into `FlipCard.tsx` as a local constant so `motion-configs.ts` could hold
   exactly one spring. Task 4.2 deletes the tilt — **delete that local constant with it.**

---

## 2. What Run 2 is for

Phases 0–3 changed how Cognit *looks*. This run changes how it *works* on the two screens users
actually spend their time in.

The study canvas is where a 50-card session is won or lost, and it currently has the most
non-conformance left in the product: four arbitrary colour ramps on the grade buttons, a sky-blue
"Easy" that §2.2 forbids, hard-coded interval hints that drift from the real scheduler, two keycaps
hidden below `sm`, and a cursor tilt that stops the text plane from ever being square to the eye.

**Out of scope:** the dashboard, deck detail, modals, the navigation rail, `⌘K`. Those are Runs 3–4.
Do not start them. `pb-28` stays exactly where it is — it is Run 4's job (see §5).

---

## 3. Task list

Run `npx tsc --noEmit` after each task. Full gate at the end of each phase.

---

### PHASE 4 — Study canvas (~2 d)

Primary file: `src/components/ui/shared/FlashcardReviewClient.tsx` (836 LOC, 7 `glass-card`,
4 banned icons) and `src/components/ui/shared/FlipCard.tsx`.

#### Task 4.1 — Rebuild `FlipCard` on the `data-state` contract

Implement design spec §7.6 exactly: one `data-state` attribute (`default` / `flipping` / `graded` /
`focus`) plus `data-grade`, driving CSS — **not** conditional class strings.

- `min-height`, never a fixed height. Content grows; it does not clamp.
- The `graded` state runs the 160ms `commit` flash keyed to `data-grade`.
- Focus draws `CornerBrackets`, never a ring.
- Preserve the Run 1 scroll-centering technique (§1 above).
- Everything disabled under `prefers-reduced-motion`.

#### Task 4.2 — Remove cursor tilt (defect F-08)

`FlipCard.tsx:52-55` still applies ±8° spring-damped `rotateX`/`rotateY` tracking the pointer. On a
surface the user is reading, the text plane is never square to the eye and never still — the largest
single contributor to the "floaty" quality.

Remove it from the study canvas, along with the local `tiltSpring` constant, the `mouseX`/`mouseY`
motion values, the `supportsCursorTilt` state and the `hover: hover` media-query effect.

**Keep the tilt in `src/components/ui/shared/Flashcard.tsx`** — that is the marketing demo, where the
card is a showpiece rather than a reading surface. If the tilt logic is shared, move it there.

#### Task 4.3 — `prompt` / `answer` props (defect F-07)

> **The naming trap.** In this schema `card.front` is the **answer** and `card.back` is the
> **question**. Verified in `actions/quiz.ts:66-67`, `MCQMode.tsx:61`, `s/[token]/page.tsx:152`. The
> convention is consistent, so it is not a bug — but the field names lie, and anyone reading `front`
> as "the side you see first" will invert every deck in the product.

`FlipCard` and every study/quiz component must expose **`prompt` / `answer`**, mapped at the boundary:

```tsx
<FlipCard prompt={card.id_question ?? card.back} answer={card.front} />
```

Do **not** rename the database columns. Never expose `front` / `back` in a component API.

#### Task 4.4 — The grade deck

Replace the four-button grid at `FlashcardReviewClient.tsx:71-105` with `GradeKey`.

- The `GRADE_BUTTONS` array with its four arbitrary Tailwind ramps goes away entirely. `GradeKey`
  already implements the correct mapping — `again → lapsed`, `hard → due`, `good → mastered`,
  **`easy → neutral` (colourless on purpose; do not "fix" this by giving Easy a hue).**
- Replace hard-coded `~2m` / `~6m` / `done` hints with **`projectedInterval(grade, card)`**, so each
  key shows the real SM-2 consequence before the user commits.
- **The deck is always mounted.** Before reveal it is inert (reduced opacity, not interactive);
  after reveal it is live. It must **not** mount/unmount, because that is what causes the current
  layout shift when an answer is revealed.
- The card leaving the stack uses `cardLeaveSpring`. Nothing else gets a spring.

#### Task 4.5 — Make every binding visible (defect F-05)

`FlashcardReviewClient.tsx:835,840` still has the only two real `<kbd>` elements in the app, both
`hidden sm:inline-flex`.

Replace with the `Kbd` primitive, bound to the control it triggers rather than listed in a footer
strip: `Space` on the reveal affordance, `1`–`4` on their respective grade keys. **Visible at every
breakpoint** — a mobile user with a hardware keyboard benefits from knowing it works.

#### Task 4.6 — The card prompt

Serif (`--font-serif`), `clamp(1.5625rem, 2.4vw, 2.125rem)`, `line-height: 1.32`, **`max-width: 32ch`**,
centred, `text-wrap: balance`. It grows with content and scrolls when it must; it never clamps.

Run 1 already applied the serif here — verify the measure and scale now match §7.6.

#### Task 4.7 — Session telemetry header

Per §7.9, using `Telemetry`: deck breadcrumb, card N/total, ease factor, elapsed, and a visible `P`
keycap. Mono, `tabular-nums`, uppercase micro-labels. A 1px progress rule beneath it.

Values take a state colour only when the value *is* a state.

#### Task 4.8 — Mobile

**The grade deck is the bottom chrome.** 64px keys (CSS already present) inside
`env(safe-area-inset-bottom)`, thumb-reachable, with nothing floating above them. No bottom bar, no
dock — `DockNav` already returns `null` on this route from Run 1 Task 0.2.

**Phase 4 acceptance**
- Revealing an answer causes **no layout shift** — verify CLS ≈ 0 in DevTools Performance.
- A 400-word answer is fully readable, first word visible at the top, nothing cut off.
- `Space` and `1`–`4` work and are visible at 390px width.
- Each grade key shows its real projected interval, and Easy carries no hue.
- Reduced motion disables flip, spring and odometer.
- Full gate passes.

---

### PHASE 5 — Quiz surface (~1.5 d)

Primary file: `src/components/ui/shared/QuizAssessmentClient.tsx` (1040 LOC, 8 `glass-card`,
3 banned icons, 26 ad-hoc radii), plus `MCQMode.tsx` and `IdentificationMode.tsx`.

#### Task 5.1 — MCQ options

`MCQMode.tsx:230` renders the plain body text *"Press 1-{n} to choose an option."* The binding is
**real** — it is implemented at `MCQMode.tsx:88` — it is simply never shown as a key.

Replace with per-option `Kbd` numerals on the options themselves. Options follow the `.opt` pattern:
`--border-control` edge, `--surface` fill, `--radius-control`, correct/wrong states in
`--state-mastered` / `--state-lapsed`, unselected options dimmed after answering.

#### Task 5.2 — Identification mode

Input per the Run 1 primitive (control edge, 2px `--accent` outline at 2px offset). A visible `Enter`
keycap on the submit affordance.

#### Task 5.3 — Surface the pause binding (defect F-05)

`P` is bound at `QuizAssessmentClient.tsx:414` and **shown nowhere in the UI**. Put a `Kbd` `P` in
the quiz telemetry header next to the timer.

#### Task 5.4 — Overlays

Pause overlay and quit dialog onto the z-scale (already moved in Run 1 — verify, don't redo). Style
per §7.8. The scrim may keep `backdrop-filter: blur(4px)` — **modal scrims are the only permitted
blur in the product.**

#### Task 5.5 — Inline result feedback

The explanation appears inline at the point of error, not in a modal, and never blocks the next
keypress. `Space` advances to the next question (already bound at `MCQMode.tsx:117`) — show it.

#### Task 5.6 — Clear the legacy idioms

In the three quiz files: 8 `glass-card` → `.surface`, 3 banned icons removed (a count or label beats
a glyph), ad-hoc radii onto the three role-based steps, any `backdrop-blur` outside the modal scrim
removed.

**Phase 5 acceptance**
- A 20-question quiz completes end-to-end **on keyboard alone**, and every key used is visible.
- Pause / resume / quit guards behave; the scrim cannot be escaped except through the confirmation.
- Both themes.
- Full gate passes.

---

## 4. Assign the primary CTA

Run 1 rebuilt `Button` so `default` is the neutral outlined control and `primary` is the filled one,
but **no screen has been given its filled CTA yet** — that is assigned as each screen is rebuilt.

This run owns two screens. Give each exactly **one** `variant="primary"`:

- **Study:** the reveal affordance ("Show answer") before reveal.
- **Quiz:** the primary continue/submit action.

One filled button per screen. If you find yourself wanting two, one of them is not primary.

---

## 5. Rules that apply throughout

- **Do not expand scope.** Problems outside Phases 4–5 go in the report under *Findings deferred*.
- **`pb-28` is not yours.** It survives at 7 sites and is Run 4 Task 8.5. The dock still exists on
  other routes; removing clearance now would push content underneath it.
- **`.glass-card` outside the study/quiz files is not yours.** Convert only the 15 occurrences in the
  three files this run owns.
- **Do not claim success without running the command.** Paste real output.
- **When this prompt and the code disagree, stop and report.** Line references are against the
  post-Run-1 tree. If one has drifted, find the construct by name, note the drift, continue.
- **Never commit.** Leave changes in the working tree.
- **Preserve working accessibility** — the reduced-motion guard, skip link and `aria-live` regions.
- **Server components stay server components.**

---

## 6. Required completion report

Five sections, exactly.

### Section 1 — What I did

Per phase, per task: what changed, in which files. Include:

| Metric | Before | After |
|---|---:|---:|
| Files with `glass-card` | 32 | ? |
| `glass-card` in the 3 quiz/study files | 15 | 0 expected |
| Banned icons | 24 | ? |
| Springs in `motion-configs.ts` | 1 | 1 expected |

Paste the real terminal output of the final full gate.

### Section 2 — What to check in the browser

**Written for a human reviewer.** `rm -rf .next/dev .next/cache && npm run dev` first (§0.4).
Numbered walkthrough: route, action, what should now be visibly true.

Cover at minimum:

1. **`/dashboard/[deckId]/study`** — the grade deck is present *before* reveal in an inert state, and
   revealing an answer moves nothing on screen. Each key shows a real interval (not `~2m`), and
   **Easy is colourless** while Again/Hard/Good carry red/orange/green.
2. **Cursor tilt is gone** — move the mouse across the card; it must stay flat and still.
3. **Long answer** — reveal a 400-word answer: full text reachable, first word at the top, no ellipsis.
4. **Keyboard, desktop and at 390px** — `Space` reveals, `1`–`4` grade, and every one of those keys is
   *visible* on screen at both widths.
5. **`/dashboard/[deckId]/quiz`** — MCQ options carry visible `1`–`4` keycaps; `P` is visible in the
   header; pausing shows a scrim that cannot be escaped except via the confirmation.
6. **Mobile study at 390px** — the grade deck is the bottom chrome, 64px keys, nothing floating above
   it, and the keys clear the home indicator.
7. **Both themes** on both routes.

Flag anything a reviewer might mistake for a regression.

### Section 3 — Findings deferred

Anything noticed but correctly not fixed, with `file:line` and the owning phase.

### Section 4 — Deviations from the spec

Where you departed from `COGNIT_DESIGN_SYSTEM.md` or this prompt, and why. If none, say so.

### Section 5 — Next steps

State that Run 2 is complete and Run 3 (Phases 6–7: dashboard, deck detail, modals) is next. List
what Run 3 must know — particularly any primitive whose API you changed, anything you learned about
`StateTick` / `Telemetry` in real use, and any line-reference drift.

---

## 7. Definition of done

- [ ] Phases 4 and 5 complete; Phase 6 **not** started.
- [ ] Full gate passes, output pasted.
- [ ] No layout shift on answer reveal (CLS ≈ 0).
- [ ] `grep -c "glass-card"` returns 0 for `FlashcardReviewClient.tsx`, `QuizAssessmentClient.tsx`,
      `MCQMode.tsx`, `IdentificationMode.tsx`.
- [ ] No `line-clamp` and no cursor tilt on the study canvas; tilt still present in `Flashcard.tsx`.
- [ ] `GRADE_BUTTONS` and its four Tailwind ramps are gone; `GradeKey` is wired.
- [ ] Grade hints come from `projectedInterval()`, not string literals.
- [ ] No component prop named `front` or `back`.
- [ ] Every binding in design spec §7.3 that applies to study/quiz renders a visible `Kbd`.
- [ ] `backdrop-blur` in these files exists only on the modal scrim.
- [ ] Exactly one `variant="primary"` per screen.
- [ ] Both routes reviewed by you in **both** themes before writing the report.
