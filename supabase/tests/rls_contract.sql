begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(50);

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind in ('r','p')
      and not relation.relrowsecurity),
  0,
  'every public application table has RLS enabled'
);

select extensions.is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')),
  0,
  'anon has no direct mutation privileges on public tables'
);

select extensions.is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('marketplace_return_requests','marketplace_return_request_items')
      and privilege_type = 'SELECT'),
  0,
  'return internals are available only through participant-scoped RPC DTOs'
);

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.prosecdef
      and not exists (
        select 1 from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting
        where setting in (
          'search_path=', 'search_path=""',
          'search_path=pg_catalog, public', 'search_path=pg_catalog,public'
        )
      )),
  0,
  'all public SECURITY DEFINER routines pin a trusted search_path'
);

-- Marketplace chat authorization fixtures. These UUIDs are deliberately
-- isolated from application seed data and the enclosing transaction rolls
-- them back after exercising the real SECURITY DEFINER RPC boundary.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', fixture.id, 'authenticated',
  'authenticated', fixture.email, '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'chat-customer@example.test'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'chat-unrelated@example.test'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'chat-merchant@example.test'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'chat-driver-current@example.test'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'chat-driver-former@example.test'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'chat-admin-generic@example.test'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'chat-admin-monitor@example.test'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'chat-unrelated-merchant@example.test'),
  ('10000000-0000-0000-0000-000000000009'::uuid, 'chat-catalog-member@example.test'),
  ('10000000-0000-0000-0000-000000000010'::uuid, 'chat-driver-inactive@example.test')
) as fixture(id, email)
on conflict (id) do nothing;

insert into public.profiles (
  id, role, phone, display_name, is_active, must_change_password
) values
  ('10000000-0000-0000-0000-000000000004', 'driver', '01010000004', 'Current driver', true, false),
  ('10000000-0000-0000-0000-000000000005', 'driver', '01010000005', 'Former driver', true, false),
  ('10000000-0000-0000-0000-000000000010', 'driver', '01010000010', 'Inactive driver', false, false),
  ('10000000-0000-0000-0000-000000000006', 'admin', '01010000006', 'Generic admin', true, false),
  ('10000000-0000-0000-0000-000000000007', 'admin', '01010000007', 'Chat monitor', true, false)
on conflict (id) do nothing;

insert into public.admin_memberships (user_id, role, is_active)
values
  ('10000000-0000-0000-0000-000000000006', 'support', true),
  ('10000000-0000-0000-0000-000000000007', 'chat_monitor', true)
on conflict (user_id, role) do update set is_active = true;

insert into public.marketplace_customers (id, auth_user_id, display_name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chat customer'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Unrelated customer')
on conflict (id) do nothing;

insert into public.merchants (id, display_name)
values
  ('30000000-0000-0000-0000-000000000001', 'Chat merchant'),
  ('30000000-0000-0000-0000-000000000002', 'Unrelated merchant')
on conflict (id) do nothing;

insert into public.stores (
  id, merchant_id, slug, name, status, first_published_at
) values
(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'chat-contract-store', 'Chat contract store', 'published', now()
),
(
  '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'chat-unrelated-store', 'Unrelated store', 'published', now()
)
on conflict (id) do nothing;

insert into public.store_memberships (store_id, user_id, role, is_active)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner', true),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 'catalog', true),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000008', 'owner', true)
on conflict (store_id, user_id) do update
set role = excluded.role, is_active = true;

insert into public.carts (id, customer_id)
values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.delivery_zones (id, code, name_ar, city)
values (
  '60000000-0000-0000-0000-000000000001',
  'chat_contract_zone', 'منطقة الاختبار', 'Cairo'
)
on conflict (id) do nothing;

insert into public.order_groups (
  id, customer_id, cart_id, address_snapshot, subtotal,
  delivery_total, grand_total, child_order_count
) values (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', '{}'::jsonb,
  1000, 100, 1100, 1
)
on conflict (id) do nothing;

insert into public.marketplace_orders (
  id, order_group_id, store_id, customer_id, delivery_mode, delivery_zone_id,
  address_snapshot, store_name_snapshot, subtotal, delivery_fee, grand_total
) values (
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 'platform',
  '60000000-0000-0000-0000-000000000001', '{}'::jsonb,
  'Chat contract store', 1000, 100, 1100
)
on conflict (id) do nothing;

