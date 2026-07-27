-- SECURITY DEFINER changes current_user to the function owner, so authorization
-- must use the caller's JWT role instead.

create or replace function public.consume_account_request_rate_limit(
  p_request_key text,
  p_limit integer default 8
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if char_length(coalesce(p_request_key, '')) <> 64
     or p_limit < 1
     or p_limit > 50 then
    raise exception 'invalid_rate_limit_input';
  end if;

  insert into public.account_request_rate_limits (
    request_key, window_started_at, attempts, updated_at
  )
  values (p_request_key, now(), 1, now())
  on conflict (request_key) do update
  set window_started_at = case
        when account_request_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else account_request_rate_limits.window_started_at
      end,
      attempts = case
        when account_request_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else account_request_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_account_request_rate_limit(text, integer) from public;
grant execute on function public.consume_account_request_rate_limit(text, integer) to service_role;

