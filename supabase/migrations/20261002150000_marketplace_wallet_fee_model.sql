begin;

-- Prepaid wallet business model.
--
-- The platform never touches order cash. A merchant pays a small fee the moment
-- they accept an order, from a balance they topped up in advance; the customer's
-- contact details are only released on acceptance, so the fee is collected at the
-- point the platform hands over its value. Every new table is deny-all under RLS
-- and reachable only through the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table public.marketplace_fee_settings (
  id boolean primary key default true check (id),
  order_fee_fixed_piastres bigint not null default 200
    check (order_fee_fixed_piastres between 0 and 100000),
  order_fee_percent_bps integer not null default 200
    check (order_fee_percent_bps between 0 and 2000),
  order_fee_max_piastres bigint
    check (order_fee_max_piastres is null or order_fee_max_piastres between 0 and 1000000),
  free_orders_per_merchant integer not null default 30
    check (free_orders_per_merchant between 0 and 1000),
  minimum_topup_piastres bigint not null default 5000
    check (minimum_topup_piastres between 100 and 10000000),
  payment_recipient_name text
    check (payment_recipient_name is null or char_length(payment_recipient_name) between 2 and 120),
  payment_instapay_handle text
    check (payment_instapay_handle is null or char_length(payment_instapay_handle) between 3 and 120),
  payment_phone text
    check (payment_phone is null or payment_phone ~ '^01[0125][0-9]{8}$'),
  platform_delivery_enabled boolean not null default false,
  legacy_commission_enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default pg_catalog.now()
);
insert into public.marketplace_fee_settings (id) values (true);

create table public.marketplace_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  duration_days integer not null check (duration_days between 1 and 366),
  price_piastres bigint not null check (price_piastres between 100 and 100000000),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
insert into public.marketplace_subscription_plans (name_ar, duration_days, price_piastres, is_active, sort_order)
values ('اشتراك شهري — طلبات بلا رسوم', 30, 25000, false, 10);

-- ---------------------------------------------------------------------------
-- Wallets, ledger and top-up requests
-- ---------------------------------------------------------------------------