insert into public.support_threads (
  id, customer_id, store_id, order_id, subject, conversation_kind
) values (
  '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'Chat contract thread', 'order'
)
on conflict (id) do nothing;

insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'customer'),
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'merchant')
on conflict (thread_id, user_id, participant_role) do update set removed_at = null;

insert into public.marketplace_delivery_assignments (
  id, order_id, driver_id, driver_name_snapshot, status, assigned_at
) values (
  'a0000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000005', 'Former driver', 'assigned', now()
)
on conflict (id) do nothing;

update public.marketplace_delivery_assignments
set driver_id = '10000000-0000-0000-0000-000000000004',
    driver_name_snapshot = 'Current driver', assigned_at = now()
where id = 'a0000000-0000-0000-0000-000000000001';

insert into public.support_messages (
  id, thread_id, sender_user_id, sender_kind, body, client_message_id
) values (
  'b0000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'customer', 'Fixture message',
  'c0000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)
    #>> '{conversation,id}',
  '90000000-0000-0000-0000-000000000001',
  'the customer receives the linked conversation'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)
    #>> '{conversation,id}',
  '90000000-0000-0000-0000-000000000001',
  'an active store member receives the linked conversation'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)
    #>> '{conversation,id}',
  '90000000-0000-0000-0000-000000000001',
  'the currently assigned driver receives the linked conversation'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated","aal":"aal2"}', true);
select extensions.is(
  public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)
    #>> '{conversation,id}',
  '90000000-0000-0000-0000-000000000001',
  'an AAL2 chat monitor receives the conversation'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'an unrelated customer receives a stable not_found error'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'the replaced driver receives a stable not_found error'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'an AAL2 generic admin without chat_monitor receives not_found'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  public.can_access_marketplace_chat_thread('90000000-0000-0000-0000-000000000001'),
  'the private Realtime predicate accepts an active participant'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  not public.can_access_marketplace_chat_thread('90000000-0000-0000-0000-000000000001'),
  'the private Realtime predicate rejects a former driver'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  (public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'text', 'Customer reply', null, null
  ) ->> 'id') is not null,
  'an active participant can send a message'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000003',
    'text', 'Denied reply', null, null
  )$$,
  'P0002', 'not_found', 'an unrelated caller cannot send a message'
);

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  '42501', 'permission denied for function get_my_marketplace_conversation_page',
  'anon cannot execute the authenticated conversation RPC'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'an owner of an unrelated store cannot read the thread'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'a catalog-only store member cannot read the thread'
);
select extensions.ok(
  not public.can_access_marketplace_chat_thread('90000000-0000-0000-0000-000000000001'),
  'a catalog-only member cannot join the private Realtime topic'
);

reset role;
select extensions.is(
  (select count(*)::integer
   from pg_catalog.pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and policyname in ('marketplace_chat_receive_private', 'marketplace_chat_send_private')
     and 'authenticated' = any(roles)),
  2,
  'Realtime messages has authenticated receive and send policies'
);

update public.marketplace_delivery_assignments
set driver_id = '10000000-0000-0000-0000-000000000010',
    driver_name_snapshot = 'Inactive driver'
where id = 'a0000000-0000-0000-0000-000000000001';
insert into public.marketplace_chat_participants (thread_id, user_id, participant_role)
values ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000010', 'driver')
on conflict (thread_id, user_id, participant_role) do update set removed_at = null;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.get_my_marketplace_conversation_page('90000000-0000-0000-0000-000000000001', 20, null, null)$$,
  'P0002', 'not_found', 'an assigned but inactive driver cannot read the thread'
);
select extensions.ok(
  not public.can_access_marketplace_chat_thread('90000000-0000-0000-0000-000000000001'),
  'an inactive driver cannot join the private Realtime topic'
);

reset role;
update public.marketplace_delivery_assignments
set driver_id = '10000000-0000-0000-0000-000000000004',
    driver_name_snapshot = 'Current driver'
