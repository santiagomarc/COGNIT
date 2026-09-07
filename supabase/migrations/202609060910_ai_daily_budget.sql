-- Daily AI budget index (S-2, §3.11)
create index if not exists ai_usage_logs_user_created_at_idx
  on public.ai_usage_logs (user_id, created_at desc);
