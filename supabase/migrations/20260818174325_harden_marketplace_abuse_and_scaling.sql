-- Bound user-controlled fan-out and high-volume public/support reads. All
-- changes are additive and retain the previous RPC signatures for rolling
-- deployments.
begin;

create table public.marketplace_actor_rate_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('push_register', 'support_create', 'support_reply')),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 10000),
  updated_at timestamptz not null default now(),
  primary key (actor_id, action)
);

alter table public.marketplace_actor_rate_limits enable row level security;
revoke all on table public.marketplace_actor_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_actor_rate_limits to service_role;

create or replace function public.consume_my_marketplace_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_attempts integer;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_action not in ('push_register', 'support_create', 'support_reply')
     or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketplace-rate:' || v_actor::text || ':' || p_action, 0)
  );
  insert into public.marketplace_actor_rate_limits (
    actor_id, action, window_started_at, attempts, updated_at
  ) values (
    v_actor, p_action, now(), 1, now()
  )
  on conflict (actor_id, action) do update set
    window_started_at = case
      when public.marketplace_actor_rate_limits.window_started_at
        <= now() - pg_catalog.make_interval(secs => p_window_seconds)
      then now() else public.marketplace_actor_rate_limits.window_started_at end,
    attempts = case
      when public.marketplace_actor_rate_limits.window_started_at
        <= now() - pg_catalog.make_interval(secs => p_window_seconds)
      then 1 else public.marketplace_actor_rate_limits.attempts + 1 end,
    updated_at = now()
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_my_marketplace_rate_limit(text, integer, integer)
  from public, anon, authenticated, service_role;

