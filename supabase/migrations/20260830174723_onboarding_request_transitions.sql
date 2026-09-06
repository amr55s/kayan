begin;

-- Creation, repeat submission and workspace state are one transaction.
create function public.submit_my_onboarding_draft(p_draft_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := (select auth.uid()); v_d public.onboarding_drafts; v_r public.account_requests;
 v_workspace uuid; v_category text; v_phone text; v_whatsapp text; v_existing uuid;
 v_images text[]; v_estate jsonb; v_data jsonb;
begin
 if v_uid is null or not exists(select 1 from auth.identities where user_id=v_uid and provider='google') then
   raise exception 'google_identity_required' using errcode='42501';
 end if;
 select * into v_d from public.onboarding_drafts where id=p_draft_id and user_id=v_uid for update;
 if v_d.id is null then raise exception 'onboarding_not_found' using errcode='42501'; end if;
 if v_d.status='submitted' then
   select * into v_r from public.account_requests where id=v_d.request_id;
   return jsonb_build_object('workspaceId',v_r.workspace_id);
 end if;
 if p_expected_version is null or v_d.version<>p_expected_version then
   raise exception 'onboarding_version_conflict' using errcode='40001';
 end if;
 v_data := v_d.data;
 v_phone := regexp_replace(coalesce(v_data->>'phone',''),'[^0-9]','','g');
 v_phone := regexp_replace(v_phone,'^20','0');
 v_whatsapp := nullif(regexp_replace(coalesce(v_data->>'whatsapp',''),'[^0-9]','','g'),'');
 v_whatsapp := regexp_replace(v_whatsapp,'^20','0');
 if char_length(btrim(coalesce(v_data->>'displayName',''))) not between 2 and 100
   or v_phone !~ '^01[0125][0-9]{8}$'
   or (v_whatsapp is not null and v_whatsapp !~ '^01[0125][0-9]{8}$') then
   raise exception 'onboarding_incomplete' using errcode='22023';
 end if;
 if exists(select 1 from public.profiles where phone=v_phone and id<>v_uid) then
   raise exception 'phone_already_has_account' using errcode='23505';
 end if;
 v_category := case v_d.activity_kind when 'driver' then null when 'store' then 'stores'
   when 'restaurant' then case when v_data->>'category'='home_made' then 'home_made' else 'restaurants' end
   when 'service' then case when v_data->>'category'='crafts' then 'crafts' else 'services' end
   when 'real_estate' then 'real_estate' end;
 if v_d.activity_kind='driver' then
   if char_length(btrim(coalesce(v_data->>'vehicleType',''))) not between 2 and 60 then raise exception 'onboarding_incomplete'; end if;
 elsif v_data->>'placeMode'='existing' and v_d.activity_kind<>'real_estate' then
   v_existing := nullif(v_data->>'existingPlaceId','')::uuid;
   select category into v_category from public.places where id=v_existing for share;
   if v_category is null or not (
     (v_d.activity_kind='store' and v_category in ('stores','market','veggies','pharmacy'))
     or (v_d.activity_kind='restaurant' and v_category in ('restaurants','home_made'))
     or (v_d.activity_kind='service' and v_category in ('services','crafts'))
   ) or exists(select 1 from public.merchant_branches where place_id=v_existing) then
     raise exception 'onboarding_incomplete' using errcode='22023';
   end if;
 else
   if char_length(btrim(coalesce(v_data->>'name',''))) not between 2 and 150
     or char_length(btrim(coalesce(v_data->>'description',''))) not between 2 and 2000
     or char_length(btrim(coalesce(v_data->>'address',''))) not between 5 and 500 then
     raise exception 'onboarding_incomplete' using errcode='22023';
   end if;
 end if;
 if v_data ? 'product' then
   if v_d.activity_kind not in ('store','restaurant')
     or char_length(btrim(coalesce(v_data->'product'->>'name',''))) not between 2 and 150
     or coalesce(v_data->'product'->>'priceEgp','') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
     or (v_data->'product'->>'priceEgp')::numeric <= 0 then raise exception 'onboarding_incomplete'; end if;
 end if;
 select coalesce(array_agg('dairtak-upload:'||asset.id::text order by media.position),'{}') into v_images
 from public.onboarding_draft_media media join public.onboarding_media_assets asset on asset.id=media.asset_id
 where media.draft_id=v_d.id and asset.owner_id=v_uid and asset.draft_id=v_d.id;
 if v_d.activity_kind='real_estate' then
   -- CHECK constraints accept NULL; required fields must be rejected explicitly here.
   if cardinality(v_images) not between 5 and 7
     or coalesce(jsonb_typeof(v_data->'realEstate'),'')<>'object'
     or coalesce(v_data->'realEstate'->>'offerType','') not in ('rent','sale')
     or coalesce(v_data->'realEstate'->>'propertyType','') not in ('apartment','villa','house','shop','office','land','other')
     or coalesce(v_data->'realEstate'->>'priceEgp','') !~ '^[1-9][0-9]{0,8}$'
     or (v_data->'realEstate'->>'propertyType' in ('apartment','villa','house','other')
       and coalesce(v_data->'realEstate'->>'rooms','')='')
     or (coalesce(v_data->'realEstate'->>'rooms','')<>'' and not case
       when v_data->'realEstate'->>'rooms' ~ '^[1-9][0-9]?$'
       then (v_data->'realEstate'->>'rooms')::integer between 1 and 50 else false end)
     or (coalesce(v_data->'realEstate'->>'bathrooms','')<>'' and not case
       when v_data->'realEstate'->>'bathrooms' ~ '^[1-9][0-9]?$'
       then (v_data->'realEstate'->>'bathrooms')::integer between 1 and 20 else false end)
     or (coalesce(v_data->'realEstate'->>'areaSqm','')<>'' and not case
       when v_data->'realEstate'->>'areaSqm' ~ '^[1-9][0-9]{0,5}$'
       then (v_data->'realEstate'->>'areaSqm')::integer between 1 and 100000 else false end)
     or (coalesce(v_data->'realEstate'->>'floor','')<>'' and not case
       when v_data->'realEstate'->>'floor' ~ '^[0-9]{1,3}$'
       then (v_data->'realEstate'->>'floor')::integer between 0 and 100 else false end)
     or (coalesce(v_data->'realEstate'->>'furnishing','')<>''
       and v_data->'realEstate'->>'furnishing' not in ('furnished','semi_furnished','unfurnished')) then
     raise exception 'onboarding_incomplete' using errcode='22023';
   end if;
   v_estate := jsonb_build_object(
     'offer_type',v_data->'realEstate'->>'offerType','property_type',v_data->'realEstate'->>'propertyType',
     'price_egp',v_data->'realEstate'->>'priceEgp','rooms',nullif(v_data->'realEstate'->>'rooms',''),
     'bathrooms',nullif(v_data->'realEstate'->>'bathrooms',''),'area_sqm',nullif(v_data->'realEstate'->>'areaSqm',''),
     'floor',nullif(v_data->'realEstate'->>'floor',''),'furnishing',nullif(v_data->'realEstate'->>'furnishing',''));
 end if;
 select * into v_r from public.account_requests where auth_user_id=v_uid and activity_kind=v_d.activity_kind for update;
 if v_r.id is not null and v_r.status<>'rejected' then raise exception 'activity_request_exists' using errcode='23505'; end if;
 v_workspace := v_r.workspace_id;
 if v_workspace is null then
   insert into public.activity_workspaces(activity_kind,name,status) values(v_d.activity_kind,
     coalesce(nullif(btrim(v_data->>'name'),''),btrim(v_data->>'displayName')),'pending') returning id into v_workspace;
   insert into public.activity_memberships(workspace_id,user_id,role) values(v_workspace,v_uid,'owner');
 else
   update public.activity_workspaces set status='pending',updated_at=now() where id=v_workspace;
 end if;
 insert into public.account_requests(id,kind,activity_kind,workspace_id,auth_user_id,display_name,phone,whatsapp,
   vehicle_type,place_mode,existing_place_id,place_title,place_category,place_description,place_address,
   place_whatsapp,place_images,real_estate_details,status)
 values(coalesce(v_r.id,gen_random_uuid()),case when v_d.activity_kind='driver' then 'driver' else 'merchant' end,
   v_d.activity_kind,v_workspace,v_uid,btrim(v_data->>'displayName'),v_phone,v_whatsapp,
   case when v_d.activity_kind='driver' then v_data->>'vehicleType' end,
   case when v_d.activity_kind='driver' then null when v_existing is not null then 'existing' else 'new' end,
   v_existing,btrim(v_data->>'name'),v_category,btrim(v_data->>'description'),btrim(v_data->>'address'),
   coalesce(v_whatsapp,v_phone),v_images,v_estate,'pending')
 on conflict(auth_user_id,activity_kind) do update set
   display_name=excluded.display_name,phone=excluded.phone,whatsapp=excluded.whatsapp,vehicle_type=excluded.vehicle_type,
   place_mode=excluded.place_mode,existing_place_id=excluded.existing_place_id,place_title=excluded.place_title,
   place_category=excluded.place_category,place_description=excluded.place_description,place_address=excluded.place_address,
   place_whatsapp=excluded.place_whatsapp,place_images=excluded.place_images,real_estate_details=excluded.real_estate_details,
   status='pending',rejection_reason=null,reviewed_by=null,reviewed_at=null,workspace_id=excluded.workspace_id
 returning * into v_r;
 update public.onboarding_drafts set status='submitted',request_id=v_r.id,step=4,version=version+1,updated_at=now() where id=v_d.id;
 return jsonb_build_object('workspaceId',v_workspace);
end;
$$;
revoke all on function public.submit_my_onboarding_draft(uuid,integer) from public,anon,authenticated;
grant execute on function public.submit_my_onboarding_draft(uuid,integer) to authenticated;

-- Rejection affects only this application; retains content and immutable review history.
create or replace function public.reject_account_request(p_request_id uuid,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request public.account_requests;
begin
 if not public.is_admin() then raise exception 'admin_access_required'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then raise exception 'rejection_reason_required'; end if;
 perform 1 from public.onboarding_drafts where request_id=p_request_id for update;
 select * into v_request from public.account_requests where id=p_request_id for update;
 if v_request.id is null then raise exception 'request_not_found'; end if;
 if v_request.status='rejected' then return v_request.auth_user_id; end if;
 if v_request.status<>'pending' then raise exception 'request_already_processed'; end if;
 update public.account_requests set status='rejected',rejection_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=v_request.id;
 update public.activity_workspaces set status='rejected',updated_at=now() where id=v_request.workspace_id;
 update public.onboarding_drafts set status='draft',version=version+1,updated_at=now() where request_id=v_request.id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'account_request_rejected','account_request',v_request.id::text,jsonb_build_object('activity',v_request.activity_kind));
 return v_request.auth_user_id;
end;
$$;
revoke all on function public.reject_account_request(uuid,text) from public,anon,authenticated;
grant execute on function public.reject_account_request(uuid,text) to authenticated;

create table public.onboarding_publication_jobs (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null unique references public.onboarding_drafts(id) on delete restrict,
 workspace_id uuid not null references public.activity_workspaces(id) on delete restrict,
 branch_id uuid not null references public.merchant_branches(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','processing','complete')),
 lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index onboarding_publication_jobs_pending on public.onboarding_publication_jobs(status,created_at) where status<>'complete';
alter table public.onboarding_publication_jobs enable row level security;
revoke all on public.onboarding_publication_jobs from public,anon,authenticated;
grant all on public.onboarding_publication_jobs to service_role;

-- Old requests retain their established path; new draft requests are handled atomically.
alter function public.approve_account_request(uuid) rename to approve_account_request_legacy_20260830;
revoke all on function public.approve_account_request_legacy_20260830(uuid) from public,anon,authenticated,service_role;
create function public.approve_account_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_r public.account_requests; v_d public.onboarding_drafts; v_merchant uuid; v_store uuid;
 v_product uuid; v_variant uuid; v_branch uuid; v_name text; v_place public.places;
begin
 if not public.is_admin() then raise exception 'admin_access_required'; end if;
 -- Same lock order as submission: draft, request, workspace.
 select * into v_d from public.onboarding_drafts where request_id=p_request_id for update;
 select * into v_r from public.account_requests where id=p_request_id for update;
 if v_r.id is null then raise exception 'request_not_found'; end if;
 if v_r.status='approved' then return v_r.auth_user_id; end if;
 if v_r.status<>'pending' then raise exception 'request_already_processed'; end if;
 if v_d.id is null then
   perform public.approve_account_request_legacy_20260830(p_request_id);
   if v_r.kind='merchant' then
     insert into public.merchant_memberships(merchant_id,user_id,role)
     select merchant_id,id,'owner' from public.profiles where id=v_r.auth_user_id and merchant_id is not null
     on conflict do nothing;
   end if;
   if v_r.workspace_id is null then
     insert into public.activity_workspaces(activity_kind,name,status)
     values(v_r.activity_kind,coalesce(v_r.place_title,v_r.display_name),'approved') returning id into v_r.workspace_id;
     insert into public.activity_memberships(workspace_id,user_id,role) values(v_r.workspace_id,v_r.auth_user_id,'owner');
     update public.account_requests set workspace_id=v_r.workspace_id where id=v_r.id;
   end if;
   update public.activity_workspaces set status='approved',
     merchant_id=case when v_r.kind='merchant' then (select merchant_id from public.profiles where id=v_r.auth_user_id) end,
     driver_profile_id=case when v_r.kind='driver' then v_r.auth_user_id end,updated_at=now()
   where id=v_r.workspace_id;
   return v_r.auth_user_id;
 end if;
 if v_d.status<>'submitted' or v_d.user_id<>v_r.auth_user_id or v_d.activity_kind<>v_r.activity_kind then
   raise exception 'onboarding_request_mismatch';
 end if;
 if exists(select 1 from public.profiles where phone=v_r.phone and id<>v_r.auth_user_id) then
   raise exception 'phone_already_has_account';
 end if;
 if exists(select 1 from public.profiles where id=v_r.auth_user_id and (not is_active or must_change_password)) then
   raise exception 'account_requires_admin_recovery';
 end if;
 perform 1 from public.activity_workspaces where id=v_r.workspace_id and status='pending' for update;
 if not found then raise exception 'workspace_not_pending'; end if;
 if v_r.kind='driver' then
   insert into public.profiles(id,role,phone,display_name,is_active,must_change_password)
   values(v_r.auth_user_id,'driver',v_r.phone,v_r.display_name,true,false) on conflict(id) do nothing;
   insert into public.driver_profiles(profile_id,contact_phone,whatsapp,vehicle_type,is_available)
   values(v_r.auth_user_id,v_r.phone,coalesce(v_r.whatsapp,v_r.phone),v_r.vehicle_type,false)
   on conflict(profile_id) do nothing;
   update public.activity_workspaces set status='approved',driver_profile_id=v_r.auth_user_id,updated_at=now() where id=v_r.workspace_id;
 else
   if v_r.place_mode='existing' then
     select * into v_place from public.places where id=v_r.existing_place_id for update;
     if v_place.id is null or exists(select 1 from public.merchant_branches where place_id=v_place.id) then raise exception 'place_already_claimed'; end if;
   end if;
   v_name := coalesce(v_place.title,v_r.place_title,v_r.display_name);
   insert into public.merchants(display_name) values(v_name) returning id into v_merchant;
   -- Preserve a pre-existing primary role; every new capability comes from its own membership.
   insert into public.profiles(id,role,phone,display_name,merchant_id,is_active,must_change_password)
   values(v_r.auth_user_id,'merchant',v_r.phone,v_r.display_name,v_merchant,true,false) on conflict(id) do nothing;
   insert into public.merchant_memberships(merchant_id,user_id,role) values(v_merchant,v_r.auth_user_id,'owner');
   insert into public.merchant_branches(merchant_id,place_id,name,phone,address,area,is_default,is_active)
   values(v_merchant,v_place.id,v_name,v_r.phone,coalesce(v_r.place_address,'العنوان غير محدد'),'الكيان',true,true) returning id into v_branch;
   if v_r.activity_kind in ('store','restaurant') then
     insert into public.stores(merchant_id,slug,name,description,status,address_text,created_by)
     values(v_merchant,'store-'||replace(v_r.workspace_id::text,'-',''),v_name,v_r.place_description,'draft',v_r.place_address,v_r.auth_user_id)
     returning id into v_store;
     insert into public.store_memberships(store_id,user_id,role) values(v_store,v_r.auth_user_id,'owner');
     if v_d.data ? 'product' and v_d.materialized_product_id is null then
       insert into public.products(store_id,slug,name,description,status,created_by)
       values(v_store,'first-'||replace(v_d.id::text,'-',''),btrim(v_d.data->'product'->>'name'),v_d.data->'product'->>'description','draft',v_r.auth_user_id)
       returning id into v_product;
       insert into public.product_variants(product_id,store_id,sku,title,price,is_default)
       values(v_product,v_store,'FIRST-'||replace(v_d.id::text,'-',''),'الافتراضي',((v_d.data->'product'->>'priceEgp')::numeric*100)::bigint,true)
       returning id into v_variant;
       insert into public.inventory_stock(variant_id,on_hand,track_inventory) values(v_variant,0,true) on conflict do nothing;
       update public.onboarding_drafts set materialized_product_id=v_product where id=v_d.id;
     end if;
   end if;
   update public.activity_workspaces set status='approved',name=v_name,merchant_id=v_merchant,store_id=v_store,updated_at=now() where id=v_r.workspace_id;
   -- Directory images are copied only AFTER approval. A storage outage cannot expose a draft or half-listing.
   if v_r.place_mode='new' then
     insert into public.onboarding_publication_jobs(draft_id,workspace_id,branch_id) values(v_d.id,v_r.workspace_id,v_branch) on conflict(draft_id) do nothing;
   end if;
 end if;
 update public.account_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=null where id=v_r.id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'activity_approved','account_request',v_r.id::text,jsonb_build_object('workspace_id',v_r.workspace_id,'activity',v_r.activity_kind,'product_id',v_product));
 return v_r.auth_user_id;
end;
$$;
revoke all on function public.approve_account_request(uuid) from public,anon,authenticated;
grant execute on function public.approve_account_request(uuid) to authenticated;

create function public.claim_onboarding_publication_job() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_job public.onboarding_publication_jobs; v_token uuid:=gen_random_uuid();
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'worker_required'; end if;
 select j.* into v_job from public.onboarding_publication_jobs j
 join public.activity_workspaces w on w.id=j.workspace_id and w.status='approved'
 where j.status='pending' or (j.status='processing' and j.lease_until<now())
 order by j.created_at for update of j skip locked limit 1;
 if v_job.id is null then return null; end if;
 update public.onboarding_publication_jobs set status='processing',lease_token=v_token,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() where id=v_job.id;
 return jsonb_build_object('id',v_job.id,'token',v_token,'draftId',v_job.draft_id,
   'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'key',a.object_key,'sha256',a.sha256) order by dm.position)
   from public.onboarding_draft_media dm join public.onboarding_media_assets a on a.id=dm.asset_id where dm.draft_id=v_job.draft_id),'[]'::jsonb));
