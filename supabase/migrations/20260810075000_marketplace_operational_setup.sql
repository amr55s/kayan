-- Marketplace operational setup: merchant onboarding, delivery coverage, and coupons.
-- This migration intentionally follows the commerce foundation and exposes writes
-- only through auth-bound RPCs. Money values are Egyptian piastres.

begin;

create table public.marketplace_operational_mutations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  operation text not null check (operation ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);

create index marketplace_operational_mutations_created_idx
  on public.marketplace_operational_mutations (created_at);
create index marketplace_operational_mutations_actor_idx
  on public.marketplace_operational_mutations (actor_user_id, created_at desc);

alter table public.marketplace_operational_mutations enable row level security;
revoke all on table public.marketplace_operational_mutations from public, anon, authenticated;
grant all on table public.marketplace_operational_mutations to service_role;

create or replace function public.marketplace_operational_replay(
  p_actor_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_request_hash text
)
returns table(replayed boolean, response jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare v_mutation public.marketplace_operational_mutations;
begin
  if p_actor_id is null or p_actor_id is distinct from (select auth.uid()) then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 128
     or p_operation !~ '^[a-z][a-z0-9_.-]{2,79}$'
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_idempotency_request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketplace-ops:' || p_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_mutation
  from public.marketplace_operational_mutations
  where actor_user_id = p_actor_id and idempotency_key = p_idempotency_key;
  if v_mutation.id is null then
    return query select false, null::jsonb;
  elsif v_mutation.operation <> p_operation or v_mutation.request_hash <> p_request_hash then
    raise exception 'idempotency_conflict' using errcode = '23505';
  else
    return query select true, v_mutation.response;
  end if;
end;
$$;

create or replace function public.marketplace_record_operational_mutation(
  p_actor_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_request_hash text,
  p_response jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.marketplace_operational_mutations (
    actor_user_id, idempotency_key, operation, request_hash, response
  ) values (
    p_actor_id, p_idempotency_key, p_operation, p_request_hash, p_response
  );
$$;

create or replace function public.list_my_marketplace_stores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', store.id, 'merchant_id', store.merchant_id, 'name', store.name,
      'slug', store.slug, 'short_description', store.short_description,
      'description', store.description, 'status', store.status,
      'delivery_mode', store.delivery_mode, 'city', store.city, 'area', store.area,
      'address_text', store.address_text, 'moderation_notes', store.moderation_notes,
      'updated_at', store.updated_at
    ) order by store.created_at, store.id)
    from public.stores as store
    where public.can_manage_store(store.id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_my_manageable_merchants()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', merchant.id, 'name', merchant.display_name)
      order by merchant.display_name, merchant.id)
    from public.merchants as merchant
    where merchant.is_active and public.can_manage_merchant(merchant.id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_my_marketplace_store(
  p_merchant_id uuid,
  p_name text,
  p_slug text,
  p_short_description text,
  p_description text,
  p_city text,
  p_area text,
  p_address_text text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_hash text;
  v_replayed boolean;
  v_response jsonb;
  v_store public.stores;
  v_actor_name text;
begin
  if v_actor_id is null or p_merchant_id is null or not public.can_manage_merchant(p_merchant_id) then
    raise exception 'merchant_access_required' using errcode = '42501';
  end if;
  p_name := trim(coalesce(p_name, ''));
  p_slug := lower(trim(coalesce(p_slug, '')));
  if char_length(p_name) not between 2 and 150
     or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(p_slug) > 80
     or (p_short_description is not null and char_length(trim(p_short_description)) not between 2 and 240)
     or char_length(coalesce(p_description, '')) > 5000
     or char_length(coalesce(p_city, '')) > 120
     or char_length(coalesce(p_area, '')) > 120
     or char_length(coalesce(p_address_text, '')) > 500 then
    raise exception 'invalid_store_input' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('merchant_id', p_merchant_id, 'name', p_name, 'slug', p_slug,
      'short_description', p_short_description, 'description', p_description,
      'city', p_city, 'area', p_area, 'address_text', p_address_text)::text, 'UTF8'
  ), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor_id, p_idempotency_key, 'store.create', v_hash);
  if v_replayed then return v_response; end if;

  if (select count(*) from public.stores where merchant_id = p_merchant_id and status <> 'archived') >= 10 then
    raise exception 'store_limit_reached' using errcode = '22023';
  end if;
  if (select count(*) from public.marketplace_audit_log
      where actor_user_id = v_actor_id and action = 'store.created'
        and created_at >= now() - interval '24 hours') >= 3 then
    raise exception 'store_creation_rate_limited' using errcode = '22023';
  end if;
  if exists (select 1 from public.stores where slug = p_slug) then
    raise exception 'store_slug_taken' using errcode = '23505';
  end if;
  select display_name into v_actor_name from public.profiles where id = v_actor_id and is_active;
  insert into public.stores (
    merchant_id, slug, name, short_description, description, city, area,
    address_text, created_by, created_by_name_snapshot
  ) values (
    p_merchant_id, p_slug, p_name, nullif(trim(coalesce(p_short_description, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_area, '')), ''), nullif(trim(coalesce(p_address_text, '')), ''),
    v_actor_id, v_actor_name
  ) returning * into v_store;
  insert into public.store_memberships (store_id, user_id, role, is_active)
  values (v_store.id, v_actor_id, 'owner', true)
  on conflict (store_id, user_id) do update set role = 'owner', is_active = true, updated_at = now();
  v_response := jsonb_build_object('id', v_store.id, 'status', v_store.status,
    'updated_at', v_store.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key,
    'store.create', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor_id, 'store.created', 'store', v_store.id::text, to_jsonb(v_store));
  return v_response;
