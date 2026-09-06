-- Close AAL1 admin fallbacks in authenticated SECURITY DEFINER entrypoints.
--
-- The internal actor-aware routines remain service-role only. Several of them
-- intentionally support more than one actor kind, but their historical admin
-- branch reads profiles.role directly. These wrappers preserve the legitimate
-- customer/merchant/driver path and require the central AAL2 predicate only
-- when the operation would otherwise fall through to administrator access.

begin;

create or replace function public.require_marketplace_admin_fallback(
  p_non_admin_authorized boolean
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(p_non_admin_authorized, false) then
    return;
  end if;
  if public.is_marketplace_admin() then
    return;
  end if;
  -- Intercept only the historical raw-admin branch. Other callers continue
  -- into the base routine so they retain its action-specific denial/error.
  if exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin' and profile.is_active
  ) then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.has_marketplace_store_role_without_admin(
  p_store_id uuid,
  p_actor_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_id is not null and (
    exists (
      select 1
      from public.store_memberships as membership
      where membership.store_id = p_store_id
        and membership.user_id = p_actor_id
        and membership.is_active
        and membership.role::text = any(p_roles)
    )
    or exists (
      select 1
      from public.stores as store
      join public.profiles as profile
        on profile.merchant_id = store.merchant_id
      where store.id = p_store_id
        and profile.id = p_actor_id
        and profile.role = 'merchant'
        and profile.is_active
    )
  );
$$;

revoke all on function public.require_marketplace_admin_fallback(boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.has_marketplace_store_role_without_admin(uuid, uuid, text[])
  from public, anon, authenticated, service_role;

-- Legacy delivery RPC: a merchant or driver keeps the same transition path;
-- only a profile acting as administrator must have an AAL2 JWT.
alter function public.set_delivery_order_status(uuid, public.delivery_order_status, text)
  rename to set_delivery_order_status_base_174408;
revoke all on function public.set_delivery_order_status_base_174408(
  uuid, public.delivery_order_status, text
) from public, anon, authenticated, service_role;

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
declare v_profile public.profiles;
begin
  select * into v_profile from public.current_profile();
  if v_profile is not null and v_profile.role = 'admin'
     and not public.is_admin() then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;
  return public.set_delivery_order_status_base_174408(p_order_id, p_next, p_reason);
end;
$$;

-- Private media: ownership/order participation is the non-admin path.
alter function public.authorize_my_private_marketplace_media(uuid)
  rename to authorize_my_private_marketplace_media_base_174408;
revoke all on function public.authorize_my_private_marketplace_media_base_174408(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.authorize_my_private_marketplace_media(p_asset_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_asset public.media_assets;
  v_non_admin boolean := false;
begin
  select * into v_asset
  from public.media_assets
  where id = p_asset_id and status = 'active' and visibility = 'private';
  if v_asset is null then
    return public.authorize_my_private_marketplace_media_base_174408(p_asset_id);
  end if;
  if v_asset.entity_type = 'delivery_proof' then
    select exists (
      select 1
      from public.marketplace_orders as marketplace_order
      where marketplace_order.id = v_asset.entity_id
        and (
          exists (
            select 1 from public.marketplace_customers as customer
            where customer.id = marketplace_order.customer_id
              and customer.auth_user_id = v_actor and customer.is_active
          )
          or exists (
            select 1 from public.marketplace_delivery_assignments as assignment
            where assignment.order_id = marketplace_order.id
              and assignment.driver_id = v_actor
          )
          or exists (
            select 1 from public.store_memberships as membership
            where membership.store_id = marketplace_order.store_id
              and membership.user_id = v_actor and membership.is_active
              and membership.role::text = any(array['owner','manager','fulfillment'])
          )
        )
    ) into v_non_admin;
  else
    v_non_admin := v_asset.owner_id is not distinct from v_actor and v_actor is not null;
  end if;
  perform public.require_marketplace_admin_fallback(v_non_admin);
  return public.authorize_my_private_marketplace_media_base_174408(p_asset_id);
end;
$$;

-- Catalog/store media and initial-submission wrappers.
alter function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) rename to reorder_my_marketplace_media_base_174408;
revoke all on function public.reorder_my_marketplace_media_base_174408(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.reorder_my_marketplace_media(
  p_store_id uuid,
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid,
  p_ordered_asset_ids uuid[],
  p_expected_entity_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      p_store_id, (select auth.uid()), array['owner','manager','catalog']
    )
  );
  return public.reorder_my_marketplace_media_base_174408(
    p_store_id, p_entity_type, p_entity_id, p_ordered_asset_ids,
    p_expected_entity_updated_at
  );
end;
$$;

alter function public.delete_my_marketplace_media(uuid, timestamptz)
  rename to delete_my_marketplace_media_base_174408;
revoke all on function public.delete_my_marketplace_media_base_174408(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.delete_my_marketplace_media(
  p_asset_id uuid,
  p_expected_asset_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_store_id uuid;
begin
  select asset.store_id into v_store_id
  from public.media_assets as asset
  where asset.id = p_asset_id;
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      v_store_id, (select auth.uid()), array['owner','manager','catalog']
    )
  );
  return public.delete_my_marketplace_media_base_174408(
    p_asset_id, p_expected_asset_updated_at
  );
end;
$$;

alter function public.submit_my_store_for_review(uuid)
  rename to submit_my_store_for_review_base_174408;
revoke all on function public.submit_my_store_for_review_base_174408(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.submit_my_store_for_review(p_store_id uuid)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      p_store_id, (select auth.uid()), array['owner','manager']
    )
  );
  return public.submit_my_store_for_review_base_174408(p_store_id);
end;
$$;

alter function public.submit_my_product_for_review(uuid)
  rename to submit_my_product_for_review_base_174408;
revoke all on function public.submit_my_product_for_review_base_174408(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.submit_my_product_for_review(p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v_store_id uuid;
begin
  select product.store_id into v_store_id
  from public.products as product where product.id = p_product_id;
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      v_store_id, (select auth.uid()), array['owner','manager','catalog']
    )
  );
  return public.submit_my_product_for_review_base_174408(p_product_id);
end;
$$;

-- These entrypoints are administrator-only, including their idempotent paths.
alter function public.moderate_store_as_admin(uuid, boolean, text)
  rename to moderate_store_as_admin_base_174408;
revoke all on function public.moderate_store_as_admin_base_174408(uuid, boolean, text)
  from public, anon, authenticated, service_role;

create or replace function public.moderate_store_as_admin(
  p_store_id uuid, p_approve boolean, p_notes text default null
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin_fallback(false);
  return public.moderate_store_as_admin_base_174408(p_store_id, p_approve, p_notes);
end;
$$;

alter function public.moderate_product_as_admin(uuid, boolean, text)
  rename to moderate_product_as_admin_base_174408;
revoke all on function public.moderate_product_as_admin_base_174408(uuid, boolean, text)
  from public, anon, authenticated, service_role;

create or replace function public.moderate_product_as_admin(
  p_product_id uuid, p_approve boolean, p_notes text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin_fallback(false);
  return public.moderate_product_as_admin_base_174408(p_product_id, p_approve, p_notes);
end;
$$;

-- Fulfilment operations retain their store-staff/driver branches.
alter function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid)
  rename to assign_marketplace_delivery_driver_as_caller_base_174408;
revoke all on function public.assign_marketplace_delivery_driver_as_caller_base_174408(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.assign_marketplace_delivery_driver_as_caller(
  p_order_id uuid, p_driver_id uuid
)
returns public.marketplace_delivery_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare v_store_id uuid;
begin
  select marketplace_order.store_id into v_store_id
  from public.marketplace_orders as marketplace_order
  where marketplace_order.id = p_order_id;
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      v_store_id, (select auth.uid()), array['owner','manager','fulfillment']
    )
  );
  return public.assign_marketplace_delivery_driver_as_caller_base_174408(
    p_order_id, p_driver_id
  );
end;
$$;

alter function public.attach_my_marketplace_delivery_proof(uuid, uuid)
  rename to attach_my_marketplace_delivery_proof_base_174408;
revoke all on function public.attach_my_marketplace_delivery_proof_base_174408(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.attach_my_marketplace_delivery_proof(
  p_order_id uuid, p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_is_driver boolean;
begin
  select exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    where assignment.order_id = p_order_id
      and assignment.driver_id = (select auth.uid())
  ) into v_is_driver;
  perform public.require_marketplace_admin_fallback(v_is_driver);
  return public.attach_my_marketplace_delivery_proof_base_174408(p_order_id, p_asset_id);
end;
$$;

-- Preserve the exact non-admin transition matrix before invoking the legacy
-- actor-aware core, whose admin boolean predates AAL2 enforcement.
alter function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) rename to set_my_marketplace_order_status_base_174408;
revoke all on function public.set_my_marketplace_order_status_base_174408(
  uuid, public.marketplace_order_status, text, public.egp_amount
) from public, anon, authenticated, service_role;

create or replace function public.set_my_marketplace_order_status(
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
      and profile.role = 'driver' and profile.is_active
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

-- A driver may submit only their own reconciliation. Review is admin-only.
alter function public.submit_my_cash_reconciliation_batch(uuid)
  rename to submit_my_cash_reconciliation_batch_base_174408;
revoke all on function public.submit_my_cash_reconciliation_batch_base_174408(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.submit_my_cash_reconciliation_batch(p_batch_id uuid)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
declare v_is_driver boolean;
begin
  select exists (
    select 1
    from public.cash_reconciliation_batches as batch
    where batch.id = p_batch_id and batch.driver_id = (select auth.uid())
  ) into v_is_driver;
  perform public.require_marketplace_admin_fallback(v_is_driver);
  return public.submit_my_cash_reconciliation_batch_base_174408(p_batch_id);
end;
$$;

alter function public.review_cash_reconciliation_batch_as_admin(uuid, boolean, text)
  rename to review_cash_reconciliation_batch_as_admin_base_174408;
revoke all on function public.review_cash_reconciliation_batch_as_admin_base_174408(
  uuid, boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.review_cash_reconciliation_batch_as_admin(
  p_batch_id uuid, p_accept boolean, p_notes text default null
)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_marketplace_admin_fallback(false);
  return public.review_cash_reconciliation_batch_as_admin_base_174408(
    p_batch_id, p_accept, p_notes
  );
end;
$$;

-- Every new public function starts with no PUBLIC execution privilege in this
-- project, but keep the boundary explicit and self-contained for restored DBs.
revoke all on function public.set_delivery_order_status(uuid, public.delivery_order_status, text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_my_private_marketplace_media(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.delete_my_marketplace_media(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_my_store_for_review(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_my_product_for_review(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.moderate_store_as_admin(uuid, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.moderate_product_as_admin(uuid, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.attach_my_marketplace_delivery_proof(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) from public, anon, authenticated, service_role;
revoke all on function public.submit_my_cash_reconciliation_batch(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.review_cash_reconciliation_batch_as_admin(uuid, boolean, text)
  from public, anon, authenticated, service_role;

grant execute on function public.set_delivery_order_status(uuid, public.delivery_order_status, text)
  to authenticated, service_role;
grant execute on function public.authorize_my_private_marketplace_media(uuid)
  to authenticated, service_role;
grant execute on function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) to authenticated, service_role;
grant execute on function public.delete_my_marketplace_media(uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.submit_my_store_for_review(uuid)
  to authenticated, service_role;
grant execute on function public.submit_my_product_for_review(uuid)
  to authenticated, service_role;
grant execute on function public.moderate_store_as_admin(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.moderate_product_as_admin(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.attach_my_marketplace_delivery_proof(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) to authenticated, service_role;
grant execute on function public.submit_my_cash_reconciliation_batch(uuid)
  to authenticated, service_role;
grant execute on function public.review_cash_reconciliation_batch_as_admin(uuid, boolean, text)
  to authenticated, service_role;

commit;
