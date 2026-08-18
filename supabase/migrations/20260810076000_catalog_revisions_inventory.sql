begin;

-- Sensitive catalog changes remain invisible until an administrator approves an
-- immutable snapshot. Price, availability, and non-sensitive variant changes
-- continue to take effect immediately.
create table public.product_revisions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  base_snapshot jsonb not null check (jsonb_typeof(base_snapshot) = 'object'),
  proposed_snapshot jsonb not null check (jsonb_typeof(proposed_snapshot) = 'object'),
  image_snapshot jsonb not null check (
    jsonb_typeof(image_snapshot) = 'array' and jsonb_array_length(image_snapshot) <= 10
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
  unique (product_id, idempotency_key),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null
      and approved_at is null and rejected_at is null)
    or (status = 'approved' and reviewed_at is not null
      and approved_at is not null and rejected_at is null)
    or (status = 'rejected' and reviewed_at is not null
      and approved_at is null and rejected_at is not null)
  )
);

create unique index product_revisions_one_pending_idx
  on public.product_revisions (product_id) where status = 'pending';
create index product_revisions_moderation_idx
  on public.product_revisions (status, created_at desc, id);
create index product_revisions_store_idx
  on public.product_revisions (store_id, created_at desc);

create or replace function public.guard_product_revision_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'product_revisions_are_immutable' using errcode = '55000';
  end if;
  if new.id is distinct from old.id or new.product_id is distinct from old.product_id
     or new.store_id is distinct from old.store_id
     or new.base_snapshot is distinct from old.base_snapshot
     or new.proposed_snapshot is distinct from old.proposed_snapshot
     or new.image_snapshot is distinct from old.image_snapshot
     or new.request_hash is distinct from old.request_hash
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'product_revision_snapshot_is_immutable' using errcode = '55000';
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
      raise exception 'product_revision_snapshot_is_immutable' using errcode = '55000';
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.status not in ('approved','rejected')
     or new.created_by is distinct from old.created_by then
    raise exception 'invalid_product_revision_transition' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger product_revisions_immutable
before update or delete on public.product_revisions
for each row execute function public.guard_product_revision_immutability();

-- A transaction-scoped capability row is safer than a caller-controlled GUC:
-- only the review routine can insert it and the guard consumes it by txid.
create table public.product_revision_apply_context (
  transaction_id bigint not null,
  product_id uuid not null references public.products(id) on delete cascade,
  revision_id uuid not null references public.product_revisions(id) on delete cascade,
  primary key (transaction_id, product_id)
);

create or replace function public.catalog_sensitive_snapshot(p_product public.products)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'category_id', p_product.category_id,
    'product_key', p_product.product_key,
    'slug', p_product.slug,
    'name', p_product.name,
    'short_description', p_product.short_description,
    'description', p_product.description,
    'brand', p_product.brand
  );
$$;

create or replace function public.catalog_live_image_snapshot(p_product_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', image.media_asset_id,
    'position', image.position,
    'alt_text', image.alt_text
  ) order by image.position), '[]'::jsonb)
  from public.product_images as image
  join public.media_assets as asset
    on asset.id = image.media_asset_id and asset.status = 'active'
  where image.product_id = p_product_id;
$$;

