begin;

-- Active legacy surfaces (/admin, /merchant and /driver) keep their existing
-- text URL columns, but every new object is tracked here before it is exposed.
-- The table is intentionally server-only; authenticated users interact only
-- through the narrowly scoped functions below.
create table public.legacy_media_uploads (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete restrict,
  folder text not null check (folder in ('requests', 'merchant', 'driver_avatar')),
  purpose text not null check (purpose in ('place', 'driver_avatar')),
  entity_id uuid,
  staging_key text not null unique check (
    staging_key like 'staging/%'
    and staging_key !~ '(^|/)\.\.(/|$)'
  ),
  expected_content_type text not null check (
    expected_content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  expected_size_bytes bigint not null check (expected_size_bytes between 32 and 3670016),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'staging' check (
    status in ('staging', 'processing', 'ready', 'claimed', 'failed', 'expired', 'deleted')
  ),
  asset_id uuid unique,
  bucket text,
  object_key text unique check (
    object_key is null
    or (object_key like 'media/%' and object_key !~ '(^|/)\.\.(/|$)')
  ),
  public_url text unique check (public_url is null or public_url ~ '^https://'),
  content_type text check (content_type is null or content_type = 'image/webp'),
  byte_size bigint check (byte_size is null or byte_size between 32 and 3670016),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  failure_code text check (failure_code is null or char_length(failure_code) <= 160),
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  claimed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purpose = 'place') = (folder in ('requests', 'merchant'))),
  check (purpose <> 'driver_avatar' or merchant_id is null),
  check (
    status not in ('ready', 'claimed')
    or (
      asset_id is not null and bucket is not null and object_key is not null
      and public_url is not null and content_type = 'image/webp'
      and byte_size is not null and width is not null and height is not null and sha256 is not null
    )
  ),
  check (status <> 'claimed' or (entity_id is not null and claimed_at is not null)),
  check (status not in ('deleted', 'expired') or deleted_at is not null)
);

create index legacy_media_uploads_owner_rate_idx
  on public.legacy_media_uploads (owner_id, created_at desc);
create index legacy_media_uploads_expiry_idx
  on public.legacy_media_uploads (expires_at, status)
  where status in ('staging', 'processing', 'ready');
create index legacy_media_uploads_entity_idx
  on public.legacy_media_uploads (purpose, entity_id, created_at desc)
  where status = 'claimed';

alter table public.legacy_media_uploads enable row level security;
revoke all on table public.legacy_media_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.legacy_media_uploads to service_role;

