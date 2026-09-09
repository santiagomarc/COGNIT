# Cognit Redesign — Run 1: Foundation (Phases 0–3)

You are a senior product engineer with strong front-end and interaction-design judgement, working in
the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 +
Tailwind v4 (CSS-first) + Framer Motion 12 + Supabase.

Cognit is an active-recall study app: flashcards on an SM-2 spaced-repetition scheduler, timed
quizzes, and AI deck chat. It has just completed a design review. Your task is to execute
**Phases 0 through 3** of the approved redesign — and **only** those four phases.

---

## 0. Before you write any code

### 0.1 Read these two documents in full

| Document | What it is |
|---|---|
| `COGNIT_DESIGN_SYSTEM.md` | **The visual specification.** Non-negotiable. Palettes, type, tokens, component specs. |
| `COGNIT_REDESIGN_EXECUTION_PLAN.md` | Phase definitions, the 10 verified defects, acceptance criteria. |

Read **all** of `COGNIT_DESIGN_SYSTEM.md`. At minimum you must internalise §1.1 (the anti-pattern
list), §2 (colour, both themes), §3 (typography), §4 (space, radius, elevation, z-scale) and §10
(stack-specific implementation notes).

From the execution plan, read §2 (defects F-01 through F-10) and §4 Phases 0–3.

### 0.2 The single most important instruction

> **Do not pattern-match off neighbouring code.**

Roughly 48 files (~9,800 LOC) currently contradict the new design system. If you open a file and see
`glass-card`, `glow-title`, `border-primary/10`, `backdrop-blur`, an indigo accent or a `<Sparkles/>`
icon, that file **has not been migrated yet**. It is not a reference. Build what
`COGNIT_DESIGN_SYSTEM.md` specifies.

Precedence, highest first: an explicit instruction in this prompt → `COGNIT_DESIGN_SYSTEM.md` →
whatever the existing code does.

### 0.3 Confirm a green baseline before touching anything

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

If the baseline is already red, **stop and report that** rather than working on top of it.

### 0.4 Record the "before" state

You will need these numbers for your report. Run and save the output:

```bash
grep -rc "glass-card\|glow-title\|glow-border\|neon-focus\|bg-orb-pulse\|grain-overlay" src --include="*.tsx" --include="*.css" | grep -v ":0$" | wc -l
grep -rn "<Sparkles \|<Brain \|<Wand2 \|<Rocket " src --include="*.tsx" | wc -l
grep -rn "border-primary/\|font-orbitron\|font-poppins\|--glow\|--neon" src | wc -l
grep -rn "z-50\|z-\[1[0-9]0\]\|z-\[200\]" src --include="*.tsx" | wc -l
```

Expected at baseline `c83c050`: **37 files, 24 icons, 190 references, 7 raw z-index.**

*(Optional but recommended)* Capture before/after screenshots. A headless Chromium is already on this
machine:

```
~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=6000 --window-size=1440,900 \
  --screenshot=before-dashboard.png "http://localhost:3000/dashboard"
```

---

## 1. What Run 1 is for

Two things, in this order.

**First, stop the bleeding.** Two defects found during the review are functional bugs that cost users
real study progress. They are independent of any visual decision and ship first.

**Second, lay the foundation.** Phases 1–3 replace the token layer, the primitives and the type
stack. They are deliberately grouped because they are tightly coupled — new tokens without new
primitives looks broken, and new primitives without the new typography is half-done.

By the end of this run the app should already **read as redesigned** on every route, even though no
feature component has been individually rebuilt yet. That is the intended leverage: the `Card`
primitive and the `.glass-card` rule are shared by ~90% of the UI.

**Out of scope for this run:** the study canvas rebuild, the quiz surface, the dashboard
recomposition, deck rows, the navigation rail, `⌘K`. Those are Runs 2–4. Do not start them.

---

## 2. Task list

Run `npx tsc --noEmit` after each task. Run the full gate at the end of each **phase**.

---

### PHASE 0 — Blocking defects (~0.5 d)

Ships independently of everything else. Complete and verify this phase before starting Phase 1.

#### Task 0.1 — Fix the z-index collision (defect F-01)

`DockNav` is `fixed … z-50` (`DockNav.tsx:58`). The quiz pause overlay is also `fixed inset-0 z-50`
(`QuizAssessmentClient.tsx:997`). Because `dashboard/layout.tsx:16-19` renders `{children}` *before*
`<DockNav/>`, equal z-index resolves in DOM order — the dock paints on top of the scrim and stays
clickable. Its Dashboard link is a plain `<Link>`, so it bypasses `requestQuit()` entirely.

