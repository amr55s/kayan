-- Kayan Hub secure delivery operations baseline.
-- Apply with the Supabase CLI after taking a production backup.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'merchant', 'driver');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.delivery_order_status as enum (
    'open', 'assigned', 'picked_up', 'delivered', 'unassigned', 'cancelled', 'issue'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 2 and 150),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  phone text not null unique check (phone ~ '^01[0125][0-9]{8}$'),
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  merchant_id uuid references public.merchants(id) on delete set null,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'merchant') = (merchant_id is not null))
);

create table if not exists public.merchant_branches (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  address text not null check (char_length(trim(address)) between 5 and 500),
  area text not null check (char_length(trim(area)) between 2 and 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists merchant_default_branch_idx
  on public.merchant_branches (merchant_id) where is_default;

create table if not exists public.driver_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  whatsapp text,
  is_available boolean not null default false,
  active_until timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_available and active_until is not null) or not is_available)
);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  merchant_id uuid not null references public.merchants(id),
  branch_id uuid not null references public.merchant_branches(id),
  created_by uuid not null references public.profiles(id),
  assigned_driver_id uuid references public.profiles(id),
  status public.delivery_order_status not null default 'open',
  recipient_name text not null check (char_length(trim(recipient_name)) between 2 and 120),
  recipient_phone text not null check (recipient_phone ~ '^01[0125][0-9]{8}$'),
  delivery_address text not null check (char_length(trim(delivery_address)) between 5 and 600),
  delivery_area text not null check (char_length(trim(delivery_area)) between 2 and 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  collection_amount numeric(12,2) check (collection_amount is null or collection_amount >= 0),
  delivery_fee numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  issue_reason text check (issue_reason is null or char_length(issue_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and expires_at > created_at) or status <> 'open'),
  check ((status <> 'picked_up' and status <> 'delivered') or picked_up_at is not null),
  check (status <> 'delivered' or delivered_at is not null)
);

create index if not exists delivery_orders_offer_idx
  on public.delivery_orders (status, expires_at) where status = 'open';
create index if not exists delivery_orders_driver_idx
  on public.delivery_orders (assigned_driver_id, status, updated_at desc);
create index if not exists delivery_orders_merchant_idx
  on public.delivery_orders (merchant_id, created_at desc);
create index if not exists delivery_orders_branch_idx
  on public.delivery_orders (branch_id, created_at desc);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.delivery_orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created', 'broadcast', 'claimed', 'released', 'picked_up', 'delivered', 'expired', 'cancelled', 'issue', 'reassigned')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.delivery_orders(id) on delete cascade,
  payload jsonb not null,
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists merchants_touch_updated_at on public.merchants;
create trigger merchants_touch_updated_at before update on public.merchants for each row execute procedure public.touch_updated_at();
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists branches_touch_updated_at on public.merchant_branches;
create trigger branches_touch_updated_at before update on public.merchant_branches for each row execute procedure public.touch_updated_at();
drop trigger if exists drivers_touch_updated_at on public.driver_profiles;
create trigger drivers_touch_updated_at before update on public.driver_profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists orders_touch_updated_at on public.delivery_orders;
create trigger orders_touch_updated_at before update on public.delivery_orders for each row execute procedure public.touch_updated_at();

create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid() and is_active limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function public.is_current_merchant_for(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'merchant' and merchant_id = p_merchant_id and is_active);
$$;

create or replace function public.is_current_active_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles p join public.driver_profiles d on d.profile_id = p.id
    where p.id = auth.uid() and p.role = 'driver' and p.is_active and d.is_available and d.active_until > now()
  );
$$;

-- Remove every legacy permissive policy before adding role-bound policies.
do $$ declare item record; begin
  for item in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', item.policyname, item.schemaname, item.tablename);
  end loop;
end $$;

