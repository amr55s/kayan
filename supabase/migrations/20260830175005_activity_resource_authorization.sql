begin;

-- Resource authorization reads approved durable memberships, never an active-UI
-- cookie, user metadata, or a synthetic profiles.role. Definers below preserve
-- the existing audited RPC entrypoints and their grants.
create schema if not exists activity_private;
revoke all on schema activity_private from public,anon,authenticated,service_role;

-- Preserve the legacy profile owner's access once, without overriding a
-- membership that was explicitly deactivated or downgraded previously.
insert into public.merchant_memberships(merchant_id,user_id,role,is_active)
select p.merchant_id,p.id,'owner',p.is_active from public.profiles p
where p.role='merchant' and p.merchant_id is not null
on conflict(merchant_id,user_id) do nothing;

create function activity_private.driver_is_approved(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and exists(
   select 1 from public.activity_workspaces w
   join public.activity_memberships m on m.workspace_id=w.id
   join public.driver_profiles d on d.profile_id=w.driver_profile_id
   join public.profiles p on p.id=d.profile_id
   where w.activity_kind='driver' and w.driver_profile_id=p_user_id and w.status='approved'
     and m.user_id=p_user_id and m.is_active and m.role in ('owner','manager')
     and p.is_active and not p.must_change_password
 );
$$;

create function activity_private.merchant_is_approved(p_user_id uuid,p_merchant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and p_merchant_id is not null and exists(
   select 1 from public.activity_workspaces w
   join public.activity_memberships m on m.workspace_id=w.id
   join public.merchants merchant on merchant.id=w.merchant_id
   left join public.profiles p on p.id=m.user_id
   where w.merchant_id=p_merchant_id and w.activity_kind<>'driver'
     and exists(
       select 1 from public.merchant_memberships mm where mm.merchant_id=p_merchant_id
         and mm.user_id=p_user_id and mm.is_active and mm.role in ('owner','manager')
     )
     and w.status='approved' and m.user_id=p_user_id and m.is_active
     and m.role in ('owner','manager') and merchant.is_active
     and (p.id is null or (p.is_active and not p.must_change_password))
 );
$$;

create function activity_private.store_is_approved(p_user_id uuid,p_store_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select p_user_id is not null and exists(
   select 1 from public.stores s join public.merchants merchant on merchant.id=s.merchant_id
   left join public.profiles p on p.id=p_user_id
   where s.id=p_store_id and merchant.is_active
     and (p.id is null or (p.is_active and not p.must_change_password))
   and (
     exists(
       select 1 from public.activity_workspaces w
       join public.activity_memberships m on m.workspace_id=w.id
       where w.store_id=s.id and w.merchant_id=s.merchant_id and w.status='approved'
         and m.user_id=p_user_id and m.is_active
         and (
           exists(select 1 from public.store_memberships sm where sm.store_id=s.id
             and sm.user_id=p_user_id and sm.is_active and sm.role::text=any(p_roles))
           or activity_private.merchant_is_approved(p_user_id,s.merchant_id)
         )
     )
     or (
       not exists(select 1 from public.activity_workspaces w where w.store_id=s.id)
       and activity_private.merchant_is_approved(p_user_id,s.merchant_id)
     )
   )
 );
$$;
revoke all on function activity_private.driver_is_approved(uuid),
 activity_private.merchant_is_approved(uuid,uuid),activity_private.store_is_approved(uuid,uuid,text[])
 from public,anon,authenticated,service_role;

create function public.has_my_activity_access(p_activity text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and case p_activity
 when 'driver' then activity_private.driver_is_approved((select auth.uid()))
 when 'merchant' then exists(
   select 1 from public.activity_workspaces w where w.merchant_id is not null and (
     (w.store_id is null and activity_private.merchant_is_approved((select auth.uid()),w.merchant_id))
     or (w.store_id is not null and activity_private.store_is_approved((select auth.uid()),w.store_id,array['owner','manager','catalog','fulfillment','finance']))
   )
 ) else false end;
$$;
revoke all on function public.has_my_activity_access(text) from public,anon,authenticated,service_role;
grant execute on function public.has_my_activity_access(text) to authenticated;

create or replace function public.can_manage_merchant(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_marketplace_admin() or activity_private.merchant_is_approved((select auth.uid()),p_merchant_id);
$$;
create or replace function public.is_current_merchant_for(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select activity_private.merchant_is_approved((select auth.uid()),p_merchant_id);
$$;
create or replace function public.can_manage_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_marketplace_admin() or activity_private.store_is_approved((select auth.uid()),p_store_id,array['owner','manager']);
$$;
create or replace function public.can_catalog_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_marketplace_admin() or activity_private.store_is_approved((select auth.uid()),p_store_id,array['owner','manager','catalog']);
$$;
create or replace function public.can_fulfill_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_marketplace_admin() or activity_private.store_is_approved((select auth.uid()),p_store_id,array['owner','manager','fulfillment']);
$$;
create or replace function public.has_marketplace_store_role_without_admin(p_store_id uuid,p_actor_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select activity_private.store_is_approved(p_actor_id,p_store_id,p_roles);
$$;

-- Permission summaries use the same current resource checks as mutations.
create or replace function public.list_my_activity_workspaces()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'activityKind',w.activity_kind,'name',w.name,
 'status',w.status,'membershipRole',m.role,'merchantId',w.merchant_id,'storeId',w.store_id,'driverProfileId',w.driver_profile_id,
 'canManage',w.status='approved' and m.is_active and case
   when w.store_id is not null then public.can_manage_store(w.store_id)
   when w.merchant_id is not null then public.can_manage_merchant(w.merchant_id)
   when w.driver_profile_id=(select auth.uid()) then public.has_my_activity_access('driver')
   else false end) order by w.created_at,w.id),'[]'::jsonb)
 from public.activity_workspaces w join public.activity_memberships m on m.workspace_id=w.id
 where m.user_id=(select auth.uid()) and m.is_active;
$$;


-- Preserve the existing assign_marketplace_delivery_driver RPC contract and privilege grants.
create or replace function public.assign_marketplace_delivery_driver(
  p_order_id uuid,
  p_driver_id uuid,
  p_actor_id uuid
)
returns public.marketplace_delivery_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.marketplace_orders;
  v_assignment public.marketplace_delivery_assignments;
  v_authorized boolean;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if v_order is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.delivery_mode <> 'platform'
     or v_order.status not in ('confirmed', 'preparing', 'ready_for_pickup') then
    raise exception 'order_not_assignable' using errcode = '55000';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or activity_private.store_is_approved(p_actor_id,v_order.store_id,array['owner','manager','fulfillment']) into v_authorized;

  if not v_authorized then
    raise exception 'fulfillment_access_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    join public.driver_profiles as driver on driver.profile_id = profile.id
    where profile.id = p_driver_id
      and activity_private.driver_is_approved(profile.id)
      and profile.is_active
      and driver.is_available
      and driver.active_until > now()
  ) then
    raise exception 'driver_unavailable' using errcode = '22023';
  end if;

  update public.marketplace_delivery_assignments
  set driver_id = p_driver_id,
      driver_name_snapshot = (
        select profile.display_name from public.profiles as profile where profile.id = p_driver_id
      ),
      status = 'assigned',
      assigned_at = now(),
      updated_at = now()
  where order_id = p_order_id
  returning * into v_assignment;

  insert into public.marketplace_order_events (
    order_id, actor_user_id, event_type, metadata
  ) values (
    p_order_id,
    p_actor_id,
    'delivery.driver_assigned',
    jsonb_build_object('driver_id', p_driver_id)
  );
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.delivery.assigned:' || p_order_id::text || ':' || p_driver_id::text,
    'marketplace.delivery.assigned',
    'marketplace_order',
    p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'driver_id', p_driver_id)
  ) on conflict (event_key) do nothing;
  return v_assignment;
end;
$$;


-- Preserve the existing is_current_active_driver RPC contract and privilege grants.
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
      and activity_private.driver_is_approved(profile.id)
      and profile.is_active
      and driver.is_available
      and driver.active_until > now()
  );
$$;


-- Preserve the existing set_my_marketplace_order_status_base_175213 RPC contract and privilege grants.
create or replace function public.set_my_marketplace_order_status_base_175213(
  p_order_id uuid,
  p_next public.marketplace_order_status,
  p_reason text default null,
  p_collected_amount public.egp_amount default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_order public.marketplace_orders;
  v_customer boolean;
  v_staff boolean;
  v_driver boolean;
  v_non_admin boolean := false;
begin
  select * into v_order from public.marketplace_orders where id = p_order_id;
  if v_order is null then
    return public.set_my_marketplace_order_status_base_174408(
      p_order_id, p_next, p_reason, p_collected_amount
    );
  end if;
  select exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = v_order.customer_id
      and customer.auth_user_id = v_actor and customer.is_active
  ) into v_customer;
  v_staff := public.has_marketplace_store_role_without_admin(
    v_order.store_id, v_actor, array['owner','manager','fulfillment']
  );
  select exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    join public.profiles as profile on profile.id = assignment.driver_id
    where assignment.order_id = v_order.id and assignment.driver_id = v_actor
      and activity_private.driver_is_approved(profile.id) and profile.is_active
  ) into v_driver;

  v_non_admin := case
    when p_next = v_order.status then v_customer or v_staff or v_driver
    when v_order.status = 'pending_confirmation' and p_next in ('confirmed','rejected') then v_staff
    when v_order.status = 'pending_confirmation' and p_next = 'cancelled' then v_customer or v_staff
    when v_order.status = 'confirmed' and p_next = 'preparing' then v_staff
    when v_order.status in ('confirmed','preparing') and p_next = 'cancelled' then v_staff
    when v_order.status = 'preparing' and p_next = 'ready_for_pickup' then v_staff
    when v_order.status = 'ready_for_pickup' and p_next = 'out_for_delivery' then
      (v_order.delivery_mode = 'self' and v_staff)
      or (v_order.delivery_mode = 'platform' and v_driver)
    when v_order.status = 'out_for_delivery' and p_next in ('delivery_failed','issue') then
      v_driver or v_staff
    when v_order.status = 'delivery_failed' and p_next = 'out_for_delivery' then v_driver or v_staff
    when v_order.status = 'delivery_failed' and p_next = 'cancelled' then v_staff
    when v_order.status in ('ready_for_pickup','out_for_delivery') and p_next = 'delivered' then
      (v_order.delivery_mode = 'self' and v_staff)
      or (v_order.delivery_mode = 'platform' and v_driver)
    when v_order.status = 'issue' and p_next in ('out_for_delivery','delivery_failed') then v_staff
    when v_order.status = 'delivered' and p_next = 'return_requested' then v_customer
    when v_order.status = 'return_requested' and p_next in ('return_approved','delivered') then v_staff
    when v_order.status = 'return_approved' and p_next = 'returned' then v_staff
    else false
  end;
  perform public.require_marketplace_admin_fallback(v_non_admin);
  return public.set_my_marketplace_order_status_base_174408(
    p_order_id, p_next, p_reason, p_collected_amount
  );