1. Add the z-scale from design spec §4.4 to `src/app/globals.css`:
   `--z-rail: 20; --z-sticky: 40; --z-overlay: 100; --z-modal: 110; --z-toast: 120; --z-skip: 200;`
2. Move `DockNav` to `--z-rail`, the quiz pause overlay to `--z-overlay`, `ConfirmDialog`
   (`z-[100]`) to `--z-modal`, `BulkImportModal` and `SemanticSearchModal` (`z-[110]`) to
   `--z-modal`, the theme fade overlay (`z-140`) to `--z-overlay`, the skip link to `--z-skip`.
3. No raw `z-50` / `z-[100]` / `z-[110]` / `z-[200]` may remain in `src/`.

#### Task 0.2 — Remove navigation chrome from study and quiz routes

`DockNav` should return `null` on `/dashboard/[deckId]/study` and `/dashboard/[deckId]/quiz`. Use the
existing `usePathname()` already imported in that file.

#### Task 0.3 — Fix truncated card text (defect F-02)

`FlashcardReviewClient.tsx:768` and `:773` each render
`<p className="line-clamp-6 text-lg leading-relaxed">` inside a parent with `overflow-y-auto`.
`line-clamp` puts `overflow: hidden` on the paragraph, so it never overflows its parent — the
parent's scroll has nothing to scroll and the text is **truncated and unreachable**.

1. Delete `line-clamp-6` from both faces.
2. Replace the fixed `h-[13rem]` face with `min-height`, and let the face scroll for real
   (`overflow-y: auto; overscroll-behavior: contain`).
3. Step the type with content length: `font-size: clamp(1.0625rem, 2.2vw, 1.5rem)`.

Cognit generates cards from PDFs — long answers are the norm, not the edge case.

**Phase 0 acceptance**
- Pause a quiz → the scrim covers the full viewport; no dock visible or clickable above it.
- Open a study session → no dock on the route at all.
- A card with a 400-word answer is fully readable by scrolling inside the face.
- Full gate passes.

---

### PHASE 1 — Token foundation (~1 d)

The highest-leverage phase in the entire programme.

> **Critical technique: keep every existing class name; redefine what it means.**
> Do **not** rename `.glass-card` call sites in this phase. Redefine the rule itself. All 57 call
> sites then change appearance without being edited, and the diff stays reviewable.

#### Task 1.1 — Replace the colour layer

In `src/app/globals.css`, replace the `:root` and `.dark` blocks with the complete ramps from design
spec §2.1. Both themes, fully specified, every token declared in both.

Non-negotiables:
- **Three** border tokens: `--border` (decorative), `--border-strong` (enclosure/hover) and
  `--border-control` (interactive edges, must stay ≥3:1 — WCAG 1.4.11).
- `--ink-faint` is **non-text only** in both themes. Never use it for a character a user reads.
- The `--elevate` token differs by theme: an inner chamfer in dark, a hairline drop shadow in light.

#### Task 1.2 — Add the SM-2 state channel

`--state-due`, `--state-learning`, `--state-mastered`, `--state-lapsed`, `--state-streak`,
`--state-neutral`, per theme, per design spec §2.2. These are the **only** source of hue in the
product.

#### Task 1.3 — Add radius, elevation and z-scale tokens

Per §4.2–4.4. Three radii only: `--radius-control: 2px`, `--radius-container: 6px`,
`--radius-pill: 999px`.

#### Task 1.4 — Redefine `.glass-card` in place

Point it at the opaque `.surface` recipe from §7.1. Nothing else changes yet.

#### Task 1.5 — Neutralise the glow classes

