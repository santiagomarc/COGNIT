# Cognit — Redesign Run 6: Rev. C Surfaces

**Status:** Approved by the product owner 2026-09-10
**Supersedes:** nothing. This is *additive* to `COGNIT_DESIGN_SYSTEM.md` Rev. B.
**Visual target:** https://claude.ai/code/artifact/b87d7fe0-d9a8-4837-bcab-0964110b64f2
**Mockup source (live HTML/CSS, native resolution):** `implementation-prompts/mockups/src/`
**PNG exports:** `implementation-prompts/mockups/png/`
**Repository:** `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router), React 19, Tailwind v4
(CSS-first, **no** `tailwind.config.js`), Framer Motion 12, Supabase
**Estimate:** ~4.5 engineering days across 6 phases

---

## 0. How to use this document

**This document is self-contained.** Every token, class and measurement you need is written out here.
You should still read `COGNIT_DESIGN_SYSTEM.md` (Rev. B) for context, but where this document and that
one disagree, **this document wins** — and Phase 5 makes you update that document so they stop
disagreeing.

**Read the mockups before you write code.** `implementation-prompts/mockups/src/*.html` are the
approved rendering, not an approximation of it. When this document and a mockup disagree on a
measurement, open the mockup and match it. `cognit.css` in that folder is the reference
implementation of every new class.

> **One correction to carry with you.** The mockup stylesheet `mockups/src/cognit.css` contains
> `a { color: inherit; text-decoration: none; }`. **Do not port that rule into `globals.css`.**
> Tailwind v4 Preflight already ships `a { color: inherit }`
> (`node_modules/tailwindcss/preflight.css:87`). The rule exists in the mockup only because a
> standalone HTML file has no Preflight. Adding it to the app is harmless but pointless.

### Working rules

- Run `npx tsc --noEmit` after each task; the full gate after each phase:
  ```bash
  npx tsc --noEmit && npm run lint && npm test && npm run build
  ```
- **Clear the Turbopack cache before any visual check** — a stale dev CSS chunk has burned three
  sessions on this project:
  ```bash
  rm -rf .next/dev .next/cache && npm run dev
  ```
- **Never commit** unless asked. Leave work in the tree.
- **Do not claim success without running the command.** Paste real output in your report.
- **Every phase is reviewed in both themes** before it is called done. Light is not an inversion and
  has caught real bugs in this work already (see Phase 0, Task 0.2).

### Phase order — Phase 0 is a hard prerequisite

| Phase | Scope | Est. | Depends on |
|---|---|---|---|
| **0** | Foundation — the plane tokens | 0.5 d | — |
| **1** | Login | 0.5 d | 0 |
| **2** | Dashboard | 1.5 d | 0 |
| **3** | Deck page — Option A, Workspace | 1.5 d | 0 |
| **4** | Drift fixes | 0.5 d | 0 (Task 4.2 needs the type scale settled) |
| **5** | Verification, audit and spec update | 0.5 d | 1–4 |

Phases 1, 2 and 3 are independent of each other and may be reordered or parallelised. **Phase 4
Task 4.1 touches ~20 files including files that Phases 1–3 also touch** — do Phase 4 last among 1–4,
or accept merge conflicts.

---

## 1. The diagnosis this plan implements

The redesign programme executed Rev. A and Rev. B faithfully. The chassis is correct and is staying:
the neutral obsidian palette, the SM-2 state channel as the only source of hue, Geist Mono with
`tabular-nums` for all data, Instrument Serif for display type ≥24px, the radius and elevation scales,
the accessibility contract, the entire Rev. A §1.1 anti-pattern list.

**What is wrong is that the system has a three-step surface ladder and spends only one step.**

`--bg #09090b` → `--surface #131316` → `--surface-raised #1f1f23` exist, and one elevation,
`--elevate-flat`, an inset white highlight at 5 % opacity. On the deck page, six `.surface` blocks and
roughly ten major components all sit at *that same step* with *that same elevation* at near-equal
visual weight. Nothing is primary because nothing is anywhere. That is not a colour problem and it
will not be fixed by adding a colour.

**The fix is to spend the ladder:** put the primary object *above* the surface, put subordinate content
*below* it in a plane the system does not currently have, and let monochromatic light fall across the
ground behind both.

### The operative rule on decoration

> **Banned:** chromatic decorative blobs, coloured glow, neon shadow, `backdrop-blur` outside a modal
> scrim, sparkles/brains/wands, indigo, Orbitron, and any hue that does not encode spaced-repetition
> state.
> **Permitted:** monochromatic ambient lighting — low-opacity white/zinc radial fields, fine grain,
> vignettes, specular hairlines, subtle neutral gradients — used to create **planes and depth**.

Depth in this system comes from **light and elevation, never from colour**. Every device in Phase 0
obeys that.

### Performance constraint — non-negotiable

`src/components/landing/LandingBackground.tsx` runs an O(n²) particle-connection loop (~105 particles
≈ 5,500 distance checks per frame) plus three canvas wave ribbons. That is acceptable on a landing page
viewed for 20 seconds. **It must not appear on any authenticated surface**, where users sit for 30–60
minutes on laptops.

Everything in Phase 0 is a `background-image` paint on one element per route: **zero per-frame work, no
canvas, no `requestAnimationFrame`, no cursor tracking, no `mix-blend-mode`**. Nothing animates, so
there is nothing for `prefers-reduced-motion` to disable — which is a stronger guarantee than
respecting it.

---

## 2. Phase 0 — Foundation: the plane tokens (~0.5 d)

**Goal:** add the one plane the system is missing, and the ambient layer, so Phases 1–3 have a
vocabulary to build with. Nothing user-visible changes in this phase except that new classes become
available.

**Files:** `src/app/globals.css`, and one new component.

### Task 0.1 — Land the three new tokens

Add to the **light** block in `src/app/globals.css` (the `:root` block that begins
`color-scheme: light;`), immediately after `--accent-ink`:

```css
  /* ── Plane tokens (Run 6) ────────────────────────────────────────────
     The system had ground / surface / surface-raised and one elevation.
     These add the two ends of the ladder: a genuinely raised plane, and a
     recessed one. Depth is neutral light only — no colour, no glow. */
  --raised-bg: #ffffff;
  --recess: #f4f4f5;
  --elevate-inset: inset 0 1px 3px rgb(24 24 27 / .07);
  /* Specular top edge has no job on a white card — the drop shadow already
     separates it from the ground. Deliberately transparent, not omitted. */
  --spec: transparent;
```

Add to the **dark** block (`.dark`), in the same position:

```css
  /* ── Plane tokens (Run 6) ── */
  --raised-bg: #1f1f23;
  --recess: #0b0b0d;
  --elevate-inset: inset 0 1px 3px rgb(0 0 0 / .5), inset 0 0 0 1px rgb(255 255 255 / .012);
  --spec: rgb(255 255 255 / .085);