create table public.merchant_wallets (
  merchant_id uuid primary key references public.merchants (id) on delete restrict,
  balance_piastres bigint not null default 0 check (balance_piastres >= 0),
  free_orders_used integer not null default 0 check (free_orders_used >= 0),
  subscription_plan_id uuid references public.marketplace_subscription_plans (id),
  subscription_ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create index merchant_wallets_subscription_plan_fk_idx
  on public.merchant_wallets (subscription_plan_id);

create table public.merchant_wallet_topup_requests (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  requested_by uuid not null,
  requester_name_snapshot text,
  amount_piastres bigint not null check (amount_piastres between 100 and 10000000),
  payer_name text not null check (char_length(payer_name) between 2 and 120),
  payer_phone text not null check (payer_phone ~ '^01[0125][0-9]{8}$'),
  transfer_reference text check (transfer_reference is null or char_length(transfer_reference) between 1 and 80),
  proof_path text not null check (char_length(proof_path) between 40 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text check (review_notes is null or char_length(review_notes) <= 1000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (merchant_id, idempotency_key),
  check ((status = 'pending') = (reviewed_at is null))
);
create index merchant_wallet_topup_requests_queue_idx
  on public.merchant_wallet_topup_requests (status, created_at desc);
create index merchant_wallet_topup_requests_merchant_idx
  on public.merchant_wallet_topup_requests (merchant_id, created_at desc);
create index merchant_wallet_topup_requests_payer_phone_idx
  on public.merchant_wallet_topup_requests (payer_phone);

create table public.merchant_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_wallets (merchant_id) on delete restrict,
  entry_type text not null check (entry_type in (
    'topup', 'order_fee', 'free_order', 'subscription_order', 'subscription_purchase', 'adjustment'
  )),
  amount_piastres bigint not null,
  balance_after_piastres bigint not null check (balance_after_piastres >= 0),
  -- Deliberately not a foreign key: the ledger must outlive order retention.
  order_id uuid,
  order_code_snapshot text,
  topup_request_id uuid references public.merchant_wallet_topup_requests (id),
  plan_id uuid references public.marketplace_subscription_plans (id),
  actor_user_id uuid,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 16 and 128),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default pg_catalog.now(),
  check (
    (entry_type in ('topup') and amount_piastres > 0)
    or (entry_type in ('order_fee', 'subscription_purchase') and amount_piastres <= 0)
    or (entry_type in ('free_order', 'subscription_order') and amount_piastres = 0)
    or (entry_type = 'adjustment' and amount_piastres <> 0)
  )
);
create index merchant_wallet_entries_merchant_idx
  on public.merchant_wallet_entries (merchant_id, created_at desc);
create unique index merchant_wallet_entries_one_charge_per_order_idx
  on public.merchant_wallet_entries (order_id)
  where entry_type in ('order_fee', 'free_order', 'subscription_order');
create unique index merchant_wallet_entries_one_credit_per_topup_idx
  on public.merchant_wallet_entries (topup_request_id) where entry_type = 'topup';
create unique index merchant_wallet_entries_idempotency_idx
  on public.merchant_wallet_entries (merchant_id, idempotency_key) where idempotency_key is not null;
create index merchant_wallet_entries_plan_fk_idx on public.merchant_wallet_entries (plan_id);

-- Free orders are counted per contact fingerprint as well as per merchant, so a
-- merchant who re-registers under a new account does not get a second allowance.
create table public.marketplace_free_order_claims (
  fingerprint text primary key check (fingerprint ~ '^phone:1[0125][0-9]{8}$'),
  free_orders_used integer not null default 0 check (free_orders_used >= 0),
  first_merchant_id uuid not null,
  last_merchant_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

-- The number a customer may call once the store has accepted their order.
create table public.store_contacts (
  store_id uuid primary key references public.stores (id) on delete cascade,
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^01[0125][0-9]{8}$'),
  updated_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.marketplace_fee_settings enable row level security;
alter table public.marketplace_subscription_plans enable row level security;
alter table public.merchant_wallets enable row level security;
alter table public.merchant_wallet_topup_requests enable row level security;
alter table public.merchant_wallet_entries enable row level security;
alter table public.marketplace_free_order_claims enable row level security;
alter table public.store_contacts enable row level security;

revoke all on table
  public.marketplace_fee_settings,
  public.marketplace_subscription_plans,
  public.merchant_wallets,
  public.merchant_wallet_topup_requests,
  public.merchant_wallet_entries,
  public.marketplace_free_order_claims,
  public.store_contacts
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function public.normalize_egypt_mobile(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.right(pg_catalog.regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), 10) ~ '^1[0125][0-9]{8}$'
      then pg_catalog.right(pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g'), 10)
    else null
  end;
$$;

create or replace function public.merchant_contact_fingerprints(p_merchant_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with merchant_users as (
    select membership.user_id from public.merchant_memberships as membership
    where membership.merchant_id = p_merchant_id
    union
    select membership.user_id from public.store_memberships as membership
    join public.stores as store on store.id = membership.store_id
    where store.merchant_id = p_merchant_id
    union
    select membership.user_id from public.activity_memberships as membership
    join public.activity_workspaces as workspace on workspace.id = membership.workspace_id
    where workspace.merchant_id = p_merchant_id
    union
    select profile.id from public.profiles as profile where profile.merchant_id = p_merchant_id
  ), phones as (
    select profile.phone as value from public.profiles as profile
    where profile.id in (select user_id from merchant_users)
    union all
    select request.phone from public.account_requests as request
    where request.auth_user_id in (select user_id from merchant_users)
    union all
    select request.whatsapp from public.account_requests as request
    where request.auth_user_id in (select user_id from merchant_users)
    union all
    select request.place_whatsapp from public.account_requests as request
    where request.auth_user_id in (select user_id from merchant_users)
    union all
    select contact.phone from public.store_contacts as contact
    join public.stores as store on store.id = contact.store_id
    where store.merchant_id = p_merchant_id
    union all
    select contact.whatsapp from public.store_contacts as contact
    join public.stores as store on store.id = contact.store_id
    where store.merchant_id = p_merchant_id
    union all
    select topup.payer_phone from public.merchant_wallet_topup_requests as topup
    where topup.merchant_id = p_merchant_id
  )
  select coalesce(pg_catalog.array_agg(distinct 'phone:' || public.normalize_egypt_mobile(phones.value)), '{}'::text[])
  from phones
  where public.normalize_egypt_mobile(phones.value) is not null;
$$;

create or replace function public.merchant_free_orders_used(p_merchant_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    coalesce((select wallet.free_orders_used from public.merchant_wallets as wallet
      where wallet.merchant_id = p_merchant_id), 0),
    coalesce((select pg_catalog.max(claim.free_orders_used)
      from public.marketplace_free_order_claims as claim
      where claim.fingerprint = any (public.merchant_contact_fingerprints(p_merchant_id))), 0)
  );
$$;

create or replace function public.marketplace_order_fee_piastres(p_basis_piastres bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    settings.order_fee_fixed_piastres
      + pg_catalog.round(greatest(p_basis_piastres, 0)::numeric * settings.order_fee_percent_bps / 10000)::bigint,
    coalesce(settings.order_fee_max_piastres, 9223372036854775807)
  )
  from public.marketplace_fee_settings as settings;
$$;

-- An order is "accepted" once the store has confirmed it. Before that the
-- store sees what was ordered and where it is going, but not who ordered it.
create or replace function public.marketplace_order_is_accepted(
  p_status public.marketplace_order_status,
  p_confirmed_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status <> 'pending_confirmation'
    and not (p_status in ('rejected', 'cancelled') and p_confirmed_at is null);
$$;

-- ---------------------------------------------------------------------------
-- Charging on acceptance
-- ---------------------------------------------------------------------------

create or replace function public.charge_marketplace_order_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_wallet public.merchant_wallets;
  v_settings public.marketplace_fee_settings;
  v_fee bigint;
  v_free_used integer;
  v_fingerprint text;
begin
  if not (old.status = 'pending_confirmation' and new.status = 'confirmed') then
    return new;
  end if;
  if new.confirmed_at is null then new.confirmed_at := pg_catalog.now(); end if;

  select store.merchant_id into v_merchant_id from public.stores as store where store.id = new.store_id;
  if v_merchant_id is null then
    raise exception 'wallet_merchant_not_found' using errcode = 'P0002';
  end if;
  insert into public.merchant_wallets (merchant_id) values (v_merchant_id)
  on conflict (merchant_id) do nothing;
  select * into v_wallet from public.merchant_wallets where merchant_id = v_merchant_id for update;
  if exists (
    select 1 from public.merchant_wallet_entries as entry
    where entry.order_id = new.id and entry.entry_type in ('order_fee', 'free_order', 'subscription_order')
  ) then
    return new;
  end if;
  select * into v_settings from public.marketplace_fee_settings;

  if v_wallet.subscription_ends_at is not null and v_wallet.subscription_ends_at > pg_catalog.now() then
    insert into public.merchant_wallet_entries (
      merchant_id, entry_type, amount_piastres, balance_after_piastres, order_id, order_code_snapshot, plan_id
    ) values (
      v_merchant_id, 'subscription_order', 0, v_wallet.balance_piastres, new.id, new.public_code,
      v_wallet.subscription_plan_id
    );
    return new;
  end if;

  v_free_used := public.merchant_free_orders_used(v_merchant_id);
  if v_free_used < v_settings.free_orders_per_merchant then
    update public.merchant_wallets
    set free_orders_used = v_free_used + 1, updated_at = pg_catalog.now()
    where merchant_id = v_merchant_id;
    foreach v_fingerprint in array public.merchant_contact_fingerprints(v_merchant_id) loop
      insert into public.marketplace_free_order_claims (
        fingerprint, free_orders_used, first_merchant_id, last_merchant_id
      ) values (v_fingerprint, v_free_used + 1, v_merchant_id, v_merchant_id)
      on conflict (fingerprint) do update set
        free_orders_used = greatest(public.marketplace_free_order_claims.free_orders_used, excluded.free_orders_used),
        last_merchant_id = excluded.last_merchant_id,
        updated_at = pg_catalog.now();
    end loop;
    insert into public.merchant_wallet_entries (
      merchant_id, entry_type, amount_piastres, balance_after_piastres, order_id, order_code_snapshot
    ) values (v_merchant_id, 'free_order', 0, v_wallet.balance_piastres, new.id, new.public_code);
    return new;
  end if;

  v_fee := public.marketplace_order_fee_piastres(new.subtotal - new.merchant_discount_total);
  if v_fee > v_wallet.balance_piastres then
    raise exception 'wallet_balance_insufficient' using errcode = 'P0001';
  end if;
  update public.merchant_wallets
  set balance_piastres = balance_piastres - v_fee, updated_at = pg_catalog.now()
  where merchant_id = v_merchant_id;
  insert into public.merchant_wallet_entries (
    merchant_id, entry_type, amount_piastres, balance_after_piastres, order_id, order_code_snapshot
  ) values (
    v_merchant_id, 'order_fee', -v_fee, v_wallet.balance_piastres - v_fee, new.id, new.public_code
  );
  return new;
end;
$$;

create trigger marketplace_orders_charge_fee
before update of status on public.marketplace_orders
for each row execute function public.charge_marketplace_order_fee();

-- The 7% post-delivery commission is replaced by the acceptance fee.
create or replace function public.skip_legacy_commission_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select settings.legacy_commission_enabled from public.marketplace_fee_settings as settings) then
    return new;
  end if;
  return null;
end;
$$;

create trigger commission_ledger_skip_when_wallet_model
before insert on public.commission_ledger
for each row execute function public.skip_legacy_commission_entry();

-- Stores arrange their own delivery; platform couriers are off until enabled.
create or replace function public.reject_platform_delivery_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_mode = 'platform' and new.is_active
     and not (select settings.platform_delivery_enabled from public.marketplace_fee_settings as settings) then
    raise exception 'platform_delivery_unavailable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger store_delivery_zones_reject_platform_mode
before insert or update of delivery_mode, is_active on public.store_delivery_zones
for each row execute function public.reject_platform_delivery_mode();

create trigger branch_delivery_zones_reject_platform_mode
before insert or update of delivery_mode, is_active on public.branch_delivery_zones
for each row execute function public.reject_platform_delivery_mode();

alter table public.stores alter column delivery_mode set default 'self';

create or replace function public.force_self_delivery_modes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select settings.platform_delivery_enabled from public.marketplace_fee_settings as settings) then
    return new;
  end if;
  if tg_table_name = 'stores' then
    new.delivery_mode := 'self';
  else
    new.delivery_modes := array['self']::public.marketplace_delivery_mode[];
  end if;
  return new;
end;
$$;

create trigger stores_force_self_delivery
before insert or update of delivery_mode on public.stores
for each row execute function public.force_self_delivery_modes();

create trigger store_branches_force_self_delivery
before insert or update of delivery_modes on public.store_branches
for each row execute function public.force_self_delivery_modes();

-- ---------------------------------------------------------------------------
-- Customer details stay private until the store accepts
-- ---------------------------------------------------------------------------

drop policy marketplace_orders_read_participant on public.marketplace_orders;
create policy marketplace_orders_read_participant on public.marketplace_orders
for select to authenticated
using (
  public.can_read_marketplace_order(id, store_id, customer_id)
  and (
    public.marketplace_order_is_accepted(status, confirmed_at)
    or public.is_marketplace_admin()
    or exists (
      select 1 from public.marketplace_customers as customer
      where customer.id = marketplace_orders.customer_id
        and customer.auth_user_id = (select auth.uid()) and customer.is_active
    )
  )
);

alter function public.get_my_marketplace_order(uuid) rename to get_my_marketplace_order_base_150000;
revoke all on function public.get_my_marketplace_order_base_150000(uuid) from public, anon, authenticated;

create or replace function public.get_my_marketplace_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_order public.marketplace_orders;
  v_is_customer boolean;
  v_is_admin boolean;
  v_accepted boolean;
  v_zone_name text;
begin
  v_result := public.get_my_marketplace_order_base_150000(p_order_id);
  select * into v_order from public.marketplace_orders where id = p_order_id;
  select exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = v_order.customer_id
      and customer.auth_user_id = (select auth.uid()) and customer.is_active
  ) into v_is_customer;
  v_is_admin := public.is_marketplace_admin();
  v_accepted := public.marketplace_order_is_accepted(v_order.status, v_order.confirmed_at);
  select zone.name_ar into v_zone_name from public.delivery_zones as zone where zone.id = v_order.delivery_zone_id;
  v_result := v_result || pg_catalog.jsonb_build_object('delivery_zone_name', v_zone_name, 'accepted', v_accepted);

  if not v_accepted and not v_is_customer and not v_is_admin then
    v_result := v_result || pg_catalog.jsonb_build_object(
      'address', pg_catalog.jsonb_build_object('redacted', true),
      'recipient', null,
      'delivery_notes', null
    );
  end if;

  if v_accepted and (v_is_customer or v_is_admin) then
    v_result := v_result || pg_catalog.jsonb_build_object('store_contact', (
      select pg_catalog.jsonb_build_object('phone', contact.phone, 'whatsapp', contact.whatsapp)
      from public.store_contacts as contact where contact.store_id = v_order.store_id
    ));
  end if;

  if not v_is_customer or v_is_admin then
    v_result := v_result || pg_catalog.jsonb_build_object(
      'platform_fee', (
        select pg_catalog.jsonb_build_object('type', entry.entry_type, 'amount_piastres', -entry.amount_piastres)
        from public.merchant_wallet_entries as entry
        where entry.order_id = v_order.id
          and entry.entry_type in ('order_fee', 'free_order', 'subscription_order')
      ),
      'platform_fee_quote', case when v_order.status = 'pending_confirmation' then (
        select pg_catalog.jsonb_build_object(
          'fee_piastres', public.marketplace_order_fee_piastres(v_order.subtotal - v_order.merchant_discount_total),
          'free_orders_remaining', greatest(settings.free_orders_per_merchant
            - public.merchant_free_orders_used(store.merchant_id), 0),
          'subscription_active', coalesce(wallet.subscription_ends_at > pg_catalog.now(), false),
          'balance_piastres', coalesce(wallet.balance_piastres, 0)
        )
        from public.stores as store
        cross join public.marketplace_fee_settings as settings
        left join public.merchant_wallets as wallet on wallet.merchant_id = store.merchant_id
        where store.id = v_order.store_id
      ) else null end
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_my_marketplace_order(uuid) from public, anon;
grant execute on function public.get_my_marketplace_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Store contact
-- ---------------------------------------------------------------------------

create or replace function public.get_my_store_contact(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not public.can_fulfill_store(p_store_id) then
    raise exception 'store_access_required' using errcode = '42501';
  end if;
  return (
    select pg_catalog.jsonb_build_object('phone', contact.phone, 'whatsapp', contact.whatsapp)
    from public.store_contacts as contact where contact.store_id = p_store_id
  );
end;
$$;

create or replace function public.save_my_store_contact(p_store_id uuid, p_phone text, p_whatsapp text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := '0' || public.normalize_egypt_mobile(p_phone);
  v_whatsapp text := case when nullif(pg_catalog.btrim(coalesce(p_whatsapp, '')), '') is null then null
    else '0' || public.normalize_egypt_mobile(p_whatsapp) end;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not public.can_manage_store(p_store_id) then
    raise exception 'store_access_required' using errcode = '42501';
  end if;
  if v_phone is null or (p_whatsapp is not null and pg_catalog.btrim(p_whatsapp) <> '' and v_whatsapp is null) then
    raise exception 'invalid_store_contact' using errcode = '22023';
  end if;
  insert into public.store_contacts (store_id, phone, whatsapp, updated_by)
  values (p_store_id, v_phone, v_whatsapp, (select auth.uid()))
  on conflict (store_id) do update set
    phone = excluded.phone, whatsapp = excluded.whatsapp,
    updated_by = excluded.updated_by, updated_at = pg_catalog.now();
  return pg_catalog.jsonb_build_object('phone', v_phone, 'whatsapp', v_whatsapp);
end;
$$;

-- ---------------------------------------------------------------------------
-- Merchant wallet
-- ---------------------------------------------------------------------------

create or replace function public.get_my_merchant_wallet(p_merchant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := p_merchant_id;
  v_settings public.marketplace_fee_settings;
  v_wallet public.merchant_wallets;
  v_free_used integer;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if v_merchant_id is null then
    select merchant.id into v_merchant_id from public.merchants as merchant
    where merchant.is_active and public.can_manage_merchant(merchant.id)
    order by merchant.display_name, merchant.id limit 1;
  end if;
  if v_merchant_id is null or not public.can_manage_merchant(v_merchant_id) then
    raise exception 'wallet_access_required' using errcode = '42501';
  end if;
  select * into v_settings from public.marketplace_fee_settings;
  select * into v_wallet from public.merchant_wallets where merchant_id = v_merchant_id;
  v_free_used := public.merchant_free_orders_used(v_merchant_id);
  return pg_catalog.jsonb_build_object(
    'merchant_id', v_merchant_id,
    'merchant_name', (select merchant.display_name from public.merchants as merchant where merchant.id = v_merchant_id),
    'balance_piastres', coalesce(v_wallet.balance_piastres, 0),
    'free_orders_total', v_settings.free_orders_per_merchant,
    'free_orders_used', least(v_free_used, v_settings.free_orders_per_merchant),
    'free_orders_remaining', greatest(v_settings.free_orders_per_merchant - v_free_used, 0),
    'subscription', case when v_wallet.subscription_ends_at > pg_catalog.now() then pg_catalog.jsonb_build_object(
      'plan_name', (select plan.name_ar from public.marketplace_subscription_plans as plan
        where plan.id = v_wallet.subscription_plan_id),
      'ends_at', v_wallet.subscription_ends_at
    ) else null end,
    'fee', pg_catalog.jsonb_build_object(
      'fixed_piastres', v_settings.order_fee_fixed_piastres,
      'percent_bps', v_settings.order_fee_percent_bps,
      'max_piastres', v_settings.order_fee_max_piastres,
      'minimum_topup_piastres', v_settings.minimum_topup_piastres
    ),
    'payment', pg_catalog.jsonb_build_object(
      'recipient_name', v_settings.payment_recipient_name,
      'instapay_handle', v_settings.payment_instapay_handle,
      'phone', v_settings.payment_phone
    ),
    'plans', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', plan.id, 'name', plan.name_ar, 'duration_days', plan.duration_days,
        'price_piastres', plan.price_piastres
      ) order by plan.sort_order, plan.price_piastres)
      from public.marketplace_subscription_plans as plan where plan.is_active
    ), '[]'::jsonb),
    'entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.created_at desc)
      from (
        select entry.id, entry.entry_type as type, entry.amount_piastres, entry.balance_after_piastres,
          entry.order_id, entry.order_code_snapshot as order_code, entry.note, entry.created_at
        from public.merchant_wallet_entries as entry
        where entry.merchant_id = v_merchant_id
        order by entry.created_at desc limit 50
      ) as page
    ), '[]'::jsonb),
    'topups', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.created_at desc)
      from (
        select request.id, request.public_code, request.amount_piastres, request.payer_name,
          request.status, request.review_notes, request.created_at, request.reviewed_at
        from public.merchant_wallet_topup_requests as request
        where request.merchant_id = v_merchant_id
        order by request.created_at desc limit 20
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_my_wallet_topup_request(
  p_merchant_id uuid,
  p_amount_piastres bigint,
  p_payer_name text,
  p_payer_phone text,
  p_transfer_reference text,
  p_proof_path text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_settings public.marketplace_fee_settings;
  v_request public.merchant_wallet_topup_requests;
  v_phone text := '0' || public.normalize_egypt_mobile(p_payer_phone);
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_merchant_id is null or not public.can_manage_merchant(p_merchant_id) then
    raise exception 'wallet_access_required' using errcode = '42501';
  end if;
  select * into v_request from public.merchant_wallet_topup_requests
  where merchant_id = p_merchant_id and idempotency_key = p_idempotency_key;
  if v_request.id is not null then
    return pg_catalog.jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code, 'status', v_request.status);
  end if;
  select * into v_settings from public.marketplace_fee_settings;
  if p_amount_piastres is null or p_amount_piastres < v_settings.minimum_topup_piastres
     or p_amount_piastres > 10000000 then
    raise exception 'topup_amount_invalid' using errcode = '22023';
  end if;
  if v_phone is null or char_length(pg_catalog.btrim(coalesce(p_payer_name, ''))) not between 2 and 120 then
    raise exception 'topup_payer_invalid' using errcode = '22023';
  end if;
  if p_proof_path is null
     or pg_catalog.split_part(p_proof_path, '/', 1) <> p_merchant_id::text
     or not exists (
       select 1 from storage.objects as object
       where object.bucket_id = 'wallet-topup-proofs' and object.name = p_proof_path
     ) then
    raise exception 'topup_proof_required' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from public.merchant_wallet_topup_requests as pending
      where pending.merchant_id = p_merchant_id and pending.status = 'pending') >= 3 then
    raise exception 'topup_pending_limit_reached' using errcode = '54000';
  end if;
  insert into public.merchant_wallets (merchant_id) values (p_merchant_id)
  on conflict (merchant_id) do nothing;
  insert into public.merchant_wallet_topup_requests (
    public_code, merchant_id, requested_by, requester_name_snapshot, amount_piastres,
    payer_name, payer_phone, transfer_reference, proof_path, idempotency_key
  ) values (
    'TU-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_merchant_id, v_actor,
    (select profile.display_name from public.profiles as profile where profile.id = v_actor),
    p_amount_piastres, pg_catalog.btrim(p_payer_name), v_phone,
    nullif(pg_catalog.btrim(coalesce(p_transfer_reference, '')), ''), p_proof_path, p_idempotency_key
  ) returning * into v_request;
  return pg_catalog.jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code, 'status', v_request.status);
