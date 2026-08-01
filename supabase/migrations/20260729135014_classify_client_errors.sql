alter table public.client_error_reports
  add column if not exists error_kind text not null default 'Unknown';

alter table public.client_error_reports
  drop constraint if exists client_error_reports_error_kind_check;

alter table public.client_error_reports
  add constraint client_error_reports_error_kind_check
  check (
    error_kind in (
      'ReactError',
      'ChunkLoadError',
      'NetworkError',
      'AbortError',
      'TypeError',
      'ReferenceError',
      'RangeError',
      'SyntaxError',
      'Unknown'
    )
  );

create or replace function public.record_client_error_v2(
  p_request_key text,
  p_fingerprint text,
  p_event_type text,
  p_error_kind text,
  p_route text,
  p_browser_family text,
  p_os_family text,
  p_release text,
  p_limit integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_request_key !~ '^[a-f0-9]{64}$'
     or p_fingerprint !~ '^[a-f0-9]{16,64}$'
     or p_event_type not in ('window_error', 'unhandled_rejection', 'react_boundary')
     or p_error_kind not in (
       'ReactError',
       'ChunkLoadError',
       'NetworkError',
       'AbortError',
       'TypeError',
       'ReferenceError',
       'RangeError',
       'SyntaxError',
       'Unknown'
     )
     or p_route !~ '^/'
     or char_length(p_route) > 160
     or p_limit not between 1 and 50 then
    raise exception 'invalid_client_error_input';
  end if;

  delete from public.client_error_rate_limits
  where updated_at < now() - interval '2 hours';
  delete from public.client_error_reports
  where last_seen_at < now() - interval '30 days';

  insert into public.client_error_rate_limits (
    request_key, window_started_at, attempts, updated_at
  )
  values (p_request_key, now(), 1, now())
  on conflict (request_key) do update
  set window_started_at = case
        when client_error_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else client_error_rate_limits.window_started_at
      end,
      attempts = case
        when client_error_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else client_error_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;

  if v_attempts > p_limit then return false; end if;

  insert into public.client_error_reports (
    fingerprint,
    event_type,
    error_kind,
    route,
    browser_family,
    os_family,
    release
  )
  values (
    p_fingerprint,
    p_event_type,
    p_error_kind,
    left(p_route, 160),
    left(p_browser_family, 24),
    left(p_os_family, 24),
    left(p_release, 64)
  )
  on conflict (fingerprint, event_type, route, browser_family, os_family, release)
  do update set
    error_kind = excluded.error_kind,
    occurrences = client_error_reports.occurrences + 1,
    last_seen_at = now();
  return true;
end;
$$;

revoke all on function public.record_client_error_v2(
  text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.record_client_error_v2(
  text, text, text, text, text, text, text, text, integer
) to service_role;
