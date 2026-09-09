
# Cognit Redesign — Run 3: Dashboard, Deck Detail & Modals (Phases 6–7)

You are a senior product engineer with strong front-end and interaction-design judgement, working in
the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 +
Tailwind v4 (CSS-first) + Framer Motion 12 + Supabase.

Cognit is an active-recall study app: flashcards on an SM-2 spaced-repetition scheduler, timed
quizzes, and AI deck chat. **Runs 1 and 2 are complete** (Phases 0–5: defects, tokens, primitives,
typography, study canvas, quiz surface). Your task is **Phases 6 and 7** — and only those.

> **If the user pasted a `## Carry-forward from Run 2` section above this prompt, read it first** —
> it may record primitive API changes that supersede details below.
> If not, verify Run 2 landed: `grep -c "glass-card" src/components/ui/shared/FlashcardReviewClient.tsx`
> and the same for `QuizAssessmentClient.tsx` must both return `0`, and `GRADE_BUTTONS` must no longer
> exist in the tree.

---

## 0. Before you write any code

### 0.1 Read these two documents in full

`COGNIT_DESIGN_SYSTEM.md` (the visual specification — non-negotiable) and
`COGNIT_REDESIGN_EXECUTION_PLAN.md` (phases, defects, acceptance).

For this run internalise design spec **§1.3** (density is the aesthetic), **§2.2** (the state
channel), **§7.1** (surface), **§7.5** (state tick and **deck row**), **§7.8** (overlay and modal),
**§7.9** (telemetry header) and **§3.3** (type scale).

From the plan read defects **F-03** and **F-06**, and §4 Phases 6–7.

### 0.2 Do not pattern-match off neighbouring code

Legacy idioms remain in the files this run has *not* been assigned. They are the backlog, not a
reference. Precedence: this prompt → `COGNIT_DESIGN_SYSTEM.md` → existing code.

