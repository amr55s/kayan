begin;

create type public.activity_kind as enum ('store', 'restaurant', 'service', 'real_estate', 'driver');
create type public.activity_workspace_status as enum ('draft', 'pending', 'approved', 'rejected', 'suspended');

-- Workspace selection is presentation state, never an authorization claim.
create table public.activity_workspaces (
  id uuid primary key default gen_random_uuid(),
  activity_kind public.activity_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  status public.activity_workspace_status not null default 'draft',
  merchant_id uuid references public.merchants(id) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  driver_profile_id uuid references public.driver_profiles(profile_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (store_id is null or (merchant_id is not null and activity_kind in ('store','restaurant'))),
  check (driver_profile_id is null or activity_kind = 'driver'),
  check (activity_kind <> 'driver' or (merchant_id is null and store_id is null))
);
create unique index activity_workspaces_store_idx on public.activity_workspaces(store_id) where store_id is not null;
create unique index activity_workspaces_driver_idx on public.activity_workspaces(driver_profile_id) where driver_profile_id is not null;
create unique index activity_workspaces_merchant_kind_idx on public.activity_workspaces(merchant_id, activity_kind)
  where merchant_id is not null and store_id is null;

create table public.activity_memberships (
  workspace_id uuid not null references public.activity_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);
create index activity_memberships_user_idx on public.activity_memberships(user_id,workspace_id) where is_active;

-- Preserve IDs, legacy roles, requests and operational links. Never create admin memberships.
insert into public.activity_workspaces(activity_kind,name,status,merchant_id)
select distinct
  case when place.category in ('restaurants','home_made') then 'restaurant'::public.activity_kind
       when place.category in ('crafts','services') then 'service'::public.activity_kind
       when place.category = 'real_estate' then 'real_estate'::public.activity_kind
       else 'store'::public.activity_kind end,
  merchant.display_name,
  case when merchant.is_active then 'approved'::public.activity_workspace_status else 'suspended'::public.activity_workspace_status end,
  merchant.id
from public.merchants merchant
left join public.merchant_branches branch on branch.merchant_id = merchant.id
left join public.places place on place.id = branch.place_id
on conflict do nothing;

insert into public.activity_workspaces(activity_kind,name,status,merchant_id,store_id)
select 'store', store.name,
  case when merchant.is_active then 'approved'::public.activity_workspace_status else 'suspended'::public.activity_workspace_status end,
  store.merchant_id,store.id
from public.stores store join public.merchants merchant on merchant.id=store.merchant_id;

insert into public.activity_workspaces(activity_kind,name,status,driver_profile_id)
select 'driver',profile.display_name,
  case when profile.is_active then 'approved'::public.activity_workspace_status else 'suspended'::public.activity_workspace_status end,
  driver.profile_id
from public.driver_profiles driver join public.profiles profile on profile.id=driver.profile_id;

insert into public.activity_memberships(workspace_id,user_id,role,is_active)
select workspace.id,profile.id,'owner',profile.is_active
from public.activity_workspaces workspace join public.profiles profile
 on (workspace.merchant_id=profile.merchant_id and profile.role='merchant')
 or (workspace.driver_profile_id=profile.id and profile.role='driver')
on conflict do nothing;

insert into public.activity_memberships(workspace_id,user_id,role,is_active)
select workspace.id,membership.user_id,
  case when membership.role::text in ('owner','manager') then membership.role::text else 'member' end,
  membership.is_active
from public.activity_workspaces workspace join public.merchant_memberships membership
  on membership.merchant_id=workspace.merchant_id
on conflict do nothing;

insert into public.activity_memberships(workspace_id,user_id,role,is_active)
select workspace.id,membership.user_id,
  case when membership.role::text in ('owner','manager') then membership.role::text else 'member' end,
  membership.is_active
from public.activity_workspaces workspace join public.store_memberships membership on membership.store_id=workspace.store_id
on conflict do nothing;

alter table public.account_requests add column activity_kind public.activity_kind;
update public.account_requests request set activity_kind = case
  when kind='driver' then 'driver'::public.activity_kind
  when coalesce((select place.category from public.places place where request.place_mode='existing' and place.id=request.existing_place_id),place_category) in ('restaurants','home_made') then 'restaurant'::public.activity_kind
  when coalesce((select place.category from public.places place where request.place_mode='existing' and place.id=request.existing_place_id),place_category) in ('crafts','services') then 'service'::public.activity_kind
  when coalesce((select place.category from public.places place where request.place_mode='existing' and place.id=request.existing_place_id),place_category)='real_estate' then 'real_estate'::public.activity_kind
  else 'store'::public.activity_kind end;
alter table public.account_requests alter column activity_kind set not null;
alter table public.account_requests drop constraint account_requests_auth_user_id_key;
drop index public.account_requests_pending_phone_kind_idx;
alter table public.account_requests add constraint account_requests_user_activity_key unique(auth_user_id,activity_kind);
create unique index account_requests_pending_phone_activity_idx on public.account_requests(phone,activity_kind) where status='pending';
alter table public.account_requests add column workspace_id uuid references public.activity_workspaces(id) on delete restrict;
create index account_requests_workspace_idx on public.account_requests(workspace_id) where workspace_id is not null;

update public.account_requests request set workspace_id=(
 select workspace.id from public.activity_workspaces workspace
 join public.activity_memberships membership on membership.workspace_id=workspace.id
 where membership.user_id=request.auth_user_id and workspace.activity_kind=request.activity_kind
 order by (workspace.store_id is null) desc,workspace.created_at,workspace.id limit 1
) where request.status='approved';
-- Pending/rejected legacy applicants get a limited space, not an operational membership grant.
insert into public.activity_workspaces(id,activity_kind,name,status)
select request.id,request.activity_kind,coalesce(nullif(request.place_title,''),request.display_name),
 request.status::public.activity_workspace_status
from public.account_requests request where request.workspace_id is null;
update public.account_requests set workspace_id=id where workspace_id is null;
insert into public.activity_memberships(workspace_id,user_id,role)
select request.workspace_id,request.auth_user_id,'owner' from public.account_requests request
join auth.users u on u.id=request.auth_user_id
on conflict do nothing;

-- Compatibility for callers during the safe transition; a supplied activity cannot contradict its payload.
create function public.derive_account_request_activity() returns trigger
language plpgsql set search_path = '' as $$
declare v_kind public.activity_kind; v_category text;
begin
  if tg_op='UPDATE' then
    if old.auth_user_id<>new.auth_user_id or old.activity_kind is distinct from new.activity_kind then
      raise exception 'account_activity_identity_immutable' using errcode='22023';
    end if;
    -- Historical requests must remain rejectable even after a place is removed or recategorized.
    if old.kind=new.kind and old.place_mode is not distinct from new.place_mode
      and old.existing_place_id is not distinct from new.existing_place_id
      and old.place_category is not distinct from new.place_category then return new; end if;
  end if;
  v_category := new.place_category;
  if new.kind='merchant' and new.place_mode='existing' and new.existing_place_id is not null then
    select place.category into v_category from public.places place where place.id=new.existing_place_id;
    if v_category is null then raise exception 'existing_place_not_found' using errcode='22023'; end if;
  end if;
  v_kind := case when new.kind='driver' then 'driver'::public.activity_kind
    when v_category in ('restaurants','home_made') then 'restaurant'::public.activity_kind
    when v_category in ('crafts','services') then 'service'::public.activity_kind
    when v_category='real_estate' then 'real_estate'::public.activity_kind
    else 'store'::public.activity_kind end;
  if new.activity_kind is not null and new.activity_kind <> v_kind then
    raise exception 'account_activity_mismatch' using errcode='22023';
  end if;
  if tg_op='UPDATE' and (old.activity_kind<>v_kind or old.auth_user_id<>new.auth_user_id) then
    raise exception 'account_activity_identity_immutable' using errcode='22023';
  end if;
  new.activity_kind := v_kind;
  return new;
end;
$$;
create trigger account_requests_derive_activity before insert or update on public.account_requests
for each row execute function public.derive_account_request_activity();
revoke all on function public.derive_account_request_activity() from public,anon,authenticated;

create table public.account_activity_reviews (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.account_requests(id) on delete restrict,
  -- Historical rejected requests can reference identities removed by the old workflow.
  user_id uuid not null,
  from_status text,
  to_status text not null check(to_status in ('pending','approved','rejected')),
  reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index account_activity_reviews_request_idx on public.account_activity_reviews(request_id,created_at);
create index account_activity_reviews_user_idx on public.account_activity_reviews(user_id,created_at);
insert into public.account_activity_reviews(request_id,user_id,to_status,reason,reviewed_by,created_at)
select id,auth_user_id,status,rejection_reason,reviewed_by,coalesce(reviewed_at,created_at) from public.account_requests;

create function public.audit_account_activity_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.account_activity_reviews(request_id,user_id,to_status,reason,reviewed_by)
    values(new.id,new.auth_user_id,new.status,new.rejection_reason,new.reviewed_by);
  elsif old.status is distinct from new.status then
    insert into public.account_activity_reviews(request_id,user_id,from_status,to_status,reason,reviewed_by)
    values(new.id,new.auth_user_id,old.status,new.status,new.rejection_reason,new.reviewed_by);
  end if;
  return new;
end;
$$;
create trigger account_requests_review_history after insert or update on public.account_requests
for each row execute function public.audit_account_activity_review();
revoke all on function public.audit_account_activity_review() from public,anon,authenticated;

create table public.onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_kind public.activity_kind not null,
  step smallint not null default 1 check(step between 1 and 4),
  version integer not null default 1 check(version>0),
  status text not null default 'draft' check(status in ('draft','submitted')),
  data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object' and octet_length(data::text)<=24000),
  request_id uuid unique references public.account_requests(id) on delete restrict,
  materialized_product_id uuid unique references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,activity_kind),
  unique(id,user_id),
  check(status <> 'submitted' or request_id is not null)
);

