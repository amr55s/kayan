begin;

-- ---------------------------------------------------------------------------
-- Repair schema drift used by the atomic recommendation RPC.
-- ---------------------------------------------------------------------------

alter table public.places
  add column if not exists recommend_count integer not null default 0;

update public.places
set recommend_count = greatest(coalesce(recommend_count, 0), 0)
where recommend_count is null or recommend_count < 0;

alter table public.places
  alter column recommend_count set default 0,
  alter column recommend_count set not null,
  drop constraint if exists places_recommend_count_nonnegative,
  add constraint places_recommend_count_nonnegative
    check (recommend_count >= 0);

-- The legacy directory used to expose the entire row through PostgREST,
-- including phone/WhatsApp/payment fields.  Keep the public directory useful
-- while making the API boundary match the on-site-only contact policy.
revoke all on table public.places from anon, authenticated;
grant select (
  id,
  title,
  category,
  description,
  images,
  is_featured,
  created_at,
  address,
  map_url,
  view_count,
  recommend_count
) on public.places to anon, authenticated;
grant select, insert, update, delete on public.places to service_role;

-- ---------------------------------------------------------------------------
-- Branch ownership is admin-controlled. Merchants may edit operational branch
-- details, but cannot attach their branch to another directory place or move
-- it to another merchant.
-- ---------------------------------------------------------------------------

drop policy if exists "merchants manage own branches"
  on public.merchant_branches;
drop policy if exists "merchants read own branches"
  on public.merchant_branches;
drop policy if exists "merchants update own branch details"
  on public.merchant_branches;

create policy "merchants read own branches"
on public.merchant_branches for select
to authenticated
using (public.is_current_merchant_for(merchant_id));

create policy "merchants update own branch details"
on public.merchant_branches for update
to authenticated
using (public.is_current_merchant_for(merchant_id))
with check (public.is_current_merchant_for(merchant_id));

revoke all on table public.merchant_branches from anon;
grant select, insert, update, delete on public.merchant_branches
  to authenticated, service_role;

create or replace function public.protect_merchant_branch_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' and new.place_id is not null then
    raise exception 'branch_place_link_admin_required';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.merchant_id is distinct from old.merchant_id
    or new.place_id is distinct from old.place_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'branch_ownership_fields_are_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists merchant_branches_protect_ownership
  on public.merchant_branches;
create trigger merchant_branches_protect_ownership
before insert or update on public.merchant_branches
for each row execute function public.protect_merchant_branch_ownership();

revoke all on function public.protect_merchant_branch_ownership()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table access is read-only and column-minimized for browser sessions. Every
-- mutation goes through an authorization-aware RPC below.
-- ---------------------------------------------------------------------------

drop policy if exists "admins manage orders" on public.delivery_orders;
drop policy if exists "merchants manage own orders" on public.delivery_orders;
drop policy if exists "admins read orders" on public.delivery_orders;
drop policy if exists "merchants read own orders" on public.delivery_orders;

create policy "admins read orders"
on public.delivery_orders for select
to authenticated
using (public.is_admin());

create policy "merchants read own orders"
on public.delivery_orders for select
to authenticated
using (public.is_current_merchant_for(merchant_id));

revoke all on table public.delivery_orders from anon, authenticated;
grant select (
  id,
  public_code,
  merchant_id,
  branch_id,
  assigned_driver_id,
  status,
  delivery_area,
  collection_amount,
  delivery_fee,
  expires_at,
  assigned_at,
  picked_up_at,
  delivered_at,
  cancelled_at,
  created_at,
  updated_at
) on public.delivery_orders to authenticated;
grant select, insert, update, delete on public.delivery_orders to service_role;

drop policy if exists "Allow public select driver_profiles"
  on public.driver_profiles;
drop policy if exists "merchants see active driver identities"
  on public.profiles;

