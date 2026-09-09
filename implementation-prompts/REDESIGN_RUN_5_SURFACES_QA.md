# Cognit Redesign — Run 5: Landing, Auth, System States & Final QA (Phases 9–10)

You are a senior product engineer with strong front-end and interaction-design judgement, working in
the **Cognit** repository at `/Users/marcsantiago/Dev/cognit` — Next.js 16 (App Router) + React 19 +
Tailwind v4 (CSS-first) + Framer Motion 12 + Supabase.

Cognit is an active-recall study app: flashcards on an SM-2 spaced-repetition scheduler, timed
quizzes, and AI deck chat. **Runs 1–4 are complete** (Phases 0–8). Your task is **Phases 9 and 10** —
the last run of the programme.

> **If the user pasted a `## Carry-forward from Run 4` section above this prompt, read it first.**
> If not, verify Run 4 landed: `grep -rn "DockNav\|pb-28" src` must return nothing.

This run ends the programme. Its second half is a **sweep**, not a build — Phase 10 exists to catch
everything the previous four runs deferred, and its output is the evidence that the design system is
actually true of the codebase rather than only of its documentation.

---

## 1. Before you write any code

### 1.1 Read

`COGNIT_DESIGN_SYSTEM.md` in full — you are about to audit the whole codebase against it. Pay
particular attention to **§1.1** (the anti-pattern list), **§2.1** (both palettes, with measured
contrast), **§9** (the accessibility contract) and **§11** (the self-check).

And `COGNIT_REDESIGN_EXECUTION_PLAN.md` §4 Phases 9–10, plus §6 (definition of done for the whole
programme).

