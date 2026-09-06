-- Run only against Staging/test databases. All fixtures and side effects roll back.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(38);

insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','transition-owner@example.invalid'),
 ('a1000000-0000-4000-8000-000000000002','transition-admin@example.invalid'),
 ('a1000000-0000-4000-8000-000000000003','transition-other@example.invalid');
insert into auth.identities(provider_id,user_id,identity_data,provider)
 values('transition-owner','a1000000-0000-4000-8000-000000000001','{"sub":"transition-owner","email":"transition-owner@example.invalid"}','google');
insert into public.profiles(id,role,phone,display_name,is_active,must_change_password)
 values('a1000000-0000-4000-8000-000000000002','admin','01099990002','Transition admin',true,false);
insert into public.admin_memberships(user_id,role)
 values('a1000000-0000-4000-8000-000000000002','super_admin');

insert into public.onboarding_drafts(id,user_id,activity_kind,data) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','store',
  '{"displayName":"Transition owner","phone":"01099990001","name":"Transition fixture store","description":"Test description","address":"Test street 42","placeMode":"new","product":{"name":"First draft product","description":"Not public","priceEgp":"12.50"}}'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','driver',
  '{"displayName":"Transition owner","phone":"01099990001","vehicleType":"Motorcycle"}'),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','service',
  '{"displayName":"Transition owner","phone":"01099990001","name":"Transition fixture service","description":"Test description","address":"Test street 42","placeMode":"new"}'),
 ('a2000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','real_estate',
  '{"displayName":"Transition owner","phone":"01099990001","name":"Transition fixture estate","description":"Test description","address":"Test street 42","placeMode":"new"}'),
 ('a2000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000001','restaurant',
  '{"displayName":"Transition owner","phone":"01099990001","name":"Transition fixture restaurant","description":"Test description","address":"Test street 42","placeMode":"new"}');
insert into public.onboarding_media_assets(id,owner_id,draft_id,bucket,object_key,content_type,byte_size,sha256,width,height)
 select ('a3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000004','private-test',
 'onboarding/a1000000-0000-4000-8000-000000000001/a2000000-0000-4000-8000-000000000004/'||i::text||'.webp',
 'image/webp',128,repeat('a',64),10,10 from generate_series(1,5) i;
insert into public.onboarding_draft_media(draft_id,asset_id,position)
 select 'a2000000-0000-4000-8000-000000000004',('a3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,(i-1)::smallint
 from generate_series(1,5) i;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select extensions.throws_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000004',1)$$,
 '22023','onboarding_incomplete','real estate missing required object rejected despite five photos');
reset role;
update public.onboarding_drafts set data=data||'{"realEstate":{"offerType":"sale","propertyType":"apartment","priceEgp":"100000"}}'
 where id='a2000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000004',1)$$,
 '22023','onboarding_incomplete','residential property requires rooms');
reset role;
update public.onboarding_drafts set data=jsonb_set(data,'{realEstate,rooms}','"99"') where id='a2000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000004',1)$$,
 '22023','onboarding_incomplete','invalid room count rejected');
