# Cognit — Redesign Execution Plan

**Programme:** Obsidian Telemetry — full UI/UX rearchitecture
**Approved:** 2026-09-09 · Rev. A
**Baseline commit:** `c83c050`
**Design spec:** `COGNIT_DESIGN_SYSTEM.md` — **read it before any phase**
**Estimate:** ~15 engineering days across 11 phases

---

## 0. How to use this plan

Each phase is self-contained and **shippable**. The app must build, pass tests and be usable at the
end of every phase — there is no long-lived broken state.

Conventions inherited from `implementation-prompts/README.md` and still in force:

- **The plan is the specification.** Read the sections a phase names before writing code.
- **Do not expand scope.** Spot a problem outside your phase? Record it in the completion report.
  Do not fix it.
- **Do not claim success without running the command.** Paste real output into the report.
- **When plan and code disagree, stop and report.** Line references are against `c83c050`. If one has
  drifted, find the construct by name, note the drift, continue — never guess at intent.
- **Never commit** unless explicitly asked. Leave work in the tree.

### Verification gate — run after every task

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

### Decisions locked by the design review — do not relitigate

| # | Decision |
|---|---|
| 1 | **Chassis:** neutral obsidian, zinc rules, accent = ink, colour reserved for SM-2 state |
| 2 | **Decks render as rows, not tiles** — accepted trade: loses per-deck cover identity |
| 3 | **The floating dock is deleted** — rail + `⌘K` on desktop, header on mobile |
| 4 | **Serif card prompt** (Instrument Serif), prompt/answer only |
| 5 | **Light mode is retained** as a first-class theme with equal QA — not an inversion |

---

## 1. Why

The current interface is not ugly so much as **undifferentiated**: every surface is the same
translucent indigo card at a different radius, so nothing can be emphasised because everything
already is. Measured across `src/`:

| Idiom | Count | Problem |
|---|---:|---|
| `rounded-full` / `2xl` / `xl` / `lg` / `3xl` | 86 / 79 / 53 / 46 / 24 | Four+ radii, no governing rule |
| `.glass-card` | 57 | Every container translucent → none reads as elevated |
| `backdrop-blur` | 34 | Compositing cost on the study canvas; degrades text contrast |
| `.glow-border` | 26 | Hover glow on non-interactive containers |
| `<Sparkles/>` | 17 | Across 12 files — the universal "AI template" tell |
| `.glow-title` | 13 | Neon text-shadow, including the dashboard `h1` |
| Decorative blur orbs | 12 | 3 in the root layout, 2 more inside `StudyStreakCard` |
| `<Brain/>` | 5 | One labels a permanently disabled nav button |
| `<kbd>` elements | **2** | In an app with 8 keyboard bindings — both hidden below `sm` |

Borders are tinted indigo app-wide (`border-primary/10`), so the system has **no true neutral**. The
display face is Orbitron on a body of Poppins.

**Commercially:** Cognit competes for the same 40-minute block as Anki and RemNote, and currently
signals "AI side-project" in the first 400ms.

---

## 2. Verified defects

Found during a full read of the tree. Each was confirmed in source — none is speculative. **F-01 and
F-02 are functional bugs that cost users real study progress and ship in Phase 0, independent of any
visual work.**

---

### F-01 · BLOCKING · The dock floats above the quiz pause overlay and defeats the quit guard

**Evidence**
- `src/components/ui/shared/DockNav.tsx:58` — `fixed … z-50`
- `src/components/ui/shared/QuizAssessmentClient.tsx:997` — pause overlay, `fixed inset-0 z-50`
- `src/app/dashboard/layout.tsx:16-19` — renders `{children}` **before** `<DockNav/>`

Equal z-index resolves in DOM order, so the dock paints on top of the scrim and stays clickable. Its
Dashboard link is a plain `<Link>`, so it never calls `requestQuit()`.

**Impact** A user pauses a quiz, taps the dock, and loses the session with no confirmation — while
the dialog reading "Your progress is preserved" is still on screen.