revoke all on table public.driver_profiles from anon, authenticated;
revoke select (
  profile_id,
  whatsapp,
  vehicle_type,
  is_available,
  active_until,
  created_at,
  updated_at
) on public.driver_profiles from anon, authenticated;
revoke update (whatsapp, vehicle_type)
  on public.driver_profiles from authenticated;
grant select (
  profile_id,
  vehicle_type,
  avatar_url,
  is_available,
  active_until,
  created_at,
  updated_at
) on public.driver_profiles to authenticated;
grant select, insert, update, delete on public.driver_profiles to service_role;

revoke all on table public.drivers from anon, authenticated;
revoke select (
  id,
  name,
  phone,
  whatsapp,
  vehicle_type,
  is_active,
  active_until,
  created_at
) on public.drivers from anon, authenticated;
grant select (
  id,
  name,
  vehicle_type,
  is_active,
  active_until,
  created_at
) on public.drivers to anon, authenticated;
grant select, insert, update, delete on public.drivers to service_role;

-- ---------------------------------------------------------------------------
-- Authorization helpers use an empty search path and caller JWT state only.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select profile.*
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.is_active
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'role', '') = 'service_role'
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role = 'admin'
        and profile.is_active
    );
$$;

create or replace function public.is_current_merchant_for(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'merchant'
      and profile.merchant_id = p_merchant_id
      and profile.is_active
  );
$$;

create or replace function public.is_current_active_driver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    join public.driver_profiles as driver
      on driver.profile_id = profile.id
    where profile.id = (select auth.uid())
      and profile.role = 'driver'
      and profile.is_active
      and driver.is_available
      and driver.active_until > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Contact-free driver directories. The legacy result shape is retained during
-- the rolling deployment, but contact columns never contain real identifiers.
-- ---------------------------------------------------------------------------