end;
$$;

create or replace function public.purchase_my_wallet_subscription(
  p_merchant_id uuid,
  p_plan_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan public.marketplace_subscription_plans;
  v_wallet public.merchant_wallets;
  v_starts timestamptz;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_merchant_id is null or not public.can_manage_merchant(p_merchant_id) then
    raise exception 'wallet_access_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  insert into public.merchant_wallets (merchant_id) values (p_merchant_id)
  on conflict (merchant_id) do nothing;
  select * into v_wallet from public.merchant_wallets where merchant_id = p_merchant_id for update;
  if exists (
    select 1 from public.merchant_wallet_entries as entry
    where entry.merchant_id = p_merchant_id and entry.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.jsonb_build_object('ends_at', v_wallet.subscription_ends_at, 'idempotent', true);
  end if;
  select * into v_plan from public.marketplace_subscription_plans where id = p_plan_id and is_active;
  if v_plan.id is null then raise exception 'subscription_plan_unavailable' using errcode = 'P0002'; end if;
  if v_plan.price_piastres > v_wallet.balance_piastres then
    raise exception 'wallet_balance_insufficient' using errcode = 'P0001';
  end if;
  v_starts := greatest(coalesce(v_wallet.subscription_ends_at, pg_catalog.now()), pg_catalog.now());
  update public.merchant_wallets
  set balance_piastres = balance_piastres - v_plan.price_piastres,
      subscription_plan_id = v_plan.id,
      subscription_ends_at = v_starts + pg_catalog.make_interval(days => v_plan.duration_days),
      updated_at = pg_catalog.now()
  where merchant_id = p_merchant_id
  returning * into v_wallet;
  insert into public.merchant_wallet_entries (
    merchant_id, entry_type, amount_piastres, balance_after_piastres, plan_id, actor_user_id,
    idempotency_key, note
  ) values (
    p_merchant_id, 'subscription_purchase', -v_plan.price_piastres, v_wallet.balance_piastres, v_plan.id,
    v_actor, p_idempotency_key, v_plan.name_ar
  );
  return pg_catalog.jsonb_build_object('ends_at', v_wallet.subscription_ends_at, 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance administration
-- ---------------------------------------------------------------------------

create or replace function public.get_marketplace_wallet_admin_overview(p_status text default 'pending')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid_topup_status' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'settings', (select pg_catalog.to_jsonb(settings) - 'id' - 'updated_by'
      from public.marketplace_fee_settings as settings),
    'plans', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', plan.id, 'name', plan.name_ar, 'duration_days', plan.duration_days,
        'price_piastres', plan.price_piastres, 'is_active', plan.is_active, 'sort_order', plan.sort_order
      ) order by plan.sort_order, plan.created_at)
      from public.marketplace_subscription_plans as plan
    ), '[]'::jsonb),
    'topups', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.created_at desc)
      from (
        select request.id, request.public_code, request.merchant_id,
          merchant.display_name as merchant_name, request.requester_name_snapshot as requester_name,
          request.amount_piastres, request.payer_name, request.payer_phone, request.transfer_reference,
          request.status, request.review_notes, request.created_at, request.reviewed_at,
          (select pg_catalog.count(distinct other.merchant_id)
            from public.merchant_wallet_topup_requests as other
            where other.payer_phone = request.payer_phone and other.merchant_id <> request.merchant_id
          ) as payer_phone_other_merchants
        from public.merchant_wallet_topup_requests as request
        join public.merchants as merchant on merchant.id = request.merchant_id
        where p_status is null or request.status = p_status
        order by request.created_at desc limit 100
      ) as page
    ), '[]'::jsonb),
    'wallets', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.merchant_name)
      from (
        select merchant.id as merchant_id, merchant.display_name as merchant_name, merchant.is_active,
          coalesce(wallet.balance_piastres, 0) as balance_piastres,
          public.merchant_free_orders_used(merchant.id) as free_orders_used,
          wallet.subscription_ends_at,
          (select pg_catalog.count(*) from public.merchant_wallet_entries as entry
            where entry.merchant_id = merchant.id
              and entry.entry_type in ('order_fee', 'free_order', 'subscription_order')) as accepted_orders,
          (select coalesce(-pg_catalog.sum(entry.amount_piastres), 0)
            from public.merchant_wallet_entries as entry
            where entry.merchant_id = merchant.id and entry.entry_type = 'order_fee') as fees_paid_piastres
        from public.merchants as merchant
        left join public.merchant_wallets as wallet on wallet.merchant_id = merchant.id
        where exists (select 1 from public.stores as store where store.merchant_id = merchant.id)
        order by merchant.display_name limit 500
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_wallet_topup_proof_path_as_admin(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  return (select request.proof_path from public.merchant_wallet_topup_requests as request
    where request.id = p_request_id);
end;
$$;

create or replace function public.review_wallet_topup_request_as_admin(
  p_request_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request public.merchant_wallet_topup_requests;
  v_wallet public.merchant_wallets;
  v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes, '')), '');
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  if p_approve is null then raise exception 'invalid_topup_review' using errcode = '22023'; end if;
  if not p_approve and (v_notes is null or char_length(v_notes) < 3) then
    raise exception 'topup_rejection_notes_required' using errcode = '22023';
  end if;
  if char_length(coalesce(v_notes, '')) > 1000 then
    raise exception 'invalid_topup_review' using errcode = '22023';
  end if;
  select * into v_request from public.merchant_wallet_topup_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'topup_not_found' using errcode = 'P0002'; end if;
  if v_request.status <> 'pending' then
    raise exception 'topup_already_reviewed' using errcode = '55000';
  end if;
  update public.merchant_wallet_topup_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_notes = v_notes, reviewed_by = v_actor, reviewed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_request_id;
  if p_approve then
    insert into public.merchant_wallets (merchant_id) values (v_request.merchant_id)
    on conflict (merchant_id) do nothing;
    update public.merchant_wallets
    set balance_piastres = balance_piastres + v_request.amount_piastres, updated_at = pg_catalog.now()
    where merchant_id = v_request.merchant_id
    returning * into v_wallet;
    insert into public.merchant_wallet_entries (
      merchant_id, entry_type, amount_piastres, balance_after_piastres, topup_request_id, actor_user_id, note
    ) values (
      v_request.merchant_id, 'topup', v_request.amount_piastres, v_wallet.balance_piastres,
      v_request.id, v_actor, v_request.public_code
    );
  end if;
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor, case when p_approve then 'wallet.topup_approved' else 'wallet.topup_rejected' end,
    'wallet_topup_request', v_request.id::text,
    pg_catalog.jsonb_build_object('merchant_id', v_request.merchant_id, 'amount_piastres', v_request.amount_piastres)
  );
  return pg_catalog.jsonb_build_object('id', v_request.id, 'approved', p_approve);
