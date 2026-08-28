begin;

-- Current Supabase contracts consulted on 2026-08-24:
-- https://supabase.com/changelog.md
-- https://supabase.com/changelog/realtime-schema-locked-down-against-modification
-- https://supabase.com/docs/guides/realtime/authorization
-- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
-- https://supabase.com/docs/guides/realtime/broadcast
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- Realtime's schema is locked down, so this migration creates only supported
-- policies on realtime.messages. All application functions remain in public.

alter type public.marketplace_admin_role add value if not exists 'chat_monitor';

alter table public.support_threads
  add column if not exists conversation_kind text not null default 'support'
    check (conversation_kind in ('presale', 'order', 'support', 'dispute')),
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null;

create table public.marketplace_chat_participants (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('customer', 'merchant', 'driver', 'admin')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  last_read_message_id uuid,
  muted_until timestamptz,
  counterparty_blocked_at timestamptz,
  primary key (thread_id, user_id, participant_role),
  check (removed_at is null or removed_at >= joined_at)
);

create table public.marketplace_chat_blocks (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_at timestamptz not null default now(),
  primary key (thread_id, blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table public.marketplace_chat_block_escalations (
  source_thread_id uuid not null references public.support_threads(id) on delete cascade,
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  escalation_thread_id uuid not null unique references public.support_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_thread_id, blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id),
  check (source_thread_id <> escalation_thread_id)
);

alter table public.support_messages
  add column if not exists client_message_id uuid,
  add column if not exists message_kind text not null default 'text'
    check (message_kind in ('text', 'image', 'product', 'store', 'order', 'location', 'system')),
  add column if not exists reply_to_id uuid references public.support_messages(id) on delete set null,
  add column if not exists card_data jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_body text,
  add column if not exists revision bigint not null default 1
    check (revision > 0),
  add column if not exists search_document tsvector generated always as (
    to_tsvector('simple', coalesce(body, ''))
  ) stored;

alter table public.support_messages drop constraint if exists support_messages_sender_kind_check;
alter table public.support_messages add constraint support_messages_sender_kind_check
  check (sender_kind in ('customer', 'merchant', 'driver', 'admin', 'system'));

-- Card and image messages intentionally have no text body. Existing support
-- messages remain valid and legacy RPCs continue to send non-empty text.
alter table public.support_messages alter column body drop not null;
alter table public.support_messages drop constraint if exists support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check
  check (body is null or char_length(trim(body)) between 1 and 5000);

alter table public.marketplace_chat_participants
  add constraint marketplace_chat_participants_last_read_fk
  foreign key (last_read_message_id) references public.support_messages(id) on delete set null;

create table public.marketplace_chat_reactions (
  message_id uuid not null references public.support_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '✅', '🙏', '😄')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- Every reaction mutation, including retention cleanup, advances the message
-- snapshot revision in the same transaction as the reaction row change.
create or replace function public.bump_marketplace_chat_message_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.message_id is distinct from new.message_id then
    update public.support_messages set revision = revision + 1 where id = old.message_id;
    update public.support_messages set revision = revision + 1 where id = new.message_id;
  else
    update public.support_messages
    set revision = revision + 1
    where id = coalesce(new.message_id, old.message_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists marketplace_chat_reaction_revision on public.marketplace_chat_reactions;
create trigger marketplace_chat_reaction_revision
after insert or update or delete on public.marketplace_chat_reactions
for each row execute function public.bump_marketplace_chat_message_revision();

create unique index support_messages_sender_client_key
  on public.support_messages(thread_id, sender_user_id, client_message_id)
  where client_message_id is not null;
create index marketplace_chat_participants_user_active_idx
  on public.marketplace_chat_participants(user_id, thread_id)
  where removed_at is null;
create index marketplace_chat_reactions_user_idx
  on public.marketplace_chat_reactions(user_id, message_id);
create index marketplace_chat_blocks_blocked_idx
  on public.marketplace_chat_blocks(thread_id, blocked_user_id, blocker_user_id);
create index support_messages_thread_search_idx
  on public.support_messages(thread_id, created_at desc, id desc)
  where deleted_at is null;
create index support_messages_search_document_idx
  on public.support_messages using gin (search_document)
  where deleted_at is null;
create unique index support_threads_active_presale_key
  on public.support_threads(customer_id, store_id)
  where conversation_kind = 'presale' and status not in ('resolved', 'closed');
create unique index support_threads_order_conversation_key
  on public.support_threads(order_id)
  where conversation_kind = 'order';

insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
select thread.id, customer.auth_user_id, 'customer'
from public.support_threads as thread
join public.marketplace_customers as customer on customer.id = thread.customer_id
where customer.auth_user_id is not null and customer.is_active
on conflict (thread_id, user_id, participant_role) do nothing;

insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
select thread.id, membership.user_id, 'merchant'
from public.support_threads as thread
join public.store_memberships as membership on membership.store_id = thread.store_id
where membership.is_active
  and membership.role in ('owner', 'manager', 'fulfillment')
on conflict (thread_id, user_id, participant_role) do nothing;

insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
select thread.id, thread.assigned_admin_id, 'admin'
from public.support_threads as thread
join public.profiles as profile on profile.id = thread.assigned_admin_id
where thread.assigned_admin_id is not null and profile.role = 'admin' and profile.is_active
on conflict (thread_id, user_id, participant_role) do nothing;

insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
select thread.id, assignment.driver_id, 'driver'
from public.support_threads as thread
join public.marketplace_delivery_assignments as assignment on assignment.order_id = thread.order_id
join public.profiles as profile on profile.id = assignment.driver_id
where assignment.driver_id is not null and assignment.status in ('assigned', 'picked_up', 'issue')
  and profile.role = 'driver' and profile.is_active
  and thread.conversation_kind = 'order'
on conflict (thread_id, user_id, participant_role) do nothing;

create or replace function public.can_send_marketplace_chat_thread(p_thread_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.marketplace_chat_participants as participant
    join public.support_threads as thread on thread.id = participant.thread_id
    where participant.thread_id = p_thread_id
      and participant.user_id = v_actor_id
      and participant.removed_at is null
      and (
        (
          participant.participant_role = 'customer'
          and exists (
            select 1 from public.marketplace_customers as customer
            where customer.id = thread.customer_id
              and customer.auth_user_id = v_actor_id and customer.is_active
          )
        )
        or (
          participant.participant_role = 'merchant'
          and exists (
            select 1 from public.store_memberships as membership
            where membership.store_id = thread.store_id
              and membership.user_id = v_actor_id and membership.is_active
              and membership.role in ('owner', 'manager', 'fulfillment')
          )
        )
        or (
          participant.participant_role = 'driver'
          and exists (
            select 1
            from public.marketplace_delivery_assignments as assignment
            join public.profiles as profile on profile.id = assignment.driver_id
            where assignment.order_id = thread.order_id
              and assignment.driver_id = v_actor_id
              and assignment.status in ('assigned', 'picked_up', 'issue')
              and profile.role = 'driver' and profile.is_active
          )
        )
        or (
          participant.participant_role = 'admin'
          and thread.assigned_admin_id = v_actor_id
          and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
          and exists (
            select 1
            from public.profiles as profile
            join public.admin_memberships as membership on membership.user_id = profile.id
            where profile.id = v_actor_id
              and profile.role = 'admin' and profile.is_active
              and not profile.must_change_password and membership.is_active
              and membership.role::text in ('support', 'super_admin')
          )
        )
      )
  );
end;
$$;

create or replace function public.can_access_marketplace_chat_thread(p_thread_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    return false;
  end if;

  if coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
     and exists (
       select 1
       from public.profiles as profile
       join public.admin_memberships as membership on membership.user_id = profile.id
       where profile.id = v_actor_id and profile.role = 'admin' and profile.is_active
         and not profile.must_change_password and membership.is_active
         and membership.role::text = 'chat_monitor'
     ) then
    return exists (select 1 from public.support_threads where id = p_thread_id);
  end if;

  return public.can_send_marketplace_chat_thread(p_thread_id);
end;
$$;

create or replace function public.marketplace_chat_thread_id_from_topic(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^marketplace-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then substring(p_topic from 18)::uuid
    else null
  end;
$$;

create or replace function public.marketplace_chat_message_json(
  p_message_id uuid,
  p_actor_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', message.id,
    'clientMessageId', message.client_message_id,
    'conversationId', message.thread_id,
    'senderId', message.sender_user_id,
    'senderRole', message.sender_kind,
    'kind', message.message_kind,
    'body', case when message.deleted_at is null then message.body else null end,
    'replyToId', message.reply_to_id,
    'card', case
      when message.deleted_at is not null or message.card_data is null then null
      when message.message_kind = 'product' then (
        select message.card_data || jsonb_build_object('label', product.name)
        from public.products as product
        where product.id = (message.card_data ->> 'id')::uuid
      )
      when message.message_kind = 'store' then (
        select message.card_data || jsonb_build_object('label', store.name)
        from public.stores as store
        where store.id = (message.card_data ->> 'id')::uuid
      )
      when message.message_kind = 'order' then (
        select message.card_data || jsonb_build_object('label', marketplace_order.public_code)
        from public.marketplace_orders as marketplace_order
        where marketplace_order.id = (message.card_data ->> 'id')::uuid
      )
      when message.message_kind = 'location' then
        message.card_data || jsonb_build_object('label', 'Shared location')
      else null
    end,
    'attachment', null,
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'emoji', reaction_count.emoji,
        'count', reaction_count.reaction_count,
        'reactedByMe', reaction_count.reacted_by_me
      ) order by reaction_count.emoji)
      from (
        select reaction.emoji, count(*)::integer as reaction_count,
          bool_or(reaction.user_id = p_actor_id) as reacted_by_me
        from public.marketplace_chat_reactions as reaction
        where reaction.message_id = message.id
        group by reaction.emoji
      ) as reaction_count
    ), '[]'::jsonb),
    'deleted', message.deleted_at is not null,
    'revision', message.revision,
    'createdAt', message.created_at
  )
  from public.support_messages as message
  where message.id = p_message_id;
