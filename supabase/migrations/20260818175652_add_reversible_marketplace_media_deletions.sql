-- Reversible product/store image removal. Physical object deletion is delayed
-- until the authenticated undo window closes, so UI undo remains truthful.

create table public.marketplace_media_deletion_intents (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete cascade,
  entity_type public.marketplace_media_entity not null
    check (entity_type in ('product', 'store')),
  entity_id uuid not null,
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot) = 'array'),
  after_snapshot_sha256 text not null check (after_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  outbox_id bigint references public.marketplace_outbox(id) on delete set null,
  expires_at timestamptz not null,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (undone_at is null or undone_at >= created_at)
);

create index marketplace_media_deletion_intents_actor_active_idx
  on public.marketplace_media_deletion_intents (actor_user_id, entity_type, entity_id, expires_at desc)
  where undone_at is null;

alter table public.marketplace_media_deletion_intents enable row level security;
revoke all on table public.marketplace_media_deletion_intents from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_media_deletion_intents to service_role;

alter function public.delete_my_marketplace_media(uuid, timestamptz)
  rename to delete_my_marketplace_media_base_175652;
revoke all on function public.delete_my_marketplace_media_base_175652(uuid, timestamptz)
  from public, anon, authenticated, service_role;

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
  v_store public.stores;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_intent_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_outbox_id bigint;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_asset from public.media_assets where id = p_asset_id for update;
  if v_asset is null or v_asset.entity_type not in ('product', 'store') then
    raise exception 'media_asset_not_found' using errcode = 'P0002';
  end if;

  if v_asset.entity_type = 'product' then
    select * into v_product from public.products where id = v_asset.entity_id for update;
    if v_product is null then raise exception 'media_entity_not_found' using errcode = 'P0002'; end if;
    select coalesce(revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id))
      into v_before
    from (select 1) as seed
    left join public.product_revisions as revision
      on revision.product_id = v_product.id and revision.status = 'pending';
  else
    select * into v_store from public.stores where id = v_asset.store_id for update;
    if v_store is null then raise exception 'media_entity_not_found' using errcode = 'P0002'; end if;
    select coalesce(revision.image_snapshot, public.store_live_image_snapshot(v_store.id))
      into v_before
    from (select 1) as seed
    left join public.store_revisions as revision
      on revision.store_id = v_store.id and revision.status = 'pending';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_before) as item(value)
    where (item.value ->> 'asset_id')::uuid = p_asset_id
  ) then
    raise exception 'media_asset_not_in_entity' using errcode = '22023';
  end if;

  v_result := public.delete_my_marketplace_media_base_175652(
    p_asset_id, p_expected_asset_updated_at
  );

  if v_asset.entity_type = 'product' then
    select coalesce(revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id))
      into v_after
    from (select 1) as seed
    left join public.product_revisions as revision
      on revision.product_id = v_product.id and revision.status = 'pending';
  else
    select coalesce(revision.image_snapshot, public.store_live_image_snapshot(v_store.id))
      into v_after
    from (select 1) as seed
    left join public.store_revisions as revision
      on revision.store_id = v_store.id and revision.status = 'pending';
  end if;

  -- Draft deletion creates this event in the wrapped function. Keep the object
  -- until expiry; published entities only create it after moderation.
  update public.marketplace_outbox
  set available_at = greatest(available_at, v_expires_at)
  where event_key = 'media.delete_requested:' || p_asset_id::text
    and processed_at is null and dead_lettered_at is null and locked_at is null
  returning id into v_outbox_id;

  insert into public.marketplace_media_deletion_intents (
    id, actor_user_id, asset_id, store_id, entity_type, entity_id,
    before_snapshot, after_snapshot_sha256, outbox_id, expires_at
  ) values (
    v_intent_id, v_actor, p_asset_id, v_asset.store_id, v_asset.entity_type,
    v_asset.entity_id, v_before,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_after::text, 'UTF8'), 'sha256'), 'hex'),
    v_outbox_id, v_expires_at
  );

  return v_result || jsonb_build_object(
    'undo_id', v_intent_id,
    'undo_expires_at', v_expires_at
  );
