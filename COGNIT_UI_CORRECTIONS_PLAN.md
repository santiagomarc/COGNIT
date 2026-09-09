# Cognit — UI Corrections Plan (Rev. B)

**Status:** Approved by the product owner 2026-09-09, after reviewing the completed redesign programme
**Supersedes:** parts of `COGNIT_DESIGN_SYSTEM.md` Rev. A — see §1.5
**Repository:** `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router), React 19, Tailwind v4
(CSS-first, no `tailwind.config.js`), Framer Motion 12, Supabase
**Estimate:** ~4 engineering days across 5 fix packs

---

## 0. How to use this document

**This document is self-contained.** Every colour, size and CSS rule you need is written out here. You
do not need any prior conversation. You should still read `COGNIT_DESIGN_SYSTEM.md` for context, but
**where this document and that one disagree, this document wins** — and Fix Pack 0 makes you update
that document so they stop disagreeing.

Written to be executed by any capable coding agent (Claude, Gemini, GPT) with filesystem access to
the repo.

### Working rules

- Run `npx tsc --noEmit` after each task; the full gate after each fix pack:
  ```bash
  npx tsc --noEmit && npm run lint && npm test && npm run build
  ```
- **Clear the Turbopack cache before any visual check** — a stale dev CSS chunk has burned two
  sessions on this project already:
  ```bash
  rm -rf .next/dev .next/cache && npm run dev
  ```
- **Never commit** unless asked. Leave work in the tree.
- **Do not claim success without running the command.** Paste real output in your report.
- If this plan and the code disagree, find the construct by name, note the drift, continue.

---

## 1. What went wrong, and why

The redesign programme executed the specification faithfully. **The specification was wrong in four
places.** This is a design correction, not a bug fix — do not go looking for agent errors.

### 1.1 The density rule was applied to sparse screens

Rev. A's thesis says *"almost nothing is filled — structure is carried by 1px rules"* and *"density is
the aesthetic."*

That is correct for the **dashboard**, where a deck table full of numbers supplies the composition.
It is **wrong for the login page**, which has perhaps forty words on it. On a sparse screen "nothing
is filled" does not read as disciplined — it reads as **empty**. There is no information density to
carry the layout, so removing fill and shadow leaves text floating on a void.

**Correction:** the fill rule is now scoped. Dense surfaces stay flat. **Sparse surfaces get a
contained, elevated panel.** See §2.3.

### 1.2 Radius was a constant when it needed to be a scale

Rev. A set `--radius-control: 2px` and `--radius-container: 6px` and applied them everywhere.

2px is right on a 20px keycap, where the corner is a tenth of the element. On a **48px-tall, 640px-wide
input** the same 2px is invisible — the element reads as a raw rectangle, and the whole page acquires
a hard, unfinished quality.

Corner radius has to be roughly proportional to the element's **smaller dimension** — about 12–15% of
height, capped at the top end. One constant cannot serve a 3px tick and a 480px modal.

**Correction:** a five-step radius scale keyed to element size. See §2.1.

### 1.3 Geist has no voice as a display face

Geist is Vercel's system grotesque. It is a *deliberately* neutral face — that is its design brief.
At heading weights it is indistinguishable from Helvetica or Arial to most viewers, which is exactly
the reaction it got.

Rev. A also confined Instrument Serif to card prompts only ("never used for anything else, ever"),
which protected the serif's specialness at the cost of leaving every other surface characterless.

**Correction:** Instrument Serif is promoted to the **display face for headings ≥24px**. Geist stays
for UI chrome and body. See §2.2.

### 1.4 The dashboard prompt contradicted the approved mockup

The approved mockup put recall-accuracy and streak panels in a **right rail, visible at first paint**.
The Run 3 prompt said *"demote below the deck index — they are retrospective, not actionable,"* and the
implementation did exactly that. The result is a single-column stack where the fold is consumed by the
due band and twelve deck rows, and the metrics are never seen.

**Correction:** two-column dashboard, metrics above the fold. See §4.

### 1.5 What this document changes in `COGNIT_DESIGN_SYSTEM.md`

| Rev. A section | Change |
|---|---|
| §1 thesis, principle 1 | Scoped — flat applies to *dense* surfaces; sparse surfaces get panels |
| §3.2 type roles | Instrument Serif promoted to display face ≥24px |
| §4.2 radius | Replaced by a five-step scale |
| §4.3 elevation | Replaced by a three-step scale |
| §7.6 FlipCard | Card has **no fill and no border** — corner brackets only |
| §7.2 Button | "One primary per screen" no longer forces a filled button onto the study canvas |

Everything else in Rev. A stands — the palette, the state channel, the z-scale, the accessibility
contract, and the entire anti-pattern list (§1.1). **Do not reintroduce orbs, glow, sparkles,
backdrop-blur outside modal scrims, or indigo.** None of that is being reversed.

---

## 2. The corrected token layer

All of these go in `src/app/globals.css`.

### 2.1 Radius — five steps, keyed to element size

```css
:root {
  --radius-xs:   4px;   /* < 24px tall: ticks, keycaps, micro-chips        */
  --radius-sm:   6px;   /* 24-40px: buttons, small controls, options       */
  --radius-md:   8px;   /* 40-56px: inputs, list rows, grade keys          */
  --radius-lg:  12px;   /* panels, bands, cards, the due-now band          */
  --radius-xl:  16px;   /* modals, the login panel, large containers       */
  --radius-pill: 999px; /* avatars and status pills only                   */
}
```

**The rule:** pick the step whose range contains the element's *height*. When in doubt, a corner
should be ~12–15% of the element's smaller dimension.

Rev. A's `--radius-control` and `--radius-container` must keep working — dozens of call sites use
them. Alias them:

```css
--radius-control: var(--radius-sm);
--radius-container: var(--radius-lg);
```

And remap the Tailwind scale so utility classes land on legal steps:

```css
--radius-sm-tw:  var(--radius-xs);   /* rounded-sm  */
--radius-md-tw:  var(--radius-sm);   /* rounded-md  */
--radius-lg-tw:  var(--radius-md);   /* rounded-lg  */
--radius-xl-tw:  var(--radius-lg);   /* rounded-xl  */
--radius-2xl-tw: var(--radius-lg);   /* rounded-2xl */
--radius-3xl-tw: var(--radius-xl);   /* rounded-3xl */
```

> Wire these into the existing `@theme inline` block the same way Run 1 did — find how
> `--radius-sm … --radius-4xl` are currently aliased and replace those values. Do not add a
> `tailwind.config.js`.

### 2.2 Typography — the serif becomes the display face

Faces are unchanged and already load correctly in `src/app/layout.tsx`:
`Geist`, `Geist_Mono`, `Instrument_Serif` via `next/font/google`.

**New role assignment:**

| Face | Used for |
|---|---|
| **Instrument Serif** | **All display type ≥24px** — page titles, section headings, the card prompt and answer, empty-state headlines, marketing headlines |
| **Geist Sans** | UI chrome, body copy, buttons, labels, table text, anything **<24px** |
| **Geist Mono** | Every number the user reads as data — counts, ease factors, intervals, timers, percentages, dates — plus keycaps and uppercase micro-labels |

**The 24px rule exists for a reason:** Instrument Serif ships only at weight 400. Above ~24px that
reads as elegant and deliberate. At 16px a 400-weight serif heading looks weak next to 14px Geist
body, so small headings stay Geist at weight 600.

**Big numeric metrics stay mono.** The "519 due" figure is *data*, not a heading. Do not set it in
serif.

```css
/* display steps — Instrument Serif */
--type-display-lg: 2.75rem;   /* 44px — page hero, login brand      */
--type-display:    2rem;      /* 32px — page title (h1)             */
--type-display-sm: 1.5rem;    /* 24px — section heading (h2)        */

