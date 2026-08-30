begin;

-- Monitoring is deliberately separate from generic administration.  All
-- functions below recheck the durable membership and AAL2 claim themselves;
-- a page guard is UX only, never the authorization boundary.
create table public.marketplace_chat_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  thread_id uuid references public.support_threads(id) on delete restrict,
  monitor_session_id uuid,
  action text not null check (action in ('open', 'search', 'export', 'moderate')),
  reason text check (reason is null or char_length(reason) between 5 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create unique index marketplace_chat_monitor_open_once
  on public.marketplace_chat_audit(actor_user_id, thread_id, monitor_session_id)
  where action = 'open';
create index marketplace_chat_audit_thread_created_idx on public.marketplace_chat_audit(thread_id, created_at desc);

create table public.marketplace_chat_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  message_id uuid references public.support_messages(id) on delete restrict,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict
);
create index marketplace_chat_reports_open_idx on public.marketplace_chat_reports(thread_id, created_at desc) where status = 'open';

create table public.marketplace_chat_risk_flags (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  message_id uuid references public.support_messages(id) on delete restrict,
  rule_id text not null check (rule_id ~ '^[a-z0-9_:.#-]{1,100}$'),
  score smallint not null check (score between 1 and 3),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array'),
  created_at timestamptz not null default now(),
  unique (message_id, rule_id)
);
create index marketplace_chat_risk_flags_thread_idx on public.marketplace_chat_risk_flags(thread_id, created_at desc);

create table public.marketplace_chat_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('warn', 'pause', 'close', 'reopen', 'review', 'escalate_dispute')),
  reason text not null check (char_length(reason) between 5 and 500),
  created_at timestamptz not null default now()
);

create table public.marketplace_chat_legal_holds (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references public.support_threads(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((released_at is null) = (released_by is null))
);

alter table public.marketplace_chat_audit enable row level security;
alter table public.marketplace_chat_reports enable row level security;
alter table public.marketplace_chat_risk_flags enable row level security;
alter table public.marketplace_chat_moderation_actions enable row level security;
alter table public.marketplace_chat_legal_holds enable row level security;
revoke all on table public.marketplace_chat_audit, public.marketplace_chat_reports,
  public.marketplace_chat_risk_flags, public.marketplace_chat_moderation_actions,
  public.marketplace_chat_legal_holds from public, anon, authenticated;
revoke update, delete on public.marketplace_chat_audit from public, anon, authenticated;

create or replace function public.require_marketplace_chat_monitor()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_marketplace_admin_role(array['chat_monitor']::public.marketplace_admin_role[]) then
    raise exception 'chat_monitor_required' using errcode = '42501';
  end if;
  perform public.activate_marketplace_admin_capability(array['chat_monitor']::public.marketplace_admin_role[]);
end;
$$;

create or replace function public.record_marketplace_chat_monitor_audit(
  p_action text, p_thread_id uuid, p_monitor_session_id uuid, p_reason text default null, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_marketplace_chat_monitor();
  if p_action not in ('open', 'search', 'export', 'moderate')
    or (p_action in ('open', 'moderate') and p_thread_id is null)
    or (p_reason is not null and char_length(p_reason) not between 5 and 500)
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_monitor_audit' using errcode = '22023';
  end if;
  insert into public.marketplace_chat_audit(actor_user_id, thread_id, monitor_session_id, action, reason, metadata)
  values ((select auth.uid()), p_thread_id, p_monitor_session_id, p_action, p_reason, coalesce(p_metadata, '{}'::jsonb))
  on conflict (actor_user_id, thread_id, monitor_session_id) where action = 'open' do nothing;
end;
$$;

create or replace function public.record_marketplace_chat_monitor_open(p_thread_id uuid, p_monitor_session_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_monitor_session_id is null then raise exception 'invalid_monitor_session' using errcode = '22023'; end if;
  perform public.record_marketplace_chat_monitor_audit('open', p_thread_id, p_monitor_session_id);
  return true;
end;
$$;

create or replace function public.list_marketplace_chat_monitor_queue(
  p_status text default null, p_has_report boolean default null, p_has_risk boolean default null,
  p_limit integer default 30, p_monitor_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_marketplace_chat_monitor();
  if p_limit not between 1 and 100 or (p_status is not null and p_status not in ('open','waiting_customer','waiting_support','resolved','closed','paused')) then
    raise exception 'invalid_monitor_queue' using errcode = '22023';
  end if;
  perform public.record_marketplace_chat_monitor_audit('search', (select id from public.support_threads order by last_message_at desc limit 1), p_monitor_session_id, null,
    jsonb_build_object('status', p_status, 'has_report', p_has_report, 'has_risk', p_has_risk, 'limit', p_limit));
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', thread.id, 'public_code', thread.public_code, 'subject', thread.subject, 'status', thread.status,
    'last_message_at', thread.last_message_at,
    'report_count', (select count(*) from public.marketplace_chat_reports report where report.thread_id = thread.id and report.status = 'open'),
    'risk_count', (select count(*) from public.marketplace_chat_risk_flags flag where flag.thread_id = thread.id)
  ) order by thread.last_message_at desc)
  from (select * from public.support_threads thread where
    (p_status is null or thread.status::text = p_status)
    and (p_has_report is null or p_has_report = exists (select 1 from public.marketplace_chat_reports report where report.thread_id = thread.id and report.status = 'open'))
    and (p_has_risk is null or p_has_risk = exists (select 1 from public.marketplace_chat_risk_flags flag where flag.thread_id = thread.id))
    order by thread.last_message_at desc limit p_limit) thread), '[]'::jsonb);