end;
$$;

create or replace function public.adjust_merchant_wallet_as_admin(
  p_merchant_id uuid,
  p_amount_piastres bigint,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_wallet public.merchant_wallets;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  if p_amount_piastres is null or p_amount_piastres = 0 or pg_catalog.abs(p_amount_piastres) > 10000000
     or v_note is null or char_length(v_note) not between 3 and 500
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_wallet_adjustment' using errcode = '22023';
  end if;
  if not exists (select 1 from public.merchants as merchant where merchant.id = p_merchant_id) then
    raise exception 'wallet_merchant_not_found' using errcode = 'P0002';
  end if;
  insert into public.merchant_wallets (merchant_id) values (p_merchant_id)
  on conflict (merchant_id) do nothing;
  select * into v_wallet from public.merchant_wallets where merchant_id = p_merchant_id for update;
  if exists (
    select 1 from public.merchant_wallet_entries as entry
    where entry.merchant_id = p_merchant_id and entry.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.jsonb_build_object('balance_piastres', v_wallet.balance_piastres, 'idempotent', true);
  end if;
  if v_wallet.balance_piastres + p_amount_piastres < 0 then
    raise exception 'wallet_balance_insufficient' using errcode = 'P0001';
  end if;
  update public.merchant_wallets
  set balance_piastres = balance_piastres + p_amount_piastres, updated_at = pg_catalog.now()
  where merchant_id = p_merchant_id
  returning * into v_wallet;
  insert into public.merchant_wallet_entries (
    merchant_id, entry_type, amount_piastres, balance_after_piastres, actor_user_id, idempotency_key, note
  ) values (
    p_merchant_id, 'adjustment', p_amount_piastres, v_wallet.balance_piastres, v_actor, p_idempotency_key, v_note
  );
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'wallet.adjusted', 'merchant_wallet', p_merchant_id::text,
    pg_catalog.jsonb_build_object('amount_piastres', p_amount_piastres));
  return pg_catalog.jsonb_build_object('balance_piastres', v_wallet.balance_piastres, 'idempotent', false);
end;
$$;

create or replace function public.save_marketplace_fee_settings_as_admin(
  p_order_fee_fixed_piastres bigint,
  p_order_fee_percent_bps integer,
  p_order_fee_max_piastres bigint,
  p_free_orders_per_merchant integer,
  p_minimum_topup_piastres bigint,
  p_payment_recipient_name text,
  p_payment_instapay_handle text,
  p_payment_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_phone text := case when nullif(pg_catalog.btrim(coalesce(p_payment_phone, '')), '') is null then null
    else '0' || public.normalize_egypt_mobile(p_payment_phone) end;
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  if nullif(pg_catalog.btrim(coalesce(p_payment_phone, '')), '') is not null and v_phone is null then
    raise exception 'invalid_fee_settings' using errcode = '22023';
  end if;
  begin
    update public.marketplace_fee_settings set
      order_fee_fixed_piastres = p_order_fee_fixed_piastres,
      order_fee_percent_bps = p_order_fee_percent_bps,
      order_fee_max_piastres = p_order_fee_max_piastres,
      free_orders_per_merchant = p_free_orders_per_merchant,
      minimum_topup_piastres = p_minimum_topup_piastres,
      payment_recipient_name = nullif(pg_catalog.btrim(coalesce(p_payment_recipient_name, '')), ''),
      payment_instapay_handle = nullif(pg_catalog.btrim(coalesce(p_payment_instapay_handle, '')), ''),
      payment_phone = v_phone,
      updated_by = v_actor, updated_at = pg_catalog.now();
  exception when check_violation or not_null_violation then
    raise exception 'invalid_fee_settings' using errcode = '22023';
  end;
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'wallet.fee_settings_saved', 'marketplace_fee_settings', 'singleton',
    pg_catalog.jsonb_build_object(
      'fixed_piastres', p_order_fee_fixed_piastres, 'percent_bps', p_order_fee_percent_bps,
      'free_orders', p_free_orders_per_merchant));
  return (select pg_catalog.to_jsonb(settings) - 'id' - 'updated_by' from public.marketplace_fee_settings as settings);
end;
$$;

create or replace function public.save_marketplace_subscription_plan_as_admin(
  p_plan_id uuid,
  p_name_ar text,
  p_duration_days integer,
  p_price_piastres bigint,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan public.marketplace_subscription_plans;
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance']::public.marketplace_admin_role[]);
  begin
    if p_plan_id is null then
      insert into public.marketplace_subscription_plans (name_ar, duration_days, price_piastres, is_active)
      values (pg_catalog.btrim(p_name_ar), p_duration_days, p_price_piastres, coalesce(p_is_active, false))
      returning * into v_plan;
    else
      update public.marketplace_subscription_plans set
        name_ar = pg_catalog.btrim(p_name_ar), duration_days = p_duration_days,
        price_piastres = p_price_piastres, is_active = coalesce(p_is_active, false),
        updated_at = pg_catalog.now()
      where id = p_plan_id
      returning * into v_plan;
      if v_plan.id is null then raise exception 'subscription_plan_unavailable' using errcode = 'P0002'; end if;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'invalid_subscription_plan' using errcode = '22023';
  end;
  insert into public.marketplace_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'wallet.plan_saved', 'marketplace_subscription_plan', v_plan.id::text,
    pg_catalog.jsonb_build_object('price_piastres', v_plan.price_piastres, 'is_active', v_plan.is_active));
  return pg_catalog.jsonb_build_object('id', v_plan.id);
end;
$$;

-- Accounts that look like the same merchant registered more than once.
create or replace function public.list_duplicate_merchant_signals_as_admin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'finance', 'operations', 'catalog_reviewer']::public.marketplace_admin_role[]);
  return coalesce((
    with merchant_keys as (
      select merchant.id as merchant_id, 'phone' as kind,
        '•••' || pg_catalog.right(fingerprint.value, 4) as label, fingerprint.value as key
      from public.merchants as merchant
      cross join lateral pg_catalog.unnest(public.merchant_contact_fingerprints(merchant.id)) as fingerprint(value)
      union all
      select store.merchant_id, 'store_name', store.name,
        'name:' || pg_catalog.lower(pg_catalog.regexp_replace(store.name, '[[:space:][:punct:]ـ]+', '', 'g'))
      from public.stores as store
      where char_length(pg_catalog.regexp_replace(store.name, '[[:space:][:punct:]ـ]+', '', 'g')) >= 3
      union all
      select claim.last_merchant_id, 'free_orders_reused', '•••' || pg_catalog.right(claim.fingerprint, 4),
        'claim:' || claim.fingerprint
      from public.marketplace_free_order_claims as claim
      where claim.first_merchant_id <> claim.last_merchant_id
      union all
      select claim.first_merchant_id, 'free_orders_reused', '•••' || pg_catalog.right(claim.fingerprint, 4),
        'claim:' || claim.fingerprint
      from public.marketplace_free_order_claims as claim
      where claim.first_merchant_id <> claim.last_merchant_id
    ), duplicated as (
      select kind, key, pg_catalog.min(label) as label
      from merchant_keys
      group by kind, key
      having pg_catalog.count(distinct merchant_id) > 1
    )
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'kind', duplicated.kind,
      'label', duplicated.label,
      'merchants', (
        select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object(
          'id', merchant.id, 'name', merchant.display_name, 'is_active', merchant.is_active,
          'created_at', merchant.created_at,
          'free_orders_used', public.merchant_free_orders_used(merchant.id)
        ))
        from merchant_keys as source
        join public.merchants as merchant on merchant.id = source.merchant_id
        where source.kind = duplicated.kind and source.key = duplicated.key
      )
    ) order by duplicated.kind, duplicated.label)
    from duplicated
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin dashboard
-- ---------------------------------------------------------------------------

