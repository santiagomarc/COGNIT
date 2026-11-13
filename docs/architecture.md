# Cognit — Architecture

How the system is put together today, and the rules that keep it correct. Verified against
`main` on 2026-11-09. When you change something structural, update this file in the same commit.

## 1. What Cognit does

A spaced-repetition study app. A user uploads a PDF (or pastes notes), and Gemini writes
flashcards from it. The user then:

- **studies** the cards with SM-2 scheduling,
- **quizzes** themselves (multiple choice and identification, graded on the server),
- runs **synthesis drills** that connect several cards (short written answers checked by AI),
- **chats** with their own deck (retrieval-augmented, streamed),
- **searches** cards by text or meaning, and **shares** a read-only deck by link.

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.1 (App Router, Turbopack, React Compiler), React 19, TypeScript strict |
| Styling | Tailwind v4, CSS-first. Tokens live in `src/app/globals.css` and are specified in [design-system.md](design-system.md) |
| Motion | Framer Motion 12 through `LazyMotion`. Import `m`, never `motion` |
| Database | Supabase: Postgres, Row Level Security, pgvector (768-dim embeddings), pg_trgm |
| AI | Google Gemini via `@google/genai`. Text model defaults to `gemini-3.5-flash-lite`, embeddings to `gemini-embedding-001` (`src/lib/env-server.ts`) |
| Validation | Zod 4 (`src/lib/schemas.ts`) |
| Tests | Vitest (unit, `npm test`), Playwright + axe (e2e, `npm run e2e`), live AI gates (`npm run ai:*`) |
| Hosting | Vercel (functions in `bom1`), Supabase in `ap-south-1`. Production: https://cognit-nine.vercel.app |

## 3. Topology

```
Browser
  │  RSC pages + client components
  │
  ├── page navigations ──▶ src/proxy.ts (Next 16 "middleware")
  │                          · refreshes the Supabase session cookie
  │                          · guards /dashboard/**, /s/**, /login/update-password
  │                          · does NOT match /api/** (so SSE streams unbuffered)
  │
  ├── Server Actions ────▶ src/app/actions/*.ts   ('use server')
  │                          deck · deck-lifecycle · card · study · quiz · synthesis
  │                          chat · share · settings · ai-assist · _shared
  │
  └── fetch ─────────────▶ src/app/api/*/route.ts (authenticate themselves)
                             chat (SSE) · generate (streamed PDF → cards) · search
                             (+ semantic) · export · decks/[deckId] · decks/backfill
                             keep-alive (cron) · csp-report
                                   │
                ┌──────────────────┴───────────────────┐
                ▼                                      ▼
      Supabase Postgres                       Google Gemini
      · RLS on every table                    · generation, enrichment,
      · SECURITY INVOKER RPCs                   synthesis checks, chat
      · pgvector + pg_trgm search             · embeddings (768-dim)
```

## 4. Folder map

| Path | What lives there |
|---|---|
| `src/app/` | Routes. `page.tsx` landing, `login/`, `auth/callback`, `explore/` (behind `EXPLORE_ENABLED`), `s/[token]` shared decks |
| `src/app/dashboard/(shell)/` | Pages with the sidebar: Today, deck detail, drills, stats, shared, trash, settings |
| `src/app/dashboard/(focus)/[deckId]/` | Full-screen sessions with no chrome: `study`, `quiz`, `synthesis` |
| `src/app/actions/` | Server Actions (all mutations). `_shared.ts` holds rate limiting, AI reservations, ownership helpers |
| `src/app/api/` | Route handlers (streaming, cron, search, export) |
| `src/components/ui/` | Primitives (button, input, switch…) |
| `src/components/ui/shared/` | Feature components (`FlashcardReviewClient`, `QuizAssessmentClient`, `CommandPalette`, `DeckChatWidget`…) |
| `src/components/landing/` | Marketing page sections |
| `src/lib/` | Pure logic and server helpers, each with a co-located `*.test.ts`: `sm2.ts`, `fuzzy.ts`, `rag.ts`, `gemini.ts`, `card-generation.ts`, `pdf-chunking.ts`, `shortcuts.ts`… |
| `src/lib/synthesis/` | Synthesis drill domain (prompts, validation, verdicts) |
| `src/lib/supabase/` | Server, browser and admin Supabase clients |
| `src/test/live/` | Live AI gates. They run only through `vitest.live.config.ts`, never in `npm test` |
| `supabase/migrations/` | 61 SQL migrations, applied in filename order |
| `supabase/verify/` | `production-assertions.sql`, which checks RLS and the RPCs after a push |
| `e2e/` | Playwright specs (`study`, `focus`, `a11y`) |
| `scripts/` | Tooling: contrast gate, bundle budgets, SQL syntax check, deployment verifier, calibration |
| `load/` | k6 load test |