```

> **Why `--raised-bg` exists and is not just `--surface-raised`.** This was a real bug caught in the
> mockups. In light mode `--surface-raised` is `#f4f4f5`, which is a *hover fill on a white surface*.
> Used as the raised plane on a `#fbfbfc` ground it renders **darker than the ground** — the exact
> inverse of what "raised" means. Light mode is its own composition, not an inversion: a raised plane
> goes lighter and takes a shadow. Do not collapse these two tokens.

### Task 0.2 — Add the plane classes

Append to `globals.css`, directly after the existing `.surface` / `.panel` / `.surface--raised` block:

```css
/*
 * ─── Planes (Run 6) ───
 * The system's structural containers, by role. Exactly one `.raised` object
 * per screen: the thing the screen is for.
 */
.raised {
  background: var(--raised-bg);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevate-1);
}

/* A well. Contained but subordinate — the deck index, the card list. */
.well {
  background: var(--recess);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevate-inset);
}

/*
 * Masked specular top edge. A 1300px panel with an unmasked 1px highlight
 * reads as a drawn rectangle; fading it at the corners reads as light.
 * Transparent in light mode by token, so this is inert there.
 */
.spec { position: relative; }
.spec::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 1px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: linear-gradient(90deg, transparent, var(--spec) 18%, var(--spec) 82%, transparent);
  pointer-events: none;
}

/*
 * ─── Gradient-masked rules (Run 6) ───
 * A hairline that fades at both ends. This is the single cheapest fix for
 * "everything looks like a box": a rule that stops short of the gutter reads
 * as structure, a rule that butts into it reads as a container edge.
 */
.rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-strong) 6%, var(--border-strong) 94%, transparent);
}
.rule--soft {
  background: linear-gradient(90deg, transparent, var(--border) 4%, var(--border) 96%, transparent);
}
.rule--v {
  width: 1px;
  align-self: stretch;
  background: linear-gradient(180deg, transparent, var(--border-strong) 10%, var(--border-strong) 90%, transparent);
}
```

### Task 0.3 — Build `AmbientField`

**New file:** `src/components/ui/shared/AmbientField.tsx`

A server component. No `'use client'`, no state, no effects, no props beyond an optional `className`.

```tsx
/**
 * The authenticated surfaces' ambient layer (Run 6 Phase 0).
 *
 * This is the CSS-only descendant of `LandingBackground`. It keeps that
 * component's monochromatic vocabulary — a radial light field and a fine
 * grain — and drops everything that costs a frame: the O(n^2) particle
 * network, the three canvas wave ribbons, the cursor spotlight.
 *
 * Two background-image paints on one element. No canvas, no rAF, no cursor
 * tracking, no mix-blend-mode (which would force a compositing pass). Nothing
 * animates, so there is nothing for prefers-reduced-motion to disable.
 *
 * Light and dark are not inversions of each other. On a dark ground, "light
 * from above" means the top glows. On a light ground it means the periphery
 * recedes. Same role, opposite implementation — see --amb-field.
 */
export function AmbientField() {
  return <div aria-hidden="true" className="amb" />;
}
```

Its CSS goes in `globals.css`:

```css
/*
 * ─── Ambient field (Run 6) ───
 * Paint only. See AmbientField.tsx for the rationale.
 */
:root {
  --amb-field:
    radial-gradient(ellipse 110% 75% at 50% -5%, rgb(255 255 255 / .85), transparent 55%),
    radial-gradient(ellipse 100% 90% at 50% 8%, transparent 42%, rgb(24 24 27 / .038) 100%);
  --amb-grain-opacity: .020;
}
.dark {
  --amb-field:
    radial-gradient(ellipse 115% 62% at 50% -8%, rgb(255 255 255 / .050), rgb(255 255 255 / .014) 42%, transparent 70%),
    radial-gradient(ellipse 70% 55% at 88% 68%, rgb(255 255 255 / .022), transparent 62%),
    radial-gradient(ellipse 90% 70% at 50% 45%, transparent 46%, rgb(0 0 0 / .30) 100%);
  --amb-grain-opacity: .032;
}

.amb {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.amb::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--amb-field);
}
.amb::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: var(--amb-grain-opacity);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 180px 180px;
}
```

> **Stacking.** `.amb` is `position: fixed; z-index: 0`. Page content must sit in a stacking context
> above it. In the dashboard shell, give the content wrapper `position: relative; z-index: 1`. Do
> **not** give `.amb` a negative z-index — that puts it behind the `body` background and it disappears.

### Task 0.4 — Mount it, and retire the dead token

- Mount `<AmbientField />` in `src/app/dashboard/layout.tsx` (once, for every chromed route) and in
  `src/app/login/layout.tsx` or `LoginClient`'s root — **not** on `/study` or `/quiz`. Those routes are
  a single card on a flat ground and the field would compete with the one thing the user is reading.
- Delete `--landing-stipple` from both theme blocks in `globals.css`. It is declared twice and consumed
  nowhere (`grep -rn "landing-stipple" src` returns only the two declarations).

**Acceptance**
- [ ] `grep -n "recess\|raised-bg\|elevate-inset\|--spec\|--amb-field" src/app/globals.css` returns
      both theme blocks.
- [ ] `.raised` renders **lighter** than the ground in light mode. Screenshot both themes and confirm.
- [ ] `.well` renders **darker** than the ground in dark mode and reads as recessed in light.
- [ ] A `.rule` fades to nothing at both ends.
- [ ] The ambient field is visible but never competes with text; body text contrast is unchanged.
- [ ] DevTools Performance: recording 10 s on `/dashboard` with the tab idle shows **no scripting and
      no recurring paint** attributable to `.amb`.
- [ ] `grep -rn "landing-stipple" src` returns nothing.
- [ ] Gate passes.

---

## 3. Phase 1 — Login (~0.5 d)

**Goal:** the left half stops describing the product and starts being it.

**Files:** `src/app/login/LoginClient.tsx`, `src/app/globals.css`
**Mockups:** `mockups/src/login-d.html`, `login-m.html`, `login-d-light.html`

### What is NOT changing

The 55/45 split, the contained `.panel` at `--elevate-2`, all control geometry from Fix Pack 1
(44px inputs at `--radius-md`, 40px buttons at `--radius-sm`), the OAuth row, the mode-switching logic,
the `emailSent` states, and every string in the form itself. This is a composition change to the left
half plus two small changes on the right.

### Task 1.1 — Rebuild the brand half as a product still life

Replace the tagline-plus-three-rows block with a vertical composition, max-width **470px**, in this
order:

1. **Wordmark** — `<Wordmark size="lg" />` (66px Instrument Serif). Unchanged except for the weight
   fix in Phase 4.
2. **Tagline** — 17px, `--ink-dim`, max-width `30ch`, with "Study smarter, remember forever." in
   `--ink`. Unchanged copy.
