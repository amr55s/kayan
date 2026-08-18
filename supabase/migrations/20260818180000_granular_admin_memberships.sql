begin;

do $$ begin
  create type public.marketplace_admin_role as enum (
    'super_admin', 'operations', 'support', 'finance', 'catalog_reviewer'
  );
exception when duplicate_object then null;
end $$;

create table public.admin_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.marketplace_admin_role not null,
  is_active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  granted_by uuid references auth.users(id) on delete set null,
  granted_by_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index admin_memberships_active_role_idx
  on public.admin_memberships (role, user_id) where is_active;

-- Every existing admin remains fully authorized after rollout. This happens
-- before the last-super-admin guard is installed, so a fresh restore cannot
-- lock itself out while backfilling.
insert into public.admin_memberships (
  user_id, role, is_active, version, granted_by_name_snapshot
)
select profile.id, 'super_admin', true, 1, 'migration_backfill'
from public.profiles as profile
where profile.role = 'admin'
on conflict (user_id, role) do update set is_active = true, updated_at = now();

create table public.admin_membership_mutations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);
create index admin_membership_mutations_target_idx
  on public.admin_membership_mutations (target_user_id, created_at desc);

-- A role-scoped wrapper activates this row for its own transaction. It is not
-- exposed through PostgREST, and therefore cannot be forged by a caller.
create table public.marketplace_admin_capability_context (
  transaction_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  activated_role public.marketplace_admin_role not null,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (transaction_id, user_id)
);

create or replace function public.has_marketplace_admin_role(
  p_roles public.marketplace_admin_role[]
)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
    or (
      (select auth.uid()) is not null
      and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      and exists (
        select 1 from public.profiles as profile
        where profile.id = (select auth.uid()) and profile.role = 'admin'
          and profile.is_active and not profile.must_change_password
      )
      and exists (
        select 1 from public.admin_memberships as membership
        where membership.user_id = (select auth.uid()) and membership.is_active
          and membership.role = any(coalesce(p_roles, '{}'::public.marketplace_admin_role[]))
      )
    );
$$;

create or replace function public.activate_marketplace_admin_capability(
  p_roles public.marketplace_admin_role[]
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.marketplace_admin_role;
begin
  if not public.has_marketplace_admin_role(p_roles) then
    raise exception 'admin_role_required' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'role') = 'service_role', false) then return; end if;
  delete from public.marketplace_admin_capability_context
  where created_at < pg_catalog.transaction_timestamp() - interval '1 day';
  select membership.role into v_role
  from public.admin_memberships as membership
  where membership.user_id = (select auth.uid()) and membership.is_active
    and membership.role = any(p_roles)
  order by case membership.role when 'super_admin' then 0 else 1 end, membership.role
  limit 1;
  insert into public.marketplace_admin_capability_context (
    transaction_id, user_id, activated_role, created_at
  ) values (txid_current(), (select auth.uid()), v_role, pg_catalog.transaction_timestamp())
  on conflict (transaction_id, user_id) do update set
    activated_role = excluded.activated_role, created_at = excluded.created_at;
end;
$$;

-- Broad legacy administrator checks are now super-admin-only unless a vetted
-- role wrapper activated a transaction-local capability first.
create or replace function public.is_marketplace_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
    or public.has_marketplace_admin_role(array['super_admin']::public.marketplace_admin_role[])
    or exists (
      select 1 from public.marketplace_admin_capability_context as context
      where context.transaction_id = txid_current()
        and context.user_id = (select auth.uid())
        and context.created_at = pg_catalog.transaction_timestamp()
    );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_marketplace_admin();
$$;

create or replace function public.guard_last_marketplace_super_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_remaining integer;
begin
  if old.role = 'super_admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-admin-memberships', 0)
    );
    select count(*) into v_remaining
    from public.admin_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.role = 'super_admin' and membership.is_active
      and profile.role = 'admin' and profile.is_active
      and not (membership.user_id = old.user_id and membership.role = old.role);
    if v_remaining < 1 then
      raise exception 'last_super_admin_cannot_be_removed' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger admin_memberships_keep_super_admin
before update or delete on public.admin_memberships
for each row execute function public.guard_last_marketplace_super_admin();