**Fix** Introduce the z-scale (design spec §4.4). Overlays at `--z-overlay` (100), modals at
`--z-modal` (110), rail at `--z-rail` (20). Additionally hide all navigation chrome on `/study` and
`/quiz`. → **Phase 0**

---

### F-02 · BLOCKING · Card text is silently truncated and cannot be scrolled to

**Evidence** `src/components/ui/shared/FlashcardReviewClient.tsx:768,773` — each face is
`<div class="… overflow-y-auto"><p class="line-clamp-6">`.

`line-clamp` applies `overflow: hidden` to the paragraph, so the paragraph never overflows its parent
and the parent's `overflow-y-auto` has nothing to scroll. Compounded by a fixed `h-[13rem]` face
inside a fixed `h-[22rem] sm:h-[20rem]` shell.

**Impact** Any answer longer than six lines is cut off with an ellipsis and is **unreachable**.
Cognit generates cards from PDFs — long definitions are the norm, not the edge case.

**Fix** Delete the clamp. `min-height` + real scroll, with type stepping down as content lengthens
(design spec §7.6). → **Phase 0**

---

### F-03 · HIGH · 224px of dead space at the bottom of four routes

**Evidence** `pb-28` (112px) is applied in `src/app/dashboard/layout.tsx:16` **and again** in
`dashboard/page.tsx:285`, `FlashcardReviewClient.tsx:587`, `QuizAssessmentClient.tsx:606`,
`dashboard/loading.tsx:3`, `[deckId]/study/loading.tsx:3`, `[deckId]/quiz/loading.tsx:3`.

The padding nests. Meanwhile `[deckId]/page.tsx:355` has none, so it gets 112px. Clearance is both
doubled *and* inconsistent — for a dock only ~74px tall.

**Fix** One owner: the route layout sets `padding-bottom: var(--dock-clearance)`. Every page drops
its own. → **Phase 8** (value becomes `0` when the dock dies)

---

### F-04 · HIGH · Half the navigation is disabled

**Evidence** `DockNav.tsx:11-15` — four slots; `Stats` and `Profile` are `disabled: true`
placeholders. A persistent floating bar occludes content on every screen to offer **two** live
destinations. The `Stats` placeholder uses a `<Brain/>` icon.

**Fix** Delete the dock. Rail + `⌘K` desktop, header breadcrumb + account sheet mobile. → **Phase 8**

---

### F-05 · HIGH · Keyboard affordances are absent exactly where the hands are

**Evidence** Bindings are good and all implemented — `FlashcardReviewClient.tsx:472-491`
(`Space`/`Enter`, `1–4`), `MCQMode.tsx:88` (`1–n`), `MCQMode.tsx:117` (`Space`),
`IdentificationMode.tsx:74` (`Enter`/`Space`), `QuizAssessmentClient.tsx:414` (`P`).

Discovery is not. `P` is never shown anywhere in the UI. The MCQ hint is plain body text
(`MCQMode.tsx:230`), not a keycap. The only two real `<kbd>` elements —
`FlashcardReviewClient.tsx:824,828` — are `hidden sm:inline-flex`.

**Fix** One `<Kbd>` primitive (design spec §7.3), bound to the control it triggers, never hidden
responsively. → **Phase 2** (primitive), **Phases 4–5** (application)

---

### F-06 · HIGH · The dashboard buries its primary action in a stats tile

**Evidence** `dashboard/page.tsx:305-320` — stats row is `md:grid-cols-3`; the left column is a
`grid-rows-[7fr_5fr]` stack with `<CreateDeckModal>` in the lower cell. "Create a deck" — the single
most important entry point for a new user — is sized as five-twelfths of a stats column.
`StudyStreakCard` takes the remaining two-thirds and carries 2 of the 12 blur orbs.

**Fix** Invert the weight. Due-now takes the full top band with one primary CTA; streak and heatmap
demote below the deck index. → **Phase 6**

---

### F-07 · MEDIUM · `card.front` is the answer and `card.back` is the question