alter table public.drivers enable row level security;
alter table public.places enable row level security;
alter table public.pending_requests enable row level security;
alter table public.feedback_requests enable row level security;
alter table public.merchants enable row level security;
alter table public.profiles enable row level security;
alter table public.merchant_branches enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.order_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_log enable row level security;

-- Directory media is publicly readable, but only authenticated administrators can write it.
insert into storage.buckets (id, name, public) values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = true;
drop policy if exists "Allow public uploads to listing-images" on storage.objects;
drop policy if exists "Allow public read from listing-images" on storage.objects;
drop policy if exists "Allow anon insert for listing-images" on storage.objects;
create policy "public reads directory media" on storage.objects for select using (bucket_id = 'listing-images');
create policy "admins write directory media" on storage.objects for insert with check (bucket_id = 'listing-images' and public.is_admin());
create policy "admins update directory media" on storage.objects for update using (bucket_id = 'listing-images' and public.is_admin()) with check (bucket_id = 'listing-images' and public.is_admin());
create policy "admins delete directory media" on storage.objects for delete using (bucket_id = 'listing-images' and public.is_admin());

create policy "public can read published places" on public.places for select using (true);
create policy "admins manage legacy directory" on public.places for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage moderation" on public.pending_requests for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage feedback" on public.feedback_requests for all using (public.is_admin()) with check (public.is_admin());
create policy "admins see legacy drivers" on public.drivers for all using (public.is_admin()) with check (public.is_admin());

create policy "profiles are private" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "merchants see active driver identities" on public.profiles for select using (
  role = 'driver' and is_active and (public.current_profile()).role = 'merchant'
);
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage merchants" on public.merchants for all using (public.is_admin()) with check (public.is_admin());
create policy "merchants read own merchant" on public.merchants for select using (public.is_current_merchant_for(id));
create policy "admins manage branches" on public.merchant_branches for all using (public.is_admin()) with check (public.is_admin());
create policy "merchants manage own branches" on public.merchant_branches for all using (public.is_current_merchant_for(merchant_id)) with check (public.is_current_merchant_for(merchant_id));
create policy "admins manage driver profiles" on public.driver_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "drivers read own profile" on public.driver_profiles for select using (profile_id = auth.uid());
create policy "merchants see available drivers" on public.driver_profiles for select using (public.is_current_merchant_for((select merchant_id from public.profiles where id = auth.uid())) and is_available and active_until > now());

create policy "admins manage orders" on public.delivery_orders for all using (public.is_admin()) with check (public.is_admin());
create policy "merchants manage own orders" on public.delivery_orders for all using (public.is_current_merchant_for(merchant_id)) with check (public.is_current_merchant_for(merchant_id));
create policy "drivers see current eligible orders" on public.delivery_orders for select using (
  public.is_current_active_driver() and (
    (status = 'open' and expires_at > now() and (assigned_driver_id is null or assigned_driver_id = auth.uid())) or
    (assigned_driver_id = auth.uid() and status in ('assigned', 'picked_up', 'issue'))
  )
);
create policy "admins read events" on public.order_events for select using (public.is_admin());
create policy "merchants read own events" on public.order_events for select using (exists(select 1 from public.delivery_orders o where o.id = order_id and public.is_current_merchant_for(o.merchant_id)));
create policy "drivers read own active events" on public.order_events for select using (exists(select 1 from public.delivery_orders o where o.id = order_id and o.assigned_driver_id = auth.uid() and o.status in ('assigned', 'picked_up', 'issue')));
create policy "users manage own push subscriptions" on public.push_subscriptions for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "admins read audit log" on public.audit_log for select using (public.is_admin());

