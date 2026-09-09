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