create or replace function public.list_public_legacy_drivers()
returns table (
  id uuid,
  name text,
  phone text,
  whatsapp text,
  vehicle_type text,
  is_active boolean,
  active_until timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    legacy.id,
    legacy.name,
    ''::text as phone,
    null::text as whatsapp,
    legacy.vehicle_type,
    legacy.is_active,
    legacy.active_until,
    legacy.created_at
  from public.drivers as legacy
  where not exists (
    select 1
    from public.driver_profiles as account_driver
    where account_driver.legacy_driver_id = legacy.id
  );
$$;

create or replace function public.list_public_registered_drivers()
returns table (
  id uuid,
  name text,
  phone text,
  whatsapp text,
  vehicle_type text,
  avatar_url text,
  is_available boolean,
  active_until timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    ''::text as phone,
    null::text as whatsapp,
    coalesce(driver.vehicle_type, legacy.vehicle_type),
    driver.avatar_url,
    (
      profile.is_active
      and driver.is_available
      and driver.active_until is not null
      and driver.active_until > now()
    ) as is_available,
    driver.active_until,
    coalesce(legacy.created_at, profile.created_at)
  from public.profiles as profile
  join public.driver_profiles as driver
    on driver.profile_id = profile.id
  left join public.drivers as legacy
    on legacy.id = driver.legacy_driver_id
  where profile.role = 'driver'
    and profile.is_active;
$$;

create or replace function public.list_available_delivery_drivers()
returns table (
  id uuid,
  display_name text,
  vehicle_type text,
  avatar_url text,
  active_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1
      from public.profiles as caller
      where caller.id = (select auth.uid())
        and caller.role = 'merchant'
        and caller.is_active
    )
  ) then
    raise exception 'merchant_access_required';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    coalesce(driver.vehicle_type, legacy.vehicle_type),
    driver.avatar_url,
    driver.active_until
  from public.profiles as profile
  join public.driver_profiles as driver
    on driver.profile_id = profile.id
  left join public.drivers as legacy
    on legacy.id = driver.legacy_driver_id
  where profile.role = 'driver'
    and profile.is_active
    and driver.is_available
    and driver.active_until > now()
  order by profile.display_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role-specific order reads. Open offers contain no recipient name, phone,
-- exact address, notes, cancellation text, or issue text before acceptance.
-- ---------------------------------------------------------------------------

create or replace function public.list_driver_delivery_offers(
  p_limit integer default 50
)
returns table (
  id uuid,
  public_code text,
  merchant_id uuid,
  branch_id uuid,
  assigned_driver_id uuid,
  status public.delivery_order_status,
  delivery_area text,
  collection_amount numeric,
  delivery_fee numeric,
  expires_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := (select auth.uid());
  v_can_view_open boolean;
begin
  if p_limit not between 1 and 100 then
    raise exception 'invalid_limit';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_driver_id
      and profile.role = 'driver'
      and profile.is_active
  ) then
    raise exception 'driver_access_required';
  end if;

  v_can_view_open := public.is_current_active_driver();

  return query
  select
    delivery.id,
    delivery.public_code,
    delivery.merchant_id,
    delivery.branch_id,
    delivery.assigned_driver_id,
    delivery.status,
    delivery.delivery_area,
    delivery.collection_amount,
    delivery.delivery_fee,
    delivery.expires_at,
    delivery.assigned_at,
    delivery.picked_up_at,
    delivery.delivered_at,
    case
      when delivery.assigned_driver_id = v_driver_id
        and delivery.status in ('assigned', 'picked_up', 'issue')
      then delivery.recipient_name
      else null
    end,
    case
      when delivery.assigned_driver_id = v_driver_id
        and delivery.status in ('assigned', 'picked_up', 'issue')
      then delivery.recipient_phone
      else null
    end,
    case
      when delivery.assigned_driver_id = v_driver_id
        and delivery.status in ('assigned', 'picked_up', 'issue')
      then delivery.delivery_address
      else null
    end,
    case
      when delivery.assigned_driver_id = v_driver_id
        and delivery.status in ('assigned', 'picked_up', 'issue')
      then delivery.notes
      else null
    end,
    delivery.created_at,
    delivery.updated_at
  from public.delivery_orders as delivery
  where (
      v_can_view_open
      and delivery.status = 'open'
      and delivery.expires_at > now()
      and (
        delivery.assigned_driver_id is null
        or delivery.assigned_driver_id = v_driver_id
      )
    )
    or (
      delivery.assigned_driver_id = v_driver_id
      and delivery.status in ('assigned', 'picked_up', 'issue')
    )
  order by delivery.created_at desc
  limit p_limit;
end;
$$;

create or replace function public.list_merchant_delivery_orders(
  p_limit integer default 50
)
returns setof public.delivery_orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if p_limit not between 1 and 100 then
    raise exception 'invalid_limit';
  end if;

  select * into v_profile from public.current_profile();
  if v_profile is null or v_profile.role <> 'merchant' then
    raise exception 'merchant_access_required';
  end if;

  return query
  select delivery.*
  from public.delivery_orders as delivery
  where delivery.merchant_id = v_profile.merchant_id
  order by delivery.created_at desc
  limit p_limit;
end;
$$;

create or replace function public.get_delivery_order_private(p_order_id uuid)
returns public.delivery_orders
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.delivery_orders;
  v_profile public.profiles;
begin
  select * into v_profile from public.current_profile();
  select * into v_order
  from public.delivery_orders
  where id = p_order_id;

  if v_order is null then
    raise exception 'order_not_found';
  end if;
  if not (
    public.is_admin()
    or (
      v_profile.role = 'merchant'
      and v_order.merchant_id = v_profile.merchant_id
    )
    or (
      v_profile.role = 'driver'
      and v_order.assigned_driver_id = v_profile.id
      and v_order.status <> 'open'
    )
  ) then
    raise exception 'order_access_denied';
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic delivery mutations. Direct authenticated writes stay revoked.
-- ---------------------------------------------------------------------------

create or replace function public.create_delivery_order(
  p_branch_id uuid,
  p_recipient_name text,
  p_recipient_phone text,
  p_delivery_address text,
  p_delivery_area text,
  p_notes text default null,
  p_collection_amount numeric default null,
  p_delivery_fee numeric default null,
  p_direct_driver_id uuid default null
)
returns public.delivery_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_branch public.merchant_branches;
  v_order public.delivery_orders;
begin
  select * into v_profile from public.current_profile();
  if v_profile is null or v_profile.role <> 'merchant' then
    raise exception 'merchant_access_required';
  end if;

  select * into v_branch
  from public.merchant_branches
  where id = p_branch_id
    and merchant_id = v_profile.merchant_id
    and is_active;
  if v_branch is null then
    raise exception 'invalid_branch';
  end if;

  if p_direct_driver_id is not null and not exists (
    select 1
    from public.profiles as profile
    join public.driver_profiles as driver
      on driver.profile_id = profile.id
    where profile.id = p_direct_driver_id
      and profile.role = 'driver'
      and profile.is_active
      and driver.is_available
      and driver.active_until > now()
  ) then
    raise exception 'driver_unavailable';
  end if;

  insert into public.delivery_orders (
    merchant_id,
    branch_id,
    created_by,
    assigned_driver_id,
    recipient_name,
    recipient_phone,
    delivery_address,
    delivery_area,
    notes,
    collection_amount,
    delivery_fee
  )
  values (
    v_profile.merchant_id,
    p_branch_id,
    v_profile.id,
    p_direct_driver_id,
    trim(p_recipient_name),
    regexp_replace(p_recipient_phone, '[^0-9]', '', 'g'),
    trim(p_delivery_address),
    trim(p_delivery_area),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_collection_amount,
    p_delivery_fee
  )
  returning * into v_order;

  insert into public.order_events (order_id, actor_id, event_type, metadata)
  values (
    v_order.id,
    v_profile.id,
    'created',
    jsonb_build_object('direct_driver_id', p_direct_driver_id)
  );

  if p_direct_driver_id is not null then
    insert into public.notification_outbox (
      event_key,
      profile_id,
      order_id,
      payload
    )
    values (
      'order:' || v_order.id || ':direct',
      p_direct_driver_id,
      v_order.id,
      jsonb_build_object(
        'type',
        'direct_offer',
        'order_code',
        v_order.public_code
      )
    );
  end if;

  return v_order;
end;
$$;

create or replace function public.claim_delivery_order(p_order_id uuid)
returns public.delivery_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := (select auth.uid());
  v_order public.delivery_orders;
begin
  if not public.is_current_active_driver() then
    raise exception 'driver_not_available';
  end if;

  select * into v_order
  from public.delivery_orders
  where id = p_order_id
  for update;
  if v_order is null
     or v_order.status <> 'open'
     or v_order.expires_at <= now() then
    raise exception 'offer_unavailable';
  end if;
  if v_order.assigned_driver_id is not null
     and v_order.assigned_driver_id <> v_driver_id then
    raise exception 'private_offer';
  end if;

  update public.delivery_orders
  set status = 'assigned',
      assigned_driver_id = v_driver_id,
      assigned_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, actor_id, event_type)
  values (v_order.id, v_driver_id, 'claimed');

  insert into public.notification_outbox (
    event_key,
    profile_id,
    order_id,
    payload
  )
  select
    'order:' || v_order.id || ':claimed:' || profile.id,
    profile.id,
    v_order.id,
    jsonb_build_object(
      'type',
      'order_claimed',
      'order_code',
      v_order.public_code
    )
  from public.profiles as profile
  where profile.merchant_id = v_order.merchant_id
    and profile.role = 'merchant'
    and profile.is_active;

  return v_order;