-- A user may keep a bounded number of browsers/devices. Endpoint ownership
-- can only move when the caller presents the exact browser-held key pair.
create or replace function public.register_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_app_origin text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.push_subscriptions;
  v_id uuid;
  v_endpoint_origin text;
  v_active_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.consume_my_marketplace_rate_limit('push_register', 20, 3600) then
    raise exception 'push_registration_rate_limited' using errcode = '22023';
  end if;
  v_endpoint_origin := lower(pg_catalog.substring(p_endpoint, '^(https://[^/]+)'));
  if p_endpoint is null or char_length(p_endpoint) not between 20 and 2048
     or p_endpoint !~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?/'
     or p_endpoint ~ '[[:space:]]'
     or not public.marketplace_push_endpoint_allowed(p_endpoint)
     or p_p256dh !~ '^[A-Za-z0-9_-]{40,255}$'
     or p_auth !~ '^[A-Za-z0-9_-]{12,128}$'
     or not (
       p_app_origin ~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?$'
       or p_app_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
     )
     or p_user_agent is not null and char_length(p_user_agent) > 512 then
    raise exception 'invalid_push_subscription' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-endpoint:' || p_endpoint, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-user:' || v_user::text, 0)
  );
  select * into v_existing
  from public.push_subscriptions
  where endpoint = p_endpoint
  for update;

  if v_existing.id is not null
     and v_existing.user_id <> v_user
     and not (v_existing.p256dh = p_p256dh and v_existing.auth = p_auth) then
    raise exception 'subscription_owned_by_another_user' using errcode = '42501';
  end if;

  if v_existing.id is null or v_existing.user_id <> v_user or not v_existing.is_active then
    select count(*)::integer into v_active_count
    from public.push_subscriptions
    where user_id = v_user and is_active;
    if v_active_count >= 8 then
      raise exception 'push_subscription_limit_reached' using errcode = '22023';
    end if;
  end if;

  if v_existing.id is not null and v_existing.user_id <> v_user then
    update public.marketplace_push_jobs
    set dead_lettered_at = now(), locked_at = null, worker_id = null,
        failure_code = 'invalid_subscription'
    where subscription_id = v_existing.id
      and processed_at is null and dead_lettered_at is null;
  end if;

  insert into public.push_subscriptions (
    user_id, profile_id, endpoint, endpoint_origin, app_origin,
    p256dh, auth, user_agent, is_active, failure_count, disabled_at, updated_at
  ) values (
    v_user,
    case when exists (select 1 from public.profiles where id = v_user) then v_user else null end,
    p_endpoint, v_endpoint_origin, lower(p_app_origin),
    p_p256dh, p_auth, nullif(left(p_user_agent, 512), ''), true, 0, null, now()
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    endpoint_origin = excluded.endpoint_origin,
    app_origin = excluded.app_origin,
    user_agent = excluded.user_agent,
    is_active = true,
    failure_count = 0,
    disabled_at = null,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Never deliver a queued notification after a proven endpoint transfer.
create or replace function public.claim_marketplace_push_jobs(
  p_limit integer,
  p_worker_id uuid
)
returns table (
  id bigint,
  endpoint text,
  p256dh text,
  auth text,
  notification_type text,
  href text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 50 or p_worker_id is null then
    raise exception 'invalid_push_claim' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select job.id
    from public.marketplace_push_jobs as job
    join public.push_subscriptions as subscription
      on subscription.id = job.subscription_id
     and subscription.is_active
     and subscription.user_id = job.recipient_id
    where job.processed_at is null and job.dead_lettered_at is null
      and job.available_at <= now() and job.attempts < 5
      and (job.locked_at is null or job.locked_at < now() - interval '5 minutes')
    order by job.available_at, job.id
    for update of job skip locked
    limit p_limit
  ), claimed as (
    update public.marketplace_push_jobs as job
    set locked_at = now(), worker_id = p_worker_id, attempts = job.attempts + 1
    from candidates where job.id = candidates.id
    returning job.*
  )
  select claimed.id, subscription.endpoint, subscription.p256dh, subscription.auth,
    notification.type,
    case when notification.data->>'href' ~ '^/(account|merchant|admin|driver)(/|$)'
      then notification.data->>'href' else '/account/notifications' end,
    claimed.attempts
  from claimed
  join public.push_subscriptions as subscription
    on subscription.id = claimed.subscription_id
   and subscription.user_id = claimed.recipient_id
  join public.app_notifications as notification on notification.id = claimed.notification_id;
end;
$$;

-- Quarantine any mismatched jobs created before the transfer-safe contract.
update public.marketplace_push_jobs as job
set dead_lettered_at = now(), locked_at = null, worker_id = null,
    failure_code = 'invalid_subscription'
from public.push_subscriptions as subscription
where subscription.id = job.subscription_id
  and subscription.user_id <> job.recipient_id
  and job.processed_at is null
  and job.dead_lettered_at is null;

alter table public.support_threads
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists support_threads_creator_active_idx
  on public.support_threads (created_by_user_id, created_at desc)
  where status not in ('resolved', 'closed');

create index if not exists support_messages_thread_cursor_idx
  on public.support_messages (thread_id, created_at desc, id desc);

create or replace function public.create_my_marketplace_support_thread(
  p_order_id uuid,
  p_store_id uuid,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_customer_id uuid;
  v_order public.marketplace_orders;
  v_store_id uuid := p_store_id;
  v_sender_kind text;
  v_thread public.support_threads;
begin
  if v_actor_id is null
     or char_length(trim(coalesce(p_subject, ''))) not between 3 and 160
     or char_length(trim(coalesce(p_message, ''))) not between 1 and 5000 then
    raise exception 'invalid_support_thread' using errcode = '22023';
  end if;
  if not public.consume_my_marketplace_rate_limit('support_create', 5, 3600) then
    raise exception 'support_create_rate_limited' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('support-create:' || v_actor_id::text, 0)
  );
  if (select count(*) from public.support_threads
      where created_by_user_id = v_actor_id and status not in ('resolved', 'closed')) >= 20 then
    raise exception 'support_open_thread_limit_reached' using errcode = '22023';
  end if;

  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = v_actor_id and is_active;
  if p_order_id is not null then
    select * into v_order from public.marketplace_orders where id = p_order_id;
    if v_order is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
    v_store_id := v_order.store_id;
    if v_customer_id = v_order.customer_id then
      v_sender_kind := 'customer';
    elsif public.is_marketplace_admin() then
      v_sender_kind := 'admin';
    elsif public.can_manage_store(v_order.store_id) then
      v_sender_kind := 'merchant';
      v_customer_id := v_order.customer_id;
    else
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
  elsif v_store_id is not null and public.can_manage_store(v_store_id) then
    v_sender_kind := case when public.is_marketplace_admin() then 'admin' else 'merchant' end;
  elsif v_store_id is not null and v_customer_id is not null
        and exists (select 1 from public.stores where id = v_store_id and status = 'published') then
    v_sender_kind := 'customer';
  else
    raise exception 'support_participant_required' using errcode = '42501';
  end if;
  insert into public.support_threads (
    customer_id, store_id, order_id, subject, created_by_user_id
  ) values (
    v_customer_id, v_store_id, p_order_id, trim(p_subject), v_actor_id
  ) returning * into v_thread;
  insert into public.support_messages (thread_id, sender_user_id, sender_kind, body)
  values (v_thread.id, v_actor_id, v_sender_kind, trim(p_message));
  insert into public.support_thread_reads (thread_id, user_id, last_read_at)
  values (v_thread.id, v_actor_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object(
    'id', v_thread.id, 'public_code', v_thread.public_code,
    'subject', v_thread.subject, 'status', v_thread.status,
    'order_id', v_thread.order_id, 'last_message_at', v_thread.last_message_at
  );
end;
$$;

create or replace function public.reply_my_marketplace_support_thread(
  p_thread_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
  v_sender_kind text;
  v_message public.support_messages;
  v_message_count integer;
begin
  if v_actor_id is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 5000
     or not public.can_access_marketplace_support_thread(p_thread_id) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if not public.consume_my_marketplace_rate_limit('support_reply', 30, 600) then
    raise exception 'support_reply_rate_limited' using errcode = '22023';
  end if;
  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if v_thread.status = 'closed' then raise exception 'support_thread_closed' using errcode = '55000'; end if;
  select count(*)::integer into v_message_count
  from public.support_messages where thread_id = v_thread.id;
  if v_message_count >= 500 then
    raise exception 'support_message_limit_reached' using errcode = '22023';
  end if;
  if public.is_marketplace_admin() then
    v_sender_kind := 'admin';
  elsif exists (
    select 1 from public.marketplace_customers
    where id = v_thread.customer_id and auth_user_id = v_actor_id and is_active
  ) then
    v_sender_kind := 'customer';
  else
    v_sender_kind := 'merchant';
  end if;
  insert into public.support_messages (thread_id, sender_user_id, sender_kind, body)
  values (v_thread.id, v_actor_id, v_sender_kind, trim(p_body))
  returning * into v_message;
  update public.support_threads
  set status = case when v_sender_kind = 'customer' then 'waiting_support'
                    else 'waiting_customer' end,
      last_message_at = v_message.created_at, resolved_at = null, updated_at = now()
  where id = v_thread.id;
  insert into public.support_thread_reads (thread_id, user_id, last_read_at)
  values (v_thread.id, v_actor_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object(
    'id', v_message.id, 'author_role', v_message.sender_kind,
    'body', v_message.body, 'created_at', v_message.created_at
  );
end;
$$;

create or replace function public.get_my_marketplace_support_thread_page(
  p_thread_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
  v_messages jsonb;
  v_next_cursor jsonb;
  v_has_more boolean;
begin
  if v_actor_id is null
     or p_limit not between 1 and 100
     or ((p_before_created_at is null) <> (p_before_id is null))
     or not public.can_access_marketplace_support_thread(p_thread_id) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  select * into v_thread from public.support_threads where id = p_thread_id;

  with candidates as materialized (
    select message.id, message.sender_kind, message.body, message.created_at
    from public.support_messages as message
    where message.thread_id = v_thread.id
      and (p_before_created_at is null
        or (message.created_at, message.id) < (p_before_created_at, p_before_id))
    order by message.created_at desc, message.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by created_at desc, id desc
    limit p_limit
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id, 'author_role', page.sender_kind,
      'body', page.body, 'created_at', page.created_at
    ) order by page.created_at, page.id) from page), '[]'::jsonb),
    (select count(*) > p_limit from candidates),
    case when (select count(*) > p_limit from candidates) then (
      select jsonb_build_object('created_at', page.created_at, 'id', page.id)
      from page order by page.created_at, page.id limit 1
    ) else null end
  into v_messages, v_has_more, v_next_cursor;

  if p_before_created_at is null then
    insert into public.support_thread_reads (thread_id, user_id, last_read_at)
    values (v_thread.id, v_actor_id, now())
    on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;

  return jsonb_build_object(
    'id', v_thread.id, 'public_code', v_thread.public_code,
    'subject', v_thread.subject, 'status', v_thread.status,
    'order_id', v_thread.order_id, 'store_id', v_thread.store_id,
    'last_message_at', v_thread.last_message_at,
    'messages', v_messages,
    'next_cursor', v_next_cursor,
    'has_more', v_has_more
  );
end;
$$;

create or replace function public.get_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.get_my_marketplace_support_thread_page(p_thread_id, 50, null, null);
$$;

-- Public cards now fetch only the requested, contact-free rows in one query.
create or replace function public.list_public_driver_summaries(p_limit integer default 4)
returns table (id uuid, name text, vehicle_type text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 12 then
    raise exception 'invalid_public_driver_limit' using errcode = '22023';
  end if;
  return query
  with drivers as (
    select profile.id, profile.display_name as name,
      coalesce(driver.vehicle_type, legacy.vehicle_type) as vehicle_type,
      coalesce(driver.is_available and driver.active_until > now(), false) as available,
      coalesce(legacy.created_at, profile.created_at) as created_at,
      0 as source_order
    from public.profiles as profile
    join public.driver_profiles as driver on driver.profile_id = profile.id
    left join public.drivers as legacy on legacy.id = driver.legacy_driver_id
    where profile.role = 'driver' and profile.is_active
    union all
    select legacy.id, coalesce(nullif(trim(legacy.name), ''), 'كابتن توصيل'),
      legacy.vehicle_type,
      coalesce(legacy.is_active and legacy.active_until > now(), false) as available,
      legacy.created_at, 1 as source_order
    from public.drivers as legacy
    where legacy.is_active
      and not exists (
        select 1 from public.driver_profiles as driver
        where driver.legacy_driver_id = legacy.id
      )
  )
  select drivers.id, drivers.name, drivers.vehicle_type
  from drivers
  order by drivers.available desc, drivers.source_order, drivers.created_at desc, drivers.id
  limit p_limit;
end;
$$;

revoke all on function public.register_my_push_subscription(text, text, text, text, text)
  from public, anon;
grant execute on function public.register_my_push_subscription(text, text, text, text, text)
  to authenticated;
revoke all on function public.claim_marketplace_push_jobs(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_marketplace_push_jobs(integer, uuid) to service_role;
revoke all on function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  to authenticated;
revoke all on function public.reply_my_marketplace_support_thread(uuid, text)
  from public, anon;
grant execute on function public.reply_my_marketplace_support_thread(uuid, text)
  to authenticated;
revoke all on function public.get_my_marketplace_support_thread_page(uuid, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_my_marketplace_support_thread_page(uuid, integer, timestamptz, uuid)
  to authenticated;
revoke all on function public.get_my_marketplace_support_thread(uuid) from public, anon;
grant execute on function public.get_my_marketplace_support_thread(uuid) to authenticated;
revoke all on function public.list_public_driver_summaries(integer) from public;
grant execute on function public.list_public_driver_summaries(integer) to anon, authenticated;

commit;
