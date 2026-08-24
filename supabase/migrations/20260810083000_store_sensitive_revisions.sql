begin;

-- Published stores keep serving their approved snapshot while name, description,
-- address and image changes wait in one immutable, complete revision.
create table public.store_revisions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  base_snapshot jsonb not null check (jsonb_typeof(base_snapshot) = 'object'),
  proposed_snapshot jsonb not null check (jsonb_typeof(proposed_snapshot) = 'object'),
  image_snapshot jsonb not null check (
    jsonb_typeof(image_snapshot) = 'array' and jsonb_array_length(image_snapshot) <= 15
  ),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name_snapshot text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_name_snapshot text,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  approved_at timestamptz,
  rejected_at timestamptz,
  unique (store_id, idempotency_key),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null
      and approved_at is null and rejected_at is null)
    or (status = 'approved' and reviewed_at is not null
      and approved_at is not null and rejected_at is null)
    or (status = 'rejected' and reviewed_at is not null
      and approved_at is null and rejected_at is not null)
  )
);

create unique index store_revisions_one_pending_idx
  on public.store_revisions (store_id) where status = 'pending';
create index store_revisions_moderation_idx
  on public.store_revisions (status, created_at desc, id);
create index store_revisions_merchant_idx
  on public.store_revisions (merchant_id, created_at desc, id);

create table public.store_revision_apply_context (
  transaction_id bigint not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  revision_id uuid not null references public.store_revisions(id) on delete cascade,
  primary key (transaction_id, store_id)
);

create or replace function public.store_sensitive_snapshot(p_store public.stores)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug', p_store.slug,
    'name', p_store.name,
    'short_description', p_store.short_description,
    'description', p_store.description,
    'city', p_store.city,
    'area', p_store.area,
    'address_text', p_store.address_text
  );
$$;

create or replace function public.store_live_image_snapshot(p_store_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', image.media_asset_id,
    'position', image.position,
    'alt_text', image.alt_text,
    'kind', image.kind
  ) order by image.position), '[]'::jsonb)
  from public.store_images as image
  join public.media_assets as asset
    on asset.id = image.media_asset_id and asset.status = 'active'
  where image.store_id = p_store_id;
$$;

create or replace function public.guard_store_revision_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'store_revisions_are_immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id or new.store_id is distinct from old.store_id
     or new.merchant_id is distinct from old.merchant_id
     or new.base_snapshot is distinct from old.base_snapshot
     or new.proposed_snapshot is distinct from old.proposed_snapshot
     or new.image_snapshot is distinct from old.image_snapshot
     or new.request_hash is distinct from old.request_hash
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'store_revision_snapshot_is_immutable' using errcode = '55000';
  end if;
  if new.status = old.status then
    if new.reviewed_at is distinct from old.reviewed_at
       or new.review_notes is distinct from old.review_notes
       or new.approved_at is distinct from old.approved_at
       or new.rejected_at is distinct from old.rejected_at
       or not (new.created_by is not distinct from old.created_by
         or (old.created_by is not null and new.created_by is null))
       or not (new.reviewed_by is not distinct from old.reviewed_by
         or (old.reviewed_by is not null and new.reviewed_by is null)) then
      raise exception 'store_revision_snapshot_is_immutable' using errcode = '55000';
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.status not in ('approved','rejected')
     or new.created_by is distinct from old.created_by then
    raise exception 'invalid_store_revision_transition' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger store_revisions_immutable
before update or delete on public.store_revisions
for each row execute function public.guard_store_revision_immutability();