3. **The specimen card** — margin-top **42px**. A bracket-framed region, `padding: 30px 26px`,
   `min-height: 118px`, `display: grid; place-items: center`, containing `<CornerBrackets />` and a
   prompt in Instrument Serif at **31px**, `line-height: 1.24`, centred, `max-width: 21ch`,
   `text-wrap: balance`. **No fill, no border, no shadow** — the study canvas treatment (§7.6).
   Copy: `What is a closure, and what does it capture?`
4. **The inert grade deck** — margin-top **20px**. A `grid-template-columns: repeat(4, 1fr)`, `gap: 8px`
   of four real `.key` elements at `opacity: .62`, using the existing grade→state mapping:

   | Key | Label | Interval | `--key-state` |
   |---|---|---|---|
   | `1` | Again | `1m` | `var(--state-lapsed)` |
   | `2` | Hard | `10m` | `var(--state-due)` |
   | `3` | Good | `4d` | `var(--state-mastered)` |
   | `4` | Easy | `9d` | `var(--state-neutral)` — **stays colourless** |

   These are decorative and non-interactive: render them as `<div>`, not `<button>`, and put the whole
   block in a container with `aria-hidden="true"`. A screen reader must not encounter four unusable
   grade keys on a sign-in page.
5. **Caption** — margin-top 12px, `label` step: `Every key shows the interval before you commit`.
6. **`.rule`** — margin-top 34px.
7. **The three specimen rows** — unchanged structure from the current code (tick, prompt, mono
   interval). They keep their state ticks and mono intervals.
8. **Caption** — `Next review, scheduled by SM-2`. Unchanged.

> **Why the grade deck is here.** It is the product's signature object and the one place the flat
> system yields to tactility. It also does something a tagline cannot: it shows a returning user what
> the session waiting for them looks like. This is the one deliberate risk in Run 6 and it was approved.

### Task 1.2 — Replace the hard divider with a gradient hairline

The brand half currently carries `border-r border-border`. Remove it. Insert a
`<div className="rule--v" style={{ height: '100%' }} />` between the two halves.

This single change is most of why the page stops reading as two rectangles pasted together. Do not
skip it as cosmetic.

### Task 1.3 — Step the heading down, and mount the ambient field

- `h1` ("Welcome back" / "Create account" / "Reset password" and the two `emailSent` headings) moves
  from `text-[3rem]` (48px) to **36px**. In a 420px panel, 48px competes with the 66px wordmark
  instead of sitting under it. 36px is on the scale and well above the 24px serif floor.
- Mount `<AmbientField />` at the root of the login layout.
- The theme toggle stays where it is, top-right.

### Task 1.4 — Mobile (390px)

Per `mockups/src/login-m.html`. Below `lg`:

- Wordmark drops to 40px, inline with the theme toggle.
- The `.panel` goes full-width with 16px gutters, `padding: 22px 20px`, `h1` at 30px.
- **Inputs go to `font-size: 16px`** — below 16px iOS Safari zooms the viewport on focus.
- The submit button is 46px tall; OAuth buttons 44px. Both clear the 44px touch minimum.
- The specimen card and grade deck are **dropped**; the three deck rows survive under the caption
  `What is waiting on the other side`. On a 844px viewport the form must be usable without scrolling,
  and the still life is the part that can go.

**Acceptance**
- [ ] The left half shows a bracket-framed card and four grade keys with real SM-2 intervals.
- [ ] The grade-key block is `aria-hidden` and contains no focusable element. Tab order goes
      wordmark → email → password → forgot → submit → OAuth → mode toggle.
- [ ] No `border-r` between the halves; the divider fades at top and bottom.
- [ ] `h1` is 36px serif at weight 400.
- [ ] At 390px, inputs are 16px and the form fits above the fold.
- [ ] Both themes reviewed. Gate passes.

---

## 4. Phase 2 — Dashboard (~1.5 d)

**Goal:** satisfy all five owner requirements, at the owner's real numbers.

**Files:** `src/app/dashboard/(shell)/page.tsx`, `DueNowBand.tsx`, `ReviewForecast.tsx`,
`StudyStreakCard.tsx`, `ActivityHeatmap.tsx`, `DashboardTelemetry.tsx`, `DeckGrid.tsx`, `DeckRow.tsx`,
plus three new components.
**Mockups:** `mockups/src/dash-d.html`, `dash-m.html`, `dash-d-light.html`

### The five requirements, and where each is satisfied

| # | Requirement | Task |
|---|---|---|
| 1 | Heatmap and activity visible at first paint, 1440×900, no scrolling | 2.4 |
| 2 | Create Deck becomes its own prominent container | 2.3 |
| 3 | Import PDF removed from this page entirely | 2.2 |
| 4 | `DUE / RETENTION / STREAK / REVIEWED TODAY` moves right | 2.1 |
| 5 | Greeting header on the left | 2.1 |

### The target composition — four full-width bands

```
┌────────────────────────────────────────────────────────────────────────────┐
│ A  Good evening, Marc              DUE 519  RETENTION 71%  STREAK 14d …    │  ~72px
│    Thursday, 10 September · 9 of 12 decks need you today   [Search ⌘K]     │
│    ─── gradient rule ──────────────────────────────────────────────────    │
├────────────────────────────────────────────────────────────────────────────┤
│ B  ┌─ DUE NOW · .raised ───────────────────────┐ ┌─ CREATE DECK ────────┐  │  ~190px
│    │ 519  cards due across 9 decks   [Start S] │ │  ┌+┐                 │  │
│    │ ──────────────────────────────────────────│ │  Create deck         │  │
│    │ NEXT 7 DAYS · 417  │  DUE NOW, BY DECK    │ │  Blank, notes, PDF   │  │
│    │  ▇ ▃ ▅ █ ▂ ▄ ▂     │  TECHNO         334  │ │            NEW  ⌘N   │  │
│    │  F S S M T W T     │  + 6 more decks  97  │ └──────────────────────┘  │
│    └───────────────────────────────────────────┘                           │
├────────────────────────────────────────────────────────────────────────────┤
│ C  ┌─ SIGNAL PANEL · .surface ─────────────────────────────────────────┐   │  ~156px
│    │ ACTIVITY · 6 MONTHS      │ RECALL ACCURACY  │ SESSION STREAK      │   │
│    │ ▪▪▪ heatmap 27×7 ▪▪▪     │ 71%  ▲4.2        │ 14  days · best 31  │   │
│    │ Apr May Jun Jul Aug Sep  │ ▁▂▄▅▃▄▆▇  legend │ ▓▓▓▓░▓▓▓▓▓▓▓▓▓      │   │
│    └──────────────────────────┴──────────────────┴─────────────────────┘   │
├────────────────────────────────────────────────────────────────────────────┤
│ D  ALL DECKS ─────────── 12 decks · 1,647 cards  [Filter] [Most due ▾]     │
│    ╭─ .well ──────────────────────────────────────────────────────────╮    │  fills
│    │ DECK              CARDS  DUE  EASE  MASTERY       QUIZZED        │    │
│    │ ▍ TECHNO            412  334  2.18  ▓▓▓░  34%         2h         │    │
│    │ … 9 rows visible, clipped by the fold                            │    │
│    ╰──────────────────────────────────────────────────────────────────╯    │
└────────────────────────────────────────────────────────────────────────────┘
```