end;
$$;

create or replace function public.set_delivery_order_status(
  p_order_id uuid,
  p_next public.delivery_order_status,
  p_reason text default null
)
returns public.delivery_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.delivery_orders;
  v_profile public.profiles;
  v_event text;
begin
  select * into v_profile from public.current_profile();
  if v_profile is null then
    raise exception 'account_access_required';
  end if;

  select * into v_order
  from public.delivery_orders
  where id = p_order_id
  for update;
  if v_order is null then
    raise exception 'order_not_found';
  end if;
  if v_profile.role = 'driver'
     and v_order.assigned_driver_id <> v_profile.id then
    raise exception 'not_assigned_driver';
  end if;
  if v_profile.role = 'merchant'
     and v_order.merchant_id <> v_profile.merchant_id then
    raise exception 'not_order_merchant';
  end if;

  if p_next = 'picked_up'
     and v_order.status = 'assigned'
     and (v_profile.role = 'driver' or public.is_admin()) then
    update public.delivery_orders
    set status = p_next,
        picked_up_at = now()
    where id = p_order_id
    returning * into v_order;
    v_event := 'picked_up';
  elsif p_next = 'delivered'
     and v_order.status = 'picked_up'
     and (v_profile.role = 'driver' or public.is_admin()) then
    update public.delivery_orders
    set status = p_next,
        delivered_at = now()
    where id = p_order_id
    returning * into v_order;
    v_event := 'delivered';
  elsif p_next = 'open'
     and v_order.status = 'assigned'
     and v_profile.role = 'driver' then
    update public.delivery_orders
    set status = 'open',
        assigned_driver_id = null,
        assigned_at = null,
        expires_at = now() + interval '10 minutes',
        cancellation_reason = null
    where id = p_order_id
    returning * into v_order;
    v_event := 'released';
  elsif p_next = 'cancelled'
     and v_order.status in ('open', 'assigned', 'unassigned')
     and (v_profile.role in ('merchant', 'admin')) then
    update public.delivery_orders
    set status = p_next,
        cancelled_at = now(),
        cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_order_id
    returning * into v_order;
    v_event := 'cancelled';
  elsif p_next = 'issue'
     and v_order.status in ('assigned', 'picked_up')
     and (v_profile.role in ('merchant', 'admin')) then
    update public.delivery_orders
    set status = p_next,
        issue_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_order_id
    returning * into v_order;
    v_event := 'issue';
  else
    raise exception 'invalid_status_transition';
  end if;

  insert into public.order_events (order_id, actor_id, event_type, metadata)
  values (
    v_order.id,
    v_profile.id,
    v_event,
    jsonb_build_object('reason', p_reason)
  );
  return v_order;
