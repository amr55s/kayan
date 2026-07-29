begin;

-- A driver's login number and public contact number serve different purposes.
-- Keep the login identifier in profiles.phone and store the public call action
-- separately so drivers and admins can change it without touching Auth.
alter table public.driver_profiles
  add column if not exists contact_phone text;

update public.driver_profiles as driver
set contact_phone = profile.phone
from public.profiles as profile
where profile.id = driver.profile_id
  and driver.contact_phone is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'driver_profiles_contact_phone_format'
      and conrelid = 'public.driver_profiles'::regclass
  ) then
    alter table public.driver_profiles
      add constraint driver_profiles_contact_phone_format
      check (
        contact_phone is null
        or contact_phone ~ '^01[0125][0-9]{8}$'
      );
  end if;
end;
$$;

create or replace function public.set_driver_contact_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contact_phone is null then
    select profile.phone
    into new.contact_phone
    from public.profiles as profile
    where profile.id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_profiles_set_contact_phone
  on public.driver_profiles;
create trigger driver_profiles_set_contact_phone
before insert on public.driver_profiles
for each row execute function public.set_driver_contact_phone();

revoke all on function public.set_driver_contact_phone()
  from public, anon, authenticated;

drop policy if exists "drivers read own profile" on public.driver_profiles;
create policy "drivers read own profile"
on public.driver_profiles for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "drivers update own public profile" on public.driver_profiles;
create policy "drivers update own public profile"
on public.driver_profiles for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

-- Keep the public RPC result shape stable. Existing clients still receive a
-- "phone" field, now sourced from the explicitly managed contact number.
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
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    coalesce(driver.contact_phone, legacy.phone, profile.phone),
    coalesce(driver.whatsapp, legacy.whatsapp, driver.contact_phone, profile.phone),
    coalesce(driver.vehicle_type, legacy.vehicle_type),
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

revoke all on function public.list_public_registered_drivers()
  from public, anon, authenticated;
grant execute on function public.list_public_registered_drivers()
  to service_role;

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
      and role = 'driver'
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

-- Rolling-deploy compatibility for the previous three-argument application.
create or replace function public.update_driver_public_profile(
  p_display_name text,
  p_whatsapp text default null,
  p_vehicle_type text default null
)
returns public.driver_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact text;
begin
  select coalesce(driver.contact_phone, profile.phone)
  into v_contact
  from public.driver_profiles as driver
  join public.profiles as profile
    on profile.id = driver.profile_id
  where driver.profile_id = auth.uid();

  return public.update_driver_public_profile(
    p_display_name,
    v_contact,
    p_whatsapp,
    p_vehicle_type
  );
end;
$$;

revoke all on function public.update_driver_public_profile(text, text, text, text)
  from public, anon;
revoke all on function public.update_driver_public_profile(text, text, text)
  from public, anon;
grant execute on function public.update_driver_public_profile(text, text, text, text)
  to authenticated;
grant execute on function public.update_driver_public_profile(text, text, text)
  to authenticated;

create or replace function public.admin_update_managed_driver(
  p_driver_id uuid,
  p_source text,
  p_name text default null,
  p_contact_phone text default null,
  p_whatsapp text default null,
  p_vehicle_type text default null,
  p_is_active boolean default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_legacy_driver_id uuid;
begin
  if p_source not in ('account', 'public') then
    raise exception 'invalid_driver_source';
  end if;

  if p_name is not null and char_length(trim(p_name)) not between 2 and 100 then
    raise exception 'invalid_display_name';
  end if;
  if p_contact_phone is not null
    and p_contact_phone !~ '^01[0125][0-9]{8}$'
  then
    raise exception 'invalid_contact_phone';
  end if;
  if p_whatsapp is not null and p_whatsapp !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_whatsapp';
  end if;
  if p_vehicle_type is not null and char_length(trim(p_vehicle_type)) > 60 then
    raise exception 'invalid_vehicle_type';
  end if;

  if p_source = 'account' then
    select driver.legacy_driver_id
    into v_legacy_driver_id
    from public.driver_profiles as driver
    where driver.profile_id = p_driver_id
    for update;

    if not found then
      raise exception 'driver_profile_missing';
    end if;

    update public.profiles
    set display_name = coalesce(nullif(trim(p_name), ''), display_name),
        is_active = coalesce(p_is_active, is_active)
    where id = p_driver_id
      and role = 'driver';

    if not found then
      raise exception 'driver_account_missing';
    end if;

    update public.driver_profiles
    set contact_phone = coalesce(p_contact_phone, contact_phone),
        whatsapp = coalesce(p_whatsapp, whatsapp),
        vehicle_type = case
          when p_vehicle_type is null then vehicle_type
          else nullif(trim(p_vehicle_type), '')
        end,
        is_available = case
          when p_is_active = false then false
          else is_available
        end,
        active_until = case
          when p_is_active = false then null
          else active_until
        end
    where profile_id = p_driver_id;

    if v_legacy_driver_id is not null then
      update public.drivers
      set name = coalesce(nullif(trim(p_name), ''), name),
          phone = coalesce(p_contact_phone, phone),
          whatsapp = coalesce(p_whatsapp, whatsapp),
          vehicle_type = case
            when p_vehicle_type is null then vehicle_type
            else nullif(trim(p_vehicle_type), '')
          end,
          is_active = case
            when p_is_active is null then is_active
            else false
          end,
          active_until = case
            when p_is_active is null then active_until
            else null
          end
      where id = v_legacy_driver_id;
    end if;
  else
    update public.drivers
    set name = coalesce(nullif(trim(p_name), ''), name),
        phone = coalesce(p_contact_phone, phone),
        whatsapp = coalesce(p_whatsapp, whatsapp),
        vehicle_type = case
          when p_vehicle_type is null then vehicle_type
          else nullif(trim(p_vehicle_type), '')
        end,
        is_active = coalesce(p_is_active, is_active),
        active_until = case
          when p_is_active = false then null
          when p_is_active = true then now() + interval '2 hours'
          else active_until
        end
    where id = p_driver_id;

    if not found then
      raise exception 'legacy_driver_missing';
    end if;
  end if;
end;
$$;

revoke all on function public.admin_update_managed_driver(
  uuid, text, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.admin_update_managed_driver(
  uuid, text, text, text, text, text, boolean
) to service_role;

commit;
