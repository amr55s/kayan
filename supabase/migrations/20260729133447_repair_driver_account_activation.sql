begin;

-- Repair historical driver accounts that have a valid profile but missed the
-- second driver_profiles insert because the original provisioning flow used
-- two separate requests. The function is service-role only and idempotent.
create or replace function public.admin_repair_driver_account(
  p_profile_id uuid,
  p_is_active boolean default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text;
  v_profile_exists boolean := false;
begin
  select profile.phone
  into v_phone
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.role = 'driver'
  for update;

  v_profile_exists := found;
  if not v_profile_exists then
    raise exception 'driver_account_missing';
  end if;

  if p_is_active is not null then
    update public.profiles
    set is_active = p_is_active
    where id = p_profile_id
      and role = 'driver';
  end if;

  insert into public.driver_profiles (
    profile_id,
    contact_phone,
    whatsapp,
    is_available,
    active_until
  )
  values (
    p_profile_id,
    v_phone,
    v_phone,
    false,
    null
  )
  on conflict (profile_id) do nothing;

  if p_is_active = false then
    update public.driver_profiles
    set is_available = false,
        active_until = null
    where profile_id = p_profile_id;
  end if;

  return true;
end;
$$;

revoke all on function public.admin_repair_driver_account(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_repair_driver_account(uuid, boolean)
  to service_role;

-- One-time repair for any existing account created between the profile insert
-- and a failed driver-profile insert.
insert into public.driver_profiles (
  profile_id,
  contact_phone,
  whatsapp,
  is_available,
  active_until
)
select
  profile.id,
  profile.phone,
  profile.phone,
  false,
  null
from public.profiles as profile
left join public.driver_profiles as driver
  on driver.profile_id = profile.id
where profile.role = 'driver'
  and driver.profile_id is null
on conflict (profile_id) do nothing;

commit;