Container: `padding: 24px 32px 0`, `display: flex; flex-direction: column; gap: 16px`. The 48px rail
sits outside it, as today.

### Task 2.1 — The greeting row (requirements 4 and 5)

**New component:** `src/components/ui/shared/GreetingHeader.tsx`

Left: an `h1` in Instrument Serif at **36px**, weight 400. Beneath it a 13px `--ink-dim` sub-line
carrying real information, not filler: `Thursday, 10 September · 9 of 12 decks need you today`, with
the counts in mono.

Right, baseline-aligned: the existing `<Telemetry>` readings — `Due` (tone `due` when > 0), `Retention`,
`Streak` (tone `streak` when > 0), `Reviewed today` — then the `⌘K` search affordance. **Reuse
`Telemetry` unchanged.** `DashboardTelemetry` loses its own `h-px` rule; the greeting row owns the
divider, and it is a `.rule`, not a flat `bg-border`.

#### The display name — do not reintroduce F-06

Finding F-06 was specifically about rendering a raw email as page copy. **Never render
`user.email` here.** Resolution chain, in order:

```ts
function displayName(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full.split(/\s+/)[0];              // Google, and GitHub when set
  const name = typeof meta.name === 'string' ? meta.name.trim() : '';
  if (name) return name.split(/\s+/)[0];              // GitHub fallback
  const local = user.email?.split('@')[0] ?? '';      // last resort
  const cleaned = local.replace(/[._\-+].*$/, '').replace(/\d+/g, '');
  if (cleaned.length >= 2) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }
  return null;
}
```

Verified against the schema: there is **no profiles table** in `supabase/migrations/`, and
`user_metadata` is referenced nowhere in `src/` today. Email/password signups carry no `full_name`, so
**the local-part branch is the common path, not the edge case.**

The greeting must read correctly with the name removed — `Good evening,` with nothing after it is a
bug. When `displayName` returns `null`, render `Good evening` with no comma and no name. This is why
the *sub-line* carries the information and the greeting carries none.

Time-of-day: `< 12` morning, `< 18` afternoon, else evening. Computed on the client after mount to
avoid an SSR/client mismatch on the server's timezone, or passed from the server with the user's
locale — either is acceptable, but do not let it hydrate-mismatch.

### Task 2.2 — Rebuild `DueNowBand` (requirement 3)

The band becomes `.raised .spec`, `padding: 16px 22px 14px`.

**Row 1** — the hero figure at **52px** mono, weight 600, `letter-spacing: -.045em`,
`color: var(--state-due)` when > 0. Beside it: `cards due across N decks` at 14px/500, and
`oldest is N days overdue · est. N min` at 12px `--ink-dim`. Right: the screen's **one filled button**,
`Start session` with a `<Kbd>S</Kbd>`.

**`.rule--soft`**, then **Row 2** — two paired readings split by a `.rule--v`:

- **Left, 400px wide:** the 7-day forecast (Task 2.5).
- **Right, flex:** `Due now, by deck` — the **top 3** decks as name/count rows with the count in
  `--state-due`, then a `+ N more decks` row carrying the **summed remainder** in `--ink-dimmer`. This
  replaces the horizontally-scrolling chip run, which was unreadable at 9 due decks.

**Remove the `Import PDF` button and its `importHref` prop entirely.** It already exists on the deck
page. Delete the prop from the call site in `page.tsx` too — do not leave it dangling.

Keep the `S` keybinding effect exactly as it is.

### Task 2.3 — `CreateDeckPanel` (requirement 2)

**New component:** `src/components/ui/shared/CreateDeckPanel.tsx`

`.surface .spec`, **width 340px**, `border-color: var(--border-control)` (it is an operable control, so
its edge is the 3:1 token), full height of band B via `align-items: stretch`.

Contents: a bracket-framed 42px square containing a **geometric plus drawn with two 1.5px spans** — not
a glyph, not an icon import; then `Create deck` at 16px/600; then
`Start blank, paste notes, or generate cards from a PDF.` at 13px `--ink-dim`; then, pushed to the
bottom, a `label`-step `New deck` and a `<Kbd>⌘N</Kbd>`.

It wraps the **existing** `requestOpenCreateDeck()` event from `@/lib/dashboard-events`. No new modal.
Wire `⌘N` to the same event, guarded against inputs and against stealing the browser chord.

> **Decision on file.** §7.2 allows **at most one filled button per screen** and the dashboard's is
> `Start session`. Create Deck therefore takes its prominence from **container mass and position** —
> second-largest object on the screen, top-right of the primary row — and stays unfilled. This is the
> approved resolution. If it is later filled, that is a deliberate documented exception to §7.2, not a
> drift.

### Task 2.4 — `SignalPanel` (requirement 1)

**New component:** `src/components/ui/shared/SignalPanel.tsx`

**This is what puts the heatmap above the fold.** One `.surface .spec` container,
`padding: 14px 20px 12px`, `display: flex; align-items: stretch`, divided by two `.rule--v` into three
cells:

| Cell | Width | Contents |
|---|---|---|
| Activity | `flex: 1` | `ACTIVITY · 6 MONTHS` label, all-time review count, the heatmap, month labels distributed across the grid width, and the Less→More legend. |
| Recall accuracy | 238px | `RECALL ACCURACY · 30D`, the percentage at 32px mono, the delta, the 20-bar sparkline, the three-state legend. |
| Session streak | 238px | `SESSION STREAK`, the count at 32px mono in `--state-streak`, `days · best N`, a **28-day** strip, `Logged today · 28-day window`. |

`RecallAccuracyPanel` and `StreakPanel` stop being standalone `.surface` sections and become these
cells — their internals (sparkline, day strip, legend) carry over unchanged. **The right rail is
deleted.** A 320px rail cost the deck table a fifth of its width, and at names like
`Data Structures & Algorithms` that width is not spare.

> **The streak strip widens from 14 to 28 days.** A 14-cell strip at a 14-day streak is entirely lit
> and communicates nothing. A run only means something against the misses around it.

#### Restyle `ActivityHeatmap`

Move the ramp off Tailwind opacity utilities (`bg-primary/25`, `/45`, `/65`, `bg-primary`) onto five
explicit tokens. Add to `globals.css`:

