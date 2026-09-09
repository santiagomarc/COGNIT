# Cognit Redesign — Run 4: Navigation (Phase 8)

You are a senior product engineer with strong front-end and interaction-design judgement, working in
the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 +
Tailwind v4 (CSS-first) + Framer Motion 12 + Supabase.

Cognit is an active-recall study app: flashcards on an SM-2 spaced-repetition scheduler, timed
quizzes, and AI deck chat. **Runs 1–3 are complete** (Phases 0–7). Your task is **Phase 8** — and
only Phase 8.

> **If the user pasted a `## Carry-forward from Run 3` section above this prompt, read it first** —
> it records the exact remaining `pb-28` sites and the state of `SemanticSearchModal`, both of which
> you need.
> If not, verify Run 3 landed: `grep -rn "glass-card" src/components/ui/shared/` must return nothing.

---

## 0. Why this run is alone

Phase 8 is the **only** phase in the programme that changes navigation muscle memory. Everything
before it changed how Cognit looks; this changes where things are. It gets its own run and its own
review cycle for that reason — do not bundle other work into it.

It is also the smallest run (~1.5 d). That is deliberate.

---

## 1. Before you write any code

### 1.1 Read

`COGNIT_DESIGN_SYSTEM.md` — especially **§8 (navigation architecture)**, §4.4 (z-scale), §7.3 (Kbd),
§7.9 (telemetry header). And `COGNIT_REDESIGN_EXECUTION_PLAN.md` §2 defects **F-01, F-03, F-04**,
plus §4 Phase 8.

