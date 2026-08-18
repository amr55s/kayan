begin;

do $$ begin
  create type public.marketplace_branch_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

insert into public.marketplace_runtime_settings (key, value)
values ('fulfillment_inventory_scope_v1', jsonb_build_object(
  'version', 1,
  'inventory_scope', 'store',
  'branch_selection', 'default_then_sort_then_id',
  'client_branch_selection', false
))
on conflict (key) do update set value = excluded.value, updated_at = now();

create table public.store_branches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  city text check (city is null or char_length(trim(city)) between 2 and 120),
  area text check (area is null or char_length(trim(area)) between 2 and 120),
  address_text text not null check (char_length(trim(address_text)) between 2 and 500),
  status public.marketplace_branch_status not null default 'active',
  delivery_modes public.marketplace_delivery_mode[] not null,
  is_default boolean not null default false,
  sort_order integer not null default 0 check (sort_order between -10000 and 10000),
  version bigint not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  unique (store_id, code),
  check (cardinality(delivery_modes) between 1 and 2),
  check (delivery_modes <@ array['platform','self']::public.marketplace_delivery_mode[]),
  check (status = 'active' or not is_default)
);
create unique index store_branches_one_default_idx
  on public.store_branches (store_id) where is_default;
create index store_branches_fulfillment_idx
  on public.store_branches (store_id, status, is_default desc, sort_order, id);

create table public.branch_delivery_zones (
  branch_id uuid not null references public.store_branches(id) on delete cascade,
  zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  delivery_mode public.marketplace_delivery_mode not null
    check (delivery_mode in ('platform', 'self')),
  fee public.egp_amount not null,
  free_delivery_threshold public.egp_amount,
  minimum_order public.egp_amount not null default 0,
  estimated_minutes_min integer not null check (estimated_minutes_min between 1 and 10080),
  estimated_minutes_max integer not null check (
    estimated_minutes_max between estimated_minutes_min and 10080
  ),
  is_active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, zone_id, delivery_mode)
);
create index branch_delivery_zones_checkout_idx
  on public.branch_delivery_zones (zone_id, delivery_mode, branch_id)
  where is_active;

alter table public.store_delivery_zones
  add column selected_branch_id uuid;
alter table public.store_delivery_zones
  add constraint store_delivery_zones_selected_branch_store_fk
  foreign key (selected_branch_id, store_id)
  references public.store_branches(id, store_id) on delete cascade;

insert into public.store_branches (
  store_id, code, name, city, area, address_text, status,
  delivery_modes, is_default, sort_order, created_by
)
select store.id, 'main', left(store.name || ' - Main', 120), store.city, store.area,
  coalesce(nullif(trim(store.address_text), ''), 'Address pending'), 'active',
  case when store.delivery_mode = 'flexible'
    then array['platform','self']::public.marketplace_delivery_mode[]
    else array[store.delivery_mode]::public.marketplace_delivery_mode[] end,
  true, 0, store.created_by
from public.stores as store
on conflict (store_id, code) do nothing;

insert into public.branch_delivery_zones (
  branch_id, zone_id, delivery_mode, fee, free_delivery_threshold,
  minimum_order, estimated_minutes_min, estimated_minutes_max, is_active
)
select branch.id, config.zone_id, config.delivery_mode, config.fee,
  config.free_delivery_threshold, config.minimum_order,
  coalesce(config.estimated_minutes_min, 30),
  greatest(coalesce(config.estimated_minutes_max, 60), coalesce(config.estimated_minutes_min, 30)),
  config.is_active
from public.store_delivery_zones as config
join public.store_branches as branch
  on branch.store_id = config.store_id and branch.is_default
on conflict (branch_id, zone_id, delivery_mode) do nothing;

update public.store_delivery_zones as config
set selected_branch_id = branch.id
from public.store_branches as branch
where branch.store_id = config.store_id and branch.is_default
  and config.selected_branch_id is null;