/* chrome steps — Geist Sans */
--type-h3:   1rem;      /* 16px, weight 600  */
--type-body: 0.875rem;  /* 14px              */
--type-sm:   0.8125rem; /* 13px              */
--type-cap:  0.75rem;   /* 12px              */
--type-label:0.625rem;  /* 10px, mono, uppercase, 0.16em */
```

Display type gets `letter-spacing: -0.015em` and `text-wrap: balance`. Instrument Serif is
high-contrast, so **never** set it below 24px and never bold it — there is no bold.

### 2.3 Elevation — three steps, and sparse surfaces use them

Rev. A had a single `--elevate` that in dark mode was an inset 1px highlight at 6% opacity. On a large
panel that is effectively invisible, which is why nothing on screen has depth.

```css
/* dark (default) */
:root {
  --elevate-flat: inset 0 1px 0 rgb(255 255 255 / 0.05);
  --elevate-1:    inset 0 1px 0 rgb(255 255 255 / 0.06), 0 1px 3px rgb(0 0 0 / 0.5);
  --elevate-2:    inset 0 1px 0 rgb(255 255 255 / 0.08), 0 8px 28px -8px rgb(0 0 0 / 0.7);
  --elevate: var(--elevate-flat);   /* back-compat alias */
}

/* light */
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {
  --elevate-flat: 0 1px 2px rgb(24 24 27 / 0.05);
  --elevate-1:    0 1px 3px rgb(24 24 27 / 0.08);
  --elevate-2:    0 8px 28px -8px rgb(24 24 27 / 0.16), 0 1px 3px rgb(24 24 27 / 0.06);
}}
:root[data-theme="light"] {
  --elevate-flat: 0 1px 2px rgb(24 24 27 / 0.05);
  --elevate-1:    0 1px 3px rgb(24 24 27 / 0.08);
  --elevate-2:    0 8px 28px -8px rgb(24 24 27 / 0.16), 0 1px 3px rgb(24 24 27 / 0.06);
}
```

**Assignment:**

| Step | Use on |
|---|---|
| `--elevate-flat` | Dense surfaces — deck table, telemetry header, forecast, inline panels |
| `--elevate-1` | Interactive raised things — grade keys, buttons at rest, the due-now band |
| `--elevate-2` | **Sparse-screen panels and modals** — the login card, dialogs, the command palette |

> This is a shadow scale, **not** a return to glow. Every value is neutral black or neutral ink. No
> coloured shadows, no glow, no blur behind content.

### 2.4 Surface variants

```css
/* dense: flat, structural — unchanged behaviour */
.surface {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevate-flat);
}