where id = 'a0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000004',
    'text', 'Idempotent searchable reply', null, null
  ) ->> 'id',
  public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000004',
    'text', 'A duplicate body is ignored', null, null
  ) ->> 'id',
  'the same sender idempotency key returns the original message'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.support_messages
   where thread_id = '90000000-0000-0000-0000-000000000001'
     and sender_user_id = '10000000-0000-0000-0000-000000000001'
     and client_message_id = 'c0000000-0000-0000-0000-000000000004'),
  1,
  'idempotent retries persist one row'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  public.get_my_marketplace_conversation_page(
    '90000000-0000-0000-0000-000000000001', 1, null, null
  ) -> 'nextCursor' is not null,
  'a bounded first message page returns a keyset cursor'
);
select extensions.isnt(
  public.get_my_marketplace_conversation_page(
    '90000000-0000-0000-0000-000000000001', 1,
    (public.get_my_marketplace_conversation_page(
      '90000000-0000-0000-0000-000000000001', 1, null, null
    ) #>> '{nextCursor,createdAt}')::timestamptz,
    (public.get_my_marketplace_conversation_page(
      '90000000-0000-0000-0000-000000000001', 1, null, null
    ) #>> '{nextCursor,id}')::uuid
  ) #>> '{messages,0,id}',
  public.get_my_marketplace_conversation_page(
    '90000000-0000-0000-0000-000000000001', 1, null, null
  ) #>> '{messages,0,id}',
  'the next keyset page does not repeat its boundary message'
);

select extensions.is(
  public.react_to_my_marketplace_chat_message(
    (public.send_my_marketplace_chat_message(
      '90000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004',
      'text', 'ignored', null, null
    ) ->> 'id')::uuid,
    '👍', true
  ) #>> '{reactions,0,count}',
  '1',
  'a participant can add an allowlisted reaction'
);
select extensions.is(
  jsonb_array_length(public.react_to_my_marketplace_chat_message(
    (public.send_my_marketplace_chat_message(
      '90000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004',
      'text', 'ignored', null, null
    ) ->> 'id')::uuid,
    '👍', false
  ) -> 'reactions'),
  0,
  'a participant can remove a reaction idempotently'
);

select extensions.is(
  public.set_my_marketplace_chat_read_cursor(
    '90000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001'
  ) ->> 'lastReadMessageId',
  'b0000000-0000-0000-0000-000000000001',
  'the read cursor accepts the first message'
);
select extensions.is(
  public.set_my_marketplace_chat_read_cursor(
    '90000000-0000-0000-0000-000000000001',
    (public.send_my_marketplace_chat_message(
      '90000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000004',
      'text', 'ignored', null, null
    ) ->> 'id')::uuid
  ) ->> 'conversationId',
  '90000000-0000-0000-0000-000000000001',
  'the read cursor advances monotonically'
);
select extensions.throws_ok(
  $$select public.set_my_marketplace_chat_read_cursor(
    '90000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001'
  )$$,
  'P0002', 'not_found', 'the read cursor cannot move backwards'
);

select extensions.ok(
  (public.delete_my_marketplace_chat_message('b0000000-0000-0000-0000-000000000001') ->> 'deleted')::boolean
    and public.delete_my_marketplace_chat_message('b0000000-0000-0000-0000-000000000001') ->> 'body' is null,
  'soft deletion returns only a tombstoned participant DTO'
);

reset role;
select extensions.is(
  (select deleted_body from public.support_messages where id = 'b0000000-0000-0000-0000-000000000001'),
  'Fixture message',
  'the original deleted body remains in the RPC-inaccessible audit column'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  public.set_my_marketplace_chat_preferences(
    '90000000-0000-0000-0000-000000000001', now() + interval '1 day'
  ) ->> 'mutedUntil' is not null,
  'a participant can set bounded mute preferences'
);
select extensions.ok(
  public.set_my_marketplace_chat_preferences(
    '90000000-0000-0000-0000-000000000001', null
  ) -> 'mutedUntil' = 'null'::jsonb,
  'a participant can clear mute preferences'
);

select extensions.ok(
  (public.block_my_marketplace_chat_counterparty(
    '90000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003', true
  ) ->> 'blocked')::boolean,
  'blocking persists the named counterparty relation'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.marketplace_chat_blocks
   where thread_id = '90000000-0000-0000-0000-000000000001'
     and blocker_user_id = '10000000-0000-0000-0000-000000000001'
     and blocked_user_id = '10000000-0000-0000-0000-000000000003'),
  1,
  'the exact blocked pair is stored once'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000005', 'text', 'blocked customer', null, null
  )$$,
  '55000', 'closed', 'the blocker cannot continue the direct exchange'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000006', 'text', 'blocked merchant', null, null
  )$$,
  '55000', 'closed', 'the named blocked counterparty cannot reply'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  (public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000007', 'text', 'driver continuity', null, null
  ) ->> 'id') is not null,
  'an unblocked third participant can still post delivery updates'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  public.can_access_marketplace_chat_thread('90000000-0000-0000-0000-000000000001')
    and public.get_my_marketplace_conversation_page(
      '90000000-0000-0000-0000-000000000001', 20, null, null
    ) #>> '{conversation,id}' = '90000000-0000-0000-0000-000000000001',
  'blocking preserves read and private-channel access for delivery continuity'
);
select extensions.ok(
  not (public.block_my_marketplace_chat_counterparty(
    '90000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003', false
  ) ->> 'blocked')::boolean,
  'the named pair can be unblocked'
);