create or replace function public.create_default_marketplace_store_branch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.store_branches (
    store_id, code, name, city, area, address_text, status,
    delivery_modes, is_default, sort_order, created_by
  ) values (
    new.id, 'main', left(new.name || ' - Main', 120), new.city, new.area,
    coalesce(nullif(trim(new.address_text), ''), 'Address pending'), 'active',
    case when new.delivery_mode = 'flexible'
      then array['platform','self']::public.marketplace_delivery_mode[]
      else array[new.delivery_mode]::public.marketplace_delivery_mode[] end,
    true, 0, new.created_by
  );
  return new;
end;
$$;
create trigger stores_create_default_branch
after insert on public.stores for each row
execute function public.create_default_marketplace_store_branch();

create or replace function public.sync_store_delivery_zone_from_branches(
  p_store_id uuid, p_zone_id uuid, p_delivery_mode public.marketplace_delivery_mode
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_selected record;
begin
  select branch.id as selected_branch_id, config.fee,
    config.free_delivery_threshold, config.minimum_order,
    config.estimated_minutes_min, config.estimated_minutes_max
  into v_selected
  from public.store_branches as branch
  join public.branch_delivery_zones as config on config.branch_id = branch.id
  where branch.store_id = p_store_id and branch.status = 'active'
    and p_delivery_mode = any(branch.delivery_modes)
    and config.zone_id = p_zone_id and config.delivery_mode = p_delivery_mode
    and config.is_active
  order by branch.is_default desc, branch.sort_order, branch.id
  limit 1;

  if v_selected.selected_branch_id is null then
    update public.store_delivery_zones
    set is_active = false, selected_branch_id = null, updated_at = now()
    where store_id = p_store_id and zone_id = p_zone_id
      and delivery_mode = p_delivery_mode and selected_branch_id is not null;
    return;
  end if;

  insert into public.store_delivery_zones (
    store_id, zone_id, delivery_mode, fee, free_delivery_threshold,
    minimum_order, estimated_minutes_min, estimated_minutes_max,
    is_active, selected_branch_id
  ) values (
    p_store_id, p_zone_id, p_delivery_mode, v_selected.fee,
    v_selected.free_delivery_threshold, v_selected.minimum_order,
    v_selected.estimated_minutes_min, v_selected.estimated_minutes_max,
    true, v_selected.selected_branch_id
  ) on conflict (store_id, zone_id, delivery_mode) do update set
    fee = excluded.fee,
    free_delivery_threshold = excluded.free_delivery_threshold,
    minimum_order = excluded.minimum_order,
    estimated_minutes_min = excluded.estimated_minutes_min,
    estimated_minutes_max = excluded.estimated_minutes_max,
    is_active = true,
    selected_branch_id = excluded.selected_branch_id,
    updated_at = now();
end;
$$;

create or replace function public.sync_all_store_delivery_zones_from_branches(p_store_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pair record;
begin
  update public.stores set delivery_mode = case
    when exists (select 1 from public.store_branches as branch
      where branch.store_id = p_store_id and branch.status = 'active'
        and 'platform' = any(branch.delivery_modes))
     and exists (select 1 from public.store_branches as branch
      where branch.store_id = p_store_id and branch.status = 'active'
        and 'self' = any(branch.delivery_modes)) then 'flexible'::public.marketplace_delivery_mode
    when exists (select 1 from public.store_branches as branch
      where branch.store_id = p_store_id and branch.status = 'active'
        and 'self' = any(branch.delivery_modes)) then 'self'::public.marketplace_delivery_mode
    else 'platform'::public.marketplace_delivery_mode end,
    updated_at = now()
  where id = p_store_id;
  for v_pair in
    select distinct source.zone_id, source.delivery_mode
    from (
      select config.zone_id, config.delivery_mode
      from public.branch_delivery_zones as config
      join public.store_branches as branch on branch.id = config.branch_id
      where branch.store_id = p_store_id
      union
      select legacy.zone_id, legacy.delivery_mode
      from public.store_delivery_zones as legacy where legacy.store_id = p_store_id
    ) as source
    order by source.zone_id, source.delivery_mode
  loop
    perform public.sync_store_delivery_zone_from_branches(
      p_store_id, v_pair.zone_id, v_pair.delivery_mode);
  end loop;
end;
$$;

create or replace function public.list_my_store_branches(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', branch.id, 'store_id', branch.store_id, 'code', branch.code,
    'name', branch.name, 'city', branch.city, 'area', branch.area,
    'address_text', branch.address_text, 'status', branch.status,
    'delivery_modes', branch.delivery_modes, 'is_default', branch.is_default,
    'sort_order', branch.sort_order, 'version', branch.version,
    'updated_at', branch.updated_at,
    'zones', coalesce((select jsonb_agg(jsonb_build_object(
      'zone_id', zone.id, 'code', zone.code, 'name_ar', zone.name_ar,
      'city', zone.city, 'zone_is_active', zone.is_active,
      'delivery_mode', config.delivery_mode, 'fee_piastres', config.fee,
      'free_delivery_threshold_piastres', config.free_delivery_threshold,
      'minimum_order_piastres', config.minimum_order,
      'estimated_minutes_min', config.estimated_minutes_min,
      'estimated_minutes_max', config.estimated_minutes_max,
      'is_active', config.is_active, 'version', config.version,
      'updated_at', config.updated_at
    ) order by zone.sort_order, zone.id)
    from public.branch_delivery_zones as config
    join public.delivery_zones as zone on zone.id = config.zone_id
    where config.branch_id = branch.id), '[]'::jsonb)
  ) order by branch.is_default desc, branch.sort_order, branch.id)
  from public.store_branches as branch where branch.store_id = p_store_id), '[]'::jsonb);
