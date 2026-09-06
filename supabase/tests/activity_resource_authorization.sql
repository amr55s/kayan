begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(32);

select extensions.ok(not pg_catalog.has_function_privilege('anon','activity_private.driver_is_approved(uuid)','EXECUTE'),'internal target driver helper is not anonymous API');
select extensions.ok(not pg_catalog.has_function_privilege('authenticated','activity_private.merchant_is_approved(uuid,uuid)','EXECUTE'),'callers cannot inspect arbitrary merchant actors');
select extensions.ok(not pg_catalog.has_function_privilege('anon','public.has_my_activity_access(text)','EXECUTE'),'activity access requires authentication');

insert into auth.users(id,email) values
 ('a1111111-1111-4111-8111-111111111111','activity-resource-a@example.invalid'),
 ('a2222222-2222-4222-8222-222222222222','activity-resource-b@example.invalid'),
 ('a3333333-3333-4333-8333-333333333333','activity-invited-staff@example.invalid');
insert into public.merchants(id,display_name) values
 ('b1111111-1111-4111-8111-111111111111','Activity merchant'),
 ('b2222222-2222-4222-8222-222222222222','Independent service'),
 ('b3333333-3333-4333-8333-333333333333','Unrelated merchant'),
 ('b4444444-4444-4444-8444-444444444444','New approved merchant');
insert into public.profiles(id,role,phone,display_name,merchant_id,must_change_password) values
 ('a1111111-1111-4111-8111-111111111111','merchant','01012345671','Multiple activities','b1111111-1111-4111-8111-111111111111',false),
 ('a2222222-2222-4222-8222-222222222222','driver','01012345672','Unapproved driver',null,false);
insert into public.driver_profiles(profile_id,is_available,active_until) values
 ('a1111111-1111-4111-8111-111111111111',true,now()+interval '1 day'),
 ('a2222222-2222-4222-8222-222222222222',true,now()+interval '1 day');
insert into public.stores(id,merchant_id,slug,name) values
 ('c1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','activity-resource-test-store','Activity store'),
 ('c2222222-2222-4222-8222-222222222222','b4444444-4444-4444-8444-444444444444','activity-resource-new-store','New activity store');
insert into public.store_memberships(store_id,user_id,role) values
 ('c1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','owner');
insert into public.merchant_memberships(merchant_id,user_id,role) values
 ('b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','owner'),
 ('b2222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','owner'),
 ('b1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','manager');
insert into public.activity_workspaces(id,activity_kind,name,status,merchant_id,store_id,driver_profile_id) values
 ('d1111111-1111-4111-8111-111111111111','store','Merchant workspace','approved','b1111111-1111-4111-8111-111111111111',null,null),
 ('d2222222-2222-4222-8222-222222222222','service','Service workspace','approved','b2222222-2222-4222-8222-222222222222',null,null),
 ('d3333333-3333-4333-8333-333333333333','driver','Driver workspace','approved',null,null,'a1111111-1111-4111-8111-111111111111'),
 ('d4444444-4444-4444-8444-444444444444','store','Store workspace','approved','b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',null),
 ('d5555555-5555-4555-8555-555555555555','store','New store approval','approved','b4444444-4444-4444-8444-444444444444','c2222222-2222-4222-8222-222222222222',null);
insert into public.activity_memberships(workspace_id,user_id,role)
 select id,'a1111111-1111-4111-8111-111111111111','owner' from public.activity_workspaces
 where id in ('d1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222','d3333333-3333-4333-8333-333333333333','d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555');
insert into public.activity_memberships(workspace_id,user_id,role) values
 ('d1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333','manager'),
 ('d4444444-4444-4444-8444-444444444444','a3333333-3333-4333-8333-333333333333','manager');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}',true);