end;
$$;

create or replace function public.update_my_marketplace_store(
  p_store_id uuid,
  p_name text,
  p_short_description text,
  p_description text,
  p_city text,
  p_area text,
  p_address_text text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean;
  v_response jsonb; v_store public.stores; v_before public.stores;
begin
  if v_actor_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  p_name := trim(coalesce(p_name, ''));
  if char_length(p_name) not between 2 and 150
     or (p_short_description is not null and char_length(trim(p_short_description)) not between 2 and 240)
     or char_length(coalesce(p_description, '')) > 5000
     or char_length(coalesce(p_city, '')) > 120 or char_length(coalesce(p_area, '')) > 120
     or char_length(coalesce(p_address_text, '')) > 500 or p_expected_updated_at is null then
    raise exception 'invalid_store_input' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('store_id', p_store_id, 'name', p_name, 'short_description', p_short_description,
      'description', p_description, 'city', p_city, 'area', p_area,
      'address_text', p_address_text, 'expected', p_expected_updated_at)::text, 'UTF8'
  ), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor_id, p_idempotency_key, 'store.update', v_hash);
  if v_replayed then return v_response; end if;
  select * into v_before from public.stores where id = p_store_id for update;
  if v_before.id is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_before.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
  if v_before.status in ('pending_review', 'suspended', 'archived') then
    raise exception 'store_not_editable' using errcode = '22023';
  end if;
  update public.stores set name = p_name,
    short_description = nullif(trim(coalesce(p_short_description, '')), ''),
    description = nullif(trim(coalesce(p_description, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''), area = nullif(trim(coalesce(p_area, '')), ''),
    address_text = nullif(trim(coalesce(p_address_text, '')), '')
  where id = p_store_id returning * into v_store;
  v_response := jsonb_build_object('id', v_store.id, 'status', v_store.status,
    'updated_at', v_store.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key,
    'store.update', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_actor_id, 'store.updated', 'store', p_store_id::text, to_jsonb(v_before), to_jsonb(v_store));
  return v_response;
end;
$$;

create or replace function public.list_marketplace_delivery_zones_for_admin()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_marketplace_admin() then raise exception 'admin_access_required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(zone) order by zone.sort_order, zone.name_ar, zone.id)
    from public.delivery_zones as zone), '[]'::jsonb);
end;
$$;