```css
:root {
  --heat-ramp-0: rgb(24 24 27 / .055);
  --heat-ramp-1: rgb(24 24 27 / .15);
  --heat-ramp-2: rgb(24 24 27 / .29);
  --heat-ramp-3: rgb(24 24 27 / .48);
  --heat-ramp-4: rgb(24 24 27 / .72);
}
.dark {
  --heat-ramp-0: rgb(250 250 250 / .05);
  --heat-ramp-1: rgb(250 250 250 / .14);
  --heat-ramp-2: rgb(250 250 250 / .25);
  --heat-ramp-3: rgb(250 250 250 / .42);
  --heat-ramp-4: rgb(250 250 250 / .64);
}
```

**The top step drops from ~0.88 to 0.64 white.** At 0.88 a six-month grid was the brightest object on
the dashboard, which inverts the hierarchy — the retrospective reading outshouted the actionable one.

Also: cells go to **10px with a 2.5px gap** (27 weeks ≈ 337px), `border-radius: 2px`, and the per-cell
`border` and `hover:scale-125` are removed. A border around every cell is data-weight ink that is not
data; the 2.5px gap is the separator. Keep `title` and `aria-label` on every cell.

### Task 2.5 — Fold `ReviewForecast` into the band, starting tomorrow

`ReviewForecast` stops being a full-width `.surface` section and becomes a compact strip rendered
*inside* `DueNowBand`. Marks: 7 columns, bar `max-width: 30px`, track height **52px**,
`border-radius: 3px 3px 0 0`, fill `--border-strong`, count above each bar in mono, weekday below in
the `label` step.

**Drop today's column. The seven days start tomorrow.** Change `buildSevenDayForecast` to project
`+1 … +7` days and remove the `isToday` branch and its `--state-due` fill.

> **Why.** This came out of the owner's real data. At **519 due**, today's column is **4.6× the tallest
> projected day** and flattens the other six to stubs — the chart becomes unreadable at exactly the
> data volume this account has. Today's count is already the hero figure two inches away, so plotting
> it twice bought nothing and cost the chart. Label the strip
> `Next 7 days · N cards` so the window is unambiguous.

Add a unit test in `src/lib/__tests__/` asserting `buildSevenDayForecast` returns 7 days beginning
tomorrow and that none of them is flagged today.

### Task 2.6 — The deck index in a well

- Section header on one line: `ALL DECKS` label, a `.rule` flexing to fill, `12 decks · 1,647 cards` in
  mono, the filter input, the sort control. Already close to this — align it to the mockup.
- Wrap `DeckGrid`'s row list in `.well` with `overflow: hidden`, and let it be **clipped by the
  viewport bottom**. That is how a list says "there is more" without a control.
- `DeckRow` height goes **41px → 38px**. Column geometry, ticks, mastery meter and `DeckActions` are
  unchanged. The mastery meter track moves from `--border` to `--border-strong` so it survives the
  recessed plane.
- **Default sort becomes `most-due`.** With 519 due across 9 decks, newest-first answers a question
  nobody is asking.

### Task 2.7 — Mobile (390px)

Per `mockups/src/dash-m.html`. The greeting row's two halves stack in the same order: identity, then a
four-up telemetry strip with stacked label/value pairs. The due band keeps the hero figure and a
full-width 44px `Start session`; the forecast strip drops its per-column counts (the total survives) and
weekday labels go to single letters. Create Deck becomes a 54px full-width bar directly under the
primary action — **position, not mass, carries the priority at this width**. The signal panel goes to a
3-month heatmap with recall and streak side by side below it. The deck well shows name / cards / due
only.

**Acceptance**
- [ ] At **1440×900**, first paint shows: greeting, telemetry, due band, forecast, Create Deck, the
      **heatmap**, recall, streak, **and ≥ 9 deck rows** — without scrolling. Verify at exactly
      1440×900, not "about that".
- [ ] `grep -rn "Import PDF" src/app/dashboard` returns nothing.
- [ ] `grep -rn "importHref" src` returns nothing.
- [ ] The greeting never renders an email address. Test all four branches of `displayName`, including
      the `null` return.
- [ ] The forecast's first column is **tomorrow**; no column is flagged today.
- [ ] At 390px the metrics appear above the deck list.
- [ ] Exactly one filled button on the screen.
- [ ] Both themes reviewed. Gate passes.

---

## 5. Phase 3 — Deck page: Option A, Workspace (~1.5 d)

**Approved direction: Option A.** Option B (Console) is not being built.

**Goal:** ten components at equal weight become four zones at three elevations. **Nothing is deleted.**

**Files:** `src/app/dashboard/(shell)/[deckId]/page.tsx` and the components it composes.
**Mockups:** `mockups/src/deck-a.html`, `deck-a-m.html`

### The structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Decks / TECHNO                                        [Share]  [···]      │
│  TECHNO  CS-ARCH                CARDS 412  DUE 334  MASTERY 34%  …         │  persistent
│  Generated from 3 PDFs · created 14 Aug · last edited 2h ago               │  header
│  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  34%                                              │
├────────────────────────────────────────────────────────────────────────────┤
│  Overview │ Cards 412 │ Insights │ Chat        [Add cards] [Import PDF]    │  segments
├────────────────────────────────────────────────────────────────────────────┤
│  ┌─ SESSION · .raised ──────────────────────┐ ┌─ TAKE QUIZ · .surface ──┐  │
│  │ 334  Review flashcards   [Review 20 · R] │ │ 298/412 ready           │  │
│  │ ──────────────────────────────────────── │ │ [MCQ][Identify][Start]  │  │
│  │ SESSION [20]  SCOPE ⦿Due ○Reviewed ○Unm. │ └─────────────────────────┘  │
│  └──────────────────────────────────────────┘                              │
│  ┌─ READINGS · .surface .spec ──────────────┬─ WEAKEST CONCEPTS ────────┐  │
│  │ SCHEDULER STATE · 412 CARDS              │ 1 Cache coherence  14 miss│  │
│  │ ███████████████████▐▌▐▌                  │ 2 Pipeline hazards 11 miss│  │
│  │ ▍Due 334 ▍Learning 40 ▍Sched 38  Proven  │ …                         │  │
│  │ MASTERY TREND · 30D ▲6 pts  ▁▂▄▅▃▄▆      │ QUIZ HISTORY · 6 ▁▂▃▄▅█   │  │
│  └──────────────────────────────────────────┴───────────────────────────┘  │
│  RECENT CARDS ──────────────── 412 in this deck            View all        │
│  ╭─ .well ─────────────────────────────────────────────────────────────╮   │
│  │ ▍ What is the purpose of a cache line?          PDF        due      │   │
│  │ … 5 rows, clipped by the fold                                       │   │
│  ╰─────────────────────────────────────────────────────────────────────╯   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Task 3.1 — The persistent header