$$;

create or replace function public.marketplace_chat_conversation_summary(
  p_thread_id uuid,
  p_actor_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', thread.id,
    'publicCode', thread.public_code,
    'kind', thread.conversation_kind,
    'status', case when thread.paused_at is not null then 'paused' else thread.status::text end,
    'subject', thread.subject,
    'store', case when store.id is null then null else jsonb_build_object(
      'id', store.id, 'name', store.name
    ) end,
    'order', case when marketplace_order.id is null then null else jsonb_build_object(
      'id', marketplace_order.id, 'publicCode', marketplace_order.public_code
    ) end,
    'counterpart', (
      select jsonb_build_object(
        'displayName', coalesce(profile.display_name, customer.display_name, store.name, 'DAIRTAK'),
        'role', participant.participant_role,
        'avatarUrl', customer.avatar_url
      )
      from public.marketplace_chat_participants as participant
      left join public.profiles as profile on profile.id = participant.user_id
      left join public.marketplace_customers as customer on customer.auth_user_id = participant.user_id
      where participant.thread_id = thread.id and participant.user_id <> p_actor_id
        and participant.removed_at is null
      order by case participant.participant_role
        when 'customer' then 0 when 'merchant' then 1 when 'driver' then 2 else 3 end,
        participant.joined_at
      limit 1
    ),
    'lastMessageAt', thread.last_message_at,
    'unreadCount', (
      select count(*)::integer
      from public.support_messages as unread_message
      left join public.support_messages as read_message on read_message.id = participant.last_read_message_id
      where unread_message.thread_id = thread.id
        and unread_message.sender_user_id is distinct from p_actor_id
        and (
          participant.last_read_message_id is null
          or (unread_message.created_at, unread_message.id) > (read_message.created_at, read_message.id)
        )
    )
  )
  from public.support_threads as thread
  left join public.stores as store on store.id = thread.store_id
  left join public.marketplace_orders as marketplace_order on marketplace_order.id = thread.order_id
  left join public.marketplace_chat_participants as participant
    on participant.thread_id = thread.id and participant.user_id = p_actor_id
      and participant.removed_at is null
  where thread.id = p_thread_id;
$$;

