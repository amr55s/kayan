begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(27);

select extensions.ok(not pg_catalog.has_table_privilege('anon','public.onboarding_drafts','SELECT'),'anonymous cannot read drafts');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.onboarding_drafts','INSERT'),'no direct draft insertion');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.onboarding_drafts','UPDATE'),'no bypass of expected version');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.activity_workspaces','UPDATE'),'no self-approval');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.activity_memberships','INSERT'),'no self-assignment');
select extensions.ok(not pg_catalog.has_table_privilege('authenticated','public.onboarding_media_assets','SELECT'),'storage object keys are server-only');
select extensions.ok(not pg_catalog.has_function_privilege('anon','public.save_my_onboarding_draft(public.activity_kind,smallint,jsonb,integer,uuid)','EXECUTE'),'anonymous cannot invoke draft save');

insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','onboarding-test-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','onboarding-test-b@example.invalid');
insert into public.onboarding_drafts(id,user_id,activity_kind,data) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','store','{"name":"Owner private draft"}'),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','driver','{}');
insert into public.onboarding_media_assets(id,owner_id,draft_id,bucket,object_key,content_type,byte_size,sha256,width,height) values
 ('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',
  'private-test','onboarding/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444/private.webp','image/webp',128,repeat('a',64),10,10),
 ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
  'private-test','onboarding/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/private.webp','image/webp',128,repeat('b',64),10,10);
insert into public.activity_workspaces(id,activity_kind,name,status) values
 ('55555555-5555-4555-8555-555555555555','store','Pending store','pending'),
 ('66666666-6666-4666-8666-666666666666','driver','Other driver','approved');
insert into public.activity_memberships(workspace_id,user_id,role) values
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','owner'),
 ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','owner');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select extensions.is((select count(*)::int from public.onboarding_drafts),1,'owner sees only own draft');
select extensions.is(jsonb_array_length(public.read_my_onboarding_drafts()),1,'read RPC obeys owner RLS');
select extensions.is((select count(*)::int from public.activity_workspaces),1,'workspace list does not leak other owners');
select extensions.is((public.list_my_activity_workspaces()->0->>'canManage')::boolean,false,'pending workspace never grants management');
select extensions.throws_ok($$update public.onboarding_drafts set version=999$$,'42501',null,'direct version overwrite denied');
select extensions.throws_ok($$select public.save_my_onboarding_draft('store',1::smallint,'{}',1,'33333333-3333-4333-8333-333333333333')$$,
 '42501','google_identity_required','password-only identity cannot start public onboarding');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select extensions.is((select count(*)::int from public.onboarding_drafts where id='33333333-3333-4333-8333-333333333333'),0,'guessed draft ID is invisible');
select extensions.is((select count(*)::int from public.activity_memberships where user_id='11111111-1111-4111-8111-111111111111'),0,'memberships isolated');

reset role;
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('onboarding-test-a','11111111-1111-4111-8111-111111111111','{"sub":"onboarding-test-a","email":"onboarding-test-a@example.invalid"}','google'),
 ('onboarding-test-b','22222222-2222-4222-8222-222222222222','{"sub":"onboarding-test-b","email":"onboarding-test-b@example.invalid"}','google');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select extensions.is((public.save_my_onboarding_draft('store',2::smallint,'{"name":"Saved"}',1,'33333333-3333-4333-8333-333333333333')->>'version')::int,2,'valid CAS increments version once');
select extensions.throws_ok($$select public.save_my_onboarding_draft('store',2::smallint,'{"name":"stale"}',1,'33333333-3333-4333-8333-333333333333')$$,
 '40001','onboarding_version_conflict','stale tab cannot overwrite');
select extensions.is((select data->>'name' from public.onboarding_drafts where id='33333333-3333-4333-8333-333333333333'),'Saved','conflict preserves current data');
select extensions.throws_ok($$select public.save_my_onboarding_draft('store',2::smallint,'{"mediaIds":["77777777-7777-4777-8777-777777777777"]}',2,'33333333-3333-4333-8333-333333333333')$$,
 '42501','onboarding_media_access_denied','other owner media cannot attach');
select extensions.is((public.save_my_onboarding_draft('store',3::smallint,'{"mediaIds":["88888888-8888-4888-8888-888888888888"]}',2,'33333333-3333-4333-8333-333333333333')->>'version')::int,3,'own validated private media attaches');
select extensions.throws_ok($$select public.save_my_onboarding_draft('store',3::smallint,'{"mediaIds":["88888888-8888-4888-8888-888888888888","88888888-8888-4888-8888-888888888888"]}',3,'33333333-3333-4333-8333-333333333333')$$,
 '22023','invalid_onboarding_media','duplicate media rejected');
select extensions.is((public.save_my_onboarding_draft('service',1::smallint,'{}',0)->>'version')::int,1,'second activity independent draft');
select extensions.throws_ok($$select public.save_my_onboarding_draft('service',1::smallint,'{}',0)$$,
 '40001','onboarding_version_conflict','duplicate create cannot replace existing draft');
select extensions.throws_ok($$select public.save_my_onboarding_draft('service',2::smallint,'{"mediaIds":["88888888-8888-4888-8888-888888888888"]}',1,
 (select id from public.onboarding_drafts where activity_kind='service'))$$,
 '42501','onboarding_media_access_denied','same owner cannot attach media from another activity draft');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select extensions.throws_ok($$select public.save_my_onboarding_draft('store',2::smallint,'{}',2,'33333333-3333-4333-8333-333333333333')$$,
 '40001','onboarding_version_conflict','other Google account cannot overwrite guessed draft ID');
reset role;
select extensions.throws_ok($$delete from public.onboarding_media_assets where id='88888888-8888-4888-8888-888888888888'$$,
 '23503',null,'saved draft reference protects image from deletion');
select extensions.is((select count(*)::int from public.onboarding_draft_media where asset_id='88888888-8888-4888-8888-888888888888'),1,'failed saves preserve existing image reference');
select * from extensions.finish(true);
rollback;
