-- Baseline: decks, cards and study_logs were first created in the dashboard,
-- before this project kept migrations, so 20260306 onward ALTERs tables that
-- no migration had created and a fresh replay (CI `database` job) failed on
-- the first file. Based on 20260402's reconciliation, which stays as is, but
-- shaped like production (generated types, 2026-09-27): state is the
-- card_state enum, and the defaulted columns are nullable there.
-- Every statement is IF NOT EXISTS: on the hosted project, which already has
-- these tables, this is a no-op.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'card_state' and typnamespace = 'public'::regnamespace) then
    create type public.card_state as enum ('new', 'learning', 'review', 'relearning');
  end if;
end
$$;

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  front text not null,
  back text not null,
  explanation text,
  source text not null default 'manual' check (source in ('manual', 'ai_pdf', 'bulk_import', 'ai_cleaned')),
  imported_by text,
  mcq_distractors text[],
  id_question text,
  state public.card_state default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  next_review_at timestamptz default now(),
  last_review_at timestamptz,
  interval integer default 0 check (interval >= 0),
  ease_factor double precision default 2.5 check (ease_factor >= 1.3),
  repetition_count integer default 0 check (repetition_count >= 0),
  created_at timestamptz default now()
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  grade integer not null check (grade between 0 and 5),
  review_duration_ms integer default 0 check (review_duration_ms >= 0),
  created_at timestamptz default now()
);

create index if not exists decks_user_id_idx on public.decks (user_id);
create index if not exists cards_deck_id_idx on public.cards (deck_id);
create index if not exists study_logs_user_id_created_at_idx on public.study_logs (user_id, created_at desc);