### 0.3 Green baseline, then clear the Turbopack cache

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
rm -rf .next/dev .next/cache && npm run dev      # before any visual check
```

Run 1 lost time to a stale dev CSS chunk serving the old palette while the production build was
correct. Clear it before you trust a screenshot.

---

## 1. What earlier runs built for you

**Wire these in. Do not rebuild them.**

| Asset | Where | Use it for |
|---|---|---|
| `StateTick` | `ui/shared/StateTick.tsx` | **Task 6.2** — the 2px × 16px leading-edge bar on every deck row. |
| `Telemetry` | `ui/shared/Telemetry.tsx` | **Task 6.3** — the dashboard telemetry header. |
| `Kbd` | `ui/Kbd.tsx` | Task 6.1 (`S` on the primary CTA). Never hide responsively. |
| `Button` | `ui/button.tsx` | `default` = neutral outlined, `primary` = filled. |
| `.surface` | `globals.css` | Replaces `glass-card`. `--surface--interactive` for hover. |
| `motionTransitions.*` | `lib/motion-configs.ts` | Durations/easings. `motionSprings.*` no longer exists. |

**Radius is already solved at the token layer.** Run 1 collapsed Tailwind's scale onto the three
role-based steps (`rounded-sm/md` → 2px, `rounded-lg/xl/2xl/3xl/4xl` → 6px). You do **not** need to
rewrite radius utilities. `rounded-full` is *not* remapped and remains over-used (81 sites) — see §5.

**Three compatibility button variants** (`outline`, `secondary`, `link`) are retained alongside
§7.2's four because 29 call sites still name them. Prefer the §7.2 variants in anything you rebuild.
Do not delete the compatibility variants — that is Run 5.

---

## 2. What Run 3 is for

The dashboard is Cognit's front door and currently inverts its own priorities.

The stats row is `md:grid-cols-3`; the left column is a `grid-rows-[7fr_5fr]` stack with
`<CreateDeckModal>` in the lower cell — so **"create a deck", the single most important entry point
for a new user, is sized as five-twelfths of a stats column**, while the retrospective streak card
takes two-thirds of the band (defect F-06).

Meanwhile decks render as tiles, which is why a user with eight decks sees four. The approved
direction replaces them with rows: name, cards, due, ease factor, mastery bar, last-reviewed, all on
one scan line with a state tick at the leading edge.

**Out of scope:** the navigation rail, `⌘K`, deleting `DockNav` (Run 4); landing, auth, error and
empty-state pages (Run 5).

---

## 3. Task list

Run `npx tsc --noEmit` after each task. Full gate at the end of each phase.

---

### PHASE 6 — Dashboard (~2 d)

Primary files: `src/app/dashboard/page.tsx` (354 LOC), `DeckGrid.tsx` (253),
`StudyStreakCard.tsx` (203), `DueTodayCard.tsx` (66), `DashboardOnboarding.tsx` (177),
`CreateDeckModal.tsx` (242), `DashboardSearch.tsx` (72).

#### Task 6.1 — The due-now band (defect F-06)

Invert the weight. Due-now takes the **full top band**: the metric at the `metric` type step
(52px mono, `tabular-nums`), a subline naming deck count / oldest overdue / estimated minutes, and a
**single** `variant="primary"` CTA — "Start session", with a visible `Kbd` `S`.

Secondary actions ("New deck", "Import PDF") sit beside it as `default` outlined buttons. Create-deck
is no longer a grid tile.

#### Task 6.2 — Deck tiles become deck rows

Per design spec §7.5. A deck is **a row of type with its numbers right-aligned**, not a card:

```
▍ Neuroanatomy              128    31    2.41   ▓▓▓▓▓▓▓░  74%    2h ago
│ name                      cards  due   ease   mastery         reviewed
└─ StateTick, 2px × 16px, coloured by the deck's dominant state
```

- All numerics: mono, `tabular-nums`, right-aligned.
- Due count uses `--state-due` when > 0 and `--ink-faint` when 0.
- Mastery bar: 104px × 3px, track `--border`, fill `--ink-dim`, stepping to `--state-mastered` at ≥70%.
- Row divider: 1px `--border`. **No card, no radius, no shadow, no hover glow.**

**Also fix, in the same file:** `DeckGrid.tsx:22-27`'s `getMasteryGlowColor()` returns hard-coded
`rgba()` values, violating §2.3 ("never hard-code a hex"). The `--deck-glow` inline custom property
survives alongside it. Both go; mastery is expressed by the bar and the tick.

> **Accepted trade-off, already decided:** rows lose the per-deck tile identity. Do not reintroduce
> deck covers or per-deck accent colours to compensate.

#### Task 6.3 — Dashboard telemetry header

Per §7.9 using `Telemetry`: `DUE 47 · RETENTION 87% · STREAK 14d · REVIEWED TODAY 62`, then the
search affordance with its `⌘K` keycap on the right.

The palette itself is Run 4 — render the affordance now, wire the shortcut then. `DashboardSearch` /
`SemanticSearchModal` continue to work unchanged in the meantime.

Values take a state colour only when the value *is* a state (`due` orange, `streak` amber).

#### Task 6.4 — Seven-day forecast

A 7-column projection of upcoming due counts. **The data already exists** — read
`src/lib/dashboard-due.ts` and the `get_study_activity_days` / `get_deck_mastery_summary` RPCs used
by `dashboard/page.tsx` before writing anything new. Prefer deriving it server-side alongside the
existing queries over adding a round-trip.

Bars: `--border-strong`, today's in `--state-due`. Counts above in mono; day labels below in the
`label` step. Every label names a value the chart actually reaches.

#### Task 6.5 — Retention and streak panels

Demote below the deck index — they are retrospective, not actionable. Two `.surface` panels: recall
accuracy with a sparkline, and the streak with its day strip.

Run 1 already removed this file's two blur orbs and radial wash. Verify nothing reintroduced them.

#### Task 6.6 — Onboarding empty state

Rebuild `DashboardOnboarding.tsx` without its 2 banned icons. A new user needs to know what Cognit
does and the fastest path to value (upload a PDF) — say it in words, not sparkles.

#### Task 6.7 — Remove the page's duplicate bottom padding (partial F-03)

`dashboard/page.tsx:285` carries `pb-28` **and** `dashboard/layout.tsx:16` carries it too — 224px of
stacked dead space.

> **Remove the one on `dashboard/page.tsx` only.** The layout's `pb-28` must stay: `DockNav` still
> exists on this route until Run 4, and stripping the layout's clearance now would push content
> underneath it. The systematic single-owner fix is Run 4 Task 8.5.

Do the same for `dashboard/loading.tsx:3` so the skeleton matches.

#### Task 6.8 — Stop rendering a raw email as a greeting

`dashboard/page.tsx:295` renders `Welcome back, {user.email}`. Use a display name, or drop the
greeting — the telemetry header already establishes context. Never print a raw email address as
page copy.

**Phase 6 acceptance**
- Eight decks visible without scrolling at 1440×900.
- Forecast numbers match the scheduler.
- Exactly one filled button on the screen.
- No `pb-28` on `dashboard/page.tsx`; the layout's is untouched.
- Both themes. Full gate passes.

---

### PHASE 7 — Deck detail, chat and modals (~2 d)

Primary files: `src/app/dashboard/[deckId]/page.tsx` (623 LOC), `DeckCardsManager.tsx` (291),
`DeckChatWidget.tsx` (448), `PDFUploadZone.tsx` (370), `BulkImportModal.tsx` (252),
`CreateDeckModal.tsx` (242), `SemanticSearchModal.tsx` (202), `ConfirmDialog.tsx` (168),
`AddCardForm.tsx` (116), `DeckActions.tsx` (140), `FlashcardWithActions.tsx` (237, **7 blurs**),
`QuizHistoryList.tsx` (113), `QuizHistorySection.tsx` (38), `WeakestConcepts.tsx` (81),
`HintButton.tsx` (55).

#### Task 7.1 — Deck detail page

Header, stats and card manager onto the system. This is the largest single file in the run — work
top-down and run `tsc` often.

**Also fix:** `DeckCardsManager.tsx:217`'s selection-mode toggle changes `variant` but has no
`aria-pressed`, so its state is never announced to assistive tech.

#### Task 7.2 — Deck chat widget

Onto `.surface`. Confirm it does not collide with the bottom band now that study/quiz have no dock,
and that its scroll container behaves at 390px.

#### Task 7.3 — All modals to §7.8

`ConfirmDialog`, `BulkImportModal`, `CreateDeckModal`, `SemanticSearchModal`: scrim at
`--z-overlay`, dialog at `--z-modal` (both already correct from Run 1 — verify, don't redo), surface
per §7.8, `--radius-container`.

**Modal scrims are the only place `backdrop-blur` is permitted in the product.** Every other blur in
these files goes.

#### Task 7.4 — PDF upload zone

Remove its 3 banned icons and 2 blurs. This is a primary conversion surface for new users — the copy
matters more than the ornament.

#### Task 7.5 — The remaining shared components

`AddCardForm`, `DeckActions`, `HintButton`, `QuizHistoryList`, `QuizHistorySection`,
`WeakestConcepts`, `FlashcardWithActions` (7 blurs — the densest remaining concentration).

**Phase 7 acceptance**
- `grep -rn "glass-card" src/components/ui/shared/` returns nothing.
- No banned icon remains under `src/components/ui/shared/`.
- `backdrop-blur` under `src/components/ui/shared/` exists only on modal scrims.
- Both themes. Full gate passes.

---

## 4. Rules that apply throughout

- **Do not expand scope.** Findings outside Phases 6–7 go in the report under *Findings deferred*.
- **The layout's `pb-28` is not yours** (§ Task 6.7). Neither is `DockNav`, the rail, or `⌘K`.
- **Landing, auth and error pages are not yours** — Run 5.
- **Do not delete the compatibility button variants** — Run 5.
- **Do not claim success without running the command.** Paste real output.
- **When this prompt and the code disagree, stop and report.** Find the construct by name, note drift.
- **Never commit.**
- **Preserve working accessibility** — reduced-motion guard, skip link, `aria-live` regions.
- **Server components stay server components.** `dashboard/page.tsx` is a server component doing real
  data work; do not add `'use client'` to make styling easier.

---

## 5. Findings already logged against these phases

Fix these in this run; they are in scope:

| Finding | Location | Task |
|---|---|---|
| `getMasteryGlowColor()` returns hard-coded `rgba()`; `--deck-glow` inline property survives | `DeckGrid.tsx:22-27` | 6.2 |
| Raw email rendered as greeting | `dashboard/page.tsx:295` | 6.8 |
| Selection toggle missing `aria-pressed` | `DeckCardsManager.tsx:217` | 7.1 |
| Doubled `pb-28` (page-level half only) | `dashboard/page.tsx:285`, `dashboard/loading.tsx:3` | 6.7 |

**Not** in scope, even though you will see them: `rounded-full` over-use (81 sites — a Tailwind
builtin, not fixable at the token layer; Run 5 audits it), and `ThemeToggle.tsx:14-17`'s inline
spring and non-scrim blur (Run 4/5).

---

## 6. Required completion report

Five sections, exactly.

### Section 1 — What I did

Per phase, per task: what changed, in which files. Include:

| Metric | Before | After |
|---|---:|---:|
| Files with `glass-card` | ? (from Run 2 report) | ? |
| `glass-card` under `ui/shared/` | ? | 0 expected |
| Banned icons | ? | ? |
| `backdrop-blur` outside modal scrims | ~30 | ? |

Paste the real terminal output of the final full gate.

### Section 2 — What to check in the browser

**Written for a human reviewer.** Clear the Turbopack cache first (§0.3). Numbered walkthrough:
route, action, what should now be visibly true.

Cover at minimum:

1. **`/dashboard`** — due-now occupies the top band with **one** filled button; create-deck is no
   longer a small tile in the stats grid.
2. **Deck rows** — decks are rows, not tiles; a state tick sits at each leading edge; cards / due /
   ease / mastery / reviewed are column-aligned mono. Eight decks should be visible without scrolling
   at 1440×900.
3. **Forecast** — seven bars, today highlighted in orange, counts matching the deck due totals above.
4. **No dead space** — the dashboard no longer has a large empty gap at the bottom (the doubled
   padding is halved). The dock is still present on this route; that is expected until Run 4.
5. **`/dashboard/[deckId]`** — deck detail, card manager and chat widget on flat surfaces; no
   translucent panels, no hover glow.
6. **Modals** — open create-deck, bulk import, semantic search and a confirm dialog. Each sits above
   a full-viewport scrim; the scrim is the only blurred thing on screen.
7. **Both themes** on every route above.

Flag anything a reviewer might mistake for a regression — deck rows losing tile identity is the
obvious one, and it is intentional.

### Section 3 — Findings deferred

Anything noticed but correctly not fixed, with `file:line` and owning phase.

### Section 4 — Deviations from the spec

Where you departed from `COGNIT_DESIGN_SYSTEM.md` or this prompt, and why. If none, say so.

### Section 5 — Next steps

State that Run 3 is complete and Run 4 (Phase 8: navigation, rail, `⌘K`) is next. Run 4 needs to know:
the current state of `SemanticSearchModal` (it becomes the `⌘K` palette), every remaining `pb-28`
site with line numbers, and whether the telemetry header you built in 6.3 has a slot ready for the
rail.

---

## 7. Definition of done

- [ ] Phases 6 and 7 complete; Phase 8 **not** started.
- [ ] Full gate passes, output pasted.
- [ ] `grep -rn "glass-card" src/components/ui/shared/` returns nothing.
- [ ] No banned icon under `src/components/ui/shared/`.
- [ ] `backdrop-blur` in this run's files exists only on modal scrims.
- [ ] No hard-coded `rgba()` / hex in `DeckGrid.tsx`; `--deck-glow` gone.
- [ ] No raw email rendered as page copy.
- [ ] `pb-28` removed from `dashboard/page.tsx` and `dashboard/loading.tsx`; **still present** in
      `dashboard/layout.tsx`.
- [ ] Exactly one `variant="primary"` on the dashboard.
- [ ] Eight decks visible without scrolling at 1440×900.
- [ ] Every route in this run reviewed by you in **both** themes before writing the report.