end;
$$;


-- Preserve the existing open_my_marketplace_conversation RPC contract and privilege grants.
create or replace function public.open_my_marketplace_conversation(
  p_store_id uuid,
  p_order_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_customer public.marketplace_customers;
  v_store public.stores;
  v_order public.marketplace_orders;
  v_thread public.support_threads;
  v_allowed boolean := false;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('presale', 'order')
     or (p_kind = 'presale' and (p_store_id is null or p_order_id is not null))
     or (p_kind = 'order' and (p_order_id is null or p_store_id is not null)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_customer
  from public.marketplace_customers
  where auth_user_id = v_actor_id and is_active;

  if p_kind = 'presale' then
    select * into v_store from public.stores
    where id = p_store_id and status = 'published';
    if v_store is null or v_customer is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-chat:presale:' || v_customer.id::text || ':' || v_store.id::text, 0)
    );
    select * into v_thread
    from public.support_threads
    where customer_id = v_customer.id and store_id = v_store.id
      and conversation_kind = 'presale' and status not in ('resolved', 'closed')
    order by created_at desc limit 1;
    if v_thread is null then
      insert into public.support_threads (
        customer_id, store_id, subject, conversation_kind
      ) values (
        v_customer.id, v_store.id, 'Chat with ' || v_store.name, 'presale'
      ) returning * into v_thread;
    end if;
  else
    select * into v_order from public.marketplace_orders where id = p_order_id;
    if v_order is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_allowed := (
      v_customer is not null and v_customer.id = v_order.customer_id
    ) or exists (
      select 1 from public.store_memberships as membership
      where membership.store_id = v_order.store_id
        and membership.user_id = v_actor_id and membership.is_active
        and membership.role in ('owner', 'manager', 'fulfillment')
              and activity_private.store_is_approved(membership.user_id,membership.store_id,array['owner','manager','fulfillment'])
    ) or exists (
      select 1
      from public.marketplace_delivery_assignments as assignment
      join public.profiles as profile on profile.id = assignment.driver_id
      where assignment.order_id = v_order.id and assignment.driver_id = v_actor_id
        and assignment.status in ('assigned', 'picked_up', 'issue')
        and activity_private.driver_is_approved(profile.id) and profile.is_active
    );
    if not v_allowed then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-chat:order:' || v_order.id::text, 0)
    );
    select * into v_thread from public.support_threads
    where order_id = v_order.id and conversation_kind = 'order'
    order by created_at limit 1;
    if v_thread is null then
      insert into public.support_threads (
        customer_id, store_id, order_id, subject, conversation_kind
      ) values (
        v_order.customer_id, v_order.store_id, v_order.id,
        'Order chat ' || v_order.public_code, 'order'
      ) returning * into v_thread;
    end if;
  end if;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, customer.auth_user_id, 'customer'
  from public.marketplace_customers as customer
  where customer.id = v_thread.customer_id and customer.auth_user_id is not null and customer.is_active
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, membership.user_id, 'merchant'
  from public.store_memberships as membership
  where membership.store_id = v_thread.store_id and membership.is_active
    and membership.role in ('owner', 'manager', 'fulfillment')
              and activity_private.store_is_approved(membership.user_id,membership.store_id,array['owner','manager','fulfillment'])
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null,
    joined_at = case
      when public.marketplace_chat_participants.removed_at is not null then now()
      else public.marketplace_chat_participants.joined_at
    end;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, assignment.driver_id, 'driver'
  from public.marketplace_delivery_assignments as assignment
  join public.profiles as profile on profile.id = assignment.driver_id
  where assignment.order_id = v_thread.order_id and assignment.driver_id is not null
    and assignment.status in ('assigned', 'picked_up', 'issue')
    and activity_private.driver_is_approved(profile.id) and profile.is_active
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null,
    joined_at = case
      when public.marketplace_chat_participants.removed_at is not null then now()
      else public.marketplace_chat_participants.joined_at
    end;

  if not public.can_access_marketplace_chat_thread(v_thread.id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public.marketplace_chat_conversation_summary(v_thread.id, v_actor_id);
end;
$$;


-- Preserve the existing list_public_driver_summaries RPC contract and privilege grants.
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
    where activity_private.driver_is_approved(profile.id) and profile.is_active
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


-- Preserve the existing sync_marketplace_chat_driver_profile RPC contract and privilege grants.
create or replace function public.sync_marketplace_chat_driver_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_user_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_active boolean := false;
begin
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := activity_private.driver_is_approved(new.id) and new.is_active;
  end if;

  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_user_id, 'driver'
    from public.support_threads as thread
    join public.marketplace_delivery_assignments as assignment
      on assignment.order_id = thread.order_id
    where assignment.driver_id = v_user_id
      and assignment.status in ('assigned', 'picked_up', 'issue')
      and (
        thread.conversation_kind = 'order'
        or exists (
          select 1 from public.marketplace_chat_block_escalations as escalation
          where escalation.escalation_thread_id = thread.id
            and escalation.blocker_user_id = v_user_id
        )
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  else
    update public.marketplace_chat_participants
    set removed_at = coalesce(removed_at, now())
    where user_id = v_user_id and participant_role = 'driver' and removed_at is null;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


-- Preserve the existing list_my_marketplace_delivery_offers RPC contract and privilege grants.
create or replace function public.list_my_marketplace_delivery_offers(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null or p_limit not between 1 and 100 or not exists (
    select 1 from public.profiles
    where id = v_actor_id and activity_private.driver_is_approved(v_actor_id) and is_active
  ) then
    raise exception 'driver_access_required' using errcode = '42501';
  end if;
  update public.marketplace_delivery_offers
  set status = 'expired', responded_at = now(), updated_at = now()
  where driver_id = v_actor_id and status = 'offered' and expires_at <= now();
  with page as (
    select
      offer.id, offer.order_id, marketplace_order.public_code as order_code,
      marketplace_order.store_name_snapshot as store_name,
      zone.name_ar as delivery_zone_name,
      marketplace_order.delivery_fee as delivery_fee_piastres,
      coalesce(sum(item.quantity), 0)::integer as package_count,
      marketplace_order.ready_at, offer.expires_at, offer.created_at
    from public.marketplace_delivery_offers as offer
    join public.marketplace_orders as marketplace_order on marketplace_order.id = offer.order_id
    join public.delivery_zones as zone on zone.id = marketplace_order.delivery_zone_id
    left join public.order_items as item on item.order_id = marketplace_order.id
    where offer.driver_id = v_actor_id and offer.status = 'offered' and offer.expires_at > now()
      and (p_before is null or offer.created_at < p_before)
    group by offer.id, marketplace_order.id, zone.id
    order by offer.created_at desc, offer.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'order_id', page.order_id, 'order_code', page.order_code,
      'store_name', page.store_name, 'delivery_zone_name', page.delivery_zone_name,
      'delivery_fee_piastres', page.delivery_fee_piastres,
      'package_count', page.package_count, 'ready_at', page.ready_at,
      'expires_at', page.expires_at
    ) order by page.created_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.created_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;


-- Preserve the existing send_my_marketplace_chat_message RPC contract and privilege grants.
create or replace function public.send_my_marketplace_chat_message(
  p_thread_id uuid,
  p_client_message_id uuid,
  p_kind text,
  p_body text,
  p_reply_to_id uuid,
  p_card_data jsonb
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
  v_card_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.can_send_marketplace_chat_thread(p_thread_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if v_thread is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_message
  from public.support_messages as message
  where message.thread_id = p_thread_id and message.sender_user_id = v_actor_id
    and message.client_message_id = p_client_message_id;
  if v_message is not null then
    return public.marketplace_chat_message_json(v_message.id, v_actor_id);
  end if;

  select participant.participant_role into v_sender_kind
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
    and (
      (participant.participant_role = 'customer' and exists (
        select 1 from public.marketplace_customers as customer
        where customer.id = v_thread.customer_id
          and customer.auth_user_id = v_actor_id and customer.is_active
      ))
      or (participant.participant_role = 'merchant' and exists (
        select 1 from public.store_memberships as membership
        where membership.store_id = v_thread.store_id
          and membership.user_id = v_actor_id and membership.is_active
          and membership.role in ('owner', 'manager', 'fulfillment')
              and activity_private.store_is_approved(membership.user_id,membership.store_id,array['owner','manager','fulfillment'])
      ))
      or (participant.participant_role = 'driver' and exists (
        select 1
        from public.marketplace_delivery_assignments as assignment
        join public.profiles as profile on profile.id = assignment.driver_id
        where assignment.order_id = v_thread.order_id
          and assignment.driver_id = v_actor_id
          and assignment.status in ('assigned', 'picked_up', 'issue')
          and activity_private.driver_is_approved(profile.id) and profile.is_active
      ))
      or (participant.participant_role = 'admin'
        and v_thread.assigned_admin_id = v_actor_id
        and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
        and exists (
          select 1
          from public.profiles as profile
          join public.admin_memberships as membership on membership.user_id = profile.id
          where profile.id = v_actor_id
            and profile.role = 'admin' and profile.is_active
            and not profile.must_change_password and membership.is_active
            and membership.role::text in ('support', 'super_admin')
        )
      )
    )
  order by case participant.participant_role
    when 'customer' then 0 when 'merchant' then 1 when 'driver' then 2 else 3 end
  limit 1;
  if v_sender_kind is null then
    -- Monitors may observe but can never impersonate a participant.
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- A block names an exact pair. Read access remains intact so delivery and
  -- support updates stay visible, but neither member of that pair may continue
  -- a direct exchange in the shared conversation.
  if exists (
    select 1
    from public.marketplace_chat_blocks as block
    where block.thread_id = p_thread_id
      and (
        (
          block.blocker_user_id = v_actor_id
          and exists (
            select 1 from public.marketplace_chat_participants as blocked
            where blocked.thread_id = p_thread_id
              and blocked.user_id = block.blocked_user_id
              and blocked.removed_at is null
          )
        )
        or (
          block.blocked_user_id = v_actor_id
          and exists (
            select 1 from public.marketplace_chat_participants as blocker
            where blocker.thread_id = p_thread_id
              and blocker.user_id = block.blocker_user_id
              and blocker.removed_at is null
          )
        )
      )
  ) then
    raise exception 'closed' using errcode = '55000';
  end if;
  if v_thread.status = 'closed' or v_thread.paused_at is not null then
    raise exception 'closed' using errcode = '55000';
  end if;
  if p_client_message_id is null
     or p_kind is null
     or p_kind not in ('text', 'image', 'product', 'store', 'order', 'location') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'text' and (
    char_length(trim(coalesce(p_body, ''))) not between 1 and 5000
    or p_card_data is not null
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'image' and (p_body is not null or p_card_data is not null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind in ('product', 'store', 'order', 'location') and (
    p_body is not null or jsonb_typeof(p_card_data) <> 'object'
    or p_card_data ->> 'type' is distinct from p_kind
    or octet_length(p_card_data::text) > 512
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_kind in ('product', 'store', 'order') then
    if p_card_data - 'type' - 'id' <> '{}'::jsonb
       or coalesce(p_card_data ->> 'id', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_card_id := (p_card_data ->> 'id')::uuid;
    if (p_kind = 'product' and not exists (
          select 1 from public.products as product
          where product.id = v_card_id and product.store_id = v_thread.store_id
            and product.status = 'active'
        ))
       or (p_kind = 'store' and v_card_id is distinct from v_thread.store_id)
       or (p_kind = 'order' and v_card_id is distinct from v_thread.order_id) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  elsif p_kind = 'location' then
    if p_card_data - 'type' - 'latitude' - 'longitude' <> '{}'::jsonb
       or jsonb_typeof(p_card_data -> 'latitude') is distinct from 'number'
       or jsonb_typeof(p_card_data -> 'longitude') is distinct from 'number'
       or (p_card_data ->> 'latitude')::numeric not between -90 and 90
       or (p_card_data ->> 'longitude')::numeric not between -180 and 180
       or not exists (
         select 1 from public.marketplace_delivery_assignments as assignment
         where assignment.order_id = v_thread.order_id
           and assignment.status in ('assigned', 'picked_up', 'issue')
       ) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.support_messages as reply
    where reply.id = p_reply_to_id and reply.thread_id = p_thread_id
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (
    select count(*) from public.support_messages as recent
    where recent.thread_id = p_thread_id and recent.sender_user_id = v_actor_id
      and recent.created_at >= now() - interval '1 minute'
  ) >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.support_messages as conversation_message
    where conversation_message.thread_id = p_thread_id
  ) >= 100000 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.support_messages (
    thread_id, sender_user_id, sender_kind, body, client_message_id,
    message_kind, reply_to_id, card_data
  ) values (
    p_thread_id, v_actor_id, v_sender_kind,
    case when p_kind = 'text' then trim(p_body) else null end,
    p_client_message_id, p_kind, p_reply_to_id, p_card_data
  ) returning * into v_message;

  update public.support_threads
  set last_message_at = v_message.created_at,
      status = case when v_sender_kind = 'customer' then 'waiting_support'::public.marketplace_support_status
                    else 'waiting_customer'::public.marketplace_support_status end,
      resolved_at = null, updated_at = now()
  where id = p_thread_id;
  return public.marketplace_chat_message_json(v_message.id, v_actor_id);
end;
$$;


-- Preserve the existing set_marketplace_order_status RPC contract and privilege grants.
create or replace function public.set_marketplace_order_status(
  p_order_id uuid,
  p_next public.marketplace_order_status,
  p_actor_id uuid,
  p_reason text default null,
  p_collected_amount public.egp_amount default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.marketplace_orders;
  v_previous public.marketplace_order_status;
  v_is_customer boolean;
  v_is_admin boolean;
  v_is_store_staff boolean;
  v_is_assigned_driver boolean;
  v_transition_allowed boolean := false;
  v_reservation record;
  v_earned_commission public.commission_ledger;
  v_return_window_days integer;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if v_order is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_previous := v_order.status;

  select exists (
    select 1 from public.marketplace_customers
    where id = v_order.customer_id and auth_user_id = p_actor_id and is_active
  ) into v_is_customer;
  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) into v_is_admin;
  v_is_store_staff := activity_private.store_is_approved(p_actor_id,v_order.store_id,array['owner','manager','fulfillment']);
  select exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    join public.profiles as profile on profile.id = assignment.driver_id
    where assignment.order_id = v_order.id
      and assignment.driver_id = p_actor_id
      and activity_private.driver_is_approved(profile.id)
      and profile.is_active
  ) into v_is_assigned_driver;

  if p_next = v_previous then
    if not (v_is_customer or v_is_admin or v_is_store_staff or v_is_assigned_driver) then
      raise exception 'order_access_required' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'id', v_order.id,
      'public_code', v_order.public_code,
      'order_group_id', v_order.order_group_id,
      'store_id', v_order.store_id,
      'status', v_order.status,
      'payment_status', v_order.payment_status,
      'subtotal_piastres', v_order.subtotal,
      'discount_total_piastres', v_order.discount_total,
      'delivery_fee_piastres', v_order.delivery_fee,
      'grand_total_piastres', v_order.grand_total,
      'updated_at', v_order.updated_at,
      'idempotent', true
    );
  end if;

  v_transition_allowed := case
    when v_previous = 'pending_confirmation' and p_next = 'confirmed'
      then v_is_store_staff or v_is_admin
    when v_previous = 'pending_confirmation' and p_next = 'rejected'
      then v_is_store_staff or v_is_admin
    when v_previous = 'pending_confirmation' and p_next = 'cancelled'
      then v_is_customer or v_is_store_staff or v_is_admin or p_actor_id is null
    when v_previous = 'confirmed' and p_next = 'preparing'
      then v_is_store_staff or v_is_admin
    when v_previous in ('confirmed', 'preparing') and p_next = 'cancelled'
      then v_is_store_staff or v_is_admin
    when v_previous = 'preparing' and p_next = 'ready_for_pickup'
      then v_is_store_staff or v_is_admin
    when v_previous = 'ready_for_pickup' and p_next = 'out_for_delivery'
      then (
        (v_order.delivery_mode = 'self' and v_is_store_staff)
        or (v_order.delivery_mode = 'platform' and v_is_assigned_driver)
        or v_is_admin
      )
    when v_previous = 'out_for_delivery' and p_next in ('delivery_failed', 'issue')
      then v_is_assigned_driver or v_is_store_staff or v_is_admin
    when v_previous = 'delivery_failed' and p_next = 'out_for_delivery'
      then v_is_assigned_driver or v_is_store_staff or v_is_admin
    when v_previous = 'delivery_failed' and p_next = 'cancelled'
      then v_is_store_staff or v_is_admin
    when v_previous in ('ready_for_pickup', 'out_for_delivery') and p_next = 'delivered'
      then (
        (v_order.delivery_mode = 'self' and v_is_store_staff)
        or (v_order.delivery_mode = 'platform' and v_is_assigned_driver)
        or v_is_admin
      )
    when v_previous = 'issue' and p_next in ('out_for_delivery', 'delivery_failed')
      then v_is_store_staff or v_is_admin
    when v_previous = 'delivered' and p_next = 'return_requested'
      then v_is_customer or v_is_admin
    when v_previous = 'return_requested' and p_next in ('return_approved', 'delivered')
      then v_is_store_staff or v_is_admin
    when v_previous = 'return_approved' and p_next = 'returned'
      then v_is_store_staff or v_is_admin
    else false
  end;

  if not v_transition_allowed then
    raise exception 'invalid_or_unauthorized_order_transition:%->%', v_previous, p_next
      using errcode = '42501';
  end if;

  if p_next in ('rejected', 'cancelled', 'delivery_failed', 'issue', 'return_requested')
     and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'transition_reason_required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) > 1000 then
    raise exception 'transition_reason_too_long' using errcode = '22023';
  end if;
  if p_next = 'delivered' and v_order.delivery_mode = 'platform' and not exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    where assignment.order_id = v_order.id
      and assignment.proof_asset_id is not null
  ) then
    raise exception 'delivery_proof_required' using errcode = '23514';
  end if;
  if v_previous = 'delivered' and p_next = 'return_requested' then
    select coalesce((value ->> 'return_window_days')::integer, 14)
    into v_return_window_days
    from public.marketplace_runtime_settings
    where key = 'marketplace_policy';
    v_return_window_days := coalesce(v_return_window_days, 14);
    if v_return_window_days not between 1 and 90
       or v_order.delivered_at is null
       or v_order.delivered_at < now() - make_interval(days => v_return_window_days) then
      raise exception 'return_window_expired' using errcode = '22023';
    end if;
  end if;

  if p_next = 'confirmed' then
    if exists (
      select 1 from public.inventory_reservations
      where order_id = v_order.id
        and (status <> 'reserved' or expires_at <= now())
    ) then
      raise exception 'inventory_reservation_unavailable' using errcode = '55000';
    end if;
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status = 'reserved'
      order by variant_id
      for update
    loop
      update public.inventory_stock
      set on_hand = on_hand - v_reservation.quantity,
          reserved = reserved - v_reservation.quantity,
          version = version + 1,
          updated_at = now()
      where variant_id = v_reservation.variant_id
        and reserved >= v_reservation.quantity
        and on_hand >= v_reservation.quantity;
      if not found then
        raise exception 'inventory_commit_failed:%', v_reservation.variant_id;
      end if;
      update public.inventory_reservations
      set status = 'committed', committed_at = now()
      where id = v_reservation.id;
    end loop;
  elsif p_next in ('cancelled', 'rejected') then
    perform coupon.id
    from public.marketplace_coupons as coupon
    join public.coupon_redemptions as redemption on redemption.coupon_id = coupon.id
    where redemption.order_id = v_order.id and redemption.voided_at is null
    order by coupon.id
    for update of coupon;
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status in ('reserved', 'committed')
      order by variant_id
      for update
    loop
      if v_reservation.status = 'reserved' then
        update public.inventory_stock
        set reserved = reserved - v_reservation.quantity,
            version = version + 1,
            updated_at = now()
        where variant_id = v_reservation.variant_id
          and reserved >= v_reservation.quantity;
      else
        update public.inventory_stock
        set on_hand = on_hand + v_reservation.quantity,
            version = version + 1,
            updated_at = now()
        where variant_id = v_reservation.variant_id;
      end if;
      update public.inventory_reservations
      set status = case
            when p_actor_id is null and p_reason = 'inventory_reservation_expired'
            then 'expired'::public.marketplace_reservation_status
            else 'released'::public.marketplace_reservation_status
          end,
          released_at = now()
      where id = v_reservation.id;
    end loop;

    with voided as (
      update public.coupon_redemptions
      set voided_at = now()
      where order_id = v_order.id and voided_at is null
      returning coupon_id
    )
    update public.marketplace_coupons as coupon
    set redeemed_count = greatest(0, coupon.redeemed_count - counts.quantity),
        updated_at = now()
    from (
      select coupon_id, count(*)::integer as quantity from voided group by coupon_id
    ) as counts
    where coupon.id = counts.coupon_id;

    update public.cod_collections
    set status = 'failed', updated_at = now()
    where order_id = v_order.id and status = 'pending';
  elsif p_next = 'delivered' and v_previous <> 'return_requested' then
    if p_collected_amount is null or p_collected_amount <> v_order.grand_total then
      raise exception 'cod_amount_mismatch' using errcode = '22023';
    end if;
    update public.cod_collections
    set collected_amount = p_collected_amount,
        status = 'collected',
        collected_by = case
          when exists (select 1 from public.profiles where id = p_actor_id) then p_actor_id
          else null
        end,
        collected_by_name_snapshot = (
          select profile.display_name from public.profiles as profile where profile.id = p_actor_id
        ),
        collected_at = now(),
        updated_at = now()
    where order_id = v_order.id and status = 'pending';
    if not found then
      raise exception 'cod_collection_not_pending';
    end if;

    insert into public.cash_ledger_entries (
      event_key, entry_type, order_id, collection_id, amount_piastres,
      actor_user_id, actor_name_snapshot, metadata
    )
    select
      'cod.collection:' || collection.id::text,
      'collection',
      collection.order_id,
      collection.id,
      collection.collected_amount,
      p_actor_id,
      (select profile.display_name from public.profiles as profile where profile.id = p_actor_id),
      jsonb_build_object('payment_method', 'cod')
    from public.cod_collections as collection
    where collection.order_id = v_order.id
    on conflict (event_key) do nothing;

    insert into public.commission_ledger (
      store_id,
      order_id,
      gross_merchandise_value,
      commission_amount,
      recognized_at
    ) values (
      v_order.store_id,
      v_order.id,
      v_order.subtotal - v_order.merchant_discount_total,
      round((v_order.subtotal - v_order.merchant_discount_total) * 0.0700, 0)::bigint,
      now()
    ) on conflict (order_id, entry_type) do nothing;
  elsif p_next = 'returned' then
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status = 'committed'
      order by variant_id
      for update
    loop
      update public.inventory_stock
      set on_hand = on_hand + v_reservation.quantity,
          version = version + 1,
          updated_at = now()
      where variant_id = v_reservation.variant_id;
      update public.inventory_reservations
      set status = 'released', released_at = now()
      where id = v_reservation.id;
    end loop;
    select * into v_earned_commission
    from public.commission_ledger
    where order_id = v_order.id and entry_type = 'earned'
    for update;
    if v_earned_commission is not null then
      update public.commission_ledger
      set reversed_at = now(),
          reversal_reason = coalesce(nullif(trim(p_reason), ''), 'order_returned')
      where id = v_earned_commission.id and reversed_at is null;
      insert into public.commission_ledger (
        store_id, order_id, entry_type, source_entry_id,
        gross_merchandise_value, commission_amount, recognized_at, reversal_reason
      ) values (
        v_earned_commission.store_id,
        v_earned_commission.order_id,
        'reversal',
        v_earned_commission.id,
        -v_earned_commission.gross_merchandise_value,
        -v_earned_commission.commission_amount,
        now(),
        coalesce(nullif(trim(p_reason), ''), 'order_returned')
      ) on conflict (order_id, entry_type) do nothing;
    end if;
    update public.cod_collections
    set status = 'refunded', updated_at = now()
    where order_id = v_order.id;
    insert into public.cash_ledger_entries (
      event_key, entry_type, order_id, collection_id, amount_piastres,
      actor_user_id, actor_name_snapshot, metadata
    )
    select
      'cod.refund:' || collection.id::text,
      'refund',
      collection.order_id,
      collection.id,
      -collection.collected_amount,
      p_actor_id,
      (select profile.display_name from public.profiles as profile where profile.id = p_actor_id),
      jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'order_returned'))
    from public.cod_collections as collection
    where collection.order_id = v_order.id
      and collection.collected_amount is not null
    on conflict (event_key) do nothing;
  end if;

  update public.marketplace_orders
  set status = p_next,
      payment_status = case
        when p_next = 'delivered' and v_previous <> 'return_requested' then 'collected'
        when p_next = 'returned' then 'refunded'
        else payment_status
      end,
      cancellation_reason = case
        when p_next in ('cancelled', 'rejected') then nullif(trim(p_reason), '')
        else cancellation_reason
      end,
      confirmed_at = case when p_next = 'confirmed' then now() else confirmed_at end,
      ready_at = case when p_next = 'ready_for_pickup' then now() else ready_at end,
      delivered_at = case when p_next = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      cancelled_at = case when p_next in ('cancelled', 'rejected') then now() else cancelled_at end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.marketplace_delivery_assignments
  set status = case
        when p_next = 'out_for_delivery' then 'picked_up'
        when p_next = 'delivered' then 'delivered'
        when p_next in ('delivery_failed', 'issue') then 'issue'
        when p_next in ('cancelled', 'rejected') then 'cancelled'
        else status
      end,
      picked_up_at = case
        when p_next in ('out_for_delivery', 'delivered') then coalesce(picked_up_at, now())
        else picked_up_at
      end,
      delivered_at = case when p_next = 'delivered' then now() else delivered_at end,
      notes = case when p_next in ('delivery_failed', 'issue') then nullif(trim(p_reason), '') else notes end,
      updated_at = now()
  where order_id = v_order.id;

  insert into public.marketplace_order_events (
    order_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_order.id,
    p_actor_id,
    'order.status_changed',
    v_previous,
    p_next,
    jsonb_build_object('reason', p_reason)
  );
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.order.status:' || gen_random_uuid()::text,
    'marketplace.order.status_changed',
    'marketplace_order',
    v_order.id::text,
    jsonb_build_object(
      'order_id', v_order.id,
      'customer_id', v_order.customer_id,
      'store_id', v_order.store_id,
      'from', v_previous,
      'to', p_next
    )
  );
  return jsonb_build_object(
    'id', v_order.id,
    'public_code', v_order.public_code,
    'order_group_id', v_order.order_group_id,
    'store_id', v_order.store_id,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'subtotal_piastres', v_order.subtotal,
    'discount_total_piastres', v_order.discount_total,
    'delivery_fee_piastres', v_order.delivery_fee,
    'grand_total_piastres', v_order.grand_total,
    'updated_at', v_order.updated_at,
    'idempotent', false
  );
end;
$$;


-- Preserve the existing list_available_delivery_drivers RPC contract and privilege grants.
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
        and public.has_my_activity_access('merchant')
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
  where activity_private.driver_is_approved(profile.id)
    and profile.is_active
    and driver.is_available
    and driver.active_until > now()
  order by profile.display_name;
end;
$$;


-- Preserve the existing replace_my_driver_avatar_media RPC contract and privilege grants.
create or replace function public.replace_my_driver_avatar_media(p_upload_id uuid)
returns table (avatar_url text, avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_upload public.legacy_media_uploads;
  v_previous public.legacy_media_uploads;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_uid and activity_private.driver_is_approved(profile.id)
      and profile.is_active and not profile.must_change_password
  ) then
    raise exception 'driver_media_access_denied' using errcode = '42501';
  end if;

  select * into v_upload
  from public.legacy_media_uploads as upload
  where upload.id = p_upload_id
    and upload.owner_id = v_uid
    and upload.purpose = 'driver_avatar'
    and upload.folder = 'driver_avatar'
    and upload.status = 'ready'
    and upload.expires_at > now()
  for update;
  if v_upload is null then
    raise exception 'driver_avatar_not_claimable' using errcode = '42501';
  end if;

  perform 1 from public.driver_profiles where profile_id = v_uid for update;
  if not found then
    raise exception 'driver_profile_not_found' using errcode = 'P0002';
  end if;

  select upload.* into v_previous
  from public.legacy_media_uploads as upload
  where upload.purpose = 'driver_avatar'
    and upload.entity_id = v_uid
    and upload.status = 'claimed'
    and upload.id <> p_upload_id
  order by upload.claimed_at desc
  limit 1
  for update;

  update public.legacy_media_uploads
  set status = 'claimed', entity_id = v_uid, claimed_at = now(), updated_at = now()
  where id = p_upload_id;

  update public.driver_profiles
  set avatar_url = v_upload.public_url,
      avatar_path = v_upload.object_key,
      updated_at = now()
  where profile_id = v_uid;

  if v_previous is not null then
    update public.legacy_media_uploads
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where id = v_previous.id;
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    ) values (
      'legacy.avatar.delete:' || v_previous.id::text,
      'media.delete_requested', 'driver_avatar', v_uid::text,
      jsonb_build_object('bucket', v_previous.bucket, 'object_key', v_previous.object_key)
    ) on conflict (event_key) do nothing;
  end if;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_uid, 'driver_avatar_replaced', 'driver_profile', v_uid::text,
    jsonb_build_object('upload_id', p_upload_id)
  );

  return query select v_upload.public_url, v_upload.object_key;
