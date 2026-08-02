begin;

alter table public.driver_profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'driver-avatars',
  'driver-avatars',
  true,
  2097152,
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public cards are loaded through this service-role-only RPC. Recreate it so
-- the additional return column is explicit and rolling deploys remain clear.
drop function if exists public.list_public_registered_drivers();
create function public.list_public_registered_drivers()
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
    coalesce(driver.contact_phone, legacy.phone, profile.phone),
    coalesce(driver.whatsapp, legacy.whatsapp, driver.contact_phone, profile.phone),
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

revoke all on function public.list_public_registered_drivers()
  from public, anon, authenticated;
grant execute on function public.list_public_registered_drivers()
  to service_role;

commit;