create or replace function public.claim_my_legacy_place_media(
  p_upload_ids uuid[],
  p_place_id uuid,
  p_retained_urls text[] default '{}'::text[]
)
returns table (upload_id uuid, public_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_place public.places;
  v_requested_count integer;
  v_ready_count integer;
  v_urls text[];
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_upload_ids is null or cardinality(p_upload_ids) not between 0 and 15 then
    raise exception 'invalid_upload_ids' using errcode = '22023';
  end if;
  select count(distinct item) into v_requested_count from unnest(p_upload_ids) as item;
  if v_requested_count <> cardinality(p_upload_ids) then
    raise exception 'duplicate_upload_ids' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles as profile
  where profile.id = v_uid and profile.is_active
  for share;
  if v_profile is null or v_profile.must_change_password
     or v_profile.role not in ('admin', 'merchant') then
    raise exception 'place_media_access_denied' using errcode = '42501';
  end if;
  if v_profile.role = 'admin'
     and coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' then
    raise exception 'admin_aal2_required' using errcode = '42501';
  end if;

  select * into v_place
  from public.places as place
  where place.id = p_place_id
  for update;
  if v_place is null then
    raise exception 'place_not_found' using errcode = 'P0002';
  end if;

  if v_profile.role = 'merchant' and not exists (
    select 1
    from public.merchant_branches as branch
    where branch.merchant_id = v_profile.merchant_id
      and branch.place_id = p_place_id
      and branch.is_active
  ) then
    raise exception 'place_media_access_denied' using errcode = '42501';
  end if;

  if p_retained_urls is null
     or cardinality(p_retained_urls) <> (
       select count(distinct retained) from unnest(p_retained_urls) as retained
     )
     or exists (
       select 1 from unnest(p_retained_urls) as retained
       where not (retained = any(coalesce(v_place.images, '{}'::text[])))
     ) then
    raise exception 'invalid_retained_place_media' using errcode = '22023';
  end if;

  perform 1
  from public.legacy_media_uploads as upload
  where upload.id = any(p_upload_ids)
  order by upload.id
  for update;

  select count(*) into v_ready_count
  from public.legacy_media_uploads as upload
  where upload.id = any(p_upload_ids)
    and upload.owner_id = v_uid
    and upload.purpose = 'place'
    and upload.status = 'ready'
    and upload.expires_at > now()
    and (
      (v_profile.role = 'admin' and upload.folder = 'requests' and upload.merchant_id is null)
      or (
        v_profile.role = 'merchant'
        and upload.folder = 'merchant'
        and upload.merchant_id = v_profile.merchant_id
      )
    );
  if v_ready_count <> v_requested_count then
    raise exception 'place_media_upload_not_claimable' using errcode = '42501';
  end if;

  select coalesce(array_agg(upload.public_url order by requested.ordinality), '{}'::text[]) into v_urls
  from unnest(p_upload_ids) with ordinality as requested(id, ordinality)
  join public.legacy_media_uploads as upload on upload.id = requested.id;

  if cardinality(p_retained_urls) + cardinality(v_urls) > 15 then
    raise exception 'place_media_limit_reached' using errcode = '23514';
  end if;

  update public.legacy_media_uploads as upload
  set status = 'claimed',
      entity_id = p_place_id,
      claimed_at = now(),
      updated_at = now()
  where upload.id = any(p_upload_ids);

  with removed as (
    update public.legacy_media_uploads as upload
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where upload.purpose = 'place'
      and upload.entity_id = p_place_id
      and upload.status = 'claimed'
      and not (upload.public_url = any(p_retained_urls))
      and upload.id <> all(p_upload_ids)
    returning upload.id, upload.bucket, upload.object_key
  )
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  )
  select
    'legacy.place.delete:' || removed.id::text,
    'media.delete_requested', 'place', p_place_id::text,
    jsonb_build_object('bucket', removed.bucket, 'object_key', removed.object_key)
  from removed
  on conflict (event_key) do nothing;

  update public.places
  set images = array(
    select deduplicated.item
    from (
      select value.item, min(value.ordinality) as first_position
      from unnest(p_retained_urls || v_urls)
        with ordinality as value(item, ordinality)
      group by value.item
    ) as deduplicated
    order by deduplicated.first_position
  )
  where id = p_place_id;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_uid, 'legacy_place_media_claimed', 'place', p_place_id::text,
    jsonb_build_object('upload_count', v_requested_count)
  );

  return query
  select upload.id, upload.public_url
  from unnest(p_upload_ids) with ordinality as requested(id, ordinality)
  join public.legacy_media_uploads as upload on upload.id = requested.id
  order by requested.ordinality;
end;
$$;

create or replace function public.replace_my_driver_avatar_media(p_upload_id uuid)
returns table (avatar_url text, avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_upload public.legacy_media_uploads;
  v_previous public.legacy_media_uploads;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_uid and profile.role = 'driver'
      and profile.is_active and not profile.must_change_password
  ) then
    raise exception 'driver_media_access_denied' using errcode = '42501';
  end if;

  select * into v_upload
  from public.legacy_media_uploads as upload
  where upload.id = p_upload_id
    and upload.owner_id = v_uid
    and upload.purpose = 'driver_avatar'
    and upload.folder = 'driver_avatar'
    and upload.status = 'ready'
    and upload.expires_at > now()
  for update;
  if v_upload is null then
    raise exception 'driver_avatar_not_claimable' using errcode = '42501';
  end if;

  perform 1 from public.driver_profiles where profile_id = v_uid for update;
  if not found then
    raise exception 'driver_profile_not_found' using errcode = 'P0002';
  end if;

  select upload.* into v_previous
  from public.legacy_media_uploads as upload
  where upload.purpose = 'driver_avatar'
    and upload.entity_id = v_uid
    and upload.status = 'claimed'
    and upload.id <> p_upload_id
  order by upload.claimed_at desc
  limit 1
  for update;

  update public.legacy_media_uploads
  set status = 'claimed', entity_id = v_uid, claimed_at = now(), updated_at = now()
  where id = p_upload_id;

  update public.driver_profiles
  set avatar_url = v_upload.public_url,
      avatar_path = v_upload.object_key,
      updated_at = now()
  where profile_id = v_uid;

  if v_previous is not null then
    update public.legacy_media_uploads
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where id = v_previous.id;
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    ) values (
      'legacy.avatar.delete:' || v_previous.id::text,
      'media.delete_requested', 'driver_avatar', v_uid::text,
      jsonb_build_object('bucket', v_previous.bucket, 'object_key', v_previous.object_key)
    ) on conflict (event_key) do nothing;
  end if;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_uid, 'driver_avatar_replaced', 'driver_profile', v_uid::text,
    jsonb_build_object('upload_id', p_upload_id)
  );

  return query select v_upload.public_url, v_upload.object_key;
