begin;

-- branch_delivery_zones has the composite primary key (branch_id, zone_id,
-- delivery_mode), not an id column. The old trigger failed every order insert
-- at query planning time, including compatibility delivery-zone fallbacks.
create or replace function public.assign_marketplace_order_branch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_branch public.store_branches; v_config public.branch_delivery_zones;
  v_legacy public.store_delivery_zones; v_fee bigint;
  v_minimum bigint; v_free bigint; v_eta_min integer; v_eta_max integer;
  v_branch_id uuid;
begin
  perform 1 from public.stores where id = new.store_id for key share;
  select branch.id into v_branch_id
  from public.store_branches as branch
  join public.branch_delivery_zones as config on config.branch_id = branch.id
  where branch.store_id = new.store_id and branch.status = 'active'
    and new.delivery_mode = any(branch.delivery_modes)
    and config.zone_id = new.delivery_zone_id
    and config.delivery_mode = new.delivery_mode and config.is_active
  order by branch.is_default desc, branch.sort_order, branch.id
  limit 1 for share of branch, config;

  if v_branch_id is not null then
    select * into strict v_branch from public.store_branches where id = v_branch_id;
    select * into strict v_config from public.branch_delivery_zones
    where branch_id = v_branch_id and zone_id = new.delivery_zone_id
      and delivery_mode = new.delivery_mode;
  end if;

  if v_branch.id is null then
    select * into v_branch from public.store_branches
    where store_id = new.store_id and status = 'active' and is_default
      and new.delivery_mode = any(delivery_modes)
    order by sort_order, id limit 1 for share;
    select * into v_legacy from public.store_delivery_zones
    where store_id = new.store_id and zone_id = new.delivery_zone_id
      and delivery_mode = new.delivery_mode and is_active for share;
    if v_branch.id is null or v_legacy.store_id is null then
      raise exception 'branch_delivery_unavailable:%', new.store_id using errcode = '22023'; end if;
    v_fee := v_legacy.fee; v_minimum := v_legacy.minimum_order;
    v_free := v_legacy.free_delivery_threshold;
    v_eta_min := v_legacy.estimated_minutes_min; v_eta_max := v_legacy.estimated_minutes_max;
  else
    v_fee := v_config.fee; v_minimum := v_config.minimum_order;
    v_free := v_config.free_delivery_threshold;
    v_eta_min := v_config.estimated_minutes_min; v_eta_max := v_config.estimated_minutes_max;
  end if;
  if new.subtotal < v_minimum then
    raise exception 'branch_minimum_order_not_met:%', v_branch.id using errcode = '22023'; end if;
  if v_free is not null and new.subtotal >= v_free then v_fee := 0; end if;
  new.branch_id := v_branch.id;
  new.delivery_fee := v_fee;
  new.grand_total := new.subtotal - new.merchant_discount_total
    - new.platform_discount_total + v_fee;
  new.branch_snapshot := jsonb_build_object(
    'id', v_branch.id, 'code', v_branch.code, 'name', v_branch.name,
    'city', v_branch.city, 'area', v_branch.area, 'address_text', v_branch.address_text,
    'delivery_zone_id', new.delivery_zone_id, 'delivery_mode', new.delivery_mode,
    'delivery_fee_piastres', v_fee, 'estimated_minutes_min', v_eta_min,
    'estimated_minutes_max', v_eta_max, 'inventory_scope', 'store'
  );
  return new;
end;
$$;

-- This remains trigger-only for public clients; do not broaden execution grants.
revoke all on function public.assign_marketplace_order_branch() from public,anon,authenticated;
grant execute on function public.assign_marketplace_order_branch() to service_role;

commit;
