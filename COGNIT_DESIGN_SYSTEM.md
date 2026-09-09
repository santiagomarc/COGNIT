# Cognit — Design System

**Codename:** Obsidian Telemetry
**Status:** Approved 2026-09-09 · Rev. B (corrected via `COGNIT_UI_CORRECTIONS_PLAN.md`)
**Applies to:** Next.js 16 (App Router) · React 19 · Tailwind v4 (CSS-first) · Framer Motion 12

> **Changelog (Rev. B):** Refined 5-step radius scale, 3-step elevation scale, widened Instrument Serif to display headings ≥24px, added `.panel` for sparse surfaces, confirmed unfilled bracketed card canvas, and adjusted button primary budget.

---

## 0. How to use this document

This is the **single source of truth** for Cognit's visual language. If you are an AI agent or
engineer touching any UI in this repository, read §1–§4 before writing code, then the component
spec for whatever you are building.

Rules of precedence, highest first:

1. An explicit instruction from the user in the current task.
2. This document.
3. Whatever the existing code happens to do.

Point 3 matters: **most of the current codebase predates this system and actively contradicts it.**
Do not pattern-match off neighbouring components. If you open a file and it uses `glass-card`,
`glow-title`, `border-primary/10` or an indigo accent, that file has not been migrated yet — build
the new thing per this document, do not copy the old thing.

Companion document: `COGNIT_REDESIGN_EXECUTION_PLAN.md` (phases, defects, sequencing).

---

## 1. The thesis

> Cognit is an instrument that reports the state of your memory.

Everything follows from that sentence. It is a study tool used for 40-minute sessions, 50 cards at a
time, by people under mild time pressure. It competes with Anki and RemNote. It must read as
**precise, quiet and trustworthy** — never as a game, never as a demo.

Three principles:

**1. Almost nothing is filled on dense surfaces; sparse surfaces get contained, elevated panels.**
On dense operational screens (dashboard, tables), structure is carried by 1px rules on a single flat ground with `--elevate-flat`. On sparse screens (login, modals, empty states), the focal object is enclosed in a `.panel` with `--radius-xl` and `--elevate-2` so it has tangible subject/figure presence. Fill remains a disciplined resource.

**2. Colour is a state channel, not decoration.**
The accent is white (dark theme) / near-black (light theme). Hue is reserved *exclusively* for SM-2
card state: due, learning, mastered, lapsed, streak. If a colour on screen does not encode a fact
about the user's memory, it is a bug.

**3. Density is the aesthetic.**
14px base, tabular numerals, deck rows instead of deck tiles. A user with eight decks should see
eight decks. Whitespace is spent on the study canvas — where one question sits alone — and nowhere else.

### 1.1 The anti-pattern list — do not reintroduce

These were removed deliberately. Adding any of them back is a regression, not a polish:

| Banned | Why | Instead |
|---|---|---|
| `backdrop-blur` on content surfaces | Degrades text contrast, costs compositing on the study canvas | Opaque `--surface` + `--elevate` |
| Glow / neon `box-shadow` / `text-shadow` | Reads as a game HUD | Weight, tracking, and a 1px rule |
| Decorative blurred "orbs" / gradient blobs | The single loudest AI-template tell | Nothing. Flat ground. |
| Grain / noise overlays | Fixed full-viewport blend layer for 3.5% opacity | Nothing |
| Indigo-tinted borders (`border-primary/10`) | Leaves the app with no true neutral | `--border` (real zinc) |
| Gradient text or gradient headings | — | `--ink`, weight 600 |
| `<Sparkles/>`, `<Brain/>`, `<Wand2/>`, robot/AI glyphs | 17 sparkle instances is why this redesign exists | A count, a label, or nothing |
| Orbitron (or any sci-fi display face) | — | Geist Sans |
| Cursor-tracking 3D tilt on readable content | Text plane is never square to the eye | Static card |
| Four+ competing radii | Radius carried no meaning | Three steps, by role (§5) |
| Emoji as section markers or status | — | A 2px state tick |

---

## 2. Colour

### 2.1 Structure

Both themes are **true neutral zinc**. There is no blue cast in the ground, no warm cast. This is
deliberate: it is what makes the state channel (§2.2) legible as the only hue on screen.

Dark is the default and the design's home. Light is fully supported and gets equal QA — it is not
an inversion, it is its own composition (surfaces go *lighter* than the ground in light mode, and
elevation flips from an inner highlight to a hairline drop shadow).

