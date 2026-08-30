-- Reviewed real-estate listings.  Requests retain opaque upload tokens until an
-- administrator approves them; the approval transaction is the only path that
-- can publish both the listing and its images.
begin;

alter table public.account_requests
  add column if not exists real_estate_details jsonb;

alter table public.account_requests
  drop constraint if exists account_requests_place_selection_check,
  add constraint account_requests_place_selection_check
    check (
      kind <> 'merchant'
      or (
        (place_mode = 'existing' and existing_place_id is not null)
        or (
          place_mode = 'new'
          and existing_place_id is null
          and char_length(trim(coalesce(place_title, ''))) between 2 and 150
          and place_category in (
            'restaurants', 'stores', 'home_made', 'market', 'veggies',
            'pharmacy', 'crafts', 'services', 'real_estate'
          )
        )
      )
    ),
  add constraint account_requests_real_estate_payload_check
    check (
      (place_category is distinct from 'real_estate' and real_estate_details is null)
      or (
        kind = 'merchant' and place_mode = 'new'
        and jsonb_typeof(real_estate_details) = 'object'
        and real_estate_details ->> 'offer_type' in ('rent', 'sale')
        and real_estate_details ->> 'property_type' in (
          'apartment', 'villa', 'house', 'shop', 'office', 'land', 'other'
        )
        and coalesce(real_estate_details ->> 'price_egp', '') ~ '^[1-9][0-9]{0,8}$'
        and (
          real_estate_details -> 'rooms' is null
          or real_estate_details -> 'rooms' = 'null'::jsonb
          or (real_estate_details ->> 'rooms' ~ '^[1-9][0-9]?$'
              and (real_estate_details ->> 'rooms')::integer between 1 and 50)
        )
        and (
          real_estate_details -> 'bathrooms' is null
          or real_estate_details -> 'bathrooms' = 'null'::jsonb
          or (real_estate_details ->> 'bathrooms' ~ '^[1-9][0-9]?$'
              and (real_estate_details ->> 'bathrooms')::integer between 1 and 20)
        )
        and (
          real_estate_details -> 'area_sqm' is null
          or real_estate_details -> 'area_sqm' = 'null'::jsonb
          or (real_estate_details ->> 'area_sqm' ~ '^[1-9][0-9]{0,5}$'
              and (real_estate_details ->> 'area_sqm')::integer between 1 and 100000)
        )
        and (
          real_estate_details -> 'floor' is null
          or real_estate_details -> 'floor' = 'null'::jsonb
          or (real_estate_details ->> 'floor' ~ '^[0-9]{1,3}$'
              and (real_estate_details ->> 'floor')::integer between 0 and 100)
        )
        and (
          real_estate_details -> 'furnishing' is null
          or real_estate_details -> 'furnishing' = 'null'::jsonb
          or real_estate_details ->> 'furnishing' in ('furnished', 'semi_furnished', 'unfurnished')
        )
        and (
          real_estate_details ->> 'property_type' not in ('apartment', 'villa', 'house', 'other')
          or (real_estate_details ->> 'rooms' ~ '^[1-9][0-9]?$'
              and (real_estate_details ->> 'rooms')::integer between 1 and 50)
        )
        and cardinality(place_images) between 5 and 7
        and array_to_string(place_images, ',', '') ~* (
          '^dairtak-upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
          || '(,dairtak-upload:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){4,6}$'
        )
      )
    );