end;
$$;

create or replace function public.rebroadcast_delivery_order(p_order_id uuid)
returns public.delivery_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.delivery_orders;
begin
  select * into v_order
  from public.delivery_orders
  where id = p_order_id
  for update;

  if v_order is null
     or v_order.status not in ('open', 'unassigned')
     or not (
       public.is_admin()
       or public.is_current_merchant_for(v_order.merchant_id)
     ) then
    raise exception 'cannot_rebroadcast';
  end if;

  update public.delivery_orders
  set status = 'open',
      assigned_driver_id = null,
      assigned_at = null,
      expires_at = now() + interval '10 minutes'
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, actor_id, event_type)
  values (v_order.id, (select auth.uid()), 'broadcast');
  return v_order;
end;
$$;

create or replace function public.renew_driver_availability()
returns public.driver_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver public.driver_profiles;
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'driver'
      and profile.is_active
  ) then
    raise exception 'driver_access_required';
  end if;

  update public.driver_profiles
  set is_available = true,
      active_until = now() + interval '2 hours',
      last_seen_at = now()
  where profile_id = (select auth.uid())
  returning * into v_driver;
  if v_driver is null then
    raise exception 'driver_profile_missing';
  end if;

  update public.drivers
  set is_active = true,
      active_until = v_driver.active_until
  where id = v_driver.legacy_driver_id;
  return v_driver;
end;
$$;