### 1.2 Green baseline, then clear the Turbopack cache

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
rm -rf .next/dev .next/cache && npm run dev
```

### 1.3 Record the "before" state

```bash
grep -rn "glass-card" src --include="*.tsx" --include="*.css" | wc -l
grep -rn "<Sparkles \|<Brain \|<Wand2 \|<Rocket \|<Trophy \|<Flame \|<Lightbulb " src --include="*.tsx" | wc -l
grep -rn "backdrop-blur" src --include="*.tsx" | wc -l
grep -rn "rounded-full" src --include="*.tsx" | wc -l
grep -rn "variant=\"outline\"\|variant=\"secondary\"\|variant=\"link\"" src --include="*.tsx" | wc -l
```

---

## 2. What Run 5 is for

Two halves.

**Phase 9** finishes the surfaces nobody has touched yet — landing, auth, the public shared-deck view,
and the error / not-found / loading states. These are the highest-traffic *unauthenticated* screens in
the product and still carry the original template look: blur orbs, sparkles, glow.

**Phase 10** is the sweep. Light mode was retained as a first-class theme by explicit decision, so it
gets a dedicated pass rather than being assumed correct. This is also where every "deferred to a later
phase" finding from Runs 1–4 comes home.

---

## 3. Task list — Phase 9: surfaces (~1.5 d)

### Task 9.1 — Auth

`src/app/login/LoginClient.tsx` (560 LOC, 2 banned icons, 2 blur orbs) and
`src/app/login/update-password/page.tsx` (227 LOC, 1 banned icon), plus `PasswordStrength.tsx`.

Onto the system: `.surface`, control edges, the 2px `--accent` focus outline. The password-strength
meter expresses strength through the **state channel** (§2.2) — it must not introduce a new hue, and
strength must not be conveyed by colour alone (§9).

### Task 9.2 — Landing

`components/landing/`: `HeroSection.tsx` (195 LOC, 3 blur orbs, 2 icons), `FeatureGrid.tsx`,
`HowItWorks.tsx`, `SocialProof.tsx`, `Footer.tsx`. Plus `src/app/page.tsx`.

> The landing page may keep **slightly more expressive motion** than the app — it is a marketing
> surface. It may **not** keep orbs, glow, sparkles or a sci-fi display face.

**Also fix here:** a pre-existing hydration mismatch under `prefers-reduced-motion`. Framer Motion
server-renders initial styles that the client then skips. Confirmed pre-existing at baseline `c83c050`
(logged in the Run 1 report — it was reproduced against a clean stash, so it is not a redesign
regression). Fix it properly: gate the motion component behind a mounted check, or render the
resting state on the server and animate only after hydration.

### Task 9.3 — Public shared-deck view

`src/app/s/[token]/page.tsx` (166 LOC). This is the growth loop — the screen a friend sees when a deck
is shared. It should look like the product, not like a fallback.

`Flashcard.tsx` is used here. Run 2 deliberately kept the cursor tilt on that component as the
marketing showpiece; **that is intentional — leave it.**

### Task 9.4 — System states

`app/error.tsx`, `app/dashboard/error.tsx`, `app/not-found.tsx` (2 banned icons), and all four
`loading.tsx` skeletons.

**Skeletons must match the real layout they stand in for** — Run 4 changed bottom clearance, and a
skeleton whose geometry no longer matches its page causes a visible jump on load. Verify each against
its route.

Error copy follows §"Writing the copy": say what went wrong and how to fix it. No apologies, no
vagueness.

**Phase 9 acceptance** Zero banned idioms anywhere under `src/`. Both themes. Full gate passes.

---

## 4. Task list — Phase 10: the sweep (~1.5 d)

### Task 10.1 — Walk every route in both themes

At **1440px and 390px**: `/`, `/login`, `/login/update-password`, `/dashboard`,
`/dashboard/[deckId]`, `/dashboard/[deckId]/study`, `/dashboard/[deckId]/quiz`, `/s/[token]`,
not-found, and an error state.

Also walk the **empty** states — a brand-new account with no decks, and a deck with no cards.

> **Authenticated routes have never been reviewed by a human in either theme.** The Run 1 report flags
> this explicitly: those routes need a live Supabase session, and previous runs verified them through
> mock-driven harnesses rather than a real account. If you can obtain a session, this is the run to do
> it properly. If you cannot, **say so plainly in the report** and list exactly which routes remain
> unverified — do not imply coverage you do not have.

### Task 10.2 — Contrast audit

Every text colour against its actual background, in both themes, against the measured values in
design spec §2.1. **`--ink-faint` must never be used for text** — it is 2.57:1 dark and 2.48:1 light.

### Task 10.3 — Control-edge audit

Every interactive edge uses `--border-control` (≥3:1 — WCAG 2.2 SC 1.4.11), not `--border` or
`--border-strong`.

### Task 10.4 — Keyboard and focus

Full pass. Every interactive element has a visible focus state. Nothing conveys meaning by colour
alone. Every binding in §7.3 works **and renders a visible `Kbd`**. Tab order is sane from a cold
load on every route.

### Task 10.5 — Reduced motion

With `prefers-reduced-motion: reduce`: no animation anywhere, including the card flip, the
`cardLeaveSpring`, the odometer roll on grade keys, and the theme-fade overlay. The landing page too.

### Task 10.6 — Blur audit

`backdrop-blur` survives **only** on modal scrims. Produce the surviving list in the report and
justify each line.

### Task 10.7 — Radius and pill audit

Three radii, assigned by role. `rounded-full` is for **avatars only** (§4.2) — it was at 81 sites at
the start of the programme and is not fixable at the token layer. Convert the rest to
`--radius-control` or `--radius-container`.

### Task 10.8 — Prune the compatibility layer

Run 1 retained three compatibility button variants (`outline`, `secondary`, `link`) because call
sites still named them, and kept `.glass-card` alive as an alias so ~9,800 LOC could re-skin without
being edited.

Both were always meant to be temporary:

- Migrate any remaining `variant="outline" | "secondary" | "link"` call sites to §7.2's four variants,
  then delete the compatibility variants. Watch for **computed** variant values — Run 1 found one at
  `DeckCardsManager.tsx:217` that a literal grep missed. Let TypeScript find them.
- Delete `.glass-card` entirely once no call site references it.

### Task 10.9 — Bundle and performance

- Confirm `framer-motion` is no longer pulled into pages solely by `Button`.
- Confirm no `'use client'` was added to a component that does not need it.
- Re-run coverage; ratchet the thresholds if they moved.

**Phase 10 acceptance** The programme's definition of done (`COGNIT_REDESIGN_EXECUTION_PLAN.md` §6)
passes in full, with real command output.

---

## 5. Rules

- **This run may touch anything** — it is the sweep. But a fix outside Phases 9–10's remit still gets
  recorded in the report rather than silently expanded into a redesign.
- **Do not claim success without running the command.** Paste real output.
- **Do not report a route as verified if you could not load it.** Say which ones you could not.
- **Never commit.**
- **Server components stay server components.**

---

## 6. Required completion report

This is the **programme close-out report**. Five sections, exactly.

### Section 1 — What I did

Per phase, per task. Then the full programme scorecard, run against
`COGNIT_REDESIGN_EXECUTION_PLAN.md` §6 — every command, with its real output:

| Metric | Programme start | Now |
|---|---:|---:|
| Files with banned classes | 37 | 0 expected |
| Banned icons | 24 | 0 expected |
| Indigo / legacy font refs | 190 | 0 |
| Raw z-index values | 8 | 0 |
| `pb-28` sites | 7 | 0 |
| `backdrop-blur` outside scrims | ~30 | 0 expected |
| `rounded-full` (non-avatar) | 81 | 0 expected |
| Springs in `motion-configs.ts` | 9 | 1 |

Paste the real terminal output of the final full gate.

### Section 2 — What to check in the browser

**Written for a human reviewer, and this time it is the final acceptance walkthrough for the whole
redesign.** Clear the Turbopack cache first.

Cover at minimum:

1. **`/` landing** — no orbs, no glow, no sparkles; motion is present but restrained; no hydration
   warning in the console with reduced motion enabled.
2. **`/login`** — on the system; password strength does not rely on colour alone.
3. **`/s/[token]` shared deck** — looks like the product. The card tilt here is intentional.
4. **Every authenticated route in both themes** — or an explicit statement of which you could not load.
5. **Empty states** — a fresh account with no decks, and a deck with no cards.
6. **Error and not-found** — copy says what happened and what to do.
7. **Loading skeletons** — navigate with a throttled connection; no layout jump when content lands.
8. **Reduced motion** — enable it at OS level and walk study, quiz and landing. Nothing animates.
9. **Keyboard only, cold load, every route** — visible focus at every stop.
10. **Theme toggle on every route**, plus the OS-preference first-visit behaviour from Run 1.

### Section 3 — Findings deferred

Anything left. If the programme is genuinely clean, say so — but do not manufacture a clean sheet.
Anything you consciously chose not to fix belongs here with a reason.

### Section 4 — Deviations from the spec

Across the whole run. Include any place where `COGNIT_DESIGN_SYSTEM.md` itself turned out to be wrong
or under-specified in practice — **that document is meant to outlive this programme, so flag anything
that should be amended in it.**

### Section 5 — Next steps

State that the redesign programme is complete. Then:

- Anything a human must still verify that you could not.
- Any follow-up work the programme surfaced but did not own.
- A recommendation on whether `COGNIT_DESIGN_SYSTEM.md` needs a Rev. B based on what you learned
  implementing it.

---

## 7. Definition of done

- [ ] Phases 9 and 10 complete.
- [ ] Full gate passes, output pasted.
- [ ] Every command in `COGNIT_REDESIGN_EXECUTION_PLAN.md` §6 returns clean, with output pasted.
- [ ] `.glass-card` deleted; compatibility button variants deleted.
- [ ] `backdrop-blur` only on modal scrims, with the surviving list justified.
- [ ] `rounded-full` on avatars only.
- [ ] No banned icon anywhere in `src/`.
- [ ] Landing hydration mismatch under reduced motion is fixed.
- [ ] Skeletons match their routes; no jump on load.
- [ ] Accessibility contract (design spec §9) satisfied and evidenced.
- [ ] Every route walked in both themes at 1440px and 390px — or the gaps stated plainly.