#### Dark (default)

| Token | Hex | Role | Contrast on ground |
|---|---|---|---|
| `--bg` | `#09090b` | Page ground | — |
| `--surface` | `#131316` | Filled panel, card, band | — |
| `--surface-raised` | `#1f1f23` | Key face top, hover fill | — |
| `--border` | `#27272a` | Decorative divider, table rule | 1.34:1 · non-load-bearing |
| `--border-strong` | `#3f3f46` | Enclosure, hover edge | 1.91:1 · non-load-bearing |
| `--border-control` | `#63636d` | **Edge of an interactive control** | 3.35:1 · meets WCAG 1.4.11 |
| `--ink` | `#fafafa` | Primary text, accent | 19.06:1 · AAA |
| `--ink-dim` | `#a1a1aa` | Secondary text, values | 7.76:1 · AAA |
| `--ink-dimmer` | `#82828b` | Labels, captions, keycap digits | 5.22:1 · AA |
| `--ink-faint` | `#52525b` | **Non-text only** — disabled marks, empty ticks | 2.57:1 |
| `--accent` | `#fafafa` | = `--ink` | — |
| `--accent-ink` | `#09090b` | Text on accent fill | — |
| `--elevate` | `inset 0 1px 0 rgb(255 255 255 / .06)` | The chamfer | — |
| `--key-face` | `linear-gradient(180deg, #1f1f23, #131316)` | Grade key | — |
| `--key-edge` | `0 1px 0 #000` | Grade key bottom | — |

#### Light

| Token | Hex | Role | Contrast on ground |
|---|---|---|---|
| `--bg` | `#fbfbfc` | Page ground | — |
| `--surface` | `#ffffff` | Filled panel (lighter than ground) | — |
| `--surface-raised` | `#f4f4f5` | Key face bottom, hover fill | — |
| `--border` | `#e4e4e7` | Decorative divider | 1.23:1 · non-load-bearing |
| `--border-strong` | `#d4d4d8` | Enclosure, hover edge | 1.43:1 · non-load-bearing |
| `--border-control` | `#8a8a93` | **Edge of an interactive control** | 3.31:1 · meets WCAG 1.4.11 |
| `--ink` | `#18181b` | Primary text, accent | 17.13:1 · AAA |
| `--ink-dim` | `#52525b` | Secondary text, values | 7.47:1 · AAA |
| `--ink-dimmer` | `#71717a` | Labels, captions, keycap digits | 4.67:1 · AA |
| `--ink-faint` | `#a1a1aa` | **Non-text only** | 2.48:1 |
| `--accent` | `#18181b` | = `--ink` | — |
| `--accent-ink` | `#ffffff` | Text on accent fill | — |
| `--elevate` | `0 1px 2px rgb(24 24 27 / .06)` | Hairline lift (replaces chamfer) | — |
| `--key-face` | `linear-gradient(180deg, #ffffff, #f4f4f5)` | Grade key | — |
| `--key-edge` | `0 1px 0 #d4d4d8` | Grade key bottom | — |

> **Three border tokens, not two.** `--border` and `--border-strong` are decorative and are exempt
> from contrast minimums. `--border-control` is the edge of anything a user can click, focus or
> operate, and must stay ≥3:1 — WCAG 2.2 SC 1.4.11 (Non-text Contrast). Do not substitute one for
> another to make something "look softer".

### 2.2 The state channel

The **only** source of hue in the product. Each value encodes a fact from the SM-2 scheduler.

| State | Dark | Light | Means |
|---|---|---|---|
| `--state-due` | `#fb923c` | `#c2410c` | Card is due now / overdue |
| `--state-learning` | `#facc15` | `#a16207` | In the learning queue, interval < 1d |
| `--state-mastered` | `#4ade80` | `#15803d` | Interval ≥ mastery threshold |
| `--state-lapsed` | `#f87171` | `#b91c1c` | Graded `again` — ease dropped |
| `--state-streak` | `#ffb020` | `#b45309` | Session active / consecutive-day streak |
| `--state-neutral` | `var(--ink)` | `var(--ink)` | No friction — see below |

All state values are **AA or better as text** on both their ground and their surface, in both themes.
They are safe for text, for 2px ticks, and for bar fills.

**Grade key mapping** — note the deliberate asymmetry:

