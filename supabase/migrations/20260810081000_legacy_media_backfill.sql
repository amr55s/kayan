begin;

-- Resumable, service-only migration ledger for media that predates the
-- DigitalOcean Spaces cut-over. No function in this migration deletes a
-- Supabase Storage object. Verified sources enter a separate retention hold
-- which requires an explicit, later release before a deletion worker may act.
create table public.legacy_media_backfill_runs (
  id uuid primary key,
  source_origin text not null check (
    source_origin ~ '^https://[a-z0-9][a-z0-9.-]{1,250}$'
    and source_origin !~ '/$'
  ),
  status text not null default 'discovering' check (
    status in ('discovering', 'processing', 'completed', 'completed_with_errors', 'cancelled')
  ),
  place_checkpoint uuid,
  driver_checkpoint uuid,
  places_discovery_complete boolean not null default false,
  drivers_discovery_complete boolean not null default false,
  discovered_count bigint not null default 0 check (discovered_count >= 0),
  completed_count bigint not null default 0 check (completed_count >= 0),
  stale_count bigint not null default 0 check (stale_count >= 0),
  dead_letter_count bigint not null default 0 check (dead_letter_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.legacy_media_backfill_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.legacy_media_backfill_runs(id) on delete cascade,
  target_kind text not null check (target_kind in ('place_image', 'driver_avatar')),
  entity_id uuid not null,
  image_ordinal integer check (
    (target_kind = 'place_image' and image_ordinal between 1 and 15)
    or (target_kind = 'driver_avatar' and image_ordinal is null)
  ),
  source_url text not null check (source_url ~ '^https://'),
  source_bucket text not null check (source_bucket in ('listing-images', 'driver-avatars')),
  source_object_key text not null check (
    char_length(source_object_key) between 1 and 1024
    and source_object_key !~ '(^|/)\.\.(/|$)'
    and source_object_key !~ '^[\\/]'
  ),
  status text not null default 'pending' check (
    status in ('pending', 'leased', 'retry', 'completed', 'stale', 'dead_letter')
  ),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  output_bucket text,
  output_object_key text check (
    output_object_key is null
    or output_object_key ~ '^media/legacy-backfill/(place|driver)/[a-f0-9]{2}/[a-f0-9]{64}\.webp$'
  ),
  output_public_url text check (output_public_url is null or output_public_url ~ '^https://'),
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[a-f0-9]{64}$'),
  output_size_bytes bigint check (output_size_bytes is null or output_size_bytes between 32 and 3670016),
  output_width integer check (output_width is null or output_width between 1 and 10000),
  output_height integer check (output_height is null or output_height between 1 and 10000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'leased'
    or (lease_token is not null and lease_expires_at is not null)
  ),
  check (
    status <> 'completed'
    or (
      source_sha256 is not null and output_bucket is not null
      and output_object_key is not null and output_public_url is not null
      and output_sha256 is not null and output_size_bytes is not null
      and output_width is not null and output_height is not null
      and completed_at is not null
    )
  )
);

create index legacy_media_backfill_claim_idx
  on public.legacy_media_backfill_items (run_id, available_at, id)
  where status in ('pending', 'retry', 'leased');
create index legacy_media_backfill_lease_idx
  on public.legacy_media_backfill_items (lease_expires_at, id)
  where status = 'leased';
create unique index legacy_media_backfill_source_unique_idx
  on public.legacy_media_backfill_items (
    run_id, target_kind, entity_id, coalesce(image_ordinal, 0), source_url
  );

create table public.legacy_media_source_deletion_outbox (
  id bigint generated always as identity primary key,
  item_id bigint not null unique references public.legacy_media_backfill_items(id) on delete restrict,
  source_bucket text not null check (source_bucket in ('listing-images', 'driver-avatars')),
  source_object_key text not null check (
    char_length(source_object_key) between 1 and 1024
    and source_object_key !~ '(^|/)\.\.(/|$)'
    and source_object_key !~ '^[\\/]'
  ),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verified_output_bucket text not null,
  verified_output_object_key text not null check (
    verified_output_object_key ~ '^media/legacy-backfill/(place|driver)/[a-f0-9]{2}/[a-f0-9]{64}\.webp$'
  ),
  verified_output_sha256 text not null check (verified_output_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'retention_hold' check (
    status in ('retention_hold', 'ready', 'deleted', 'cancelled')
  ),
  verified_at timestamptz not null,
  delete_after timestamptz not null check (delete_after >= verified_at + interval '30 days'),
  released_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legacy_media_source_delete_release_idx
  on public.legacy_media_source_deletion_outbox (delete_after, id)
  where status = 'retention_hold';

alter table public.legacy_media_backfill_runs enable row level security;
alter table public.legacy_media_backfill_items enable row level security;
alter table public.legacy_media_source_deletion_outbox enable row level security;
alter table public.legacy_media_backfill_runs force row level security;
alter table public.legacy_media_backfill_items force row level security;
alter table public.legacy_media_source_deletion_outbox force row level security;

revoke all on table public.legacy_media_backfill_runs from public, anon, authenticated;
revoke all on table public.legacy_media_backfill_items from public, anon, authenticated;
revoke all on table public.legacy_media_source_deletion_outbox from public, anon, authenticated;
grant select on table public.legacy_media_backfill_runs to service_role;
grant select on table public.legacy_media_backfill_items to service_role;
grant select on table public.legacy_media_source_deletion_outbox to service_role;
revoke all on sequence public.legacy_media_backfill_items_id_seq from public, anon, authenticated;
revoke all on sequence public.legacy_media_source_deletion_outbox_id_seq from public, anon, authenticated;

create or replace function public.begin_legacy_media_backfill(
  p_run_id uuid,
  p_source_origin text
)
returns public.legacy_media_backfill_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_run public.legacy_media_backfill_runs;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_run_id is null or p_source_origin is null
     or p_source_origin !~ '^https://[a-z0-9][a-z0-9.-]{1,250}$'
     or p_source_origin ~ '/$' then
    raise exception 'invalid_backfill_run' using errcode = '22023';
  end if;

  insert into public.legacy_media_backfill_runs (id, source_origin)
  values (p_run_id, p_source_origin)
  on conflict (id) do nothing;

  select * into v_run
  from public.legacy_media_backfill_runs as run
  where run.id = p_run_id
  for update;
  if v_run.source_origin <> p_source_origin or v_run.status = 'cancelled' then
    raise exception 'backfill_run_conflict' using errcode = '23505';
  end if;
  return v_run;
end;
$$;

create or replace function public.enqueue_legacy_media_backfill_items(
  p_run_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_run public.legacy_media_backfill_runs;
  v_item jsonb;
  v_kind text;
  v_entity_id uuid;
  v_ordinal integer;
  v_source_url text;
  v_source_bucket text;
  v_source_key text;
  v_inserted integer := 0;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_backfill_batch' using errcode = '22023';
  end if;
  select * into v_run from public.legacy_media_backfill_runs
  where id = p_run_id and status = 'discovering' for update;
  if v_run is null then
    raise exception 'backfill_run_not_discovering' using errcode = '55000';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_kind := v_item ->> 'targetKind';
    v_entity_id := (v_item ->> 'entityId')::uuid;
    v_ordinal := nullif(v_item ->> 'ordinal', '')::integer;
    v_source_url := v_item ->> 'sourceUrl';
    v_source_bucket := v_item ->> 'sourceBucket';
    v_source_key := v_item ->> 'sourceObjectKey';

    if v_kind not in ('place_image', 'driver_avatar')
       or v_source_url is null or v_source_key is null
       or char_length(v_source_key) not between 1 and 1024
       or v_source_key ~ '(^|/)\.\.(/|$)' or v_source_key ~ '^[\\/]'
       or (v_kind = 'place_image' and (
         v_source_bucket <> 'listing-images' or v_ordinal is null or v_ordinal not between 1 and 15
       ))
       or (v_kind = 'driver_avatar' and (
         v_source_bucket <> 'driver-avatars' or v_ordinal is not null
       ))
       or v_source_url not like v_run.source_origin || '/storage/v1/object/public/'
          || v_source_bucket || '/%' then
      raise exception 'invalid_backfill_item' using errcode = '22023';
    end if;

    if v_kind = 'place_image' then
      if not exists (
        select 1 from public.places as place
        where place.id = v_entity_id and place.images[v_ordinal] = v_source_url
      ) then
        continue;
      end if;
    elsif not exists (
      select 1 from public.driver_profiles as driver
      where driver.profile_id = v_entity_id and driver.avatar_url = v_source_url
    ) then
      continue;
    end if;

    insert into public.legacy_media_backfill_items (
      run_id, target_kind, entity_id, image_ordinal,
      source_url, source_bucket, source_object_key
    ) values (
      p_run_id, v_kind, v_entity_id, v_ordinal,
      v_source_url, v_source_bucket, v_source_key
    ) on conflict do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  update public.legacy_media_backfill_runs
  set discovered_count = discovered_count + v_inserted, updated_at = now()
  where id = p_run_id;
  return v_inserted;
end;
$$;

create or replace function public.checkpoint_legacy_media_backfill_discovery(
  p_run_id uuid,
  p_stream text,
  p_checkpoint uuid,
  p_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_stream = 'places' then
    update public.legacy_media_backfill_runs
    set place_checkpoint = coalesce(p_checkpoint, place_checkpoint),
        places_discovery_complete = places_discovery_complete or coalesce(p_complete, false),
        updated_at = now()
    where id = p_run_id and status = 'discovering';
  elsif p_stream = 'drivers' then
    update public.legacy_media_backfill_runs
    set driver_checkpoint = coalesce(p_checkpoint, driver_checkpoint),
        drivers_discovery_complete = drivers_discovery_complete or coalesce(p_complete, false),
        updated_at = now()
    where id = p_run_id and status = 'discovering';
  else
    raise exception 'invalid_backfill_stream' using errcode = '22023';
  end if;
  if not found then raise exception 'backfill_run_not_discovering' using errcode = '55000'; end if;
end;
$$;

create or replace function public.seal_legacy_media_backfill_discovery(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  update public.legacy_media_backfill_runs
  set status = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_run_id and status = 'discovering'
    and places_discovery_complete and drivers_discovery_complete;
  if not found then raise exception 'backfill_discovery_incomplete' using errcode = '55000'; end if;
end;
$$;

create or replace function public.claim_legacy_media_backfill_items(
  p_run_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  item_id bigint,
  lease_token uuid,
  target_kind text,
  entity_id uuid,
  image_ordinal integer,
  source_url text,
  source_bucket text,
  source_object_key text,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 25 or p_lease_seconds not between 60 and 600 then
    raise exception 'invalid_backfill_lease' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.legacy_media_backfill_runs
    where id = p_run_id and status = 'processing'
  ) then raise exception 'backfill_run_not_processing' using errcode = '55000'; end if;

  update public.legacy_media_backfill_items as item
  set status = case when item.attempts >= 5 then 'dead_letter' else 'retry' end,
      available_at = now(), lease_token = null, lease_expires_at = null,
      failure_code = 'lease_expired', updated_at = now()
  where item.run_id = p_run_id and item.status = 'leased'
    and item.lease_expires_at <= now();

  return query
  with candidates as (
    select item.id
    from public.legacy_media_backfill_items as item
    where item.run_id = p_run_id
      and item.status in ('pending', 'retry')
      and item.available_at <= now() and item.attempts < 5
    order by item.available_at, item.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.legacy_media_backfill_items as item
    set status = 'leased', attempts = item.attempts + 1,
        lease_token = extensions.gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        failure_code = null, updated_at = now()
    from candidates where item.id = candidates.id
    returning item.*
  )
  select claimed.id, claimed.lease_token, claimed.target_kind,
         claimed.entity_id, claimed.image_ordinal, claimed.source_url,
         claimed.source_bucket, claimed.source_object_key, claimed.attempts
  from claimed order by claimed.id;
end;
$$;

create or replace function public.complete_legacy_media_backfill_item(
  p_item_id bigint,
  p_lease_token uuid,
  p_source_sha256 text,
  p_output_bucket text,
  p_output_object_key text,
  p_output_public_url text,
  p_output_sha256 text,
  p_output_size_bytes bigint,
  p_output_width integer,
  p_output_height integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_item public.legacy_media_backfill_items;
  v_images text[];
  v_applied boolean := false;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_output_sha256 is null or p_output_sha256 !~ '^[a-f0-9]{64}$'
     or p_output_bucket is null or char_length(p_output_bucket) not between 3 and 63
     or p_output_object_key is null or p_output_public_url is null
     or p_output_object_key <> 'media/legacy-backfill/'
        || (case when p_output_object_key like 'media/legacy-backfill/place/%' then 'place/' else 'driver/' end)
        || substr(p_output_sha256, 1, 2) || '/' || p_output_sha256 || '.webp'
     or p_output_public_url !~ '^https://'
     or right(p_output_public_url, char_length(p_output_object_key)) <> p_output_object_key
     or p_output_size_bytes not between 32 and 3670016
     or p_output_width not between 1 and 10000 or p_output_height not between 1 and 10000 then
    raise exception 'invalid_backfill_output' using errcode = '22023';
  end if;

  select * into v_item from public.legacy_media_backfill_items as item
  where item.id = p_item_id for update;
  if v_item is null then raise exception 'backfill_item_not_found' using errcode = 'P0002'; end if;
  if v_item.status = 'completed' and v_item.output_sha256 = p_output_sha256 then return 'completed'; end if;
  if v_item.status = 'stale' then return 'stale'; end if;
  if v_item.status <> 'leased' or v_item.lease_token <> p_lease_token
     or v_item.lease_expires_at <= now() then
    raise exception 'backfill_lease_invalid' using errcode = '55000';
  end if;
  if (v_item.target_kind = 'place_image' and p_output_object_key not like 'media/legacy-backfill/place/%')
     or (v_item.target_kind = 'driver_avatar' and p_output_object_key not like 'media/legacy-backfill/driver/%') then
    raise exception 'backfill_output_kind_mismatch' using errcode = '22023';
  end if;

  if v_item.target_kind = 'place_image' then
    select images into v_images from public.places where id = v_item.entity_id for update;
    if v_images[v_item.image_ordinal] = v_item.source_url then
      v_images[v_item.image_ordinal] := p_output_public_url;
      update public.places set images = v_images where id = v_item.entity_id;
      v_applied := true;
    elsif v_images[v_item.image_ordinal] = p_output_public_url then
      v_applied := true;
    end if;
  else
    perform 1 from public.driver_profiles where profile_id = v_item.entity_id for update;
    update public.driver_profiles
    set avatar_url = p_output_public_url, avatar_path = p_output_object_key, updated_at = now()
    where profile_id = v_item.entity_id and avatar_url = v_item.source_url;
    v_applied := found;
    if not v_applied then
      select exists (
        select 1 from public.driver_profiles
        where profile_id = v_item.entity_id and avatar_url = p_output_public_url
          and avatar_path = p_output_object_key
      ) into v_applied;
    end if;
  end if;

  if not v_applied then
    update public.legacy_media_backfill_items
    set status = 'stale', lease_token = null, lease_expires_at = null,
        failure_code = 'source_changed', completed_at = now(), updated_at = now()
    where id = p_item_id;
    return 'stale';
  end if;

  update public.legacy_media_backfill_items
  set status = 'completed', source_sha256 = p_source_sha256,
      output_bucket = p_output_bucket, output_object_key = p_output_object_key,
      output_public_url = p_output_public_url, output_sha256 = p_output_sha256,
      output_size_bytes = p_output_size_bytes, output_width = p_output_width,
      output_height = p_output_height, lease_token = null, lease_expires_at = null,
      failure_code = null, completed_at = now(), updated_at = now()
  where id = p_item_id;

  insert into public.legacy_media_source_deletion_outbox (
    item_id, source_bucket, source_object_key, source_sha256,
    verified_output_bucket, verified_output_object_key, verified_output_sha256,
    verified_at, delete_after
  ) values (
    p_item_id, v_item.source_bucket, v_item.source_object_key, p_source_sha256,
    p_output_bucket, p_output_object_key, p_output_sha256,
    now(), now() + interval '30 days'
  ) on conflict (item_id) do nothing;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    null, 'legacy_media_backfill.completed', v_item.target_kind, p_item_id::text,
    jsonb_build_object('run_id', v_item.run_id, 'item_id', p_item_id)
  );
  return 'completed';
end;
$$;

create or replace function public.fail_legacy_media_backfill_item(
  p_item_id bigint,
  p_lease_token uuid,
  p_failure_code text,
  p_retryable boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_item public.legacy_media_backfill_items;
  v_status text;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_failure_code !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception 'invalid_failure_code' using errcode = '22023';
  end if;
  select * into v_item from public.legacy_media_backfill_items
  where id = p_item_id for update;
  if v_item is not null and v_item.status in ('retry', 'dead_letter')
     and v_item.lease_token = p_lease_token then
    return v_item.status;
  end if;
  if v_item is null or v_item.status <> 'leased' or v_item.lease_token <> p_lease_token then
    raise exception 'backfill_lease_invalid' using errcode = '55000';
  end if;
  v_status := case when not coalesce(p_retryable, false) or v_item.attempts >= 5
                   then 'dead_letter' else 'retry' end;
  update public.legacy_media_backfill_items
  set status = v_status, failure_code = p_failure_code,
      available_at = case when v_status = 'retry'
        then now() + make_interval(secs => least(900, 15 * (2 ^ greatest(v_item.attempts - 1, 0))::integer))
        else available_at end,
      lease_token = p_lease_token, lease_expires_at = null, updated_at = now()
  where id = p_item_id;
  if v_status = 'dead_letter' then
    insert into public.marketplace_audit_log (
      actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      null, 'legacy_media_backfill.dead_lettered', v_item.target_kind, p_item_id::text,
      jsonb_build_object('run_id', v_item.run_id, 'item_id', p_item_id, 'failure_code', p_failure_code)
    );
  end if;
  return v_status;
end;
$$;

create or replace function public.finish_legacy_media_backfill(p_run_id uuid)
returns public.legacy_media_backfill_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_active bigint;
  v_completed bigint;
  v_stale bigint;
  v_dead bigint;
  v_run public.legacy_media_backfill_runs;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  select count(*) filter (where status in ('pending', 'retry', 'leased')),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'stale'),
         count(*) filter (where status = 'dead_letter')
  into v_active, v_completed, v_stale, v_dead
  from public.legacy_media_backfill_items where run_id = p_run_id;
  if v_active > 0 then raise exception 'backfill_items_still_active' using errcode = '55000'; end if;

  update public.legacy_media_backfill_runs
  set status = case when v_dead > 0 then 'completed_with_errors' else 'completed' end,
      completed_count = v_completed, stale_count = v_stale,
      dead_letter_count = v_dead, finished_at = now(), updated_at = now()
  where id = p_run_id and status = 'processing'
  returning * into v_run;
  if v_run is null then raise exception 'backfill_run_not_processing' using errcode = '55000'; end if;
  return v_run;
end;
$$;

-- This only releases rows after verified retention. It never deletes a source.
create or replace function public.release_legacy_media_source_deletions(
  p_before timestamptz default now(),
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), session_user::text);
  v_count integer;
begin
  if v_role not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 then raise exception 'invalid_release_limit' using errcode = '22023'; end if;
  with candidates as (
    select id from public.legacy_media_source_deletion_outbox
    where status = 'retention_hold' and verified_at is not null
      and delete_after <= least(coalesce(p_before, now()), now())
    order by delete_after, id limit p_limit for update skip locked
  )
  update public.legacy_media_source_deletion_outbox as item
  set status = 'ready', released_at = now(), updated_at = now()
  from candidates where item.id = candidates.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.begin_legacy_media_backfill(uuid, text) from public, anon, authenticated;
revoke all on function public.enqueue_legacy_media_backfill_items(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.checkpoint_legacy_media_backfill_discovery(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.seal_legacy_media_backfill_discovery(uuid) from public, anon, authenticated;
revoke all on function public.claim_legacy_media_backfill_items(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_legacy_media_backfill_item(bigint, uuid, text, text, text, text, text, bigint, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_legacy_media_backfill_item(bigint, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.finish_legacy_media_backfill(uuid) from public, anon, authenticated;
revoke all on function public.release_legacy_media_source_deletions(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.begin_legacy_media_backfill(uuid, text) to service_role;
grant execute on function public.enqueue_legacy_media_backfill_items(uuid, jsonb) to service_role;
grant execute on function public.checkpoint_legacy_media_backfill_discovery(uuid, text, uuid, boolean) to service_role;
grant execute on function public.seal_legacy_media_backfill_discovery(uuid) to service_role;
grant execute on function public.claim_legacy_media_backfill_items(uuid, integer, integer) to service_role;
grant execute on function public.complete_legacy_media_backfill_item(bigint, uuid, text, text, text, text, text, bigint, integer, integer) to service_role;
grant execute on function public.fail_legacy_media_backfill_item(bigint, uuid, text, boolean) to service_role;
grant execute on function public.finish_legacy_media_backfill(uuid) to service_role;
grant execute on function public.release_legacy_media_source_deletions(timestamptz, integer) to service_role;

commit;