select extensions.ok(public.can_manage_merchant('b1111111-1111-4111-8111-111111111111'),'invited live merchant member without legacy profile retains access');
select extensions.ok(public.can_catalog_store('c1111111-1111-4111-8111-111111111111'),'invited member without legacy profile retains store access');
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
select extensions.ok(public.has_my_activity_access('driver'),'merchant-profile user can operate independently approved driver activity');
select extensions.ok(public.has_my_activity_access('merchant'),'same identity retains merchant activity');
select extensions.ok(public.can_manage_merchant('b1111111-1111-4111-8111-111111111111'),'approved merchant is authorized');
select extensions.ok(public.can_manage_merchant('b2222222-2222-4222-8222-222222222222'),'second service entity is authorized without profile rewrite');
select extensions.ok(not public.can_manage_merchant('b3333333-3333-4333-8333-333333333333'),'guessed unrelated merchant is denied');
select extensions.ok(public.can_catalog_store('c1111111-1111-4111-8111-111111111111'),'approved catalog available');
select extensions.ok(not public.is_marketplace_admin(),'activities never confer administration');
select extensions.is((select role::text from public.profiles where id='a1111111-1111-4111-8111-111111111111'),'merchant','original legacy profile role unchanged');
select extensions.is((select count(*)::integer from public.list_available_delivery_drivers() where id='a1111111-1111-4111-8111-111111111111'),1,'approved secondary driver is discoverable');
select extensions.ok(not public.can_manage_merchant('b4444444-4444-4444-8444-444444444444'),'store-only owner cannot expand access to whole merchant');
reset role;
insert into public.store_memberships(store_id,user_id,role) values
 ('c2222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','owner');
set local role authenticated;
select extensions.ok(public.can_manage_store('c2222222-2222-4222-8222-222222222222'),'store-scoped live owner can manage store');
reset role;
update public.store_memberships set role='catalog' where store_id='c2222222-2222-4222-8222-222222222222';
set local role authenticated;
select extensions.ok(not public.can_manage_store('c2222222-2222-4222-8222-222222222222'),'copied activity owner role cannot bypass live store demotion');
reset role;
update public.store_memberships set is_active=false where store_id='c2222222-2222-4222-8222-222222222222';
set local role authenticated;
select extensions.ok(not public.can_catalog_store('c2222222-2222-4222-8222-222222222222'),'copied activity role cannot bypass store deactivation');
reset role;
insert into public.merchant_memberships(merchant_id,user_id,role) values
 ('b4444444-4444-4444-8444-444444444444','a1111111-1111-4111-8111-111111111111','owner');
set local role authenticated;
select extensions.ok(public.can_manage_merchant('b4444444-4444-4444-8444-444444444444'),'new store approval with explicit merchant ownership grants merchant access');
reset role;
update public.activity_workspaces set status='suspended' where id='d5555555-5555-4555-8555-555555555555';
set local role authenticated;
select extensions.ok(not public.can_manage_merchant('b4444444-4444-4444-8444-444444444444'),'merchant membership cannot bypass suspended new store approval');

reset role;
update public.activity_workspaces set status='suspended' where id='d3333333-3333-4333-8333-333333333333';
set local role authenticated;
select extensions.ok(not public.has_my_activity_access('driver'),'driver suspension immediately revokes driver RPC access');
select extensions.ok(public.has_my_activity_access('merchant'),'driver suspension does not disable merchant activity');
select extensions.ok(public.can_catalog_store('c1111111-1111-4111-8111-111111111111'),'driver suspension does not disable catalog');
reset role;
update public.activity_workspaces set status='rejected' where id='d2222222-2222-4222-8222-222222222222';
set local role authenticated;
select extensions.ok(not public.can_manage_merchant('b2222222-2222-4222-8222-222222222222'),'rejected service is denied');
select extensions.ok(public.can_manage_merchant('b1111111-1111-4111-8111-111111111111'),'independent merchant remains approved');
reset role;
update public.activity_workspaces set status='suspended' where id='d4444444-4444-4444-8444-444444444444';
set local role authenticated;
select extensions.ok(not public.can_catalog_store('c1111111-1111-4111-8111-111111111111'),'store suspension cannot be bypassed by old owner membership');
select extensions.ok(not public.can_fulfill_store('c1111111-1111-4111-8111-111111111111'),'store suspension also blocks fulfillment');
reset role;
update public.activity_workspaces set status='suspended' where id='d1111111-1111-4111-8111-111111111111';
set local role authenticated;
select extensions.ok(not public.can_manage_merchant('b1111111-1111-4111-8111-111111111111'),'legacy profiles.merchant_id cannot bypass suspended activity');
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',true);
select extensions.ok(not public.has_my_activity_access('driver'),'driver profile alone is not an approval');
select extensions.ok(not public.has_my_activity_access('merchant'),'other identity cannot use merchant activities');
select extensions.is((select count(*)::integer from public.activity_workspaces where id='d1111111-1111-4111-8111-111111111111'),0,'workspace RLS isolates accounts');
select extensions.throws_ok($$select activity_private.driver_is_approved('a1111111-1111-4111-8111-111111111111')$$,'42501',null,'direct actor helper call is denied');
reset role;
select * from extensions.finish(true);
rollback;