create or replace function public.get_marketplace_admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_since timestamptz := pg_catalog.date_trunc('day', pg_catalog.now()) - pg_catalog.make_interval(days => v_days - 1);
  v_since_date date := v_since::date;
begin
  perform public.activate_marketplace_admin_capability(
    array['super_admin', 'operations', 'support', 'finance', 'catalog_reviewer']::public.marketplace_admin_role[]);
  return pg_catalog.jsonb_build_object(
    'days', v_days,
    'generated_at', pg_catalog.now(),
    'accounts', pg_catalog.jsonb_build_object(
      'profiles', (select pg_catalog.count(*) from public.profiles),
      'profiles_new', (select pg_catalog.count(*) from public.profiles where created_at >= v_since),
      'customers', (select pg_catalog.count(*) from public.marketplace_customers where is_active),
      'customers_new', (select pg_catalog.count(*) from public.marketplace_customers where created_at >= v_since),
      'merchants', (select pg_catalog.count(*) from public.merchants where is_active),
      'drivers', (select pg_catalog.count(*) from public.driver_profiles),
      'pending_account_requests', (select pg_catalog.count(*) from public.account_requests where status = 'pending'),
      'workspaces_by_status', coalesce((
        select pg_catalog.jsonb_object_agg(grouped.key, grouped.total)
        from (select activity_kind::text || ':' || status::text as key, pg_catalog.count(*) as total
          from public.activity_workspaces group by 1) as grouped
      ), '{}'::jsonb)
    ),
    'catalog', pg_catalog.jsonb_build_object(
      'stores_by_status', coalesce((
        select pg_catalog.jsonb_object_agg(grouped.status, grouped.total)
        from (select status::text, pg_catalog.count(*) as total from public.stores group by 1) as grouped
      ), '{}'::jsonb),
      'products_by_status', coalesce((
        select pg_catalog.jsonb_object_agg(grouped.status, grouped.total)
        from (select status::text, pg_catalog.count(*) as total from public.products group by 1) as grouped
      ), '{}'::jsonb),
      'out_of_stock_variants', (
        select pg_catalog.count(*) from public.inventory_stock as stock
        where stock.track_inventory and stock.on_hand - stock.reserved <= 0
      ),
      'delivery_zones_active', (select pg_catalog.count(*) from public.delivery_zones where is_active)
    ),
    'orders', pg_catalog.jsonb_build_object(
      'by_status', coalesce((
        select pg_catalog.jsonb_object_agg(grouped.status, grouped.total)
        from (select status::text, pg_catalog.count(*) as total from public.marketplace_orders group by 1) as grouped
      ), '{}'::jsonb),
      'period_total', (select pg_catalog.count(*) from public.marketplace_orders where created_at >= v_since),
      'period_accepted', (
        select pg_catalog.count(*) from public.marketplace_orders
        where created_at >= v_since and public.marketplace_order_is_accepted(status, confirmed_at)
      ),
      'period_delivered', (
        select pg_catalog.count(*) from public.marketplace_orders
        where created_at >= v_since and status = 'delivered'
      ),
      'period_gmv_piastres', (
        select coalesce(pg_catalog.sum(grand_total), 0) from public.marketplace_orders
        where created_at >= v_since and public.marketplace_order_is_accepted(status, confirmed_at)
          and status not in ('cancelled', 'rejected', 'returned')
      ),
      'awaiting_store_over_2h', (
        select pg_catalog.count(*) from public.marketplace_orders
        where status = 'pending_confirmation' and created_at < pg_catalog.now() - interval '2 hours'
      ),
      'daily', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'date', day.value::date, 'orders', coalesce(stats.orders, 0),
          'gmv_piastres', coalesce(stats.gmv, 0)
        ) order by day.value)
        from pg_catalog.generate_series(v_since, pg_catalog.date_trunc('day', pg_catalog.now()), interval '1 day') as day(value)
        left join (
          select pg_catalog.date_trunc('day', created_at) as bucket, pg_catalog.count(*) as orders,
            pg_catalog.sum(grand_total) filter (where status not in ('cancelled', 'rejected')) as gmv
          from public.marketplace_orders where created_at >= v_since group by 1
        ) as stats on stats.bucket = day.value
      ), '[]'::jsonb)
    ),
    'revenue', pg_catalog.jsonb_build_object(
      'fees_period_piastres', (
        select coalesce(-pg_catalog.sum(amount_piastres), 0) from public.merchant_wallet_entries
        where entry_type = 'order_fee' and created_at >= v_since
      ),
      'fees_total_piastres', (
        select coalesce(-pg_catalog.sum(amount_piastres), 0) from public.merchant_wallet_entries
        where entry_type = 'order_fee'
      ),
      'subscriptions_period_piastres', (
        select coalesce(-pg_catalog.sum(amount_piastres), 0) from public.merchant_wallet_entries
        where entry_type = 'subscription_purchase' and created_at >= v_since
      ),
      'topups_period_piastres', (
        select coalesce(pg_catalog.sum(amount_piastres), 0) from public.merchant_wallet_entries
        where entry_type = 'topup' and created_at >= v_since
      ),
      'wallet_balances_piastres', (select coalesce(pg_catalog.sum(balance_piastres), 0) from public.merchant_wallets),
      'pending_topups', (select pg_catalog.count(*) from public.merchant_wallet_topup_requests where status = 'pending'),
      'pending_topups_piastres', (
        select coalesce(pg_catalog.sum(amount_piastres), 0) from public.merchant_wallet_topup_requests
        where status = 'pending'
      ),
      'free_orders_used', (
        select pg_catalog.count(*) from public.merchant_wallet_entries where entry_type = 'free_order'
      ),
      'active_subscriptions', (
        select pg_catalog.count(*) from public.merchant_wallets where subscription_ends_at > pg_catalog.now()
      ),
      'stores_out_of_credit', (
        select pg_catalog.count(*) from public.merchants as merchant
        cross join public.marketplace_fee_settings as settings
        left join public.merchant_wallets as wallet on wallet.merchant_id = merchant.id
        where merchant.is_active
          and exists (select 1 from public.stores as store
            where store.merchant_id = merchant.id and store.status = 'published')
          and coalesce(wallet.subscription_ends_at, '-infinity'::timestamptz) <= pg_catalog.now()
          and public.merchant_free_orders_used(merchant.id) >= settings.free_orders_per_merchant
          and coalesce(wallet.balance_piastres, 0) < settings.order_fee_fixed_piastres
      )
    ),
    'funnel', pg_catalog.jsonb_build_object(
      'visitors', (select pg_catalog.count(*) from public.analytics_daily_visitors where event_date >= v_since_date),
      'marketplace_page_views', (
        select coalesce(pg_catalog.sum(events), 0) from public.analytics_daily_events
        where event_date >= v_since_date and event_name = 'page_view' and route = '/marketplace'
      ),
      'product_page_views', (
        select coalesce(pg_catalog.sum(events), 0) from public.analytics_daily_events
        where event_date >= v_since_date and event_name = 'page_view' and route like '/marketplace/products%'
      ),
      'carts_started', (
        select pg_catalog.count(*) from public.carts as cart
        where cart.created_at >= v_since
          and exists (select 1 from public.cart_items as item where item.cart_id = cart.id)
      ),
      'carts_open_with_items', (
        select pg_catalog.count(*) from public.carts as cart
        where cart.status = 'active'
          and exists (select 1 from public.cart_items as item where item.cart_id = cart.id)
      ),
      'checkout_attempts', (select pg_catalog.count(*) from public.checkout_requests where created_at >= v_since),
      'checkout_failures', coalesce((
        select pg_catalog.jsonb_object_agg(grouped.code, grouped.total)
        from (select coalesce(failure_code, 'unknown') as code, pg_catalog.count(*) as total
          from public.checkout_requests where created_at >= v_since and status = 'failed' group by 1) as grouped
      ), '{}'::jsonb),
      'orders_placed', (select pg_catalog.count(*) from public.order_groups where placed_at >= v_since),
      'top_routes', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('route', page.route, 'views', page.views)
          order by page.views desc)
        from (
          select route, pg_catalog.sum(events) as views from public.analytics_daily_events
          where event_date >= v_since_date and event_name = 'page_view'
          group by route order by 2 desc limit 12
        ) as page
      ), '[]'::jsonb),
      'daily_visitors', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date', day.value::date, 'visitors', coalesce(stats.visitors, 0))
          order by day.value)
        from pg_catalog.generate_series(v_since, pg_catalog.date_trunc('day', pg_catalog.now()), interval '1 day') as day(value)
        left join (
          select event_date, pg_catalog.count(*) as visitors from public.analytics_daily_visitors
          where event_date >= v_since_date group by 1
        ) as stats on stats.event_date = day.value::date
      ), '[]'::jsonb)
    ),
    'stores', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.period_orders desc, page.name)
      from (
        select store.id, store.name, store.status::text as status, merchant.display_name as merchant_name,
          (select pg_catalog.count(*) from public.products as product
            where product.store_id = store.id and product.status = 'active') as active_products,
          (select pg_catalog.count(*) from public.marketplace_orders as marketplace_order
            where marketplace_order.store_id = store.id and marketplace_order.created_at >= v_since) as period_orders,
          (select pg_catalog.count(*) from public.marketplace_orders as marketplace_order
            where marketplace_order.store_id = store.id
              and marketplace_order.status = 'pending_confirmation') as awaiting_orders,
          (select coalesce(pg_catalog.sum(asset.byte_size), 0) from public.media_assets as asset
            where asset.store_id = store.id and asset.status = 'active') as storage_bytes,
          coalesce(wallet.balance_piastres, 0) as balance_piastres,
          greatest(settings.free_orders_per_merchant - public.merchant_free_orders_used(store.merchant_id), 0)
            as free_orders_remaining,
          (select contact.phone is not null from public.store_contacts as contact
            where contact.store_id = store.id) as has_contact
        from public.stores as store
        join public.merchants as merchant on merchant.id = store.merchant_id
        cross join public.marketplace_fee_settings as settings
        left join public.merchant_wallets as wallet on wallet.merchant_id = store.merchant_id
        order by 6 desc, store.name limit 50
      ) as page
    ), '[]'::jsonb),
    'storage', pg_catalog.jsonb_build_object(
      'buckets', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'bucket', grouped.bucket_id, 'objects', grouped.objects, 'bytes', grouped.bytes) order by grouped.bytes desc)
        from (
          select object.bucket_id, pg_catalog.count(*) as objects,
            coalesce(pg_catalog.sum((object.metadata ->> 'size')::bigint), 0) as bytes
          from storage.objects as object group by 1
        ) as grouped
      ), '[]'::jsonb),
      'managed_media_bytes', (
        select coalesce(pg_catalog.sum(byte_size), 0) from public.media_assets where status = 'active'
      ),
      'managed_media_files', (select pg_catalog.count(*) from public.media_assets where status = 'active')
    ),
    'problems', pg_catalog.jsonb_build_object(
      'client_errors', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by page.last_seen_at desc)
        from (
          select report.route, report.error_kind, report.event_type, report.browser_family,
            report.occurrences, report.last_seen_at
          from public.client_error_reports as report
          where report.last_seen_at >= pg_catalog.now() - interval '7 days'
          order by report.last_seen_at desc limit 15
        ) as page
      ), '[]'::jsonb),
      'client_errors_7d', (
        select coalesce(pg_catalog.sum(occurrences), 0) from public.client_error_reports
        where last_seen_at >= pg_catalog.now() - interval '7 days'
      ),
      'stores_pending_review', (select pg_catalog.count(*) from public.stores where status = 'pending_review'),
      'products_pending_review', (select pg_catalog.count(*) from public.products where status = 'pending_review'),
      'push_dead_letters', (
        select pg_catalog.count(*) from public.marketplace_push_jobs where dead_lettered_at is not null
      ),
      'outbox_dead_letters', (
        select pg_catalog.count(*) from public.marketplace_outbox where dead_lettered_at is not null
      ),
      'open_chat_reports', (select pg_catalog.count(*) from public.marketplace_chat_reports where status = 'open'),
      'published_stores_without_contact', (
        select pg_catalog.count(*) from public.stores as store
        where store.status = 'published'
          and not exists (select 1 from public.store_contacts as contact where contact.store_id = store.id)
      ),
      'published_stores_without_delivery', (
        select pg_catalog.count(*) from public.stores as store
        where store.status = 'published'
          and not exists (select 1 from public.store_delivery_zones as zone
            where zone.store_id = store.id and zone.is_active)
          and not exists (select 1 from public.branch_delivery_zones as zone
            join public.store_branches as branch on branch.id = zone.branch_id
            where branch.store_id = store.id and zone.is_active)
      ),
      'release_ready', public.marketplace_release_ready()
    )
  );
