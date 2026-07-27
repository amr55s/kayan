-- ====================================================================
-- KAYAN HUB - MIGRATION V6: OPEN HYBRID DIRECTORY
-- Public directory access, safe driver cards, merchant/place ownership,
-- and atomic moderation actions.
-- ====================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------
-- Schema additions
-- --------------------------------------------------------------------

alter table public.drivers
  add column if not exists pin_code text,
  add column if not exists pin_code_hash text,
  add column if not exists vehicle_type text;

alter table public.driver_profiles
  add column if not exists vehicle_type text;

alter table public.merchant_branches
  add column if not exists place_id uuid references public.places(id) on delete set null;

create unique index if not exists merchant_branch_place_idx
  on public.merchant_branches (place_id)
  where place_id is not null;

alter table public.feedback_requests
  add column if not exists target_place_id uuid references public.places(id) on delete set null,
  add column if not exists proposed_phone text,
  add column if not exists proposed_images text[] not null default '{}';

-- Preserve existing five-digit PINs without exposing them through public reads.
update public.drivers
set pin_code_hash = extensions.crypt(pin_code, extensions.gen_salt('bf'))
where pin_code is not null
  and pin_code_hash is null;

-- --------------------------------------------------------------------
-- RLS and grants
-- --------------------------------------------------------------------

alter table public.places enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.pending_requests enable row level security;
alter table public.feedback_requests enable row level security;

drop policy if exists "Allow public select places" on public.places;
drop policy if exists "Allow public read access for places" on public.places;
drop policy if exists "public can read published places" on public.places;
create policy "Allow public select places"
on public.places for select to anon, authenticated
using (true);

drop policy if exists "Allow public select active drivers" on public.drivers;
drop policy if exists "Allow public read access for drivers" on public.drivers;
drop policy if exists "Allow public select drivers" on public.drivers;
create policy "Allow public select drivers"
on public.drivers for select to anon, authenticated
using (true);

-- RLS controls rows; column grants keep PIN material out of the public API.
revoke select on public.drivers from anon, authenticated;
grant select (
  id, name, phone, whatsapp, vehicle_type, is_active, active_until, created_at
) on public.drivers to anon, authenticated;
revoke insert, update, delete on public.drivers from anon;
grant insert, update, delete on public.drivers to authenticated;

drop policy if exists "Allow public select driver_profiles" on public.driver_profiles;
create policy "Allow public select driver_profiles"
on public.driver_profiles for select to anon, authenticated
using (true);

revoke select on public.driver_profiles from anon, authenticated;
grant select (
  profile_id, whatsapp, vehicle_type, is_available, active_until, created_at, updated_at
) on public.driver_profiles to anon, authenticated;

drop policy if exists "drivers update own public profile" on public.driver_profiles;
create policy "drivers update own public profile"
on public.driver_profiles for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());
grant update (whatsapp, vehicle_type) on public.driver_profiles to authenticated;

drop policy if exists "Allow anon insert pending_requests" on public.pending_requests;
drop policy if exists "Allow public insert for pending requests" on public.pending_requests;
create policy "Allow anon insert pending_requests"
on public.pending_requests for insert to anon, authenticated
with check (status = 'pending');

drop policy if exists "Allow anon insert feedback_requests" on public.feedback_requests;
drop policy if exists "Allow public insert for feedback requests" on public.feedback_requests;
create policy "Allow anon insert feedback_requests"
on public.feedback_requests for insert to anon, authenticated
with check (status = 'pending');

grant insert on public.pending_requests to anon, authenticated;
grant insert on public.feedback_requests to anon, authenticated;

drop policy if exists "merchants update linked places" on public.places;
create policy "merchants update linked places"
on public.places for update to authenticated
using (
  exists (
    select 1
    from public.merchant_branches branch
    where branch.place_id = places.id
      and public.is_current_merchant_for(branch.merchant_id)
  )
)
with check (
  exists (
    select 1
    from public.merchant_branches branch
    where branch.place_id = places.id
      and public.is_current_merchant_for(branch.merchant_id)
  )
);