**Evidence** Consistent across the tree — `actions/quiz.ts:66-67`
(`prompt_text: card.id_question ?? card.back`, `correct_answer_text: card.front`),
`MCQMode.tsx:61,64`, `s/[token]/page.tsx:152` (`question={card.back} answer={card.front}`).

**This is not a bug** — the convention is applied uniformly. It is a naming trap: anyone reading
`front` as "the side you see first" will invert every deck in the product.

**Fix** Do **not** rename the columns (that is a migration + RPC change with no user benefit).
Introduce `prompt`/`answer` at the view boundary so component props never say `front`.
→ **Phase 4**

---

### F-08 · MEDIUM · Cursor tilt fights reading

**Evidence** `FlipCard.tsx:44-46` — ±8° spring-damped `rotateX/rotateY` tracking the pointer. On a
card the user is actively reading, the text plane is never square to the eye and never still. Largest
single contributor to the "floaty" quality.

**Fix** Remove from the study canvas. May remain on the marketing `Flashcard.tsx` demo, where the
card is a showpiece rather than a reading surface. → **Phase 4**

---

### F-09 · MEDIUM · Every button ships framer-motion; the token base is mislabelled

**Evidence** `src/components/ui/button.tsx:66-75` returns an `m.button` with a `whileTap` spring, so
the animation runtime is pulled into every surface rendering a button, including otherwise static
server-rendered pages. Separately `components.json` declares `"baseColor": "neutral"` while the
variables are slate with indigo borders — anything added via the shadcn CLI arrives in the wrong
palette.

**Fix** CSS `:active` transform instead of `m.button`. The new palette makes `neutral` accurate.
→ **Phase 2**

---

### F-10 · MEDIUM · First-time visitors get dark mode regardless of OS preference

**Evidence** `src/app/layout.tsx:71` inline script —
`var t=localStorage.getItem('cognit-theme'); if(t==='light'){…}else{document.documentElement.classList.add('dark')}`
and `ThemeProvider.tsx:24-31` defaults to `'dark'`. `prefers-color-scheme` is never consulted.

Low priority while dark was the only real theme. **Now that light mode is a supported first-class
theme (Decision 5), a light-OS user's first impression is the wrong theme.**

**Fix** First visit with no stored value → honour `prefers-color-scheme`. An explicit user choice
still wins and still persists. → **Phase 1**

---

## 3. Work inventory

48 files carry at least one banned idiom (~9,800 LOC). Hotspots first — these four are ~2,850 LOC and
account for a third of the total work:

| File | LOC | glass | glow | blur | icons | radii |
|---|---:|---:|---:|---:|---:|---:|
| `shared/QuizAssessmentClient.tsx` | 1040 | 8 | 1 | 1 | 3 | 26 |
| `shared/FlashcardReviewClient.tsx` | 836 | 7 | 2 | 0 | 4 | 19 |
| `app/dashboard/[deckId]/page.tsx` | 623 | 1 | 2 | 0 | 2 | 19 |
| `app/login/LoginClient.tsx` | 560 | 1 | 1 | 0 | 2 | 8 |
| `shared/DeckChatWidget.tsx` | 448 | 1 | 1 | 0 | 0 | 9 |
| `shared/PDFUploadZone.tsx` | 370 | 2 | 2 | 2 | 3 | 10 |
| `app/dashboard/page.tsx` | 354 | 0 | 1 | 0 | 0 | 1 |
| `shared/DeckCardsManager.tsx` | 291 | 0 | 0 | 2 | 0 | 3 |
| `shared/DeckGrid.tsx` | 253 | 1 | 1 | 3 | 0 | 10 |
| `shared/BulkImportModal.tsx` | 252 | 1 | 0 | 1 | 2 | 2 |
| `shared/CreateDeckModal.tsx` | 242 | 1 | 2 | 0 | 1 | 6 |
| `shared/FlashcardWithActions.tsx` | 237 | 1 | 3 | 7 | 0 | 10 |
| `shared/MCQMode.tsx` | 233 | 2 | 2 | 0 | 0 | 8 |
| `app/login/update-password/page.tsx` | 227 | 0 | 0 | 0 | 1 | 3 |
| `shared/StudyStreakCard.tsx` | 203 | 1 | 2 | 0 | 1 | 14 |
| `shared/SemanticSearchModal.tsx` | 202 | 1 | 0 | 2 | 1 | 6 |
| `components/landing/HeroSection.tsx` | 195 | 1 | 1 | 2 | 2 | 12 |
| `shared/DashboardOnboarding.tsx` | 177 | 1 | 1 | 0 | 2 | 5 |
| `shared/IdentificationMode.tsx` | 175 | 1 | 1 | 0 | 0 | 5 |
| `shared/ConfirmDialog.tsx` | 168 | 1 | 0 | 1 | 0 | 2 |
| `app/s/[token]/page.tsx` | 166 | 1 | 2 | 0 | 1 | 1 |
| `shared/DeckActions.tsx` | 140 | 0 | 2 | 0 | 0 | 0 |
| `app/not-found.tsx` | 140 | 1 | 2 | 1 | 2 | 5 |
| `shared/DockNav.tsx` | 122 | 1 | 0 | 0 | 0 | 5 | *(deleted)* |
| *…24 further files* | ≤120 each | | | | | |