Renders on **every** segment. Breadcrumb + `ShareDeckButton` + an overflow `···`; then the title in
Instrument Serif at 36px weight 400 with the `[tag]` beside it in the `label` step; a 13px provenance
line; the existing `<Telemetry>` cluster right-aligned (`Cards`, `Due` toned `due`, `Mastery`, `Proven`,
`Quiz-ready`, `Last quiz`); and the 3px mastery bar.

`DeckDetailSnapshot`'s data feeds this unchanged.

### Task 3.2 — The segmented control

Four segments: **Overview · Cards `N` · Insights · Chat**, with the card count in mono on the Cards
segment. Active segment: 13px/600 `--ink` with a 2px `--ink` underline sitting on the container's
bottom border. Inactive: 13px `--ink-dimmer`.

Right-aligned in the same bar: `Add cards` and `Import PDF` as two 30px `.btn`. **This is where the
three stacked ingestion surfaces go.** `AddCardForm`, `PDFUploadZone`, `BulkImportModal` and
`DeckChatWidget` all still exist — they open from here (or live under their own segment) instead of
competing with the card list for vertical space.

> **Segment state must be a URL param — `?tab=cards` — not `useState`.** The deck page is deep-linked
> from the dashboard, from the due band and from share links, and a tab that resets on back-navigation
> will be reported as a bug. Use `useSearchParams` + `router.replace` with `scroll: false`.

Segment contents:

| Segment | Contents |
|---|---|
| **Overview** | Tasks 3.3–3.5 below. |
| **Cards** | `DeckCardsManager`, full width, in a `.well`. Existing component, new container. |
| **Insights** | `WeakestConcepts` (full), `QuizHistorySection` (full), `topTopics`. All existing, unchanged. |
| **Chat** | `DeckChatWidget`, full height. Existing, unchanged. |

### Task 3.3 — The session launcher — the one `.raised` object

`.raised .spec`, `padding: 18px 22px`, flex 1.

Row 1: the deck's due count as a **hero figure** at 44px mono weight 600 in `--state-due`; beside it
`Review flashcards` at 15px/600 and a 12px `--ink-dim` line
`Spaced repetition · advances your streak and heatmap · est. N min`; right, the page's **one filled
button**, `Review N cards` with a `<Kbd>R</Kbd>`.

`.rule--soft`, then the session controls on one row: a `Session` count input (30px, `--radius-sm`) and
the three scope radios as 30px chips — selected takes `--border-control` and a filled dot, unselected
takes `--border` and `--ink-dim`.

> The old page had a telemetry strip where every reading was the same 13px, so the one *actionable*
> number was buried among five *descriptive* ones. Promoting due to a hero figure is the whole point.

Beside it, `.surface` at **322px**: `TAKE QUIZ`, `N/M ready`, a one-line description, and — on a single
row pushed to the bottom — `MCQ` / `Identify` mode chips and a `Start quiz` button. Keeping these three
on one row is what stops the launcher beside it stretching into dead space.

The two existing `<form method="get">` submissions to `/study` and `/quiz` are preserved exactly. This
is a layout change, not a behaviour change.

### Task 3.4 — The readings panel

One `.surface .spec`, `padding: 16px 20px 14px`, **content-height** (never `flex: 1` — that produced a
400px void in the first mockup pass), divided by a `.rule--v`:

**Left — scheduler state.** A single stacked bar, 22px tall, `gap: 2px` (the 2px surface gap is the
separator; **never a border around a segment**), with `border-radius: 3px` on the outer ends only.
Segments: due / learning / scheduled, each width `count / total`. **A zero-count segment must not
render at all.** Below it, a legend where every swatch is paired with a word *and* a number — this is
the WCAG 1.4.1 guarantee, and Phase 5's audit checks it. Then `MASTERY TREND · 30D` with a delta and a
340px sparkline.

**Right, 390px — weakest concepts.** The top four from the existing `WeakestConcepts` data: rank in
mono, concept name, a 64px meter, and `N missed` in a **74px** right-aligned column with
`white-space: nowrap` — at 56px it wrapped to two lines. Below, `QUIZ HISTORY · N SESSIONS` with a
6-bar micro-chart whose latest bar takes `--ink-dim` and the rest `--border-strong`.

### Task 3.5 — Recent cards, in the well

A `RECENT CARDS` header with a `.rule`, the deck total, and a `View all` link to `?tab=cards`. Then a
`.well` holding **five** card rows at 46px: state tick, prompt on line 1, answer preview on line 2 in
`--ink-dimmer` (single line, ellipsised), source in the `label` step, and the interval in mono toned by
state. Clipped by the fold.

> **This is what answers the "tabs hide things" objection.** Overview keeps a window onto every other
> segment — a card preview, the top weakest concept, the scheduler split — so the segments *organise*
> rather than hide.

> **Naming trap — read before touching card data.** In this schema `card.front` is the **answer** and
> `card.back` is the **question**. Component props must be `prompt` / `answer`, mapped at the boundary:
> `prompt={card.id_question ?? card.back}` and `answer={card.front}`. Never expose `front` / `back` in a
> component API.

### Task 3.6 — Data loading

Today the page fetches deck, cards, mastery, topics and quiz-ready counts in one server pass for a
single scroll. Under Option A only **Overview** needs all of it at first paint. Cards and Insights can
stream behind `Suspense` as they already partly do. Do not fetch a segment's data until that segment is
the active one, but **do** keep the counts in the header and segment labels on the first pass — they
are part of the persistent chrome.

### Task 3.7 — Mobile (390px)

Per `mockups/src/deck-a-m.html`. Compact header with a five-up telemetry strip; the segment bar scrolls
horizontally with the active segment scrolled into view; the launcher stacks its buttons
(`Start quiz` / `Review`, both 44px); `Add content` is a single 50px dashed bar; the scheduler-state bar
and its legend survive; weakest concepts sits in a `.well`.

**Acceptance**
- [ ] Overview shows exactly **three planes**: one `.raised`, one `.surface`, one `.well`.
- [ ] Exactly one filled button on the page.
- [ ] The deck's due count is the largest number on the screen.
- [ ] `?tab=cards` deep-links, survives back-navigation, and does not scroll-jump.
- [ ] No segment renders a zero-count stacked-bar segment.
- [ ] Every state swatch is paired with a word and a number.
- [ ] `AddCardForm`, `PDFUploadZone`, `BulkImportModal`, `DeckChatWidget`, `DeckCardsManager`,
      `WeakestConcepts`, `QuizHistorySection` are all still reachable. **Nothing was deleted.**
- [ ] Both themes reviewed. Gate passes.

---

## 6. Phase 4 — Drift fixes (~0.5 d)

These are **not** part of the Rev. C design. They are pre-existing defects found while reading the
repo for Run 6. Two of the five items reported in the artifact turned out to be non-issues; they are
recorded here so nobody re-opens them.

### Task 4.1 — Stop faux-bolding Instrument Serif · **~20 sites**