-- Dedicated private namespace: existing legacy/catalog staging sweepers never own these objects.
-- Register only validated/transcoded images using a server-only storage client.
create table public.onboarding_media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references public.onboarding_drafts(id) on delete restrict,
  bucket text not null check(char_length(bucket) between 3 and 255),
  object_key text not null unique,
  content_type text not null check(content_type='image/webp'),
  byte_size integer not null check(byte_size between 32 and 3145728),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  width integer not null check(width between 1 and 10000),
  height integer not null check(height between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key(draft_id,owner_id) references public.onboarding_drafts(id,user_id) on delete restrict,
  check(object_key like 'onboarding/' || owner_id::text || '/' || draft_id::text || '/%'
    and object_key !~ '(^|/)\.\.(/|$)')
);
create index onboarding_media_assets_draft_idx on public.onboarding_media_assets(draft_id,owner_id);
create function public.guard_onboarding_media_registration() returns trigger language plpgsql set search_path='' as $$
declare v_draft public.onboarding_drafts;
begin
  -- Shares the draft row lock with submit/save, so a submitted snapshot cannot gain late uploads.
  select * into v_draft from public.onboarding_drafts where id=new.draft_id and user_id=new.owner_id for update;
  if v_draft.id is null or v_draft.status<>'draft' then
    raise exception 'onboarding_media_draft_unavailable' using errcode='42501';
  end if;
  if (select count(*) from public.onboarding_media_assets where draft_id=new.draft_id)>=30 then
    raise exception 'onboarding_media_limit' using errcode='54000';
  end if;
  return new;