---

## 4. Phases

---

### Phase 0 — Blocking defect triage · 0.5 d · no dependencies

**Ships independently of the redesign. Do this first even if the rest slips.**

| Task | Files |
|---|---|
| 0.1 Add the z-scale to `globals.css`; move `DockNav` to `--z-rail`, quiz pause overlay to `--z-overlay`, `ConfirmDialog` to `--z-modal` | `globals.css`, `DockNav.tsx`, `QuizAssessmentClient.tsx`, `ConfirmDialog.tsx` |
| 0.2 Route-guard the dock: return `null` on `/study` and `/quiz` | `DockNav.tsx` |
| 0.3 Delete `line-clamp-6` from both card faces; give the face `min-height` + working `overflow-y: auto` | `FlashcardReviewClient.tsx:768,773` |

**Acceptance**
- Pause a quiz → the pause scrim covers the full viewport; no dock is visible or clickable above it.
- Start a study session → no dock on the route at all.
- A card with a 400-word answer is fully readable by scrolling inside the face.
- Gate passes.

---

### Phase 1 — Token foundation · 1 d · after Phase 0

The highest-leverage phase. **Keep every existing class name**; redefine what it means. All 57
`.glass-card` call sites change appearance without being edited.

| Task | Detail |
|---|---|
| 1.1 Replace `:root` / `.dark` blocks | Full dark **and** light ramps from design spec §2.1, both complete, both explicit |
| 1.2 Add the state channel | `--state-due/learning/mastered/lapsed/streak/neutral`, per theme (§2.2) |
| 1.3 Add radius, elevation, z-scale tokens | §4.2–4.4 |
| 1.4 Redefine `.glass-card` **in place** as the opaque `.surface` recipe | Nothing else changes yet |
| 1.5 Neutralise `.glow-border`, `.glow-title`, `.neon-focus` to no-ops | Removed for real in Phase 3 |
| 1.6 Delete the 3 orbs in `layout.tsx`, the 2 in `StudyStreakCard`, `.bg-orb-pulse`, `.grain-overlay` | |
| 1.7 Delete `--glow` and `--neon` variables entirely | So nothing can reintroduce the effect |
| 1.8 Fix F-10 — honour `prefers-color-scheme` on first visit | `layout.tsx` inline script + `ThemeProvider.tsx` |
| 1.9 Set `components.json` `baseColor` to `neutral` (now accurate) | |

**Acceptance**
- No indigo anywhere; borders are true zinc.
- **Both themes** reviewed on dashboard, study, quiz, deck detail.
- A light-OS first-time visitor lands in light mode; toggling still persists.
- Gate passes.

> This is the phase that removes the "AI template" read. Screenshot before/after for the report.

---

### Phase 2 — Primitives · 1 d · after Phase 1