/* sparse: a real, contained, elevated object */
.panel {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--elevate-2);
}

/* raised interactive */
.surface--raised { box-shadow: var(--elevate-1); }
```

---

## 3. Fix Pack 1 — Login and sparse surfaces (~0.5 d)

**Problem:** flat, boring, sharp. Text floats on a void with no composition; 2px corners on large
inputs read as raw rectangles.

**Files:** `src/app/login/LoginClient.tsx`, `src/app/login/update-password/page.tsx`,
`src/app/globals.css`, `src/components/ui/input.tsx`, `src/components/ui/button.tsx`

### Task 1.1 — Land the token layer

Implement §2.1 (radius scale), §2.2 (type steps), §2.3 (elevation scale) and §2.4 (surface variants)
in `globals.css`. This is a prerequisite for every other fix pack — do it first and verify the build
before continuing.

### Task 1.2 — Give the login form a contained panel

The form currently sits directly on the flat ground. Wrap it in `.panel`:

- Max width **420px**, centred in its column, padding **32px**.
- `--radius-xl` (16px), `--border-strong` edge, `--elevate-2`.
- The heading "Welcome back" becomes **Instrument Serif at `--type-display` (32px)**.
- The sub-line stays Geist at `--type-body`, `--ink-dim`.

This is the figure/ground the screen is missing. It is not decoration — it is the only thing giving
the composition a subject.

### Task 1.3 — Fix control geometry

- Inputs: height **44px**, `--radius-md` (8px), `--border-control` edge, 14px text, 12px horizontal
  padding.
- Buttons: height **40px**, `--radius-sm` (6px). The "Sign in" primary keeps its filled `--accent`
  fill but gets `--radius-sm` and `--elevate-1`.
- OAuth buttons: same geometry, `default` variant.
- Focus stays the 2px `--accent` outline at 2px offset. **Do not** regress focus visibility.

### Task 1.4 — The brand half

The left panel keeps its flat ground — the elevated form panel is the figure, so the brand side is
correctly the quieter half. Two changes only:

- "Cognit" wordmark → **Instrument Serif at `--type-display-lg` (44px)**.
- The three sample rows (`What is a closure? · 4d`) keep their state ticks and mono intervals — that
  block is genuinely good and demonstrates the product. Leave its structure alone.

**Acceptance**
- The form reads as a distinct object sitting on the page, not text on a void.
- No control has a corner that reads as a raw 90° angle.
- "Welcome back" and "Cognit" are visibly a serif.
- Both themes. Gate passes.

---

## 4. Fix Pack 2 — Dashboard composition (~1 d)

**Problem:** the metrics the user wants at a glance are below the fold. The due band and deck table
consume the entire first screen.

**Files:** `src/app/dashboard/(shell)/page.tsx`, `src/components/ui/shared/DueNowBand.tsx`,
`DeckGrid.tsx`, `StudyStreakCard.tsx`, `ReviewForecast.tsx`, `DashboardTelemetry.tsx`

> **This reverses Run 3 Task 6.5.** That task said "demote below the deck index." It was wrong and
> contradicted the approved mockup. The metric panels belong in a right rail, visible at first paint.

### Task 2.1 — Two-column layout

Replace the single-column `space-y-8` stack with a split:

```
┌─────────────────────────────────────────────────┬──────────────────┐
│ telemetry header (full width)                   │                  │
├─────────────────────────────────────────────────┼──────────────────┤
│ due-now band                                    │ RECALL ACCURACY  │
├─────────────────────────────────────────────────┤ 87%  ▲4.2        │
│ ALL DECKS                          8 decks      │ ▁▂▄▅▃▄▆▇▅▆█      │
│ ▍ Neuroanatomy   128  31  2.41  ▓▓▓▓░ 74%  2h   ├──────────────────┤
│ ▍ Pharmacology    86  12  2.18  ▓▓░░░ 46%  1d   │ SESSION STREAK   │
│ … (rows continue)                               │ 14 days · best31 │
├─────────────────────────────────────────────────┤ ▓▓▓▓▓▓▓░▓▓▓▓▓▓   │
│ FORECAST · NEXT 7 DAYS                          │                  │
│ 47  12  31   8  24  15   9                      │                  │
└─────────────────────────────────────────────────┴──────────────────┘
        1fr                                          320px