create or replace function public.stage_product_revision(
  p_product_id uuid,
  p_proposed_snapshot jsonb,
  p_image_snapshot jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.product_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_actor_name text;
  v_base jsonb;
  v_proposed jsonb;
  v_images jsonb;
  v_hash text;
  v_existing public.product_revisions;
  v_revision public.product_revisions;
  v_pending public.product_revisions;
  v_orphan public.media_assets;
begin
  if p_actor_id is null or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 160 then
    raise exception 'invalid_product_revision_request' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null or v_product.status <> 'active' then
    raise exception 'active_product_revision_required' using errcode = '55000';
  end if;
  if not public.is_marketplace_admin()
     and not exists (
       select 1 from public.store_memberships
       where store_id = v_product.store_id and user_id = p_actor_id and is_active
         and role in ('owner','manager','catalog')
     )
     and not exists (
       select 1 from public.stores as store
       join public.profiles as profile on profile.merchant_id = store.merchant_id
       where store.id = v_product.store_id and profile.id = p_actor_id
         and profile.role = 'merchant' and profile.is_active
     ) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  v_base := public.catalog_sensitive_snapshot(v_product);
  v_proposed := coalesce(p_proposed_snapshot, v_base);
  v_images := coalesce(p_image_snapshot, public.catalog_live_image_snapshot(v_product.id));
  if jsonb_typeof(v_proposed) <> 'object' or jsonb_typeof(v_images) <> 'array'
     or jsonb_array_length(v_images) not between 1 and 10
     or char_length(trim(coalesce(v_proposed ->> 'name', ''))) not between 2 and 200
     or nullif(trim(coalesce(v_proposed ->> 'description', '')), '') is null
     or char_length(coalesce(v_proposed ->> 'description', '')) > 10000
     or (nullif(v_proposed ->> 'short_description', '') is not null and
       char_length(trim(v_proposed ->> 'short_description')) not between 2 and 240)
     or char_length(coalesce(v_proposed ->> 'brand', '')) > 120
     or coalesce(v_proposed ->> 'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(coalesce(v_proposed ->> 'product_key', '')) not between 1 and 80
     or coalesce(v_proposed ->> 'product_key', '') ~ '[[:cntrl:][:space:]]'
     or (nullif(v_proposed ->> 'category_id', '') is not null and not exists (
       select 1 from public.product_categories as category
       where category.id = (v_proposed ->> 'category_id')::uuid and category.is_active
     ))
     or (select count(*) from jsonb_array_elements(v_images)) <>
        (select count(distinct item.value ->> 'asset_id') from jsonb_array_elements(v_images) as item(value))
     or exists (
       select 1
       from jsonb_array_elements(v_images) with ordinality as item(value, ordinality)
       where (item.value ->> 'asset_id') is null
          or (item.value ->> 'asset_id') !~
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1)
             <> item.ordinality::integer - 1
          or char_length(coalesce(item.value ->> 'alt_text', '')) > 240
     )
     or exists (
       select 1
       from jsonb_array_elements(v_images) as item(value)
       left join public.media_assets as asset
         on asset.id = (item.value ->> 'asset_id')::uuid
        and asset.entity_type = 'product'
        and asset.entity_id = v_product.id
        and asset.store_id = v_product.store_id
        and asset.status = 'active'
       where asset.id is null
     ) then
    raise exception 'invalid_product_revision_snapshot' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    v_product.id::text || '|' || v_proposed::text || '|' || v_images::text,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_existing
  from public.product_revisions
  where product_id = v_product.id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.product_id <> v_product.id or v_existing.request_hash <> v_hash then
      raise exception 'product_revision_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_pending from public.product_revisions
  where product_id = v_product.id and status = 'pending';
  -- A staged-only asset removed by a later snapshot is not public catalog data
  -- and can be deleted immediately. Live assets remain until approval.
  if v_pending is not null then
    for v_orphan in
      select asset.*
      from jsonb_array_elements(v_pending.image_snapshot) as old_item(value)
      join public.media_assets as asset on asset.id = (old_item.value ->> 'asset_id')::uuid
      where asset.status = 'active'
        and not exists (
          select 1 from jsonb_array_elements(v_images) as new_item(value)
          where (new_item.value ->> 'asset_id')::uuid = asset.id
        )
        and not exists (
          select 1 from public.product_images as live_image
          where live_image.product_id = v_product.id and live_image.media_asset_id = asset.id
        )
      for update of asset
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_orphan.id;
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'media.delete_requested:' || v_orphan.id::text,
        'media.delete_requested', 'media_asset', v_orphan.id::text,
        jsonb_build_object('asset_id', v_orphan.id, 'bucket', v_orphan.bucket,
          'object_key', v_orphan.object_key, 'reason', 'superseded_product_revision')
      ) on conflict (event_key) do nothing;
    end loop;
  end if;

  -- Every snapshot is immutable. A newer merchant action closes the preceding
  -- pending snapshot and inserts a new complete snapshot.
  update public.product_revisions
  set status = 'rejected', reviewed_at = now(), rejected_at = now(),
      review_notes = 'superseded_by_newer_revision'
  where product_id = v_product.id and status = 'pending';

  select display_name into v_actor_name from public.profiles where id = p_actor_id;
  insert into public.product_revisions (
    product_id, store_id, base_snapshot, proposed_snapshot, image_snapshot,
    request_hash, idempotency_key, created_by, created_by_name_snapshot
  ) values (
    v_product.id, v_product.store_id, v_base, v_proposed, v_images,
    v_hash, p_idempotency_key, p_actor_id, v_actor_name
  ) returning * into v_revision;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    p_actor_id, 'product.revision_submitted',
    'product_revision', v_revision.id::text,
    jsonb_build_object('product_id', v_product.id, 'request_hash', v_hash),
    jsonb_build_object('actor_name_snapshot', v_actor_name)
  );
  return v_revision;
end;
$$;

create or replace function public.stage_active_product_sensitive_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposed jsonb;
  v_key text;
  v_pending public.product_revisions;
begin
  if old.status <> 'active' or exists (
    select 1 from public.product_revision_apply_context as context
    where context.transaction_id = txid_current() and context.product_id = old.id
  ) then
    return new;
  end if;
  if (new.category_id, new.product_key, new.slug, new.name, new.short_description,
      new.description, new.brand)
     is not distinct from
     (old.category_id, old.product_key, old.slug, old.name, old.short_description,
      old.description, old.brand) then
    return new;
  end if;
  v_proposed := public.catalog_sensitive_snapshot(new);
  select * into v_pending from public.product_revisions
  where product_id = old.id and status = 'pending';
  v_key := 'product-update:' || old.id::text || ':' || txid_current()::text || ':' ||
    left(pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_proposed::text, 'UTF8'), 'sha256'), 'hex'), 32);
  perform public.stage_product_revision(
    old.id, v_proposed,
    coalesce(v_pending.image_snapshot, public.catalog_live_image_snapshot(old.id)),
    (select auth.uid()), v_key
  );
  new.category_id := old.category_id;
  new.product_key := old.product_key;
  new.slug := old.slug;
  new.name := old.name;
  new.short_description := old.short_description;
  new.description := old.description;
  new.brand := old.brand;
  return new;
end;
$$;

create trigger products_stage_active_sensitive_changes
before update of category_id, product_key, slug, name, short_description, description, brand
on public.products
for each row execute function public.stage_active_product_sensitive_changes();