reset role;
update public.onboarding_drafts set data=jsonb_set(data,'{realEstate,rooms}','"3"') where id='a2000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000004',1)$$,'valid real estate submits privately');
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000001',1)$$,'store first product submits privately');
select extensions.is(public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000001',1)->>'workspaceId',
 (select workspace_id::text from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='store'),
 'repeat submission returns same workspace');
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000002',1)$$,'same user submits delivery separately');
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000003',1)$$,'same user submits service without product');
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000005',1)$$,'restaurant can defer first menu item');
select extensions.is((select count(*)::int from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001'),5,'exactly one request per activity');
select extensions.throws_ok($$select public.approve_account_request((select request_id from public.onboarding_drafts where id='a2000000-0000-4000-8000-000000000001'))$$,
 'P0001','admin_access_required','owner cannot approve own request');
reset role;
select extensions.is((select count(*)::int from public.products where created_by='a1000000-0000-4000-8000-000000000001'),0,'no materialized product before approval');
select extensions.is((select count(*)::int from public.places where title like 'Transition fixture%'),0,'no public directory content before approval');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select extensions.throws_ok($$select public.approve_account_request((select id from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='store'))$$,
 'P0001','admin_access_required','administrator still requires MFA');
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select extensions.lives_ok($$select public.reject_account_request((select id from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='service'),'Clarify the service description')$$,'service rejection succeeds independently');
select extensions.lives_ok($$select public.approve_account_request((select id from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='store'))$$,'store approval materializes optional product');
select extensions.lives_ok($$select public.approve_account_request((select id from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='store'))$$,'repeat approval is idempotent');
select extensions.lives_ok($$select public.approve_account_request((select id from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='driver'))$$,'delivery approval preserves existing merchant capability');
reset role;
select extensions.is((select count(*)::int from public.products where created_by='a1000000-0000-4000-8000-000000000001'),1,'exactly one first product materialized');
select extensions.is((select status::text from public.products where created_by='a1000000-0000-4000-8000-000000000001'),'draft','first product remains unpublished');
select extensions.is((select status::text from public.stores where created_by='a1000000-0000-4000-8000-000000000001'),'draft','store moderation remains required');
select extensions.is((select role::text from public.profiles where id='a1000000-0000-4000-8000-000000000001'),'merchant','secondary delivery approval does not replace legacy role');
select extensions.is((select count(*)::int from public.driver_profiles where profile_id='a1000000-0000-4000-8000-000000000001'),1,'same identity has delivery profile');
select extensions.is((select status from public.account_requests where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='restaurant'),'pending','store approval does not approve restaurant');
select extensions.is((select status from public.onboarding_drafts where id='a2000000-0000-4000-8000-000000000003'),'draft','rejection preserves editable draft');
select extensions.is((select count(*)::int from auth.users where id='a1000000-0000-4000-8000-000000000001'),1,'rejection never deletes shared identity');
select set_config('test.onboarding_store',(select id::text from public.stores where created_by='a1000000-0000-4000-8000-000000000001'),true);
select set_config('test.onboarding_merchant',(select merchant_id::text from public.stores where created_by='a1000000-0000-4000-8000-000000000001'),true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select extensions.is(public.can_manage_merchant(current_setting('test.onboarding_merchant')::uuid),true,'new store owner has explicit merchant-wide membership');
select extensions.is(public.can_manage_store(current_setting('test.onboarding_store')::uuid),true,'approved owner can manage store');
select extensions.is(public.has_my_activity_access('driver'),true,'secondary driver capability does not depend on primary role');
select extensions.lives_ok($$select public.submit_my_onboarding_draft('a2000000-0000-4000-8000-000000000003',3)$$,'rejected service can be resubmitted');
select extensions.is((select count(*)::int from public.account_activity_reviews where request_id=(select request_id from public.onboarding_drafts where id='a2000000-0000-4000-8000-000000000003')),3,'pending rejected pending history retained');
reset role;

insert into public.profiles(id,role,phone,display_name,is_active,must_change_password)
 values('a1000000-0000-4000-8000-000000000003','driver','01099990003','Store scoped staff',true,false);
insert into public.store_memberships(store_id,user_id,role)
 values(current_setting('test.onboarding_store')::uuid,'a1000000-0000-4000-8000-000000000003','owner');
insert into public.activity_memberships(workspace_id,user_id,role)
 select workspace_id,'a1000000-0000-4000-8000-000000000003','owner' from public.account_requests
 where auth_user_id='a1000000-0000-4000-8000-000000000001' and activity_kind='store';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
select extensions.is(public.can_manage_store(current_setting('test.onboarding_store')::uuid),true,'store-scoped owner has store access');
select extensions.is(public.can_manage_merchant(current_setting('test.onboarding_merchant')::uuid),false,'store scope cannot expand to merchant scope');
reset role;
update public.store_memberships set is_active=false where store_id=current_setting('test.onboarding_store')::uuid and user_id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.is(public.can_manage_store(current_setting('test.onboarding_store')::uuid),false,'revoking underlying store membership immediately revokes access');
reset role;

-- Finish only this fixture's job; never claim an unrelated real Staging queue item.
update public.onboarding_publication_jobs set status='processing',lease_token='a4000000-0000-4000-8000-000000000001',lease_until=now()+interval '2 minutes'
 where draft_id='a2000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.lives_ok($$select public.finish_onboarding_publication_job((select id from public.onboarding_publication_jobs where draft_id='a2000000-0000-4000-8000-000000000001'),
 'a4000000-0000-4000-8000-000000000001','{}'::text[])$$,'approved empty-photo directory publication completes');
select extensions.lives_ok($$select public.finish_onboarding_publication_job((select id from public.onboarding_publication_jobs where draft_id='a2000000-0000-4000-8000-000000000001'),
 'a4000000-0000-4000-8000-000000000001','{}'::text[])$$,'repeat finish is safe after lost acknowledgement');
reset role;
select extensions.is((select count(*)::int from public.places where title='Transition fixture store'),1,'publication retry never creates duplicate directory place');
select extensions.is((select status from public.onboarding_publication_jobs where draft_id='a2000000-0000-4000-8000-000000000001'),'complete','publication is recorded complete');

select * from extensions.finish(true);
rollback;