create or replace function public.submit_my_marketplace_store_operational(
  p_store_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean;
  v_response jsonb; v_store public.stores;
begin
  if v_actor_id is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('store_id', p_store_id)::text, 'UTF8'
  ), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor_id, p_idempotency_key, 'store.submit', v_hash);
  if v_replayed then return v_response; end if;
  select * into v_store from public.submit_store_for_review(p_store_id, v_actor_id);
  v_response := jsonb_build_object('id', v_store.id, 'status', v_store.status,
    'updated_at', v_store.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key,
    'store.submit', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function public.save_marketplace_delivery_zone_as_admin(
  p_zone_id uuid, p_code text, p_name_ar text, p_name_en text, p_city text,
  p_sort_order integer, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean;
  v_response jsonb; v_zone public.delivery_zones; v_before public.delivery_zones;
begin
  if v_actor_id is null or not public.is_marketplace_admin() then raise exception 'admin_access_required' using errcode = '42501'; end if;
  p_code := lower(trim(coalesce(p_code, ''))); p_name_ar := trim(coalesce(p_name_ar, '')); p_city := trim(coalesce(p_city, ''));
  if p_code !~ '^[a-z0-9_-]{2,40}$' or char_length(p_name_ar) not between 2 and 120
     or char_length(p_city) not between 2 and 120 or char_length(coalesce(p_name_en, '')) > 120
     or p_sort_order is null or p_sort_order not between -10000 and 10000 then raise exception 'invalid_delivery_zone' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'id', p_zone_id, 'code', p_code, 'name_ar', p_name_ar, 'name_en', p_name_en,
    'city', p_city, 'sort_order', p_sort_order, 'expected', p_expected_updated_at)::text, 'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response from public.marketplace_operational_replay(
    v_actor_id, p_idempotency_key, 'delivery-zone.save', v_hash);
  if v_replayed then return v_response; end if;
  if p_zone_id is null then
    if (select count(*) from public.delivery_zones) >= 500 then raise exception 'delivery_zone_limit_reached' using errcode = '22023'; end if;
    insert into public.delivery_zones (code, name_ar, name_en, city, sort_order)
    values (p_code, p_name_ar, nullif(trim(coalesce(p_name_en, '')), ''), p_city, p_sort_order)
    returning * into v_zone;
  else
    select * into v_before from public.delivery_zones where id = p_zone_id for update;
    if v_before.id is null then raise exception 'delivery_zone_not_found' using errcode = 'P0002'; end if;
    if p_expected_updated_at is null or v_before.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
    update public.delivery_zones set code = p_code, name_ar = p_name_ar,
      name_en = nullif(trim(coalesce(p_name_en, '')), ''), city = p_city, sort_order = p_sort_order
    where id = p_zone_id returning * into v_zone;
  end if;
  v_response := jsonb_build_object('id', v_zone.id, 'updated_at', v_zone.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key, 'delivery-zone.save', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_actor_id, case when p_zone_id is null then 'delivery-zone.created' else 'delivery-zone.updated' end,
    'delivery_zone', v_zone.id::text, case when p_zone_id is null then null else to_jsonb(v_before) end, to_jsonb(v_zone));
  return v_response;
end;
$$;

create or replace function public.set_marketplace_delivery_zone_active_as_admin(
  p_zone_id uuid, p_is_active boolean, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean;
  v_response jsonb; v_zone public.delivery_zones;
begin
  if v_actor_id is null or not public.is_marketplace_admin() then raise exception 'admin_access_required' using errcode = '42501'; end if;
  if p_zone_id is null or p_is_active is null or p_expected_updated_at is null then raise exception 'invalid_delivery_zone' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'id', p_zone_id, 'active', p_is_active, 'expected', p_expected_updated_at)::text, 'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response from public.marketplace_operational_replay(
    v_actor_id, p_idempotency_key, 'delivery-zone.activate', v_hash);
  if v_replayed then return v_response; end if;
  select * into v_zone from public.delivery_zones where id = p_zone_id for update;
  if v_zone.id is null then raise exception 'delivery_zone_not_found' using errcode = 'P0002'; end if;
  if v_zone.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.delivery_zones set is_active = p_is_active where id = p_zone_id returning * into v_zone;
  v_response := jsonb_build_object('id', v_zone.id, 'is_active', v_zone.is_active,
    'updated_at', v_zone.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key, 'delivery-zone.activate', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor_id, 'delivery-zone.activation_changed', 'delivery_zone', v_zone.id::text, to_jsonb(v_zone));
  return v_response;