```

```jsx
<div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
  <div className="min-w-0 space-y-6">
    <DueNowBand … />
    <DeckGrid … />
    <ReviewForecast … />
  </div>
  <aside className="space-y-4">
    <RecallAccuracyPanel … />
    <StreakPanel … />
  </aside>
</div>
```

Below `lg`, the aside stacks **under** the due-now band and **above** the deck list — on mobile the
metrics still matter, they just cannot sit beside anything.

### Task 2.2 — Split `StudyStreakCard` into two panels

It currently renders retention and streak in one large block. Split it into two `.surface` panels
sized for a 320px rail:

- **Recall accuracy** — `RECALL ACCURACY · 30D` label, the percentage at 30px mono, a delta, a
  20-bar sparkline, and the three-state legend (Due / Learning / Mastered).
- **Session streak** — `SESSION STREAK` label, the day count at 30px mono in `--state-streak`,
  `days · best N`, and a 14-cell day strip.

Keep `ActivityHeatmap` if it still earns its place; if it does not fit the rail, move it below the
forecast rather than deleting it.

### Task 2.3 — Compress the due-now band

It is currently tall enough to push the deck list down. Target **≤150px**:

- Metric, subline and action buttons on **one row**.
- The per-deck chip row (`TECHNO 334 · RIZAL MIDTERMS 48 …`) is useful — keep it, but cap it at the
  **top 5 decks by due count** plus a `+N more` affordance, on a single line that never wraps to a
  third row.
- Band gets `--radius-lg` and `--elevate-1`.

### Task 2.4 — Compress the deck list header

`DECKS 12` + filter input + three sort buttons currently occupy their own band. Put the count, the
filter and the sort control on **one line** with the section rule, matching the `ALL DECKS ——— 8 decks`
pattern from the mockup.

### Task 2.5 — Deck rows keep their radius discipline

Rows stay flat with 1px `--border` dividers — **no card, no shadow**. That part of the build is
correct and the user did not object to it. Only the surrounding composition changes.

**Acceptance**
- At **1440×900**, a first paint shows: telemetry, due band, at least 6 deck rows, **and both metric
  panels**, without scrolling.
- At 390px the metrics appear above the deck list.
- Both themes. Gate passes.

---

## 5. Fix Pack 3 — Study canvas (~1 d)

**Problem:** the card is a heavy filled grey box; grade keys float mid-screen; the reveal is an
oversized filled button pushed to one side.

**Files:** `src/app/globals.css` (`.flip`), `src/components/ui/shared/FlipCard.tsx`,
`FlashcardReviewClient.tsx`, `src/components/ui/shared/CornerBrackets.tsx`

### Task 3.1 — The card loses its fill and its border

This is the headline change. `.flip` currently has:

```css
border: 1px solid var(--border-strong);
border-radius: var(--radius-container);
background: var(--surface);
box-shadow: var(--elevate);
```

**Remove all four.** The card is defined by **corner brackets only**, on the flat ground:

```css
.flip {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 14rem;
  max-height: min(60vh, 26rem);
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--ink);
  text-align: center;
  perspective: 1400px;
  --commit: var(--state-neutral);
}
```

Render `CornerBrackets` inside `.flip` — four 14px corners, 1px, `--border-strong`, one at each
corner. That component already exists from Run 1; it is currently unused on this route.

The `graded` commit flash (§7.6) still works — it is an inset box-shadow animation and does not need
a resting border.

### Task 3.2 — Pin the grade deck to a bottom band

The keys currently sit inline directly under the card. Give the study route a three-part column:

```
┌──────────────────────────────────────────────┐
│ telemetry header · 1px rule                  │  flex: none
├──────────────────────────────────────────────┤
│                                              │
│              ┌─          ─┐                  │  flex: 1
│               card prompt                    │  centred
│              └─          ─┘                  │
│                                              │
│              Space  reveal answer            │
├──────────────────────────────────────────────┤
│   AGAIN  │  HARD  │  GOOD  │  EASY           │  flex: none
│    1m    │  10m   │   1d   │   1d            │  border-top 1px
└──────────────────────────────────────────────┘
```

- The page is `display: flex; flex-direction: column; min-height: 100dvh` with the stage as `flex: 1`.
- The grade band is `flex: none`, `border-top: 1px solid var(--border)`, padding `14px 20px 18px`.
- **The band is always mounted** — inert (reduced opacity, `pointer-events: none`) before reveal, live
  after. This is what keeps layout shift at zero, and it is already the existing behaviour; preserve
  it.
- Keys get `--radius-md` (8px) and `--elevate-1`.
- Mobile: keys 64px tall inside `env(safe-area-inset-bottom)`.

### Task 3.3 — Minimal, centred reveal affordance

Currently a filled `variant="primary"` button, right-aligned. **Remove the primary variant here** —
Run 2's instruction to give every screen a filled CTA was wrong for this one. On the study canvas the
grade keys are the action; the reveal is a hint.

Replace with a quiet, centred affordance directly beneath the card:

```jsx
<button type="button" onClick={reveal} className="reveal-hint">
  <Kbd>Space</Kbd>
  <span>reveal answer</span>