create or replace function public.stage_store_revision(
  p_store_id uuid,
  p_proposed_snapshot jsonb,
  p_image_snapshot jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.store_revisions
language plpgsql security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_base jsonb;
  v_proposed jsonb;
  v_images jsonb;
  v_hash text;
  v_actor_name text;
  v_existing public.store_revisions;
  v_pending public.store_revisions;
  v_revision public.store_revisions;
  v_orphan public.media_assets;
begin
  if p_actor_id is null
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'invalid_store_revision_request' using errcode = '22023';
  end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store is null or v_store.status <> 'published' then
    raise exception 'published_store_revision_required' using errcode = '55000';
  end if;
  if not public.can_catalog_store(v_store.id) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;

  v_base := public.store_sensitive_snapshot(v_store);
  v_proposed := coalesce(p_proposed_snapshot, v_base);
  v_images := coalesce(p_image_snapshot, public.store_live_image_snapshot(v_store.id));
  if jsonb_typeof(v_proposed) <> 'object' or jsonb_typeof(v_images) <> 'array'
     or jsonb_array_length(v_images) > 15
     or char_length(trim(coalesce(v_proposed ->> 'name', ''))) not between 2 and 150
     or coalesce(v_proposed ->> 'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(coalesce(v_proposed ->> 'slug', '')) > 80
     or (nullif(v_proposed ->> 'short_description', '') is not null and
       char_length(trim(v_proposed ->> 'short_description')) not between 2 and 240)
     or char_length(coalesce(v_proposed ->> 'description', '')) > 5000
     or char_length(coalesce(v_proposed ->> 'city', '')) > 120
     or char_length(coalesce(v_proposed ->> 'area', '')) > 120
     or char_length(coalesce(v_proposed ->> 'address_text', '')) > 500
     or exists (select 1 from public.stores as other_store
       where other_store.slug = v_proposed ->> 'slug' and other_store.id <> v_store.id)
     or (select count(*) from jsonb_array_elements(v_images)) <>
        (select count(distinct item.value ->> 'asset_id')
         from jsonb_array_elements(v_images) as item(value))
     or (select count(*) from jsonb_array_elements(v_images) as item(value)
         where item.value ->> 'kind' = 'logo') > 1
     or (select count(*) from jsonb_array_elements(v_images) as item(value)
         where item.value ->> 'kind' = 'cover') > 1
     or exists (
       select 1 from jsonb_array_elements(v_images) with ordinality as item(value, ordinality)
       where coalesce(item.value ->> 'asset_id', '') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1)
           <> item.ordinality::integer - 1
         or coalesce(item.value ->> 'kind', '') not in ('logo','cover','gallery')
         or char_length(coalesce(item.value ->> 'alt_text', '')) > 240
     )
     or exists (
       select 1 from jsonb_array_elements(v_images) as item(value)
       left join public.media_assets as asset
         on asset.id = (item.value ->> 'asset_id')::uuid
        and asset.entity_type = 'store' and asset.entity_id = v_store.id
        and asset.store_id = v_store.id and asset.status = 'active'
       where asset.id is null
     ) then
    raise exception 'invalid_store_revision_snapshot' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    v_store.id::text || '|' || v_proposed::text || '|' || v_images::text, 'UTF8'
  ), 'sha256'), 'hex');
  select * into v_existing from public.store_revisions
  where store_id = v_store.id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.request_hash <> v_hash then
      raise exception 'store_revision_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_pending from public.store_revisions
  where store_id = v_store.id and status = 'pending';
  if v_pending is not null then
    for v_orphan in
      select asset.*
      from jsonb_array_elements(v_pending.image_snapshot) as old_item(value)
      join public.media_assets as asset on asset.id = (old_item.value ->> 'asset_id')::uuid
      where asset.status = 'active'
        and not exists (select 1 from jsonb_array_elements(v_images) as new_item(value)
          where (new_item.value ->> 'asset_id')::uuid = asset.id)
        and not exists (select 1 from public.store_images as live_image
          where live_image.store_id = v_store.id and live_image.media_asset_id = asset.id)
      for update of asset
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_orphan.id;
      insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
      values ('media.delete_requested:' || v_orphan.id::text, 'media.delete_requested',
        'media_asset', v_orphan.id::text, jsonb_build_object('asset_id', v_orphan.id,
          'bucket', v_orphan.bucket, 'object_key', v_orphan.object_key,
          'reason', 'superseded_store_revision'))
      on conflict (event_key) do nothing;
    end loop;
  end if;

  update public.store_revisions
  set status = 'rejected', reviewed_at = now(), rejected_at = now(),
      review_notes = 'superseded_by_newer_revision'
  where store_id = v_store.id and status = 'pending';
  select display_name into v_actor_name from public.profiles where id = p_actor_id;
  insert into public.store_revisions (
    store_id, merchant_id, base_snapshot, proposed_snapshot, image_snapshot,
    request_hash, idempotency_key, created_by, created_by_name_snapshot
  ) values (
    v_store.id, v_store.merchant_id, v_base, v_proposed, v_images,
    v_hash, p_idempotency_key, p_actor_id, v_actor_name
  ) returning * into v_revision;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) values (p_actor_id, 'store.revision_submitted', 'store_revision', v_revision.id::text,
    jsonb_build_object('store_id', v_store.id, 'request_hash', v_hash),
    jsonb_build_object('actor_name_snapshot', v_actor_name));
  return v_revision;
end;
$$;

-- Defense in depth: published content cannot be changed with direct table DML.
create or replace function public.guard_published_store_sensitive_dml()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'published'
     and (new.slug, new.name, new.short_description, new.description,
       new.city, new.area, new.address_text) is distinct from
       (old.slug, old.name, old.short_description, old.description,
       old.city, old.area, old.address_text)
     and not exists (select 1 from public.store_revision_apply_context as context
       where context.transaction_id = txid_current() and context.store_id = old.id) then
    raise exception 'published_store_sensitive_changes_require_revision' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger stores_require_sensitive_revision
before update of slug, name, short_description, description, city, area, address_text
on public.stores for each row execute function public.guard_published_store_sensitive_dml();

create or replace function public.guard_published_store_image_dml()
returns trigger language plpgsql set search_path = '' as $$
declare v_store_id uuid := case when tg_op = 'DELETE' then old.store_id else new.store_id end;
begin
  if exists (select 1 from public.stores where id = v_store_id and status = 'published')
     and not exists (select 1 from public.store_revision_apply_context as context
       where context.transaction_id = txid_current() and context.store_id = v_store_id) then
    raise exception 'published_store_images_require_revision' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger store_images_require_revision
before insert or update or delete on public.store_images
for each row execute function public.guard_published_store_image_dml();