| Grade | Key | Colour | Rationale |
|---|---|---|---|
| Again | `1` | `--state-lapsed` | Ease will drop |
| Hard | `2` | `--state-due` | Comes back soon |
| Good | `3` | `--state-mastered` | Interval advances |
| Easy | `4` | `--state-neutral` | **Deliberately colourless** |

*Easy is white/ink, not a fourth hue.* Easy means "no friction" — the absence of a signal is the
signal. Four saturated keys would compete with the card the user is trying to read. Do not "fix"
this by giving Easy a colour.

### 2.3 Rules

- Never introduce a hue outside §2.2. No brand purple, no indigo, no cyan.
- Never use a state colour decoratively (a green heading, an orange divider). If it is not
  reporting card state, it is `--ink*`.
- Never hard-code a hex in a component. Every colour comes from a token, so both themes resolve.
- A colour is never the *only* carrier of meaning. Pair every state colour with a label, a count or
  a position (WCAG 1.4.1).

---

## 3. Typography

### 3.1 Stack

```css
--font-sans:  'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
--font-mono:  'Geist Mono', 'SF Mono', ui-monospace, Menlo, monospace;
--font-serif: 'Instrument Serif', 'Iowan Old Style', Georgia, serif;
```

Loaded via `next/font/google` in `src/app/layout.tsx`. **Orbitron and Poppins are removed** —
delete the imports, the `--font-orbitron` / `--font-poppins` variables and the `.glow-title` class.

### 3.2 Roles — these are hard assignments

| Face | Used for | Never used for |
|---|---|---|
| **Geist Sans** | All UI chrome, body, buttons, and section headings < 24px | Numeric data, display headings ≥24px |
| **Geist Mono** | Every number the user reads as data: counts, due totals, ease factors, intervals, timers, percentages, dates, keycaps, uppercase micro-labels | Prose |
| **Instrument Serif** | **Display headings ≥24px (`h1`, large section heads, login brand/title), and the card prompt/answer** | Body text, chrome, buttons, or any text < 24px |

> **No Bold Serif Rule:** Instrument Serif is a high-contrast editorial serif designed at regular weight (400). It has **no bold weight**. Never apply `font-bold` or `font-semibold` to Instrument Serif — if a heading looks weak, adjust its size step or tracking, not its weight.

### 3.3 Scale

Base is **14px** for application chrome.

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

Rules:
- Display type gets `letter-spacing: -0.015em` and `text-wrap: balance`. Never set Instrument Serif below 24px.
- Prose measure caps at ~68ch; the card prompt caps at **32ch** (see §7.6).
- Every column of digits gets `font-variant-numeric: tabular-nums`. No exceptions.
- Uppercase is reserved for the `label` step. Do not uppercase buttons or headings.

---

## 4. Space, radius, elevation

### 4.1 Spacing

4px base unit. Use `4 · 6 · 8 · 10 · 12 · 16 · 20 · 26 · 32 · 40`. Lay out sibling groups with
flex/grid `gap` — never per-element margins that collapse or double.

### 4.2 Radius — five-step proportional scale

Corner radius is proportional to the component's bounding box. A 2px corner on a 44px input or a 320px panel reads as an unresolved right angle.

| Token | Value | Applies to |
|---|---|---|
| `--radius-xs` | `4px` | Keycaps (`<Kbd>`), tags, micro-badges, indicators |
| `--radius-sm` | `6px` | Interactive controls: buttons (`h-[40px]`), chips, segment toggles |
| `--radius-md` | `8px` | Data controls: inputs (`h-[44px]`), quiz options (`.opt`), grade keys (`.key`) |
| `--radius-lg` | `12px` | Structural containers: dense `.surface` blocks, due-now band, inner cards |
| `--radius-xl` | `16px` | Sparse contained objects: `.panel` (login card, modals, dialogs) |
| `--radius-pill` | `999px` | Avatars, full-pill state badges |

Aliases:
- `--radius-control: var(--radius-sm)` (6px)
- `--radius-container: var(--radius-lg)` (12px)

> **Proportionality Rule:** Never put a corner < 6px on any interactive element ≥40px tall. Inputs get 8px; buttons get 6px; panels get 16px.

### 4.3 Elevation — three steps, neutral depth

There are no colored shadows, no glows, and no backdrop blurs behind content. Depth is neutral shadow and subtle highlights:

| Step | Dark Mode | Light Mode | Use on |
|---|---|---|---|
| `--elevate-flat` | `inset 0 1px 0 rgb(255 255 255 / 0.05)` | `0 1px 2px rgb(24 24 27 / 0.05)` | Dense surfaces — deck table, telemetry, forecast |
| `--elevate-1` | `inset 0 1px 0 rgb(255 255 255 / 0.06), 0 1px 3px rgb(0 0 0 / 0.5)` | `0 1px 3px rgb(24 24 27 / 0.08)` | Interactive raised things — grade keys, buttons at rest, options, due-now band |
| `--elevate-2` | `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 8px 28px -8px rgb(0 0 0 / 0.7)` | `0 8px 28px -8px rgb(24 24 27 / 0.16)` | **Sparse-screen panels and modals** — login card, command palette, dialogs |

Aliases:
- `--elevate: var(--elevate-flat)` (backward-compatibility alias)

### 4.4 Z-index scale

Replaces the current ad-hoc `50 / 100 / 110 / 140 / 200`. **This scale is the fix for F-01.**

```css
--z-rail:    20;   /* left navigation rail            */
--z-sticky:  40;   /* sticky headers, progress bars    */
--z-overlay: 100;  /* scrims, pause overlay            */
--z-modal:   110;  /* dialogs above their scrim        */
--z-toast:   120;  /* sonner                           */
--z-skip:    200;  /* skip-to-content                  */
```

Never write a raw `z-50` again. If something needs a new layer, add a token here.

---

## 5. Motion

**Instruments do not bounce.** The previous system used a spring for everything (nine spring presets
in `src/lib/motion-configs.ts`). The new rule:

| Situation | Motion | Value |
|---|---|---|
| Focus indicator travel | Linear | `90ms linear` |
| Hover, colour, border | Ease | `120ms ease` |
| Key press / release | Ease | `70ms ease` |
| Panel + overlay enter/exit | Ease-out | `160ms cubic-bezier(.2,.8,.2,1)` |
| Card flip | Ease-out | `340ms cubic-bezier(.2,.8,.2,1)` |
| **Card leaving the stack** | **Spring** | `stiffness 260, damping 24` |

That last row is the **only** spring left in the product. It exists because a graded card should feel
like it has mass. Everything else is a duration and an easing curve.

Every animation must be disabled under `prefers-reduced-motion: reduce`. The existing global guard in
`globals.css` is good and must be preserved — do not regress it.

---

## 6. Iconography

- **Functional or absent.** If a label is clearer than a glyph, ship the label.
- Stroke `1.5`, size `15px` in the rail / `16px` inline. Lucide is fine as a source.
- Permitted: arrows, chevrons, search, settings, plus, close, pause, play, check, alert.
- Banned: sparkles, brains, robots, wands, rockets, trophies, flames, lightbulbs, orbs.
- **A number is a better badge than an icon.** "31 due" beats a flame glyph.

---

## 7. Component specs

### 7.1 Surface and Panel

The structural container classes:

```css
/* dense: flat, structural — deck table, forecast, telemetry */
.surface {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevate-flat);
}
.surface--interactive { transition: border-color 120ms ease; }
.surface--interactive:hover { border-color: var(--border-strong); }

/* sparse: a real, contained, elevated object — login card, modals, dialogs */
.panel {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--elevate-2);
}

/* raised interactive surface */
.surface--raised {
  box-shadow: var(--elevate-1);
}
```

Only interactive surfaces get a hover state. A static panel that lights up on hover is noise.

### 7.2 Button

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-control);   /* 3:1 — it is a control */
  font-size: 13px; font-weight: 500;
  color: var(--ink);
  background: transparent;
  transition: border-color 120ms ease, background 120ms ease;
}
.btn:hover { background: var(--surface-raised); }
.btn:active { transform: translateY(1px); }