| Task | Files |
|---|---|
| 2.1 `Card` → opaque surface; strip `backdrop-blur-md`, `bg-card/60`, `border-primary/10` | `ui/card.tsx` |
| 2.2 `Button` → CSS `:active`, drop `m.button` (F-09); variants per §7.2 | `ui/button.tsx` |
| 2.3 `Input` / `Textarea` → `--border-control`, `--accent` focus ring, drop `neon-focus` | `ui/input.tsx`, `ui/textarea.tsx` |
| 2.4 **New** `Kbd` (§7.3) | `ui/Kbd.tsx` |
| 2.5 **New** `StateTick`, `Telemetry` (label + mono value) | `ui/shared/StateTick.tsx`, `Telemetry.tsx` |
| 2.6 **New** `GradeKey` (§7.4) incl. odometer interval + `navigator.vibrate` guard | `ui/shared/GradeKey.tsx` |
| 2.7 **New** `CornerBrackets` (§7.7) | `ui/CornerBrackets.tsx` |
| 2.8 Rewrite `motion-configs.ts` → duration/easing tokens; retain exactly one spring | `lib/motion-configs.ts` |

**Acceptance** Every primitive renders correctly in both themes with a visible focus state; no
component imports `framer-motion` solely for a tap effect; gate passes.

---

### Phase 3 — Typography · 0.5 d · after Phase 2

| Task | Detail |
|---|---|
| 3.1 Remove Orbitron and Poppins; add Geist, Geist Mono, Instrument Serif via `next/font/google` | `layout.tsx` |
| 3.2 Delete `.glow-title` and all 13 call sites | |
| 3.3 Apply the §3.3 scale; drop chrome base to 14px | |
| 3.4 Convert every numeric readout to Geist Mono + `tabular-nums` | Counts, due, ease, intervals, timers, percentages, dates |

**Watch** Poppins is wider than Geist — line lengths shift. Re-check truncation on deck names,
telemetry, and table cells.

**Acceptance** No `--font-orbitron` / `--font-poppins` references remain; serif appears only on card
prompt/answer; gate passes.

---

### Phase 4 — Study canvas · 2 d · after Phase 3

The highest-value phase for daily users.

| Task | Detail |
|---|---|
| 4.1 Rebuild `FlipCard` on the `data-state` contract (§7.6), 4 states | `FlipCard.tsx` |
| 4.2 Remove cursor tilt (F-08) — keep it in marketing `Flashcard.tsx` only | |
| 4.3 Introduce `prompt`/`answer` props; map at the boundary (F-07). **Never expose `front`/`back`** | |
| 4.4 Replace the 4-button grid with the `GradeKey` deck; always mounted, inert before reveal → **zero layout shift** | `FlashcardReviewClient.tsx` |
| 4.5 Apply `Kbd` to `Space`, `1–4` — visible at **all** breakpoints (F-05) | |
| 4.6 Serif prompt at a 32ch measure that grows | |
| 4.7 Session telemetry header: card N/total, ease, elapsed, `P` | |
| 4.8 Mobile: grade deck **is** the bottom chrome, 64px keys inside the safe area | |

**Acceptance**
- Revealing an answer causes **no** layout shift (verify: CLS ≈ 0 in DevTools).
- A 400-word answer is fully readable.
- All bindings work and are visible at 390px width.
- Reduced motion disables flip, spring and odometer.
- Gate passes.

---

### Phase 5 — Quiz surface · 1.5 d · after Phase 4

| Task | Files |
|---|---|
| 5.1 MCQ options → `.opt` spec, real `Kbd` numerals replacing the plain-text hint at line 230 | `MCQMode.tsx` |
| 5.2 Identification input → new input spec; `Enter` keycap | `IdentificationMode.tsx` |
| 5.3 Surface the `P` binding in the header (F-05) | `QuizAssessmentClient.tsx` |
| 5.4 Pause overlay + quit dialog to the z-scale; scrim is the one permitted blur | |
| 5.5 Inline result explanation at the point of error — not a modal, never blocks the next keypress | |
| 5.6 Strip 8 `glass-card`, 26 ad-hoc radii, 3 sparkle icons | |