Make `.glow-border`, `.glow-title` and `.neon-focus` no-ops. (They get deleted for real in Phase 3 —
neutralising first keeps this phase's diff small and reversible.)

#### Task 1.6 — Delete the decorative layers

- The 3 blur orbs in `src/app/layout.tsx`
- The 2 blur orbs and the radial gradient wash in `StudyStreakCard.tsx`
- The `.bg-orb-pulse` rule and `@keyframes orb-pulse`
- The `.grain-overlay` rule and its `<div>` in `layout.tsx`

#### Task 1.7 — Delete `--glow` and `--neon`

Remove the variables entirely so nothing can reintroduce the effect. Fix any resulting references.

#### Task 1.8 — Honour the OS theme on first visit (defect F-10)

`src/app/layout.tsx:71`'s inline script reads `localStorage` and falls through to dark for anything
that is not `'light'` — `prefers-color-scheme` is never consulted. `ThemeProvider.tsx:24-31` defaults
to `'dark'` the same way.

Light mode is a **retained, first-class theme**, so a light-OS visitor's first impression is
currently the wrong theme. Fix both places: with no stored value, follow `prefers-color-scheme`. An
explicit user choice must still win and still persist to `localStorage['cognit-theme']`.

Preserve the existing anti-flash behaviour — the inline script must still run before first paint.

#### Task 1.9 — Correct the shadcn base colour

`components.json` declares `"baseColor": "neutral"` while the variables were slate-with-indigo. After
Task 1.1 that declaration is finally accurate — verify it, and confirm nothing else in that file is
stale.

**Phase 1 acceptance**
- No indigo anywhere. Borders are true zinc.
- **Both themes** reviewed on dashboard, deck detail, study and quiz.
- A first-time visitor on a light-mode OS lands in light mode; toggling still persists.
- Full gate passes.

---

### PHASE 2 — Primitives (~1 d)

#### Task 2.1 — `src/components/ui/card.tsx`

Currently hardcodes `bg-card/60 backdrop-blur-md border-primary/10`. **This is the single
highest-leverage file in the repo.** Convert to the opaque surface recipe (§7.1).

#### Task 2.2 — `src/components/ui/button.tsx` (defect F-09)

Returns an `m.button` with a `whileTap` spring, pulling the Framer Motion runtime into every page
that renders a button — including otherwise static server-rendered pages.

Replace with a CSS `:active` transform. Implement the variants in §7.2 (`default`, `primary`,
`ghost`, `destructive`). Control edges use `--border-control`, not `--border-strong`.

Keep the `asChild` / Radix `Slot` path working.

#### Task 2.3 — Inputs

`input.tsx` and `textarea.tsx`: `--border-control` edges, a 2px `--accent` focus ring at 2px offset.
Remove `neon-focus` usage.

#### Task 2.4 — **New** `src/components/ui/Kbd.tsx`

Per §7.3. Cognit has **8 keyboard bindings** and currently renders **2** keycaps, both
`hidden sm:inline-flex`. This primitive is how that gets fixed in Run 2.

Build it now; apply it broadly in Run 2. It must never be hidden responsively.

#### Task 2.5 — **New** `StateTick` and `Telemetry`

- `StateTick` — a 2px × 16px state-coloured bar (§7.5).
- `Telemetry` — an uppercase mono label plus a `tabular-nums` mono value (§7.9).

#### Task 2.6 — **New** `src/components/ui/shared/GradeKey.tsx`

Per §7.4 — the tactile exception. Chamfered face, 2px state edge along the top, 1px travel on press,
real computed SM-2 interval, keycap digit in `--ink-dimmer` (**not** `--ink-faint`, which fails as
text).

Grade → colour mapping, including the deliberate asymmetry:
`again → lapsed`, `hard → due`, `good → mastered`, **`easy → neutral` (colourless on purpose)**.

Include the odometer interval roll and a guarded `navigator.vibrate(10)` on touch. Both must respect
`prefers-reduced-motion`.

Build and unit-test it now; wire it into the study canvas in Run 2.

#### Task 2.7 — **New** `CornerBrackets`

Per §7.7. Four 14px corners, 1px, `90ms linear` transition. This is the system's focus idiom —
never a glowing ring.

#### Task 2.8 — Rewrite `src/lib/motion-configs.ts`

Nine spring presets become duration/easing tokens per design spec §5. **Exactly one spring survives**
— the card leaving the stack (`stiffness 260, damping 24`). Everything else is a duration and a curve.

Update every import site so the build stays green.

**Phase 2 acceptance**
- Every primitive renders correctly in both themes with a visible focus state.
- No component imports `framer-motion` solely for a tap effect.
- Full gate passes.

---

### PHASE 3 — Typography (~0.5 d)

#### Task 3.1 — Swap the font stack

In `src/app/layout.tsx`, remove the `Poppins` and `Orbitron` imports and their CSS variables. Add via
`next/font/google`: **Geist** (`--font-sans`), **Geist Mono** (`--font-mono`), **Instrument Serif**
(`--font-serif`). Update the `@theme inline` block in `globals.css`.

#### Task 3.2 — Delete `.glow-title`

The rule and all 13 call sites. Replace with weight and tracking (`font-semibold tracking-[-.03em]`).
Also delete the now-neutralised `.glow-border` and `.neon-focus` rules and their call sites.

#### Task 3.3 — Apply the type scale

Per §3.3. Application chrome drops to a **14px** base. Headings cap at 28px — density beats scale in
this system. Headings get `text-wrap: balance`.

#### Task 3.4 — Convert every numeric readout to mono

Counts, due totals, ease factors, intervals, timers, percentages, dates, keycaps. Geist Mono +
`font-variant-numeric: tabular-nums`, without exception.

The serif is used **only** for card prompts and answers — nowhere else, ever.

**Phase 3 acceptance**
- No `--font-orbitron` / `--font-poppins` / `glow-title` references remain.
- Full gate passes.

> **Watch for this:** Poppins is wider than Geist, so line lengths shift. Re-check truncation on deck
> names, the telemetry header and table cells after the swap.

---

## 3. Rules that apply throughout

- **Do not expand scope.** If you spot a problem outside Phases 0–3, record it in the report under
  *Findings deferred*. Do not fix it.
- **Do not claim success without running the command.** Every gate must actually be executed and its
  real output pasted into the report.
- **When this prompt and the code disagree, stop and report.** Line references are against `c83c050`.
  If one has drifted, find the construct by name, note the drift, and continue — never guess at
  intent.
- **Never commit.** Leave all changes in the working tree.
- **Preserve accessibility that already works.** The reduced-motion guard in `globals.css`, the
  skip-to-content link and existing `aria-live` regions are good. Do not regress them.
- **Server components stay server components.** Do not add `'use client'` to make styling easier.

---

## 4. Required completion report

End your run by producing a report with **exactly** these five sections. The user will paste it above
the Run 2 prompt, so it is the only state that survives between conversations.

### Section 1 — What I did

Per phase, per task: what changed and in which files. Include the before/after idiom counts from
§0.4:

| Metric | Before | After |
|---|---:|---:|
| Files with banned classes | 37 | ? |
| Banned icons | 24 | ? |
| Indigo / legacy font refs | 190 | ? |
| Raw z-index values | 7 | ? |

Paste the real terminal output of the final
`npx tsc --noEmit && npm run lint && npm test && npm run build`.

### Section 2 — What to check in the browser

**This section is for a human reviewer, so write it for one.** Start the dev server (`npm run dev`)
and give a numbered walkthrough. For each item state **the route, the action, and what should now be
visibly true.** Be concrete — "the border is zinc, not indigo" beats "styling updated".

Cover at minimum:

1. **`/dashboard`** — no purple/indigo tint anywhere; no glowing heading; no blurred orbs behind the
   content; borders read as neutral grey.
2. **`/dashboard/[deckId]/study`** — open a session. No floating dock on the route. Open a card with
   a long answer and confirm the full text is reachable by scrolling.
3. **`/dashboard/[deckId]/quiz`** — start a quiz, press `P` to pause. The scrim must cover the whole
   viewport with **no dock floating above it**, and there must be no way to navigate away without the
   quit confirmation.
4. **Theme toggle** — switch light/dark on three different routes. Both must be fully legible; no
   element may keep one theme's text on the other theme's background.
5. **OS theme** — clear `localStorage` (DevTools → Application → Local Storage → delete
   `cognit-theme`), set the OS to light, hard-reload. The app must open in **light** mode.
6. **Typography** — headings are no longer Orbitron; every number (due counts, ease factors, timers)
   is monospaced and column-aligned.

Flag anything you changed that a reviewer might mistake for a regression — for example, buttons now
have a **more visible** border because `--border-control` is required to meet a 3:1 contrast minimum.

### Section 3 — Findings deferred

Anything you noticed but correctly did not fix, with file:line. These feed later runs.

### Section 4 — Deviations from the spec

Anywhere you departed from `COGNIT_DESIGN_SYSTEM.md` or this prompt, and why. If there were none,
say so explicitly.

### Section 5 — Next steps

State plainly that Run 1 is complete and Run 2 (Phases 4–5: study canvas and quiz surface) is next.
List anything Run 2 must know — particularly which primitives from Task 2.4–2.7 are built and
awaiting wiring, and any drift you found in the line references.

---

## 5. Definition of done for this run

- [ ] Phases 0, 1, 2 and 3 complete; Phase 4 **not** started.
- [ ] `npx tsc --noEmit && npm run lint && npm test && npm run build` passes, output pasted.
- [ ] No raw `z-50` / `z-[100]` / `z-[110]` / `z-[200]` in `src/`.
- [ ] No `--glow`, `--neon`, `border-primary/`, `font-orbitron`, `font-poppins` in `src/`.
- [ ] No `line-clamp` in `FlashcardReviewClient.tsx`.
- [ ] No blur orbs or grain overlay anywhere.
- [ ] `Kbd`, `StateTick`, `Telemetry`, `GradeKey`, `CornerBrackets` exist and render in both themes.
- [ ] Exactly one spring remains in `motion-configs.ts`.
- [ ] Every route reviewed by you in **both** themes before writing the report.
- [ ] The report contains all five sections, including the browser walkthrough.
