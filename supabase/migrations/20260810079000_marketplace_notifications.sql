begin;

-- Marketplace inbox and Web Push are deliberately RPC-only. The legacy
-- push_subscriptions table is retained for backwards compatibility, but its
-- broad client-side DML surface is removed below.
alter table public.push_subscriptions
  alter column profile_id drop not null;
alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists app_origin text,
  add column if not exists endpoint_origin text,
  add column if not exists is_active boolean not null default true,
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_success_at timestamptz,
  add column if not exists disabled_at timestamptz;

update public.push_subscriptions
set user_id = profile_id,
    app_origin = coalesce(app_origin, 'https://legacy.invalid'),
    endpoint_origin = coalesce(
      endpoint_origin,
      lower(pg_catalog.substring(endpoint, '^(https://[^/]+)')),
      'https://legacy.invalid'
    ),
    user_agent = case when user_agent is null then null else left(user_agent, 512) end
where user_id is null or app_origin is null or endpoint_origin is null
   or char_length(user_agent) > 512;

create or replace function public.marketplace_push_endpoint_allowed(p_endpoint text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_endpoint !~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?/' then false
    else lower(pg_catalog.substring(p_endpoint, '^https://([^/:]+)')) in (
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'push.services.mozilla.com',
      'web.push.apple.com'
    ) or lower(pg_catalog.substring(p_endpoint, '^https://([^/:]+)'))
      ~ '^[a-z0-9-]+\.notify\.windows\.com$'
  end;
$$;

update public.push_subscriptions
set is_active = false,
    disabled_at = coalesce(disabled_at, now())
where endpoint !~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?/'
   or char_length(endpoint) not between 20 and 2048
   or p256dh !~ '^[A-Za-z0-9_-]{40,255}$'
   or auth !~ '^[A-Za-z0-9_-]{12,128}$'
   or not public.marketplace_push_endpoint_allowed(endpoint);

alter table public.push_subscriptions alter column user_id set not null;
alter table public.push_subscriptions alter column app_origin set not null;
alter table public.push_subscriptions alter column endpoint_origin set not null;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https_check
    check (not is_active or (
      char_length(endpoint) between 20 and 2048
      and endpoint ~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?/'
      and endpoint !~ '[[:space:]]'
      and public.marketplace_push_endpoint_allowed(endpoint)
    )) not valid,
  add constraint push_subscriptions_endpoint_origin_check
    check (endpoint_origin ~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?$') not valid,
  add constraint push_subscriptions_app_origin_check
    check (app_origin ~ '^https://[^/@[:space:]]+(?::[0-9]{1,5})?$'
      or app_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$') not valid,
  add constraint push_subscriptions_p256dh_check
    check (not is_active or p256dh ~ '^[A-Za-z0-9_-]{40,255}$') not valid,
  add constraint push_subscriptions_auth_check
    check (not is_active or auth ~ '^[A-Za-z0-9_-]{12,128}$') not valid,
  add constraint push_subscriptions_user_agent_check
    check (user_agent is null or char_length(user_agent) <= 512) not valid,
  add constraint push_subscriptions_failure_count_check
    check (failure_count between 0 and 100) not valid;

alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_https_check;
alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_origin_check;
alter table public.push_subscriptions validate constraint push_subscriptions_app_origin_check;
alter table public.push_subscriptions validate constraint push_subscriptions_p256dh_check;
alter table public.push_subscriptions validate constraint push_subscriptions_auth_check;
alter table public.push_subscriptions validate constraint push_subscriptions_user_agent_check;
alter table public.push_subscriptions validate constraint push_subscriptions_failure_count_check;

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, updated_at desc) where is_active;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant all on table public.push_subscriptions to service_role;

create table public.marketplace_push_jobs (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id uuid,
  attempts integer not null default 0 check (attempts between 0 and 10),
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  failure_code text check (
    failure_code is null or failure_code in (
      'expired_subscription', 'rate_limited', 'provider_unavailable',
      'invalid_subscription', 'configuration_error', 'send_failed'
    )
  ),
  created_at timestamptz not null default now(),
  unique (notification_id, subscription_id),
  check (processed_at is null or dead_lettered_at is null)
);

create index marketplace_push_jobs_pending_idx
  on public.marketplace_push_jobs (available_at, id)
  where processed_at is null and dead_lettered_at is null;
create index marketplace_push_jobs_subscription_idx
  on public.marketplace_push_jobs (subscription_id, created_at desc);

alter table public.marketplace_push_jobs enable row level security;
revoke all on table public.marketplace_push_jobs from public, anon, authenticated;
revoke all on sequence public.marketplace_push_jobs_id_seq from public, anon, authenticated;
grant all on table public.marketplace_push_jobs to service_role;
grant all on sequence public.marketplace_push_jobs_id_seq to service_role;

-- Safe, internal notification primitive. It only accepts in-app paths from a
-- fixed role allowlist and queues push delivery idempotently via the trigger.
create or replace function public.emit_marketplace_notification(
  p_recipient_id uuid,
  p_event_key text,
  p_type text,
  p_title text,
  p_body text,
  p_href text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_recipient_id is null
     or p_event_key is null or char_length(p_event_key) not between 8 and 240
     or p_type is null or p_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
     or p_title is null or char_length(trim(p_title)) not between 2 and 160
     or p_body is null or char_length(trim(p_body)) not between 2 and 1000
     or p_href is null
     or p_href !~ '^/(account|merchant|admin|driver)(/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+)?$'
  then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;

  insert into public.app_notifications (
    recipient_id, event_key, type, title, body, data
  ) values (
    p_recipient_id, p_event_key, p_type, trim(p_title), trim(p_body),
    pg_catalog.jsonb_build_object('href', p_href)
  )
  on conflict (event_key) do update
    set event_key = excluded.event_key
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.enqueue_marketplace_push_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.marketplace_push_jobs (
    notification_id, subscription_id, recipient_id
  )
  select new.id, subscription.id, new.recipient_id
  from public.push_subscriptions as subscription
  where subscription.user_id = new.recipient_id
    and subscription.is_active
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;

drop trigger if exists app_notifications_enqueue_push on public.app_notifications;
create trigger app_notifications_enqueue_push
after insert on public.app_notifications
for each row execute function public.enqueue_marketplace_push_job();

create or replace function public.notify_marketplace_store_members(
  p_store_id uuid,
  p_event_key text,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_exclude uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.app_notifications (
    recipient_id, event_key, type, title, body, data
  )
  select membership.user_id, p_event_key || ':' || membership.user_id::text,
    p_type, trim(p_title), trim(p_body), pg_catalog.jsonb_build_object('href', p_href)
    from public.store_memberships as membership
    where membership.store_id = p_store_id
      and membership.is_active
      and membership.user_id is distinct from p_exclude
  on conflict (event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.notify_marketplace_admins(
  p_event_key text,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_exclude uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.app_notifications (
    recipient_id, event_key, type, title, body, data
  )
  select profile.id, p_event_key || ':' || profile.id::text,
    p_type, trim(p_title), trim(p_body), pg_catalog.jsonb_build_object('href', p_href)
    from public.profiles as profile
    where profile.role = 'admin'
      and profile.is_active
      and profile.id is distinct from p_exclude
  on conflict (event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.notify_marketplace_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_user uuid;
  v_driver_user uuid;
  v_key text;
  v_status text;
  v_changed boolean := true;
begin
  select customer.auth_user_id into v_customer_user
  from public.marketplace_customers as customer where customer.id = new.customer_id;
  v_status := new.status::text;
  v_key := 'marketplace-order:' || new.id::text || ':' ||
    case when tg_op = 'INSERT' then 'placed' else 'status-' || v_status end;

  if tg_op = 'UPDATE' then v_changed := old.status is distinct from new.status; end if;
  if v_changed then
    if v_customer_user is not null then
      perform public.emit_marketplace_notification(
        v_customer_user, v_key || ':' || v_customer_user::text,
        case when tg_op = 'INSERT' then 'order.placed' else 'order.status_changed' end,
        case when tg_op = 'INSERT' then 'تم استلام طلبك' else 'تم تحديث حالة طلبك' end,
        'تابع آخر تحديثات الطلب من داخل حسابك.',
        '/account/orders/' || new.id::text
      );
    end if;
    perform public.notify_marketplace_store_members(
      new.store_id, v_key,
      case when tg_op = 'INSERT' then 'order.placed' else 'order.status_changed' end,
      case when tg_op = 'INSERT' then 'طلب جديد' else 'تحديث على طلب' end,
      'راجع تفاصيل الطلب من لوحة المتجر.',
      '/merchant/marketplace/orders/' || new.id::text
    );
    perform public.notify_marketplace_admins(
      v_key, case when tg_op = 'INSERT' then 'order.placed' else 'order.status_changed' end,
      case when tg_op = 'INSERT' then 'طلب جديد في السوق' else 'تحديث حالة طلب' end,
      'راجع تفاصيل الطلب من لوحة الإدارة.',
      '/admin/marketplace/orders/' || new.id::text
    );
    select assignment.driver_id into v_driver_user
    from public.marketplace_delivery_assignments as assignment
    where assignment.order_id = new.id;
    if v_driver_user is not null then
      perform public.emit_marketplace_notification(
        v_driver_user, v_key || ':' || v_driver_user::text,
        'delivery.order_updated', 'تحديث على التوصيل',
        'راجع تفاصيل التوصيل من لوحة الكابتن.',
        '/driver/marketplace/' || new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_orders_notify on public.marketplace_orders;
create trigger marketplace_orders_notify
after insert or update of status on public.marketplace_orders
for each row execute function public.notify_marketplace_order_event();

create or replace function public.notify_marketplace_review_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_customer_user uuid;
  v_key text;
begin
  select product.store_id into v_store_id
  from public.products as product where product.id = new.product_id;
  v_key := 'marketplace-review:' || new.id::text || ':' || new.status::text;
  if tg_op = 'INSERT' then
    perform public.notify_marketplace_store_members(
      v_store_id, v_key, 'review.created', 'تقييم جديد',
      'وصل تقييم جديد على أحد منتجاتك.', '/merchant/marketplace'
    );
  elsif old.status is distinct from new.status then
    select customer.auth_user_id into v_customer_user
    from public.marketplace_customers as customer where customer.id = new.customer_id;
    if v_customer_user is not null then
      perform public.emit_marketplace_notification(
        v_customer_user, v_key || ':' || v_customer_user::text,
        'review.status_changed', 'تم تحديث حالة تقييمك',
        'يمكنك متابعة تقييمات مشترياتك من تفاصيل الطلب.', '/account/orders'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists product_reviews_notify on public.product_reviews;
create trigger product_reviews_notify
after insert or update of status on public.product_reviews
for each row execute function public.notify_marketplace_review_event();

create or replace function public.notify_marketplace_support_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
  v_customer_user uuid;
  v_key text := 'marketplace-support:' || new.thread_id::text || ':message:' || new.id::text;
begin
  select * into v_thread from public.support_threads where id = new.thread_id;
  if v_thread.customer_id is not null then
    select customer.auth_user_id into v_customer_user
    from public.marketplace_customers as customer where customer.id = v_thread.customer_id;
    if v_customer_user is not null and v_customer_user is distinct from new.sender_user_id then
      perform public.emit_marketplace_notification(
        v_customer_user, v_key || ':' || v_customer_user::text,
        'support.reply', 'رد جديد من الدعم',
        'راجع المحادثة من مركز الدعم داخل الموقع.',
        '/account/support/' || new.thread_id::text
      );
    end if;
  end if;
  if v_thread.store_id is not null then
    perform public.notify_marketplace_store_members(
      v_thread.store_id, v_key, 'support.reply', 'رد جديد في الدعم',
      'راجع المحادثة من لوحة المتجر.',
      '/merchant/marketplace/support/' || new.thread_id::text,
      new.sender_user_id
    );
  end if;
  perform public.notify_marketplace_admins(
    v_key, 'support.reply', 'رسالة دعم جديدة',
    'راجع المحادثة من لوحة الإدارة.',
    '/admin/marketplace/support/' || new.thread_id::text,
    new.sender_user_id
  );
  return new;
end;
$$;

drop trigger if exists support_messages_notify on public.support_messages;
create trigger support_messages_notify
after insert on public.support_messages
for each row execute function public.notify_marketplace_support_reply();

create or replace function public.notify_marketplace_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_entity text;
  v_href text;
begin
  if old.status is not distinct from new.status then return new; end if;
  if tg_table_name = 'stores' then
    v_store_id := new.id;
    v_entity := 'store';
    v_href := '/merchant/marketplace/settings';
  else
    v_store_id := new.store_id;
    v_entity := 'product';
    v_href := '/merchant/marketplace/' || new.id::text || '/edit';
  end if;
  perform public.notify_marketplace_store_members(
    v_store_id,
    'marketplace-moderation:' || v_entity || ':' || new.id::text || ':' || new.status::text,
    'moderation.status_changed', 'تم تحديث حالة المراجعة',
    'راجع حالة النشر وملاحظات المراجعة من لوحة المتجر.', v_href
  );
  return new;
end;
$$;

drop trigger if exists stores_moderation_notify on public.stores;
create trigger stores_moderation_notify
after update of status on public.stores
for each row execute function public.notify_marketplace_moderation_event();
drop trigger if exists products_moderation_notify on public.products;
create trigger products_moderation_notify
after update of status on public.products
for each row execute function public.notify_marketplace_moderation_event();

create or replace function public.notify_marketplace_delivery_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then v_changed := old.status is distinct from new.status; end if;
  if new.driver_id is not null and v_changed then
    perform public.emit_marketplace_notification(
      new.driver_id,
      'marketplace-delivery-offer:' || new.id::text || ':' || new.status || ':' || new.driver_id::text,
      'delivery.offer',
      case when new.status = 'offered' then 'عرض توصيل جديد' else 'تم تحديث عرض التوصيل' end,
      'راجع العرض من لوحة الكابتن قبل انتهاء مدته.', '/driver/marketplace'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_delivery_offers_notify on public.marketplace_delivery_offers;
create trigger marketplace_delivery_offers_notify
after insert or update of status on public.marketplace_delivery_offers
for each row execute function public.notify_marketplace_delivery_offer();

create or replace function public.notify_marketplace_commission_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then v_changed := old.status is distinct from new.status; end if;
  if v_changed then
    perform public.notify_marketplace_store_members(
      new.store_id,
      'marketplace-commission:' || new.id::text || ':' || new.status::text,
      'commission.status_changed', 'تحديث كشف العمولة',
      'راجع كشف العمولة من لوحة المتجر.',
      '/merchant/marketplace/commissions/' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists commission_statements_notify on public.commission_statements;
create trigger commission_statements_notify
after insert or update of status on public.commission_statements
for each row execute function public.notify_marketplace_commission_event();

create or replace function public.notify_marketplace_reconciliation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then v_changed := old.status is distinct from new.status; end if;
  if v_changed then
    v_key := 'marketplace-reconciliation:' || new.id::text || ':' || new.status;
    if new.driver_id is not null then
      perform public.emit_marketplace_notification(
        new.driver_id, v_key || ':' || new.driver_id::text,
        'reconciliation.status_changed', 'تحديث تسوية التحصيل',
        'راجع التسوية من لوحة الكابتن.',
        '/driver/marketplace/reconciliations/' || new.id::text
      );
    end if;
    perform public.notify_marketplace_admins(
      v_key, 'reconciliation.status_changed', 'تحديث تسوية تحصيل',
      'راجع التسوية من لوحة الإدارة.',
      '/admin/marketplace/reconciliations/' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cash_reconciliation_batches_notify on public.cash_reconciliation_batches;
create trigger cash_reconciliation_batches_notify
after insert or update of status on public.cash_reconciliation_batches
for each row execute function public.notify_marketplace_reconciliation_event();

-- Auth-bound DTOs. Direct table SELECT/UPDATE grants are revoked so callers
-- cannot retrieve internal event keys or mutate notification content.
revoke select on table public.app_notifications from authenticated;
revoke update (read_at) on table public.app_notifications from authenticated;
drop policy if exists app_notifications_read_own on public.app_notifications;
drop policy if exists app_notifications_mark_read_own on public.app_notifications;

create or replace function public.list_my_marketplace_notifications(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_items jsonb;
  v_last_created_at timestamptz;
  v_last_id uuid;
  v_has_more boolean := false;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_limit is null or p_limit not between 1 and 50
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;

  with candidates as (
    select notification.id, notification.type, notification.title,
      notification.body, notification.read_at, notification.created_at,
      case
        when notification.data->>'href' ~ '^/(account|merchant|admin|driver)(/|$)'
          then pg_catalog.jsonb_build_object('href', notification.data->>'href')
        else '{}'::jsonb
      end as data
    from public.app_notifications as notification
    where notification.recipient_id = v_user
      and (p_before_created_at is null or (notification.created_at, notification.id) < (p_before_created_at, p_before_id))
    order by notification.created_at desc, notification.id desc
    limit p_limit + 1
  ), page as (
    select * from candidates
    order by created_at desc, id desc
    limit p_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.created_at desc, page.id desc), '[]'::jsonb),
    (select count(*) > p_limit from candidates)
  into v_items, v_has_more
  from page;

  if pg_catalog.jsonb_array_length(v_items) > 0 then
    v_last_created_at := (
      v_items -> (pg_catalog.jsonb_array_length(v_items) - 1) ->> 'created_at'
    )::timestamptz;
    v_last_id := (
      v_items -> (pg_catalog.jsonb_array_length(v_items) - 1) ->> 'id'
    )::uuid;
  end if;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_has_more then
      pg_catalog.jsonb_build_object('created_at', v_last_created_at, 'id', v_last_id)
      else null end
  );
end;
$$;

create or replace function public.count_my_unread_marketplace_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select count(*)::integer into v_count from public.app_notifications
  where recipient_id = v_user and read_at is null;
  return v_count;
end;
$$;

create or replace function public.mark_my_marketplace_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  update public.app_notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = v_user;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.mark_all_my_marketplace_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  update public.app_notifications set read_at = now()
  where recipient_id = v_user and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
  v_id uuid;
  v_endpoint_origin text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
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
  where public.push_subscriptions.user_id = v_user
     or (
       public.push_subscriptions.p256dh = excluded.p256dh
       and public.push_subscriptions.auth = excluded.auth
     )
  returning id into v_id;

  if v_id is null then raise exception 'subscription_owned_by_another_user' using errcode = '42501'; end if;
  return v_id;
end;
$$;

create or replace function public.unregister_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  update public.push_subscriptions
  set is_active = false, disabled_at = now(), updated_at = now()
  where user_id = v_user and endpoint = p_endpoint;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

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
      on subscription.id = job.subscription_id and subscription.is_active
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
  join public.push_subscriptions as subscription on subscription.id = claimed.subscription_id
  join public.app_notifications as notification on notification.id = claimed.notification_id;
end;
$$;

create or replace function public.complete_marketplace_push_job(p_id bigint, p_worker_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.marketplace_push_jobs as job
  set processed_at = now(), locked_at = null, worker_id = null, failure_code = null
  where job.id = p_id and job.worker_id = p_worker_id
    and job.processed_at is null and job.dead_lettered_at is null;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    update public.push_subscriptions as subscription
    set failure_count = 0, last_success_at = now(), updated_at = now()
    from public.marketplace_push_jobs as job
    where job.id = p_id and subscription.id = job.subscription_id;
  end if;
  return v_count = 1;
end;
$$;

create or replace function public.fail_marketplace_push_job(
  p_id bigint,
  p_worker_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_subscription uuid; v_attempts integer;
begin
  if p_failure_code not in (
    'expired_subscription', 'rate_limited', 'provider_unavailable',
    'invalid_subscription', 'configuration_error', 'send_failed'
  ) then raise exception 'invalid_push_failure' using errcode = '22023'; end if;
  select job.subscription_id, job.attempts into v_subscription, v_attempts
  from public.marketplace_push_jobs as job
  where job.id = p_id and job.worker_id = p_worker_id for update;
  if not found then return false; end if;

  update public.marketplace_push_jobs
  set locked_at = null, worker_id = null, failure_code = p_failure_code,
      dead_lettered_at = case
        when p_failure_code in ('expired_subscription', 'invalid_subscription', 'configuration_error')
          or v_attempts >= 5 then now() else null end,
      available_at = case
        when v_attempts >= 5 then available_at
        else now() + pg_catalog.make_interval(secs => least(3600, 15 * (2 ^ greatest(0, v_attempts - 1)))::integer)
      end
  where id = p_id;
  get diagnostics v_count = row_count;

  update public.push_subscriptions
  set failure_count = least(100, failure_count + 1),
      is_active = case when p_failure_code in ('expired_subscription', 'invalid_subscription') then false else is_active end,
      disabled_at = case when p_failure_code in ('expired_subscription', 'invalid_subscription') then now() else disabled_at end,
      updated_at = now()
  where id = v_subscription;
  return v_count = 1;
end;
$$;

create or replace function public.run_marketplace_notification_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_dead integer; v_dead_stale integer; v_jobs integer; v_notifications integer;
begin
  update public.marketplace_push_jobs as job
  set dead_lettered_at = now(), locked_at = null, worker_id = null,
      failure_code = 'expired_subscription'
  where job.processed_at is null and job.dead_lettered_at is null
    and not exists (
      select 1 from public.push_subscriptions as subscription
      where subscription.id = job.subscription_id and subscription.is_active
    );
  get diagnostics v_dead = row_count;

  update public.marketplace_push_jobs as job
  set dead_lettered_at = now(), locked_at = null, worker_id = null,
      failure_code = coalesce(job.failure_code, 'send_failed')
  where job.processed_at is null and job.dead_lettered_at is null
    and job.attempts >= 5
    and (job.locked_at is null or job.locked_at < now() - interval '5 minutes');
  get diagnostics v_dead_stale = row_count;

  delete from public.marketplace_push_jobs
  where coalesce(processed_at, dead_lettered_at) < now() - interval '30 days';
  get diagnostics v_jobs = row_count;

  delete from public.app_notifications
  where read_at < now() - interval '180 days';
  get diagnostics v_notifications = row_count;
  return pg_catalog.jsonb_build_object(
    'dead_lettered', v_dead + v_dead_stale, 'deleted_jobs', v_jobs,
    'deleted_notifications', v_notifications
  );
end;
$$;

-- Hosted scheduler contract. It reuses the worker base URL and CRON secret
-- stored in Vault by the catalog worker setup; missing/invalid secrets make it
-- a safe no-op rather than exposing a token in migration history.
create or replace function public.invoke_marketplace_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_base_url text; v_secret text; v_request_id bigint;
begin
  select secret.decrypted_secret into v_base_url
  from vault.decrypted_secrets as secret
  where secret.name = 'dairtak_worker_base_url' limit 1;
  select secret.decrypted_secret into v_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'dairtak_worker_cron_secret' limit 1;
  if nullif(trim(v_base_url), '') is null or nullif(v_secret, '') is null then return null; end if;
  v_base_url := pg_catalog.regexp_replace(trim(v_base_url), '/+$', '');
  if v_base_url !~ '^https://[A-Za-z0-9.-]+(?::443)?$' or char_length(v_secret) < 32 then
    return null;
  end if;
  select net.http_post(
    url => v_base_url || '/api/cron/push-notifications',
    headers => pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret
    ),
    body => pg_catalog.jsonb_build_object('source', 'supabase_cron'),
    timeout_milliseconds => 55000
  ) into v_request_id;
  return v_request_id;
end;
$$;

select cron.schedule(
  'dairtak-marketplace-push-worker',
  '* * * * *',
  'select public.invoke_marketplace_push_worker();'
);

-- SECURITY DEFINER routines are denied by default, then granted only to the
-- roles that need their narrow API surface.
revoke all on function public.emit_marketplace_notification(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.marketplace_push_endpoint_allowed(text) from public, anon, authenticated;
revoke all on function public.enqueue_marketplace_push_job() from public, anon, authenticated;
revoke all on function public.notify_marketplace_store_members(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_marketplace_admins(text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_marketplace_order_event() from public, anon, authenticated;
revoke all on function public.notify_marketplace_review_event() from public, anon, authenticated;
revoke all on function public.notify_marketplace_support_reply() from public, anon, authenticated;
revoke all on function public.notify_marketplace_moderation_event() from public, anon, authenticated;
revoke all on function public.notify_marketplace_delivery_offer() from public, anon, authenticated;
revoke all on function public.notify_marketplace_commission_event() from public, anon, authenticated;
revoke all on function public.notify_marketplace_reconciliation_event() from public, anon, authenticated;

revoke all on function public.list_my_marketplace_notifications(integer, timestamptz, uuid) from public, anon;
revoke all on function public.count_my_unread_marketplace_notifications() from public, anon;
revoke all on function public.mark_my_marketplace_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_my_marketplace_notifications_read() from public, anon;
revoke all on function public.register_my_push_subscription(text, text, text, text, text) from public, anon;
revoke all on function public.unregister_my_push_subscription(text) from public, anon;
grant execute on function public.list_my_marketplace_notifications(integer, timestamptz, uuid) to authenticated;
grant execute on function public.count_my_unread_marketplace_notifications() to authenticated;
grant execute on function public.mark_my_marketplace_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_my_marketplace_notifications_read() to authenticated;
grant execute on function public.register_my_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.unregister_my_push_subscription(text) to authenticated;

revoke all on function public.claim_marketplace_push_jobs(integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_marketplace_push_job(bigint, uuid) from public, anon, authenticated;
revoke all on function public.fail_marketplace_push_job(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.run_marketplace_notification_maintenance() from public, anon, authenticated;
revoke all on function public.invoke_marketplace_push_worker() from public, anon, authenticated;
grant execute on function public.claim_marketplace_push_jobs(integer, uuid) to service_role;
grant execute on function public.complete_marketplace_push_job(bigint, uuid) to service_role;
grant execute on function public.fail_marketplace_push_job(bigint, uuid, text) to service_role;
grant execute on function public.run_marketplace_notification_maintenance() to service_role;
grant execute on function public.invoke_marketplace_push_worker() to service_role;

commit;