-- Preserve the operational RPC signature. Draft edits remain immediate;
-- published edits create a full revision and leave updated_at/public data alone.
create or replace function public.update_my_marketplace_store(
  p_store_id uuid, p_name text, p_short_description text, p_description text,
  p_city text, p_area text, p_address_text text,
  p_expected_updated_at timestamptz, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_hash text; v_replayed boolean; v_response jsonb;
  v_store public.stores; v_before public.stores; v_revision public.store_revisions;
  v_pending public.store_revisions; v_proposed jsonb;
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
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'store_id', p_store_id, 'name', p_name, 'short_description', p_short_description,
    'description', p_description, 'city', p_city, 'area', p_area,
    'address_text', p_address_text, 'expected', p_expected_updated_at)::text, 'UTF8'
  ), 'sha256'), 'hex');
  select replayed, response into v_replayed, v_response
  from public.marketplace_operational_replay(v_actor_id, p_idempotency_key, 'store.update', v_hash);
  if v_replayed then return v_response; end if;
  select * into v_before from public.stores where id = p_store_id for update;
  if v_before.id is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_before.updated_at <> p_expected_updated_at then raise exception 'version_conflict' using errcode = '40001'; end if;
  if v_before.status in ('pending_review','suspended','archived') then
    raise exception 'store_not_editable' using errcode = '22023';
  end if;
  if v_before.status = 'published' then
    select * into v_pending from public.store_revisions
    where store_id = v_before.id and status = 'pending';
    v_proposed := public.store_sensitive_snapshot(v_before) || jsonb_build_object(
      'name', p_name,
      'short_description', nullif(trim(coalesce(p_short_description, '')), ''),
      'description', nullif(trim(coalesce(p_description, '')), ''),
      'city', nullif(trim(coalesce(p_city, '')), ''),
      'area', nullif(trim(coalesce(p_area, '')), ''),
      'address_text', nullif(trim(coalesce(p_address_text, '')), '')
    );
    v_revision := public.stage_store_revision(v_before.id, v_proposed,
      coalesce(v_pending.image_snapshot, public.store_live_image_snapshot(v_before.id)),
      v_actor_id, 'store-update:' || p_idempotency_key);
    v_response := jsonb_build_object('id', v_before.id, 'status', v_before.status,
      'updated_at', v_before.updated_at, 'pending_revision', true,
      'revision_id', v_revision.id, 'idempotent', false);
  else
    update public.stores set name = p_name,
      short_description = nullif(trim(coalesce(p_short_description, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), ''),
      city = nullif(trim(coalesce(p_city, '')), ''),
      area = nullif(trim(coalesce(p_area, '')), ''),
      address_text = nullif(trim(coalesce(p_address_text, '')), '')
    where id = p_store_id returning * into v_store;
    v_response := jsonb_build_object('id', v_store.id, 'status', v_store.status,
      'updated_at', v_store.updated_at, 'pending_revision', false, 'idempotent', false);
    insert into public.marketplace_audit_log
      (actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (v_actor_id, 'store.updated', 'store', p_store_id::text,
      to_jsonb(v_before), to_jsonb(v_store));
  end if;
  perform public.marketplace_record_operational_mutation(v_actor_id, p_idempotency_key,
    'store.update', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function public.list_my_marketplace_stores()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', store.id, 'merchant_id', store.merchant_id,
      'name', coalesce(revision.proposed_snapshot ->> 'name', store.name),
      'slug', coalesce(revision.proposed_snapshot ->> 'slug', store.slug),
      'short_description', case when revision.id is null then store.short_description
        else nullif(revision.proposed_snapshot ->> 'short_description', '') end,
      'description', case when revision.id is null then store.description
        else nullif(revision.proposed_snapshot ->> 'description', '') end,
      'status', store.status, 'delivery_mode', store.delivery_mode,
      'city', case when revision.id is null then store.city else nullif(revision.proposed_snapshot ->> 'city', '') end,
      'area', case when revision.id is null then store.area else nullif(revision.proposed_snapshot ->> 'area', '') end,
      'address_text', case when revision.id is null then store.address_text else nullif(revision.proposed_snapshot ->> 'address_text', '') end,
      'moderation_notes', store.moderation_notes, 'updated_at', store.updated_at,
      'pending_revision', case when revision.id is null then null else jsonb_build_object(
        'id', revision.id, 'submitted_at', revision.created_at,
        'image_count', jsonb_array_length(revision.image_snapshot)) end
    ) order by store.created_at, store.id)
    from public.stores as store
    left join public.store_revisions as revision
      on revision.store_id = store.id and revision.status = 'pending'
    where public.can_manage_store(store.id)
  ), '[]'::jsonb);
end;
$$;