create or replace function public.create_delivery_order(
  p_branch_id uuid, p_recipient_name text, p_recipient_phone text, p_delivery_address text,
  p_delivery_area text, p_notes text default null, p_collection_amount numeric default null,
  p_delivery_fee numeric default null, p_direct_driver_id uuid default null
) returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles; v_branch public.merchant_branches; v_order public.delivery_orders;
begin
  select * into v_profile from public.current_profile();
  if v_profile is null or v_profile.role <> 'merchant' then raise exception 'merchant_access_required'; end if;
  select * into v_branch from public.merchant_branches where id = p_branch_id and merchant_id = v_profile.merchant_id and is_active;
  if v_branch is null then raise exception 'invalid_branch'; end if;
  if p_direct_driver_id is not null and not exists(select 1 from public.profiles p join public.driver_profiles d on d.profile_id = p.id where p.id = p_direct_driver_id and p.role = 'driver' and p.is_active and d.is_available and d.active_until > now()) then
    raise exception 'driver_unavailable';
  end if;
  insert into public.delivery_orders(merchant_id, branch_id, created_by, assigned_driver_id, recipient_name, recipient_phone, delivery_address, delivery_area, notes, collection_amount, delivery_fee)
  values(v_profile.merchant_id, p_branch_id, v_profile.id, p_direct_driver_id, trim(p_recipient_name), regexp_replace(p_recipient_phone, '[^0-9]', '', 'g'), trim(p_delivery_address), trim(p_delivery_area), nullif(trim(coalesce(p_notes, '')), ''), p_collection_amount, p_delivery_fee)
  returning * into v_order;
  insert into public.order_events(order_id, actor_id, event_type, metadata) values(v_order.id, v_profile.id, 'created', jsonb_build_object('direct_driver_id', p_direct_driver_id));
  if p_direct_driver_id is not null then
    insert into public.notification_outbox(event_key, profile_id, order_id, payload) values('order:' || v_order.id || ':direct', p_direct_driver_id, v_order.id, jsonb_build_object('type', 'direct_offer', 'order_code', v_order.public_code));
  end if;
  return v_order;
end $$;

create or replace function public.claim_delivery_order(p_order_id uuid)
returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare v_order public.delivery_orders;
begin
  if not public.is_current_active_driver() then raise exception 'driver_not_available'; end if;
  select * into v_order from public.delivery_orders where id = p_order_id for update;
  if v_order is null or v_order.status <> 'open' or v_order.expires_at <= now() then raise exception 'offer_unavailable'; end if;
  if v_order.assigned_driver_id is not null and v_order.assigned_driver_id <> auth.uid() then raise exception 'private_offer'; end if;
  update public.delivery_orders set status = 'assigned', assigned_driver_id = auth.uid(), assigned_at = now() where id = p_order_id returning * into v_order;
  insert into public.order_events(order_id, actor_id, event_type) values(v_order.id, auth.uid(), 'claimed');
  insert into public.notification_outbox(event_key, profile_id, order_id, payload)
    select 'order:' || v_order.id || ':claimed:' || id, id, v_order.id, jsonb_build_object('type', 'order_claimed', 'order_code', v_order.public_code)
    from public.profiles where merchant_id = v_order.merchant_id and role = 'merchant' and is_active;
  return v_order;
end $$;