end;
$$;

create or replace function public.save_my_store_branch(
  p_store_id uuid, p_branch_id uuid, p_code text, p_name text,
  p_city text, p_area text, p_address_text text,
  p_delivery_modes public.marketplace_delivery_mode[],
  p_status public.marketplace_branch_status, p_is_default boolean,
  p_sort_order integer, p_expected_version bigint, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_branch public.store_branches;
  v_hash text; v_replayed boolean; v_response jsonb; v_new_version bigint;
begin
  if v_actor is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501'; end if;
  p_code := lower(trim(coalesce(p_code, ''))); p_name := trim(coalesce(p_name, ''));
  p_address_text := trim(coalesce(p_address_text, ''));
  select array_agg(distinct requested.mode order by requested.mode) into p_delivery_modes
  from unnest(p_delivery_modes) as requested(mode);
  if p_code !~ '^[a-z0-9][a-z0-9_-]{1,39}$'
     or char_length(p_name) not between 2 and 120
     or char_length(p_address_text) not between 2 and 500
     or cardinality(coalesce(p_delivery_modes, '{}'::public.marketplace_delivery_mode[])) not between 1 and 2
     or not (p_delivery_modes <@ array['platform','self']::public.marketplace_delivery_mode[])
     or p_status is null or p_is_default is null or p_sort_order not between -10000 and 10000
     or p_expected_version is null or p_expected_version < 0
     or (p_is_default and p_status <> 'active') then
    raise exception 'invalid_store_branch' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'store', p_store_id, 'branch', p_branch_id, 'code', p_code, 'name', p_name,
    'city', nullif(trim(coalesce(p_city,'')),''), 'area', nullif(trim(coalesce(p_area,'')),''),
    'address', p_address_text, 'modes', p_delivery_modes, 'status', p_status,
    'default', p_is_default, 'sort', p_sort_order, 'expected', p_expected_version)::text,
    'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor, p_idempotency_key, 'store-branch.save', v_hash);
  if v_replayed then return v_response; end if;
  perform 1 from public.stores where id = p_store_id for update;
  if not found then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if p_branch_id is null then
    if p_expected_version <> 0 then raise exception 'version_conflict' using errcode = '40001'; end if;
    if (select count(*) from public.store_branches where store_id = p_store_id) >= 50 then
      raise exception 'branch_limit_reached' using errcode = '22023'; end if;
    v_new_version := 1;
  else
    select * into v_branch from public.store_branches
    where id = p_branch_id and store_id = p_store_id for update;
    if v_branch.id is null then raise exception 'branch_not_found' using errcode = 'P0002'; end if;
    if v_branch.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
    if v_branch.is_default and not p_is_default then
      raise exception 'default_branch_replacement_required' using errcode = '22023'; end if;
    v_new_version := v_branch.version + 1;
  end if;
  if p_is_default then
    update public.store_branches set is_default = false, version = version + 1, updated_at = now()
    where store_id = p_store_id and is_default and id is distinct from p_branch_id;
  end if;
  if p_branch_id is null then
    insert into public.store_branches (
      store_id, code, name, city, area, address_text, status, delivery_modes,
      is_default, sort_order, version, created_by
    ) values (p_store_id, p_code, p_name, nullif(trim(coalesce(p_city,'')),''),
      nullif(trim(coalesce(p_area,'')),''), p_address_text, p_status, p_delivery_modes,
      p_is_default, p_sort_order, v_new_version, v_actor) returning * into v_branch;
  else
    update public.store_branches set code = p_code, name = p_name,
      city = nullif(trim(coalesce(p_city,'')),''), area = nullif(trim(coalesce(p_area,'')),''),
      address_text = p_address_text, status = p_status, delivery_modes = p_delivery_modes,
      is_default = p_is_default, sort_order = p_sort_order,
      version = v_new_version, updated_at = now()
    where id = p_branch_id returning * into v_branch;
  end if;
  perform public.sync_all_store_delivery_zones_from_branches(p_store_id);
  v_response := jsonb_build_object('id', v_branch.id, 'version', v_branch.version,
    'updated_at', v_branch.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(
    v_actor, p_idempotency_key, 'store-branch.save', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor, 'store-branch.saved', 'store_branch', v_branch.id::text, to_jsonb(v_branch));
  return v_response;
end;
$$;

create or replace function public.delete_my_store_branch(
  p_store_id uuid, p_branch_id uuid, p_expected_version bigint, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_branch public.store_branches;
  v_hash text; v_replayed boolean; v_response jsonb;
begin
  if v_actor is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_store_branch' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'store', p_store_id, 'branch', p_branch_id, 'expected', p_expected_version)::text,
    'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor, p_idempotency_key, 'store-branch.delete', v_hash);
  if v_replayed then return v_response; end if;
  perform 1 from public.stores where id = p_store_id for update;
  select * into v_branch from public.store_branches
  where id = p_branch_id and store_id = p_store_id for update;
  if v_branch.id is null then raise exception 'branch_not_found' using errcode = 'P0002'; end if;
  if v_branch.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if v_branch.is_default then raise exception 'default_branch_cannot_be_deleted' using errcode = '22023'; end if;
  update public.store_branches set status = 'inactive', version = version + 1, updated_at = now()
  where id = v_branch.id returning * into v_branch;
  perform public.sync_all_store_delivery_zones_from_branches(p_store_id);
  v_response := jsonb_build_object('id', v_branch.id, 'version', v_branch.version,
    'updated_at', v_branch.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(
    v_actor, p_idempotency_key, 'store-branch.delete', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor, 'store-branch.deactivated', 'store_branch', v_branch.id::text, to_jsonb(v_branch));
  return v_response;
end;
$$;

create or replace function public.save_my_branch_delivery_configuration(
  p_store_id uuid, p_branch_id uuid, p_zone_id uuid,
  p_delivery_mode public.marketplace_delivery_mode, p_fee_piastres bigint,
  p_free_delivery_threshold_piastres bigint, p_minimum_order_piastres bigint,
  p_estimated_minutes_min integer, p_estimated_minutes_max integer,
  p_is_active boolean, p_expected_branch_version bigint,
  p_expected_config_version bigint, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_branch public.store_branches;
  v_config public.branch_delivery_zones; v_hash text; v_replayed boolean;
  v_response jsonb; v_new_version bigint;
begin
  if v_actor is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501'; end if;
  if p_delivery_mode not in ('platform','self') or p_fee_piastres not between 0 and 10000000
     or p_minimum_order_piastres not between 0 and 100000000
     or (p_free_delivery_threshold_piastres is not null
       and p_free_delivery_threshold_piastres not between 1 and 100000000)
     or p_estimated_minutes_min not between 1 and 10080
     or p_estimated_minutes_max not between p_estimated_minutes_min and 10080
     or p_is_active is null or p_expected_branch_version is null
     or p_expected_config_version is null or p_expected_config_version < 0 then
    raise exception 'invalid_branch_delivery_configuration' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'store', p_store_id, 'branch', p_branch_id, 'zone', p_zone_id, 'mode', p_delivery_mode,
    'fee', p_fee_piastres, 'free', p_free_delivery_threshold_piastres,
    'minimum', p_minimum_order_piastres, 'eta_min', p_estimated_minutes_min,
    'eta_max', p_estimated_minutes_max, 'active', p_is_active,
    'branch_expected', p_expected_branch_version, 'config_expected', p_expected_config_version)::text,
    'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(
    v_actor, p_idempotency_key, 'branch-delivery.save', v_hash);
  if v_replayed then return v_response; end if;
  perform 1 from public.stores where id = p_store_id for update;
  select * into v_branch from public.store_branches
  where id = p_branch_id and store_id = p_store_id for update;
  if v_branch.id is null then raise exception 'branch_not_found' using errcode = 'P0002'; end if;
  if v_branch.version <> p_expected_branch_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if not p_delivery_mode = any(v_branch.delivery_modes) then
    raise exception 'branch_delivery_mode_unavailable' using errcode = '22023'; end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone_id and is_active) then
    raise exception 'delivery_zone_unavailable' using errcode = '22023'; end if;
  select * into v_config from public.branch_delivery_zones
  where branch_id = p_branch_id and zone_id = p_zone_id
    and delivery_mode = p_delivery_mode for update;
  if v_config.branch_id is null then
    if p_expected_config_version <> 0 then raise exception 'version_conflict' using errcode = '40001'; end if;
    v_new_version := 1;
  else
    if v_config.version <> p_expected_config_version then raise exception 'version_conflict' using errcode = '40001'; end if;
    v_new_version := v_config.version + 1;
  end if;
  insert into public.branch_delivery_zones (
    branch_id, zone_id, delivery_mode, fee, free_delivery_threshold,
    minimum_order, estimated_minutes_min, estimated_minutes_max, is_active, version
  ) values (p_branch_id, p_zone_id, p_delivery_mode, p_fee_piastres,
    p_free_delivery_threshold_piastres, p_minimum_order_piastres,
    p_estimated_minutes_min, p_estimated_minutes_max, p_is_active, v_new_version)
  on conflict (branch_id, zone_id, delivery_mode) do update set
    fee = excluded.fee, free_delivery_threshold = excluded.free_delivery_threshold,
    minimum_order = excluded.minimum_order,
    estimated_minutes_min = excluded.estimated_minutes_min,
    estimated_minutes_max = excluded.estimated_minutes_max,
    is_active = excluded.is_active, version = excluded.version, updated_at = now()
  returning * into v_config;
  perform public.sync_store_delivery_zone_from_branches(
    p_store_id, p_zone_id, p_delivery_mode);
  v_response := jsonb_build_object('id', p_branch_id, 'version', v_config.version,
    'updated_at', v_config.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(
    v_actor, p_idempotency_key, 'branch-delivery.save', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor, 'branch-delivery.saved', 'branch_delivery_zone',
    p_branch_id::text || ':' || p_zone_id::text || ':' || p_delivery_mode::text,
    to_jsonb(v_config));
  return v_response;
end;
$$;

-- Keep the legacy store-wide delivery RPC functional by treating it as a
-- write to the default branch and then recomputing the compatibility row.
alter function public.save_my_store_delivery_configuration(
  uuid, uuid, public.marketplace_delivery_mode, bigint, bigint, bigint,
  integer, integer, boolean, timestamptz, timestamptz, text
) rename to save_my_store_delivery_configuration_base_180715;
create or replace function public.save_my_store_delivery_configuration(
  p_store_id uuid, p_zone_id uuid, p_delivery_mode public.marketplace_delivery_mode,
  p_fee_piastres bigint, p_free_delivery_threshold_piastres bigint,
  p_minimum_order_piastres bigint, p_estimated_minutes_min integer,
  p_estimated_minutes_max integer, p_is_active boolean,
  p_expected_store_updated_at timestamptz, p_expected_config_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_response jsonb; v_branch public.store_branches;
begin
  v_response := public.save_my_store_delivery_configuration_base_180715(
    p_store_id, p_zone_id, p_delivery_mode, p_fee_piastres,
    p_free_delivery_threshold_piastres, p_minimum_order_piastres,
    p_estimated_minutes_min, p_estimated_minutes_max, p_is_active,
    p_expected_store_updated_at, p_expected_config_updated_at, p_idempotency_key);
  if coalesce((v_response ->> 'idempotent')::boolean, false) then return v_response; end if;
  select * into v_branch from public.store_branches
  where store_id = p_store_id and is_default for update;
  update public.store_branches set delivery_modes = case
      when (select delivery_mode from public.stores where id = p_store_id) = 'flexible'
        then array['platform','self']::public.marketplace_delivery_mode[]
      else array[(select delivery_mode from public.stores where id = p_store_id)]::public.marketplace_delivery_mode[] end,
    version = version + 1, updated_at = now()
  where id = v_branch.id returning * into v_branch;
  insert into public.branch_delivery_zones (
    branch_id, zone_id, delivery_mode, fee, free_delivery_threshold,
    minimum_order, estimated_minutes_min, estimated_minutes_max, is_active
  ) values (v_branch.id, p_zone_id, p_delivery_mode, p_fee_piastres,
    p_free_delivery_threshold_piastres, p_minimum_order_piastres,
    p_estimated_minutes_min, p_estimated_minutes_max, p_is_active)
  on conflict (branch_id, zone_id, delivery_mode) do update set
    fee = excluded.fee, free_delivery_threshold = excluded.free_delivery_threshold,
    minimum_order = excluded.minimum_order,
    estimated_minutes_min = excluded.estimated_minutes_min,
    estimated_minutes_max = excluded.estimated_minutes_max,
    is_active = excluded.is_active, version = public.branch_delivery_zones.version + 1,
    updated_at = now();
  perform public.sync_store_delivery_zone_from_branches(
    p_store_id, p_zone_id, p_delivery_mode);
  return v_response;
end;
$$;

alter table public.marketplace_orders
  add column branch_id uuid,
  add column branch_snapshot jsonb check (jsonb_typeof(branch_snapshot) = 'object');
alter table public.marketplace_orders
  add constraint marketplace_orders_branch_store_fk
  foreign key (branch_id, store_id)
  references public.store_branches(id, store_id) on delete restrict;

update public.marketplace_orders as marketplace_order
set branch_id = branch.id,
    branch_snapshot = jsonb_build_object(
      'id', branch.id, 'code', branch.code, 'name', branch.name,
      'city', branch.city, 'area', branch.area, 'address_text', branch.address_text,
      'delivery_zone_id', marketplace_order.delivery_zone_id,
      'delivery_mode', marketplace_order.delivery_mode,
      'delivery_fee_piastres', marketplace_order.delivery_fee,
      'estimated_minutes_min', null,
      'estimated_minutes_max', null,
      'inventory_scope', 'store',
      'backfilled', true
    )
from public.store_branches as branch
where branch.store_id = marketplace_order.store_id and branch.is_default;

alter table public.marketplace_orders
  alter column branch_id set not null,
  alter column branch_snapshot set not null;
create index marketplace_orders_branch_queue_idx
  on public.marketplace_orders (branch_id, status, created_at)
  where status not in ('delivered', 'cancelled', 'rejected', 'returned');

create or replace function public.assign_marketplace_order_branch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_branch public.store_branches; v_config public.branch_delivery_zones;
  v_legacy public.store_delivery_zones; v_fee bigint;
  v_minimum bigint; v_free bigint; v_eta_min integer; v_eta_max integer;
  v_branch_id uuid; v_config_id uuid;
begin
  perform 1 from public.stores where id = new.store_id for key share;
  select branch.id, config.id into v_branch_id, v_config_id
  from public.store_branches as branch
  join public.branch_delivery_zones as config on config.branch_id = branch.id
  where branch.store_id = new.store_id and branch.status = 'active'
    and new.delivery_mode = any(branch.delivery_modes)
    and config.zone_id = new.delivery_zone_id
    and config.delivery_mode = new.delivery_mode and config.is_active
  order by branch.is_default desc, branch.sort_order, branch.id
  limit 1 for key share of branch, config;

  if v_branch_id is not null then
    select * into strict v_branch from public.store_branches where id = v_branch_id;
    select * into strict v_config from public.branch_delivery_zones where id = v_config_id;
  end if;

  if v_branch.id is null then
    select * into v_branch from public.store_branches
    where store_id = new.store_id and status = 'active' and is_default
      and new.delivery_mode = any(delivery_modes)
    order by sort_order, id limit 1 for key share;
    select * into v_legacy from public.store_delivery_zones
    where store_id = new.store_id and zone_id = new.delivery_zone_id
      and delivery_mode = new.delivery_mode and is_active for key share;
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
create trigger marketplace_orders_assign_branch
before insert on public.marketplace_orders for each row
execute function public.assign_marketplace_order_branch();

create or replace function public.prevent_marketplace_order_branch_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.branch_id, new.branch_snapshot) is distinct from
     (old.branch_id, old.branch_snapshot) then
    raise exception 'order_branch_snapshot_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger marketplace_orders_keep_branch_snapshot
before update of branch_id, branch_snapshot on public.marketplace_orders
for each row execute function public.prevent_marketplace_order_branch_mutation();

-- Checkout locks every participating store in UUID order before reading the
-- compatibility delivery rows. Branch edits lock the same store first, so the
-- previewed fee, selected branch, child order and group totals share one version.
alter function public.checkout_marketplace_cart(uuid, uuid, text, uuid, jsonb, text)
  rename to checkout_marketplace_cart_base_180715;
create or replace function public.checkout_marketplace_cart(
  p_customer_id uuid, p_cart_id uuid, p_idempotency_key text, p_address_id uuid,
  p_delivery_modes jsonb default '{}'::jsonb, p_delivery_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_store_id uuid;
begin
  perform 1 from public.carts
  where id = p_cart_id and customer_id = p_customer_id for update;
  for v_store_id in
    select store.id from public.stores as store
    where store.id in (
      select product.store_id
      from public.cart_items as item
      join public.product_variants as variant on variant.id = item.variant_id
      join public.products as product on product.id = variant.product_id
      where item.cart_id = p_cart_id
    )
    order by store.id
    for key share of store
  loop null; end loop;
  return public.checkout_marketplace_cart_base_180715(
    p_customer_id, p_cart_id, p_idempotency_key, p_address_id,
    p_delivery_modes, p_delivery_notes);
end;
$$;

alter table public.store_branches enable row level security;
alter table public.branch_delivery_zones enable row level security;
revoke all on table public.store_branches, public.branch_delivery_zones
  from public, anon, authenticated, service_role;
grant all on table public.store_branches, public.branch_delivery_zones to service_role;

do $$
declare routine record;
begin
  for routine in
    select namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and (
      procedure.proname like '%\_base\_180715' escape '\'
      or procedure.proname = any(array[
        'create_default_marketplace_store_branch',
        'sync_store_delivery_zone_from_branches',
        'sync_all_store_delivery_zones_from_branches',
        'list_my_store_branches', 'save_my_store_branch',
        'delete_my_store_branch', 'save_my_branch_delivery_configuration',
        'save_my_store_delivery_configuration', 'assign_marketplace_order_branch',
        'prevent_marketplace_order_branch_mutation',
        'checkout_marketplace_cart'
      ])
    )
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      routine.nspname, routine.proname, routine.arguments);
    execute format('grant execute on function %I.%I(%s) to service_role',
      routine.nspname, routine.proname, routine.arguments);
  end loop;
end $$;

grant execute on function public.list_my_store_branches(uuid) to authenticated;
grant execute on function public.save_my_store_branch(
  uuid, uuid, text, text, text, text, text, public.marketplace_delivery_mode[],
  public.marketplace_branch_status, boolean, integer, bigint, text
) to authenticated;
grant execute on function public.delete_my_store_branch(uuid, uuid, bigint, text)
  to authenticated;
grant execute on function public.save_my_branch_delivery_configuration(
  uuid, uuid, uuid, public.marketplace_delivery_mode, bigint, bigint, bigint,
  integer, integer, boolean, bigint, bigint, text
) to authenticated;
grant execute on function public.save_my_store_delivery_configuration(
  uuid, uuid, public.marketplace_delivery_mode, bigint, bigint, bigint,
  integer, integer, boolean, timestamptz, timestamptz, text
) to authenticated;
commit;