end;
$$;


-- Preserve the existing can_send_marketplace_chat_thread RPC contract and privilege grants.
create or replace function public.can_send_marketplace_chat_thread(p_thread_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.marketplace_chat_participants as participant
    join public.support_threads as thread on thread.id = participant.thread_id
    where participant.thread_id = p_thread_id
      and participant.user_id = v_actor_id
      and participant.removed_at is null
      and (
        (
          participant.participant_role = 'customer'
          and exists (
            select 1 from public.marketplace_customers as customer
            where customer.id = thread.customer_id
              and customer.auth_user_id = v_actor_id and customer.is_active
          )
        )
        or (
          participant.participant_role = 'merchant'
          and exists (
            select 1 from public.store_memberships as membership
            where membership.store_id = thread.store_id
              and membership.user_id = v_actor_id and membership.is_active
              and membership.role in ('owner', 'manager', 'fulfillment')
              and activity_private.store_is_approved(membership.user_id,membership.store_id,array['owner','manager','fulfillment'])
          )
        )
        or (
          participant.participant_role = 'driver'
          and exists (
            select 1
            from public.marketplace_delivery_assignments as assignment
            join public.profiles as profile on profile.id = assignment.driver_id
            where assignment.order_id = thread.order_id
              and assignment.driver_id = v_actor_id
              and assignment.status in ('assigned', 'picked_up', 'issue')
              and activity_private.driver_is_approved(profile.id) and profile.is_active
          )
        )
        or (
          participant.participant_role = 'admin'
          and thread.assigned_admin_id = v_actor_id
          and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
          and exists (
            select 1
            from public.profiles as profile
            join public.admin_memberships as membership on membership.user_id = profile.id
            where profile.id = v_actor_id
              and profile.role = 'admin' and profile.is_active
              and not profile.must_change_password and membership.is_active
              and membership.role::text in ('support', 'super_admin')
          )
        )
      )
  );