-- Finalization mirrors the proven product workflow and stages store media when
-- the store is already public. A logo/cover upload replaces that slot only in
-- the proposed snapshot; galleries append up to the 15-image cap.
create or replace function public.finalize_media_upload(
  p_session_id uuid, p_asset_id uuid, p_bucket text, p_object_key text,
  p_public_url text, p_content_type text, p_byte_size bigint, p_width integer,
  p_height integer, p_sha256 text, p_idempotency_key text
)
returns table (asset_id uuid, "position" smallint, public_url text, idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.upload_sessions;
  v_product public.products;
  v_store public.stores;
  v_position smallint;
  v_existing_url text;
  v_images jsonb;
  v_product_revision public.product_revisions;
  v_store_revision public.store_revisions;
  v_kind text;
begin
  select * into v_session from public.upload_sessions where id = p_session_id for update;
  if v_session is null then raise exception 'upload_session_not_found' using errcode = 'P0002'; end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if v_session.status = 'ready' and v_session.finalized_asset_id is not null then
    if v_session.finalize_idempotency_key is distinct from p_idempotency_key then
      raise exception 'upload_idempotency_conflict' using errcode = '23505';
    end if;
    select asset.public_url into v_existing_url from public.media_assets as asset
    where asset.id = v_session.finalized_asset_id;
    if v_session.entity_type = 'product' then
      select image.position into v_position from public.product_images as image
      where image.media_asset_id = v_session.finalized_asset_id;
      if v_position is null then
        select (item.ordinality - 1)::smallint into v_position
        from public.product_revisions as revision,
             jsonb_array_elements(revision.image_snapshot) with ordinality as item(value, ordinality)
        where revision.product_id = v_session.entity_id and revision.status = 'pending'
          and (item.value ->> 'asset_id')::uuid = v_session.finalized_asset_id
        limit 1;
      end if;
    elsif v_session.entity_type = 'store' then
      select image.position into v_position from public.store_images as image
      where image.media_asset_id = v_session.finalized_asset_id;
      if v_position is null then
        select (item.ordinality - 1)::smallint into v_position
        from public.store_revisions as revision,
             jsonb_array_elements(revision.image_snapshot) with ordinality as item(value, ordinality)
        where revision.store_id = v_session.entity_id and revision.status = 'pending'
          and (item.value ->> 'asset_id')::uuid = v_session.finalized_asset_id
        limit 1;
      end if;
    end if;
    return query select v_session.finalized_asset_id, v_position, v_existing_url, true;
    return;
  end if;
  if v_session.status <> 'processing' then
    raise exception 'upload_session_not_processing' using errcode = '55000';
  end if;
  if v_session.expires_at <= now() then raise exception 'upload_session_expired' using errcode = '55000'; end if;
  if p_content_type <> 'image/webp' or p_byte_size not between 32 and 12582912
     or p_width not between 1 and 10000 or p_height not between 1 and 10000
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or (v_session.entity_type in ('product','store') and (p_public_url is null or p_public_url !~ '^https://'))
     or (v_session.entity_type not in ('product','store') and p_public_url is not null)
     or p_object_key !~ ('^media/' || v_session.merchant_id::text || '/' ||
       v_session.entity_type::text || '/' || v_session.entity_id::text || '/') then
    raise exception 'invalid_finalized_media' using errcode = '22023';
  end if;

  if v_session.entity_type = 'product' then
    select * into v_product from public.products where id = v_session.entity_id for update;
    if v_product.status = 'active' then
      select * into v_product_revision from public.product_revisions
      where product_id = v_product.id and status = 'pending';
      v_images := coalesce(v_product_revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id));
      v_position := jsonb_array_length(v_images)::smallint;
      if v_position >= 10 then raise exception 'product_image_limit_reached' using errcode = '23514'; end if;
    else
      select candidate::smallint into v_position from generate_series(0, 9) as candidate
      where not exists (select 1 from public.product_images
        where product_id = v_product.id and position = candidate)
      order by candidate limit 1;
      if v_position is null then raise exception 'product_image_limit_reached' using errcode = '23514'; end if;
    end if;
  elsif v_session.entity_type = 'store' then
    select * into v_store from public.stores where id = v_session.entity_id for update;
    v_kind := case when v_session.slot in ('logo','cover') then v_session.slot else 'gallery' end;
    if v_store.status = 'published' then
      select * into v_store_revision from public.store_revisions
      where store_id = v_store.id and status = 'pending';
      v_images := coalesce(v_store_revision.image_snapshot, public.store_live_image_snapshot(v_store.id));
      if v_kind in ('logo','cover') then
        select coalesce(jsonb_agg(
          (kept.value - 'position') || jsonb_build_object('position', kept.row_number - 1)
          order by kept.row_number
        ), '[]'::jsonb)
        into v_images
        from (
          select item.value, row_number() over (order by item.ordinality) as row_number
          from jsonb_array_elements(v_images) with ordinality as item(value, ordinality)
          where item.value ->> 'kind' <> v_kind
        ) as kept;
      end if;
      v_position := jsonb_array_length(v_images)::smallint;
      if v_position >= 15 then raise exception 'store_image_limit_reached' using errcode = '23514'; end if;
    else
      select candidate::smallint into v_position from generate_series(0, 14) as candidate
      where not exists (select 1 from public.store_images
        where store_id = v_store.id and position = candidate)
      order by candidate limit 1;
      if v_position is null then raise exception 'store_image_limit_reached' using errcode = '23514'; end if;
    end if;
  end if;

  insert into public.media_assets (
    id, owner_id, owner_name_snapshot, merchant_id, store_id, entity_type, entity_id, slot,
    visibility, bucket, object_key, public_url, content_type, byte_size, width, height, sha256
  ) values (
    p_asset_id, v_session.owner_id, v_session.owner_name_snapshot,
    v_session.merchant_id, v_session.store_id, v_session.entity_type, v_session.entity_id,
    v_session.slot, case when v_session.entity_type in ('product','store') then 'public' else 'private' end,
    p_bucket, p_object_key, p_public_url, p_content_type, p_byte_size, p_width, p_height, p_sha256
  );
  if v_session.entity_type = 'product' then
    if v_product.status = 'active' then
      v_images := v_images || jsonb_build_array(jsonb_build_object(
        'asset_id', p_asset_id, 'position', v_position, 'alt_text', v_product.name));
      perform public.stage_product_revision(v_product.id,
        coalesce(v_product_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
        v_images, v_session.owner_id, 'media-finalize:' || v_session.id::text);
    else
      insert into public.product_images (product_id, media_asset_id, position)
      values (v_session.entity_id, p_asset_id, v_position);
    end if;
  elsif v_session.entity_type = 'store' then
    if v_store.status = 'published' then
      v_images := v_images || jsonb_build_array(jsonb_build_object(
        'asset_id', p_asset_id, 'position', v_position,
        'alt_text', v_store.name, 'kind', v_kind));
      perform public.stage_store_revision(v_store.id,
        coalesce(v_store_revision.proposed_snapshot, public.store_sensitive_snapshot(v_store)),
        v_images, v_session.owner_id, 'media-finalize:' || v_session.id::text);
    else
      insert into public.store_images (store_id, media_asset_id, position, kind)
      values (v_store.id, p_asset_id, v_position, v_kind);
    end if;
  end if;
  update public.upload_sessions set status = 'ready',
    finalize_idempotency_key = p_idempotency_key, finalized_asset_id = p_asset_id,
    updated_at = now() where id = v_session.id;
  insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
  values ('media.finalized:' || p_session_id::text, 'media.finalized',
    v_session.entity_type::text, v_session.entity_id::text,
    jsonb_build_object('asset_id', p_asset_id, 'position', v_position,
      'staging_key', v_session.staging_key, 'pending_revision',
      (v_session.entity_type = 'product' and v_product.status = 'active')
      or (v_session.entity_type = 'store' and v_store.status = 'published')));
  return query select p_asset_id, v_position, p_public_url, false;
end;
$$;

alter function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) rename to reorder_my_marketplace_media_base_83000;
revoke all on function public.reorder_my_marketplace_media_base_83000(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.reorder_my_marketplace_media(
  p_store_id uuid, p_entity_type public.marketplace_media_entity,
  p_entity_id uuid, p_ordered_asset_ids uuid[], p_expected_entity_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store public.stores; v_revision public.store_revisions;
  v_images jsonb; v_existing uuid[]; v_requested uuid[];
begin
  if p_entity_type <> 'store' then
    return public.reorder_my_marketplace_media_base_83000(
      p_store_id, p_entity_type, p_entity_id, p_ordered_asset_ids, p_expected_entity_updated_at);
  end if;
  if p_entity_id <> p_store_id then raise exception 'store_entity_mismatch' using errcode = '22023'; end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store is null then raise exception 'media_entity_not_found' using errcode = 'P0002'; end if;
  if v_actor is null or not public.can_catalog_store(v_store.id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if v_store.status <> 'published' then
    return public.reorder_my_marketplace_media_base_83000(
      p_store_id, p_entity_type, p_entity_id, p_ordered_asset_ids, p_expected_entity_updated_at);
  end if;
  if v_store.updated_at is distinct from p_expected_entity_updated_at then
    raise exception 'media_order_version_conflict' using errcode = '40001';
  end if;
  select * into v_revision from public.store_revisions
  where store_id = v_store.id and status = 'pending';
  v_images := coalesce(v_revision.image_snapshot, public.store_live_image_snapshot(v_store.id));
  select array_agg((item.value ->> 'asset_id')::uuid order by (item.value ->> 'asset_id')::uuid)
  into v_existing from jsonb_array_elements(v_images) as item(value);
  select array_agg(asset_id order by asset_id) into v_requested from unnest(p_ordered_asset_ids) as asset_id;
  if p_ordered_asset_ids is null or cardinality(p_ordered_asset_ids) > 15
     or cardinality(p_ordered_asset_ids) <> cardinality(array(
       select distinct x from unnest(p_ordered_asset_ids) x))
     or v_existing is distinct from v_requested then
    raise exception 'media_order_asset_set_mismatch' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', requested.asset_id, 'position', requested.ordinality - 1,
    'alt_text', source.value ->> 'alt_text', 'kind', source.value ->> 'kind'
  ) order by requested.ordinality), '[]'::jsonb) into v_images
  from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
  join jsonb_array_elements(v_images) as source(value)
    on (source.value ->> 'asset_id')::uuid = requested.asset_id;
  perform public.stage_store_revision(v_store.id,
    coalesce(v_revision.proposed_snapshot, public.store_sensitive_snapshot(v_store)),
    v_images, v_actor, 'store-media-reorder:' || v_store.id::text || ':' || txid_current()::text);
  return jsonb_build_object('entity_id', v_store.id, 'asset_ids', p_ordered_asset_ids,
    'updated_at', v_store.updated_at, 'pending_revision', true);
