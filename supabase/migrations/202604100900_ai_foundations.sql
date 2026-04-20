-- AI foundations for reliability, enrichment, mnemonics, and deck chat.
-- Safe to re-run where possible through IF NOT EXISTS guards.

create extension if not exists vector;

alter table public.cards
  add column if not exists ai_hint text,
  add column if not exists topic_tags text[],
  add column if not exists mnemonic text,
  add column if not exists embedding vector(768);

create index if not exists cards_topic_tags_gin_idx
  on public.cards using gin (topic_tags);

create index if not exists cards_embedding_ivfflat_idx
  on public.cards using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

create table if not exists public.deck_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.deck_chat_sessions(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  referenced_card_ids uuid[] not null default '{}',
  followup_suggestions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.deck_chat_embedding_metadata (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_cards integer not null default 0,
  embedded_cards integer not null default 0,
  last_sync_at timestamptz,
  sync_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, user_id)
);

create index if not exists deck_chat_sessions_deck_id_user_id_idx
  on public.deck_chat_sessions (deck_id, user_id, updated_at desc);

create index if not exists deck_chat_messages_session_id_created_at_idx
  on public.deck_chat_messages (session_id, created_at asc);

create index if not exists deck_chat_messages_deck_id_created_at_idx
  on public.deck_chat_messages (deck_id, created_at desc);

create index if not exists deck_chat_embedding_metadata_deck_user_idx
  on public.deck_chat_embedding_metadata (deck_id, user_id);

alter table public.deck_chat_sessions enable row level security;
alter table public.deck_chat_messages enable row level security;
alter table public.deck_chat_embedding_metadata enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deck_chat_sessions'
      and policyname = 'Users can view their own deck chat sessions'
  ) then
    create policy "Users can view their own deck chat sessions"
      on public.deck_chat_sessions
      for select
      using (
        auth.uid() = user_id and exists (
          select 1
          from public.decks
          where decks.id = deck_chat_sessions.deck_id
            and decks.user_id = auth.uid()
        )
      );
  end if;
end $$;

create or replace function public.search_deck_cards_by_embedding(
  p_deck_id uuid,
  p_query_embedding vector(768),
  p_limit integer default 5
)
returns table (
  id uuid,
  front text,
  back text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cards.id,
    cards.front,
    cards.back,
    1 - (cards.embedding <=> p_query_embedding) as similarity
  from public.cards
  where cards.deck_id = p_deck_id
    and cards.embedding is not null
    and exists (
      select 1
      from public.decks
      where decks.id = cards.deck_id
        and decks.user_id = auth.uid()
    )
  order by cards.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.search_deck_cards_by_embedding(uuid, vector, integer) from public;
grant execute on function public.search_deck_cards_by_embedding(uuid, vector, integer) to authenticated;
grant execute on function public.search_deck_cards_by_embedding(uuid, vector, integer) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deck_chat_sessions'
      and policyname = 'Users can insert their own deck chat sessions'
  ) then
    create policy "Users can insert their own deck chat sessions"
      on public.deck_chat_sessions
      for insert
      with check (
        auth.uid() = user_id and exists (
          select 1
          from public.decks
          where decks.id = deck_chat_sessions.deck_id
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
      and tablename = 'deck_chat_sessions'
      and policyname = 'Users can update their own deck chat sessions'
  ) then
    create policy "Users can update their own deck chat sessions"
      on public.deck_chat_sessions
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
      and tablename = 'deck_chat_sessions'
      and policyname = 'Users can delete their own deck chat sessions'
  ) then
    create policy "Users can delete their own deck chat sessions"
      on public.deck_chat_sessions
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
      and tablename = 'deck_chat_messages'
      and policyname = 'Users can view their own deck chat messages'
  ) then
    create policy "Users can view their own deck chat messages"
      on public.deck_chat_messages
      for select
      using (
        auth.uid() = user_id and exists (
          select 1
          from public.decks
          where decks.id = deck_chat_messages.deck_id
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
      and tablename = 'deck_chat_messages'
      and policyname = 'Users can insert their own deck chat messages'
  ) then
    create policy "Users can insert their own deck chat messages"
      on public.deck_chat_messages
      for insert
      with check (
        auth.uid() = user_id and exists (
          select 1
          from public.decks
          where decks.id = deck_chat_messages.deck_id
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
      and tablename = 'deck_chat_messages'
      and policyname = 'Users can delete their own deck chat messages'
  ) then
    create policy "Users can delete their own deck chat messages"
      on public.deck_chat_messages
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
      and tablename = 'deck_chat_embedding_metadata'
      and policyname = 'Users can view their own deck chat embedding metadata'
  ) then
    create policy "Users can view their own deck chat embedding metadata"
      on public.deck_chat_embedding_metadata
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
      and tablename = 'deck_chat_embedding_metadata'
      and policyname = 'Users can insert their own deck chat embedding metadata'
  ) then
    create policy "Users can insert their own deck chat embedding metadata"
      on public.deck_chat_embedding_metadata
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
      and tablename = 'deck_chat_embedding_metadata'
      and policyname = 'Users can update their own deck chat embedding metadata'
  ) then
    create policy "Users can update their own deck chat embedding metadata"
      on public.deck_chat_embedding_metadata
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ai_usage_logs'
  ) then
    alter table public.ai_usage_logs
      drop constraint if exists ai_usage_logs_action_check;

    alter table public.ai_usage_logs
      add constraint ai_usage_logs_action_check
      check (action in (
        'generate_cards',
        'enrich_cards',
        'sanitize_notes',
        'get_hint',
        'chat_with_deck',
        'sync_embeddings',
        'generate_mnemonic'
      ));
  end if;
end $$;