create or replace function public.expire_delivery_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  with expired as (
    update public.delivery_orders
    set status = 'unassigned',
        assigned_driver_id = null,
        assigned_at = null
    where status = 'open'
      and expires_at <= now()
    returning id
  ), logged as (
    insert into public.order_events (order_id, event_type)
    select id, 'expired'
    from expired
    returning order_id
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions are never executable through PUBLIC/anon. The
-- public schema is made non-writable, then retained as a trusted lookup schema
-- for legacy function bodies that still use unqualified table names. Emptying
-- their search_path would break those deployed functions during this hotfix.
-- ---------------------------------------------------------------------------

revoke create on schema public from public, anon, authenticated;

do $$
declare
  item record;
begin
  for item in
    select proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as namespace
      on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.prosecdef
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public',
      item.signature
    );
    execute format(
      'revoke execute on function %s from public, anon',
      item.signature
    );
  end loop;

  for item in
    select proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as namespace
      on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = any (array[
        'admin_repair_driver_account',
        'apply_feedback_to_place',
        'approve_account_request',
        'approve_pending_place',
        'consume_account_request_rate_limit',
        'consume_listing_upload_rate_limit',
        'consume_public_submission_rate_limit',
        'expire_delivery_offers',
        'get_admin_metrics',
        'list_public_legacy_drivers',
        'list_public_registered_drivers',
        'record_client_error',
        'record_client_error_v2',
        'record_place_upvote',
        'record_site_analytics',
        'record_site_analytics_v2',
        'reject_account_request',
        'rls_auto_enable'
      ])
  loop
    execute format(
      'revoke execute on function %s from authenticated',
      item.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      item.signature
    );
  end loop;
end;
$$;

revoke all on function public.current_profile()
  from public, anon;
revoke all on function public.is_admin()
  from public, anon;
revoke all on function public.is_current_merchant_for(uuid)
  from public, anon;
revoke all on function public.is_current_active_driver()
  from public, anon;
revoke all on function public.list_available_delivery_drivers()
  from public, anon;
revoke all on function public.list_driver_delivery_offers(integer)
  from public, anon;
revoke all on function public.list_merchant_delivery_orders(integer)
  from public, anon;
revoke all on function public.get_delivery_order_private(uuid)
  from public, anon;
revoke all on function public.create_delivery_order(
  uuid, text, text, text, text, text, numeric, numeric, uuid
) from public, anon;
revoke all on function public.claim_delivery_order(uuid)
  from public, anon;
revoke all on function public.set_delivery_order_status(
  uuid, public.delivery_order_status, text
) from public, anon;
revoke all on function public.rebroadcast_delivery_order(uuid)
  from public, anon;
revoke all on function public.renew_driver_availability()
  from public, anon;

grant execute on function public.current_profile()
  to authenticated, service_role;
grant execute on function public.is_admin()
  to authenticated, service_role;
grant execute on function public.is_current_merchant_for(uuid)
  to authenticated, service_role;
grant execute on function public.is_current_active_driver()
  to authenticated, service_role;
grant execute on function public.list_available_delivery_drivers()
  to authenticated, service_role;
grant execute on function public.list_driver_delivery_offers(integer)
  to authenticated, service_role;
grant execute on function public.list_merchant_delivery_orders(integer)
  to authenticated, service_role;
grant execute on function public.get_delivery_order_private(uuid)
  to authenticated, service_role;
grant execute on function public.create_delivery_order(
  uuid, text, text, text, text, text, numeric, numeric, uuid
) to authenticated, service_role;
grant execute on function public.claim_delivery_order(uuid)
  to authenticated, service_role;
grant execute on function public.set_delivery_order_status(
  uuid, public.delivery_order_status, text
) to authenticated, service_role;
grant execute on function public.rebroadcast_delivery_order(uuid)
  to authenticated, service_role;
grant execute on function public.renew_driver_availability()
  to authenticated, service_role;

revoke all on function public.expire_delivery_offers()
  from public, anon, authenticated;
grant execute on function public.expire_delivery_offers()
  to service_role;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