</button>
```

```css
.reveal-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-inline: auto;
  padding: 8px 14px;
  border: 0;
  background: none;
  border-radius: var(--radius-sm);
  color: var(--ink-dimmer);
  font-size: var(--type-sm);
  cursor: pointer;
  transition: color var(--dur-hover) ease;
}
.reveal-hint:hover { color: var(--ink-dim); }
.reveal-hint:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

The `QUESTION` / `ANSWER` label currently sitting beside it moves **above the card** as an eyebrow in
the `label` step, centred.

### Task 3.4 — The card prompt

Already Instrument Serif — keep it. Confirm it matches §2.2: `clamp(1.5625rem, 2.4vw, 2.125rem)`,
`line-height: 1.32`, `max-width: 32ch`, centred, `text-wrap: balance`.

**Acceptance**
- The card has **no background fill and no full border** — four corner brackets on the flat ground.
- Grade keys sit in a bottom band with a top rule, not floating mid-screen.
- The reveal affordance is centred, quiet, and not a filled button.
- Revealing an answer still causes **zero layout shift**.
- A 400-word answer is still fully scrollable, first word visible at the top.
- Both themes. Gate passes.

---

## 6. Fix Pack 4 — Quiz surface (~0.5 d)

**Files:** `src/components/ui/shared/QuizAssessmentClient.tsx`, `MCQMode.tsx`,
`IdentificationMode.tsx`