.btn--primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  font-weight: 600;
}
.btn--ghost { border-color: transparent; }
.btn--ghost:hover { border-color: var(--border-strong); }
```

At most one primary button per screen. A screen whose primary action is a specialised control (e.g. the grade deck on the study canvas) has none. The dashboard's is "Start session".

> **Do not** wrap buttons in `framer-motion`. The current `button.tsx` returns an `m.button` with a
> `whileTap` spring, which pulls the animation runtime into every page that renders a button. A CSS
> `:active` transform is free and, for a tactile system, more accurate.

### 7.3 Kbd

Cognit is a keyboard instrument and currently renders **two** keycaps in the entire app, both hidden
below `sm`. This primitive is mandatory wherever a binding exists.

```css
.kbd {
  font-family: var(--font-mono);
  font-size: 10px; line-height: 1.5;
  padding: 1px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--ink-dim);
  white-space: nowrap;
}
```

**Bind the keycap to the control it triggers**, not to a hint strip in the footer. Never hide it
responsively — mobile users benefit from seeing that a hardware keyboard works.

Complete binding inventory (all already implemented in code — they just are not shown):

| Key | Action | Where |
|---|---|---|
| `Space` / `Enter` | Reveal answer | Study |
| `1` `2` `3` `4` | Grade again / hard / good / easy | Study, after reveal |
| `1`–`n` | Select MCQ option | Quiz · `MCQMode` |
| `Enter` | Submit answer | Quiz · `IdentificationMode` |
| `Space` | Next question | Quiz, after answering |
| `P` | Pause / resume | Quiz — **currently undocumented in the UI** |
| `⌘K` | Command palette | Global (new) |
| `S` | Start session | Dashboard (new) |

### 7.4 Grade key — the tactile exception

The one place the flat system yields. Grading is performed 50 times a session, by hand, under time
pressure; a flat 1px cell gives no confirmation that the press registered.

```css
.key {
  position: relative;
  background: var(--key-face);
  border: 1px solid var(--border-control);
  border-top-color: var(--border-strong);
  border-radius: var(--radius-control);
  box-shadow: var(--elevate), var(--key-edge);
  padding: 11px 12px 10px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  overflow: hidden;
  transition: transform 70ms ease, box-shadow 70ms ease;
}
/* 2px state edge along the top */
.key::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--key-state);
}
.key:active, .key.is-down {
  transform: translateY(1px);
  box-shadow: inset 0 2px 5px rgb(0 0 0 / .5);
}
.key .kn { font-size: 13px; font-weight: 600; }              /* Again / Hard / … */
.key .ki { font-family: var(--font-mono); font-size: 11px;    /* 2m / 6m / 4d / 11d */
           color: var(--ink-dim); font-variant-numeric: tabular-nums; }
.key .kk { position: absolute; top: 8px; left: 9px;           /* the digit 1–4 */
           font-family: var(--font-mono); font-size: 10px; color: var(--ink-dimmer); }
```

- `--key-state` is set per key from §2.2's grade mapping.
- The keycap digit uses `--ink-dimmer`, **not** `--ink-faint` (which fails as text).
- Each key shows its **real computed SM-2 interval**, so the consequence is visible before commit.
- On touch, fire `navigator.vibrate(10)` on press. Guard for support.

**Signature micro-interaction — "Detent".** On commit the key travels 1px, its inner highlight
inverts to an inner shadow, and the interval readout *rolls* to its new value like an odometer: each
digit translates up through a masked track over 180ms, staggered 20ms. Respect reduced-motion.

### 7.5 State tick & deck row

A deck is a **row of type with its numbers right-aligned**, not a tile.

```
▍ Neuroanatomy              128    31    2.41   ▓▓▓▓▓▓▓░  74%    2h ago
│ name                      cards  due   ease   mastery         reviewed
└─ 2px state tick, 16px tall, --state-*
```

- Tick: `width: 2px; height: 16px; border-radius: 1px;` coloured by the deck's dominant state.
- All numerics: Geist Mono, `tabular-nums`, right-aligned.
- Due count uses `--state-due` when > 0, `--ink-faint` when 0.
- Mastery bar: 104px × 3px, track `--border`, fill `--ink-dim`, stepping to `--state-mastered` at ≥70%.
- Row divider: 1px `--border`. No card, no radius, no shadow.

### 7.6 FlipCard

The study canvas card has **no background fill, no full border, and no box-shadow**. It sits directly on the flat ground, framed only by `CornerBrackets`:

Four states, driven by **one `data-state` attribute** rather than conditional class strings.

```tsx
type FlipState = 'default' | 'flipping' | 'graded' | 'focus';

<article data-state={state} data-grade={lastGrade ?? undefined} className="flip">
  <div className="flip__face flip__face--prompt">{prompt}</div>
  <div className="flip__face flip__face--answer">{answer}</div>
  <CornerBrackets />