create or replace function public.guard_active_product_image_dml()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_product_id uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
begin
  if exists (select 1 from public.products where id = v_product_id and status = 'active')
     and not exists (
       select 1 from public.product_revision_apply_context as context
       where context.transaction_id = txid_current() and context.product_id = v_product_id
     ) then
    raise exception 'active_product_images_require_revision' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger product_images_require_revision
before insert or update or delete on public.product_images
for each row execute function public.guard_active_product_image_dml();

create or replace function public.moderate_product_revision(
  p_revision_id uuid,
  p_approve boolean,
  p_notes text,
  p_actor_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.product_revisions;
  v_product public.products;
  v_actor_name text;
  v_current jsonb;
  v_old_asset record;
  v_old_asset_ids uuid[];
begin
  if p_actor_id is null or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_notes, ''))) > 2000
     or (not p_approve and nullif(trim(coalesce(p_notes, '')), '') is null) then
    raise exception 'moderation_notes_required' using errcode = '22023';
  end if;
  select * into v_revision from public.product_revisions
  where id = p_revision_id for update;
  if v_revision is null then
    raise exception 'product_revision_not_found' using errcode = 'P0002';
  end if;
  select * into v_product from public.products where id = v_revision.product_id for update;
  if v_revision.status <> 'pending' then
    if (p_approve and v_revision.status = 'approved')
       or (not p_approve and v_revision.status = 'rejected') then
      return v_product;
    end if;
    raise exception 'product_revision_already_reviewed' using errcode = '55000';
  end if;
  v_current := public.catalog_sensitive_snapshot(v_product);
  if v_current is distinct from v_revision.base_snapshot then
    raise exception 'product_revision_base_conflict' using errcode = '40001';
  end if;
  select display_name into v_actor_name from public.profiles where id = p_actor_id;

  if p_approve then
    insert into public.product_revision_apply_context (transaction_id, product_id, revision_id)
    values (txid_current(), v_product.id, v_revision.id);
    update public.products
    set category_id = nullif(v_revision.proposed_snapshot ->> 'category_id', '')::uuid,
        product_key = v_revision.proposed_snapshot ->> 'product_key',
        slug = v_revision.proposed_snapshot ->> 'slug',
        name = v_revision.proposed_snapshot ->> 'name',
        short_description = nullif(v_revision.proposed_snapshot ->> 'short_description', ''),
        description = nullif(v_revision.proposed_snapshot ->> 'description', ''),
        brand = nullif(v_revision.proposed_snapshot ->> 'brand', ''),
        moderation_notes = null,
        updated_at = now()
    where id = v_product.id;

    select array_agg(media_asset_id) into v_old_asset_ids
    from public.product_images where product_id = v_product.id;
    delete from public.product_images where product_id = v_product.id;
    insert into public.product_images (product_id, media_asset_id, position, alt_text)
    select v_product.id, (item.value ->> 'asset_id')::uuid,
           (item.ordinality - 1)::smallint,
           nullif(item.value ->> 'alt_text', '')
    from jsonb_array_elements(v_revision.image_snapshot)
      with ordinality as item(value, ordinality)
    order by item.ordinality;

    for v_old_asset in
      select asset.* from public.media_assets as asset
      where asset.id = any(coalesce(v_old_asset_ids, '{}'::uuid[])) and not exists (
        select 1 from public.product_images as current_image
        where current_image.product_id = v_product.id
          and current_image.media_asset_id = asset.id
      ) and asset.status = 'active'
      for update
    loop
      update public.media_assets set status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_old_asset.id;
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'media.delete_requested:' || v_old_asset.id::text,
        'media.delete_requested', 'media_asset', v_old_asset.id::text,
        jsonb_build_object('asset_id', v_old_asset.id, 'bucket', v_old_asset.bucket,
          'object_key', v_old_asset.object_key, 'reason', 'approved_product_revision')
      ) on conflict (event_key) do nothing;
    end loop;
  end if;

  update public.product_revisions
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = p_actor_id, reviewed_by_name_snapshot = v_actor_name,
      reviewed_at = now(), review_notes = nullif(trim(coalesce(p_notes, '')), ''),
      approved_at = case when p_approve then now() else null end,
      rejected_at = case when p_approve then null else now() end
  where id = v_revision.id;
  delete from public.product_revision_apply_context
  where transaction_id = txid_current() and product_id = v_product.id;

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    p_actor_id,
    case when p_approve then 'product.revision_approved' else 'product.revision_rejected' end,
    'product_revision', v_revision.id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
      'product_id', v_product.id),
    jsonb_build_object('actor_name_snapshot', v_actor_name)
  );
  select * into v_product from public.products where id = v_product.id;
  return v_product;
end;
$$;