end;
$$;


-- Preserve the existing create_delivery_order RPC contract and privilege grants.
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
  if v_profile is null then
    raise exception 'merchant_access_required';
  end if;

  select * into v_branch
  from public.merchant_branches
  where id = p_branch_id
    and public.is_current_merchant_for(merchant_id)
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
      and activity_private.driver_is_approved(profile.id)
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
    v_branch.merchant_id,
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


-- Preserve the existing list_driver_delivery_offers RPC contract and privilege grants.
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
      and activity_private.driver_is_approved(profile.id)
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


-- Preserve the existing list_public_registered_drivers RPC contract and privilege grants.
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
  where activity_private.driver_is_approved(profile.id)
    and profile.is_active;
$$;


-- Preserve the existing create_cash_reconciliation_batch RPC contract and privilege grants.
create or replace function public.create_cash_reconciliation_batch(
  p_driver_id uuid,
  p_collection_ids uuid[],
  p_submitted_amounts_piastres bigint[],
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cash_reconciliation_batches;
  v_collection public.cod_collections;
  v_driver_name text;
  v_expected bigint := 0;
  v_submitted bigint := 0;
  v_index integer;
  v_is_admin boolean;
begin
  if p_driver_id is null
     or p_collection_ids is null
     or p_submitted_amounts_piastres is null
     or cardinality(p_collection_ids) not between 1 and 100
     or cardinality(p_collection_ids) <> cardinality(p_submitted_amounts_piastres)
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or exists (select 1 from unnest(p_submitted_amounts_piastres) as amount where amount < 0)
     or (select count(*) from unnest(p_collection_ids)) <>
        (select count(distinct id) from unnest(p_collection_ids) as id) then
    raise exception 'invalid_reconciliation_batch' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) into v_is_admin;
  if p_actor_id is distinct from p_driver_id and not v_is_admin then
    raise exception 'reconciliation_access_required' using errcode = '42501';
  end if;
  select display_name into v_driver_name
  from public.profiles
  where id = p_driver_id and activity_private.driver_is_approved(p_driver_id) and is_active;
  if v_driver_name is null then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cash-reconciliation:' || p_idempotency_key, 0)
  );
  select * into v_batch
  from public.cash_reconciliation_batches
  where idempotency_key = p_idempotency_key;
  if v_batch is not null then
    if v_batch.driver_id is distinct from p_driver_id then
      raise exception 'reconciliation_idempotency_conflict' using errcode = '23505';
    end if;
    return v_batch;
  end if;

  insert into public.cash_reconciliation_batches (
    idempotency_key, driver_id, driver_name_snapshot, expected_total,
    submitted_total
  ) values (
    p_idempotency_key, p_driver_id, v_driver_name, 0, 0
  ) returning * into v_batch;

  for v_index in 1..cardinality(p_collection_ids) loop
    select * into v_collection
    from public.cod_collections
    where id = p_collection_ids[v_index]
    for update;
    if v_collection is null
       or v_collection.status <> 'collected'
       or v_collection.collected_by is distinct from p_driver_id
       or v_collection.collected_amount is null then
      raise exception 'collection_not_reconcilable:%', p_collection_ids[v_index]
        using errcode = '55000';
    end if;
    insert into public.cash_reconciliation_items (
      batch_id, collection_id, expected_amount, submitted_amount
    ) values (
      v_batch.id,
      v_collection.id,
      v_collection.collected_amount,
      p_submitted_amounts_piastres[v_index]
    );
    v_expected := v_expected + v_collection.collected_amount;
    v_submitted := v_submitted + p_submitted_amounts_piastres[v_index];
  end loop;

  update public.cash_reconciliation_batches
  set expected_total = v_expected,
      submitted_total = v_submitted,
      updated_at = now()
  where id = v_batch.id
  returning * into v_batch;
  return v_batch;