grant update (
  title, phone, whatsapp, instapay_vfcash, description, images
) on public.places to authenticated;

-- Directory media stays public to read. Anonymous writes are limited to
-- request-specific folders and supported image formats.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public submit directory media" on storage.objects;
create policy "public submit directory media"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'listing-images'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and (storage.foldername(name))[1] in ('feedback', 'requests')
);

drop policy if exists "merchants upload linked place media" on storage.objects;
create policy "merchants upload linked place media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and (storage.foldername(name))[1] = 'merchant'
  and (public.current_profile()).role = 'merchant'
);

-- --------------------------------------------------------------------
-- Sanitized public registered-driver directory
-- --------------------------------------------------------------------

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
    driver.whatsapp,
    driver.vehicle_type,
    (
      profile.is_active
      and driver.is_available
      and driver.active_until is not null
      and driver.active_until > now()
    ) as is_available,
    driver.active_until,
    profile.created_at
  from public.profiles profile
  join public.driver_profiles driver on driver.profile_id = profile.id
  where profile.role = 'driver'
    and profile.is_active;
$$;

revoke all on function public.list_public_registered_drivers() from public;
grant execute on function public.list_public_registered_drivers() to anon, authenticated;

-- --------------------------------------------------------------------
-- Safe public driver registration and availability renewal
-- --------------------------------------------------------------------