end;
$$;

create or replace function public.get_marketplace_chat_as_monitor(p_thread_id uuid, p_monitor_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_marketplace_chat_monitor();
  if not exists (select 1 from public.support_threads where id = p_thread_id) then raise exception 'chat_not_found' using errcode = 'P0002'; end if;
  perform public.record_marketplace_chat_monitor_open(p_thread_id, p_monitor_session_id);
  return public.get_my_marketplace_conversation_page(p_thread_id, 100, null, null);
end;
$$;

create or replace function public.export_marketplace_chat_monitor_queue(
  p_status text default null, p_has_report boolean default null, p_has_risk boolean default null,
  p_limit integer default 100, p_monitor_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.require_marketplace_chat_monitor();
  -- Exports contain queue metadata only; message bodies stay inside the audited
  -- monitor reader and never enter analytics or broad exports.
  v_result := public.list_marketplace_chat_monitor_queue(p_status, p_has_report, p_has_risk, p_limit, p_monitor_session_id);
  perform public.record_marketplace_chat_monitor_audit('export', null, p_monitor_session_id, null,
    jsonb_build_object('status', p_status, 'has_report', p_has_report, 'has_risk', p_has_risk, 'limit', p_limit));
  return v_result;
end;
$$;

create or replace function public.report_my_marketplace_chat_message(p_message_id uuid, p_thread_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_thread_id uuid;
begin
  if (select auth.uid()) is null or char_length(coalesce(p_reason, '')) not between 1 and 500 then raise exception 'invalid_chat_report' using errcode = '22023'; end if;
  select message.thread_id into v_thread_id from public.support_messages message where message.id = p_message_id and message.deleted_at is null;
  v_thread_id := coalesce(v_thread_id, p_thread_id);
  if v_thread_id is null or not public.can_access_marketplace_chat_thread(v_thread_id) then raise exception 'chat_not_found' using errcode = 'P0002'; end if;
  if p_message_id is not null and not exists (select 1 from public.support_messages where id = p_message_id and thread_id = v_thread_id) then raise exception 'chat_not_found' using errcode = 'P0002'; end if;
  return (with inserted as (
    insert into public.marketplace_chat_reports(thread_id, message_id, reporter_user_id, reason)
    values (v_thread_id, p_message_id, (select auth.uid()), p_reason)
    returning id, status, created_at
  ) select jsonb_build_object('id', id, 'status', status, 'created_at', created_at) from inserted);
end;
$$;

create or replace function public.moderate_marketplace_chat(
  p_thread_id uuid, p_action text, p_reason text, p_monitor_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  perform public.require_marketplace_chat_monitor();
  if p_action not in ('warn','pause','close','reopen','review','escalate_dispute') or char_length(coalesce(p_reason,'')) not between 5 and 500 then raise exception 'invalid_chat_moderation' using errcode = '22023'; end if;
  if not exists (select 1 from public.support_threads where id = p_thread_id) then raise exception 'chat_not_found' using errcode = 'P0002'; end if;
  if p_action in ('pause','close','reopen') then
    v_status := case p_action when 'pause' then 'paused' when 'close' then 'closed' else 'open' end;
    update public.support_threads set status = v_status::public.marketplace_support_status where id = p_thread_id;
  end if;
  insert into public.marketplace_chat_moderation_actions(thread_id, actor_user_id, action, reason) values (p_thread_id, (select auth.uid()), p_action, p_reason);
  perform public.record_marketplace_chat_monitor_audit('moderate', p_thread_id, p_monitor_session_id, p_reason, jsonb_build_object('action', p_action));
  return jsonb_build_object('thread_id', p_thread_id, 'action', p_action, 'status', coalesce(v_status, 'unchanged'));
end;
$$;

-- No audit/report/risk/moderation object is a Data API surface.  Only tightly
-- authorized SECURITY DEFINER RPCs are granted to authenticated callers.
revoke all on function public.require_marketplace_chat_monitor() from public, anon, authenticated;
revoke all on function public.record_marketplace_chat_monitor_audit(text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_marketplace_chat_monitor_open(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_marketplace_chat_monitor_queue(text, boolean, boolean, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_marketplace_chat_as_monitor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.export_marketplace_chat_monitor_queue(text, boolean, boolean, integer, uuid) from public, anon, authenticated;
revoke all on function public.report_my_marketplace_chat_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.moderate_marketplace_chat(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_marketplace_chat_monitor_open(uuid, uuid) to authenticated;
grant execute on function public.list_marketplace_chat_monitor_queue(text, boolean, boolean, integer, uuid) to authenticated;
grant execute on function public.get_marketplace_chat_as_monitor(uuid, uuid) to authenticated;
grant execute on function public.export_marketplace_chat_monitor_queue(text, boolean, boolean, integer, uuid) to authenticated;
grant execute on function public.report_my_marketplace_chat_message(uuid, uuid, text) to authenticated;
grant execute on function public.moderate_marketplace_chat(uuid, text, text, uuid) to authenticated;

commit;