end;
$$;

alter function public.delete_my_marketplace_media(uuid, timestamptz)
  rename to delete_my_marketplace_media_base_83000;
revoke all on function public.delete_my_marketplace_media_base_83000(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.delete_my_marketplace_media(
  p_asset_id uuid, p_expected_asset_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_asset public.media_assets; v_store public.stores; v_revision public.store_revisions;
  v_images jsonb;
begin
  select * into v_asset from public.media_assets where id = p_asset_id for update;
  if v_asset is null or v_asset.status <> 'active' then
    raise exception 'media_asset_not_found' using errcode = 'P0002';
  end if;
  if v_asset.updated_at is distinct from p_expected_asset_updated_at then
    raise exception 'media_asset_version_conflict' using errcode = '40001';
  end if;
  if v_asset.entity_type <> 'store' then
    return public.delete_my_marketplace_media_base_83000(p_asset_id, p_expected_asset_updated_at);
  end if;
  select * into v_store from public.stores where id = v_asset.store_id for update;
  if v_store.status <> 'published' then
    return public.delete_my_marketplace_media_base_83000(p_asset_id, p_expected_asset_updated_at);
  end if;
  if v_actor is null or not public.can_catalog_store(v_store.id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  select * into v_revision from public.store_revisions
  where store_id = v_store.id and status = 'pending';
  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', item.value ->> 'asset_id', 'position', row_number - 1,
    'alt_text', item.value ->> 'alt_text', 'kind', item.value ->> 'kind'
  ) order by row_number), '[]'::jsonb) into v_images
  from (
    select item.value, row_number() over (order by item.ordinality) as row_number
    from jsonb_array_elements(coalesce(v_revision.image_snapshot,
      public.store_live_image_snapshot(v_store.id))) with ordinality as item(value, ordinality)
    where (item.value ->> 'asset_id')::uuid <> p_asset_id
  ) as remaining;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_revision.image_snapshot,
      public.store_live_image_snapshot(v_store.id))) as item(value)
      where (item.value ->> 'asset_id')::uuid = p_asset_id) then
    raise exception 'media_asset_not_in_store_revision' using errcode = '22023';
  end if;
  perform public.stage_store_revision(v_store.id,
    coalesce(v_revision.proposed_snapshot, public.store_sensitive_snapshot(v_store)),
    v_images, v_actor, 'store-media-delete:' || p_asset_id::text || ':' || txid_current()::text);
  return jsonb_build_object('asset_id', p_asset_id, 'entity_id', v_store.id,
    'entity_updated_at', v_store.updated_at, 'pending_revision', true);