-- Existing admin action remains backwards compatible: an active product with a
-- pending revision reviews that revision; first publication still uses the
-- original product moderation path.
create or replace function public.moderate_product_as_admin(
  p_product_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.product_revisions;
  v_product public.products;
begin
  select * into v_revision from public.product_revisions
  where product_id = p_product_id order by created_at desc, id desc limit 1;
  if v_revision.status = 'pending' then
    return public.moderate_product_revision(
      v_revision.id, p_approve, p_notes, (select auth.uid())
    );
  end if;
  select * into v_product from public.products where id = p_product_id;
  if v_product.status = 'active' and (
    (p_approve and v_revision.status = 'approved')
    or (not p_approve and v_revision.status = 'rejected')
  ) then
    if (select auth.uid()) is null or not public.is_marketplace_admin() then
      raise exception 'admin_access_required' using errcode = '42501';
    end if;
    return v_product;
  end if;
  return public.moderate_product(
    p_product_id, p_approve, p_notes, (select auth.uid())
  );
end;
$$;

-- Preserve the validated merchant DTO and add the latest pending snapshot.
alter function public.get_my_marketplace_product(uuid)
  rename to get_my_marketplace_product_base_76000;
revoke all on function public.get_my_marketplace_product_base_76000(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_marketplace_product(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_revision public.product_revisions;
  v_pending jsonb;
begin
  v_result := public.get_my_marketplace_product_base_76000(p_product_id);
  select * into v_revision from public.product_revisions
  where product_id = p_product_id and status = 'pending';
  if v_revision is null then
    return v_result || jsonb_build_object('pending_revision', null);
  end if;
  select jsonb_build_object(
    'id', v_revision.id,
    'status', v_revision.status,
    'submitted_at', v_revision.created_at,
    'proposed_snapshot', v_revision.proposed_snapshot,
    'images', coalesce(jsonb_agg(jsonb_build_object(
      'asset_id', asset.id,
      'position', item.ordinality - 1,
      'alt_text', nullif(item.value ->> 'alt_text', ''),
      'public_url', asset.public_url,
      'updated_at', asset.updated_at
    ) order by item.ordinality), '[]'::jsonb)
  ) into v_pending
  from jsonb_array_elements(v_revision.image_snapshot)
    with ordinality as item(value, ordinality)
  join public.media_assets as asset on asset.id = (item.value ->> 'asset_id')::uuid;
  return v_result || jsonb_build_object('pending_revision', v_pending);
end;
$$;

-- Product uploads for an active listing are finalized into durable media, but
-- become visible only inside a revision snapshot. Draft/store/proof behavior is
-- unchanged.
create or replace function public.finalize_media_upload(
  p_session_id uuid,
  p_asset_id uuid,
  p_bucket text,
  p_object_key text,
  p_public_url text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_sha256 text,
  p_idempotency_key text
)
returns table (asset_id uuid, "position" smallint, public_url text, idempotent boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.upload_sessions;
  v_product public.products;
  v_position smallint;
  v_existing_url text;
  v_images jsonb;
  v_revision public.product_revisions;
begin
  select * into v_session from public.upload_sessions where id = p_session_id for update;
  if v_session is null then raise exception 'upload_session_not_found' using errcode = 'P0002'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if v_session.status = 'ready' and v_session.finalized_asset_id is not null then
    if v_session.finalize_idempotency_key is distinct from p_idempotency_key then
      raise exception 'upload_idempotency_conflict' using errcode = '23505';
    end if;
    select asset.public_url into v_existing_url from public.media_assets as asset
    where asset.id = v_session.finalized_asset_id;
    select image.position into v_position from public.product_images as image
    where image.media_asset_id = v_session.finalized_asset_id;
    if v_position is null and v_session.entity_type = 'product' then
      select (item.ordinality - 1)::smallint into v_position
      from public.product_revisions as revision,
           jsonb_array_elements(revision.image_snapshot) with ordinality as item(value, ordinality)
      where revision.product_id = v_session.entity_id
        and (item.value ->> 'asset_id')::uuid = v_session.finalized_asset_id
      order by revision.created_at desc limit 1;
    end if;
    if v_position is null then
      select image.position into v_position from public.store_images as image
      where image.media_asset_id = v_session.finalized_asset_id;
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
      select * into v_revision from public.product_revisions
      where product_id = v_product.id and status = 'pending';
      v_images := coalesce(v_revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id));
      v_position := jsonb_array_length(v_images)::smallint;
      if v_position >= 10 then raise exception 'product_image_limit_reached' using errcode = '23514'; end if;
    else
      select candidate::smallint into v_position from generate_series(0, 9) as candidate
      where not exists (select 1 from public.product_images where product_id = v_product.id and position = candidate)
      order by candidate limit 1;
      if v_position is null then raise exception 'product_image_limit_reached' using errcode = '23514'; end if;
    end if;
  elsif v_session.entity_type = 'store' then
    perform 1 from public.stores where id = v_session.entity_id for update;
    select candidate::smallint into v_position from generate_series(0, 14) as candidate
    where not exists (select 1 from public.store_images where store_id = v_session.entity_id and position = candidate)
    order by candidate limit 1;
    if v_position is null then raise exception 'store_image_limit_reached' using errcode = '23514'; end if;
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
        'asset_id', p_asset_id, 'position', v_position, 'alt_text', v_product.name
      ));
      perform public.stage_product_revision(
        v_product.id,
        coalesce(v_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
        v_images, v_session.owner_id, 'media-finalize:' || v_session.id::text
      );
    else
      insert into public.product_images (product_id, media_asset_id, position)
      values (v_session.entity_id, p_asset_id, v_position);
    end if;
  elsif v_session.entity_type = 'store' then
    insert into public.store_images (store_id, media_asset_id, position, kind)
    values (v_session.entity_id, p_asset_id, v_position,
      case when v_session.slot in ('logo','cover') then v_session.slot else 'gallery' end);
  end if;
  update public.upload_sessions
  set status = 'ready', finalize_idempotency_key = p_idempotency_key,
      finalized_asset_id = p_asset_id, updated_at = now()
  where id = v_session.id;
  insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
  values ('media.finalized:' || p_session_id::text, 'media.finalized',
    v_session.entity_type::text, v_session.entity_id::text,
    jsonb_build_object('asset_id', p_asset_id, 'position', v_position,
      'staging_key', v_session.staging_key, 'pending_revision', v_product.status = 'active'));
  return query select p_asset_id, v_position, p_public_url, false;
end;
$$;

create or replace function public.reorder_my_marketplace_media(
  p_store_id uuid,
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid,
  p_ordered_asset_ids uuid[],
  p_expected_entity_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_revision public.product_revisions;
  v_images jsonb;
  v_existing uuid[];
  v_requested uuid[];
  v_actor uuid := (select auth.uid());
begin
  if p_entity_type <> 'product' then
    return public.reorder_marketplace_media(p_store_id, p_entity_type, p_entity_id,
      p_ordered_asset_ids, p_expected_entity_updated_at, v_actor);
  end if;
  select * into v_product from public.products
  where id = p_entity_id and store_id = p_store_id for update;
  if v_product is null then raise exception 'media_entity_not_found' using errcode = 'P0002'; end if;
  if v_actor is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if v_product.status <> 'active' then
    return public.reorder_marketplace_media(p_store_id, p_entity_type, p_entity_id,
      p_ordered_asset_ids, p_expected_entity_updated_at, v_actor);
  end if;
  if v_product.updated_at is distinct from p_expected_entity_updated_at then
    raise exception 'media_order_version_conflict' using errcode = '40001';
  end if;
  select * into v_revision from public.product_revisions
  where product_id = v_product.id and status = 'pending';
  v_images := coalesce(v_revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id));
  select array_agg((item.value ->> 'asset_id')::uuid order by (item.value ->> 'asset_id')::uuid)
  into v_existing from jsonb_array_elements(v_images) as item(value);
  select array_agg(asset_id order by asset_id) into v_requested from unnest(p_ordered_asset_ids) as asset_id;
  if p_ordered_asset_ids is null or cardinality(p_ordered_asset_ids) not between 1 and 10
     or cardinality(p_ordered_asset_ids) <> cardinality(array(select distinct x from unnest(p_ordered_asset_ids) x))
     or v_existing is distinct from v_requested then
    raise exception 'media_order_asset_set_mismatch' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('asset_id', requested.asset_id,
    'position', requested.ordinality - 1, 'alt_text', source.value ->> 'alt_text')
    order by requested.ordinality) into v_images
  from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
  join jsonb_array_elements(v_images) as source(value)
    on (source.value ->> 'asset_id')::uuid = requested.asset_id;
  perform public.stage_product_revision(v_product.id,
    coalesce(v_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
    v_images, v_actor, 'media-reorder:' || v_product.id::text || ':' || txid_current()::text);
  return jsonb_build_object('entity_id', v_product.id, 'asset_ids', p_ordered_asset_ids,
    'updated_at', v_product.updated_at, 'pending_revision', true);
end;
$$;

create or replace function public.delete_my_marketplace_media(
  p_asset_id uuid,
  p_expected_asset_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_asset public.media_assets;
  v_product public.products;
  v_revision public.product_revisions;
  v_images jsonb;
begin
  select * into v_asset from public.media_assets where id = p_asset_id for update;
  if v_asset is null or v_asset.status <> 'active' then
    raise exception 'media_asset_not_found' using errcode = 'P0002';
  end if;
  if v_asset.updated_at is distinct from p_expected_asset_updated_at then
    raise exception 'media_asset_version_conflict' using errcode = '40001';
  end if;
  if v_asset.entity_type <> 'product' then
    return public.delete_marketplace_media(p_asset_id, p_expected_asset_updated_at, v_actor);
  end if;
  select * into v_product from public.products where id = v_asset.entity_id for update;
  if v_product.status <> 'active' then
    return public.delete_marketplace_media(p_asset_id, p_expected_asset_updated_at, v_actor);
  end if;
  if v_actor is null or not public.can_catalog_store(v_product.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  select * into v_revision from public.product_revisions
  where product_id = v_product.id and status = 'pending';
  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_id', item.value ->> 'asset_id', 'position', item.ordinality - 1,
    'alt_text', item.value ->> 'alt_text'
  ) order by item.ordinality), '[]'::jsonb) into v_images
  from jsonb_array_elements(coalesce(v_revision.image_snapshot,
    public.catalog_live_image_snapshot(v_product.id)))
    with ordinality as item(value, ordinality)
  where (item.value ->> 'asset_id')::uuid <> p_asset_id;
  if jsonb_array_length(v_images) < 1 then
    raise exception 'active_product_last_image_cannot_be_deleted' using errcode = '23514';
  end if;
  perform public.stage_product_revision(v_product.id,
    coalesce(v_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
    v_images, v_actor, 'media-delete:' || p_asset_id::text || ':' || txid_current()::text);
  return jsonb_build_object('asset_id', p_asset_id, 'entity_id', v_product.id,
    'entity_updated_at', v_product.updated_at, 'pending_revision', true);
end;
$$;

-- Keep the proven worker implementation for drafts, and stage an immutable
-- image revision when an Excel import targets an already active product.
alter function public.complete_catalog_import_image_job(
  bigint, uuid, text, text, text, bigint, text, integer, integer
) rename to complete_catalog_import_image_job_base_76000;
revoke all on function public.complete_catalog_import_image_job_base_76000(
  bigint, uuid, text, text, text, bigint, text, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.complete_catalog_import_image_job(
  p_row_id bigint,
  p_worker_id uuid,
  p_bucket text,
  p_object_key text,
  p_public_url text,
  p_byte_size bigint,
  p_sha256 text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.catalog_import_rows;
  v_job public.catalog_import_jobs;
  v_product public.products;
  v_merchant_id uuid;
  v_asset_id uuid := gen_random_uuid();
  v_existing_asset public.media_assets;
  v_revision public.product_revisions;
  v_images jsonb;
  v_pending integer;
  v_position integer;
begin
  select * into v_row from public.catalog_import_rows where id = p_row_id for update;
  if v_row is null or v_row.sheet_name <> 'Images' or p_worker_id is null then
    raise exception 'import_image_lease_not_found' using errcode = 'P0002';
  end if;
  if v_row.status = 'applied' and v_row.worker_status = 'completed' then
    select * into v_existing_asset from public.media_assets
    where id::text = v_row.normalized_data ->> 'media_asset_id'
      and metadata ->> 'catalog_import_row_id' = v_row.id::text;
    if v_existing_asset.id is not null and v_existing_asset.bucket = p_bucket
       and v_existing_asset.object_key = p_object_key
       and v_existing_asset.public_url = p_public_url
       and v_existing_asset.byte_size = p_byte_size and v_existing_asset.sha256 = p_sha256
       and v_existing_asset.width = p_width and v_existing_asset.height = p_height then
      return jsonb_build_object('row_id', v_row.id, 'job_id', v_row.job_id,
        'asset_id', v_existing_asset.id, 'status', 'completed', 'idempotent', true);
    end if;
    raise exception 'import_image_completion_mismatch' using errcode = '22023';
  end if;
  if v_row.status <> 'valid' or v_row.worker_status <> 'leased'
     or v_row.worker_id is distinct from p_worker_id
     or v_row.worker_lease_expires_at is null or v_row.worker_lease_expires_at <= now() then
    raise exception 'import_image_lease_not_found' using errcode = 'P0002';
  end if;
  select * into v_job from public.catalog_import_jobs where id = v_row.job_id for update;
  select product.* into v_product from public.products product
  where product.store_id = v_job.store_id
    and lower(product.product_key) = lower(v_row.normalized_data ->> 'product_key')
  for update;
  if v_product.status <> 'active' then
    return public.complete_catalog_import_image_job_base_76000(
      p_row_id, p_worker_id, p_bucket, p_object_key, p_public_url,
      p_byte_size, p_sha256, p_width, p_height
    );
  end if;
  select merchant_id into v_merchant_id from public.stores where id = v_job.store_id;
  v_position := (v_row.normalized_data ->> 'position')::integer;
  if v_job.status <> 'processing' or v_product is null
     or p_bucket is distinct from (select bucket from public.catalog_import_files where id = v_job.file_id)
     or p_object_key is distinct from ('media/' || v_job.store_id::text || '/product/' ||
       v_product.id::text || '/import-' || v_row.id::text || '-' || left(p_sha256, 32) || '.webp')
     or p_public_url !~ '^https://' or p_byte_size not between 32 and 12582912
     or p_sha256 !~ '^[a-f0-9]{64}$' or p_width not between 1 and 10000
     or p_height not between 1 and 10000 or v_position not between 0 and 9 then
    raise exception 'invalid_import_image_completion' using errcode = '22023';
  end if;
  insert into public.media_assets (
    id, owner_id, merchant_id, store_id, entity_type, entity_id, slot, visibility,
    bucket, object_key, public_url, content_type, byte_size, width, height, sha256, metadata
  ) values (
    v_asset_id, v_job.requested_by, v_merchant_id, v_job.store_id, 'product', v_product.id,
    'gallery', 'public', p_bucket, p_object_key, p_public_url, 'image/webp', p_byte_size,
    p_width, p_height, p_sha256,
    jsonb_build_object('catalog_import_job_id', v_job.id, 'catalog_import_row_id', v_row.id)
  );
  select * into v_revision from public.product_revisions
  where product_id = v_product.id and status = 'pending';
  with candidates as (
    select (item.value ->> 'asset_id')::uuid asset_id,
      coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1) sort_position,
      item.value ->> 'alt_text' alt_text
    from jsonb_array_elements(coalesce(v_revision.image_snapshot,
      public.catalog_live_image_snapshot(v_product.id)))
      with ordinality item(value, ordinality)
    where coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1) <> v_position
    union all
    select v_asset_id, v_position, v_product.name
  ), normalized as (
    select *, row_number() over (order by sort_position, asset_id) - 1 normalized_position
    from candidates
  )
  select jsonb_agg(jsonb_build_object('asset_id', asset_id,
    'position', normalized_position, 'alt_text', alt_text) order by normalized_position)
  into v_images from normalized;
  if jsonb_array_length(v_images) > 10 then
    raise exception 'product_image_limit_reached' using errcode = '23514';
  end if;
  perform public.stage_product_revision(v_product.id,
    coalesce(v_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
    v_images, v_job.requested_by, 'catalog-image:' || v_row.id::text || ':' || p_sha256);
  update public.catalog_import_rows
  set product_id = v_product.id, status = 'applied', worker_status = 'completed',
      worker_id = null, worker_lease_expires_at = null,
      normalized_data = normalized_data || jsonb_build_object('media_asset_id', v_asset_id)
  where id = v_row.id;
  update public.catalog_import_jobs set applied_rows = applied_rows + 1, updated_at = now()
  where id = v_job.id;
  select count(*) into v_pending from public.catalog_import_rows
  where job_id = v_job.id and sheet_name = 'Images' and status = 'valid';
  if v_pending = 0 then
    update public.catalog_import_jobs
    set status = 'completed', completed_at = now(), updated_at = now(),
      result = result || jsonb_build_object('images_pending', 0,
        'images_failed', (select count(*) from public.catalog_import_rows
          where job_id = v_job.id and sheet_name = 'Images' and worker_status = 'dead_letter'),
        'images_pending_moderation', true)
    where id = v_job.id;
  end if;
  return jsonb_build_object('row_id', v_row.id, 'job_id', v_job.id,
    'asset_id', v_asset_id, 'status', 'completed', 'idempotent', false,
    'pending_revision', true);
end;
$$;

-- Include post-publication revisions in the same admin moderation queue while
-- preserving the existing product/store action contract.
create or replace function public.list_pending_marketplace_moderation(
  p_entity text default 'all', p_limit integer default 30, p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
       order by item.ordinality limit 1)
    from public.product_revisions revision
    join public.products product on product.id = revision.product_id
    where revision.status = 'pending' and p_entity in ('all','product')
      and (p_before is null or revision.created_at < p_before)
    union all
    select 'store', store.id, store.id, store.name, store.status::text,
      store.first_submitted_at,
      (select asset.public_url from public.store_images image join public.media_assets asset
        on asset.id = image.media_asset_id and asset.status = 'active'
        where image.store_id = store.id order by case image.kind when 'logo' then 0 when 'cover' then 1 else 2 end,
          image.position limit 1)
    from public.stores store
    where store.status = 'pending_review' and p_entity in ('all','store')
      and (p_before is null or store.first_submitted_at < p_before)
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

-- ---------------------------------------------------------------------------
-- Append-only inventory ledger. Every stock row mutation is captured once;
-- reason inference covers merchant/import adjustments and order reservation,
-- confirmation, release, cancellation, and return deltas.
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  transaction_id bigint not null,
  stock_version bigint not null,
  reason text not null check (reason in (
    'initial_stock', 'merchant_adjustment', 'catalog_import_adjustment',
    'checkout_reserved', 'reservation_released', 'order_confirmed',
    'order_cancelled_or_returned', 'system_adjustment'
  )),
  on_hand_before integer not null,
  on_hand_after integer not null,
  on_hand_delta integer not null,
  reserved_before integer not null,
  reserved_after integer not null,
  reserved_delta integer not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name_snapshot text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (on_hand_after - on_hand_before = on_hand_delta),
  check (reserved_after - reserved_before = reserved_delta),
  check (on_hand_delta <> 0 or reserved_delta <> 0 or reason = 'initial_stock')
);

create index inventory_movements_variant_idx
  on public.inventory_movements (variant_id, id desc);
create index inventory_movements_store_idx
  on public.inventory_movements (store_id, created_at desc, id desc);
create index inventory_movements_product_idx
  on public.inventory_movements (product_id, created_at desc, id desc);

-- Establish a reconciliable opening balance for stock rows that predate this
-- migration. Future rows are captured by the trigger below.
insert into public.inventory_movements (
  variant_id, store_id, product_id, transaction_id, stock_version, reason,
  on_hand_before, on_hand_after, on_hand_delta,
  reserved_before, reserved_after, reserved_delta, idempotency_key
)
select stock.variant_id, variant.store_id, variant.product_id, txid_current(),
  stock.version, 'initial_stock', 0, stock.on_hand, stock.on_hand,
  0, stock.reserved, stock.reserved,
  'inventory-opening:' || stock.variant_id::text
from public.inventory_stock as stock
join public.product_variants as variant on variant.id = stock.variant_id
on conflict (idempotency_key) do nothing;

create or replace function public.record_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants;
  v_before_on_hand integer := case when tg_op = 'INSERT' then 0 else old.on_hand end;
  v_before_reserved integer := case when tg_op = 'INSERT' then 0 else old.reserved end;
  v_on_delta integer := new.on_hand - v_before_on_hand;
  v_reserved_delta integer := new.reserved - v_before_reserved;
  v_reason text;
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_key text;
begin
  if tg_op = 'UPDATE' and v_on_delta = 0 and v_reserved_delta = 0 then return new; end if;
  select * into v_variant from public.product_variants where id = new.variant_id;
  if tg_op = 'INSERT' then v_reason := 'initial_stock';
  elsif v_reserved_delta > 0 and v_on_delta = 0 then v_reason := 'checkout_reserved';
  elsif v_reserved_delta < 0 and v_on_delta < 0 then v_reason := 'order_confirmed';
  elsif v_reserved_delta < 0 and v_on_delta = 0 then v_reason := 'reservation_released';
  elsif v_on_delta > 0 and v_reserved_delta = 0 then v_reason := 'order_cancelled_or_returned';
  elsif v_actor is not null then v_reason := 'merchant_adjustment';
  else v_reason := 'system_adjustment';
  end if;
  if v_actor is not null then
    select display_name into v_actor_name from public.profiles where id = v_actor;
  end if;
  v_key := 'inventory:' || txid_current()::text || ':' || new.variant_id::text || ':' ||
    new.version::text || ':' || v_on_delta::text || ':' || v_reserved_delta::text;
  insert into public.inventory_movements (
    variant_id, store_id, product_id, transaction_id, stock_version, reason,
    on_hand_before, on_hand_after, on_hand_delta,
    reserved_before, reserved_after, reserved_delta,
    actor_user_id, actor_name_snapshot, idempotency_key
  ) values (
    new.variant_id, v_variant.store_id, v_variant.product_id, txid_current(), new.version,
    v_reason, v_before_on_hand, new.on_hand, v_on_delta,
    v_before_reserved, new.reserved, v_reserved_delta,
    v_actor, v_actor_name, v_key
  ) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create trigger inventory_stock_append_ledger
after insert or update of on_hand, reserved on public.inventory_stock
for each row execute function public.record_inventory_movement();

create or replace function public.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'inventory_movements'
     and old.actor_user_id is not null and new.actor_user_id is null
     and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id') then
    return new;
  end if;
  raise exception 'inventory_movements_are_append_only' using errcode = '55000';
end;
$$;

create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

-- Reservation rows are written immediately after the matching stock mutation.
-- This append-only link supplies the order/reference dimension without ever
-- rewriting the movement ledger.
create table public.inventory_movement_references (
  movement_id bigint primary key references public.inventory_movements(id) on delete restrict,
  reservation_id uuid not null references public.inventory_reservations(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  reference_type text not null check (reference_type in (
    'checkout_reservation', 'order_confirmation', 'reservation_release', 'order_return'
  )),
  created_at timestamptz not null default now()
);
create index inventory_movement_references_order_idx
  on public.inventory_movement_references (order_id, movement_id);
create index inventory_movement_references_reservation_idx
  on public.inventory_movement_references (reservation_id, movement_id);

create or replace function public.link_inventory_movement_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement_id bigint;
  v_reference_type text;
begin
  select movement.id into v_movement_id
  from public.inventory_movements as movement
  where movement.transaction_id = txid_current()
    and movement.variant_id = new.variant_id
    and not exists (
      select 1 from public.inventory_movement_references as reference
      where reference.movement_id = movement.id
    )
  order by movement.id desc limit 1;
  if v_movement_id is null then return new; end if;
  v_reference_type := case
    when tg_op = 'INSERT' then 'checkout_reservation'
    when new.status = 'committed' then 'order_confirmation'
    when old.status = 'committed' and new.status = 'released' then 'order_return'
    else 'reservation_release'
  end;
  insert into public.inventory_movement_references (
    movement_id, reservation_id, order_id, order_item_id, reference_type
  ) values (
    v_movement_id, new.id, new.order_id, new.order_item_id, v_reference_type
  ) on conflict (movement_id) do nothing;
  return new;
end;
$$;

create trigger inventory_reservations_link_movement
after insert or update of status on public.inventory_reservations
for each row execute function public.link_inventory_movement_reference();

create trigger inventory_movement_references_immutable
before update or delete on public.inventory_movement_references
for each row execute function public.prevent_inventory_movement_mutation();

alter table public.product_revisions enable row level security;
alter table public.product_revision_apply_context enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_movement_references enable row level security;

create policy product_revisions_read_catalog_or_admin
on public.product_revisions for select to authenticated
using (public.can_catalog_store(store_id) or public.is_marketplace_admin());
create policy inventory_movements_read_catalog_or_admin
on public.inventory_movements for select to authenticated
using (public.can_catalog_store(store_id) or public.is_marketplace_admin());
create policy inventory_movement_references_read_catalog_or_admin
on public.inventory_movement_references for select to authenticated
using (exists (
  select 1 from public.inventory_movements as movement
  where movement.id = inventory_movement_references.movement_id
    and (public.can_catalog_store(movement.store_id) or public.is_marketplace_admin())
));

revoke all on table public.product_revisions, public.product_revision_apply_context,
  public.inventory_movements, public.inventory_movement_references
  from public, anon, authenticated, service_role;
grant select on table public.product_revisions, public.inventory_movements,
  public.inventory_movement_references to authenticated;
grant select on table public.product_revisions, public.inventory_movements,
  public.inventory_movement_references to service_role;

revoke all on function public.guard_product_revision_immutability() from public, anon, authenticated;
revoke all on function public.catalog_sensitive_snapshot(public.products) from public, anon, authenticated;
revoke all on function public.catalog_live_image_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.stage_product_revision(uuid, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.stage_active_product_sensitive_changes() from public, anon, authenticated;
revoke all on function public.guard_active_product_image_dml() from public, anon, authenticated;
revoke all on function public.moderate_product_revision(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.record_inventory_movement() from public, anon, authenticated;
revoke all on function public.prevent_inventory_movement_mutation() from public, anon, authenticated;
revoke all on function public.link_inventory_movement_reference() from public, anon, authenticated;
revoke all on function public.get_my_marketplace_product(uuid) from public, anon, authenticated;
grant execute on function public.get_my_marketplace_product(uuid) to authenticated, service_role;
revoke all on function public.complete_catalog_import_image_job(
  bigint, uuid, text, text, text, bigint, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_catalog_import_image_job(
  bigint, uuid, text, text, text, bigint, text, integer, integer
) to service_role;
grant execute on function public.moderate_product_as_admin(uuid, boolean, text) to authenticated;

commit;