end;
$$;


-- Preserve the existing block_my_marketplace_chat_counterparty RPC contract and privilege grants.
create or replace function public.block_my_marketplace_chat_counterparty(
  p_thread_id uuid,
  p_counterparty_id uuid,
  p_blocked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer;
  v_active_delivery boolean;
  v_actor_role text;
  v_counterparty_role text;
  v_assigned_driver_id uuid;
  v_source_thread public.support_threads;
  v_escalation_thread_id uuid;
  v_assigned_admin_id uuid;
  v_previous_admin_id uuid;
  v_admin_eligible boolean := false;
  v_administration_assigned boolean := false;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_blocked is null or p_counterparty_id is null or p_counterparty_id = v_actor_id
     or not public.can_send_marketplace_chat_thread(p_thread_id)
     or not exists (
       select 1 from public.marketplace_chat_participants as counterparty
       where counterparty.thread_id = p_thread_id
         and counterparty.user_id = p_counterparty_id and counterparty.removed_at is null
     ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_source_thread
  from public.support_threads as thread
  where thread.id = p_thread_id
  for update;

  select participant.participant_role into v_actor_role
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
  order by case participant.participant_role
    when 'customer' then 0 when 'driver' then 1 when 'merchant' then 2 else 3 end
  limit 1;

  select participant.participant_role into v_counterparty_role
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = p_counterparty_id
    and participant.removed_at is null
  order by case participant.participant_role
    when 'customer' then 0 when 'driver' then 1 when 'merchant' then 2 else 3 end
  limit 1;

  select assignment.driver_id into v_assigned_driver_id
  from public.marketplace_delivery_assignments as assignment
  join public.profiles as profile on profile.id = assignment.driver_id
  where assignment.order_id = v_source_thread.order_id
    and assignment.status in ('assigned', 'picked_up', 'issue')
    and activity_private.driver_is_approved(profile.id) and profile.is_active
  order by assignment.assigned_at desc, assignment.id desc
  limit 1;

  v_active_delivery := v_assigned_driver_id is not null;
  if p_blocked then
    insert into public.marketplace_chat_blocks (
      thread_id, blocker_user_id, blocked_user_id
    ) values (
      p_thread_id, v_actor_id, p_counterparty_id
    )
    on conflict (thread_id, blocker_user_id, blocked_user_id)
    do update set blocked_at = excluded.blocked_at;
  else
    delete from public.marketplace_chat_blocks
    where thread_id = p_thread_id
      and blocker_user_id = v_actor_id
      and blocked_user_id = p_counterparty_id;
  end if;

  if p_blocked and v_active_delivery and (
    (v_actor_role = 'customer' and v_counterparty_role = 'driver'
      and p_counterparty_id = v_assigned_driver_id)
    or
    (v_actor_role = 'driver' and v_actor_id = v_assigned_driver_id
      and v_counterparty_role = 'customer')
  ) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'marketplace-chat:block-escalation:' || p_thread_id::text || ':' ||
      v_actor_id::text || ':' || p_counterparty_id::text,
      0
    ));

    select escalation.escalation_thread_id into v_escalation_thread_id
    from public.marketplace_chat_block_escalations as escalation
    where escalation.source_thread_id = p_thread_id
      and escalation.blocker_user_id = v_actor_id
      and escalation.blocked_user_id = p_counterparty_id;

    if v_escalation_thread_id is null then
      insert into public.support_threads (
        customer_id, store_id, order_id, subject, status,
        assigned_admin_id, conversation_kind
      ) values (
        v_source_thread.customer_id,
        v_source_thread.store_id,
        v_source_thread.order_id,
        'Constrained order support after participant block',
        'open',
        null,
        'support'
      ) returning id into v_escalation_thread_id;

      insert into public.marketplace_chat_block_escalations (
        source_thread_id, blocker_user_id, blocked_user_id, escalation_thread_id
      ) values (
        p_thread_id, v_actor_id, p_counterparty_id, v_escalation_thread_id
      );

      insert into public.marketplace_chat_participants (
        thread_id, user_id, participant_role
      ) values (
        v_escalation_thread_id, v_actor_id, v_actor_role
      );

      insert into public.marketplace_chat_participants (
        thread_id, user_id, participant_role
      )
      select v_escalation_thread_id, participant.user_id, 'merchant'
      from public.marketplace_chat_participants as participant
      where participant.thread_id = p_thread_id
        and participant.participant_role = 'merchant'
        and participant.removed_at is null
        and participant.user_id is distinct from p_counterparty_id
        and exists (
          select 1 from public.store_memberships as membership
          where membership.store_id = v_source_thread.store_id
            and membership.user_id = participant.user_id and membership.is_active
            and membership.role in ('owner', 'manager', 'fulfillment')
              and activity_private.store_is_approved(membership.user_id,membership.store_id,array['owner','manager','fulfillment'])
        )
      on conflict (thread_id, user_id, participant_role) do nothing;

      insert into public.support_messages (
        thread_id, sender_user_id, sender_kind, body, message_kind
      ) values (
        v_escalation_thread_id,
        null,
        'system',
        'Direct participant messaging is blocked. Order-support messages remain available here.',
        'system'
      );
    else
      update public.support_threads
      set status = 'open', resolved_at = null, paused_at = null,
          paused_by = null, updated_at = now()
      where id = v_escalation_thread_id;
    end if;

    select thread.assigned_admin_id into v_previous_admin_id
    from public.support_threads as thread
    where thread.id = v_escalation_thread_id
    for update;

    select exists (
      select 1
      from public.profiles as profile
      join public.admin_memberships as membership on membership.user_id = profile.id
      where profile.id = v_previous_admin_id
        and profile.id is distinct from p_counterparty_id
        and profile.role = 'admin' and profile.is_active
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
    ) into v_admin_eligible;

    if v_admin_eligible then
      v_assigned_admin_id := v_previous_admin_id;
    else
      select profile.id into v_assigned_admin_id
      from public.profiles as profile
      join public.admin_memberships as membership on membership.user_id = profile.id
      where profile.role = 'admin' and profile.is_active
        and profile.id is distinct from p_counterparty_id
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
      order by case membership.role::text when 'support' then 0 else 1 end,
        profile.id
      limit 1;
    end if;

    update public.support_threads
    set assigned_admin_id = v_assigned_admin_id, updated_at = now()
    where id = v_escalation_thread_id;

    update public.marketplace_chat_participants as participant
    set removed_at = coalesce(participant.removed_at, now())
    where participant.thread_id = v_escalation_thread_id
      and participant.participant_role = 'admin'
      and participant.user_id is distinct from v_assigned_admin_id
      and participant.removed_at is null;

    insert into public.marketplace_chat_participants (
      thread_id, user_id, participant_role
    )
    select v_escalation_thread_id, v_assigned_admin_id, 'admin'
    where v_assigned_admin_id is not null
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;

    -- Defend against prior drift and concurrent store-membership updates. The
    -- named blocked counterparty never becomes active in this mapped thread.
    update public.marketplace_chat_participants as participant
    set removed_at = coalesce(participant.removed_at, now())
    where participant.thread_id = v_escalation_thread_id
      and participant.user_id = p_counterparty_id
      and participant.removed_at is null;
  else
    select escalation.escalation_thread_id into v_escalation_thread_id
    from public.marketplace_chat_block_escalations as escalation
    where escalation.source_thread_id = p_thread_id
      and escalation.blocker_user_id = v_actor_id
      and escalation.blocked_user_id = p_counterparty_id;
  end if;

  if v_escalation_thread_id is not null then
    select thread.assigned_admin_id into v_assigned_admin_id
    from public.support_threads as thread
    where thread.id = v_escalation_thread_id;

    select exists (
      select 1
      from public.support_threads as thread
      join public.marketplace_chat_participants as participant
        on participant.thread_id = thread.id
       and participant.user_id = thread.assigned_admin_id
       and participant.participant_role = 'admin'
       and participant.removed_at is null
      join public.profiles as profile on profile.id = thread.assigned_admin_id
      join public.admin_memberships as membership on membership.user_id = profile.id
      where thread.id = v_escalation_thread_id
        and profile.id is distinct from p_counterparty_id
        and profile.role = 'admin' and profile.is_active
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
    ) into v_administration_assigned;
  end if;

  -- Retain the legacy timestamp as a derived compatibility signal. Pairwise
  -- authorization uses marketplace_chat_blocks exclusively.
  update public.marketplace_chat_participants
  set counterparty_blocked_at = (
    select max(block.blocked_at)
    from public.marketplace_chat_blocks as block
    where block.thread_id = p_thread_id and block.blocker_user_id = v_actor_id
  )
  where thread_id = p_thread_id and user_id = v_actor_id and removed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'conversationId', p_thread_id,
    'counterpartyId', p_counterparty_id,
    'blocked', p_blocked,
    'deliveryContinuityRequired', v_active_delivery,
    'supportEscalationConversationId', v_escalation_thread_id,
    'orderSupportAvailable', v_escalation_thread_id is not null,
    'administrationAssigned', v_administration_assigned,
    'safeCopy', case when v_escalation_thread_id is not null then
      'Direct messages are blocked. Order-support messages remain available.'
      else 'The participant block was updated.' end
  );
