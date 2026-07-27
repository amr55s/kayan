-- Unified account requests for captains and business owners.
-- Replaces the legacy public PIN workflow with reviewed Supabase Auth accounts.

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('driver', 'merchant')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  auth_user_id uuid not null unique,
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^01[0125][0-9]{8}$'),
  vehicle_type text check (vehicle_type is null or char_length(vehicle_type) <= 60),
  legacy_driver_id uuid references public.drivers(id) on delete set null,
  place_mode text check (
    (kind = 'driver' and place_mode is null)
    or (kind = 'merchant' and place_mode in ('existing', 'new'))
  ),
  existing_place_id uuid references public.places(id) on delete set null,
  place_title text,
  place_category text,
  place_whatsapp text,
  place_payment text,
  place_description text,
  place_images text[] not null default '{}',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    kind <> 'merchant'
    or (
      (place_mode = 'existing' and existing_place_id is not null)
      or (
        place_mode = 'new'
        and existing_place_id is null
        and char_length(trim(coalesce(place_title, ''))) between 2 and 150
        and place_category in (
          'restaurants', 'home_made', 'market', 'veggies',
          'pharmacy', 'crafts', 'services'
        )
      )
    )
  )
);

create unique index if not exists account_requests_pending_phone_kind_idx
  on public.account_requests (phone, kind)
  where status = 'pending';
create index if not exists account_requests_status_created_idx
  on public.account_requests (status, created_at desc);
create index if not exists account_requests_legacy_driver_idx
  on public.account_requests (legacy_driver_id)
  where legacy_driver_id is not null;
create index if not exists account_requests_existing_place_idx
  on public.account_requests (existing_place_id)
  where existing_place_id is not null;

drop trigger if exists account_requests_touch_updated_at on public.account_requests;
create trigger account_requests_touch_updated_at
before update on public.account_requests
for each row execute procedure public.touch_updated_at();

alter table public.driver_profiles
  add column if not exists legacy_driver_id uuid references public.drivers(id) on delete set null;

create unique index if not exists driver_profiles_legacy_driver_idx
  on public.driver_profiles (legacy_driver_id)
  where legacy_driver_id is not null;

alter table public.account_requests enable row level security;

drop policy if exists "admins manage account requests" on public.account_requests;
create policy "admins manage account requests"
on public.account_requests for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "requesters read own account request" on public.account_requests;
create policy "requesters read own account request"
on public.account_requests for select to authenticated
using (auth_user_id = auth.uid());

revoke all on public.account_requests from anon, authenticated;
grant select on public.account_requests to authenticated;

-- Public safe views are RPCs so claimed legacy cards cannot appear twice.
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
set search_path = public, pg_temp
as $$
  select
    legacy.id,
    legacy.name,
    legacy.phone,
    legacy.whatsapp,
    legacy.vehicle_type,
    legacy.is_active,
    legacy.active_until,
    legacy.created_at
  from public.drivers legacy
  where not exists (
    select 1
    from public.driver_profiles account_driver
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
  is_available boolean,
  active_until timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    profile.id,
    profile.display_name,
    profile.phone,
    coalesce(driver.whatsapp, legacy.whatsapp, profile.phone),
    coalesce(driver.vehicle_type, legacy.vehicle_type),
    (
      profile.is_active
      and driver.is_available
      and driver.active_until is not null
      and driver.active_until > now()
    ) as is_available,
    driver.active_until,
    coalesce(legacy.created_at, profile.created_at)
  from public.profiles profile
  join public.driver_profiles driver on driver.profile_id = profile.id
  left join public.drivers legacy on legacy.id = driver.legacy_driver_id
  where profile.role = 'driver'
    and profile.is_active;
$$;

revoke all on function public.list_public_legacy_drivers() from public;
revoke all on function public.list_public_registered_drivers() from public;
grant execute on function public.list_public_legacy_drivers() to anon, authenticated;
grant execute on function public.list_public_registered_drivers() to anon, authenticated;

-- Admin approval is one database transaction. The Auth user already exists but
-- has no profile and therefore no application permissions until this succeeds.
create or replace function public.approve_account_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.account_requests;
  v_legacy public.drivers;
  v_place public.places;
  v_place_id uuid;
  v_merchant_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;

  select *
  into v_request
  from public.account_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'request_already_processed';
  end if;
  if exists (select 1 from public.profiles where phone = v_request.phone) then
    raise exception 'phone_already_has_account';
  end if;

  if v_request.kind = 'driver' then
    if v_request.legacy_driver_id is not null then
      select *
      into v_legacy
      from public.drivers
      where id = v_request.legacy_driver_id
        and phone = v_request.phone
      for update;
      if v_legacy is null then
        raise exception 'legacy_driver_mismatch';
      end if;
      if exists (
        select 1 from public.driver_profiles
        where legacy_driver_id = v_legacy.id
      ) then
        raise exception 'legacy_driver_already_claimed';
      end if;
    end if;

    insert into public.profiles (
      id, role, phone, display_name, merchant_id, is_active, must_change_password
    )
    values (
      v_request.auth_user_id,
      'driver',
      v_request.phone,
      v_request.display_name,
      null,
      true,
      false
    );

    insert into public.driver_profiles (
      profile_id, whatsapp, vehicle_type, legacy_driver_id,
      is_available, active_until
    )
    values (
      v_request.auth_user_id,
      coalesce(v_request.whatsapp, v_legacy.whatsapp, v_request.phone),
      coalesce(v_request.vehicle_type, v_legacy.vehicle_type),
      v_request.legacy_driver_id,
      false,
      null
    );

    if v_legacy is not null then
      update public.drivers
      set name = v_request.display_name,
          whatsapp = coalesce(v_request.whatsapp, whatsapp, v_request.phone),
          vehicle_type = coalesce(v_request.vehicle_type, vehicle_type),
          is_active = false,
          active_until = null
      where id = v_legacy.id;
    end if;
  else
    if v_request.place_mode = 'existing' then
      select *
      into v_place
      from public.places
      where id = v_request.existing_place_id
      for update;
      if v_place is null then
        raise exception 'place_not_found';
      end if;
      if exists (
        select 1 from public.merchant_branches
        where place_id = v_place.id
      ) then
        raise exception 'place_already_claimed';
      end if;
      v_place_id := v_place.id;
    else
      insert into public.places (
        title, category, phone, whatsapp, instapay_vfcash,
        description, images, is_featured
      )
      values (
        trim(v_request.place_title),
        v_request.place_category,
        v_request.phone,
        coalesce(v_request.place_whatsapp, v_request.whatsapp),
        nullif(trim(coalesce(v_request.place_payment, '')), ''),
        nullif(trim(coalesce(v_request.place_description, '')), ''),
        coalesce(v_request.place_images, '{}'::text[]),
        false
      )
      returning * into v_place;
      v_place_id := v_place.id;
    end if;

    insert into public.merchants (display_name)
    values (coalesce(v_place.title, v_request.display_name))
    returning id into v_merchant_id;

    insert into public.profiles (
      id, role, phone, display_name, merchant_id, is_active, must_change_password
    )
    values (
      v_request.auth_user_id,
      'merchant',
      v_request.phone,
      v_request.display_name,
      v_merchant_id,
      true,
      false
    );

    insert into public.merchant_branches (
      merchant_id, place_id, name, phone, address, area, is_default, is_active
    )
    values (
      v_merchant_id,
      v_place_id,
      v_place.title,
      v_place.phone,
      'العنوان غير محدد',
      'الكيان',
      true,
      true
    );
  end if;

  update public.account_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = null
  where id = v_request.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    auth.uid(),
    'account_request_approved',
    'account_request',
    v_request.id::text,
    jsonb_build_object(
      'kind', v_request.kind,
      'auth_user_id', v_request.auth_user_id,
      'legacy_driver_id', v_request.legacy_driver_id,
      'place_id', v_place_id
    )
  );

  return v_request.auth_user_id;