end;
$$;
create trigger onboarding_media_registration before insert on public.onboarding_media_assets
for each row execute function public.guard_onboarding_media_registration();
revoke all on function public.guard_onboarding_media_registration() from public,anon,authenticated;
create table public.onboarding_draft_media (
  draft_id uuid not null references public.onboarding_drafts(id) on delete restrict,
  asset_id uuid not null unique references public.onboarding_media_assets(id) on delete restrict,
  position smallint not null check(position between 0 and 6),
  primary key(draft_id,position)
);

alter table public.activity_workspaces enable row level security;
alter table public.activity_memberships enable row level security;
alter table public.account_activity_reviews enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.onboarding_media_assets enable row level security;
alter table public.onboarding_draft_media enable row level security;
revoke all on public.activity_workspaces, public.activity_memberships, public.account_activity_reviews,
  public.onboarding_drafts,public.onboarding_media_assets,public.onboarding_draft_media from public,anon,authenticated;
grant select on public.activity_workspaces,public.activity_memberships,public.account_activity_reviews,public.onboarding_drafts to authenticated;
grant all on public.activity_workspaces,public.activity_memberships,public.account_activity_reviews,
  public.onboarding_drafts,public.onboarding_media_assets,public.onboarding_draft_media to service_role;
grant usage,select on sequence public.account_activity_reviews_id_seq to service_role;
create policy activity_memberships_read_own on public.activity_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy activity_workspaces_read_member on public.activity_workspaces for select to authenticated
 using(exists(select 1 from public.activity_memberships m where m.workspace_id=id and m.user_id=(select auth.uid()) and m.is_active));
