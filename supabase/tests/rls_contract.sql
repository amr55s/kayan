begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(15);

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
  ('10000000-0000-0000-0000-000000000007'::uuid, 'chat-admin-monitor@example.test')
) as fixture(id, email)
on conflict (id) do nothing;

insert into public.profiles (
  id, role, phone, display_name, is_active, must_change_password
) values
  ('10000000-0000-0000-0000-000000000004', 'driver', '01010000004', 'Current driver', true, false),
  ('10000000-0000-0000-0000-000000000005', 'driver', '01010000005', 'Former driver', true, false),
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
values ('30000000-0000-0000-0000-000000000001', 'Chat merchant')
on conflict (id) do nothing;

insert into public.stores (
  id, merchant_id, slug, name, status, first_published_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'chat-contract-store', 'Chat contract store', 'published', now()
)
on conflict (id) do nothing;

insert into public.store_memberships (store_id, user_id, role, is_active)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003', 'owner', true
)
on conflict (store_id, user_id) do update set is_active = true;

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

select * from extensions.finish();
rollback;