</article>
```

> **Naming trap — read this before touching card data.**
> In this schema `card.front` is the **answer** and `card.back` is the **question**. Verified in
> `src/app/actions/quiz.ts:66-67` (`correct_answer_text: card.front`), `MCQMode.tsx:61`, and
> `src/app/s/[token]/page.tsx:152`. The convention is applied consistently, so it is not a bug — but
> the field names lie. **Component props must be named `prompt` / `answer`**, mapped at the boundary:
> ```tsx
> <FlipCard prompt={card.id_question ?? card.back} answer={card.front} />
> ```
> Never expose `front` / `back` in a component API.

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
  /* NO cursor tilt. The text plane stays square to the eye. */
}

.flip__face {
  backface-visibility: hidden;
  display: grid; place-items: center;
  padding: clamp(1.5rem, 4vw, 2.75rem);
  font-family: var(--font-serif);
  font-size: clamp(1.5625rem, 2.4vw, 2.125rem);   /* 25px → 34px */
  line-height: 1.32;
  text-align: center;
  text-wrap: balance;
  max-width: 32ch;
  margin-inline: auto;
  overflow-y: auto;             /* actually reachable — no line-clamp */
  overscroll-behavior: contain;
}
.flip__face--answer { transform: rotateY(180deg); }

/* 1 · DEFAULT */
.flip[data-state="default"]  { transform: rotateY(0deg); }

/* 2 · FLIPPING / revealed */
.flip[data-state="flipping"] { transform: rotateY(180deg); }

/* 3 · GRADED — 160ms state flash, then the card leaves the stack */
.flip[data-state="graded"] { animation: commit 160ms ease-out; }
.flip[data-state="graded"][data-grade="again"] { --commit: var(--state-lapsed); }
.flip[data-state="graded"][data-grade="hard"]  { --commit: var(--state-due); }
.flip[data-state="graded"][data-grade="good"]  { --commit: var(--state-mastered); }
.flip[data-state="graded"][data-grade="easy"]  { --commit: var(--state-neutral); }

@keyframes commit {
  from { box-shadow: inset 0 0 0 1px var(--commit); }
  to   { box-shadow: inset 0 0 0 1px transparent; }
}

/* 4 · KEYBOARD FOCUS — corner brackets, not a ring */
.flip:focus-visible { outline: none; }
.flip:focus-visible .brk { border-color: var(--accent); }

@media (prefers-reduced-motion: reduce) {
  .flip { transition: none; }
  .flip[data-state="graded"] { animation: none; }
}
```

**Never use `line-clamp` on card content.** A clamp puts `overflow: hidden` on the paragraph, so it
never overflows its parent and the parent's `overflow-y: auto` has nothing to scroll — the text is
truncated *and* unreachable. This was defect F-02. Cognit generates cards from PDFs; long answers are
the norm.

### 7.7 Corner brackets (focus & card bounds)

The system's focus idiom. Four 14px corners, 1px, drawn on the element's bounds — never a glowing ring.

```css
.brk { position: absolute; width: 14px; height: 14px;
       border: 1px solid var(--border-strong);
       transition: border-color 90ms linear; }
.brk--tl { top: 0; left: 0;     border-right: 0; border-bottom: 0; }
.brk--tr { top: 0; right: 0;    border-left: 0;  border-bottom: 0; }
.brk--bl { bottom: 0; left: 0;  border-right: 0; border-top: 0; }
.brk--br { bottom: 0; right: 0; border-left: 0;  border-top: 0; }
```

**Signature micro-interaction — "Reticle".** Focus brackets *travel*: moving between grade keys or
deck rows animates the set to the new bounds over `90ms linear` — deliberately not a spring.

For ordinary controls, focus is a 2px `--accent` outline at `2px` offset. Every interactive element
must have a visible focus state.

### 7.8 Overlay & modal

```css
.scrim { position: fixed; inset: 0; z-index: var(--z-overlay);
         background: color-mix(in srgb, var(--bg) 80%, transparent); }
.modal { z-index: var(--z-modal);
         background: var(--surface);
         border: 1px solid var(--border-strong);
         border-radius: var(--radius-container);
         box-shadow: var(--elevate);
         max-width: 480px; width: calc(100% - 32px); }
```

The scrim may keep a light `backdrop-filter: blur(4px)` — it sits over content that is intentionally
out of use. This is the **only** permitted blur in the product.

### 7.9 Telemetry header

The persistent strip of session/account state. Label in `label` step, value in Geist Mono.