create table if not exists public.place_real_estate (
  place_id uuid primary key references public.places(id) on delete cascade,
  offer_type text not null check (offer_type in ('rent', 'sale')),
  property_type text not null check (
    property_type in ('apartment', 'villa', 'house', 'shop', 'office', 'land', 'other')
  ),
  price_egp bigint not null check (price_egp between 1 and 999999999),
  rooms integer check (rooms between 1 and 50),
  bathrooms integer check (bathrooms between 1 and 20),
  area_sqm integer check (area_sqm between 1 and 100000),
  floor integer check (floor between 0 and 100),
  furnishing text check (furnishing in ('furnished', 'semi_furnished', 'unfurnished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    property_type not in ('apartment', 'villa', 'house', 'other')
    or rooms is not null
  )
);

create index if not exists place_real_estate_offer_price_idx
  on public.place_real_estate (offer_type, price_egp);
create index if not exists place_real_estate_property_type_idx
  on public.place_real_estate (property_type);

alter table public.place_real_estate enable row level security;
revoke all on table public.place_real_estate from public, anon, authenticated;
grant select on table public.place_real_estate to anon, authenticated;
grant select, insert, update, delete on table public.place_real_estate to service_role;

create policy "public read published real estate details"
on public.place_real_estate for select to anon, authenticated
using (
  exists (
    select 1 from public.places as place
    where place.id = place_real_estate.place_id
      and place.category = 'real_estate'
  )
);

create or replace function public.assert_real_estate_place_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.places as place
    where place.id = new.place_id and place.category = 'real_estate'
  ) then
    raise exception 'real_estate_place_category_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists place_real_estate_category_guard on public.place_real_estate;
create trigger place_real_estate_category_guard
before insert or update of place_id on public.place_real_estate
for each row execute function public.assert_real_estate_place_category();

drop trigger if exists place_real_estate_touch_updated_at on public.place_real_estate;
create trigger place_real_estate_touch_updated_at
before update on public.place_real_estate
for each row execute procedure public.touch_updated_at();

revoke all on function public.assert_real_estate_place_category() from public, anon, authenticated;