create or replace function public.register_public_driver(
  p_name text,
  p_phone text,
  p_whatsapp text default null,
  p_vehicle_type text default null
)
returns table (
  driver_id uuid,
  activation_pin text,
  available_until timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := coalesce(nullif(trim(p_name), ''), 'كابتن توصيل');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_whatsapp text;
  v_vehicle text := nullif(trim(coalesce(p_vehicle_type, '')), '');
  v_pin text;
  v_driver public.drivers;
begin
  if v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_phone';
  end if;
  if char_length(v_name) > 100 or char_length(coalesce(v_vehicle, '')) > 60 then
    raise exception 'invalid_driver_details';
  end if;

  if exists (select 1 from public.drivers where phone = v_phone) then
    raise exception 'driver_already_registered';
  end if;

  v_whatsapp := regexp_replace(coalesce(nullif(p_whatsapp, ''), v_phone), '[^0-9]', '', 'g');
  if v_whatsapp !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_whatsapp';
  end if;

  v_pin := (10000 + floor(random() * 90000))::integer::text;

  insert into public.drivers (
    name,
    phone,
    whatsapp,
    vehicle_type,
    pin_code_hash,
    is_active,
    active_until
  )
  values (
    v_name,
    v_phone,
    v_whatsapp,
    v_vehicle,
    crypt(v_pin, gen_salt('bf')),
    true,
    now() + interval '2 hours'
  )
  returning * into v_driver;

  return query
  select v_driver.id, v_pin, v_driver.active_until;
end;
$$;

create or replace function public.renew_public_driver(
  p_phone text,
  p_pin text
)
returns table (
  driver_id uuid,
  driver_name text,
  available_until timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_pin text := trim(coalesce(p_pin, ''));
  v_driver public.drivers;
begin
  if v_phone !~ '^01[0125][0-9]{8}$' or v_pin !~ '^[0-9]{5}$' then
    raise exception 'invalid_credentials';
  end if;

  select *
  into v_driver
  from public.drivers
  where phone = v_phone
    and pin_code_hash is not null
    and crypt(v_pin, pin_code_hash) = pin_code_hash
  for update;

  if v_driver is null then
    raise exception 'invalid_credentials';
  end if;

  update public.drivers
  set is_active = true,
      active_until = now() + interval '2 hours'
  where id = v_driver.id
  returning * into v_driver;

  return query
  select v_driver.id, coalesce(v_driver.name, 'كابتن توصيل'), v_driver.active_until;
end;
$$;

revoke all on function public.register_public_driver(text, text, text, text) from public;
revoke all on function public.renew_public_driver(text, text) from public;
grant execute on function public.register_public_driver(text, text, text, text) to anon, authenticated;
grant execute on function public.renew_public_driver(text, text) to anon, authenticated;

-- --------------------------------------------------------------------
-- Atomic admin moderation functions
-- --------------------------------------------------------------------

create or replace function public.apply_feedback_to_place(
  p_feedback_id uuid,
  p_image_mode text default 'append'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.feedback_requests;
  v_place public.places;
  v_images text[];
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;
  if p_image_mode not in ('append', 'replace') then
    raise exception 'invalid_image_mode';
  end if;

  select *
  into v_request
  from public.feedback_requests
  where id = p_feedback_id
    and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'request_already_processed';
  end if;
  if v_request.target_place_id is null then
    raise exception 'target_place_required';
  end if;

  select *
  into v_place
  from public.places
  where id = v_request.target_place_id
  for update;

  if v_place is null then
    raise exception 'target_place_missing';
  end if;

  v_images := case
    when coalesce(cardinality(v_request.proposed_images), 0) > 0
      then v_request.proposed_images
    else coalesce(v_request.images, '{}'::text[])
  end;
  if nullif(trim(coalesce(v_request.proposed_phone, '')), '') is null
     and coalesce(cardinality(v_images), 0) = 0 then
    raise exception 'no_applicable_changes';
  end if;
  if nullif(trim(coalesce(v_request.proposed_phone, '')), '') is not null
     and trim(v_request.proposed_phone) !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_phone';
  end if;
  if p_image_mode = 'replace' and coalesce(cardinality(v_images), 0) = 0 then
    raise exception 'replacement_images_required';
  end if;

  update public.places
  set phone = coalesce(nullif(trim(v_request.proposed_phone), ''), v_place.phone),
      images = case
        when coalesce(cardinality(v_images), 0) = 0 then v_place.images
        when p_image_mode = 'replace' then v_images
        else array(
          select distinct image_url
          from unnest(coalesce(v_place.images, '{}'::text[]) || v_images) as image_url
          where image_url is not null and image_url <> ''
        )
      end
  where id = v_place.id;

  update public.feedback_requests
  set status = 'resolved'
  where id = v_request.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    auth.uid(),
    'feedback_applied',
    'place',
    v_place.id::text,
    jsonb_build_object(
      'feedback_id', v_request.id,
      'image_mode', p_image_mode
    )
  );

  return v_place.id;
end;
$$;

create or replace function public.approve_pending_place(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.pending_requests;
  v_place_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;

  select *
  into v_request
  from public.pending_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'request_already_processed';
  end if;

  insert into public.places (
    title,
    category,
    phone,
    whatsapp,
    instapay_vfcash,
    description,
    images,
    is_featured
  )
  values (
    trim(v_request.title),
    v_request.category,
    trim(v_request.phone),
    nullif(trim(v_request.whatsapp), ''),
    nullif(trim(v_request.instapay_vfcash), ''),
    nullif(trim(v_request.description), ''),
    coalesce(v_request.images, '{}'::text[]),
    false
  )
  returning id into v_place_id;

  update public.pending_requests
  set status = 'approved'
  where id = v_request.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, metadata
  )
  values (
    auth.uid(),
    'pending_place_approved',
    'place',
    v_place_id::text,
    jsonb_build_object('request_id', v_request.id)
  );

  return v_place_id;
end;
$$;

revoke all on function public.apply_feedback_to_place(uuid, text) from public;
revoke all on function public.approve_pending_place(uuid) from public;
grant execute on function public.apply_feedback_to_place(uuid, text) to authenticated;
grant execute on function public.approve_pending_place(uuid) to authenticated;