### 1.2 Green baseline, then clear the Turbopack cache

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
rm -rf .next/dev .next/cache && npm run dev
```

### 1.3 Record the "before" state

```bash
grep -rn "pb-28" src --include="*.tsx"        # expect 5-7 sites; Run 3 removed 2
grep -rn "DockNav" src --include="*.tsx"
```

---

## 2. The defects this run closes

**F-04 — half the navigation is disabled.** `DockNav.tsx:11-15` renders four slots; `Stats` and
`Profile` are `disabled: true` placeholders (one of them labelled with a `<Brain/>` icon). A
persistent floating bar occludes content on every screen in order to offer **two** live destinations:
Dashboard and Sign out.

**F-01 — the dock defeated the quiz quit guard.** Mitigated in Run 1 (z-scale + route guard) but not
*closed* until the dock is gone. Its Dashboard link is a plain `<Link>` that never calls
`requestQuit()`.

**F-03 — doubled bottom clearance.** `pb-28` was applied by `dashboard/layout.tsx` **and** by each
page inside it. Run 3 removed the dashboard page-level duplicates; the rest, including the layout's,
are yours.

---

## 3. Task list

Run `npx tsc --noEmit` after each task. Full gate at the end.

### Task 8.1 — Delete `DockNav`

Remove `src/components/ui/shared/DockNav.tsx` and its usage in `src/app/dashboard/layout.tsx`.

Before deleting, inventory what it actually provided so nothing is lost: the Dashboard link, the
sign-out action (`logout()` from `src/app/auth/actions.ts`), and its scroll-hide behaviour. The two
disabled placeholders are dropped, not migrated — `/dashboard/stats` and `/dashboard/profile` do not
exist.

### Task 8.2 — The rail

A 48px collapsible left rail at `--z-rail`, per design spec §8.

- 1px right border in `--border`. No fill, no shadow, no floating.
- Icon buttons at 30px with 15px stroke-1.5 glyphs; active state gets `--surface` +
  `var(--elevate)`, inactive `--ink-faint`.
- Destinations that actually exist: deck index (`/dashboard`), search (opens the palette), and the
  account control at the foot.
- **Permitted icons only** — arrows, chevrons, search, settings, plus, close. No brains, no sparkles.
- Collapsed is the default state; it does not overlay content, it occupies its own column.

### Task 8.3 — Header and mobile

- Desktop: breadcrumb on the left of the telemetry header Run 3 built, account control in the rail
  foot.
- **Mobile: no bottom bar of any kind.** Breadcrumb in the header, account in a sheet.
- Sign-out moves into the account control. It must still call the existing `logout()` server action.

### Task 8.4 — The `⌘K` palette

Build it **over the existing `SemanticSearchModal`** — that component already has the overlay, the
focus trap, the keyboard handling and the search plumbing. Do not write a second modal system.

- `⌘K` / `Ctrl+K` opens; `Esc` closes; focus is trapped while open and **returned to the trigger** on
  close.
- The `Kbd` affordance in the telemetry header (rendered in Run 3 Task 6.3) becomes live.
- Actions at minimum: jump to a deck, start a session, create a deck, toggle theme, sign out.
- Do not bind a shortcut that shadows a browser default beyond `⌘K` itself; the rail is the full
  fallback for anyone who never discovers it.

### Task 8.5 — Single-owner bottom clearance (closes F-03)

Exactly **one** element owns bottom clearance: the route layout, via
`padding-bottom: var(--dock-clearance)`. With the dock gone, `--dock-clearance` becomes `0` (keep the
token — a future bottom element re-uses it rather than re-scattering `pb-28`).

Remove every remaining `pb-28`, including `dashboard/layout.tsx:16`. Check the carry-forward for the
exact list; at time of writing it includes `[deckId]/study/loading.tsx`, `[deckId]/quiz/loading.tsx`,
`QuizAssessmentClient.tsx`, `FlashcardReviewClient.tsx` and the layout.

Verify the skeletons still match their real layouts after the change — a `loading.tsx` whose padding
no longer matches its page causes a visible jump on load.

### Task 8.6 — No chrome on study and quiz

Formalise what Run 1 Task 0.2 did with a route guard: `/dashboard/[deckId]/study` and
`/dashboard/[deckId]/quiz` render **no** navigation chrome — no rail, no header nav, no bottom bar.
The grade deck owns the bottom band.

Prefer expressing this structurally (a route group or a layout that omits the chrome) over a
`usePathname()` check in a component that then returns `null`. If a structural solution would require
moving files in ways that risk the build, keep the guard and say so in the report.

### Task 8.7 — `ThemeToggle` cleanup

`ThemeToggle.tsx:14-17` carries an inline spring (`stiffness: 320`) and a `backdrop-blur` outside a
modal scrim. Both violate the spec. Move it to `motionTransitions.*` and remove the blur. It belongs
in the rail foot or the account control now.

**Phase 8 acceptance**
- Every destination the dock offered is still reachable.
- `⌘K` opens, closes, traps focus and returns it.
- No route has doubled bottom padding; no `pb-28` remains.
- Study and quiz have no navigation chrome at all.
- Both themes, desktop and 390px. Full gate passes.

---

## 4. Rules

- **Do not expand scope.** Landing, auth, error pages and the light-mode/a11y sweep are Run 5.
- **Do not delete the compatibility button variants** (`outline`, `secondary`, `link`) — Run 5.
- **Do not claim success without running the command.** Paste real output.
- **When this prompt and the code disagree, stop and report.**
- **Never commit.**
- **Preserve working accessibility.** The skip-to-content link matters *more* now that the dock is
  gone and the rail is the first focusable region — verify it still lands correctly.
- The rail must be fully keyboard-navigable with a visible focus state on every control.

---

## 5. Required completion report

Five sections, exactly.

### Section 1 — What I did

Per task: what changed, in which files. Include:

| Metric | Before | After |
|---|---:|---:|
| `pb-28` occurrences | ? | 0 expected |
| `DockNav` references | ? | 0 expected |
| Routes with navigation chrome on study/quiz | ? | 0 expected |

Paste the real terminal output of the final full gate.

### Section 2 — What to check in the browser

**Written for a human reviewer.** Clear the Turbopack cache first. Numbered walkthrough.

Cover at minimum:

1. **`/dashboard`** — the floating dock is gone. A 48px rail sits on the left; it does not overlay
   content. No large empty gap at the bottom of the page any more.
2. **Every old destination still works** — Dashboard from anywhere, and sign-out (verify it actually
   ends the session and redirects, not just that the button exists).
3. **`⌘K`** — opens from any route, `Esc` closes, focus returns to where it was. Tab through the
   palette; focus must stay trapped inside it.
4. **`/dashboard/[deckId]/study` and `/quiz`** — no rail, no header nav, no bottom bar. The grade
   deck is the only thing in the bottom band.
5. **Quiz quit guard (F-01, now closed)** — start a quiz, press `P`, and try every route out of the
   page. There is no longer any control that can navigate away without the quit confirmation.
6. **Mobile at 390px** — no bottom bar anywhere. Breadcrumb reaches the deck; the account sheet opens
   and closes; the grade deck still clears the home indicator on study.
7. **Keyboard only** — from a cold load, Tab through: skip link → rail → header → content. Every stop
   has a visible focus state.
8. **Both themes.**

Flag anything a reviewer might mistake for a regression — the dock's absence is the whole point, but
say so plainly so nobody files it as a bug.

### Section 3 — Findings deferred

With `file:line` and owning phase. Run 5 inherits these.

### Section 4 — Deviations from the spec

Including, explicitly: whether Task 8.6 was solved structurally or with a route guard, and why.

### Section 5 — Next steps

State that Run 4 is complete and Run 5 (Phases 9–10: landing, auth, system states, then the
light-mode and accessibility sweep) is next. Run 5 needs to know: the current count of
`backdrop-blur` outside scrims, remaining `rounded-full` sites, whether any compatibility button
variant still has call sites, and the status of the pre-existing landing-page hydration mismatch
under `prefers-reduced-motion` (logged in Run 1, owned by Phase 9.2).

---

## 6. Definition of done

- [ ] Phase 8 complete; Phase 9 **not** started.
- [ ] Full gate passes, output pasted.
- [ ] `grep -rn "DockNav" src` returns nothing.
- [ ] `grep -rn "pb-28" src` returns nothing.
- [ ] `--dock-clearance` is owned by exactly one element.
- [ ] `⌘K` opens, closes, traps focus, returns focus.
- [ ] Study and quiz render zero navigation chrome.
- [ ] No control anywhere can leave a paused quiz without the confirmation.
- [ ] `ThemeToggle` has no inline spring and no non-scrim blur.
- [ ] Full keyboard pass completed by you, both themes, desktop and 390px.