end;
$$;

create or replace function public.list_my_store_delivery_configuration(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_store public.stores;
begin
  if (select auth.uid()) is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.id is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'store_id', v_store.id, 'delivery_mode', v_store.delivery_mode, 'store_updated_at', v_store.updated_at,
    'zones', coalesce((select jsonb_agg(jsonb_build_object(
      'zone_id', zone.id, 'code', zone.code, 'name_ar', zone.name_ar, 'city', zone.city,
      'zone_is_active', zone.is_active, 'delivery_mode', config.delivery_mode,
      'fee_piastres', config.fee, 'free_delivery_threshold_piastres', config.free_delivery_threshold,
      'minimum_order_piastres', config.minimum_order,
      'estimated_minutes_min', config.estimated_minutes_min,
      'estimated_minutes_max', config.estimated_minutes_max,
      'is_active', coalesce(config.is_active, false), 'updated_at', config.updated_at
    ) order by zone.sort_order, zone.name_ar, zone.id)
    from public.delivery_zones as zone
    left join public.store_delivery_zones as config
      on config.zone_id = zone.id and config.store_id = p_store_id
      and config.delivery_mode = case when v_store.delivery_mode = 'self' then 'self'::public.marketplace_delivery_mode else 'platform'::public.marketplace_delivery_mode end
    where zone.is_active or config.zone_id is not null), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_my_store_delivery_configuration(
  p_store_id uuid, p_zone_id uuid, p_delivery_mode public.marketplace_delivery_mode,
  p_fee_piastres bigint, p_free_delivery_threshold_piastres bigint,
  p_minimum_order_piastres bigint, p_estimated_minutes_min integer,
  p_estimated_minutes_max integer, p_is_active boolean,
  p_expected_store_updated_at timestamptz, p_expected_config_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean;
  v_response jsonb; v_store public.stores; v_config public.store_delivery_zones;
begin
  if v_actor_id is null or not public.can_manage_store(p_store_id) then raise exception 'store_management_required' using errcode = '42501'; end if;
  if p_delivery_mode is null or p_delivery_mode not in ('platform', 'self')
     or p_fee_piastres is null or p_fee_piastres not between 0 and 10000000
     or p_minimum_order_piastres is null
     or p_minimum_order_piastres not between 0 and 100000000
     or (p_free_delivery_threshold_piastres is not null and p_free_delivery_threshold_piastres not between 1 and 100000000)
     or p_estimated_minutes_min is null or p_estimated_minutes_max is null or p_is_active is null
     or p_estimated_minutes_min not between 1 and 10080 or p_estimated_minutes_max not between p_estimated_minutes_min and 10080
     or p_expected_store_updated_at is null then raise exception 'invalid_delivery_configuration' using errcode = '22023'; end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone_id and is_active) then
    raise exception 'delivery_zone_unavailable' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'store', p_store_id, 'zone', p_zone_id, 'mode', p_delivery_mode, 'fee', p_fee_piastres,
    'free', p_free_delivery_threshold_piastres, 'minimum', p_minimum_order_piastres,
    'eta_min', p_estimated_minutes_min, 'eta_max', p_estimated_minutes_max, 'active', p_is_active,
    'store_expected', p_expected_store_updated_at, 'config_expected', p_expected_config_updated_at)::text, 'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response from public.marketplace_operational_replay(
    v_actor_id, p_idempotency_key, 'store-delivery.save', v_hash);
  if v_replayed then return v_response; end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store.id is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_store.updated_at <> p_expected_store_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
  select * into v_config from public.store_delivery_zones where store_id = p_store_id
    and zone_id = p_zone_id and delivery_mode = p_delivery_mode for update;
  if v_config.store_id is null and p_expected_config_updated_at is not null
     and not exists (
       select 1 from public.store_delivery_zones as previous
       where previous.store_id = p_store_id and previous.zone_id = p_zone_id
         and previous.updated_at = p_expected_config_updated_at
     ) then raise exception 'version_conflict' using errcode = '40001'; end if;
  if v_config.store_id is not null and (p_expected_config_updated_at is null or v_config.updated_at <> p_expected_config_updated_at) then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  update public.stores set delivery_mode = p_delivery_mode where id = p_store_id returning * into v_store;
  insert into public.store_delivery_zones (store_id, zone_id, delivery_mode, fee,
    free_delivery_threshold, minimum_order, estimated_minutes_min, estimated_minutes_max, is_active)
  values (p_store_id, p_zone_id, p_delivery_mode, p_fee_piastres,
    p_free_delivery_threshold_piastres, p_minimum_order_piastres,
    p_estimated_minutes_min, p_estimated_minutes_max, p_is_active)
  on conflict (store_id, zone_id, delivery_mode) do update set fee = excluded.fee,
    free_delivery_threshold = excluded.free_delivery_threshold, minimum_order = excluded.minimum_order,
    estimated_minutes_min = excluded.estimated_minutes_min,
    estimated_minutes_max = excluded.estimated_minutes_max, is_active = excluded.is_active
  returning * into v_config;
  v_response := jsonb_build_object('store_id', p_store_id, 'zone_id', p_zone_id,
    'delivery_mode', p_delivery_mode, 'store_updated_at', v_store.updated_at,
    'config_updated_at', v_config.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key, 'store-delivery.save', v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor_id, 'store-delivery.saved', 'store_delivery_zone',
    p_store_id::text || ':' || p_zone_id::text || ':' || p_delivery_mode::text, to_jsonb(v_config));
  return v_response;