end;
$$;

create or replace function public.moderate_store_revision(
  p_revision_id uuid, p_approve boolean, p_notes text, p_actor_id uuid
)
returns public.stores language plpgsql security definer set search_path = '' as $$
declare
  v_revision public.store_revisions;
  v_store public.stores;
  v_actor_name text;
  v_current jsonb;
  v_old_asset_ids uuid[];
  v_asset public.media_assets;
begin
  if p_actor_id is null or p_actor_id is distinct from (select auth.uid())
     or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_notes, ''))) > 2000
     or (not p_approve and nullif(trim(coalesce(p_notes, '')), '') is null) then
    raise exception 'moderation_notes_required' using errcode = '22023';
  end if;
  select * into v_revision from public.store_revisions
  where id = p_revision_id for update;
  if v_revision is null then raise exception 'store_revision_not_found' using errcode = 'P0002'; end if;
  select * into v_store from public.stores where id = v_revision.store_id for update;
  if v_revision.status <> 'pending' then
    if (p_approve and v_revision.status = 'approved')
       or (not p_approve and v_revision.status = 'rejected') then return v_store; end if;
    raise exception 'store_revision_already_reviewed' using errcode = '55000';
  end if;
  if v_store.status <> 'published' then
    raise exception 'store_revision_base_conflict' using errcode = '40001';
  end if;
  v_current := public.store_sensitive_snapshot(v_store);
  if v_current is distinct from v_revision.base_snapshot then
    raise exception 'store_revision_base_conflict' using errcode = '40001';
  end if;
  select display_name into v_actor_name from public.profiles where id = p_actor_id;

  if p_approve then
    insert into public.store_revision_apply_context (transaction_id, store_id, revision_id)
    values (txid_current(), v_store.id, v_revision.id);
    update public.stores set
      slug = v_revision.proposed_snapshot ->> 'slug',
      name = v_revision.proposed_snapshot ->> 'name',
      short_description = nullif(v_revision.proposed_snapshot ->> 'short_description', ''),
      description = nullif(v_revision.proposed_snapshot ->> 'description', ''),
      city = nullif(v_revision.proposed_snapshot ->> 'city', ''),
      area = nullif(v_revision.proposed_snapshot ->> 'area', ''),
      address_text = nullif(v_revision.proposed_snapshot ->> 'address_text', ''),
      moderation_notes = null, updated_at = now()
    where id = v_store.id;
    select array_agg(media_asset_id) into v_old_asset_ids
    from public.store_images where store_id = v_store.id;
    delete from public.store_images where store_id = v_store.id;
    insert into public.store_images (store_id, media_asset_id, position, alt_text, kind)
    select v_store.id, (item.value ->> 'asset_id')::uuid,
      (item.ordinality - 1)::smallint, nullif(item.value ->> 'alt_text', ''),
      (item.value ->> 'kind')
    from jsonb_array_elements(v_revision.image_snapshot)
      with ordinality as item(value, ordinality)
    order by item.ordinality;
    for v_asset in
      select asset.* from public.media_assets as asset
      where asset.id = any(coalesce(v_old_asset_ids, '{}'::uuid[]))
        and asset.status = 'active'
        and not exists (select 1 from public.store_images as current_image
          where current_image.store_id = v_store.id and current_image.media_asset_id = asset.id)
      for update
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_asset.id;
      insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
      values ('media.delete_requested:' || v_asset.id::text, 'media.delete_requested',
        'media_asset', v_asset.id::text, jsonb_build_object('asset_id', v_asset.id,
          'bucket', v_asset.bucket, 'object_key', v_asset.object_key,
          'reason', 'approved_store_revision'))
      on conflict (event_key) do nothing;
    end loop;
  else
    -- Rejected assets that never appeared in the public image set are safe to
    -- remove now. Approved/live assets remain untouched.
    for v_asset in
      select asset.*
      from jsonb_array_elements(v_revision.image_snapshot) as item(value)
      join public.media_assets as asset on asset.id = (item.value ->> 'asset_id')::uuid
      where asset.status = 'active'
        and not exists (select 1 from public.store_images as live_image
          where live_image.store_id = v_store.id and live_image.media_asset_id = asset.id)
      for update of asset
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_asset.id;
      insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
      values ('media.delete_requested:' || v_asset.id::text, 'media.delete_requested',
        'media_asset', v_asset.id::text, jsonb_build_object('asset_id', v_asset.id,
          'bucket', v_asset.bucket, 'object_key', v_asset.object_key,
          'reason', 'rejected_store_revision'))
      on conflict (event_key) do nothing;
    end loop;
  end if;

  update public.store_revisions set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = p_actor_id, reviewed_by_name_snapshot = v_actor_name,
    reviewed_at = now(), review_notes = nullif(trim(coalesce(p_notes, '')), ''),
    approved_at = case when p_approve then now() else null end,
    rejected_at = case when p_approve then null else now() end
  where id = v_revision.id;
  delete from public.store_revision_apply_context
  where transaction_id = txid_current() and store_id = v_store.id;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, metadata
  ) values (p_actor_id,
    case when p_approve then 'store.revision_approved' else 'store.revision_rejected' end,
    'store_revision', v_revision.id::text, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
      'store_id', v_store.id), jsonb_build_object('actor_name_snapshot', v_actor_name));
  select * into v_store from public.stores where id = v_store.id;
  return v_store;
