# CLAUDE.md

Guidance for Claude Code, and for any teammate, working in this repo.

## What this is

**Cognit** is an AI-powered spaced-repetition study app, and our group's Advanced Software
Engineering final project. A user uploads a PDF, and Gemini writes flashcards from it. The user
then studies them with SM-2, quizzes themselves, runs synthesis drills, and chats with the deck.
Production: https://cognit-nine.vercel.app

**Stack:**
- Next.js 16.1 (App Router, Turbopack, React Compiler), React 19, TypeScript strict
- Tailwind v4, CSS-first (tokens in `src/app/globals.css`)
- Framer Motion 12 via `LazyMotion`
- Supabase (Postgres, RLS, pgvector, pg_trgm)
- Gemini via `@google/genai`
- Zod 4, Vitest, Playwright

## Read first

- `docs/architecture.md`: folder map, data model, and the **invariants** you must not break
- `docs/decisions.md`: why things are the way they are
- `docs/progress-log.md`: current status, open items, what's next
- `docs/design-system.md`: required reading before any UI change
- `docs/plans/uiux-plan.md`: the in-progress UI queue ("Where to continue")
- `docs/runbooks/migrations.md`: required reading before writing SQL

Code comments cite retired plans such as `COGNIT_PERFORMANCE_PLAN.md §7.3`. Read them with
`git show archive/pre-docs-cleanup:<file>` (listed in `docs/README.md`).

## Commands

| Command | Use |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npx tsc --noEmit` | Type check |
| `npm run lint` | ESLint + design-token contrast gate |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Production build |
| `npm run e2e` | Playwright + axe. Needs `LOAD_TEST_EMAIL` / `LOAD_TEST_PASSWORD` in `.env.local` and a build |
| `npm run ai:gate` | Live AI checks. **Spends free-tier Gemini quota**, so run only when needed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` after a migration is pushed |

## Team workflow

Everyone commits directly to `main` (decision D-PROC-3).

1. Run `git pull --rebase` before you start and again before you push.
2. Before pushing, run `npx tsc --noEmit && npm run lint && npm test`. Run `npm run build` too
   if you touched routes, imports or dependencies.
3. Make small commits with clear messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
   `chore:`).
4. **Never leave CI red on `main`.** If your push breaks it, fix or revert it right away.
5. **Migrations:** tell the group before committing one. Only the owner runs
   `supabase db push`. Follow `docs/runbooks/migrations.md`. Never edit an applied migration.
6. **Secrets:** never commit `.env.local` or any key. Values are shared privately.

## Code rules

- **Respect the invariants** in `docs/architecture.md` §6:
  - AI calls go through `withGeminiRetry`, and AI actions go through `guardAction` with
    `reserveAiCall` before the call.
  - `'use server'` files export only async functions.
  - RPCs are `SECURITY INVOKER`.
  - History tables are append-only.
  - The server decides grades.
  - Route handlers authenticate themselves.
- **No AI calls in unit tests.** Mock `@/lib/gemini`.
- **Bundle budgets only go down** (`scripts/bundle-budgets.json`). Never raise one to make CI
  pass. Load heavy UI with `next/dynamic` instead.
- **Every new keyboard shortcut** adds a row to `SHORTCUTS` in `src/lib/shortcuts.ts` in the same
  commit.
- **Motion:** import `m` from `framer-motion`, never `motion`.
- **Match the surrounding code.** Pure logic goes in `src/lib/` with a co-located `*.test.ts`.
  Comments explain *why*.
- **UI:** use design-system tokens and classes, not raw colours or ad-hoc radii.
  `npm run lint` checks contrast.
- **Measure, don't estimate.** Back performance claims with a build or a measurement.

## Logging rule (feeds the course report)

After finishing a feature, fix or refactor:
1. Add an entry at the top of the "Entries" section of `docs/progress-log.md`. Use its format:
   date · author · what · why · files · commits · tests.
2. If you made a non-obvious choice, add a `D-…` entry to `docs/decisions.md`.
3. If you changed the structure (new route, table, module), update `docs/architecture.md`.

Write these from what the code actually does. Don't describe unbuilt features as done.