end;
$$;

create or replace function public.list_my_marketplace_coupons(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can_catalog_store(p_store_id) then raise exception 'catalog_access_required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(coupon) order by coupon.created_at desc, coupon.id desc)
    from public.marketplace_coupons as coupon where coupon.store_id = p_store_id and coupon.funding_owner = 'merchant'), '[]'::jsonb);
end;
$$;

create or replace function public.list_platform_marketplace_coupons_as_admin()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_marketplace_admin() then raise exception 'admin_access_required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(coupon) order by coupon.created_at desc, coupon.id desc)
    from public.marketplace_coupons as coupon where coupon.store_id is null and coupon.funding_owner = 'platform'), '[]'::jsonb);
end;
$$;

create or replace function public.save_marketplace_coupon_for_scope(
  p_store_id uuid, p_coupon_id uuid, p_code text, p_title text,
  p_discount_type public.marketplace_coupon_type, p_discount_percent numeric,
  p_discount_amount_piastres bigint, p_max_discount_piastres bigint,
  p_minimum_order_piastres bigint, p_starts_at timestamptz, p_expires_at timestamptz,
  p_total_limit integer, p_per_customer_limit integer, p_is_active boolean,
  p_expected_updated_at timestamptz, p_idempotency_key text, p_admin_scope boolean
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid()); v_hash text; v_replayed boolean; v_response jsonb;
  v_coupon public.marketplace_coupons; v_before public.marketplace_coupons; v_operation text;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_admin_scope then
    if not public.is_marketplace_admin() or p_store_id is not null then raise exception 'admin_access_required' using errcode = '42501'; end if;
    v_operation := 'platform-coupon.save';
  else
    if p_store_id is null or not public.can_catalog_store(p_store_id) then raise exception 'catalog_access_required' using errcode = '42501'; end if;
    v_operation := 'merchant-coupon.save';
  end if;
  p_code := upper(trim(coalesce(p_code, ''))); p_title := trim(coalesce(p_title, ''));
  if p_code !~ '^[A-Z0-9_-]{3,32}$' or char_length(p_title) not between 2 and 120
     or p_discount_type is null or p_minimum_order_piastres is null or p_per_customer_limit is null
     or p_is_active is null
     or p_minimum_order_piastres not between 0 and 100000000
     or (p_max_discount_piastres is not null and p_max_discount_piastres not between 1 and 100000000)
     or (p_total_limit is not null and p_total_limit not between 1 and 1000000)
     or p_per_customer_limit not between 1 and 100
     or (p_expires_at is not null and p_starts_at is not null and p_expires_at <= p_starts_at)
     or (p_discount_type = 'percentage' and (p_discount_percent is null or p_discount_percent <= 0 or p_discount_percent > 80 or p_discount_amount_piastres is not null))
     or (p_discount_type = 'fixed' and (p_discount_amount_piastres is null or p_discount_amount_piastres not between 1 and 10000000 or p_discount_percent is not null))
  then raise exception 'invalid_coupon_input' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'scope', p_store_id, 'id', p_coupon_id, 'code', p_code, 'title', p_title, 'type', p_discount_type,
    'percent', p_discount_percent, 'amount', p_discount_amount_piastres, 'max', p_max_discount_piastres,
    'minimum', p_minimum_order_piastres, 'starts', p_starts_at, 'expires', p_expires_at,
    'total', p_total_limit, 'customer', p_per_customer_limit, 'active', p_is_active,
    'expected', p_expected_updated_at, 'admin', p_admin_scope)::text, 'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response from public.marketplace_operational_replay(
    v_actor_id, p_idempotency_key, v_operation, v_hash);
  if v_replayed then return v_response; end if;
  if p_coupon_id is null then
    if (select count(*) from public.marketplace_coupons where store_id is not distinct from p_store_id and is_active) >= 100 then
      raise exception 'coupon_limit_reached' using errcode = '22023';
    end if;
    insert into public.marketplace_coupons (store_id, code, title, discount_type, funding_owner,
      discount_percent, discount_amount_piastres, max_discount, minimum_order, starts_at, expires_at,
      total_limit, per_customer_limit, is_active, created_by)
    values (p_store_id, p_code, p_title, p_discount_type,
      case when p_admin_scope then 'platform'::public.marketplace_coupon_funding else 'merchant'::public.marketplace_coupon_funding end,
      p_discount_percent, p_discount_amount_piastres, p_max_discount_piastres, p_minimum_order_piastres,
      p_starts_at, p_expires_at, p_total_limit, p_per_customer_limit, p_is_active, v_actor_id)
    returning * into v_coupon;
  else
    select * into v_before from public.marketplace_coupons where id = p_coupon_id for update;
    if v_before.id is null or v_before.store_id is distinct from p_store_id
       or v_before.funding_owner <> (case when p_admin_scope then 'platform'::public.marketplace_coupon_funding else 'merchant'::public.marketplace_coupon_funding end)
    then raise exception 'coupon_not_found' using errcode = 'P0002'; end if;
    if p_expected_updated_at is null or v_before.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
    if exists (select 1 from public.marketplace_coupon_products where coupon_id = p_coupon_id)
       or exists (select 1 from public.marketplace_coupon_categories where coupon_id = p_coupon_id) then
      raise exception 'coupon_not_store_wide' using errcode = '22023';
    end if;
    update public.marketplace_coupons set code = p_code, title = p_title,
      discount_type = p_discount_type, discount_percent = p_discount_percent,
      discount_amount_piastres = p_discount_amount_piastres, max_discount = p_max_discount_piastres,
      minimum_order = p_minimum_order_piastres, starts_at = p_starts_at, expires_at = p_expires_at,
      total_limit = p_total_limit, per_customer_limit = p_per_customer_limit,
      is_active = p_is_active, updated_at = now()
    where id = p_coupon_id returning * into v_coupon;
  end if;
  v_response := jsonb_build_object('id', v_coupon.id, 'updated_at', v_coupon.updated_at,
    'is_active', v_coupon.is_active, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key, v_operation, v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_actor_id, case when p_admin_scope then 'platform-coupon.saved' else 'merchant-coupon.saved' end,
    'marketplace_coupon', v_coupon.id::text, case when p_coupon_id is null then null else to_jsonb(v_before) end, to_jsonb(v_coupon));
  return v_response;