**Acceptance** A 20-question quiz completes end-to-end on keyboard alone; pause/resume/quit guards
behave; both themes; gate passes.

---

### Phase 6 — Dashboard · 2 d · after Phase 5

| Task | Detail |
|---|---|
| 6.1 Due-now band: metric, subline, one primary CTA (F-06) | |
| 6.2 Deck tiles → **deck rows** (§7.5) with state tick, ease, mastery bar, last-reviewed | `DeckGrid.tsx` |
| 6.3 Telemetry header: due / retention / streak / reviewed-today | |
| 6.4 7-day SM-2 forecast — **data already exists** in `lib/dashboard-due.ts` | |
| 6.5 Retention + streak panels; delete the 2 orbs and gradient wash | `StudyStreakCard.tsx` |
| 6.6 Rebuild onboarding empty state without sparkles | `DashboardOnboarding.tsx` |
| 6.7 Remove the page's own `pb-28` (F-03) | |
| 6.8 Replace `Welcome back, {user.email}` — never render a raw email as a greeting | |

**Acceptance** 8 decks visible without scrolling at 1440×900; forecast matches the scheduler; both
themes; gate passes.

---

### Phase 7 — Deck detail, chat, modals · 2 d · after Phase 6

| Task | Files |
|---|---|
| 7.1 Deck detail header, stats, card manager | `[deckId]/page.tsx` (623 LOC), `DeckCardsManager.tsx` |
| 7.2 Chat widget → surface spec; check it no longer collides with removed dock clearance | `DeckChatWidget.tsx` |
| 7.3 All modals to §7.8 (scrim + z-scale) | `ConfirmDialog`, `BulkImportModal`, `CreateDeckModal`, `SemanticSearchModal` |
| 7.4 PDF upload zone — remove 3 sparkles, 2 blurs | `PDFUploadZone.tsx` |
| 7.5 `AddCardForm`, `DeckActions`, `HintButton`, `QuizHistory*`, `WeakestConcepts`, `FlashcardWithActions` (7 blurs) | |

**Acceptance** No `glass-card`, `glow-*` or banned icon remains under `src/components/ui/shared/`;
gate passes.

---

### Phase 8 — Navigation · 1.5 d · after Phase 7

**Do this late — it is the only phase that changes muscle memory.**

| Task | Detail |
|---|---|
| 8.1 Delete `DockNav.tsx` (F-04) | |
| 8.2 Build the 48px collapsible rail at `--z-rail` | |
| 8.3 Header breadcrumb + account sheet; mobile has **no bottom bar** | |
| 8.4 `⌘K` palette over the existing `SemanticSearchModal` (has overlay, focus trap, search already) | |
| 8.5 Single-owner bottom clearance; delete `pb-28` from all 7 sites (F-03) | |
| 8.6 No navigation chrome at all on `/study`, `/quiz` | |

**Acceptance** Every destination the dock offered is reachable; `⌘K` opens/closes/traps focus/returns
it; no route has doubled bottom padding; gate passes.

---

### Phase 9 — Auth, landing, system states · 1.5 d · after Phase 8

| Task | Files |
|---|---|
| 9.1 Login + password reset (560 + 227 LOC, 3 sparkles, 2 orbs) | `LoginClient.tsx`, `update-password/page.tsx` |
| 9.2 Landing: hero, features, how-it-works, social proof, footer (3 orbs, 5 icons) | `components/landing/*` |
| 9.3 Public shared-deck view | `s/[token]/page.tsx` |
| 9.4 `error.tsx`, `not-found.tsx`, all 4 `loading.tsx` skeletons | |

> The landing page may keep slightly more expressive motion than the app — it is a marketing surface.
> It may **not** keep orbs, glow or sparkles.

**Acceptance** Zero banned idioms remain anywhere under `src/`; skeletons match real layout so there
is no shift on load; gate passes.

---

### Phase 10 — Light-mode QA, accessibility, performance · 1.5 d · after Phase 9

Light mode was retained (Decision 5), so it gets a dedicated pass rather than being assumed.