end;
$$;

create or replace function public.undo_my_marketplace_media_deletion(p_undo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_intent public.marketplace_media_deletion_intents;
  v_asset public.media_assets;
  v_product public.products;
  v_store public.stores;
  v_revision public.product_revisions;
  v_store_revision public.store_revisions;
  v_current jsonb;
  v_current_hash text;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_intent
  from public.marketplace_media_deletion_intents
  where id = p_undo_id and actor_user_id = v_actor
  for update;
  if v_intent is null then raise exception 'media_undo_not_found' using errcode = 'P0002'; end if;
  if v_intent.undone_at is not null then
    return jsonb_build_object('undo_id', v_intent.id, 'asset_id', v_intent.asset_id,
      'entity_id', v_intent.entity_id, 'undone', true, 'idempotent', true);
  end if;
  if v_intent.expires_at <= now() then
    raise exception 'media_undo_expired' using errcode = '55000';
  end if;
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      v_intent.store_id, v_actor, array['owner','manager','catalog']
    )
  );
  select * into v_asset from public.media_assets where id = v_intent.asset_id for update;
  if v_asset is null then raise exception 'media_asset_not_found' using errcode = 'P0002'; end if;

  if v_intent.entity_type = 'product' then
    select * into v_product from public.products where id = v_intent.entity_id for update;
    select * into v_revision from public.product_revisions
      where product_id = v_product.id and status = 'pending';
    v_current := coalesce(v_revision.image_snapshot, public.catalog_live_image_snapshot(v_product.id));
  else
    select * into v_store from public.stores where id = v_intent.entity_id for update;
    select * into v_store_revision from public.store_revisions
      where store_id = v_store.id and status = 'pending';
    v_current := coalesce(v_store_revision.image_snapshot, public.store_live_image_snapshot(v_store.id));
  end if;
  v_current_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_current::text, 'UTF8'), 'sha256'), 'hex'
  );
  if v_current_hash <> v_intent.after_snapshot_sha256 then
    raise exception 'media_undo_version_conflict' using errcode = '40001';
  end if;

  -- A revision deletion may already have soft-deleted an image that existed
  -- only in the proposal. Reactivate it transactionally before restaging.
  update public.media_assets
    set status = 'active', deleted_at = null, updated_at = now()
    where id = v_intent.asset_id;

  if v_intent.entity_type = 'product' and v_product.status = 'active' then
    perform public.stage_product_revision(
      v_product.id,
      coalesce(v_revision.proposed_snapshot, public.catalog_sensitive_snapshot(v_product)),
      v_intent.before_snapshot,
      v_actor,
      'media-undo:' || v_intent.id::text
    );
  elsif v_intent.entity_type = 'store' and v_store.status = 'published' then
    perform public.stage_store_revision(
      v_store.id,
      coalesce(v_store_revision.proposed_snapshot, public.store_sensitive_snapshot(v_store)),
      v_intent.before_snapshot,
      v_actor,
      'store-media-undo:' || v_intent.id::text
    );
  else
    if v_intent.entity_type = 'product' then
      delete from public.product_images where product_id = v_intent.entity_id;
      insert into public.product_images (
        product_id, media_asset_id, position, alt_text
      )
      select v_intent.entity_id, (item.value ->> 'asset_id')::uuid,
        (item.value ->> 'position')::smallint, nullif(item.value ->> 'alt_text', '')
      from jsonb_array_elements(v_intent.before_snapshot) as item(value);
      update public.products set updated_at = now() where id = v_intent.entity_id;
    else
      delete from public.store_images where store_id = v_intent.entity_id;
      insert into public.store_images (
        store_id, media_asset_id, position, alt_text, kind
      )
      select v_intent.entity_id, (item.value ->> 'asset_id')::uuid,
        (item.value ->> 'position')::smallint, nullif(item.value ->> 'alt_text', ''),
        item.value ->> 'kind'
      from jsonb_array_elements(v_intent.before_snapshot) as item(value);
      update public.stores set updated_at = now() where id = v_intent.entity_id;
    end if;
  end if;

  if v_intent.outbox_id is not null then
    delete from public.marketplace_outbox
    where id = v_intent.outbox_id and processed_at is null
      and dead_lettered_at is null and locked_at is null;
    if not found then raise exception 'media_undo_object_delete_started' using errcode = '55000'; end if;
  end if;
  update public.marketplace_media_deletion_intents
    set undone_at = now() where id = v_intent.id;
  return jsonb_build_object('undo_id', v_intent.id, 'asset_id', v_intent.asset_id,
    'entity_id', v_intent.entity_id, 'undone', true, 'idempotent', false);
