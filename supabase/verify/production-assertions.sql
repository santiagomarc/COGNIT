-- ===================================================================
-- Production assertion suite.
--
-- Run in the Supabase SQL editor (or psql) after `supabase db push`.
-- Queries 1-3 must return ZERO rows. Queries 4-6 are inspected by eye.
--
-- These cannot run through the app's anon client because they read
-- pg_catalog, so they are kept here rather than in scripts/.
-- ===================================================================

-- 1. Every table in `public` must have at least one RLS policy.
--    Zero rows expected.
select tablename as table_without_rls_policy
from pg_tables
where schemaname = 'public'
  and tablename not in (
    select tablename from pg_policies where schemaname = 'public'
  );

-- 2. No SECURITY DEFINER functions. Every RPC in this project is
--    SECURITY INVOKER so that RLS still applies to the caller.
--    Zero rows expected.
select proname as security_definer_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true;

-- 3. Every function must pin search_path, or a malicious schema earlier on
--    the path can shadow the tables it references.
--    Zero rows expected.
select proname as function_without_pinned_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    p.proconfig is null
    or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  );

-- 4. Vector index: expect cards_embedding_hnsw_idx and NOT
--    cards_embedding_ivfflat_idx (which was trained on an empty table).
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'cards'
  and indexname like '%embedding%';

-- 5. Shared-deck policies: expect exactly TWO rows (decks + cards), and each
--    `qual` must require BOTH is_public = true AND share_token IS NOT NULL.
--    One flag alone would expose decks that were never given a token.
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and policyname ilike '%shared%';

-- 6. Confirm the study-data tables were NOT opened up by deck sharing.
--    Every policy here should still be scoped to auth.uid().
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'study_logs', 'quiz_results', 'quiz_card_results',
    'card_mastery_state', 'deck_chat_messages', 'deck_chat_sessions',
    'synthesis_drills', 'synthesis_attempts'
  )
order by tablename, cmd;

-- 7. Micro-synthesis history is append-only: synthesis_attempts must carry
--    BOTH deny policies. Expect exactly two rows, each with qual = false
--    (and with_check = false on the UPDATE row).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'synthesis_attempts'
  and cmd in ('UPDATE', 'DELETE')
order by cmd;

-- 8. No synthesis table may have a shared/public policy. Zero rows expected.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('synthesis_drills', 'synthesis_attempts')
  and (policyname ilike '%shared%' or policyname ilike '%public%');

-- ── Query plans ────────────────────────────────────────────────────
-- Substitute a real deck id. Expect "Index Scan using
-- cards_embedding_hnsw_idx", NOT "Seq Scan on cards".
--
-- explain (analyze, buffers)
-- select id, 1 - (embedding <=> '[0,0, ... 768 values ... ]'::vector(768)) as similarity
-- from cards
-- where deck_id = '<deck-uuid>' and embedding is not null
-- order by embedding <=> '[0,0, ... ]'::vector(768)
-- limit 5;
--
-- Expect "Index Scan using cards_deck_pending_embedding_idx".
--
-- explain (analyze, buffers)
-- select id from cards
-- where deck_id = '<deck-uuid>' and embedding is null
-- order by created_at limit 200;
