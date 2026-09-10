# Cognit — UI Research & Mockup Brief: Login, Dashboard, Deck Page

You are a Principal Design Architect and Creative Technologist with deep expertise in modern web
interfaces, design systems, information density, and frontend ergonomics.

**Repository:** `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router), React 19, Tailwind v4
(CSS-first, **no** `tailwind.config.js`), Framer Motion 12, Supabase.

**Product:** Cognit — an active-recall study app. Flashcards on an SM-2 spaced-repetition scheduler,
timed quizzes, AI deck chat. Users spend 30–60 minute sessions in it. It competes with Anki and
RemNote.

**This is a research and design task. Do not write production code.** The deliverable is research
plus mockups. Implementation is a separate session.

---

## 0. Required reading, before anything else

| File | What it is |
|---|---|
| `COGNIT_DESIGN_SYSTEM.md` | The visual specification — palette, type, tokens, component specs |
| `COGNIT_UI_CORRECTIONS_PLAN.md` | Rev. B corrections: radius scale, elevation scale, serif display face |

Then read the three target files so your work is grounded in what exists:

- `src/app/login/LoginClient.tsx`
- `src/app/dashboard/(shell)/page.tsx`
- `src/app/dashboard/(shell)/[deckId]/page.tsx`
- `src/components/landing/LandingBackground.tsx` ← **read this one carefully; see §3**

---

## 1. Context: where this project has been

Cognit went through a complete redesign programme ("Obsidian Telemetry") — 11 phases across 5 runs.
It replaced an indigo-glass AI-template look with a disciplined neutral-zinc system: flat surfaces,
1px zinc rules, colour reserved exclusively for spaced-repetition state, Geist Mono for all data,
Instrument Serif for display type.

**The chassis is correct and is staying.** The palette, the state channel, the mono telemetry, the
serif headings — none of that is up for renegotiation.

**What went wrong is composition and richness.** The system's core rule — *"almost nothing is
filled; structure is carried by 1px rules"* — produces precision on dense screens and produces
**emptiness** on everything else. The result reads flat, static and monotonous: black, grey, white,
and nothing else. The owner's words: *"almost all are just black gray white and feels too flat and
static."*

Your job is to fix **layout and life** without reverting the chassis.

---

## 2. Invoke these skills

Use them in this order. Do not skip the research phase and jump to designing.

1. **`/ui-ux-pro-max`** — the primary research instrument. It carries searchable local data: 79
   styles, 192 product palettes with reasoning profiles, 74 font pairings, 119 UX guidelines, 105
   icons, 17 GSAP presets, 25 chart types, 22 stack profiles. Query it for dashboard information
   architecture, data-density patterns, and dark-UI depth techniques.
2. **`/frontend-design`** — aesthetic direction and avoiding templated defaults.
3. **`/impeccable`** — if available in this environment.
4. **`/dataviz`** — **mandatory.** All three surfaces carry real charts: an activity heatmap, a
   retention sparkline, a 7-day forecast, per-deck mastery bars. Load this before designing any of
   them.
5. **`/artifact-design`** — load before building the mockup page.

Also research **externally** with WebSearch/WebFetch. Look at how mature dark data products actually
create depth without colour: Linear, Vercel Observability, Raycast, Arc, Height, Perplexity, Things 3,
Flighty, Superhuman, Cron/Notion Calendar. Extract **specific, transferable techniques** — how they
separate planes, where they permit gradients, how they use one accent, how they make a dense table
feel alive. Name your sources in the deliverable.

---

## 3. The depth problem — read this before designing

The design system's anti-pattern list (§1.1) bans "decorative blurred orbs" and "grain overlays." That
ban was written against **chromatic** AI-template decoration: purple and cyan blobs on navy.

Since then, `src/components/landing/LandingBackground.tsx` was built and **the owner likes it**. It
uses monochromatic white/zinc ambient halos at very low opacity, a film-grain overlay, drifting
"memory node" particles with synaptic connection lines, harmonic wave ribbons, a cursor spotlight, and
an edge vignette. All neutral. No hue.

**Resolve the contradiction this way — this is the operative rule:**

> **Banned:** chromatic decorative blobs, coloured glow, neon shadows, any hue that does not encode
> spaced-repetition state.
> **Permitted:** monochromatic ambient lighting — low-opacity white/zinc radial fields, fine grain,
> vignettes, specular hairlines, subtle neutral gradients — used to create *planes and depth*.

This is the vocabulary you should mine to solve "flat and static." Depth in this system comes from
**light and elevation**, never from colour.

### Performance constraint — non-negotiable

`LandingBackground` runs an O(n²) particle-connection loop (~105 particles ≈ 5,500 distance checks per
frame) plus three canvas wave ribbons. That is acceptable on a landing page viewed for 20 seconds.

**It is not acceptable on the dashboard, the deck page, or any study surface**, where users sit for
30–60 minutes on laptops. For authenticated app surfaces, propose **CSS-only or static** ambient
treatment: layered radial gradients, a static noise texture, gradient-masked hairlines, `background`
compositing. No per-frame canvas loops. Everything must respect `prefers-reduced-motion`.

---

## 4. The three surfaces

The owner's requests are quoted verbatim. Verified current state is given so you do not waste turns
rediscovering it.

---

### 4.1 Login — `src/app/login/LoginClient.tsx` (507 LOC)

> *"it looks flat and boring and too generic layout. please think of a better layout, and add elements
> to not make it boring. maybe we could use like that in the landing page, but your call if u have
> better ideas"*

**Current state:** a 55/45 split. Left is a bordered brand panel — `Wordmark`, a tagline, and three
sample card rows with state ticks and mono intervals. Right is a centred `.panel` at `max-w-[420px]`
with an Instrument Serif `h1` at 3rem. The Rev. B corrections already landed here (contained panel,
serif heading, real elevation) and it **still** reads generic — so a panel and a serif heading are not
the answer on their own.

**Think about:** what a split-screen auth page is actually for, whether the 55/45 split earns its
keep, and whether the left panel should *demonstrate the product* rather than describe it. The three
sample rows are the one genuinely good element — they show real cards with real intervals. Consider
making that the centrepiece rather than a footnote. The landing background treatment is available to
you; decide whether it belongs here or whether something more specific to "signing in to a memory
instrument" is stronger.

---

### 4.2 Dashboard — `src/app/dashboard/(shell)/page.tsx`

> *"this is where the most changes i want to be. the heatmap and activity are at the bottom and the
> user cant see it immediately at the initial loading of the page, itd be better if it will be already
> seen. also please make a separate container/button for create deck so we know its a bigger and
> prioritized feature; remove the import pdf button cause we alrd have that in the deck page. move
> 'DUE-retention-streak-today' to the right and add greeting header 'Hello (or anything provide more
> texts) [name]' on that left part."*

**Current state:** `DashboardTelemetry` runs full-width across the top. Below it a
`grid lg:grid-cols-[1fr_320px]`. The left column stacks `DueNowBand` → `DeckGrid` → `ReviewForecast`
→ a `.surface` wrapping `ActivityHeatmap` (6 months). The right `aside` holds `RecallAccuracyPanel`
and `StreakPanel`.

**Why the heatmap is invisible:** it is the *last* item in the left column, below the due band, the
full deck list and the forecast. With the owner's real data — **12 decks, 519 cards due** — it sits
roughly two full screens down.

**Five concrete requirements. All must be satisfied:**

1. Heatmap and activity visible at initial paint, no scrolling, at 1440×900.
2. Create Deck becomes its own prominent container or button — visibly a priority feature, not a
   secondary outlined button in a row.
3. Import PDF removed from this page entirely. It already exists on the deck page.
4. The `DUE / RETENTION / STREAK / REVIEWED TODAY` telemetry cluster moves to the **right**.
5. A greeting header — `Hello [name]` or a richer variant — occupies the **left** of that row.

> **Constraint on the greeting:** an earlier audit finding (F-06) was specifically about the dashboard
> rendering a raw email as page copy (`Welcome back, {user.email}`). Do **not** reintroduce that. Name
> where the display name comes from — Supabase `user_metadata.full_name`, a profile field, or the
> local-part of the email as a last resort — and design a graceful fallback for when it is absent.

**The real design problem:** the owner wants *more* visible above the fold, not less. That is a
density and hierarchy problem, and it is the reason `/ui-ux-pro-max` and `/dataviz` matter here.
Consider whether the deck list needs to show all 12 decks above the fold or whether a prioritised
subset plus a count is stronger; whether the heatmap belongs in the rail rather than the main column;
and whether the due band can shrink without losing its force.

Mock this with **realistic data — 12 decks, 519 due, decks named `TECHNO` (334), `RIZAL MIDTERMS`
(48), `Cloud Computing` (40), `PND MIDTERMS` (38), `pl quiz 2` (15), `COMARCH` (15)** — not an
idealised 8-deck, 47-due dataset. The layout must survive the owner's actual numbers, including
four-digit counts and long deck names.

---

### 4.3 Deck page — `src/app/dashboard/(shell)/[deckId]/page.tsx` (617 LOC)

> *"this is too messy for me. so many numbers, so many card containers -> too overwhelming to see. i
> understand that all of those containers are heavily important but please think of a better UI
> layout! and its too boring cause almost all are just black gray white and feels too flat and
> static!"*

**Current state:** 617 LOC, **6 `.surface` containers**, roughly ten major components stacked
vertically at near-equal visual weight:

`DeckDetailSnapshot` · `PDFUploadZone` · `AddCardForm` · `BulkImportModal` · `DeckCardsManager` ·
`DeckChatWidget` · `QuizHistorySection` · `WeakestConcepts` · `ShareDeckButton` · `Telemetry`

Section order: header (actions, title, telemetry row, progress bar) → a `.surface` stats section → a
143-line `lg:grid-cols-2` block (content ingestion) → a `.surface` study/quiz CTA row →
`DeckCardsManager`.

**The diagnosis:** everything is a flat grey box of the same weight, so nothing is primary. The owner
is right that all of it matters — the fix is **hierarchy and grouping**, not deletion.

**Think about:** what a deck page is *for*, and whether it is really one page. Candidate directions —
evaluate, do not just adopt:

- Tabbed or segmented workspace (Overview / Cards / Insights / Chat) so ingestion tooling is not
  competing with the card list.
- A primary action zone with everything else demoted to a rail.
- Progressive disclosure — collapse ingestion until the user wants to add content.
- Grouping the six surfaces into two or three genuinely distinct planes at different elevations.

Apply §3's monochromatic depth vocabulary here specifically. This is the surface the owner called
flat and static.

---

## 5. What must survive

Guard against over-correction. "Make it less flat" is exactly the instruction that tempts a return to
AI-template decoration.

- **Neutral obsidian palette.** Zinc. No hue in the ground.
- **The state channel** — `due` / `learning` / `mastered` / `lapsed` / `streak` are the *only* source
  of colour, and each encodes a real SM-2 fact. **Easy stays colourless** — that is deliberate.
- **Geist Mono + `tabular-nums`** for every number the user reads as data.
- **Instrument Serif for display type ≥24px**; Geist Sans for chrome and body below that. The serif
  has no bold weight — never fake one.
- The **radius scale** (4/6/8/12/16px, keyed to element height) and **elevation scale**
  (`--elevate-flat` / `-1` / `-2`) from `COGNIT_UI_CORRECTIONS_PLAN.md`.
- **Both themes.** Light mode is first-class and gets equal treatment — it is not an inversion.
- The **accessibility contract**: text ≥4.5:1, interactive edges ≥3:1 via `--border-control`, visible
  focus on everything, never colour alone, full `prefers-reduced-motion` support.
- **Still banned:** sparkles, brains, robots, wands, indigo, coloured glow, `backdrop-blur` outside
  modal scrims.

---

## 6. Deliverable

### 6.1 Research summary

Before any mockup: what you found, which skills and sources produced it, and the **specific
techniques** you are borrowing. Name products and name the technique — "Linear separates planes with a
1px top highlight plus a 4% radial field, not a shadow" is useful; "inspired by Linear" is not.

### 6.2 Mockups — this is the main artifact

For each of the three surfaces, produce **one strong recommended direction**. The three-concept
exercise is already done and the chassis is settled; what is needed now is layout and richness, not a
new visual identity. **Exception: the deck page gets two options**, since its structural problem is
the hardest and genuinely has more than one defensible answer.

Build mockups as **live HTML and CSS at native resolution** — not images, not descriptions. What the
owner approves should be the actual rendering.

- Desktop **1440×900** and mobile **390×844** for each surface.
- Real data throughout (§4.2). No lorem, no idealised numbers.
- Both themes, or at minimum dark plus a light-mode verification of the same layout.
- Publish as an **Artifact** so it is shareable, with each screen scaled to fit its frame.
- **Also export PNGs.** A headless Chromium is already cached on this machine and is known to work:

```bash
~/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=6000 --window-size=1440,900 \
  --screenshot=out.png "file:///absolute/path/to/screen.html"
```

Author each screen once at native size, then extract standalone copies for PNG export.

### 6.3 Rationale

For each surface: what changed, why, which requirement it satisfies, and what you deliberately did
**not** change. Call out any trade-off the owner should weigh — particularly anything where a
requirement in §4 conflicts with the design system in §5, and how you resolved it.

### 6.4 Implementation notes

Enough for a separate session to build it: which existing components are reused, which need
rebuilding, which are new, any token additions, and anything that turns out to be structural rather
than cosmetic. **Do not write the production code in this session.**

---

## 7. Process

1. Read §0's files and the three target files. Verify the current state matches what §4 describes;
   report any drift.
2. Run the research phase — skills first, then external references. **Do not skip to designing.**
3. Present a short design plan per surface — layout concept, depth strategy, what solves each stated
   requirement — **before** building mockups.
4. Build the mockups.
5. Export PNGs and publish the artifact.
6. Write the rationale and implementation notes.

Think deeply before proposing. The owner has already rejected one execution of this system as flat
and boring; a second miss costs real trust. If you believe a stated requirement is wrong, say so with
your reasoning **and satisfy it anyway** unless the owner changes it — flag the concern, deliver the
request.