end;
$$;

-- Onboarding checklist for the merchant home screen.
create or replace function public.get_my_store_launch_checklist(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
  v_settings public.marketplace_fee_settings;
  v_wallet public.merchant_wallets;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not public.can_fulfill_store(p_store_id) and not public.can_catalog_store(p_store_id) then
    raise exception 'store_access_required' using errcode = '42501';
  end if;
  select * into v_store from public.stores where id = p_store_id;
  select * into v_settings from public.marketplace_fee_settings;
  select * into v_wallet from public.merchant_wallets where merchant_id = v_store.merchant_id;
  return pg_catalog.jsonb_build_object(
    'store_status', v_store.status,
    'products_total', (select pg_catalog.count(*) from public.products as product
      where product.store_id = p_store_id and product.status <> 'archived'),
    'products_active', (select pg_catalog.count(*) from public.products as product
      where product.store_id = p_store_id and product.status = 'active'),
    'has_contact', exists (select 1 from public.store_contacts as contact where contact.store_id = p_store_id),
    'has_delivery', exists (select 1 from public.store_delivery_zones as zone
        where zone.store_id = p_store_id and zone.is_active)
      or exists (select 1 from public.branch_delivery_zones as zone
        join public.store_branches as branch on branch.id = zone.branch_id
        where branch.store_id = p_store_id and zone.is_active),
    'awaiting_orders', (select pg_catalog.count(*) from public.marketplace_orders as marketplace_order
      where marketplace_order.store_id = p_store_id and marketplace_order.status = 'pending_confirmation'),
    'balance_piastres', coalesce(v_wallet.balance_piastres, 0),
    'free_orders_remaining', greatest(v_settings.free_orders_per_merchant
      - public.merchant_free_orders_used(v_store.merchant_id), 0),
    'subscription_active', coalesce(v_wallet.subscription_ends_at > pg_catalog.now(), false),
    'order_fee_fixed_piastres', v_settings.order_fee_fixed_piastres,
    'order_fee_percent_bps', v_settings.order_fee_percent_bps
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Private bucket for top-up transfer screenshots
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallet-topup-proofs', 'wallet-topup-proofs', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_write_wallet_topup_proof(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_merchant_id uuid;
begin
  if p_object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(jpg|png|webp)$' then
    return false;
  end if;
  v_merchant_id := pg_catalog.split_part(p_object_name, '/', 1)::uuid;
  return public.can_manage_merchant(v_merchant_id);
end;
$$;

create policy wallet_topup_proofs_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'wallet-topup-proofs' and public.can_write_wallet_topup_proof(name));

create policy wallet_topup_proofs_read on storage.objects
for select to authenticated
using (
  bucket_id = 'wallet-topup-proofs'
  and (
    public.can_write_wallet_topup_proof(name)
    or public.has_marketplace_admin_role(array['super_admin', 'finance']::public.marketplace_admin_role[])
  )
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.normalize_egypt_mobile(text) from public, anon, authenticated;
revoke all on function public.merchant_contact_fingerprints(uuid) from public, anon, authenticated;
revoke all on function public.merchant_free_orders_used(uuid) from public, anon, authenticated;
revoke all on function public.marketplace_order_fee_piastres(bigint) from public, anon, authenticated;
revoke all on function public.charge_marketplace_order_fee() from public, anon, authenticated;
revoke all on function public.skip_legacy_commission_entry() from public, anon, authenticated;
revoke all on function public.reject_platform_delivery_mode() from public, anon, authenticated;
revoke all on function public.force_self_delivery_modes() from public, anon, authenticated;

revoke all on function public.marketplace_order_is_accepted(public.marketplace_order_status, timestamptz) from public, anon;
grant execute on function public.marketplace_order_is_accepted(public.marketplace_order_status, timestamptz) to authenticated;
revoke all on function public.can_write_wallet_topup_proof(text) from public, anon;
grant execute on function public.can_write_wallet_topup_proof(text) to authenticated;

revoke all on function public.get_my_store_contact(uuid) from public, anon;
grant execute on function public.get_my_store_contact(uuid) to authenticated;
revoke all on function public.save_my_store_contact(uuid, text, text) from public, anon;
grant execute on function public.save_my_store_contact(uuid, text, text) to authenticated;
revoke all on function public.get_my_merchant_wallet(uuid) from public, anon;
grant execute on function public.get_my_merchant_wallet(uuid) to authenticated;
revoke all on function public.create_my_wallet_topup_request(uuid, bigint, text, text, text, text, text) from public, anon;
grant execute on function public.create_my_wallet_topup_request(uuid, bigint, text, text, text, text, text) to authenticated;
revoke all on function public.purchase_my_wallet_subscription(uuid, uuid, text) from public, anon;
grant execute on function public.purchase_my_wallet_subscription(uuid, uuid, text) to authenticated;
revoke all on function public.get_my_store_launch_checklist(uuid) from public, anon;
grant execute on function public.get_my_store_launch_checklist(uuid) to authenticated;

revoke all on function public.get_marketplace_wallet_admin_overview(text) from public, anon;
grant execute on function public.get_marketplace_wallet_admin_overview(text) to authenticated;
revoke all on function public.get_wallet_topup_proof_path_as_admin(uuid) from public, anon;
grant execute on function public.get_wallet_topup_proof_path_as_admin(uuid) to authenticated;
revoke all on function public.review_wallet_topup_request_as_admin(uuid, boolean, text) from public, anon;
grant execute on function public.review_wallet_topup_request_as_admin(uuid, boolean, text) to authenticated;
revoke all on function public.adjust_merchant_wallet_as_admin(uuid, bigint, text, text) from public, anon;
grant execute on function public.adjust_merchant_wallet_as_admin(uuid, bigint, text, text) to authenticated;
revoke all on function public.save_marketplace_fee_settings_as_admin(bigint, integer, bigint, integer, bigint, text, text, text) from public, anon;
grant execute on function public.save_marketplace_fee_settings_as_admin(bigint, integer, bigint, integer, bigint, text, text, text) to authenticated;
revoke all on function public.save_marketplace_subscription_plan_as_admin(uuid, text, integer, bigint, boolean) from public, anon;
grant execute on function public.save_marketplace_subscription_plan_as_admin(uuid, text, integer, bigint, boolean) to authenticated;
revoke all on function public.list_duplicate_merchant_signals_as_admin() from public, anon;
grant execute on function public.list_duplicate_merchant_signals_as_admin() to authenticated;
revoke all on function public.get_marketplace_admin_dashboard(integer) from public, anon;
grant execute on function public.get_marketplace_admin_dashboard(integer) to authenticated;

commit;