end;
$$;

create or replace function public.reject_account_request(
  p_request_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.account_requests;
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;

  select *
  into v_request
  from public.account_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'request_already_processed';
  end if;

  update public.account_requests
  set status = 'rejected',
      rejection_reason = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = v_request.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    auth.uid(),
    'account_request_rejected',
    'account_request',
    v_request.id::text,
    jsonb_build_object('kind', v_request.kind, 'reason', p_reason)
  );

  return v_request.auth_user_id;
end;
$$;

create or replace function public.update_driver_public_profile(
  p_display_name text,
  p_whatsapp text default null,
  p_vehicle_type text default null
)
returns public.driver_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_display_name, ''));
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_vehicle text := nullif(trim(coalesce(p_vehicle_type, '')), '');
  v_driver public.driver_profiles;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver' and is_active
  ) then
    raise exception 'driver_access_required';
  end if;
  if char_length(v_name) not between 2 and 100 then
    raise exception 'invalid_display_name';
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
  set whatsapp = nullif(v_whatsapp, ''),
      vehicle_type = v_vehicle
  where profile_id = auth.uid()
  returning * into v_driver;

  update public.drivers
  set name = v_name,
      whatsapp = coalesce(nullif(v_whatsapp, ''), whatsapp),
      vehicle_type = v_vehicle
  where id = v_driver.legacy_driver_id;

  return v_driver;
end;
$$;

create or replace function public.renew_driver_availability()
returns public.driver_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver public.driver_profiles;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver' and is_active
  ) then
    raise exception 'driver_access_required';
  end if;

  update public.driver_profiles
  set is_available = true,
      active_until = now() + interval '2 hours',
      last_seen_at = now()
  where profile_id = auth.uid()
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

revoke all on function public.approve_account_request(uuid) from public;
revoke all on function public.reject_account_request(uuid, text) from public;
revoke all on function public.update_driver_public_profile(text, text, text) from public;
revoke all on function public.renew_driver_availability() from public;
grant execute on function public.approve_account_request(uuid) to authenticated;
grant execute on function public.reject_account_request(uuid, text) to authenticated;
grant execute on function public.update_driver_public_profile(text, text, text) to authenticated;
grant execute on function public.renew_driver_availability() to authenticated;

-- PIN registration/renewal is permanently disabled.
revoke all on function public.register_public_driver(text, text, text, text) from public;
revoke all on function public.renew_public_driver(text, text) from public;
drop function if exists public.register_public_driver(text, text, text, text);
drop function if exists public.renew_public_driver(text, text);
alter table public.drivers
  drop column if exists pin_code,
  drop column if exists pin_code_hash;

-- New listings now go through the reviewed account workflow only.
drop policy if exists "Allow anon insert pending_requests" on public.pending_requests;
drop policy if exists "Allow public insert for pending requests" on public.pending_requests;
revoke insert on public.pending_requests from anon, authenticated;