create or replace function public.guard_last_marketplace_super_admin_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_remaining integer;
begin
  if old.role = 'admin' and old.is_active
     and exists (
       select 1 from public.admin_memberships as membership
       where membership.user_id = old.id and membership.role = 'super_admin'
         and membership.is_active
     )
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.is_active) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-admin-memberships', 0)
    );
    select count(*) into v_remaining
    from public.admin_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.role = 'super_admin' and membership.is_active
      and profile.role = 'admin' and profile.is_active and profile.id <> old.id;
    if v_remaining < 1 then
      raise exception 'last_super_admin_cannot_be_removed' using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_keep_marketplace_super_admin
before update of role, is_active or delete on public.profiles
for each row execute function public.guard_last_marketplace_super_admin_profile();

create or replace function public.get_my_marketplace_admin_roles()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_marketplace_admin_role(array[
    'super_admin','operations','support','finance','catalog_reviewer'
  ]::public.marketplace_admin_role[]) then
    raise exception 'admin_membership_required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(membership.role order by membership.role)
    from public.admin_memberships as membership
    where membership.user_id = (select auth.uid()) and membership.is_active), '[]'::jsonb);
end;
$$;

create or replace function public.list_marketplace_admin_memberships()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_marketplace_admin_role(array['super_admin']::public.marketplace_admin_role[]) then
    raise exception 'super_admin_required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', profile.id, 'display_name', profile.display_name,
      'phone', profile.phone, 'profile_active', profile.is_active,
      'roles', coalesce(membership.roles, '[]'::jsonb),
      'membership_active', coalesce(membership.membership_active, false),
      'version', coalesce(membership.version, 0),
      'updated_at', membership.updated_at
    ) order by profile.display_name, profile.id)
    from public.profiles as profile
    left join lateral (
      select jsonb_agg(row.role order by row.role) filter (where row.is_active) as roles,
        bool_or(row.is_active) as membership_active,
        max(row.version) as version, max(row.updated_at) as updated_at
      from public.admin_memberships as row where row.user_id = profile.id
    ) as membership on true
    where profile.role = 'admin'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_marketplace_admin_membership(
  p_user_id uuid,
  p_roles public.marketplace_admin_role[],
  p_is_active boolean,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_target_name text;
  v_roles public.marketplace_admin_role[];
  v_current_version bigint;
  v_new_version bigint;
  v_hash text;
  v_mutation public.admin_membership_mutations;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  if not public.has_marketplace_admin_role(array['super_admin']::public.marketplace_admin_role[]) then
    raise exception 'super_admin_required' using errcode = '42501';
  end if;
  select array_agg(distinct requested.role order by requested.role) into v_roles
  from unnest(p_roles) as requested(role);
  if p_user_id is null or p_is_active is null or p_expected_version is null or p_expected_version < 0
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 128
     or cardinality(coalesce(v_roles, '{}'::public.marketplace_admin_role[])) not between 1 and 5 then
    raise exception 'invalid_admin_membership' using errcode = '22023';
  end if;
  select display_name into v_target_name from public.profiles
  where id = p_user_id and role = 'admin' for update;
  if v_target_name is null then raise exception 'admin_profile_not_found' using errcode = 'P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketplace-admin-memberships', 0)
  );
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('user_id', p_user_id, 'roles', v_roles,
      'is_active', p_is_active, 'expected_version', p_expected_version)::text, 'UTF8'
  ), 'sha256'), 'hex');
  select * into v_mutation from public.admin_membership_mutations
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if v_mutation is not null then
    if v_mutation.target_user_id <> p_user_id or v_mutation.request_hash <> v_hash then
      raise exception 'admin_membership_idempotency_conflict' using errcode = '23505';
    end if;
    return v_mutation.response || jsonb_build_object('idempotent', true);
  end if;
  select coalesce(max(version), 0), coalesce(jsonb_agg(to_jsonb(membership)
    order by membership.role), '[]'::jsonb)
  into v_current_version, v_before
  from public.admin_memberships as membership where membership.user_id = p_user_id;
  if v_current_version <> p_expected_version then
    raise exception 'admin_membership_version_conflict' using errcode = '40001';
  end if;
  v_new_version := v_current_version + 1;
  update public.admin_memberships set is_active = false, version = v_new_version,
    updated_at = now() where user_id = p_user_id and role <> all(v_roles);
  select display_name into v_actor_name from public.profiles where id = v_actor;
  insert into public.admin_memberships (
    user_id, role, is_active, version, granted_by, granted_by_name_snapshot
  ) select p_user_id, requested.role, p_is_active, v_new_version, v_actor, v_actor_name
    from unnest(v_roles) as requested(role)
  on conflict (user_id, role) do update set is_active = excluded.is_active,
    version = excluded.version, granted_by = excluded.granted_by,
    granted_by_name_snapshot = excluded.granted_by_name_snapshot, updated_at = now();
  if not exists (
    select 1 from public.admin_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.role = 'super_admin' and membership.is_active
      and profile.role = 'admin' and profile.is_active
  ) then raise exception 'last_super_admin_cannot_be_removed' using errcode = '23514'; end if;
  select coalesce(jsonb_agg(to_jsonb(membership) order by membership.role), '[]'::jsonb)
  into v_after from public.admin_memberships as membership where membership.user_id = p_user_id;
  v_response := jsonb_build_object('user_id', p_user_id, 'roles', to_jsonb(v_roles),
    'is_active', p_is_active, 'version', v_new_version);
  insert into public.admin_membership_mutations (
    actor_user_id, target_user_id, idempotency_key, request_hash, response
  ) values (v_actor, p_user_id, p_idempotency_key, v_hash, v_response);
  insert into public.marketplace_audit_log (
    actor_user_id, request_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (v_actor, p_idempotency_key, 'admin.membership_changed',
    'admin_membership', p_user_id::text, jsonb_build_object('memberships', v_before),
    jsonb_build_object('memberships', v_after),
    jsonb_build_object('actor_name_snapshot', v_actor_name,
      'target_name_snapshot', v_target_name));
  return v_response || jsonb_build_object('idempotent', false);
end;
$$;

-- Catalog moderation -------------------------------------------------------
alter function public.list_pending_marketplace_moderation(text, integer, timestamptz)
  rename to list_pending_marketplace_moderation_base_180000;
create or replace function public.list_pending_marketplace_moderation(
  p_entity text default 'all', p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','catalog_reviewer']::public.marketplace_admin_role[]);
  return public.list_pending_marketplace_moderation_base_180000(p_entity, p_limit, p_before);
end;
$$;

alter function public.moderate_store_as_admin(uuid, boolean, text)
  rename to moderate_store_as_admin_base_180000;
create or replace function public.moderate_store_as_admin(
  p_store_id uuid, p_approve boolean, p_notes text default null
)
returns public.stores language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','catalog_reviewer']::public.marketplace_admin_role[]);
  return public.moderate_store_as_admin_base_180000(p_store_id, p_approve, p_notes);
end;
$$;

alter function public.moderate_product_as_admin(uuid, boolean, text)
  rename to moderate_product_as_admin_base_180000;
create or replace function public.moderate_product_as_admin(
  p_product_id uuid, p_approve boolean, p_notes text default null
)
returns public.products language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','catalog_reviewer']::public.marketplace_admin_role[]);
  return public.moderate_product_as_admin_base_180000(p_product_id, p_approve, p_notes);
end;
$$;

-- Super-admin-only marketplace setup --------------------------------------
alter function public.list_marketplace_delivery_zones_for_admin()
  rename to list_marketplace_delivery_zones_for_admin_base_180000;
create or replace function public.list_marketplace_delivery_zones_for_admin()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin']::public.marketplace_admin_role[]);
  return public.list_marketplace_delivery_zones_for_admin_base_180000();
end;
$$;

alter function public.save_marketplace_delivery_zone_as_admin(
  uuid, text, text, text, text, integer, timestamptz, text
) rename to save_marketplace_delivery_zone_as_admin_base_180000;
create or replace function public.save_marketplace_delivery_zone_as_admin(
  p_zone_id uuid, p_code text, p_name_ar text, p_name_en text, p_city text,
  p_sort_order integer, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(array['super_admin']::public.marketplace_admin_role[]);
  return public.save_marketplace_delivery_zone_as_admin_base_180000(
    p_zone_id, p_code, p_name_ar, p_name_en, p_city, p_sort_order,
    p_expected_updated_at, p_idempotency_key);
end;
$$;

alter function public.set_marketplace_delivery_zone_active_as_admin(uuid, boolean, timestamptz, text)
  rename to set_marketplace_delivery_zone_active_as_admin_base_180000;
create or replace function public.set_marketplace_delivery_zone_active_as_admin(
  p_zone_id uuid, p_is_active boolean, p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(array['super_admin']::public.marketplace_admin_role[]);
  return public.set_marketplace_delivery_zone_active_as_admin_base_180000(
    p_zone_id, p_is_active, p_expected_updated_at, p_idempotency_key);
end;
$$;

alter function public.list_platform_marketplace_coupons_as_admin()
  rename to list_platform_marketplace_coupons_as_admin_base_180000;
create or replace function public.list_platform_marketplace_coupons_as_admin()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(array['super_admin']::public.marketplace_admin_role[]);
  return public.list_platform_marketplace_coupons_as_admin_base_180000();
end;
$$;

alter function public.save_platform_marketplace_coupon_as_admin(
  uuid, text, text, public.marketplace_coupon_type, numeric, bigint, bigint,
  bigint, timestamptz, timestamptz, integer, integer, boolean, timestamptz, text
) rename to save_platform_marketplace_coupon_as_admin_base_180000;
create or replace function public.save_platform_marketplace_coupon_as_admin(
  p_coupon_id uuid, p_code text, p_title text,
  p_discount_type public.marketplace_coupon_type, p_discount_percent numeric,
  p_discount_amount_piastres bigint, p_max_discount_piastres bigint,
  p_minimum_order_piastres bigint, p_starts_at timestamptz, p_expires_at timestamptz,
  p_total_limit integer, p_per_customer_limit integer, p_is_active boolean,
  p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(array['super_admin']::public.marketplace_admin_role[]);
  return public.save_platform_marketplace_coupon_as_admin_base_180000(
    p_coupon_id, p_code, p_title, p_discount_type, p_discount_percent,
    p_discount_amount_piastres, p_max_discount_piastres, p_minimum_order_piastres,
    p_starts_at, p_expires_at, p_total_limit, p_per_customer_limit, p_is_active,
    p_expected_updated_at, p_idempotency_key);
end;
$$;

alter function public.deactivate_platform_marketplace_coupon_as_admin(uuid, timestamptz, text)
  rename to deactivate_platform_marketplace_coupon_as_admin_base_180000;
create or replace function public.deactivate_platform_marketplace_coupon_as_admin(
  p_coupon_id uuid, p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(array['super_admin']::public.marketplace_admin_role[]);
  return public.deactivate_platform_marketplace_coupon_as_admin_base_180000(
    p_coupon_id, p_expected_updated_at, p_idempotency_key);
end;
$$;

-- Finance -----------------------------------------------------------------
alter function public.list_all_commission_statements_as_admin(text, integer, timestamptz)
  rename to list_all_commission_statements_as_admin_base_180000;
create or replace function public.list_all_commission_statements_as_admin(
  p_status text default null, p_limit integer default 50, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','finance']::public.marketplace_admin_role[]);
  return public.list_all_commission_statements_as_admin_base_180000(p_status, p_limit, p_before);
end;
$$;

alter function public.transition_commission_statement_as_admin(
  uuid, public.marketplace_statement_status, text, text, bigint
) rename to transition_commission_statement_as_admin_base_180000;
create or replace function public.transition_commission_statement_as_admin(
  p_statement_id uuid, p_next public.marketplace_statement_status,
  p_idempotency_key text, p_notes text default null,
  p_manual_adjustment_piastres bigint default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','finance']::public.marketplace_admin_role[]);
  return public.transition_commission_statement_as_admin_base_180000(
    p_statement_id, p_next, p_idempotency_key, p_notes, p_manual_adjustment_piastres);
end;
$$;

alter function public.review_cash_reconciliation_batch_as_admin(uuid, boolean, text)
  rename to review_cash_reconciliation_batch_as_admin_base_180000;
create or replace function public.review_cash_reconciliation_batch_as_admin(
  p_batch_id uuid, p_accept boolean, p_notes text default null
)
returns public.cash_reconciliation_batches language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin','finance']::public.marketplace_admin_role[]);
  return public.review_cash_reconciliation_batch_as_admin_base_180000(
    p_batch_id, p_accept, p_notes);
end;
$$;

create or replace function public.current_profile_is_marketplace_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'admin' and profile.is_active);
$$;

-- Order and delivery operations. Shared merchant/customer/driver paths remain
-- unchanged; only callers whose profile is admin need this capability.
alter function public.list_my_marketplace_orders(integer, timestamptz)
  rename to list_my_marketplace_orders_base_180000;
create or replace function public.list_my_marketplace_orders(
  p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.list_my_marketplace_orders_base_180000(p_limit, p_before);
end;
$$;

alter function public.get_my_marketplace_order(uuid)
  rename to get_my_marketplace_order_base_180000;
create or replace function public.get_my_marketplace_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_marketplace_order_base_180000(p_order_id);
end;
$$;

alter function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) rename to set_my_marketplace_order_status_base_180000;
create or replace function public.set_my_marketplace_order_status(
  p_order_id uuid, p_next public.marketplace_order_status,
  p_reason text default null, p_collected_amount public.egp_amount default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.set_my_marketplace_order_status_base_180000(
    p_order_id, p_next, p_reason, p_collected_amount);
end;
$$;

alter function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid)
  rename to assign_marketplace_delivery_driver_as_caller_base_180000;
create or replace function public.assign_marketplace_delivery_driver_as_caller(
  p_order_id uuid, p_driver_id uuid
)
returns public.marketplace_delivery_assignments
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.assign_marketplace_delivery_driver_as_caller_base_180000(p_order_id, p_driver_id);
end;
$$;

alter function public.offer_marketplace_delivery_to_driver_as_caller(uuid, uuid, integer)
  rename to offer_marketplace_delivery_to_driver_as_caller_base_180000;
create or replace function public.offer_marketplace_delivery_to_driver_as_caller(
  p_order_id uuid, p_driver_id uuid, p_expires_minutes integer default 5
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.offer_marketplace_delivery_to_driver_as_caller_base_180000(
    p_order_id, p_driver_id, p_expires_minutes);
end;
$$;

alter function public.review_my_marketplace_return_request(uuid, boolean, text, text)
  rename to review_my_marketplace_return_request_base_180000;
create or replace function public.review_my_marketplace_return_request(
  p_return_request_id uuid, p_approve boolean, p_notes text, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.review_my_marketplace_return_request_base_180000(
    p_return_request_id, p_approve, p_notes, p_idempotency_key);
end;
$$;

alter function public.receive_my_marketplace_return_request(uuid, jsonb, text, text)
  rename to receive_my_marketplace_return_request_base_180000;
create or replace function public.receive_my_marketplace_return_request(
  p_return_request_id uuid, p_restock_items jsonb, p_notes text, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.receive_my_marketplace_return_request_base_180000(
    p_return_request_id, p_restock_items, p_notes, p_idempotency_key);
end;
$$;

alter function public.list_my_marketplace_return_requests(uuid, integer, timestamptz)
  rename to list_my_marketplace_return_requests_base_180000;
create or replace function public.list_my_marketplace_return_requests(
  p_order_id uuid, p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','operations']::public.marketplace_admin_role[]);
  end if;
  return public.list_my_marketplace_return_requests_base_180000(
    p_order_id, p_limit, p_before);
end;
$$;

-- Finance views shared with drivers/merchants activate finance only for admin.
alter function public.list_my_cod_collections(text, integer, timestamptz)
  rename to list_my_cod_collections_base_180000;
create or replace function public.list_my_cod_collections(
  p_status text default null, p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','finance']::public.marketplace_admin_role[]);
  end if;
  return public.list_my_cod_collections_base_180000(p_status, p_limit, p_before);
end;
$$;

alter function public.list_my_cash_reconciliations(text, integer, timestamptz)
  rename to list_my_cash_reconciliations_base_180000;
create or replace function public.list_my_cash_reconciliations(
  p_status text default null, p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','finance']::public.marketplace_admin_role[]);
  end if;
  return public.list_my_cash_reconciliations_base_180000(p_status, p_limit, p_before);
end;
$$;

alter function public.get_my_cash_reconciliation(uuid)
  rename to get_my_cash_reconciliation_base_180000;
create or replace function public.get_my_cash_reconciliation(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','finance']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_cash_reconciliation_base_180000(p_batch_id);
end;
$$;

alter function public.get_my_commission_statement(uuid)
  rename to get_my_commission_statement_base_180000;
create or replace function public.get_my_commission_statement(p_statement_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','finance']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_commission_statement_base_180000(p_statement_id);
end;
$$;

-- Support functions are participant-scoped for customers and merchants. An
-- administrator can enter that path only with support or super-admin access.
alter function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  rename to create_my_marketplace_support_thread_base_180000;
create or replace function public.create_my_marketplace_support_thread(
  p_order_id uuid, p_store_id uuid, p_subject text, p_message text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.create_my_marketplace_support_thread_base_180000(
    p_order_id, p_store_id, p_subject, p_message);
end;
$$;

alter function public.list_my_marketplace_support_threads(text, integer, timestamptz)
  rename to list_my_marketplace_support_threads_base_180000;
create or replace function public.list_my_marketplace_support_threads(
  p_status text default null, p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.list_my_marketplace_support_threads_base_180000(p_status, p_limit, p_before);
end;
$$;

alter function public.get_my_marketplace_support_thread(uuid)
  rename to get_my_marketplace_support_thread_base_180000;
create or replace function public.get_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_marketplace_support_thread_base_180000(p_thread_id);
end;
$$;

alter function public.reply_my_marketplace_support_thread(uuid, text)
  rename to reply_my_marketplace_support_thread_base_180000;
create or replace function public.reply_my_marketplace_support_thread(p_thread_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.reply_my_marketplace_support_thread_base_180000(p_thread_id, p_body);
end;
$$;

alter function public.close_my_marketplace_support_thread(uuid)
  rename to close_my_marketplace_support_thread_base_180000;
create or replace function public.close_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.close_my_marketplace_support_thread_base_180000(p_thread_id);
end;
$$;

alter table public.admin_memberships enable row level security;
alter table public.admin_membership_mutations enable row level security;
alter table public.marketplace_admin_capability_context enable row level security;
revoke all on table public.admin_memberships, public.admin_membership_mutations,
  public.marketplace_admin_capability_context from public, anon, authenticated, service_role;
grant all on table public.admin_memberships, public.admin_membership_mutations,
  public.marketplace_admin_capability_context to service_role;

-- Revoke inherited EXECUTE from renamed implementations and every new public
-- function, then expose only the auth-bound entry points below.
do $$
declare routine record;
begin
  for routine in
    select namespace.nspname, procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and (procedure.proname like '%\_base\_180000' escape '\'
        or procedure.proname = any(array[
          'has_marketplace_admin_role', 'activate_marketplace_admin_capability',
          'is_marketplace_admin', 'is_admin', 'guard_last_marketplace_super_admin',
          'guard_last_marketplace_super_admin_profile',
          'get_my_marketplace_admin_roles', 'list_marketplace_admin_memberships',
          'save_marketplace_admin_membership',
          'current_profile_is_marketplace_admin',
          'list_pending_marketplace_moderation', 'moderate_store_as_admin',
          'moderate_product_as_admin', 'list_marketplace_delivery_zones_for_admin',
          'save_marketplace_delivery_zone_as_admin',
          'set_marketplace_delivery_zone_active_as_admin',
          'list_platform_marketplace_coupons_as_admin',
          'save_platform_marketplace_coupon_as_admin',
          'deactivate_platform_marketplace_coupon_as_admin',
          'list_all_commission_statements_as_admin',
          'transition_commission_statement_as_admin',
          'review_cash_reconciliation_batch_as_admin',
          'list_my_marketplace_orders', 'get_my_marketplace_order',
          'set_my_marketplace_order_status',
          'assign_marketplace_delivery_driver_as_caller',
          'offer_marketplace_delivery_to_driver_as_caller',
          'review_my_marketplace_return_request',
          'receive_my_marketplace_return_request',
          'list_my_marketplace_return_requests',
          'list_my_cod_collections', 'list_my_cash_reconciliations',
          'get_my_cash_reconciliation', 'get_my_commission_statement',
          'create_my_marketplace_support_thread',
          'list_my_marketplace_support_threads',
          'get_my_marketplace_support_thread',
          'reply_my_marketplace_support_thread',
          'close_my_marketplace_support_thread'
        ]))
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      routine.nspname, routine.proname, routine.arguments);
    execute format('grant execute on function %I.%I(%s) to service_role',
      routine.nspname, routine.proname, routine.arguments);
  end loop;
end $$;

grant execute on function public.has_marketplace_admin_role(public.marketplace_admin_role[])
  to authenticated;
grant execute on function public.is_marketplace_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_my_marketplace_admin_roles() to authenticated;
grant execute on function public.list_marketplace_admin_memberships() to authenticated;
grant execute on function public.save_marketplace_admin_membership(
  uuid, public.marketplace_admin_role[], boolean, bigint, text
) to authenticated;
grant execute on function public.list_pending_marketplace_moderation(text, integer, timestamptz)
  to authenticated;
grant execute on function public.moderate_store_as_admin(uuid, boolean, text) to authenticated;
grant execute on function public.moderate_product_as_admin(uuid, boolean, text) to authenticated;
grant execute on function public.list_marketplace_delivery_zones_for_admin() to authenticated;
grant execute on function public.save_marketplace_delivery_zone_as_admin(
  uuid, text, text, text, text, integer, timestamptz, text
) to authenticated;
grant execute on function public.set_marketplace_delivery_zone_active_as_admin(
  uuid, boolean, timestamptz, text
) to authenticated;
grant execute on function public.list_platform_marketplace_coupons_as_admin() to authenticated;
grant execute on function public.save_platform_marketplace_coupon_as_admin(
  uuid, text, text, public.marketplace_coupon_type, numeric, bigint, bigint,
  bigint, timestamptz, timestamptz, integer, integer, boolean, timestamptz, text
) to authenticated;
grant execute on function public.deactivate_platform_marketplace_coupon_as_admin(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.list_all_commission_statements_as_admin(
  text, integer, timestamptz
) to authenticated;
grant execute on function public.transition_commission_statement_as_admin(
  uuid, public.marketplace_statement_status, text, text, bigint
) to authenticated;
grant execute on function public.review_cash_reconciliation_batch_as_admin(
  uuid, boolean, text
) to authenticated;
grant execute on function public.list_my_marketplace_orders(integer, timestamptz) to authenticated;
grant execute on function public.get_my_marketplace_order(uuid) to authenticated;
grant execute on function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) to authenticated;
grant execute on function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid)
  to authenticated;
grant execute on function public.offer_marketplace_delivery_to_driver_as_caller(uuid, uuid, integer)
  to authenticated;
grant execute on function public.review_my_marketplace_return_request(uuid, boolean, text, text)
  to authenticated;
grant execute on function public.receive_my_marketplace_return_request(uuid, jsonb, text, text)
  to authenticated;
grant execute on function public.list_my_marketplace_return_requests(uuid, integer, timestamptz)
  to authenticated;
grant execute on function public.list_my_cod_collections(text, integer, timestamptz)
  to authenticated;
grant execute on function public.list_my_cash_reconciliations(text, integer, timestamptz)
  to authenticated;
grant execute on function public.get_my_cash_reconciliation(uuid) to authenticated;
grant execute on function public.get_my_commission_statement(uuid) to authenticated;
grant execute on function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.list_my_marketplace_support_threads(text, integer, timestamptz)
  to authenticated;
grant execute on function public.get_my_marketplace_support_thread(uuid) to authenticated;
grant execute on function public.reply_my_marketplace_support_thread(uuid, text) to authenticated;
grant execute on function public.close_my_marketplace_support_thread(uuid) to authenticated;

commit;