`src/app/layout.tsx:28-32` loads `Instrument_Serif({ weight: ["400"] })`. **The face ships at 400
only.** Every `font-medium` (500) applied to it makes the browser synthesise a bold by smearing the
outline. §3.2's No Bold Serif Rule is explicit: *"if a heading looks weak, adjust its size step or
tracking, not its weight."*

Remove `font-medium` from every `font-serif` element. Confirmed sites:

```
src/app/error.tsx:47                                    src/components/ui/shared/Flashcard.tsx:132,142
src/app/dashboard/error.tsx:47                          src/components/ui/shared/QuizAssessmentClient.tsx:543,570
src/app/not-found.tsx:41                                src/components/ui/shared/FlashcardReviewClient.tsx:633,672,783
src/app/s/[token]/page.tsx:111                          src/components/ui/shared/IdentificationMode.tsx:114
src/app/dashboard/(shell)/[deckId]/page.tsx:366         src/components/ui/shared/MCQMode.tsx:165
src/app/login/LoginClient.tsx:278,318                   src/components/ui/shared/DashboardOnboarding.tsx:80
src/app/login/update-password/page.tsx:93,107           src/components/ui/shared/Wordmark.tsx:31 (+ the doc comment on :24)
src/components/landing/HeroSection.tsx:74               src/components/landing/FeatureGrid.tsx:64
src/components/landing/HowItWorks.tsx:43
```

And in `globals.css`: `.flip__body { font-weight: 500 }` → `400`.

Re-derive the list before editing — Phases 1–3 will have moved some of these:

```bash
grep -rn "font-serif" src --include="*.tsx" | grep -E "font-medium|font-semibold|font-bold"
grep -n -A6 "font-family: var(--font-serif)" src/app/globals.css | grep "font-weight"
```

**Expect the headings to look slightly lighter.** That is the correct rendering of the face and is not
a regression. If a heading now reads weak, change its size step — do not put the weight back.

### Task 4.2 — Reconcile the type scale · three sources, two disagreeing

Verified state:

| Source | `--type-display-lg` | Consumers |
|---|---|---|
| `COGNIT_DESIGN_SYSTEM.md` §3.3 (Rev. B) | `3rem` / 48px, plus `--type-display-xl: 4.125rem` | — |
| `src/app/globals.css:106` | `2.75rem` / 44px, no `-xl` step | — |
| Components | hardcode `text-[3rem]`, `text-[66px]` | all of them |

**`grep -rn "type-display" src --include="*.tsx"` returns 0.** The tokens are dead code that also
disagrees with the spec. The components follow the *spec*, not the tokens.

Fix: make `globals.css` match the spec, then make the components consume it.

```css
  /* Display steps — Instrument Serif (§3.3, 1.5x enlarged scale) */
  --type-display-xl: 4.125rem;  /* 66px — landing hero, login wordmark  */
  --type-display-lg: 3rem;      /* 48px — page hero                     */
  --type-display:    2.25rem;   /* 36px — page title (h1)               */
  --type-display-sm: 1.5rem;    /* 24px — section heading (h2)          */
```

Then replace `text-[3rem]` with `text-[length:var(--type-display-lg)]` (or a `.d-lg` utility) at every
site, and `text-[66px]` in `Wordmark` with `--type-display-xl`. Phases 1–3 already move the login and
deck `h1` to 36px — those become `--type-display`.

Do this **after** Phases 1–3 so you are not editing the same lines twice.

### Task 4.3 — Theme the landing vignette

`src/components/landing/LandingBackground.tsx:436` hardcodes
`rgba(0, 0, 0, 0.45)` for the edge vignette, applied in **both** themes — so light mode gets a heavy
dark vignette on a `#fbfbfc` ground. Every other layer in that file is correctly themed through
`--blob`.

Add a themed token and consume it:

```css
:root  { --landing-vignette: rgb(24 24 27 / .10); }
.dark  { --landing-vignette: rgb(0 0 0 / .45); }
```

```tsx
background:
  'radial-gradient(ellipse 90% 80% at 50% 40%, transparent 45%, var(--landing-vignette) 100%)',
```

While in this file, note for a future run — **do not fix in this phase**: the `--blob` halos,
grain and canvas are all `opacity`-tuned per theme and are working; only the vignette is wrong.

### Task 4.4 — Delete `--landing-stipple`

Declared at `globals.css:172` and `:236`, consumed nowhere. Remove both. (If Phase 0 Task 0.4 already
did this, confirm and move on.)

### Not fixing — recorded so they are not re-opened

| Reported | Verdict |
|---|---|
| "Deck page section order differs from the brief" | **Not a defect.** The brief's §4.3 described the 143-line `lg:grid-cols-2` block as content ingestion followed by a study/quiz row. It is the reverse: the grid *is* the study/quiz pair (lines 436–578) and ingestion follows it. The **brief** was wrong; the code was right. Phase 3 rebuilds this region anyway. |
| "Unstyled anchors inherit indigo" | **Not a defect in the app.** Tailwind v4 Preflight ships `a { color: inherit }` at `node_modules/tailwindcss/preflight.css:87`. The problem was real only in the standalone mockup stylesheet, which has no Preflight. **Do not add `a { color: inherit }` to `globals.css`** — it is already there via Preflight. |

**Acceptance**
- [ ] `grep -rn "font-serif" src --include="*.tsx" | grep -E "font-medium|font-semibold|font-bold"`
      returns **nothing**.
- [ ] `sed -n '/^\.flip__body/,/^}/p' src/app/globals.css` shows `font-weight: 400`.
- [ ] `grep -rn "text-\[3rem\]\|text-\[66px\]" src` returns nothing.
- [ ] `grep -rn "type-display" src --include="*.tsx" | wc -l` is **> 0**.
- [ ] `grep -rn "rgba(0, 0, 0, 0.45)" src` returns nothing.
- [ ] `grep -rn "landing-stipple" src` returns nothing.
- [ ] The landing page in **light mode** has no dark vignette.
- [ ] Gate passes.

---

## 7. Phase 5 — Verification, audit and spec update (~0.5 d)

### Task 5.1 — The colour-alone audit

This is the action item from the palette finding, and it is a verification pass, **not** a palette
change. The state channel is out of scope per Rev. B §8.

Measured with the dataviz palette validator (OKLab ΔE × 100):

```
LIGHT  --state-learning #a16207  ↔  --state-due #c2410c
       ΔE 0.6  (deuteranopia)   ·   ΔE 8.8  (normal vision)

DARK   --state-learning #facc15  ↔  --state-due #fb923c     ΔE 14.6 (normal vision)
       --state-mastered #4ade80  ↔  --state-learning #facc15  ΔE 6.8 (protanopia)
```

**In light mode, due and learning are effectively the same colour to a deuteranope**, and they are hard
to separate even with full colour vision. The channel is legal *only* because §2.3 requires every state
colour to be paired with a label, a count or a position — which makes that rule load-bearing rather
than belt-and-braces.

