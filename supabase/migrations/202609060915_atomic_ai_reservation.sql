-- Atomic AI reservation RPC (S-2, Task 2.4)
create or replace function public.reserve_ai_call(
  p_action text,
  p_window_minutes integer,
  p_max_requests integer,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_used integer;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  -- Serialises concurrent reservations for this (user, action) pair. Advisory
  -- locks are transaction-scoped and released automatically on commit/abort.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action));

  select count(*) into v_used
  from public.ai_usage_logs
  where user_id = v_user_id
    and action = p_action
    and created_at >= now() - make_interval(mins => p_window_minutes);

  if v_used >= p_max_requests then
    raise exception 'AI_RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_logs (user_id, action, metadata)
  values (v_user_id, p_action, p_metadata)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_ai_call(text, integer, integer, jsonb) from public;
grant execute on function public.reserve_ai_call(text, integer, integer, jsonb) to authenticated;