create policy onboarding_drafts_read_own on public.onboarding_drafts for select to authenticated using(user_id=(select auth.uid()));
create policy account_activity_reviews_read_own on public.account_activity_reviews for select to authenticated using(user_id=(select auth.uid()));

-- Read-only, invoker functions naturally obey RLS; no sensitive storage keys in DTOs.
create function public.read_my_onboarding_drafts() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'userId',d.user_id,'activityKind',d.activity_kind,
 'step',d.step,'version',d.version,'status',d.status,'data',d.data,'updatedAt',d.updated_at) order by d.updated_at desc),'[]'::jsonb)
 from public.onboarding_drafts d where d.user_id=(select auth.uid());
$$;
create function public.list_my_activity_workspaces() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'activityKind',w.activity_kind,'name',w.name,
 'status',w.status,'membershipRole',m.role,'merchantId',w.merchant_id,'storeId',w.store_id,'driverProfileId',w.driver_profile_id,
 'canManage',w.status='approved' and m.is_active and m.role in ('owner','manager')
   and (w.merchant_id is not null or w.driver_profile_id is not null)) order by w.created_at,w.id),'[]'::jsonb)
 from public.activity_workspaces w join public.activity_memberships m on m.workspace_id=w.id
 where m.user_id=(select auth.uid()) and m.is_active;
$$;

