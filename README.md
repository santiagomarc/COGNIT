# Cognit

AI-powered active recall. Upload a PDF, get flashcards, study with SM-2 spaced
repetition, quiz yourself, and chat with your own deck.

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com/apikey) API key

## Setup

1. `npm ci`
2. `cp .env.example .env.local` and fill in every value.
3. Apply the database migrations:
   ```bash
   supabase link --project-ref <your-ref> && supabase db push
   ```
4. **In Supabase → Authentication → URL Configuration, add your
   `NEXT_PUBLIC_SITE_URL` to Redirect URLs.** Auth confirmation and password-reset
   links are built from it, and they fail with no useful error if this is missed.
5. `npm run dev`

Steps 3 and 4 are the two that silently break setup. Do them before the first run:
without the migrations every RPC quietly falls into a slower fallback path.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run verify:deployment` | Checks every RPC exists in the target database |

## Architecture

Full topology, component inventory and design rationale:
[`COGNIT_PRODUCTION_EXECUTION_PLAN.md`](COGNIT_PRODUCTION_EXECUTION_PLAN.md) §1.

Briefly:

- **Next.js 16 App Router.** Pages are server components; mutations are Server Actions
  in `src/app/actions/*`. The one route handler that matters is `src/app/api/chat`,
  which streams deck chat over SSE.
- **`src/proxy.ts`** (Next 16's renamed middleware) refreshes the Supabase session and
  guards `/dashboard/**`. It deliberately **excludes `/api/**`**, which is what lets SSE
  stream unbuffered — so route handlers authenticate themselves.
- **Every AI call** goes through `withGeminiRetry` (`src/lib/ai-retry.ts`) and every AI
  Server Action through `guardAction` (`src/lib/action-guard.ts`), so a provider failure
  becomes a typed error result rather than an unhandled rejection.

## Database

Migrations live in `supabase/migrations/` and apply in filename order.

- Every table has RLS enabled.
- Every RPC is `SECURITY INVOKER` with a pinned `search_path` and an explicit ownership
  check — so RLS still applies to the caller.
- History tables (`study_logs`, `quiz_results`, `quiz_card_results`, `ai_usage_logs`) are
  append-only, enforced by DENY policies rather than convention.
- **Deck sharing** widens read access on `decks` and `cards` only, and only for rows
  where `is_public = true AND share_token IS NOT NULL`. Study history, quiz scores,
  mastery and chat are never exposed.

After applying migrations, run the assertion suite in
[`supabase/verify/production-assertions.sql`](supabase/verify/production-assertions.sql)
in the Supabase SQL editor. The first three queries must return zero rows.

Then confirm the app's own view of the database:

```bash
npm run verify:deployment
```

## Deployment

Vercel. Set every variable from `.env.example` in the project settings —
`NEXT_PUBLIC_SITE_URL` and `CRON_SECRET` are both required in production.

`vercel.json` registers a daily cron against `GET /api/keep-alive`, which stops
free-tier Supabase projects from pausing. Vercel sends the `Authorization: Bearer
$CRON_SECRET` header automatically when that variable is set.

**Deploy order matters:** run `supabase db push` *before* deploying the app. New code
calls new RPCs; the reverse order sends every request down a fallback path.

## Troubleshooting

**`npm ls` reports `@emnapi/*`, `@napi-rs/wasm-runtime` and `@tybys/wasm-util` as
extraneous.** Harmless, and not a desynced tree. They are dependencies of
`@tailwindcss/oxide-wasm32-wasi` and `@unrs/resolver-binding-wasm32-wasi` — WASM
fallbacks whose parents do not install on this platform, so npm hoists the children and
then has no installed parent to attribute them to. Both `npm install` and `npm ci`
succeed; a `rm -rf node_modules && npm ci` does not clear them.

**Auth links point at the wrong host.** `NEXT_PUBLIC_SITE_URL` is unset or missing from
Supabase's Redirect URLs list. See Setup steps 2 and 4.

**AI features return "temporarily unavailable".** Check `GEMINI_API_KEY`. The app fails
closed here by design — `src/lib/env-server.ts` validates it at first use.