end;
$$;


-- Preserve the existing sync_marketplace_chat_driver_participant RPC contract and privilege grants.
create or replace function public.sync_marketplace_chat_driver_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_driver_id uuid := case when tg_op = 'DELETE' then null else new.driver_id end;
  v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  v_active boolean := false;
begin
  -- Authorization belongs to the assignment mutation that fired this trigger.
  -- Reading auth.uid() preserves its caller context for audit/debugging while
  -- direct EXECUTE is revoked below.
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := new.driver_id is not null
      and new.status in ('assigned', 'picked_up', 'issue')
      and exists (
        select 1 from public.profiles as profile
        where profile.id = new.driver_id
          and activity_private.driver_is_approved(profile.id) and profile.is_active
      );
  end if;
  update public.marketplace_chat_participants
  set removed_at = coalesce(removed_at, now())
  where thread_id in (
      select id from public.support_threads where order_id = v_order_id
    )
    and participant_role = 'driver'
    and (not v_active or user_id is distinct from v_driver_id)
    and removed_at is null;
  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_driver_id, 'driver'
    from public.support_threads as thread
    where thread.order_id = v_order_id
      and (
        thread.conversation_kind = 'order'
        or exists (
          select 1 from public.marketplace_chat_block_escalations as escalation
          where escalation.escalation_thread_id = thread.id
            and escalation.blocker_user_id = v_driver_id
        )
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


-- Preserve the existing offer_marketplace_delivery_to_driver_as_caller_base_180000 RPC contract and privilege grants.
create or replace function public.offer_marketplace_delivery_to_driver_as_caller_base_180000(
  p_order_id uuid,
  p_driver_id uuid,
  p_expires_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.marketplace_orders;
  v_assignment public.marketplace_delivery_assignments;
  v_driver_name text;
  v_offer public.marketplace_delivery_offers;
begin
  if v_actor_id is null or p_expires_minutes not between 1 and 15 then
    raise exception 'invalid_delivery_offer' using errcode = '22023';
  end if;
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if v_order is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not (public.is_marketplace_admin() or public.can_fulfill_store(v_order.store_id)) then
    raise exception 'fulfillment_access_required' using errcode = '42501';
  end if;
  if v_order.delivery_mode <> 'platform'
     or v_order.status not in ('preparing', 'ready_for_pickup') then
    raise exception 'order_not_offerable' using errcode = '55000';
  end if;
  select display_name into v_driver_name
  from public.profiles as profile
  join public.driver_profiles as driver on driver.profile_id = profile.id
  where profile.id = p_driver_id and activity_private.driver_is_approved(profile.id) and profile.is_active
    and driver.is_available and driver.active_until > now();
  if v_driver_name is null then raise exception 'driver_unavailable' using errcode = '22023'; end if;
  select * into v_assignment
  from public.marketplace_delivery_assignments where order_id = p_order_id for update;
  if v_assignment is null or v_assignment.status <> 'unassigned' then
    raise exception 'delivery_assignment_unavailable' using errcode = '55000';
  end if;
  insert into public.marketplace_delivery_offers (
    order_id, driver_id, driver_name_snapshot, expires_at, created_by
  ) values (
    p_order_id, p_driver_id, v_driver_name,
    now() + make_interval(mins => p_expires_minutes), v_actor_id
  ) on conflict (order_id, driver_id) do update
  set status = 'offered', expires_at = excluded.expires_at,
      responded_at = null, created_by = excluded.created_by, updated_at = now()
  where public.marketplace_delivery_offers.status in ('declined', 'expired', 'cancelled')
  returning * into v_offer;
  if v_offer is null then raise exception 'delivery_offer_already_open' using errcode = '55000'; end if;
  return jsonb_build_object(
    'id', v_offer.id, 'order_id', v_offer.order_id,
    'status', v_offer.status, 'expires_at', v_offer.expires_at
  );
end;
$$;


-- Preserve the existing renew_driver_availability RPC contract and privilege grants.
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
      and activity_private.driver_is_approved(profile.id)
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


-- Preserve the existing list_merchant_delivery_orders RPC contract and privilege grants.
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
  if v_profile is null or not public.has_my_activity_access('merchant') then
    raise exception 'merchant_access_required';
  end if;

  return query
  select delivery.*
  from public.delivery_orders as delivery
  where public.is_current_merchant_for(delivery.merchant_id)
  order by delivery.created_at desc
  limit p_limit;
end;
$$;


-- Preserve the existing get_delivery_order_private RPC contract and privilege grants.
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
  if v_profile is null or not (
    public.is_admin()
    or (
      public.is_current_merchant_for(v_order.merchant_id)
    )
    or (
      activity_private.driver_is_approved(v_profile.id)
      and v_order.assigned_driver_id = v_profile.id
      and v_order.status <> 'open'
    )
  ) then
    raise exception 'order_access_denied';
  end if;

  return v_order;
end;
$$;


-- Preserve the existing set_delivery_order_status_base_174408 RPC contract and privilege grants.
create or replace function public.set_delivery_order_status_base_174408(
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
  v_is_driver boolean;
  v_is_merchant boolean;
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
  v_is_driver := activity_private.driver_is_approved(v_profile.id)
    and v_order.assigned_driver_id = v_profile.id;
  v_is_merchant := public.is_current_merchant_for(v_order.merchant_id);
  if not (public.is_admin() or coalesce(v_is_driver,false) or coalesce(v_is_merchant,false)) then
    raise exception 'order_access_denied' using errcode='42501';
  end if;
  if p_next = 'picked_up'
     and v_order.status = 'assigned'
     and (v_is_driver or public.is_admin()) then
    update public.delivery_orders
    set status = p_next,
        picked_up_at = now()
    where id = p_order_id
    returning * into v_order;
    v_event := 'picked_up';
  elsif p_next = 'delivered'
     and v_order.status = 'picked_up'
     and (v_is_driver or public.is_admin()) then
    update public.delivery_orders
    set status = p_next,
        delivered_at = now()
    where id = p_order_id
    returning * into v_order;
    v_event := 'delivered';
  elsif p_next = 'open'
     and v_order.status = 'assigned'
     and v_is_driver then
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
     and (v_is_merchant or public.is_admin()) then
    update public.delivery_orders
    set status = p_next,
        cancelled_at = now(),
        cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_order_id
    returning * into v_order;
    v_event := 'cancelled';
  elsif p_next = 'issue'
     and v_order.status in ('assigned', 'picked_up')
     and (v_is_merchant or public.is_admin()) then
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


-- Preserve the existing delete_marketplace_media RPC contract and privilege grants.
create or replace function public.delete_marketplace_media(
  p_asset_id uuid,
  p_expected_asset_updated_at timestamptz,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets;
  v_authorized boolean;
  v_entity_updated_at timestamptz;
begin
  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;
  if v_asset is null or v_asset.status <> 'active' then
    raise exception 'media_asset_not_found' using errcode = 'P0002';
  end if;
  if v_asset.updated_at is distinct from p_expected_asset_updated_at then
    raise exception 'media_asset_version_conflict' using errcode = '40001';
  end if;
  if v_asset.entity_type not in ('product', 'store') then
    raise exception 'media_delete_requires_entity_specific_workflow' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.marketplace_delivery_assignments
    where proof_asset_id = v_asset.id
  ) then
    raise exception 'delivery_proof_is_immutable' using errcode = '55000';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or activity_private.store_is_approved(p_actor_id,v_asset.store_id,array['owner','manager','catalog']) into v_authorized;
  if not v_authorized then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  if v_asset.entity_type = 'product' then
    perform 1 from public.products where id = v_asset.entity_id for update;
    if exists (
      select 1 from public.products
      where id = v_asset.entity_id and status = 'active'
    ) and not exists (
      select 1 from public.product_images
      where product_id = v_asset.entity_id and media_asset_id <> v_asset.id
    ) then
      raise exception 'active_product_last_image_cannot_be_deleted' using errcode = '23514';
    end if;
    with remaining as materialized (
      select media_asset_id, alt_text, created_at, position
      from public.product_images
      where product_id = v_asset.entity_id and media_asset_id <> v_asset.id
      order by position
    ), removed as (
      delete from public.product_images where product_id = v_asset.entity_id
    )
    insert into public.product_images (
      product_id, media_asset_id, position, alt_text, created_at
    )
    select
      v_asset.entity_id,
      remaining.media_asset_id,
      (row_number() over (order by remaining.position) - 1)::smallint,
      remaining.alt_text,
      remaining.created_at
    from remaining;
    update public.products set updated_at = now() where id = v_asset.entity_id
    returning updated_at into v_entity_updated_at;
  elsif v_asset.entity_type = 'store' then
    perform 1 from public.stores where id = v_asset.store_id for update;
    with remaining as materialized (
      select media_asset_id, alt_text, kind, created_at, position
      from public.store_images
      where store_id = v_asset.store_id and media_asset_id <> v_asset.id
      order by position
    ), removed as (
      delete from public.store_images where store_id = v_asset.store_id
    )
    insert into public.store_images (
      store_id, media_asset_id, position, alt_text, kind, created_at
    )
    select
      v_asset.store_id,
      remaining.media_asset_id,
      (row_number() over (order by remaining.position) - 1)::smallint,
      remaining.alt_text,
      remaining.kind,
      remaining.created_at
    from remaining;
    update public.stores set updated_at = now() where id = v_asset.store_id
    returning updated_at into v_entity_updated_at;
  end if;

  update public.media_assets
  set status = 'deleted', deleted_at = now(), updated_at = now()
  where id = v_asset.id;
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'media.delete_requested:' || v_asset.id::text,
    'media.delete_requested',
    v_asset.entity_type::text,
    v_asset.entity_id::text,
    jsonb_build_object(
      'asset_id', v_asset.id,
      'bucket', v_asset.bucket,
      'object_key', v_asset.object_key
    )
  );
  return jsonb_build_object(
    'asset_id', v_asset.id,
    'deleted', true,
    'entity_updated_at', v_entity_updated_at
  );
end;
$$;


-- Preserve the existing reorder_marketplace_media RPC contract and privilege grants.
create or replace function public.reorder_marketplace_media(
  p_store_id uuid,
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid,
  p_ordered_asset_ids uuid[],
  p_expected_entity_updated_at timestamptz,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_existing_ids uuid[];
  v_requested_ids uuid[];
  v_authorized boolean;
begin
  if p_entity_type not in ('product', 'store') then
    raise exception 'unsupported_reorder_entity' using errcode = '22023';
  end if;
  if p_ordered_asset_ids is null
     or cardinality(p_ordered_asset_ids) > (case when p_entity_type = 'product' then 10 else 15 end)
     or cardinality(p_ordered_asset_ids) <> cardinality(array(
       select distinct asset_id from unnest(p_ordered_asset_ids) as asset_id
     )) then
    raise exception 'invalid_media_order' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or activity_private.store_is_approved(p_actor_id,p_store_id,array['owner','manager','catalog']) into v_authorized;
  if not v_authorized then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  if p_entity_type = 'product' then
    select updated_at into v_updated_at
    from public.products
    where id = p_entity_id and store_id = p_store_id
    for update;
    select array_agg(media_asset_id order by media_asset_id) into v_existing_ids
    from public.product_images where product_id = p_entity_id;
  else
    if p_entity_id <> p_store_id then
      raise exception 'store_entity_mismatch' using errcode = '22023';
    end if;
    select updated_at into v_updated_at
    from public.stores
    where id = p_store_id
    for update;
    select array_agg(media_asset_id order by media_asset_id) into v_existing_ids
    from public.store_images where store_id = p_store_id;
  end if;
  if v_updated_at is null then
    raise exception 'media_entity_not_found' using errcode = 'P0002';
  end if;
  if v_updated_at is distinct from p_expected_entity_updated_at then
    raise exception 'media_order_version_conflict' using errcode = '40001';
  end if;
  select array_agg(asset_id order by asset_id) into v_requested_ids
  from unnest(p_ordered_asset_ids) as asset_id;
  if v_existing_ids is distinct from v_requested_ids then
    raise exception 'media_order_asset_set_mismatch' using errcode = '22023';
  end if;

  if p_entity_type = 'product' then
    with deleted as (
      delete from public.product_images
      where product_id = p_entity_id
      returning media_asset_id, alt_text, created_at
    )
    insert into public.product_images (
      product_id, media_asset_id, position, alt_text, created_at
    )
    select
      p_entity_id,
      requested.asset_id,
      (requested.ordinality - 1)::smallint,
      deleted.alt_text,
      deleted.created_at
    from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
    join deleted on deleted.media_asset_id = requested.asset_id
    order by requested.ordinality;
    update public.products set updated_at = now() where id = p_entity_id
    returning updated_at into v_updated_at;
  else
    with deleted as (
      delete from public.store_images
      where store_id = p_store_id
      returning media_asset_id, alt_text, kind, created_at
    )
    insert into public.store_images (
      store_id, media_asset_id, position, alt_text, kind, created_at
    )
    select
      p_store_id,
      requested.asset_id,
      (requested.ordinality - 1)::smallint,
      deleted.alt_text,
      deleted.kind,
      deleted.created_at
    from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
    join deleted on deleted.media_asset_id = requested.asset_id
    order by requested.ordinality;
    update public.stores set updated_at = now() where id = p_store_id
    returning updated_at into v_updated_at;
  end if;

  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'media.reordered:' || gen_random_uuid()::text,
    'media.reordered',
    p_entity_type::text,
    p_entity_id::text,
    jsonb_build_object('asset_ids', p_ordered_asset_ids, 'updated_at', v_updated_at)
  );
  return jsonb_build_object(
    'entity_id', p_entity_id,
    'asset_ids', p_ordered_asset_ids,
    'updated_at', v_updated_at
  );
end;
$$;


-- Preserve the existing submit_store_for_review RPC contract and privilege grants.
create or replace function public.submit_store_for_review(
  p_store_id uuid,
  p_actor_id uuid
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
begin
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_store.status <> 'draft' then raise exception 'store_not_draft'; end if;
  if not (
    exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active)
    or activity_private.store_is_approved(p_actor_id,p_store_id,array['owner','manager'])
  ) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  update public.stores set status = 'pending_review', moderation_notes = null
  where id = p_store_id returning * into v_store;
  return v_store;
end;
$$;


-- Preserve the existing submit_product_for_review RPC contract and privilege grants.
create or replace function public.submit_product_for_review(
  p_product_id uuid,
  p_actor_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if v_product.status not in ('draft', 'rejected') then raise exception 'product_not_submittable'; end if;
  if nullif(trim(coalesce(v_product.description, '')), '') is null
     or not exists (
       select 1
       from public.product_images as image
       join public.media_assets as asset
         on asset.id = image.media_asset_id and asset.status = 'active'
       where image.product_id = p_product_id
     )
     or not exists (
       select 1
       from public.product_variants as variant
       join public.inventory_stock as stock on stock.variant_id = variant.id
       where variant.product_id = p_product_id and variant.is_active
     ) then
    raise exception 'product_content_incomplete' using errcode = '22023';
  end if;
  if not (
    exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active)
    or activity_private.store_is_approved(p_actor_id,v_product.store_id,array['owner','manager','catalog'])
  ) then raise exception 'catalog_access_required' using errcode = '42501'; end if;
  update public.products set status = 'pending_review', moderation_notes = null
  where id = p_product_id returning * into v_product;
  return v_product;
end;
$$;


-- Preserve the existing stage_product_revision RPC contract and privilege grants.
create or replace function public.stage_product_revision(
  p_product_id uuid,
  p_proposed_snapshot jsonb,
  p_image_snapshot jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.product_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_actor_name text;
  v_base jsonb;
  v_proposed jsonb;
  v_images jsonb;
  v_hash text;
  v_existing public.product_revisions;
  v_revision public.product_revisions;
  v_pending public.product_revisions;
  v_orphan public.media_assets;
begin
  if p_actor_id is null or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 160 then
    raise exception 'invalid_product_revision_request' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null or v_product.status <> 'active' then
    raise exception 'active_product_revision_required' using errcode = '55000';
  end if;
  if not public.is_marketplace_admin()
     and not activity_private.store_is_approved(p_actor_id,v_product.store_id,array['owner','manager','catalog']) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  v_base := public.catalog_sensitive_snapshot(v_product);
  v_proposed := coalesce(p_proposed_snapshot, v_base);
  v_images := coalesce(p_image_snapshot, public.catalog_live_image_snapshot(v_product.id));
  if jsonb_typeof(v_proposed) <> 'object' or jsonb_typeof(v_images) <> 'array'
     or jsonb_array_length(v_images) not between 1 and 10
     or char_length(trim(coalesce(v_proposed ->> 'name', ''))) not between 2 and 200
     or nullif(trim(coalesce(v_proposed ->> 'description', '')), '') is null
     or char_length(coalesce(v_proposed ->> 'description', '')) > 10000
     or (nullif(v_proposed ->> 'short_description', '') is not null and
       char_length(trim(v_proposed ->> 'short_description')) not between 2 and 240)
     or char_length(coalesce(v_proposed ->> 'brand', '')) > 120
     or coalesce(v_proposed ->> 'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(coalesce(v_proposed ->> 'product_key', '')) not between 1 and 80
     or coalesce(v_proposed ->> 'product_key', '') ~ '[[:cntrl:][:space:]]'
     or (nullif(v_proposed ->> 'category_id', '') is not null and not exists (
       select 1 from public.product_categories as category
       where category.id = (v_proposed ->> 'category_id')::uuid and category.is_active
     ))
     or (select count(*) from jsonb_array_elements(v_images)) <>
        (select count(distinct item.value ->> 'asset_id') from jsonb_array_elements(v_images) as item(value))
     or exists (
       select 1
       from jsonb_array_elements(v_images) with ordinality as item(value, ordinality)
       where (item.value ->> 'asset_id') is null
          or (item.value ->> 'asset_id') !~
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1)
             <> item.ordinality::integer - 1
          or char_length(coalesce(item.value ->> 'alt_text', '')) > 240
     )
     or exists (
       select 1
       from jsonb_array_elements(v_images) as item(value)
       left join public.media_assets as asset
         on asset.id = (item.value ->> 'asset_id')::uuid
        and asset.entity_type = 'product'
        and asset.entity_id = v_product.id
        and asset.store_id = v_product.store_id
        and asset.status = 'active'
       where asset.id is null
     ) then
    raise exception 'invalid_product_revision_snapshot' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    v_product.id::text || '|' || v_proposed::text || '|' || v_images::text,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_existing
  from public.product_revisions
  where product_id = v_product.id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.product_id <> v_product.id or v_existing.request_hash <> v_hash then
      raise exception 'product_revision_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_pending from public.product_revisions
  where product_id = v_product.id and status = 'pending';
  -- A staged-only asset removed by a later snapshot is not public catalog data
  -- and can be deleted immediately. Live assets remain until approval.
  if v_pending is not null then
    for v_orphan in
      select asset.*
      from jsonb_array_elements(v_pending.image_snapshot) as old_item(value)
      join public.media_assets as asset on asset.id = (old_item.value ->> 'asset_id')::uuid
      where asset.status = 'active'
        and not exists (
          select 1 from jsonb_array_elements(v_images) as new_item(value)
          where (new_item.value ->> 'asset_id')::uuid = asset.id
        )
        and not exists (
          select 1 from public.product_images as live_image
          where live_image.product_id = v_product.id and live_image.media_asset_id = asset.id
        )
      for update of asset
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_orphan.id;
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'media.delete_requested:' || v_orphan.id::text,
        'media.delete_requested', 'media_asset', v_orphan.id::text,
        jsonb_build_object('asset_id', v_orphan.id, 'bucket', v_orphan.bucket,
          'object_key', v_orphan.object_key, 'reason', 'superseded_product_revision')
      ) on conflict (event_key) do nothing;
    end loop;
  end if;

  -- Every snapshot is immutable. A newer merchant action closes the preceding
  -- pending snapshot and inserts a new complete snapshot.
  update public.product_revisions
  set status = 'rejected', reviewed_at = now(), rejected_at = now(),
      review_notes = 'superseded_by_newer_revision'
  where product_id = v_product.id and status = 'pending';

  select display_name into v_actor_name from public.profiles where id = p_actor_id;
  insert into public.product_revisions (
    product_id, store_id, base_snapshot, proposed_snapshot, image_snapshot,
    request_hash, idempotency_key, created_by, created_by_name_snapshot
  ) values (
    v_product.id, v_product.store_id, v_base, v_proposed, v_images,
    v_hash, p_idempotency_key, p_actor_id, v_actor_name
  ) returning * into v_revision;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    p_actor_id, 'product.revision_submitted',
    'product_revision', v_revision.id::text,
    jsonb_build_object('product_id', v_product.id, 'request_hash', v_hash),
    jsonb_build_object('actor_name_snapshot', v_actor_name)
  );
  return v_revision;
end;
$$;


-- Preserve the existing sync_marketplace_chat_store_participant RPC contract and privilege grants.
create or replace function public.sync_marketplace_chat_store_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_store_id uuid := case when tg_op = 'DELETE' then old.store_id else new.store_id end;
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_active boolean := false;
begin
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := new.is_active
      and new.role in ('owner', 'manager', 'fulfillment')
      and activity_private.store_is_approved(v_user_id,v_store_id,array['owner','manager','fulfillment']);
  end if;
  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_user_id, 'merchant'
    from public.support_threads as thread
    where thread.store_id = v_store_id
      and not exists (
        select 1
        from public.marketplace_chat_block_escalations as escalation
        where escalation.escalation_thread_id = thread.id
          and escalation.blocked_user_id = v_user_id
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  else
    update public.marketplace_chat_participants
    set removed_at = coalesce(removed_at, now())
    where thread_id in (
        select id from public.support_threads where store_id = v_store_id
      )
      and user_id = v_user_id and participant_role = 'merchant' and removed_at is null;
  end if;

  -- A mapped blocked counterparty never regains the substitute channel through
  -- a later store-role insert, update, or reactivation.
  update public.marketplace_chat_participants as participant
  set removed_at = coalesce(participant.removed_at, now())
  where participant.user_id = v_user_id
    and participant.participant_role = 'merchant'
    and participant.removed_at is null
    and exists (
      select 1
      from public.marketplace_chat_block_escalations as escalation
      where escalation.escalation_thread_id = participant.thread_id
        and escalation.blocked_user_id = v_user_id
    );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


-- Preserve the existing claim_my_legacy_place_media RPC contract and privilege grants.
create or replace function public.claim_my_legacy_place_media(
  p_upload_ids uuid[],
  p_place_id uuid,
  p_retained_urls text[] default '{}'::text[]
)
returns table (upload_id uuid, public_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_place public.places;
  v_requested_count integer;
  v_ready_count integer;
  v_urls text[];
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_upload_ids is null or cardinality(p_upload_ids) not between 0 and 15 then
    raise exception 'invalid_upload_ids' using errcode = '22023';
  end if;
  select count(distinct item) into v_requested_count from unnest(p_upload_ids) as item;
  if v_requested_count <> cardinality(p_upload_ids) then
    raise exception 'duplicate_upload_ids' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles as profile
  where profile.id = v_uid and profile.is_active
  for share;
  if v_profile is null or v_profile.must_change_password then
    raise exception 'place_media_access_denied' using errcode = '42501';
  end if;
  if v_profile.role = 'admin'
     and coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  select * into v_place
  from public.places as place
  where place.id = p_place_id
  for update;
  if v_place is null then
    raise exception 'place_not_found' using errcode = 'P0002';
  end if;

  if not public.is_admin() and not exists (
    select 1
    from public.merchant_branches as branch
    where public.is_current_merchant_for(branch.merchant_id)
      and branch.place_id = p_place_id
      and branch.is_active
  ) then
    raise exception 'place_media_access_denied' using errcode = '42501';
  end if;

  if p_retained_urls is null
     or cardinality(p_retained_urls) <> (
       select count(distinct retained) from unnest(p_retained_urls) as retained
     )
     or exists (
       select 1 from unnest(p_retained_urls) as retained
       where not (retained = any(coalesce(v_place.images, '{}'::text[])))
     ) then
    raise exception 'invalid_retained_place_media' using errcode = '22023';
  end if;

  perform 1
  from public.legacy_media_uploads as upload
  where upload.id = any(p_upload_ids)
  order by upload.id
  for update;

  select count(*) into v_ready_count
  from public.legacy_media_uploads as upload
  where upload.id = any(p_upload_ids)
    and upload.owner_id = v_uid
    and upload.purpose = 'place'
    and upload.status = 'ready'
    and upload.expires_at > now()
    and (
      (v_profile.role = 'admin' and upload.folder = 'requests' and upload.merchant_id is null)
      or (
        upload.folder = 'merchant'
        and public.is_current_merchant_for(upload.merchant_id)
        and exists(select 1 from public.merchant_branches b where b.place_id=p_place_id
          and b.merchant_id=upload.merchant_id and b.is_active)
      )
    );
  if v_ready_count <> v_requested_count then
    raise exception 'place_media_upload_not_claimable' using errcode = '42501';
  end if;

  select coalesce(array_agg(upload.public_url order by requested.ordinality), '{}'::text[]) into v_urls
  from unnest(p_upload_ids) with ordinality as requested(id, ordinality)
  join public.legacy_media_uploads as upload on upload.id = requested.id;

  if cardinality(p_retained_urls) + cardinality(v_urls) > 15 then
    raise exception 'place_media_limit_reached' using errcode = '23514';
  end if;

  update public.legacy_media_uploads as upload
  set status = 'claimed',
      entity_id = p_place_id,
      claimed_at = now(),
      updated_at = now()
  where upload.id = any(p_upload_ids);

  with removed as (
    update public.legacy_media_uploads as upload
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where upload.purpose = 'place'
      and upload.entity_id = p_place_id
      and upload.status = 'claimed'
      and not (upload.public_url = any(p_retained_urls))
      and upload.id <> all(p_upload_ids)
    returning upload.id, upload.bucket, upload.object_key
  )
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  )
  select
    'legacy.place.delete:' || removed.id::text,
    'media.delete_requested', 'place', p_place_id::text,
    jsonb_build_object('bucket', removed.bucket, 'object_key', removed.object_key)
  from removed
  on conflict (event_key) do nothing;

  update public.places
  set images = array(
    select deduplicated.item
    from (
      select value.item, min(value.ordinality) as first_position
      from unnest(p_retained_urls || v_urls)
        with ordinality as value(item, ordinality)
      group by value.item
    ) as deduplicated
    order by deduplicated.first_position
  )
  where id = p_place_id;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_uid, 'legacy_place_media_claimed', 'place', p_place_id::text,
    jsonb_build_object('upload_count', v_requested_count)
  );

  return query
  select upload.id, upload.public_url
  from unnest(p_upload_ids) with ordinality as requested(id, ordinality)
  join public.legacy_media_uploads as upload on upload.id = requested.id
  order by requested.ordinality;
end;
$$;


-- Preserve the existing claim_delivery_order RPC contract and privilege grants.
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
  where activity_private.merchant_is_approved(profile.id,v_order.merchant_id);

  return v_order;
end;
$$;


-- Preserve the existing update_driver_public_profile RPC contract and privilege grants.
create or replace function public.update_driver_public_profile(
  p_display_name text,
  p_contact_phone text,
  p_whatsapp text,
  p_vehicle_type text
)
returns public.driver_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_display_name, ''));
  v_contact text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_vehicle text := nullif(trim(coalesce(p_vehicle_type, '')), '');
  v_driver public.driver_profiles;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and activity_private.driver_is_approved((select auth.uid()))
      and is_active
  ) then
    raise exception 'driver_access_required';
  end if;
  if char_length(v_name) not between 2 and 100 then
    raise exception 'invalid_display_name';
  end if;
  if v_contact !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_contact_phone';
  end if;
  if v_whatsapp <> '' and v_whatsapp !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_whatsapp';
  end if;
  if char_length(coalesce(v_vehicle, '')) > 60 then
    raise exception 'invalid_vehicle_type';
  end if;

  update public.profiles
  set display_name = v_name
  where id = auth.uid();

  update public.driver_profiles
  set contact_phone = v_contact,
      whatsapp = nullif(v_whatsapp, ''),
      vehicle_type = v_vehicle
  where profile_id = auth.uid()
  returning * into v_driver;

  if v_driver is null then
    raise exception 'driver_profile_missing';
  end if;

  update public.drivers
  set name = v_name,
      phone = v_contact,
      whatsapp = coalesce(nullif(v_whatsapp, ''), v_contact),
      vehicle_type = v_vehicle
  where id = v_driver.legacy_driver_id;

  return v_driver;
end;
$$;

-- Driver participation in order reads is independently revocable.
create or replace function public.can_read_marketplace_order(p_order_id uuid,p_store_id uuid,p_customer_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_marketplace_admin() or public.can_fulfill_store(p_store_id)
   or exists(select 1 from public.marketplace_customers c where c.id=p_customer_id
     and c.auth_user_id=(select auth.uid()) and c.is_active)
   or (activity_private.driver_is_approved((select auth.uid()))
     and exists(select 1 from public.marketplace_delivery_assignments a
       where a.order_id=p_order_id and a.driver_id=(select auth.uid())));
$$;

-- Remove the legacy broad profile-disclosure policy. Available drivers are
-- returned through the existing limited RPC, not full profile rows.
drop policy if exists "merchants see active driver identities" on public.profiles;

commit;
