-- ===================================================================
-- What each AI call cost (COGNIT_PERFORMANCE_PLAN.md §4.2, AI-16).
--
-- One row per completed reservation: elapsed ms, time to first token for
-- streams, tokens and the finish reason. ai_usage_logs stays the audit log
-- and the only thing the rate limiter counts; it is immutable (202609050900),
-- so the outcome cannot be written back onto the reservation, and an extra
-- ai_usage_logs row would count against the user's limits.
--
-- A reservation with no outcome row failed or was abandoned, so the failure
-- rate is a left join (plan Appendix B.2), not something every call reports.
-- Append-only, like the log it describes.
-- ===================================================================

create table if not exists public.ai_call_outcomes (
  reservation_id uuid primary key references public.ai_usage_logs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  ms integer not null check (ms >= 0),
  ttft_ms integer check (ttft_ms is null or ttft_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  thought_tokens integer check (thought_tokens is null or thought_tokens >= 0),
  finish_reason text,
  created_at timestamptz not null default now()
);

-- Leading-column index for the user_id foreign key (assertion 14), shaped for
-- "my recent calls"; the action index serves the per-action latency query.
create index if not exists ai_call_outcomes_user_created_idx
  on public.ai_call_outcomes (user_id, created_at desc);
create index if not exists ai_call_outcomes_action_created_idx
  on public.ai_call_outcomes (action, created_at desc);

alter table public.ai_call_outcomes enable row level security;

-- All four commands (policy completeness, 202609060920), auth.uid() as an
-- InitPlan (202609170950, assertion 13).
drop policy if exists "Users read their own AI outcomes" on public.ai_call_outcomes;
create policy "Users read their own AI outcomes"
  on public.ai_call_outcomes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users record their own AI outcomes" on public.ai_call_outcomes;
create policy "Users record their own AI outcomes"
  on public.ai_call_outcomes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users cannot update AI outcomes" on public.ai_call_outcomes;
create policy "Users cannot update AI outcomes"
  on public.ai_call_outcomes for update
  using (false) with check (false);

drop policy if exists "Users cannot delete AI outcomes" on public.ai_call_outcomes;
create policy "Users cannot delete AI outcomes"
  on public.ai_call_outcomes for delete
  using (false);