end;
$$;

create or replace function public.moderate_store_as_admin(
  p_store_id uuid, p_approve boolean, p_notes text default null
)
returns public.stores language plpgsql security definer set search_path = '' as $$
declare v_revision public.store_revisions; v_store public.stores;
begin
  select * into v_revision from public.store_revisions
  where store_id = p_store_id order by created_at desc, id desc limit 1;
  if v_revision.status = 'pending' then
    return public.moderate_store_revision(v_revision.id, p_approve, p_notes, (select auth.uid()));
  end if;
  select * into v_store from public.stores where id = p_store_id;
  if v_store.status = 'published' and (
    (p_approve and v_revision.status = 'approved')
    or (not p_approve and v_revision.status = 'rejected')) then
    if (select auth.uid()) is null or not public.is_marketplace_admin() then
      raise exception 'admin_access_required' using errcode = '42501';
    end if;
    return v_store;
  end if;
  return public.moderate_store(p_store_id, p_approve, p_notes, (select auth.uid()));
end;
$$;

create or replace function public.list_pending_marketplace_moderation(
  p_entity text default 'all', p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_entity not in ('all','product','store') or p_limit not between 1 and 100 then
    raise exception 'invalid_moderation_page' using errcode = '22023';
  end if;
  with pending as materialized (
    select 'product'::text entity_type, product.id, product.store_id, product.name,
      product.status::text status, product.first_submitted_at submitted_at,
      (select asset.public_url from public.product_images image join public.media_assets asset
        on asset.id = image.media_asset_id and asset.status = 'active'
        where image.product_id = product.id order by image.position limit 1) primary_image_url
    from public.products product
    where product.status = 'pending_review' and p_entity in ('all','product')
      and (p_before is null or product.first_submitted_at < p_before)
    union all
    select 'product', product.id, product.store_id,
      coalesce(revision.proposed_snapshot ->> 'name', product.name),
      'pending_revision', revision.created_at,
      (select asset.public_url from jsonb_array_elements(revision.image_snapshot)
        with ordinality item(value, ordinality)
       join public.media_assets asset on asset.id = (item.value ->> 'asset_id')::uuid
       where asset.status = 'active' order by item.ordinality limit 1)
    from public.product_revisions revision
    join public.products product on product.id = revision.product_id
    where revision.status = 'pending' and p_entity in ('all','product')
      and (p_before is null or revision.created_at < p_before)
    union all
    select 'store', store.id, store.id, store.name, store.status::text,
      store.first_submitted_at,
      (select asset.public_url from public.store_images image join public.media_assets asset
        on asset.id = image.media_asset_id and asset.status = 'active'
        where image.store_id = store.id
        order by case image.kind when 'logo' then 0 when 'cover' then 1 else 2 end,
          image.position limit 1)
    from public.stores store
    where store.status = 'pending_review' and p_entity in ('all','store')
      and (p_before is null or store.first_submitted_at < p_before)
    union all
    select 'store', store.id, store.id,
      coalesce(revision.proposed_snapshot ->> 'name', store.name),
      'pending_revision', revision.created_at,
      (select asset.public_url from jsonb_array_elements(revision.image_snapshot)
        with ordinality item(value, ordinality)
       join public.media_assets asset on asset.id = (item.value ->> 'asset_id')::uuid
       where asset.status = 'active'
       order by case item.value ->> 'kind' when 'logo' then 0 when 'cover' then 1 else 2 end,
         item.ordinality limit 1)
    from public.store_revisions revision
    join public.stores store on store.id = revision.store_id
    where revision.status = 'pending' and p_entity in ('all','store')
      and (p_before is null or revision.created_at < p_before)
  ), page as (select * from pending order by submitted_at desc, id limit p_limit)
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'entity_type', page.entity_type, 'id', page.id, 'store_id', page.store_id,
    'name', page.name, 'status', page.status, 'submitted_at', page.submitted_at,
    'primary_image_url', page.primary_image_url
  ) order by page.submitted_at desc, page.id), '[]'::jsonb),
  'next_before', case when count(*) = p_limit then min(page.submitted_at) else null end)
  into v_result from page;
  return v_result;