create or replace function public.open_my_marketplace_conversation(
  p_store_id uuid,
  p_order_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_customer public.marketplace_customers;
  v_store public.stores;
  v_order public.marketplace_orders;
  v_thread public.support_threads;
  v_allowed boolean := false;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('presale', 'order')
     or (p_kind = 'presale' and (p_store_id is null or p_order_id is not null))
     or (p_kind = 'order' and (p_order_id is null or p_store_id is not null)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_customer
  from public.marketplace_customers
  where auth_user_id = v_actor_id and is_active;

  if p_kind = 'presale' then
    select * into v_store from public.stores
    where id = p_store_id and status = 'published';
    if v_store is null or v_customer is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-chat:presale:' || v_customer.id::text || ':' || v_store.id::text, 0)
    );
    select * into v_thread
    from public.support_threads
    where customer_id = v_customer.id and store_id = v_store.id
      and conversation_kind = 'presale' and status not in ('resolved', 'closed')
    order by created_at desc limit 1;
    if v_thread is null then
      insert into public.support_threads (
        customer_id, store_id, subject, conversation_kind
      ) values (
        v_customer.id, v_store.id, 'Chat with ' || v_store.name, 'presale'
      ) returning * into v_thread;
    end if;
  else
    select * into v_order from public.marketplace_orders where id = p_order_id;
    if v_order is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_allowed := (
      v_customer is not null and v_customer.id = v_order.customer_id
    ) or exists (
      select 1 from public.store_memberships as membership
      where membership.store_id = v_order.store_id
        and membership.user_id = v_actor_id and membership.is_active
        and membership.role in ('owner', 'manager', 'fulfillment')
    ) or exists (
      select 1
      from public.marketplace_delivery_assignments as assignment
      join public.profiles as profile on profile.id = assignment.driver_id
      where assignment.order_id = v_order.id and assignment.driver_id = v_actor_id
        and assignment.status in ('assigned', 'picked_up', 'issue')
        and profile.role = 'driver' and profile.is_active
    );
    if not v_allowed then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('marketplace-chat:order:' || v_order.id::text, 0)
    );
    select * into v_thread from public.support_threads
    where order_id = v_order.id and conversation_kind = 'order'
    order by created_at limit 1;
    if v_thread is null then
      insert into public.support_threads (
        customer_id, store_id, order_id, subject, conversation_kind
      ) values (
        v_order.customer_id, v_order.store_id, v_order.id,
        'Order chat ' || v_order.public_code, 'order'
      ) returning * into v_thread;
    end if;
  end if;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, customer.auth_user_id, 'customer'
  from public.marketplace_customers as customer
  where customer.id = v_thread.customer_id and customer.auth_user_id is not null and customer.is_active
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, membership.user_id, 'merchant'
  from public.store_memberships as membership
  where membership.store_id = v_thread.store_id and membership.is_active
    and membership.role in ('owner', 'manager', 'fulfillment')
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null,
    joined_at = case
      when public.marketplace_chat_participants.removed_at is not null then now()
      else public.marketplace_chat_participants.joined_at
    end;

  insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
  select v_thread.id, assignment.driver_id, 'driver'
  from public.marketplace_delivery_assignments as assignment
  join public.profiles as profile on profile.id = assignment.driver_id
  where assignment.order_id = v_thread.order_id and assignment.driver_id is not null
    and assignment.status in ('assigned', 'picked_up', 'issue')
    and profile.role = 'driver' and profile.is_active
  on conflict (thread_id, user_id, participant_role)
  do update set removed_at = null,
    joined_at = case
      when public.marketplace_chat_participants.removed_at is not null then now()
      else public.marketplace_chat_participants.joined_at
    end;

  if not public.can_access_marketplace_chat_thread(v_thread.id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public.marketplace_chat_conversation_summary(v_thread.id, v_actor_id);
end;
$$;

create or replace function public.list_my_marketplace_conversations(
  p_kind text default null,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_items jsonb;
  v_next jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or (p_kind is not null and p_kind not in ('presale', 'order', 'support', 'dispute'))
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  with page as materialized (
    select thread.id, thread.last_message_at
    from public.support_threads as thread
    where public.can_access_marketplace_chat_thread(thread.id)
      and (p_kind is null or thread.conversation_kind = p_kind)
      and (
        p_before_created_at is null
        or (thread.last_message_at, thread.id) < (p_before_created_at, p_before_id)
      )
    order by thread.last_message_at desc, thread.id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      public.marketplace_chat_conversation_summary(page.id, v_actor_id)
      order by page.last_message_at desc, page.id desc
    ), '[]'::jsonb),
    case when count(*) = p_limit then (
      select jsonb_build_object('createdAt', tail.last_message_at, 'id', tail.id)
      from page as tail order by tail.last_message_at, tail.id limit 1
    ) else null end
  into v_items, v_next
  from page;
  return jsonb_build_object('items', v_items, 'nextCursor', v_next);
end;
$$;

create or replace function public.get_my_marketplace_conversation_page(
  p_thread_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_items jsonb;
  v_next jsonb;
  v_last_read uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not public.can_access_marketplace_chat_thread(p_thread_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  with page as materialized (
    select message.id, message.created_at
    from public.support_messages as message
    where message.thread_id = p_thread_id
      and (
        p_before_created_at is null
        or (message.created_at, message.id) < (p_before_created_at, p_before_id)
      )
    order by message.created_at desc, message.id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      public.marketplace_chat_message_json(page.id, v_actor_id)
      order by page.created_at, page.id
    ), '[]'::jsonb),
    case when count(*) = p_limit then (
      select jsonb_build_object('createdAt', tail.created_at, 'id', tail.id)
      from page as tail order by tail.created_at, tail.id limit 1
    ) else null end
  into v_items, v_next
  from page;

  select participant.last_read_message_id into v_last_read
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
  order by participant.joined_at limit 1;

  return jsonb_build_object(
    'conversation', public.marketplace_chat_conversation_summary(p_thread_id, v_actor_id),
    'messages', v_items,
    'nextCursor', v_next,
    'lastReadMessageId', v_last_read
  );
end;
$$;

create or replace function public.search_my_marketplace_chat_messages(
  p_thread_id uuid,
  p_query text,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_query text := trim(coalesce(p_query, ''));
  v_items jsonb;
  v_next jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if char_length(v_query) not between 1 and 200
     or p_limit is null or p_limit not between 1 and 50
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not public.can_access_marketplace_chat_thread(p_thread_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  with page as materialized (
    select message.id, message.created_at
    from public.support_messages as message
    where message.thread_id = p_thread_id and message.deleted_at is null
      and message.search_document @@ websearch_to_tsquery('simple', v_query)
      and (
        p_before_created_at is null
        or (message.created_at, message.id) < (p_before_created_at, p_before_id)
      )
    order by message.created_at desc, message.id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      public.marketplace_chat_message_json(page.id, v_actor_id)
      order by page.created_at desc, page.id desc
    ), '[]'::jsonb),
    case when count(*) = p_limit then (
      select jsonb_build_object('createdAt', tail.created_at, 'id', tail.id)
      from page as tail order by tail.created_at, tail.id limit 1
    ) else null end
  into v_items, v_next from page;
  return jsonb_build_object('items', v_items, 'nextCursor', v_next);
end;
$$;

create or replace function public.send_my_marketplace_chat_message(
  p_thread_id uuid,
  p_client_message_id uuid,
  p_kind text,
  p_body text,
  p_reply_to_id uuid,
  p_card_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
  v_sender_kind text;
  v_message public.support_messages;
  v_card_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.can_send_marketplace_chat_thread(p_thread_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if v_thread is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_message
  from public.support_messages as message
  where message.thread_id = p_thread_id and message.sender_user_id = v_actor_id
    and message.client_message_id = p_client_message_id;
  if v_message is not null then
    return public.marketplace_chat_message_json(v_message.id, v_actor_id);
  end if;

  select participant.participant_role into v_sender_kind
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
    and (
      (participant.participant_role = 'customer' and exists (
        select 1 from public.marketplace_customers as customer
        where customer.id = v_thread.customer_id
          and customer.auth_user_id = v_actor_id and customer.is_active
      ))
      or (participant.participant_role = 'merchant' and exists (
        select 1 from public.store_memberships as membership
        where membership.store_id = v_thread.store_id
          and membership.user_id = v_actor_id and membership.is_active
          and membership.role in ('owner', 'manager', 'fulfillment')
      ))
      or (participant.participant_role = 'driver' and exists (
        select 1
        from public.marketplace_delivery_assignments as assignment
        join public.profiles as profile on profile.id = assignment.driver_id
        where assignment.order_id = v_thread.order_id
          and assignment.driver_id = v_actor_id
          and assignment.status in ('assigned', 'picked_up', 'issue')
          and profile.role = 'driver' and profile.is_active
      ))
      or (participant.participant_role = 'admin'
        and v_thread.assigned_admin_id = v_actor_id
        and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
        and exists (
          select 1
          from public.profiles as profile
          join public.admin_memberships as membership on membership.user_id = profile.id
          where profile.id = v_actor_id
            and profile.role = 'admin' and profile.is_active
            and not profile.must_change_password and membership.is_active
            and membership.role::text in ('support', 'super_admin')
        )
      )
    )
  order by case participant.participant_role
    when 'customer' then 0 when 'merchant' then 1 when 'driver' then 2 else 3 end
  limit 1;
  if v_sender_kind is null then
    -- Monitors may observe but can never impersonate a participant.
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- A block names an exact pair. Read access remains intact so delivery and
  -- support updates stay visible, but neither member of that pair may continue
  -- a direct exchange in the shared conversation.
  if exists (
    select 1
    from public.marketplace_chat_blocks as block
    where block.thread_id = p_thread_id
      and (
        (
          block.blocker_user_id = v_actor_id
          and exists (
            select 1 from public.marketplace_chat_participants as blocked
            where blocked.thread_id = p_thread_id
              and blocked.user_id = block.blocked_user_id
              and blocked.removed_at is null
          )
        )
        or (
          block.blocked_user_id = v_actor_id
          and exists (
            select 1 from public.marketplace_chat_participants as blocker
            where blocker.thread_id = p_thread_id
              and blocker.user_id = block.blocker_user_id
              and blocker.removed_at is null
          )
        )
      )
  ) then
    raise exception 'closed' using errcode = '55000';
  end if;
  if v_thread.status = 'closed' or v_thread.paused_at is not null then
    raise exception 'closed' using errcode = '55000';
  end if;
  if p_client_message_id is null
     or p_kind is null
     or p_kind not in ('text', 'image', 'product', 'store', 'order', 'location') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'text' and (
    char_length(trim(coalesce(p_body, ''))) not between 1 and 5000
    or p_card_data is not null
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind = 'image' and (p_body is not null or p_card_data is not null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_kind in ('product', 'store', 'order', 'location') and (
    p_body is not null or jsonb_typeof(p_card_data) <> 'object'
    or p_card_data ->> 'type' is distinct from p_kind
    or octet_length(p_card_data::text) > 512
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_kind in ('product', 'store', 'order') then
    if p_card_data - 'type' - 'id' <> '{}'::jsonb
       or coalesce(p_card_data ->> 'id', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_card_id := (p_card_data ->> 'id')::uuid;
    if (p_kind = 'product' and not exists (
          select 1 from public.products as product
          where product.id = v_card_id and product.store_id = v_thread.store_id
            and product.status = 'active'
        ))
       or (p_kind = 'store' and v_card_id is distinct from v_thread.store_id)
       or (p_kind = 'order' and v_card_id is distinct from v_thread.order_id) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  elsif p_kind = 'location' then
    if p_card_data - 'type' - 'latitude' - 'longitude' <> '{}'::jsonb
       or jsonb_typeof(p_card_data -> 'latitude') is distinct from 'number'
       or jsonb_typeof(p_card_data -> 'longitude') is distinct from 'number'
       or (p_card_data ->> 'latitude')::numeric not between -90 and 90
       or (p_card_data ->> 'longitude')::numeric not between -180 and 180
       or not exists (
         select 1 from public.marketplace_delivery_assignments as assignment
         where assignment.order_id = v_thread.order_id
           and assignment.status in ('assigned', 'picked_up', 'issue')
       ) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.support_messages as reply
    where reply.id = p_reply_to_id and reply.thread_id = p_thread_id
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (
    select count(*) from public.support_messages as recent
    where recent.thread_id = p_thread_id and recent.sender_user_id = v_actor_id
      and recent.created_at >= now() - interval '1 minute'
  ) >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.support_messages as conversation_message
    where conversation_message.thread_id = p_thread_id
  ) >= 100000 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.support_messages (
    thread_id, sender_user_id, sender_kind, body, client_message_id,
    message_kind, reply_to_id, card_data
  ) values (
    p_thread_id, v_actor_id, v_sender_kind,
    case when p_kind = 'text' then trim(p_body) else null end,
    p_client_message_id, p_kind, p_reply_to_id, p_card_data
  ) returning * into v_message;

  update public.support_threads
  set last_message_at = v_message.created_at,
      status = case when v_sender_kind = 'customer' then 'waiting_support'::public.marketplace_support_status
                    else 'waiting_customer'::public.marketplace_support_status end,
      resolved_at = null, updated_at = now()
  where id = p_thread_id;
  return public.marketplace_chat_message_json(v_message.id, v_actor_id);
end;
$$;

create or replace function public.set_my_marketplace_chat_read_cursor(
  p_thread_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.can_access_marketplace_chat_thread(p_thread_id)
     or not exists (
       select 1 from public.support_messages as message
       where message.id = p_message_id and message.thread_id = p_thread_id
     ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.marketplace_chat_participants as participant
  set last_read_message_id = p_message_id
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
    and (
      participant.last_read_message_id is null
      or exists (
        select 1
        from public.support_messages as next_message
        join public.support_messages as current_message
          on current_message.id = participant.last_read_message_id
        where next_message.id = p_message_id
          and (next_message.created_at, next_message.id) >=
              (current_message.created_at, current_message.id)
      )
    );
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('conversationId', p_thread_id, 'lastReadMessageId', p_message_id);
end;
$$;

create or replace function public.react_to_my_marketplace_chat_message(
  p_message_id uuid,
  p_emoji text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select message.thread_id into v_thread_id
  from public.support_messages as message where message.id = p_message_id;
  if v_thread_id is null or not public.can_send_marketplace_chat_thread(v_thread_id)
     or not exists (
       select 1 from public.marketplace_chat_participants as participant
       where participant.thread_id = v_thread_id and participant.user_id = v_actor_id
         and participant.removed_at is null and participant.participant_role <> 'admin'
     ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '✅', '🙏', '😄') or p_active is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_active then
    insert into public.marketplace_chat_reactions (message_id, user_id, emoji)
    values (p_message_id, v_actor_id, p_emoji)
    on conflict (message_id, user_id, emoji) do nothing;
  else
    delete from public.marketplace_chat_reactions
    where message_id = p_message_id and user_id = v_actor_id and emoji = p_emoji;
  end if;
  return public.marketplace_chat_message_json(p_message_id, v_actor_id);
end;
$$;

create or replace function public.delete_my_marketplace_chat_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_message public.support_messages;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_message from public.support_messages where id = p_message_id for update;
  if v_message is null or v_message.sender_user_id is distinct from v_actor_id
     or v_message.sender_kind = 'system'
     or not public.can_send_marketplace_chat_thread(v_message.thread_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_message.deleted_at is null then
    update public.support_messages
    set deleted_body = body, body = null, deleted_at = now(), revision = revision + 1
    where id = p_message_id;
  end if;
  return public.marketplace_chat_message_json(p_message_id, v_actor_id);
end;
$$;

create or replace function public.set_my_marketplace_chat_preferences(
  p_thread_id uuid,
  p_muted_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.can_access_marketplace_chat_thread(p_thread_id)
     or (p_muted_until is not null and (
       p_muted_until <= now() or p_muted_until > now() + interval '1 year'
     )) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.marketplace_chat_participants
  set muted_until = p_muted_until
  where thread_id = p_thread_id and user_id = v_actor_id and removed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('conversationId', p_thread_id, 'mutedUntil', p_muted_until);
end;
$$;

create or replace function public.block_my_marketplace_chat_counterparty(
  p_thread_id uuid,
  p_counterparty_id uuid,
  p_blocked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_updated integer;
  v_active_delivery boolean;
  v_actor_role text;
  v_counterparty_role text;
  v_assigned_driver_id uuid;
  v_source_thread public.support_threads;
  v_escalation_thread_id uuid;
  v_assigned_admin_id uuid;
  v_previous_admin_id uuid;
  v_admin_eligible boolean := false;
  v_administration_assigned boolean := false;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_blocked is null or p_counterparty_id is null or p_counterparty_id = v_actor_id
     or not public.can_send_marketplace_chat_thread(p_thread_id)
     or not exists (
       select 1 from public.marketplace_chat_participants as counterparty
       where counterparty.thread_id = p_thread_id
         and counterparty.user_id = p_counterparty_id and counterparty.removed_at is null
     ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_source_thread
  from public.support_threads as thread
  where thread.id = p_thread_id
  for update;

  select participant.participant_role into v_actor_role
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = v_actor_id
    and participant.removed_at is null
  order by case participant.participant_role
    when 'customer' then 0 when 'driver' then 1 when 'merchant' then 2 else 3 end
  limit 1;

  select participant.participant_role into v_counterparty_role
  from public.marketplace_chat_participants as participant
  where participant.thread_id = p_thread_id and participant.user_id = p_counterparty_id
    and participant.removed_at is null
  order by case participant.participant_role
    when 'customer' then 0 when 'driver' then 1 when 'merchant' then 2 else 3 end
  limit 1;

  select assignment.driver_id into v_assigned_driver_id
  from public.marketplace_delivery_assignments as assignment
  join public.profiles as profile on profile.id = assignment.driver_id
  where assignment.order_id = v_source_thread.order_id
    and assignment.status in ('assigned', 'picked_up', 'issue')
    and profile.role = 'driver' and profile.is_active
  order by assignment.assigned_at desc, assignment.id desc
  limit 1;

  v_active_delivery := v_assigned_driver_id is not null;
  if p_blocked then
    insert into public.marketplace_chat_blocks (
      thread_id, blocker_user_id, blocked_user_id
    ) values (
      p_thread_id, v_actor_id, p_counterparty_id
    )
    on conflict (thread_id, blocker_user_id, blocked_user_id)
    do update set blocked_at = excluded.blocked_at;
  else
    delete from public.marketplace_chat_blocks
    where thread_id = p_thread_id
      and blocker_user_id = v_actor_id
      and blocked_user_id = p_counterparty_id;
  end if;

  if p_blocked and v_active_delivery and (
    (v_actor_role = 'customer' and v_counterparty_role = 'driver'
      and p_counterparty_id = v_assigned_driver_id)
    or
    (v_actor_role = 'driver' and v_actor_id = v_assigned_driver_id
      and v_counterparty_role = 'customer')
  ) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'marketplace-chat:block-escalation:' || p_thread_id::text || ':' ||
      v_actor_id::text || ':' || p_counterparty_id::text,
      0
    ));

    select escalation.escalation_thread_id into v_escalation_thread_id
    from public.marketplace_chat_block_escalations as escalation
    where escalation.source_thread_id = p_thread_id
      and escalation.blocker_user_id = v_actor_id
      and escalation.blocked_user_id = p_counterparty_id;

    if v_escalation_thread_id is null then
      insert into public.support_threads (
        customer_id, store_id, order_id, subject, status,
        assigned_admin_id, conversation_kind
      ) values (
        v_source_thread.customer_id,
        v_source_thread.store_id,
        v_source_thread.order_id,
        'Constrained order support after participant block',
        'open',
        null,
        'support'
      ) returning id into v_escalation_thread_id;

      insert into public.marketplace_chat_block_escalations (
        source_thread_id, blocker_user_id, blocked_user_id, escalation_thread_id
      ) values (
        p_thread_id, v_actor_id, p_counterparty_id, v_escalation_thread_id
      );

      insert into public.marketplace_chat_participants (
        thread_id, user_id, participant_role
      ) values (
        v_escalation_thread_id, v_actor_id, v_actor_role
      );

      insert into public.marketplace_chat_participants (
        thread_id, user_id, participant_role
      )
      select v_escalation_thread_id, participant.user_id, 'merchant'
      from public.marketplace_chat_participants as participant
      where participant.thread_id = p_thread_id
        and participant.participant_role = 'merchant'
        and participant.removed_at is null
        and participant.user_id is distinct from p_counterparty_id
        and exists (
          select 1 from public.store_memberships as membership
          where membership.store_id = v_source_thread.store_id
            and membership.user_id = participant.user_id and membership.is_active
            and membership.role in ('owner', 'manager', 'fulfillment')
        )
      on conflict (thread_id, user_id, participant_role) do nothing;

      insert into public.support_messages (
        thread_id, sender_user_id, sender_kind, body, message_kind
      ) values (
        v_escalation_thread_id,
        null,
        'system',
        'Direct participant messaging is blocked. Order-support messages remain available here.',
        'system'
      );
    else
      update public.support_threads
      set status = 'open', resolved_at = null, paused_at = null,
          paused_by = null, updated_at = now()
      where id = v_escalation_thread_id;
    end if;

    select thread.assigned_admin_id into v_previous_admin_id
    from public.support_threads as thread
    where thread.id = v_escalation_thread_id
    for update;

    select exists (
      select 1
      from public.profiles as profile
      join public.admin_memberships as membership on membership.user_id = profile.id
      where profile.id = v_previous_admin_id
        and profile.id is distinct from p_counterparty_id
        and profile.role = 'admin' and profile.is_active
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
    ) into v_admin_eligible;

    if v_admin_eligible then
      v_assigned_admin_id := v_previous_admin_id;
    else
      select profile.id into v_assigned_admin_id
      from public.profiles as profile
      join public.admin_memberships as membership on membership.user_id = profile.id
      where profile.role = 'admin' and profile.is_active
        and profile.id is distinct from p_counterparty_id
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
      order by case membership.role::text when 'support' then 0 else 1 end,
        profile.id
      limit 1;
    end if;

    update public.support_threads
    set assigned_admin_id = v_assigned_admin_id, updated_at = now()
    where id = v_escalation_thread_id;

    update public.marketplace_chat_participants as participant
    set removed_at = coalesce(participant.removed_at, now())
    where participant.thread_id = v_escalation_thread_id
      and participant.participant_role = 'admin'
      and participant.user_id is distinct from v_assigned_admin_id
      and participant.removed_at is null;

    insert into public.marketplace_chat_participants (
      thread_id, user_id, participant_role
    )
    select v_escalation_thread_id, v_assigned_admin_id, 'admin'
    where v_assigned_admin_id is not null
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;

    -- Defend against prior drift and concurrent store-membership updates. The
    -- named blocked counterparty never becomes active in this mapped thread.
    update public.marketplace_chat_participants as participant
    set removed_at = coalesce(participant.removed_at, now())
    where participant.thread_id = v_escalation_thread_id
      and participant.user_id = p_counterparty_id
      and participant.removed_at is null;
  else
    select escalation.escalation_thread_id into v_escalation_thread_id
    from public.marketplace_chat_block_escalations as escalation
    where escalation.source_thread_id = p_thread_id
      and escalation.blocker_user_id = v_actor_id
      and escalation.blocked_user_id = p_counterparty_id;
  end if;

  if v_escalation_thread_id is not null then
    select thread.assigned_admin_id into v_assigned_admin_id
    from public.support_threads as thread
    where thread.id = v_escalation_thread_id;

    select exists (
      select 1
      from public.support_threads as thread
      join public.marketplace_chat_participants as participant
        on participant.thread_id = thread.id
       and participant.user_id = thread.assigned_admin_id
       and participant.participant_role = 'admin'
       and participant.removed_at is null
      join public.profiles as profile on profile.id = thread.assigned_admin_id
      join public.admin_memberships as membership on membership.user_id = profile.id
      where thread.id = v_escalation_thread_id
        and profile.id is distinct from p_counterparty_id
        and profile.role = 'admin' and profile.is_active
        and not profile.must_change_password and membership.is_active
        and membership.role::text in ('support', 'super_admin')
    ) into v_administration_assigned;
  end if;

  -- Retain the legacy timestamp as a derived compatibility signal. Pairwise
  -- authorization uses marketplace_chat_blocks exclusively.
  update public.marketplace_chat_participants
  set counterparty_blocked_at = (
    select max(block.blocked_at)
    from public.marketplace_chat_blocks as block
    where block.thread_id = p_thread_id and block.blocker_user_id = v_actor_id
  )
  where thread_id = p_thread_id and user_id = v_actor_id and removed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'conversationId', p_thread_id,
    'counterpartyId', p_counterparty_id,
    'blocked', p_blocked,
    'deliveryContinuityRequired', v_active_delivery,
    'supportEscalationConversationId', v_escalation_thread_id,
    'orderSupportAvailable', v_escalation_thread_id is not null,
    'administrationAssigned', v_administration_assigned,
    'safeCopy', case when v_escalation_thread_id is not null then
      'Direct messages are blocked. Order-support messages remain available.'
      else 'The participant block was updated.' end
  );
end;
$$;

create or replace function public.sync_marketplace_chat_driver_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_driver_id uuid := case when tg_op = 'DELETE' then null else new.driver_id end;
  v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  v_active boolean := false;
begin
  -- Authorization belongs to the assignment mutation that fired this trigger.
  -- Reading auth.uid() preserves its caller context for audit/debugging while
  -- direct EXECUTE is revoked below.
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := new.driver_id is not null
      and new.status in ('assigned', 'picked_up', 'issue')
      and exists (
        select 1 from public.profiles as profile
        where profile.id = new.driver_id
          and profile.role = 'driver' and profile.is_active
      );
  end if;
  update public.marketplace_chat_participants
  set removed_at = coalesce(removed_at, now())
  where thread_id in (
      select id from public.support_threads where order_id = v_order_id
    )
    and participant_role = 'driver'
    and (not v_active or user_id is distinct from v_driver_id)
    and removed_at is null;
  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_driver_id, 'driver'
    from public.support_threads as thread
    where thread.order_id = v_order_id
      and (
        thread.conversation_kind = 'order'
        or exists (
          select 1 from public.marketplace_chat_block_escalations as escalation
          where escalation.escalation_thread_id = thread.id
            and escalation.blocker_user_id = v_driver_id
        )
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_chat_sync_driver on public.marketplace_delivery_assignments;
create trigger marketplace_chat_sync_driver
after insert or update or delete
on public.marketplace_delivery_assignments
for each row execute function public.sync_marketplace_chat_driver_participant();

create or replace function public.sync_marketplace_chat_driver_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_user_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_active boolean := false;
begin
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := new.role = 'driver' and new.is_active;
  end if;

  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_user_id, 'driver'
    from public.support_threads as thread
    join public.marketplace_delivery_assignments as assignment
      on assignment.order_id = thread.order_id
    where assignment.driver_id = v_user_id
      and assignment.status in ('assigned', 'picked_up', 'issue')
      and (
        thread.conversation_kind = 'order'
        or exists (
          select 1 from public.marketplace_chat_block_escalations as escalation
          where escalation.escalation_thread_id = thread.id
            and escalation.blocker_user_id = v_user_id
        )
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  else
    update public.marketplace_chat_participants
    set removed_at = coalesce(removed_at, now())
    where user_id = v_user_id and participant_role = 'driver' and removed_at is null;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_chat_sync_driver_profile on public.profiles;
create trigger marketplace_chat_sync_driver_profile
after update of role, is_active or delete
on public.profiles
for each row execute function public.sync_marketplace_chat_driver_profile();

create or replace function public.sync_marketplace_chat_store_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_store_id uuid := case when tg_op = 'DELETE' then old.store_id else new.store_id end;
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_active boolean := false;
begin
  perform v_actor_id;
  if tg_op <> 'DELETE' then
    v_active := new.is_active
      and new.role in ('owner', 'manager', 'fulfillment');
  end if;
  if v_active then
    insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
    select thread.id, v_user_id, 'merchant'
    from public.support_threads as thread
    where thread.store_id = v_store_id
      and not exists (
        select 1
        from public.marketplace_chat_block_escalations as escalation
        where escalation.escalation_thread_id = thread.id
          and escalation.blocked_user_id = v_user_id
      )
    on conflict (thread_id, user_id, participant_role)
    do update set removed_at = null,
      joined_at = case
        when public.marketplace_chat_participants.removed_at is not null then now()
        else public.marketplace_chat_participants.joined_at
      end;
  else
    update public.marketplace_chat_participants
    set removed_at = coalesce(removed_at, now())
    where thread_id in (
        select id from public.support_threads where store_id = v_store_id
      )
      and user_id = v_user_id and participant_role = 'merchant' and removed_at is null;
  end if;

  -- A mapped blocked counterparty never regains the substitute channel through
  -- a later store-role insert, update, or reactivation.
  update public.marketplace_chat_participants as participant
  set removed_at = coalesce(participant.removed_at, now())
  where participant.user_id = v_user_id
    and participant.participant_role = 'merchant'
    and participant.removed_at is null
    and exists (
      select 1
      from public.marketplace_chat_block_escalations as escalation
      where escalation.escalation_thread_id = participant.thread_id
        and escalation.blocked_user_id = v_user_id
    );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_chat_sync_store_member on public.store_memberships;
create trigger marketplace_chat_sync_store_member
after insert or update or delete
on public.store_memberships
for each row execute function public.sync_marketplace_chat_store_participant();

create or replace function public.broadcast_marketplace_chat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread_id uuid := coalesce(new.thread_id, old.thread_id);
begin
  perform v_actor_id;
  -- Send a reconciliation hint only. Clients refetch the participant-scoped
  -- DTO, so soft-delete audit content and the pre-update row never enter a
  -- participant channel payload.
  perform realtime.send(
    jsonb_build_object(
      'conversationId', v_thread_id,
      'messageId', coalesce(new.id, old.id),
      'operation', tg_op,
      'deleted', case
        when tg_op = 'DELETE' then true
        else new.deleted_at is not null
      end
    ),
    'message_changed',
    'marketplace-chat:' || v_thread_id::text,
    true
  );
  return null;
end;
$$;

drop trigger if exists marketplace_chat_broadcast_message_change on public.support_messages;
create trigger marketplace_chat_broadcast_message_change
after insert or update or delete on public.support_messages
for each row execute function public.broadcast_marketplace_chat_change();

-- Current Realtime Authorization requires SELECT for receiving Broadcast or
-- Presence and INSERT for sending/tracking. Clients must join the exact topic
-- marketplace-chat:<thread_uuid> with config.private = true.
drop policy if exists marketplace_chat_receive_private on realtime.messages;
create policy marketplace_chat_receive_private
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.can_access_marketplace_chat_thread(
    public.marketplace_chat_thread_id_from_topic((select realtime.topic()))
  )
);

drop policy if exists marketplace_chat_send_private on realtime.messages;
create policy marketplace_chat_send_private
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and public.can_send_marketplace_chat_thread(
    public.marketplace_chat_thread_id_from_topic((select realtime.topic()))
  )
);

alter table public.marketplace_chat_participants enable row level security;
alter table public.marketplace_chat_reactions enable row level security;
alter table public.marketplace_chat_blocks enable row level security;
alter table public.marketplace_chat_block_escalations enable row level security;

drop policy if exists support_threads_read_participant on public.support_threads;
create policy support_threads_read_participant
on public.support_threads for select to authenticated
using (public.can_access_marketplace_chat_thread(id));

drop policy if exists support_messages_read_participant on public.support_messages;
create policy support_messages_read_participant
on public.support_messages for select to authenticated
using (public.can_access_marketplace_chat_thread(thread_id));

create policy marketplace_chat_participants_read_thread
on public.marketplace_chat_participants for select to authenticated
using (public.can_access_marketplace_chat_thread(thread_id));

create policy marketplace_chat_reactions_read_thread
on public.marketplace_chat_reactions for select to authenticated
using (exists (
  select 1 from public.support_messages as message
  where message.id = marketplace_chat_reactions.message_id
    and public.can_access_marketplace_chat_thread(message.thread_id)
));

-- Keep the legacy ticket workflow until its routes move in Task 8, but make
-- every old entry point support-only at the database boundary. Unified order,
-- presale, and dispute conversations are reachable only through the new
-- participant-scoped RPCs above.
create or replace function public.create_my_marketplace_support_thread(
  p_order_id uuid,
  p_store_id uuid,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  v_result := public.create_my_marketplace_support_thread_base_180000(
    p_order_id, p_store_id, p_subject, p_message);
  if not exists (
    select 1 from public.support_threads as thread
    where thread.id = (v_result ->> 'id')::uuid
      and thread.conversation_kind = 'support'
  ) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.list_my_marketplace_support_threads(
  p_status text default null,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null or p_limit is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('open','waiting_customer','waiting_support','resolved','closed')) then
    raise exception 'invalid_support_page' using errcode = '22023';
  end if;
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  with page as materialized (
    select thread.*,
      (
        select count(*)::integer
        from public.support_messages as message
        where message.thread_id = thread.id
          and message.sender_user_id is distinct from v_actor_id
          and message.created_at > coalesce((
            select reads.last_read_at
            from public.support_thread_reads as reads
            where reads.thread_id = thread.id and reads.user_id = v_actor_id
          ), '-infinity'::timestamptz)
      ) as unread_count
    from public.support_threads as thread
    where thread.conversation_kind = 'support'
      and public.can_access_marketplace_support_thread(thread.id)
      and (p_status is null or thread.status::text = p_status)
      and (p_before is null or thread.last_message_at < p_before)
    order by thread.last_message_at desc, thread.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'public_code', page.public_code, 'subject', page.subject,
      'status', page.status, 'order_id', page.order_id,
      'last_message_at', page.last_message_at, 'unread_count', page.unread_count
    ) order by page.last_message_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.last_message_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

alter function public.get_my_marketplace_support_thread_page(uuid, integer, timestamptz, uuid)
  rename to get_my_marketplace_support_thread_page_base_chat_core;
create or replace function public.get_my_marketplace_support_thread_page(
  p_thread_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.support_threads as thread
    where thread.id = p_thread_id and thread.conversation_kind = 'support'
  ) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_marketplace_support_thread_page_base_chat_core(
    p_thread_id, p_limit, p_before_created_at, p_before_id);
end;
$$;

create or replace function public.get_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.support_threads as thread
    where thread.id = p_thread_id and thread.conversation_kind = 'support'
  ) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.get_my_marketplace_support_thread_base_180000(p_thread_id);
end;
$$;

create or replace function public.reply_my_marketplace_support_thread(
  p_thread_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.support_threads as thread
    where thread.id = p_thread_id and thread.conversation_kind = 'support'
  ) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.reply_my_marketplace_support_thread_base_180000(p_thread_id, p_body);
end;
$$;

create or replace function public.close_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.support_threads as thread
    where thread.id = p_thread_id and thread.conversation_kind = 'support'
  ) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  if public.current_profile_is_marketplace_admin() then
    perform public.activate_marketplace_admin_capability(
      array['super_admin','support']::public.marketplace_admin_role[]);
  end if;
  return public.close_my_marketplace_support_thread_base_180000(p_thread_id);
end;
$$;

revoke all on function public.get_my_marketplace_support_thread_page_base_chat_core(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_my_marketplace_support_thread_page_base_chat_core(
  uuid, integer, timestamptz, uuid
) to service_role;

revoke all on function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_marketplace_support_threads(text, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_marketplace_support_thread_page(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_marketplace_support_thread(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reply_my_marketplace_support_thread(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.close_my_marketplace_support_thread(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_my_marketplace_support_thread(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_my_marketplace_support_threads(text, integer, timestamptz) to authenticated;
grant execute on function public.get_my_marketplace_support_thread_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_my_marketplace_support_thread(uuid) to authenticated;
grant execute on function public.reply_my_marketplace_support_thread(uuid, text) to authenticated;
grant execute on function public.close_my_marketplace_support_thread(uuid) to authenticated;

-- Conversation tables are RPC-only. Revoking the historical SELECT grant on
-- support tables preserves the legacy SECURITY DEFINER RPCs without exposing
-- raw rows through PostgREST.
revoke all on table public.support_threads from public, anon, authenticated;
revoke all on table public.support_messages from public, anon, authenticated;
revoke all on table public.marketplace_chat_participants from public, anon, authenticated;
revoke all on table public.marketplace_chat_reactions from public, anon, authenticated;
revoke all on table public.marketplace_chat_blocks from public, anon, authenticated;
revoke all on table public.marketplace_chat_block_escalations from public, anon, authenticated;

revoke all on function public.can_access_marketplace_chat_thread(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_send_marketplace_chat_thread(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.marketplace_chat_thread_id_from_topic(text)
  from public, anon, authenticated, service_role;
revoke all on function public.marketplace_chat_message_json(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.marketplace_chat_conversation_summary(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.sync_marketplace_chat_driver_participant()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_marketplace_chat_driver_profile()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_marketplace_chat_store_participant()
  from public, anon, authenticated, service_role;
revoke all on function public.broadcast_marketplace_chat_change()
  from public, anon, authenticated, service_role;

revoke all on function public.open_my_marketplace_conversation(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_marketplace_conversations(text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_marketplace_conversation_page(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.search_my_marketplace_chat_messages(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.send_my_marketplace_chat_message(uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.set_my_marketplace_chat_read_cursor(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.react_to_my_marketplace_chat_message(uuid, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_my_marketplace_chat_message(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_my_marketplace_chat_preferences(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.block_my_marketplace_chat_counterparty(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- These helpers are needed by realtime.messages policy evaluation. They
-- reveal only the same boolean channel-join decision the policy itself makes.
grant execute on function public.can_access_marketplace_chat_thread(uuid) to authenticated;
grant execute on function public.can_send_marketplace_chat_thread(uuid) to authenticated;
grant execute on function public.marketplace_chat_thread_id_from_topic(text) to authenticated;

grant execute on function public.open_my_marketplace_conversation(uuid, uuid, text) to authenticated;
grant execute on function public.list_my_marketplace_conversations(text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_my_marketplace_conversation_page(uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.search_my_marketplace_chat_messages(uuid, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.send_my_marketplace_chat_message(uuid, uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.set_my_marketplace_chat_read_cursor(uuid, uuid) to authenticated;
grant execute on function public.react_to_my_marketplace_chat_message(uuid, text, boolean) to authenticated;
grant execute on function public.delete_my_marketplace_chat_message(uuid) to authenticated;
grant execute on function public.set_my_marketplace_chat_preferences(uuid, timestamptz) to authenticated;
grant execute on function public.block_my_marketplace_chat_counterparty(uuid, uuid, boolean) to authenticated;

commit;