end;
$$;

create function public.finish_onboarding_publication_job(p_job_id uuid,p_token uuid,p_urls text[]) returns void
language plpgsql security definer set search_path='' as $$
declare v_job public.onboarding_publication_jobs; v_r public.account_requests; v_place uuid; v_count integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'worker_required'; end if;
 select * into v_job from public.onboarding_publication_jobs where id=p_job_id for update;
 if v_job.status='complete' then return; end if;
 if v_job.id is null or v_job.status<>'processing' or v_job.lease_token is distinct from p_token or v_job.lease_until<now() then raise exception 'publication_lease_expired'; end if;
 perform 1 from public.activity_workspaces where id=v_job.workspace_id and status='approved' for share;
 if not found then raise exception 'workspace_not_approved'; end if;
 select r.* into v_r from public.account_requests r join public.onboarding_drafts d on d.request_id=r.id where d.id=v_job.draft_id and r.status='approved';
 if v_r.id is null then raise exception 'request_not_approved'; end if;
 select count(*) into v_count from public.onboarding_draft_media where draft_id=v_job.draft_id;
 if p_urls is null or cardinality(p_urls)<>v_count or exists(select 1 from unnest(p_urls) u where u is null or u !~ '^https://') then raise exception 'publication_media_mismatch'; end if;
 if v_r.activity_kind='real_estate' and v_count not between 5 and 7 then raise exception 'publication_media_mismatch'; end if;
 insert into public.places(title,category,phone,whatsapp,description,images,is_featured,address)
 values(v_r.place_title,v_r.place_category,v_r.phone,coalesce(v_r.whatsapp,v_r.phone),v_r.place_description,p_urls,false,v_r.place_address) returning id into v_place;
 update public.merchant_branches set place_id=v_place where id=v_job.branch_id and place_id is null;
 if not found then raise exception 'publication_branch_already_linked'; end if;
 if v_r.activity_kind='real_estate' then
   insert into public.place_real_estate(place_id,offer_type,property_type,price_egp,rooms,bathrooms,area_sqm,floor,furnishing)
   values(v_place,v_r.real_estate_details->>'offer_type',v_r.real_estate_details->>'property_type',
     (v_r.real_estate_details->>'price_egp')::bigint,(v_r.real_estate_details->>'rooms')::integer,
     (v_r.real_estate_details->>'bathrooms')::integer,(v_r.real_estate_details->>'area_sqm')::integer,
     (v_r.real_estate_details->>'floor')::integer,v_r.real_estate_details->>'furnishing');
 end if;
 update public.onboarding_publication_jobs set status='complete',lease_token=null,lease_until=null,updated_at=now() where id=v_job.id;
end;
$$;
revoke all on function public.claim_onboarding_publication_job(),public.finish_onboarding_publication_job(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.claim_onboarding_publication_job(),public.finish_onboarding_publication_job(uuid,uuid,text[]) to service_role;

commit;