create or replace function public.set_delivery_order_status(p_order_id uuid, p_next public.delivery_order_status, p_reason text default null)
returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare v_order public.delivery_orders; v_profile public.profiles; v_event text;
begin
  select * into v_profile from public.current_profile();
  select * into v_order from public.delivery_orders where id = p_order_id for update;
  if v_order is null then raise exception 'order_not_found'; end if;
  if v_profile.role = 'driver' and v_order.assigned_driver_id <> v_profile.id then raise exception 'not_assigned_driver'; end if;
  if v_profile.role = 'merchant' and v_order.merchant_id <> v_profile.merchant_id then raise exception 'not_order_merchant'; end if;
  if p_next = 'picked_up' and v_order.status = 'assigned' and (v_profile.role = 'driver' or public.is_admin()) then
    update public.delivery_orders set status = p_next, picked_up_at = now() where id = p_order_id returning * into v_order; v_event := 'picked_up';
  elsif p_next = 'delivered' and v_order.status = 'picked_up' and (v_profile.role = 'driver' or public.is_admin()) then
    update public.delivery_orders set status = p_next, delivered_at = now() where id = p_order_id returning * into v_order; v_event := 'delivered';
  elsif p_next = 'open' and v_order.status = 'assigned' and v_profile.role = 'driver' then
    update public.delivery_orders set status = 'open', assigned_driver_id = null, assigned_at = null, expires_at = now() + interval '10 minutes', cancellation_reason = null where id = p_order_id returning * into v_order; v_event := 'released';
  elsif p_next = 'cancelled' and v_order.status in ('open', 'assigned', 'unassigned') and (v_profile.role in ('merchant', 'admin')) then
    update public.delivery_orders set status = p_next, cancelled_at = now(), cancellation_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_order_id returning * into v_order; v_event := 'cancelled';
  elsif p_next = 'issue' and v_order.status in ('assigned', 'picked_up') and (v_profile.role in ('merchant', 'admin')) then
    update public.delivery_orders set status = p_next, issue_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_order_id returning * into v_order; v_event := 'issue';
  else raise exception 'invalid_status_transition'; end if;
  insert into public.order_events(order_id, actor_id, event_type, metadata) values(v_order.id, v_profile.id, v_event, jsonb_build_object('reason', p_reason));
  return v_order;
end $$;

create or replace function public.rebroadcast_delivery_order(p_order_id uuid)
returns public.delivery_orders
language plpgsql security definer set search_path = public as $$
declare v_order public.delivery_orders;
begin
  select * into v_order from public.delivery_orders where id = p_order_id for update;
  if v_order is null or v_order.status <> 'open' or not (public.is_admin() or public.is_current_merchant_for(v_order.merchant_id)) then raise exception 'cannot_rebroadcast'; end if;
  update public.delivery_orders set assigned_driver_id = null, expires_at = now() + interval '10 minutes' where id = p_order_id returning * into v_order;
  insert into public.order_events(order_id, actor_id, event_type) values(v_order.id, auth.uid(), 'broadcast');
  return v_order;
end $$;

create or replace function public.renew_driver_availability()
returns public.driver_profiles
language plpgsql security definer set search_path = public as $$
declare v_driver public.driver_profiles;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and role = 'driver' and is_active) then raise exception 'driver_access_required'; end if;
  update public.driver_profiles set is_available = true, active_until = now() + interval '2 hours', last_seen_at = now() where profile_id = auth.uid() returning * into v_driver;
  if v_driver is null then raise exception 'driver_profile_missing'; end if;
  return v_driver;
end $$;

create or replace function public.expire_delivery_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with expired as (
    update public.delivery_orders set status = 'unassigned' where status = 'open' and expires_at <= now() returning id
  ), logged as (
    insert into public.order_events(order_id, event_type) select id, 'expired' from expired returning order_id
  ) select count(*) into v_count from logged;
  return v_count;
end $$;

revoke all on function public.create_delivery_order(uuid, text, text, text, text, text, numeric, numeric, uuid) from public;
revoke all on function public.claim_delivery_order(uuid) from public;
revoke all on function public.set_delivery_order_status(uuid, public.delivery_order_status, text) from public;
revoke all on function public.rebroadcast_delivery_order(uuid) from public;
revoke all on function public.renew_driver_availability() from public;
grant execute on function public.create_delivery_order(uuid, text, text, text, text, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.claim_delivery_order(uuid) to authenticated;
grant execute on function public.set_delivery_order_status(uuid, public.delivery_order_status, text) to authenticated;
grant execute on function public.rebroadcast_delivery_order(uuid) to authenticated;
grant execute on function public.renew_driver_availability() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.delivery_orders;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.driver_profiles;
exception when duplicate_object then null;
end $$;

-- Configure this in the Supabase SQL editor once pg_cron is available:
-- select cron.schedule('expire-kayan-delivery-offers', '* * * * *', $$select public.expire_delivery_offers();$$);
