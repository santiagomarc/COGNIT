-- ===================================================================
-- Migration: 202609120900_micro_synthesis.sql
-- Micro-synthesis drills (COGNIT_MICRO_SYNTHESIS_SPEC.md Rev. B.1, §5).
--
-- Two tables and the ai_usage_logs allow-list extension. No RPCs: the two
-- statements the feature needs beyond CRUD — "pull these cards forward" and
-- "count weak links" — are a filtered UPDATE and a bounded SELECT, both
-- under RLS.
--
-- synthesis_drills carries its own schedule state (as `cards` carry SM-2
-- state); synthesis_attempts is append-only history (as study_logs are).
-- Idempotent: `if not exists`, `drop policy if exists` + `create policy`.
-- ===================================================================

-- ── 1. Drills: the question, its answer key, its exemplar, its schedule ──
create table if not exists public.synthesis_drills (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  format text not null check (format in ('causal', 'counterfactual', 'comparative')),
  prompt_text text not null check (char_length(prompt_text) between 20 and 400),
  -- 2-3 anchor cards in a fixed order: the check re-keys them c1..c3 by
  -- position. Arrays carry no FK; a deleted card leaves an id the loaders
  -- filter out, and a drill with fewer than 2 surviving anchors is skipped.
  card_ids uuid[] not null check (array_length(card_ids, 1) between 2 and 3),
  topic_tag text check (topic_tag is null or char_length(topic_tag) <= 80),
  -- Answer key: [{ "id": "m1", "text": "...", "card_ids": [uuid, ...] }], 2-4 entries.
  required_links jsonb not null
    check (jsonb_typeof(required_links) = 'array' and jsonb_array_length(required_links) between 2 and 4),
  -- Model answer: { "claim": "...", "mechanisms": ["...", "..."], "tradeoff": "..." }
  exemplar jsonb not null check (jsonb_typeof(exemplar) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Drill-level schedule (spec §8.1): the exam-sprint ladder [0, 1, 2] days, not SM-2.
  step smallint not null default 0 check (step between 0 and 2),
  next_due_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_verdict text
    check (last_verdict is null or last_verdict in ('sound', 'partial', 'contradicted', 'off_target')),
  last_attempt_at timestamptz,
  -- { model, temperature, clustering: 'tags'|'embedding'|'random', requested_format, format_substituted }
  generation_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists synthesis_drills_queue_idx
  on public.synthesis_drills (user_id, deck_id, status, next_due_at);
create index if not exists synthesis_drills_deck_created_idx
  on public.synthesis_drills (deck_id, created_at desc);

-- ── 2. Attempts: append-only ──────────────────────────────────────
create table if not exists public.synthesis_attempts (
  id uuid primary key default gen_random_uuid(),
  drill_id uuid not null references public.synthesis_drills(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('outline', 'free')),
  -- outline: { claim, mechanisms: [a, b], tradeoff } · free: { text }
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  -- Counted server-side from `response`; never taken from the client.
  word_count integer not null check (word_count between 1 and 200),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  -- Computed by the server from coverage + contradictions + integrity (spec §7.4).
  verdict text not null check (verdict in ('sound', 'partial', 'contradicted', 'off_target')),
  -- [{ link_id, status: 'covered'|'partial'|'missing', evidence: text|null }], one per required link
  coverage jsonb not null default '[]'::jsonb check (jsonb_typeof(coverage) = 'array'),
  -- [{ statement, card_id, card_says }] — only entries whose card_says the server found in the card
  contradictions jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictions) = 'array'),
  -- [{ statement, verified: boolean, ai_assessment, term_suggestion }] — advisory; never affects the verdict
  outside_claims jsonb not null default '[]'::jsonb check (jsonb_typeof(outside_claims) = 'array'),
  structure jsonb not null default '{}'::jsonb,   -- { claim_present, tradeoff_present }
  gap_note text not null default '' check (char_length(gap_note) <= 400),
  -- Denormalised for the Weak-links aggregation (spec §8.5): read two arrays, never the jsonb.
  missing_card_ids uuid[] not null default '{}',
  contradicted_card_ids uuid[] not null default '{}',
  pulled_forward_card_ids uuid[] not null default '{}',
  integrity jsonb not null default '{}'::jsonb,   -- { injection_detected, off_target }
  model text not null,
  usage jsonb not null default '{}'::jsonb,       -- { in, out, ms } from usageMetadata
  created_at timestamptz not null default now()
);

create index if not exists synthesis_attempts_user_deck_created_idx
  on public.synthesis_attempts (user_id, deck_id, created_at desc);
create index if not exists synthesis_attempts_drill_created_idx
  on public.synthesis_attempts (drill_id, created_at desc);

-- ── 3. Row-level security ─────────────────────────────────────────
alter table public.synthesis_drills   enable row level security;
alter table public.synthesis_attempts enable row level security;

-- Every write checks BOTH the row's user_id and deck ownership, as the chat tables do.

drop policy if exists "Users can view their own synthesis drills" on public.synthesis_drills;
create policy "Users can view their own synthesis drills"
  on public.synthesis_drills for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own synthesis drills" on public.synthesis_drills;
create policy "Users can insert their own synthesis drills"
  on public.synthesis_drills for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.decks d where d.id = synthesis_drills.deck_id and d.user_id = auth.uid())
  );

drop policy if exists "Users can update their own synthesis drills" on public.synthesis_drills;
create policy "Users can update their own synthesis drills"
  on public.synthesis_drills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own synthesis drills" on public.synthesis_drills;
create policy "Users can delete their own synthesis drills"
  on public.synthesis_drills for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own synthesis attempts" on public.synthesis_attempts;
create policy "Users can view their own synthesis attempts"
  on public.synthesis_attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own synthesis attempts" on public.synthesis_attempts;
create policy "Users can insert their own synthesis attempts"
  on public.synthesis_attempts for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.decks d where d.id = synthesis_attempts.deck_id and d.user_id = auth.uid())
    and exists (select 1 from public.synthesis_drills s where s.id = synthesis_attempts.drill_id and s.user_id = auth.uid())
  );

-- Append-only, as study_logs / quiz_results (202609050900).
drop policy if exists "Users cannot update synthesis attempts" on public.synthesis_attempts;
create policy "Users cannot update synthesis attempts"
  on public.synthesis_attempts for update using (false) with check (false);

drop policy if exists "Users cannot delete synthesis attempts" on public.synthesis_attempts;
create policy "Users cannot delete synthesis attempts"
  on public.synthesis_attempts for delete using (false);

-- ── 4. AI usage allow-list ────────────────────────────────────────
-- reserve_ai_call inserts into ai_usage_logs; its CHECK enumerates actions
-- (last extended in 202609011400).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ai_usage_logs'
  ) then
    alter table public.ai_usage_logs drop constraint if exists ai_usage_logs_action_check;
    alter table public.ai_usage_logs
      add constraint ai_usage_logs_action_check
      check (action in (
        'generate_cards', 'enrich_cards', 'sanitize_notes', 'get_hint',
        'chat_with_deck', 'sync_embeddings', 'generate_mnemonic', 'semantic_search',
        'synthesis_generate', 'synthesis_check'
      ));
  end if;
end $$;