end;
$$;

create or replace function public.list_my_marketplace_media_deletion_intents(
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_entity_type not in ('product', 'store') then
    raise exception 'invalid_media_entity_type' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'undo_id', intent.id, 'asset_id', intent.asset_id,
      'expires_at', intent.expires_at
    ) order by intent.created_at desc)
    from public.marketplace_media_deletion_intents as intent
    where intent.actor_user_id = v_actor
      and intent.entity_type = p_entity_type
      and intent.entity_id = p_entity_id
      and intent.undone_at is null
      and intent.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_marketplace_store_media(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_store public.stores;
  v_revision public.store_revisions;
  v_images jsonb;
begin
  select * into v_store from public.stores where id = p_store_id;
  if v_store is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  perform public.require_marketplace_admin_fallback(
    public.has_marketplace_store_role_without_admin(
      p_store_id, v_actor, array['owner','manager','catalog']
    )
  );
  select * into v_revision from public.store_revisions
    where store_id = p_store_id and status = 'pending';
  v_images := coalesce(v_revision.image_snapshot, public.store_live_image_snapshot(p_store_id));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'asset_id', asset.id, 'public_url', asset.public_url,
      'position', (item.value ->> 'position')::integer,
      'alt_text', nullif(item.value ->> 'alt_text', ''),
      'kind', item.value ->> 'kind', 'updated_at', asset.updated_at
    ) order by (item.value ->> 'position')::integer)
    from jsonb_array_elements(v_images) as item(value)
    join public.media_assets as asset
      on asset.id = (item.value ->> 'asset_id')::uuid and asset.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.guard_revision_during_media_undo_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type public.marketplace_media_entity;
  v_entity_id uuid;
begin
  if tg_table_name = 'product_revisions' then
    v_entity_type := 'product'; v_entity_id := old.product_id;
  else
    v_entity_type := 'store'; v_entity_id := old.store_id;
  end if;
  if old.status = 'pending'
     and (tg_op = 'DELETE' or new.status <> 'pending')
     and exists (
       select 1 from public.marketplace_media_deletion_intents as intent
       where intent.entity_type = v_entity_type and intent.entity_id = v_entity_id
         and intent.undone_at is null and intent.expires_at > now()
     ) then
    raise exception 'media_deletion_undo_window_active' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger product_revisions_guard_media_undo
before update or delete on public.product_revisions
for each row execute function public.guard_revision_during_media_undo_window();
create trigger store_revisions_guard_media_undo
before update or delete on public.store_revisions
for each row execute function public.guard_revision_during_media_undo_window();

revoke all on function public.delete_my_marketplace_media(uuid, timestamptz)
  from public, anon;
grant execute on function public.delete_my_marketplace_media(uuid, timestamptz)
  to authenticated;
revoke all on function public.undo_my_marketplace_media_deletion(uuid)
  from public, anon;
grant execute on function public.undo_my_marketplace_media_deletion(uuid)
  to authenticated;
revoke all on function public.list_my_marketplace_media_deletion_intents(
  public.marketplace_media_entity, uuid
) from public, anon;
grant execute on function public.list_my_marketplace_media_deletion_intents(
  public.marketplace_media_entity, uuid
) to authenticated;
revoke all on function public.get_my_marketplace_store_media(uuid)
  from public, anon;
grant execute on function public.get_my_marketplace_store_media(uuid)
  to authenticated;
revoke all on function public.guard_revision_during_media_undo_window()
  from public, anon, authenticated, service_role;