end;
$$;

create or replace function public.expire_legacy_media_uploads(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row public.legacy_media_uploads;
begin
  for v_row in
    select upload.*
    from public.legacy_media_uploads as upload
    where upload.status in ('staging', 'processing', 'ready')
      and upload.expires_at <= now()
    order by upload.expires_at, upload.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    update public.legacy_media_uploads
    set status = 'expired', deleted_at = now(), updated_at = now()
    where id = v_row.id;

    if v_row.staging_key is not null then
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'legacy.stage.expire:' || v_row.id::text,
        'media.staging_delete_requested', v_row.purpose, v_row.id::text,
        jsonb_build_object('bucket', v_row.bucket, 'staging_key', v_row.staging_key)
      ) on conflict (event_key) do nothing;
    end if;
    if v_row.object_key is not null then
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'legacy.media.expire:' || v_row.id::text,
        'media.delete_requested', v_row.purpose, v_row.id::text,
        jsonb_build_object('bucket', v_row.bucket, 'object_key', v_row.object_key)
      ) on conflict (event_key) do nothing;
    elsif v_row.purpose = 'place' and v_row.status = 'processing' then
      -- Place finalization uses the upload UUID as the asset UUID, so an
      -- object written immediately before a process crash remains derivable.
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'legacy.media.ambiguous:' || v_row.id::text,
        'media.delete_requested', v_row.purpose, v_row.id::text,
        jsonb_build_object(
          'bucket', v_row.bucket,
          'object_key', 'media/legacy/place/pending/' || v_row.id::text || '.webp'
        )
      ) on conflict (event_key) do nothing;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cleanup_legacy_place_media_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  with removed as (
    update public.legacy_media_uploads as upload
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where upload.purpose = 'place'
      and upload.entity_id = old.id
      and upload.status = 'claimed'
    returning upload.id, upload.bucket, upload.object_key
  )
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  )
  select
    'legacy.place.deleted:' || removed.id::text,
    'media.delete_requested', 'place', old.id::text,
    jsonb_build_object('bucket', removed.bucket, 'object_key', removed.object_key)
  from removed
  on conflict (event_key) do nothing;
  return old;
end;
$$;

create trigger places_cleanup_legacy_media
after delete on public.places
for each row execute function public.cleanup_legacy_place_media_after_delete();

create or replace function public.cleanup_legacy_media_object_after_row_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.staging_key is not null and old.status in ('staging', 'processing') then
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    ) values (
      'legacy.row.stage.deleted:' || old.id::text,
      'media.staging_delete_requested', old.purpose, old.id::text,
      jsonb_build_object('bucket', old.bucket, 'staging_key', old.staging_key)
    ) on conflict (event_key) do nothing;
  end if;
  if old.object_key is not null and old.status <> 'deleted' then
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    ) values (
      'legacy.row.media.deleted:' || old.id::text,
      'media.delete_requested', old.purpose, coalesce(old.entity_id, old.id)::text,
      jsonb_build_object('bucket', old.bucket, 'object_key', old.object_key)
    ) on conflict (event_key) do nothing;
  end if;
  return old;
end;
$$;

create trigger legacy_media_uploads_cleanup_object
after delete on public.legacy_media_uploads
for each row execute function public.cleanup_legacy_media_object_after_row_delete();

revoke all on function public.claim_my_legacy_place_media(uuid[], uuid, text[])
  from public, anon, authenticated;
revoke all on function public.replace_my_driver_avatar_media(uuid)
  from public, anon, authenticated;
revoke all on function public.expire_legacy_media_uploads(integer)
  from public, anon, authenticated;
revoke all on function public.cleanup_legacy_place_media_after_delete()
  from public, anon, authenticated;
revoke all on function public.cleanup_legacy_media_object_after_row_delete()
  from public, anon, authenticated;
grant execute on function public.claim_my_legacy_place_media(uuid[], uuid, text[]) to authenticated;
grant execute on function public.replace_my_driver_avatar_media(uuid) to authenticated;
grant execute on function public.expire_legacy_media_uploads(integer) to service_role;

commit;