-- Definer is necessary to expose only CAS mutation, never raw row updates or approval fields.
create function public.save_my_onboarding_draft(
 p_activity_kind public.activity_kind,p_step smallint,p_data jsonb,p_expected_version integer,p_draft_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_draft public.onboarding_drafts; v_media uuid[]; v_count integer;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if not exists(select 1 from auth.identities i where i.user_id=v_uid and i.provider='google') then
   raise exception 'google_identity_required' using errcode='42501';
 end if;
 if p_activity_kind is null or p_step is null or p_step not between 1 and 4 or p_expected_version is null
   or p_expected_version not between 0 and 2147483646 or p_data is null or jsonb_typeof(p_data)<>'object'
   or octet_length(p_data::text)>24000 then raise exception 'invalid_onboarding_draft' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in
   ('displayName','phone','whatsapp','name','description','address','placeMode','existingPlaceId','category','vehicleType','product','realEstate','mediaIds')) then
   raise exception 'invalid_onboarding_fields' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(p_data) f where f.key not in ('product','realEstate','mediaIds') and jsonb_typeof(f.value)<>'string')
   or (p_data ? 'product' and jsonb_typeof(p_data->'product')<>'object')
   or (p_data ? 'realEstate' and jsonb_typeof(p_data->'realEstate')<>'object')
   or (p_data ? 'mediaIds' and jsonb_typeof(p_data->'mediaIds')<>'array') then
   raise exception 'invalid_onboarding_fields' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each_text(p_data) f where f.key not in ('product','realEstate','mediaIds') and char_length(f.value)>
   case f.key when 'displayName' then 100 when 'phone' then 20 when 'whatsapp' then 20 when 'name' then 150
   when 'description' then 5000 when 'address' then 600 when 'placeMode' then 8 when 'existingPlaceId' then 36
   when 'category' then 80 when 'vehicleType' then 60 else 0 end)
   or (p_data ? 'placeMode' and p_data->>'placeMode' not in ('new','existing'))
   or (p_data ? 'existingPlaceId' and p_data->>'existingPlaceId'<>'' and
     p_data->>'existingPlaceId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
   raise exception 'invalid_onboarding_fields' using errcode='22023';
 end if;
 if p_data ? 'product' then
   if not (p_data->'product' ?& array['name','description','priceEgp']) or exists(
     select 1 from jsonb_each(p_data->'product') f where f.key not in ('name','description','priceEgp')
       or jsonb_typeof(f.value)<>'string' or char_length(f.value#>>'{}') >
         case f.key when 'name' then 150 when 'description' then 5000 else 20 end
   ) then raise exception 'invalid_onboarding_product' using errcode='22023'; end if;
 end if;
 if p_data ? 'realEstate' then
   if not (p_data->'realEstate' ?& array['offerType','propertyType','priceEgp']) or exists(
     select 1 from jsonb_each(p_data->'realEstate') f where f.key not in
       ('offerType','propertyType','priceEgp','rooms','bathrooms','areaSqm','floor','furnishing')
       or jsonb_typeof(f.value)<>'string' or char_length(f.value#>>'{}') >
         case when f.key in ('rooms','bathrooms','floor') then 10
           when f.key in ('propertyType','furnishing') then 30 else 20 end
   ) then raise exception 'invalid_onboarding_real_estate' using errcode='22023'; end if;
 end if;
 -- Serialize creation and saves for one user/activity, including separate browser tabs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text || ':' || p_activity_kind::text,0));
 select * into v_draft from public.onboarding_drafts d where d.user_id=v_uid and d.activity_kind=p_activity_kind for update;
 if v_draft.id is null then
   if p_expected_version<>0 or p_draft_id is not null then raise exception 'onboarding_version_conflict' using errcode='40001'; end if;
   insert into public.onboarding_drafts(user_id,activity_kind) values(v_uid,p_activity_kind) returning * into v_draft;
 else
   if v_draft.version<>p_expected_version or p_draft_id is distinct from v_draft.id then
     raise exception 'onboarding_version_conflict' using errcode='40001';
   end if;
   if v_draft.status<>'draft' then raise exception 'onboarding_already_submitted' using errcode='55000'; end if;
 end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_media from jsonb_array_elements_text(coalesce(p_data->'mediaIds','[]'::jsonb));
 if cardinality(v_media)>7 or (select count(distinct id) from unnest(v_media) id)<>cardinality(v_media) then
   raise exception 'invalid_onboarding_media' using errcode='22023';
 end if;
 perform a.id from public.onboarding_media_assets a where a.id=any(v_media) order by a.id for share;
 select count(*) into v_count from public.onboarding_media_assets a where a.id=any(v_media) and a.owner_id=v_uid and a.draft_id=v_draft.id;
 if v_count<>cardinality(v_media) then raise exception 'onboarding_media_access_denied' using errcode='42501'; end if;
 delete from public.onboarding_draft_media where draft_id=v_draft.id;
 insert into public.onboarding_draft_media(draft_id,asset_id,position)
 select v_draft.id,id,(position-1)::smallint from unnest(v_media) with ordinality media(id,position);
 update public.onboarding_drafts set data=p_data,step=p_step,version=case when p_expected_version=0 then 1 else version+1 end,
 updated_at=now() where id=v_draft.id returning * into v_draft;
 return jsonb_build_object('id',v_draft.id,'userId',v_draft.user_id,'activityKind',v_draft.activity_kind,'step',v_draft.step,
 'version',v_draft.version,'status',v_draft.status,'data',v_draft.data,'updatedAt',v_draft.updated_at);
end;
$$;
revoke all on function public.read_my_onboarding_drafts(),public.list_my_activity_workspaces(),
 public.save_my_onboarding_draft(public.activity_kind,smallint,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.read_my_onboarding_drafts(),public.list_my_activity_workspaces(),
 public.save_my_onboarding_draft(public.activity_kind,smallint,jsonb,integer,uuid) to authenticated;

commit;
