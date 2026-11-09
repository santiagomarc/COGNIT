Project Cognit: The Universal Active Recall Engine
Version: 0.2 (Alpha) Role: Senior Capstone / "Hero Project" Developer: [Your Name]

1. Executive Summary
Cognit is an AI-powered study platform that transforms any source material into an interactive learning experience.

Whether you are a Law student analyzing cases, a Med student memorizing anatomy, or a developer learning a new framework, Cognit automates the heavy lifting of study prep. It ingests raw documents (PDFs, Notes) and uses Generative AI to create "Active Recall" scenarios, acting as a tireless, subject-agnostic tutor that grades your understanding, not just your memory.

2. The Core Problem
The Issue: Traditional study tools (Anki, Quizlet) are content-agnostic but "dumb"—they require manual data entry and rely on the user to grade themselves. They are just digital index cards.

The Solution: Cognit makes the content "smart." It reads the material for you, generates the curriculum, and uses semantic AI to validate your answers against the source text, regardless of the subject matter.

3. The Tech Stack ("The Arsenal")
Frontend: Next.js 16 (App Router), React 19, Tailwind CSS v4.

UI Library: Shadcn/UI (Radix Primitives) + Lucide Icons.

Language: TypeScript (Strict Mode).

Backend / DB: Supabase (PostgreSQL).

Auth: Supabase Auth (Email/Password + OAuth).

AI Engine: OpenAI API (gpt-4o-mini for speed/cost) (we could also use gemini).

Data Validation: Zod (Schema Validation).

File Processing: pdf-parse (Server-side extraction).

4. Database Architecture
Pattern: Relational (PostgreSQL).

Strategy: "Shared Content / User Ownership." Users own their decks. No complex joins for basic retrieval.

Key Tables:

decks: Containers for content.

cards: Stores Question (Front), Answer (Back), and SM-2 State (Interval, Ease Factor).

study_logs: Immutable history of every review session (used for analytics).

5. Feature Roadmap
Phase 1: The Foundation (MVP)
[x] Project Setup: Next.js + Supabase + Shadcn.

[x] Database Schema: Tables for Decks, Cards, Logs with RLS enabled.

[x] Authentication: Secure Login/Signup flows with middleware protection.

[x] Landing Page: Marketing page with feature highlights.

[ ] Deck Management: Create, Read, Update, Delete (CRUD) Decks.

[ ] Manual Card Entry: Form to add a generic Q&A card manually.

Phase 2: The "Hero" Features (AI Integration)
[ ] PDF-to-Deck Generator:

Upload a Lecture PDF.

Extract text -> Chunking -> AI Processing.

Output: Structured JSON of 10-20 high-quality concept cards.

[ ] The Feynman Validator (Quiz Mode):

User sees a question -> Types answer.

AI compares User Answer vs. Ground Truth.

Returns: Score (0-100), Correction ("You missed key keyword X"), and updating the card's review schedule.

Phase 3: The Algorithm & Analytics
[ ] Spaced Repetition Engine (SM-2):

Backend logic to calculate next_review_at based on the AI's grade.

"Due Today" queries.

[ ] Dashboard Analytics:

"Heatmap" of daily activity.

"Weakest Concepts" list.

Phase 4: Future / "Reach" Goals (Portfolio Elevators)
[ ] Semantic Search (RAG): Use Vector Embeddings (pgvector) to search for cards by concept. AI cites exactly where in the document answers come from.

[ ] Voice Mode: Speak your answers instead of typing (using Whisper API).

[ ] Public Marketplace: Share your generated decks with other students.

[ ] Optimistic UI: Use React 19's useOptimistic hook for instant UI feedback while DB updates in background.

[ ] End-to-End Type Safety: Generate TypeScript definitions from Supabase schema for compile-time database type checking.

[ ] Automated Testing: Vitest for unit tests (SM-2 algorithm), Playwright for E2E tests.

[ ] OAuth Providers: Add Google/GitHub login options.

[ ] Export Functionality: Export decks to Anki-compatible format.

6. Engineering Standards (The "No-Vibe" Rules)
Strict Types: No any. Every piece of data has an Interface.

Validation: All AI outputs and User inputs must be validated by Zod before touching the DB.

Server Actions: Direct database mutations happen in actions.ts files, not API routes (unless streaming).

RLS: Security policies are handled at the Database level, not the Application level.

7. Application Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Landing page (public)
│   ├── layout.tsx         # Root layout with metadata
│   ├── globals.css        # Global styles
│   ├── actions.ts         # Server Actions (backend mutations)
│   ├── login/
│   │   └── page.tsx       # Login/Signup page
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts   # OAuth callback handler
│   └── dashboard/
│       └── page.tsx       # Protected dashboard
├── components/
│   └── ui/                # Shadcn/UI components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── shared/
│           └── CreateDeckForm.tsx
├── lib/
│   ├── schemas.ts         # Zod validation schemas
│   ├── utils.ts           # Utility functions (cn, etc.)
│   └── supabase/
│       ├── client.ts      # Browser-side Supabase client
│       └── server.ts      # Server-side Supabase client
└── proxy.ts               # Auth protection & token refresh (Next.js 16)
```

---

## Changelog

### December 20, 2025 - 10:45 AM (GitHub Copilot)

**Files Renamed:**
- `src/middleware.ts` → `src/proxy.ts` - Renamed to follow Next.js 16 convention. The function inside was also renamed from `middleware()` to `proxy()`.

**Why:** Next.js 16 deprecated the "middleware" naming convention in favor of "proxy" to clarify its network boundary purpose and avoid confusion with Express.js middleware.

---

### December 20, 2025 - 10:30 AM (GitHub Copilot)

**Files Created:**
- `src/app/login/page.tsx` - Full authentication page with login/signup toggle, form validation, error handling, and Supabase Auth integration.
- `src/app/auth/callback/route.ts` - OAuth callback handler for email confirmation flow.
- `src/lib/supabase/client.ts` - Browser-side Supabase client for client components.
- `src/proxy.ts` - Next.js proxy for auth protection (redirects unauthenticated users from /dashboard to /login, and authenticated users from /login to /dashboard).

**Files Modified:**
- `src/app/page.tsx` - Converted from duplicate dashboard to proper landing page with hero section, feature highlights, and CTA buttons.
- `src/app/layout.tsx` - Updated metadata with proper title and description.

**Issues Fixed:**
- Resolved duplicate page.tsx confusion (root was identical to dashboard).
- Added missing /login route that dashboard was redirecting to.
- Implemented proper auth flow with proxy protection.

**Architecture Decisions:**
- Used `createBrowserClient` for client components (login form).
- Used `createServerClient` for server components (dashboard, proxy).
- Proxy pattern ensures auth tokens are refreshed on every request.