end;
$$;

create or replace function public.notify_marketplace_store_revision_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  perform public.notify_marketplace_store_members(new.store_id,
    'store-revision-moderation:' || new.id::text || ':' || new.status,
    'moderation.status_changed', 'تم تحديث مراجعة المتجر',
    'راجع حالة تعديلات المتجر وملاحظات المراجعة من لوحة المتجر.',
    '/merchant/marketplace/settings');
  return new;
end;
$$;

create trigger store_revisions_moderation_notify
after update of status on public.store_revisions
for each row execute function public.notify_marketplace_store_revision_event();

alter table public.store_revisions enable row level security;
alter table public.store_revision_apply_context enable row level security;
create policy store_revisions_read_catalog_or_admin
on public.store_revisions for select to authenticated
using (public.can_catalog_store(store_id) or public.is_marketplace_admin());

revoke all on table public.store_revisions, public.store_revision_apply_context
  from public, anon, authenticated, service_role;
grant select on table public.store_revisions to authenticated, service_role;

revoke all on function public.store_sensitive_snapshot(public.stores)
  from public, anon, authenticated;
revoke all on function public.store_live_image_snapshot(uuid)
  from public, anon, authenticated;
revoke all on function public.guard_store_revision_immutability()
  from public, anon, authenticated;
revoke all on function public.stage_store_revision(uuid, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
revoke all on function public.guard_published_store_sensitive_dml()
  from public, anon, authenticated;
revoke all on function public.guard_published_store_image_dml()
  from public, anon, authenticated;
revoke all on function public.moderate_store_revision(uuid, boolean, text, uuid)
  from public, anon, authenticated;
revoke all on function public.notify_marketplace_store_revision_event()
  from public, anon, authenticated;

revoke all on function public.update_my_marketplace_store(
  uuid, text, text, text, text, text, text, timestamptz, text
) from public, anon;
grant execute on function public.update_my_marketplace_store(
  uuid, text, text, text, text, text, text, timestamptz, text
) to authenticated, service_role;
revoke all on function public.list_my_marketplace_stores() from public, anon;
grant execute on function public.list_my_marketplace_stores() to authenticated, service_role;
revoke all on function public.finalize_media_upload(
  uuid, uuid, text, text, text, text, bigint, integer, integer, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_media_upload(
  uuid, uuid, text, text, text, text, bigint, integer, integer, text, text
) to service_role;
revoke all on function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) from public, anon;
grant execute on function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) to authenticated, service_role;
revoke all on function public.delete_my_marketplace_media(uuid, timestamptz)
  from public, anon;
grant execute on function public.delete_my_marketplace_media(uuid, timestamptz)
  to authenticated, service_role;
revoke all on function public.moderate_store_as_admin(uuid, boolean, text)
  from public, anon;
grant execute on function public.moderate_store_as_admin(uuid, boolean, text)
  to authenticated, service_role;
revoke all on function public.list_pending_marketplace_moderation(text, integer, timestamptz)
  from public, anon;
grant execute on function public.list_pending_marketplace_moderation(text, integer, timestamptz)
  to authenticated, service_role;

commit;