| Task | Detail |
|---|---|
| 10.1 Walk **every** route in light mode at 1440 and 390 | Dashboard, deck, study, quiz, share, auth, landing, error, empty |
| 10.2 Verify contrast against design spec §2.1; `--ink-faint` is never text | |
| 10.3 Verify `--border-control` ≥3:1 on every interactive edge | |
| 10.4 Full keyboard pass; focus visible everywhere; no colour-only meaning | |
| 10.5 Reduced-motion pass — including card spring and odometer | |
| 10.6 Confirm `backdrop-blur` survives **only** on modal scrims | |
| 10.7 Bundle check — framer-motion no longer pulled in by `Button` | |
| 10.8 Re-run coverage thresholds; ratchet if they moved | |

**Acceptance** Both themes ship-quality on every route; a11y contract (design spec §9) satisfied in
full; gate passes.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1 changes 57 surfaces at once and something regresses unseen | High | Redefine `.glass-card` in place rather than renaming call sites; screenshot every route before/after |
| Geist is narrower than Poppins → truncation appears | Medium | Phase 3 explicitly re-checks deck names, table cells, telemetry |
| Deck rows lose per-deck visual identity (Decision 2) | Medium | Accepted. Revisit with a tag/colour chip if users report it |
| `⌘K` conflicts with a browser/OS binding | Low | Standard palette binding; provide the rail as a full fallback |
| Light mode doubles review surface | Medium | Phase 10 is dedicated to it; tokens make it mechanical |
| Removing `m.button` changes tap feel on touch | Low | CSS `:active` + `navigator.vibrate` on grade keys |
| Line refs drift from `c83c050` | Medium | Find constructs by name, note drift in the report |

---

## 6. Definition of done

The programme is complete when all of the following are true:

```bash
# 1 — banned idioms are gone (each must return 0)
grep -rc "glass-card\|glow-title\|glow-border\|neon-focus\|bg-orb-pulse\|grain-overlay" src --include="*.tsx" --include="*.css" | grep -v ":0$"
grep -rn "<Sparkles \|<Brain \|<Wand2 \|<Rocket " src --include="*.tsx"
grep -rn "border-primary/\|font-orbitron\|font-poppins\|--glow\|--neon" src
grep -rn "line-clamp" src/components/ui/shared/FlashcardReviewClient.tsx
grep -rn "z-50\|z-\[1[0-9]0\]\|z-\[200\]" src --include="*.tsx"
grep -rn "pb-28" src --include="*.tsx"

# 2 — backdrop-blur survives only on modal scrims (expect a short, reviewed list)
grep -rn "backdrop-blur" src --include="*.tsx"

# 3 — full gate
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Plus, by hand:

- [ ] Every route reviewed in **both** themes at 1440px and 390px.
- [ ] Every keyboard binding in design spec §7.3 works **and is visible**.
- [ ] Revealing an answer causes no layout shift.
- [ ] A 400-word card answer is fully readable.
- [ ] Pausing a quiz cannot be bypassed by any navigation control.
- [ ] Accessibility contract (design spec §9) satisfied.

---

## 7. Sequencing summary

```
Phase 0  Blocking defects      0.5d  ─┐ ships alone, do first
Phase 1  Token foundation      1.0d  ─┤ removes the "AI template" read
Phase 2  Primitives            1.0d  ─┤
Phase 3  Typography            0.5d  ─┤
Phase 4  Study canvas          2.0d  ─┤ highest value for daily users
Phase 5  Quiz surface          1.5d  ─┤
Phase 6  Dashboard             2.0d  ─┤
Phase 7  Deck detail & modals  2.0d  ─┤
Phase 8  Navigation            1.5d  ─┤ touches muscle memory — late
Phase 9  Auth, landing, states 1.5d  ─┤
Phase 10 Light mode & a11y QA  1.5d  ─┘
                              ─────
                              15.0d
```

Phases 0–3 are the foundation and should run back-to-back; after Phase 3 the app already looks
redesigned. Phases 4–9 are independently shippable and can be reordered by priority if needed —
except Phase 8, which should stay late.