end;
$$;

create or replace function public.save_my_marketplace_coupon(
  p_store_id uuid, p_coupon_id uuid, p_code text, p_title text,
  p_discount_type public.marketplace_coupon_type, p_discount_percent numeric,
  p_discount_amount_piastres bigint, p_max_discount_piastres bigint,
  p_minimum_order_piastres bigint, p_starts_at timestamptz, p_expires_at timestamptz,
  p_total_limit integer, p_per_customer_limit integer, p_is_active boolean,
  p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.save_marketplace_coupon_for_scope(p_store_id, p_coupon_id, p_code, p_title,
    p_discount_type, p_discount_percent, p_discount_amount_piastres, p_max_discount_piastres,
    p_minimum_order_piastres, p_starts_at, p_expires_at, p_total_limit,
    p_per_customer_limit, p_is_active, p_expected_updated_at, p_idempotency_key, false);
$$;

create or replace function public.save_platform_marketplace_coupon_as_admin(
  p_coupon_id uuid, p_code text, p_title text,
  p_discount_type public.marketplace_coupon_type, p_discount_percent numeric,
  p_discount_amount_piastres bigint, p_max_discount_piastres bigint,
  p_minimum_order_piastres bigint, p_starts_at timestamptz, p_expires_at timestamptz,
  p_total_limit integer, p_per_customer_limit integer, p_is_active boolean,
  p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.save_marketplace_coupon_for_scope(null, p_coupon_id, p_code, p_title,
    p_discount_type, p_discount_percent, p_discount_amount_piastres, p_max_discount_piastres,
    p_minimum_order_piastres, p_starts_at, p_expires_at, p_total_limit,
    p_per_customer_limit, p_is_active, p_expected_updated_at, p_idempotency_key, true);
$$;

create or replace function public.deactivate_marketplace_coupon_for_scope(
  p_coupon_id uuid, p_expected_updated_at timestamptz, p_idempotency_key text, p_admin_scope boolean
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid()); v_coupon public.marketplace_coupons;
  v_hash text; v_replayed boolean; v_response jsonb; v_operation text;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_admin_scope then v_operation := 'platform-coupon.deactivate';
  else v_operation := 'merchant-coupon.deactivate'; end if;
  if p_coupon_id is null or p_expected_updated_at is null then raise exception 'invalid_coupon_input' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'id', p_coupon_id, 'expected', p_expected_updated_at, 'admin', p_admin_scope)::text, 'UTF8'), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response from public.marketplace_operational_replay(
    v_actor_id, p_idempotency_key, v_operation, v_hash);
  if v_replayed then return v_response; end if;
  select * into v_coupon from public.marketplace_coupons where id = p_coupon_id for update;
  if v_coupon.id is null then raise exception 'coupon_not_found' using errcode = 'P0002'; end if;
  if p_admin_scope then
    if not public.is_marketplace_admin() or v_coupon.store_id is not null or v_coupon.funding_owner <> 'platform' then
      raise exception 'admin_access_required' using errcode = '42501';
    end if;
  else
    if v_coupon.store_id is null or v_coupon.funding_owner <> 'merchant' or not public.can_catalog_store(v_coupon.store_id) then
      raise exception 'catalog_access_required' using errcode = '42501';
    end if;
  end if;
  if p_expected_updated_at is null or v_coupon.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.marketplace_coupons set is_active = false, updated_at = now()
  where id = p_coupon_id returning * into v_coupon;
  v_response := jsonb_build_object('id', v_coupon.id, 'is_active', false,
    'updated_at', v_coupon.updated_at, 'idempotent', false);
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key, v_operation, v_hash, v_response);
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, after_data)
  values (v_actor_id, v_operation, 'marketplace_coupon', v_coupon.id::text, to_jsonb(v_coupon));
  return v_response;