-- Replacing this SECURITY DEFINER procedure keeps the previously reviewed
-- account workflow intact while making real-estate approval atomic.
create or replace function public.approve_account_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.account_requests;
  v_legacy public.drivers;
  v_place public.places;
  v_place_id uuid;
  v_merchant_id uuid;
  v_upload_ids uuid[];
  v_upload_urls text[];
  v_ready_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;

  select * into v_request
  from public.account_requests
  where id = p_request_id and status = 'pending'
  for update;
  if v_request is null then raise exception 'request_already_processed'; end if;
  if exists (select 1 from public.profiles where phone = v_request.phone) then
    raise exception 'phone_already_has_account';
  end if;

  if v_request.place_category = 'real_estate' then
    if v_request.kind <> 'merchant' or v_request.place_mode <> 'new'
       or v_request.real_estate_details is null
       or cardinality(v_request.place_images) not between 5 and 7 then
      raise exception 'invalid_real_estate_request' using errcode = '23514';
    end if;
    select array_agg(substring(image_token from 16)::uuid order by ordinality)
    into v_upload_ids
    from unnest(v_request.place_images) with ordinality as requested(image_token, ordinality);
    if cardinality(v_upload_ids) <> cardinality(v_request.place_images)
       or cardinality(v_upload_ids) <> (select count(distinct item) from unnest(v_upload_ids) as item) then
      raise exception 'invalid_real_estate_media' using errcode = '23514';
    end if;
    perform 1 from public.legacy_media_uploads as upload
    where upload.id = any(v_upload_ids)
    order by upload.id for update;
    select count(*), array_agg(upload.public_url order by requested.ordinality)
    into v_ready_count, v_upload_urls
    from unnest(v_upload_ids) with ordinality as requested(id, ordinality)
    join public.legacy_media_uploads as upload on upload.id = requested.id
    where upload.owner_id = v_request.auth_user_id
      and upload.purpose = 'place'
      and upload.folder = 'requests'
      and upload.merchant_id is null
      and upload.status = 'ready'
      and upload.expires_at > pg_catalog.now();
    if v_ready_count <> cardinality(v_upload_ids)
       or cardinality(v_upload_urls) not between 5 and 7 then
      raise exception 'real_estate_media_not_claimable' using errcode = '42501';
    end if;
  end if;

  if v_request.kind = 'driver' then
    if v_request.legacy_driver_id is not null then
      select * into v_legacy from public.drivers
      where id = v_request.legacy_driver_id and phone = v_request.phone for update;
      if v_legacy is null then raise exception 'legacy_driver_mismatch'; end if;
      if exists (select 1 from public.driver_profiles where legacy_driver_id = v_legacy.id) then
        raise exception 'legacy_driver_already_claimed';
      end if;
    end if;
    insert into public.profiles (id, role, phone, display_name, merchant_id, is_active, must_change_password)
    values (v_request.auth_user_id, 'driver', v_request.phone, v_request.display_name, null, true, false);
    insert into public.driver_profiles (profile_id, whatsapp, vehicle_type, legacy_driver_id, is_available, active_until)
    values (v_request.auth_user_id, coalesce(v_request.whatsapp, v_legacy.whatsapp, v_request.phone),
      coalesce(v_request.vehicle_type, v_legacy.vehicle_type), v_request.legacy_driver_id, false, null);
    if v_legacy is not null then
      update public.drivers set name = v_request.display_name,
        whatsapp = coalesce(v_request.whatsapp, whatsapp, v_request.phone),
        vehicle_type = coalesce(v_request.vehicle_type, vehicle_type), is_active = false, active_until = null
      where id = v_legacy.id;
    end if;
  else
    if v_request.place_mode = 'existing' then
      select * into v_place from public.places
      where id = v_request.existing_place_id for update;
      if v_place is null then raise exception 'place_not_found'; end if;
      if exists (select 1 from public.merchant_branches where place_id = v_place.id) then
        raise exception 'place_already_claimed';
      end if;
      v_place_id := v_place.id;
    else
      insert into public.places (
        title, category, phone, whatsapp, instapay_vfcash, description, images, is_featured
      ) values (
        trim(v_request.place_title), v_request.place_category, v_request.phone,
        coalesce(v_request.place_whatsapp, v_request.whatsapp),
        nullif(trim(coalesce(v_request.place_payment, '')), ''),
        nullif(trim(coalesce(v_request.place_description, '')), ''),
        case when v_request.place_category = 'real_estate' then '{}'::text[]
             else coalesce(v_request.place_images, '{}'::text[]) end,
        false
      ) returning * into v_place;
      v_place_id := v_place.id;
    end if;
    insert into public.merchants (display_name) values (coalesce(v_place.title, v_request.display_name))
    returning id into v_merchant_id;
    insert into public.profiles (id, role, phone, display_name, merchant_id, is_active, must_change_password)
    values (v_request.auth_user_id, 'merchant', v_request.phone, v_request.display_name, v_merchant_id, true, false);
    insert into public.merchant_branches (merchant_id, place_id, name, phone, address, area, is_default, is_active)
    values (v_merchant_id, v_place_id, v_place.title, v_place.phone,
      coalesce(nullif(trim(coalesce(v_request.place_address, '')), ''), 'العنوان غير محدد'),
      'الكيان', true, true);

    if v_request.place_category = 'real_estate' then
      update public.legacy_media_uploads as upload
      set status = 'claimed', entity_id = v_place_id, claimed_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where upload.id = any(v_upload_ids) and upload.owner_id = v_request.auth_user_id
        and upload.status = 'ready';
      update public.places set images = v_upload_urls where id = v_place_id;
      insert into public.place_real_estate (
        place_id, offer_type, property_type, price_egp, rooms, bathrooms, area_sqm, floor, furnishing
      ) values (
        v_place_id,
        v_request.real_estate_details ->> 'offer_type',
        v_request.real_estate_details ->> 'property_type',
        (v_request.real_estate_details ->> 'price_egp')::bigint,
        nullif(v_request.real_estate_details ->> 'rooms', '')::integer,
        nullif(v_request.real_estate_details ->> 'bathrooms', '')::integer,
        nullif(v_request.real_estate_details ->> 'area_sqm', '')::integer,
        nullif(v_request.real_estate_details ->> 'floor', '')::integer,
        nullif(v_request.real_estate_details ->> 'furnishing', '')
      );
    end if;
  end if;

  update public.account_requests set status = 'approved', reviewed_by = auth.uid(),
    reviewed_at = pg_catalog.now(), rejection_reason = null where id = v_request.id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'account_request_approved', 'account_request', v_request.id::text,
    jsonb_build_object('kind', v_request.kind, 'auth_user_id', v_request.auth_user_id,
      'legacy_driver_id', v_request.legacy_driver_id, 'place_id', v_place_id,
      'real_estate', v_request.place_category = 'real_estate'));
  return v_request.auth_user_id;
end;
$$;

revoke all on function public.approve_account_request(uuid) from public, anon, authenticated;
grant execute on function public.approve_account_request(uuid) to authenticated;

commit;
