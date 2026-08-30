begin;

create table public.marketplace_chat_attachments (
  id uuid primary key,
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  object_key text not null unique,
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_content_type text not null check (expected_content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  expected_byte_size integer not null check (expected_byte_size between 32 and 8388608),
  actual_sha256 text check (actual_sha256 ~ '^[a-f0-9]{64}$'),
  actual_content_type text check (actual_content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  actual_byte_size integer check (actual_byte_size between 32 and 8388608),
  width integer check (width between 1 and 4096),
  height integer check (height between 1 and 4096),
  message_id uuid unique references public.support_messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'quarantined', 'deleted')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  quarantined_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  check ((status = 'verified') = (verified_at is not null)),
  check ((status in ('quarantined', 'deleted')) = (deleted_at is not null))
);

create index marketplace_chat_attachments_pending_cleanup_idx
  on public.marketplace_chat_attachments (expires_at) where status = 'pending';
create index marketplace_chat_attachments_thread_idx
  on public.marketplace_chat_attachments (thread_id, created_at desc);

alter table public.marketplace_chat_attachments enable row level security;
revoke all on table public.marketplace_chat_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_chat_attachments to service_role;

create or replace function public.create_my_marketplace_chat_attachment(
  p_attachment_id uuid, p_thread_id uuid, p_object_key text, p_content_type text,
  p_byte_size integer, p_sha256 text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid()); v_bucket text := current_setting('app.private_media_bucket', true);
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.can_send_marketplace_chat_thread(p_thread_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_attachment_id is null or p_content_type not in ('image/jpeg','image/png','image/webp','image/avif')
     or p_byte_size not between 32 and 8388608 or p_sha256 !~ '^[a-f0-9]{64}$'
     or p_object_key !~ ('^chat/' || p_thread_id::text || '/' || v_actor_id::text || '/' || p_sha256 || '\.(jpg|png|webp|avif)$') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (p_content_type = 'image/jpeg' and p_object_key !~ '\.jpg$')
     or (p_content_type = 'image/png' and p_object_key !~ '\.png$')
     or (p_content_type = 'image/webp' and p_object_key !~ '\.webp$')
     or (p_content_type = 'image/avif' and p_object_key !~ '\.avif$') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- Bucket identity is server configuration, never caller input. The API also
  -- validates it before signing; this fallback preserves a non-null durable row.
  if v_bucket is null or v_bucket = '' then v_bucket := 'private'; end if;
  insert into public.marketplace_chat_attachments (
    id, thread_id, owner_id, bucket, object_key, expected_sha256, expected_content_type, expected_byte_size
  ) values (p_attachment_id, p_thread_id, v_actor_id, v_bucket, p_object_key, p_sha256, p_content_type, p_byte_size);
end; $$;

create or replace function public.get_my_marketplace_chat_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid()); v_attachment public.marketplace_chat_attachments;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_attachment from public.marketplace_chat_attachments where id = p_attachment_id;
  if v_attachment is null or not public.can_access_marketplace_chat_thread(v_attachment.thread_id)
     or (v_attachment.status = 'pending' and v_attachment.owner_id <> v_actor_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_attachment.id, 'threadId', v_attachment.thread_id, 'ownerId', v_attachment.owner_id,
    'objectKey', v_attachment.object_key, 'contentType', coalesce(v_attachment.actual_content_type, v_attachment.expected_content_type),
    'sha256', coalesce(v_attachment.actual_sha256, v_attachment.expected_sha256),
    'byteSize', coalesce(v_attachment.actual_byte_size, v_attachment.expected_byte_size),
    'width', v_attachment.width, 'height', v_attachment.height, 'status', v_attachment.status);
end; $$;

create or replace function public.complete_my_marketplace_chat_attachment(
  p_attachment_id uuid, p_width integer, p_height integer, p_actual_sha256 text,
  p_actual_byte_size integer, p_actual_content_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid()); v_attachment public.marketplace_chat_attachments;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_attachment from public.marketplace_chat_attachments where id = p_attachment_id for update;
  if v_attachment is null or v_attachment.owner_id <> v_actor_id or not public.can_send_marketplace_chat_thread(v_attachment.thread_id) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_attachment.status = 'verified' then return public.get_my_marketplace_chat_attachment(p_attachment_id); end if;
  if v_attachment.status <> 'pending' or v_attachment.expires_at < now()
     or p_width not between 1 and 4096 or p_height not between 1 and 4096
     or p_actual_content_type is distinct from v_attachment.expected_content_type
     or p_actual_byte_size is distinct from v_attachment.expected_byte_size
     or p_actual_sha256 is distinct from v_attachment.expected_sha256 then
    update public.marketplace_chat_attachments set status = 'quarantined', quarantined_at = now(), deleted_at = now(), delete_reason = 'validation_failed' where id = p_attachment_id;
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.marketplace_chat_attachments set status = 'verified', width = p_width, height = p_height,
    actual_sha256 = p_actual_sha256, actual_content_type = p_actual_content_type, actual_byte_size = p_actual_byte_size,
    verified_at = now() where id = p_attachment_id;
  return public.get_my_marketplace_chat_attachment(p_attachment_id);
end; $$;

create or replace function public.discard_my_marketplace_chat_attachment(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid()); v_attachment public.marketplace_chat_attachments;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_attachment from public.marketplace_chat_attachments where id = p_attachment_id for update;
  if v_attachment is null or v_attachment.owner_id <> v_actor_id or not public.can_access_marketplace_chat_thread(v_attachment.thread_id) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_attachment.status = 'pending' then
    update public.marketplace_chat_attachments set status = 'deleted', deleted_at = now(), delete_reason = left(coalesce(p_reason, 'client_cancelled'), 80) where id = p_attachment_id;
    insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
    values ('chat_media.delete_requested:' || v_attachment.id::text, 'chat_media.delete_requested', 'marketplace_chat_attachment', v_attachment.id::text,
      jsonb_build_object('object_key', v_attachment.object_key)) on conflict (event_key) do nothing;
  end if;
end; $$;

-- This finalization RPC is service-role only. Its values are derived from a
-- server-side object read + Sharp decode, never from a browser request.
create or replace function public.finalize_marketplace_chat_attachment_from_server(
  p_attachment_id uuid, p_width integer, p_height integer, p_actual_sha256 text,
  p_actual_byte_size integer, p_actual_content_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attachment public.marketplace_chat_attachments;
begin
  select * into v_attachment from public.marketplace_chat_attachments where id = p_attachment_id for update;
  if v_attachment is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_attachment.status = 'verified' then
    return jsonb_build_object('id', v_attachment.id, 'threadId', v_attachment.thread_id, 'ownerId', v_attachment.owner_id,
      'objectKey', v_attachment.object_key, 'contentType', v_attachment.actual_content_type, 'sha256', v_attachment.actual_sha256,
      'byteSize', v_attachment.actual_byte_size, 'width', v_attachment.width, 'height', v_attachment.height, 'status', v_attachment.status);
  end if;
  if v_attachment.status <> 'pending' or v_attachment.expires_at < now()
     or p_width not between 1 and 4096 or p_height not between 1 and 4096
     or p_actual_content_type is distinct from v_attachment.expected_content_type
     or p_actual_byte_size is distinct from v_attachment.expected_byte_size
     or p_actual_sha256 is distinct from v_attachment.expected_sha256 then
    update public.marketplace_chat_attachments set status = 'quarantined', quarantined_at = now(), deleted_at = now(), delete_reason = 'server_validation_failed' where id = p_attachment_id;
    insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
    values ('chat_media.delete_requested:' || v_attachment.id::text, 'chat_media.delete_requested', 'marketplace_chat_attachment', v_attachment.id::text,
      jsonb_build_object('object_key', v_attachment.object_key)) on conflict (event_key) do nothing;
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.marketplace_chat_attachments set status = 'verified', width = p_width, height = p_height,
    actual_sha256 = p_actual_sha256, actual_content_type = p_actual_content_type, actual_byte_size = p_actual_byte_size,
    verified_at = now() where id = p_attachment_id;
  return jsonb_build_object('id', v_attachment.id, 'threadId', v_attachment.thread_id, 'ownerId', v_attachment.owner_id,
    'objectKey', v_attachment.object_key, 'contentType', p_actual_content_type, 'sha256', p_actual_sha256,
    'byteSize', p_actual_byte_size, 'width', p_width, 'height', p_height, 'status', 'verified');
end; $$;

create or replace function public.expire_marketplace_chat_attachments(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  with expired as (
    select id from public.marketplace_chat_attachments
    where (status = 'pending' or (status = 'verified' and message_id is null)) and expires_at < now()
    order by expires_at asc limit p_limit for update skip locked
  ) update public.marketplace_chat_attachments as attachment
    set status = 'deleted', deleted_at = now(), delete_reason = 'expired_unbound_cleanup'
    from expired where attachment.id = expired.id;
  insert into public.marketplace_outbox (event_key, topic, aggregate_type, aggregate_id, payload)
  select 'chat_media.delete_requested:' || attachment.id::text, 'chat_media.delete_requested', 'marketplace_chat_attachment', attachment.id::text,
    jsonb_build_object('object_key', attachment.object_key)
  from public.marketplace_chat_attachments as attachment
  where attachment.deleted_at >= now() - interval '1 second' and attachment.delete_reason = 'expired_unbound_cleanup'
  on conflict (event_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Keep the existing message JSON projection as the source of every non-media
-- field, then add a same-origin, authorization-checked attachment handle.
alter function public.marketplace_chat_message_json(uuid, uuid)
  rename to marketplace_chat_message_json_base_private_media;
revoke all on function public.marketplace_chat_message_json_base_private_media(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.marketplace_chat_message_json_base_private_media(uuid, uuid) from public;
revoke execute on function public.marketplace_chat_message_json(uuid, uuid) from public;
create or replace function public.marketplace_chat_message_json(p_message_id uuid, p_actor_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select public.marketplace_chat_message_json_base_private_media(p_message_id, p_actor_id)
    || jsonb_build_object('attachment', (
      select jsonb_build_object(
        'id', attachment.id,
        'url', '/api/marketplace/chat/attachments?id=' || attachment.id::text,
        'width', attachment.width,
        'height', attachment.height,
        'alt', 'صورة مرفقة'
      )
      from public.marketplace_chat_attachments as attachment
      where attachment.message_id = p_message_id and attachment.status = 'verified'
        and public.can_access_marketplace_chat_thread(attachment.thread_id)
    ));
$$;

create or replace function public.send_my_marketplace_chat_image(
  p_thread_id uuid, p_client_message_id uuid, p_attachment_id uuid, p_reply_to_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := (select auth.uid()); v_attachment public.marketplace_chat_attachments; v_message jsonb;
begin
  if v_actor_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_attachment from public.marketplace_chat_attachments where id = p_attachment_id for update;
  if v_attachment is null or v_attachment.thread_id <> p_thread_id or v_attachment.owner_id <> v_actor_id
     or v_attachment.status <> 'verified' or v_attachment.message_id is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_message := public.send_my_marketplace_chat_message(p_thread_id, p_client_message_id, 'image', null, p_reply_to_id, null);
  update public.marketplace_chat_attachments
    set message_id = (v_message ->> 'id')::uuid
    where id = v_attachment.id and message_id is null;
  return public.marketplace_chat_message_json((v_message ->> 'id')::uuid, v_actor_id);
end; $$;

create or replace function public.can_share_my_marketplace_chat_location(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_send_marketplace_chat_thread(p_thread_id)
    and exists (
      select 1 from public.support_threads as thread
      join public.marketplace_delivery_assignments as assignment on assignment.order_id = thread.order_id
      where thread.id = p_thread_id and thread.conversation_kind = 'order'
        and thread.status = 'open' and thread.paused_at is null
        and assignment.status in ('assigned', 'picked_up', 'issue')
    );
$$;

revoke all on function public.create_my_marketplace_chat_attachment(uuid, uuid, text, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_marketplace_chat_attachment(uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_my_marketplace_chat_attachment(uuid, integer, integer, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.discard_my_marketplace_chat_attachment(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_marketplace_chat_attachment_from_server(uuid, integer, integer, text, integer, text) from public, anon, authenticated;
revoke all on function public.expire_marketplace_chat_attachments(integer) from public, anon, authenticated;
revoke all on function public.send_my_marketplace_chat_image(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_share_my_marketplace_chat_location(uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_my_marketplace_chat_attachment(uuid, uuid, text, text, integer, text) to authenticated;
grant execute on function public.get_my_marketplace_chat_attachment(uuid) to authenticated;
grant execute on function public.discard_my_marketplace_chat_attachment(uuid, text) to authenticated;
grant execute on function public.finalize_marketplace_chat_attachment_from_server(uuid, integer, integer, text, integer, text) to service_role;
grant execute on function public.expire_marketplace_chat_attachments(integer) to service_role;
grant execute on function public.send_my_marketplace_chat_image(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_share_my_marketplace_chat_location(uuid) to authenticated;

commit;