reset role;
select extensions.is(
  (select count(*)::integer from public.marketplace_chat_blocks
   where thread_id = '90000000-0000-0000-0000-000000000001'
     and blocker_user_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'unblocking removes the exact relation'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.ok(
  (public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000008', 'text', 'exchange resumed', null, null
  ) ->> 'id') is not null,
  'sending resumes after the exact pair is unblocked'
);

reset role;
create temporary table chat_joined_snapshots (
  participant_role text primary key,
  joined_at timestamptz not null
) on commit drop;
insert into chat_joined_snapshots
select participant_role, joined_at
from public.marketplace_chat_participants
where thread_id = '90000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000003'
  and participant_role = 'merchant';
update public.store_memberships
set updated_at = now()
where store_id = '40000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000003';
select extensions.is(
  (select joined_at from public.marketplace_chat_participants
   where thread_id = '90000000-0000-0000-0000-000000000001'
     and user_id = '10000000-0000-0000-0000-000000000003'
     and participant_role = 'merchant'),
  (select joined_at from chat_joined_snapshots where participant_role = 'merchant'),
  'ordinary active membership updates preserve joined_at'
);

insert into chat_joined_snapshots
select participant_role, joined_at
from public.marketplace_chat_participants
where thread_id = '90000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000004'
  and participant_role = 'driver';
update public.marketplace_delivery_assignments
set driver_name_snapshot = 'Current driver refreshed'
where id = 'a0000000-0000-0000-0000-000000000001';
select extensions.is(
  (select joined_at from public.marketplace_chat_participants
   where thread_id = '90000000-0000-0000-0000-000000000001'
     and user_id = '10000000-0000-0000-0000-000000000004'
     and participant_role = 'driver'),
  (select joined_at from chat_joined_snapshots where participant_role = 'driver'),
  'ordinary active assignment updates preserve joined_at'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select extensions.is(
  public.search_my_marketplace_chat_messages(
    '90000000-0000-0000-0000-000000000001', 'searchable', 10, null, null
  ) #>> '{items,0,body}',
  'Idempotent searchable reply',
  'indexed full-text search returns participant-scoped results'
);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000009', 'product', null, null,
    '{"type":"product","id":"40000000-0000-0000-0000-000000000001","url":"https://evil.example"}'::jsonb
  )$$,
  '22023', 'invalid_input', 'SQL rejects card keys outside the Task 1 shape'
);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000010', 'product', null, null,
    jsonb_build_object(
      'type', 'product', 'id', '40000000-0000-0000-0000-000000000001',
      'padding', repeat('x', 600)
    )
  )$$,
  '22023', 'invalid_input', 'SQL rejects oversized encoded card payloads'
);
select extensions.throws_ok(
  $$select public.send_my_marketplace_chat_message(
    '90000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000011', 'system', 'forged system event', null, null
  )$$,
  '22023', 'invalid_input', 'participants cannot forge system messages'
);

select * from extensions.finish();
rollback;