```
DUE 47   RETENTION 87%   STREAK 14d   REVIEWED TODAY 62        [ Search  ⌘K ]
```

Values take a state colour only when the value *is* a state (`due` orange, `streak` amber).
Everything else is `--ink`.

---

## 8. Navigation architecture

**The floating dock is removed.** It occluded content on every screen to offer two live destinations
(Dashboard, Sign out) — its other two slots were permanently `disabled` — and it sat at the same
z-index as the quiz pause overlay while bypassing the quit guard (F-01, F-04).

Replacement:

| Viewport | Chrome |
|---|---|
| Desktop | 48px collapsible left **rail** (`--z-rail`) + telemetry header + `⌘K` |
| Mobile | Header breadcrumb + account sheet. **No bottom bar.** |
| `/study`, `/quiz` | **No navigation chrome at all.** The grade deck owns the bottom band. |

Rules:
- On mobile study/quiz, the grade deck **is** the bottom chrome: 64px keys inside
  `env(safe-area-inset-bottom)`, thumb-reachable, nothing floating above them.
- Bottom clearance is owned by **exactly one** element — the route layout, via
  `padding-bottom: var(--dock-clearance)` (now `0`). Pages must not add their own. The old code
  applied `pb-28` in the layout *and* again in each page: 224px of dead space (F-03).
- The `⌘K` palette is built over the existing `SemanticSearchModal`, which already has the overlay,
  focus trap and search plumbing.

---

## 9. Accessibility contract

Non-negotiable. Verify before calling any UI task done.

- **Text contrast** ≥4.5:1 (§2.1 tables give measured values). `--ink-faint` is never text.
- **Control edges** ≥3:1 → `--border-control`.
- **Focus visible** on every interactive element. Corner brackets or a 2px `--accent` outline.
- **Colour is never alone.** Every state colour is paired with a label, count or position.
- **Touch targets** ≥44×44px; grade keys are 64px tall on mobile.
- **Reduced motion** disables all animation, including the card spring and the odometer roll.
- **Keyboard** — every binding in §7.3 works and is *visible*.
- Preserve the existing skip-to-content link and `aria-live` regions.

---

## 10. Implementation notes for this stack

- **Tailwind v4, CSS-first.** Tokens live in `@theme inline` + `:root` / `.dark` blocks in
  `src/app/globals.css`. Do **not** add a `tailwind.config.js`.
- **Theme switching** is class-based: `.dark` on `<html>`, persisted to `localStorage['cognit-theme']`,
  with an inline script in `layout.tsx` preventing flash. Keep that mechanism.
- **`components.json` says `"baseColor": "neutral"`** — that is now finally true. Anything pulled via
  the shadcn CLI will land in the right palette.
- **Server components by default.** Only add `'use client'` when a component needs state or effects.
  Do not convert a server component to a client component for styling.
- **The `Card` primitive in `src/components/ui/card.tsx` hardcodes glass**
  (`bg-card/60 backdrop-blur-md border-primary/10`). It is the highest-leverage file in the repo:
  fixing it plus the CSS variables changes ~90% of the app's appearance without touching feature code.

### Class-pattern migration reference

| Role | Old | New |
|---|---|---|
| Container | `glass-card rounded-2xl` | `surface` |
| Divider | `border-primary/10` | `border-border` |
| Control edge | `border-primary/20` | `border-[--border-control]` |
| Status | `bg-primary/10 text-primary` | 2px tick, `bg-[--state-due]` |
| Telemetry | `text-xs text-muted-foreground` | `font-mono text-[10px] tracking-[.16em] uppercase tabular-nums` |
| Heading | `glow-title font-extrabold` | `font-semibold tracking-[-.03em]` |
| Keycap | *(did not exist)* | `.kbd` |

---

## 11. Quick self-check before you commit UI

1. Does every colour on screen either come from `--ink*` or report SM-2 state?
2. Is there any `backdrop-blur` outside a modal scrim?
3. Any `glow-*`, `neon`, orb, grain, sparkle or brain left in the file?
4. Are all numbers Geist Mono with `tabular-nums`?
5. Is the serif used *only* for a card prompt/answer?
6. Exactly three radii, assigned by role?
7. Does every keyboard binding show a `.kbd`?
8. Does it work — and was it *looked at* — in **both** themes?
9. Focus visible everywhere; nothing relies on colour alone?
10. Any raw `z-50`, or a page adding its own bottom padding?