end;
$$;

create or replace function public.deactivate_my_marketplace_coupon(
  p_coupon_id uuid, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language sql security definer set search_path = ''
as $$ select public.deactivate_marketplace_coupon_for_scope(
  p_coupon_id, p_expected_updated_at, p_idempotency_key, false); $$;

create or replace function public.deactivate_platform_marketplace_coupon_as_admin(
  p_coupon_id uuid, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language sql security definer set search_path = ''
as $$ select public.deactivate_marketplace_coupon_for_scope(
  p_coupon_id, p_expected_updated_at, p_idempotency_key, true); $$;

-- Default-deny every routine introduced here, then expose only auth-bound entry points.
do $$
declare routine record;
begin
  for routine in
    select namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = any(array[
      'marketplace_operational_replay', 'marketplace_record_operational_mutation',
      'list_my_marketplace_stores', 'list_my_manageable_merchants',
      'create_my_marketplace_store', 'update_my_marketplace_store',
      'submit_my_marketplace_store_operational',
      'list_marketplace_delivery_zones_for_admin', 'save_marketplace_delivery_zone_as_admin',
      'set_marketplace_delivery_zone_active_as_admin', 'list_my_store_delivery_configuration',
      'save_my_store_delivery_configuration', 'list_my_marketplace_coupons',
      'list_platform_marketplace_coupons_as_admin', 'save_marketplace_coupon_for_scope',
      'save_my_marketplace_coupon', 'save_platform_marketplace_coupon_as_admin',
      'deactivate_marketplace_coupon_for_scope', 'deactivate_my_marketplace_coupon',
      'deactivate_platform_marketplace_coupon_as_admin'
    ])
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated',
      routine.nspname, routine.proname, routine.arguments);
    execute format('grant execute on function %I.%I(%s) to service_role',
      routine.nspname, routine.proname, routine.arguments);
  end loop;
end;
$$;

grant execute on function public.list_my_marketplace_stores() to authenticated;
grant execute on function public.list_my_manageable_merchants() to authenticated;
grant execute on function public.create_my_marketplace_store(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_my_marketplace_store(uuid, text, text, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.submit_my_marketplace_store_operational(uuid, text) to authenticated;
grant execute on function public.list_marketplace_delivery_zones_for_admin() to authenticated;
grant execute on function public.save_marketplace_delivery_zone_as_admin(uuid, text, text, text, text, integer, timestamptz, text) to authenticated;
grant execute on function public.set_marketplace_delivery_zone_active_as_admin(uuid, boolean, timestamptz, text) to authenticated;
grant execute on function public.list_my_store_delivery_configuration(uuid) to authenticated;
grant execute on function public.save_my_store_delivery_configuration(uuid, uuid, public.marketplace_delivery_mode, bigint, bigint, bigint, integer, integer, boolean, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.list_my_marketplace_coupons(uuid) to authenticated;
grant execute on function public.list_platform_marketplace_coupons_as_admin() to authenticated;
grant execute on function public.save_my_marketplace_coupon(uuid, uuid, text, text, public.marketplace_coupon_type, numeric, bigint, bigint, bigint, timestamptz, timestamptz, integer, integer, boolean, timestamptz, text) to authenticated;
grant execute on function public.save_platform_marketplace_coupon_as_admin(uuid, text, text, public.marketplace_coupon_type, numeric, bigint, bigint, bigint, timestamptz, timestamptz, integer, integer, boolean, timestamptz, text) to authenticated;
grant execute on function public.deactivate_my_marketplace_coupon(uuid, timestamptz, text) to authenticated;
grant execute on function public.deactivate_platform_marketplace_coupon_as_admin(uuid, timestamptz, text) to authenticated;

insert into public.marketplace_runtime_settings (key, value)
values ('operational_setup_version', jsonb_build_object('version', '20260810075000'))
on conflict (key) do update set value = excluded.value, updated_at = now();

commit;
