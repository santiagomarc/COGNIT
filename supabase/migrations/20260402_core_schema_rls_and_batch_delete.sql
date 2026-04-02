-- Core baseline for foundational tables and security controls.
-- Safe to run in environments where these tables already exist.

create extension if not exists "pgcrypto";

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  next_review_at timestamptz not null default now(),
  last_review_at timestamptz,
  interval integer not null default 0 check (interval >= 0),
  ease_factor double precision not null default 2.5 check (ease_factor >= 1.3),
  repetition_count integer not null default 0 check (repetition_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  grade integer not null check (grade between 0 and 5),
  review_duration_ms integer not null default 0 check (review_duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists decks_user_id_idx on public.decks (user_id);
create index if not exists cards_deck_id_idx on public.cards (deck_id);
create index if not exists study_logs_user_id_created_at_idx on public.study_logs (user_id, created_at desc);

alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.study_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'decks'
      and policyname = 'Users can view their own decks'
  ) then
    create policy "Users can view their own decks"
      on public.decks
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'decks'
      and policyname = 'Users can insert their own decks'
  ) then
    create policy "Users can insert their own decks"
      on public.decks
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'decks'
      and policyname = 'Users can update their own decks'
  ) then
    create policy "Users can update their own decks"
      on public.decks
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'decks'
      and policyname = 'Users can delete their own decks'
  ) then
    create policy "Users can delete their own decks"
      on public.decks
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cards'
      and policyname = 'Users can view cards in their own decks'
  ) then
    create policy "Users can view cards in their own decks"
      on public.cards
      for select
      using (
        exists (
          select 1
          from public.decks
          where decks.id = cards.deck_id
            and decks.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cards'
      and policyname = 'Users can insert cards in their own decks'
  ) then
    create policy "Users can insert cards in their own decks"
      on public.cards
      for insert
      with check (
        exists (
          select 1
          from public.decks
          where decks.id = cards.deck_id
            and decks.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cards'
      and policyname = 'Users can update cards in their own decks'
  ) then
    create policy "Users can update cards in their own decks"
      on public.cards
      for update
      using (
        exists (
          select 1
          from public.decks
          where decks.id = cards.deck_id
            and decks.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.decks
          where decks.id = cards.deck_id
            and decks.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cards'
      and policyname = 'Users can delete cards in their own decks'
  ) then
    create policy "Users can delete cards in their own decks"
      on public.cards
      for delete
      using (
        exists (
          select 1
          from public.decks
          where decks.id = cards.deck_id
            and decks.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'study_logs'
      and policyname = 'Users can view their own study logs'
  ) then
    create policy "Users can view their own study logs"
      on public.study_logs
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'study_logs'
      and policyname = 'Users can insert their own study logs'
  ) then
    create policy "Users can insert their own study logs"
      on public.study_logs
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.delete_owned_cards_batch(
  p_deck_id uuid,
  p_card_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.decks
    where decks.id = p_deck_id
      and decks.user_id = v_user_id
  ) then
    raise exception 'Deck not found or access denied.';
  end if;

  delete from public.cards
  where cards.deck_id = p_deck_id
    and cards.id = any(p_card_ids);

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count > 0 then
    update public.decks
    set updated_at = now()
    where decks.id = p_deck_id
      and decks.user_id = v_user_id;
  end if;

  return v_deleted_count;
end;
$$;

revoke all on function public.delete_owned_cards_batch(uuid, uuid[]) from public;
grant execute on function public.delete_owned_cards_batch(uuid, uuid[]) to authenticated;
grant execute on function public.delete_owned_cards_batch(uuid, uuid[]) to service_role;