## 5. Data model

All tables are in `public`, keyed to `auth.users` through `user_id`, and protected by RLS.

```
auth.users
 ├─ user_settings            display name, session sizes
 ├─ ai_usage_logs            append-only; reserve-before-spend rate limiter
 ├─ ai_call_outcomes         what each AI call cost and how it ended
 └─ decks                    title, tags, exam_at, deleted_at (30-day trash), is_public + share_token
     ├─ cards                front/back, SM-2 state, distractors, topic_tags, embedding vector(768)
     │   ├─ study_logs           append-only; streak + heatmap
     │   └─ quiz_card_results    append-only
     ├─ quiz_results         append-only
     ├─ card_mastery_state
     ├─ deck_chat_sessions ─ deck_chat_messages ; deck_chat_embedding_metadata
     ├─ deck_reports
     └─ synthesis_drills ─ synthesis_attempts ─ synthesis_attempt_feedback ; synthesis_questions
```

`src/lib/database.types.ts` is generated (`npm run db:types`). Don't edit it by hand. CI fails if
it drifts from the migrations.

## 6. Invariants: do not break these

Each of these has broken something in the past or is enforced by a test or an assertion.

1. **Every AI call goes through `withGeminiRetry`** (`src/lib/ai-retry.ts`), and **every AI
   Server Action goes through `guardAction`** (`src/lib/action-guard.ts`). A rejected Server
   Action surfaces as an opaque 500 and leaves the client's loading state stuck.
2. **`'use server'` files export only async functions.** Pure helpers go in `src/lib/*`.
   Breaking this breaks the build.
3. **Every RPC is `SECURITY INVOKER`**, with a pinned `search_path` and an explicit ownership
   check. There are zero `SECURITY DEFINER` functions, and `production-assertions.sql` enforces
   that. Account deletion uses the Supabase Admin API instead (see decisions D-DATA-3).
   Signed-out (`anon`) clients may execute only `list_public_decks`; assertion 19 enforces it.
4. **History tables are append-only** in the database (`study_logs`, `quiz_results`,
   `quiz_card_results`, `ai_usage_logs`), enforced by DENY policies.
5. **The server decides the grade.** `logQuizResult` re-grades every answer from the card, and
   synthesis verdicts are computed server-side. Never trust a client verdict.
6. **`src/proxy.ts` does not match `/api/**`.** That is what lets SSE stream unbuffered, and
   it means every route handler must authenticate the user itself.
7. **AI spend is reserved before the call** (`reserveAiCall` in `src/app/actions/_shared.ts`),
   not recorded after it. Recording on success only made failed calls free and unlimited.
8. **Sharing widens reads on `decks` and `cards` only**, and only where
   `is_public = true AND share_token IS NOT NULL`. Study history, quiz scores, mastery and chat
   are never exposed.
9. **The database leads the code.** Migrations are expand-only and are pushed before the code
   that calls them ships. See [runbooks/migrations.md](runbooks/migrations.md).
10. **No AI calls in unit tests.** Mock `@/lib/gemini`. Live gates spend free-tier quota.

## 7. Quality gates

| Gate | Where |
|---|---|
| `npx tsc --noEmit`, `npm run lint` (ESLint + WCAG contrast of every design token) | local + CI |
| `npm test` (Vitest, about 80 files) | local + CI |
| `npm run build` + bundle budgets (`scripts/bundle-budgets.json`; budgets only go down) | CI |
| Database types drift + migrations replay on a fresh database | CI (`database` job) |
| `npm run e2e` (Playwright + axe; needs a test account) | local |
| Live AI gates (`npm run ai:gate`) | manual / `live-ai.yml` workflow |