### Task 4.1 — Question gets the same bracket treatment

The quiz question sits in a filled surface like the study card did. Apply the Fix Pack 3 treatment:
corner brackets on the flat ground, no fill, no full border, Instrument Serif prompt.

### Task 4.2 — Options

- `--radius-md` (8px), `--elevate-1` at rest.
- `--border-control` edge; correct/wrong states in `--state-mastered` / `--state-lapsed`.
- Keep the `Kbd` numerals — those are working.

### Task 4.3 — Same vertical structure as study

Telemetry header → stage (`flex: 1`, centred) → action band at the bottom. The continue/submit action
lives in the band, not floating after the options.

**Acceptance** Question is bracket-framed with no grey box; options have real corners; the layout
matches study's three-part structure. Both themes. Gate passes.

---

## 7. Fix Pack 5 — Typography sweep and spec update (~1 d)

### Task 5.1 — Apply the serif to every display heading

Sweep the app and set every heading ≥24px in Instrument Serif per §2.2:

- Page titles: dashboard ("Decks"), deck detail, quiz results, study summary
- Section headings ≥24px
- Empty-state and onboarding headlines
- `not-found` and `error` headlines
- Landing page headlines
- Login / update-password headings (done in Fix Pack 1)

Headings **below** 24px stay Geist 600. Numeric metrics stay Geist Mono. Do not set the serif in bold
— it has no bold weight; if it looks weak, the size is wrong, not the weight.

### Task 5.2 — Audit radius across the app

With the new scale live, find elements still reading as too sharp — anything ≥40px tall carrying
`--radius-control`. Move them to `--radius-md` or `--radius-lg` per §2.1.

Pay particular attention to: modals, the command palette, the deck chat widget, PDF upload zone,
bulk-import preview, and any large `.surface` block.

### Task 5.3 — Apply `--elevate-2` to remaining sparse surfaces

Modals, the command palette, and any empty state that is currently text on a void. Dense surfaces keep
`--elevate-flat`.

### Task 5.4 — Update `COGNIT_DESIGN_SYSTEM.md` to Rev. B

**Do not skip this.** The spec is what future agents read; leaving it stale guarantees this
regression comes back.

Edit these sections to match this document:

- **§1 thesis, principle 1** — scope "almost nothing is filled" to dense surfaces; add that sparse
  surfaces get contained, elevated panels.
- **§3.2 type roles** — Instrument Serif is the display face ≥24px; Geist Sans is chrome and body
  <24px; state the "no bold serif" rule.
- **§3.3 type scale** — replace with §2.2's steps.
- **§4.2 radius** — replace with §2.1's five-step scale and the proportionality rule.
- **§4.3 elevation** — replace with §2.3's three-step scale and its assignment table.
- **§7.1** — add `.panel` and `.surface--raised` alongside `.surface`.
- **§7.6 FlipCard** — state explicitly: **no background fill, no full border, corner brackets only.**
- **§7.2 Button** — soften "one primary per screen" to "at most one; a screen whose primary action is
  a specialised control (e.g. the grade deck) has none."
- Bump the header to **Rev. B** and add a one-line changelog noting this document as the source.

**Acceptance** Every display heading is serif; nothing ≥40px tall has a 2px corner; the spec no longer
contradicts the code. Gate passes.

---

## 8. What is explicitly NOT changing

Guard against over-correction. The following were not criticised and must survive:

- The **obsidian palette** — neutral zinc, no indigo, no hue in the ground.
- The **state channel** — due / learning / mastered / lapsed / streak as the only source of hue.
  **Easy stays colourless.**
- **Geist Mono for all data**, with `tabular-nums`. The user did not object to the numbers.
- **Deck rows instead of tiles** — flat, 1px dividers, state ticks.
- The **telemetry header** pattern.
- Every item on Rev. A §1.1's anti-pattern list: **no orbs, no glow, no sparkles, no grain, no
  backdrop-blur outside modal scrims, no indigo, no Orbitron.**
- The **z-scale**, the **accessibility contract** (§9), and reduced-motion handling.
- `projectedInterval()` driving real SM-2 intervals on grade keys.

> The shadow scale in §2.3 is **depth**, not glow. Neutral black only. If you find yourself typing a
> coloured `box-shadow`, stop.

---

## 9. Verification

```bash
# tokens landed
grep -n "radius-xs\|radius-xl\|elevate-2\|--panel" src/app/globals.css

# the card is unfilled
sed -n '/^\.flip {/,/^}/p' src/app/globals.css     # expect no background/border/box-shadow

# no filled primary on the study reveal
grep -n 'variant="primary"' src/components/ui/shared/FlashcardReviewClient.tsx

# anti-patterns still absent (each must return nothing)
grep -rn "glow\|orb-pulse\|grain-overlay\|border-primary/\|font-orbitron" src
grep -rn "<Sparkles \|<Brain \|<Wand2 " src --include="*.tsx"

# full gate
npx tsc --noEmit && npm run lint && npm test && npm run build
```

### Manual checks — do these in a browser, both themes

1. **`/login`** — the form is a contained, elevated panel. Headings are serif. No control has a raw
   90° corner.
2. **`/dashboard` at 1440×900** — telemetry, due band, ≥6 deck rows **and both metric panels** visible
   without scrolling.
3. **`/dashboard` at 390px** — metrics appear above the deck list.
4. **`/dashboard/[deckId]/study`** — card is corner brackets on flat ground, no grey box. Grade keys
   in a bottom band. Reveal is a quiet centred affordance. Reveal an answer: nothing moves.
5. **`/dashboard/[deckId]/quiz`** — question is bracket-framed; options have real corners.
6. **Long answer** — 400 words still fully scrollable, first word at the top.
7. **Reduced motion** — nothing animates.

---

## 10. Required completion report

### Section 1 — What I did
Per fix pack, per task, with files. Paste the real output of the final full gate.

### Section 2 — What to check in the browser
A numbered walkthrough written for a human: route, action, what should now be visibly true. Cover all
seven manual checks in §9. Flag anything that might read as a regression but is intended.

### Section 3 — Findings deferred
Anything noticed but not fixed, with `file:line`.

### Section 4 — Deviations
Where you departed from this plan and why. If none, say so.

### Section 5 — Next steps
Confirm `COGNIT_DESIGN_SYSTEM.md` is at Rev. B and no longer contradicts the code. Note anything the
product owner should look at first.

---

## 11. Definition of done

- [ ] Five-step radius scale live; nothing ≥40px tall has a 2px corner.
- [ ] Three-step elevation scale live; login and modals use `--elevate-2`.
- [ ] Login form is a contained `.panel`; headings are serif.
- [ ] Dashboard is two-column; both metric panels visible at 1440×900 without scrolling.
- [ ] `.flip` has no background, no border, no shadow; `CornerBrackets` renders on the study card.
- [ ] Grade keys are in a pinned bottom band with a top rule.
- [ ] Reveal affordance is centred, quiet, not `variant="primary"`.
- [ ] Quiz question is bracket-framed and structurally matches study.
- [ ] Every heading ≥24px is Instrument Serif; none is bold; metrics remain mono.
- [ ] `COGNIT_DESIGN_SYSTEM.md` updated to Rev. B (§7 Task 5.4).
- [ ] Zero layout shift on answer reveal; long answers still scrollable.
- [ ] No anti-pattern from Rev. A §1.1 reintroduced.
- [ ] Full gate passes, output pasted.
- [ ] Every route reviewed in **both** themes before writing the report.