Walk every surface and confirm no state colour is the **sole** carrier of meaning:

- [ ] Dashboard telemetry — `Due 519`, `Streak 14d`: colour + label + number. ✔ by construction.
- [ ] `DeckRow` state tick — carries no label, but every fact it encodes is spelled out in the numbers
      to its right, and it is `aria-hidden`. Confirm that is still true after Phase 2.
- [ ] `SignalPanel` recall legend — Due / Learning / Mastered swatches **must** keep their words.
- [ ] `StreakPanel` day strip — today's cell is `--state-streak` with only a `title`. **Add a visible
      marker** (a `Today` label under the strip, or the date in the `label` step) so the distinction is
      not colour-only.
- [ ] Deck page scheduler-state bar — every segment paired with a word and a count.
- [ ] Grade keys — colour + name + digit + interval. ✔ by construction.
- [ ] Quiz options — `--state-mastered` / `--state-lapsed` paired with the inline result word. ✔.

Record the result in the completion report. Any place that fails is a bug to fix in this phase.

### Task 5.2 — The full manual walkthrough, both themes

1. **`/login`** — bracket-framed specimen card and four grade keys with real intervals; divider fades;
   `h1` is 36px serif at 400; tab order skips the decorative deck.
2. **`/login` at 390px** — inputs are 16px; the form fits without scrolling.
3. **`/dashboard` at exactly 1440×900** — greeting left, telemetry right, due band, forecast starting
   tomorrow, Create Deck, heatmap, recall, streak **and ≥ 9 deck rows**, no scrolling.
4. **`/dashboard` at 390px** — metrics above the deck list.
5. **`/dashboard/[deckId]`** — three planes on Overview; one filled button; segments deep-link.
6. **`/dashboard/[deckId]?tab=cards`** — loads directly on Cards; back-navigation preserves it.
7. **`/dashboard/[deckId]/study`** — unchanged by Run 6. Card is corner brackets on the flat ground,
   grade keys in a bottom band, zero layout shift on reveal. **Confirm Run 6 did not regress it.**
8. **`/`** — landing page vignette is correct in light mode.
9. **Reduced motion** — nothing animates. The ambient field is static by construction.
10. **Performance** — 10 s idle recording on `/dashboard` shows no recurring scripting or paint.

### Task 5.3 — Update `COGNIT_DESIGN_SYSTEM.md` to Rev. C

**Do not skip this.** The spec is what future agents read; leaving it stale is what produced the type-token
drift in the first place.

- **§1 thesis** — add the plane principle: dense surfaces stay flat; the screen's primary object takes
  `.raised`; subordinate contained content takes `.well`. Depth is light and elevation, never colour.
- **§1.1 anti-pattern list** — amend the "decorative blurred orbs" and "grain overlays" rows. The ban is
  on **chromatic** decoration. Monochromatic ambient lighting — low-opacity white/zinc radial fields,
  fine grain, vignettes, specular hairlines — is **permitted** for creating planes, on CSS-only static
  terms for authenticated surfaces. Record the performance constraint alongside it.
- **§2.2 state channel** — add the measured CVD figures from Task 5.1 and a sentence stating that
  §2.3's colour-is-never-alone rule is load-bearing, not decorative.
- **§3.3 type scale** — reconcile with `globals.css` per Task 4.2 and state that components consume the
  tokens, not hardcoded values.
- **§4.3 elevation** — add `--elevate-inset` and the recessed step to the scale and its assignment table.
- **§7.1** — add `.raised`, `.well`, `.spec` and the `.rule` family alongside `.surface` and `.panel`.
- **New §7.10 — Ambient field.** Document `AmbientField`, where it mounts, and why it is CSS-only.
- **§7.9 telemetry** — note that on the dashboard it is right-aligned opposite a greeting.
- Bump the header to **Rev. C** and add a changelog line naming this document as the source.

### Task 5.4 — Completion report

Follow the five-section format from `COGNIT_UI_CORRECTIONS_PLAN.md` §10: what was done per phase per
task with files; the browser walkthrough; findings deferred with `file:line`; deviations from this plan
and why; and next steps confirming `COGNIT_DESIGN_SYSTEM.md` is at Rev. C.

---

## 8. What is explicitly NOT changing

Guard against over-correction. "Make it less flat" is exactly the instruction that tempts a return to
AI-template decoration.

- The **obsidian palette** — neutral zinc, no indigo, no hue in the ground.
- The **state channel** — due / learning / mastered / lapsed / streak as the only source of hue.
  **Easy stays colourless.**
- **Geist Mono + `tabular-nums`** for every number the user reads as data.
- **Instrument Serif for display type ≥24px, at weight 400 only.** Geist Sans for chrome and body below.
- **Deck rows, not tiles** — flat, 1px dividers, state ticks.
- The **radius scale** (4/6/8/12/16) and the **elevation scale** (`--elevate-flat` / `-1` / `-2`).
  Run 6 adds `--elevate-inset`; it does not alter the existing three.
- The **z-scale**, the **accessibility contract** (§9), and reduced-motion handling.
- The **study and quiz canvases** — Fix Packs 3 and 4 are not reopened. Run 6 must not regress them.
- `projectedInterval()` driving real SM-2 intervals on grade keys.
- Every item on Rev. A §1.1 that is still banned: **no coloured orbs, no glow, no sparkles, no
  backdrop-blur outside a modal scrim, no indigo, no Orbitron.**

> The ambient field in Phase 0 is **neutral light**, not glow. Every value is white or black at low
> opacity. If you find yourself typing a coloured `radial-gradient`, stop.

---

## 9. Definition of done

- [ ] Phase 0 — `--raised-bg`, `--recess`, `--elevate-inset`, `--spec` live in both themes;
      `.raised` / `.well` / `.spec` / `.rule` family shipped; `AmbientField` mounted on authenticated
      surfaces and **not** on `/study` or `/quiz`; zero per-frame cost measured.
- [ ] Phase 1 — Login's left half is a product still life; divider is a gradient hairline; `h1` at 36px;
      the decorative grade deck is `aria-hidden` and unfocusable.
- [ ] Phase 2 — All five owner requirements met; heatmap **and** ≥ 9 deck rows above the fold at
      1440×900; Import PDF gone; forecast starts tomorrow; the greeting never renders an email.
- [ ] Phase 3 — Deck page is Option A with three planes on Overview; segment state is a URL param;
      nothing was deleted.
- [ ] Phase 4 — No synthetic bold on Instrument Serif anywhere; type tokens live and consumed;
      landing vignette themed; `--landing-stipple` gone.
- [ ] Phase 5 — Colour-alone audit recorded; all ten manual checks done in **both** themes;
      `COGNIT_DESIGN_SYSTEM.md` at Rev. C.
- [ ] No anti-pattern from Rev. A §1.1 reintroduced.
- [ ] Full gate passes, output pasted.
