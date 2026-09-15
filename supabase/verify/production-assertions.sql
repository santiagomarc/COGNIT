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
    'synthesis_drills', 'synthesis_attempts', 'synthesis_attempt_feedback'
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
  and tablename in ('synthesis_drills', 'synthesis_attempts', 'synthesis_attempt_feedback')
  and (policyname ilike '%shared%' or policyname ilike '%public%');

-- 9. Phase 3 (202609150900) landed: both denormalised readings columns, the
--    idempotency key with its partial unique index, and the feedback table.
--    Expect 5 column rows and 1 index row.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'synthesis_drills' and column_name in ('link_count', 'last_links_covered'))
    or (table_name = 'synthesis_attempts' and column_name in ('client_attempt_id', 'confidence', 'revision_of'))
  )
order by table_name, column_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'synthesis_attempts_client_key_idx';

-- 10. The AI usage allow-list still names both synthesis actions (a deploy
--     before `db push` fails every synthesis call at reservation). Expect the
--     constraint definition to contain 'synthesis_generate' and 'synthesis_check'.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'ai_usage_logs_action_check'
  and pg_get_constraintdef(oid) like '%synthesis_generate%'
  and pg_get_constraintdef(oid) like '%synthesis_check%';

-- 11. Calibration and check latency, for tuning (audit F1/F5 and §11.3).
--     Verdict distribution with p50/p95 model time in the last 30 days, and
--     the share of checks rated unfair per verdict.
select
  a.verdict,
  count(*) as attempts,
  percentile_cont(0.5) within group (order by (a.usage->>'ms')::numeric) as p50_ms,
  percentile_cont(0.95) within group (order by (a.usage->>'ms')::numeric) as p95_ms,
  sum((a.usage->>'dropped_contradictions')::int) as dropped_contradictions,
  count(f.id) filter (where f.rating = 'unfair') as rated_unfair,
  count(f.id) as rated
from public.synthesis_attempts a
left join public.synthesis_attempt_feedback f on f.attempt_id = a.id
where a.created_at > now() - interval '30 days'
group by a.verdict
order by attempts desc;

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
