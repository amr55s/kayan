-- DAIRTAK marketplace commerce foundation (schema version 20260810070000).
--
-- This migration is intentionally additive: the existing directory and delivery
-- operations remain intact while marketplace traffic moves to the tables below.
-- All money values are stored as integer Egyptian piastres. Sensitive state changes are
-- exposed only through narrowly-scoped RPCs or the service role.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

do $$ begin
  -- All persisted money is integer Egyptian piastres (100 = EGP 1.00).
  create domain public.egp_amount as bigint
    check (value >= 0 and value <= 99999999999999);
exception when duplicate_object then null;
end $$;

do $$ begin
  create domain public.egp_adjustment as bigint
    check (abs(value) <= 99999999999999);
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_store_status as enum (
    'draft', 'pending_review', 'published', 'suspended', 'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_product_status as enum (
    'draft', 'pending_review', 'active', 'rejected', 'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_delivery_mode as enum (
    'platform', 'self', 'flexible'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_cart_status as enum (
    'active', 'converted', 'abandoned', 'merged'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_order_status as enum (
    'pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup',
    'out_for_delivery', 'delivery_failed', 'delivered', 'cancelled', 'rejected',
    'issue', 'return_requested', 'return_approved', 'returned'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_payment_status as enum (
    'pending', 'collected', 'remitted', 'failed', 'refunded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_membership_role as enum (
    'owner', 'manager', 'catalog', 'fulfillment', 'viewer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_media_entity as enum (
    'product', 'store', 'review', 'support', 'import', 'delivery_proof'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_upload_status as enum (
    'staging', 'processing', 'ready', 'failed', 'expired'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_media_status as enum (
    'active', 'deleted', 'quarantined'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_reservation_status as enum (
    'reserved', 'committed', 'released', 'expired'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_coupon_type as enum ('percentage', 'fixed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_coupon_funding as enum ('merchant', 'platform');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_review_status as enum (
    'pending', 'published', 'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_statement_status as enum (
    'draft', 'issued', 'paid', 'disputed', 'void'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_support_status as enum (
    'open', 'waiting_customer', 'waiting_support', 'resolved', 'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.marketplace_import_status as enum (
    'uploaded', 'validating', 'ready', 'processing', 'completed', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

-- Google/OIDC customers are deliberately separate from the legacy staff
-- profiles table, whose phone and role constraints must remain backward-safe.
create table public.marketplace_customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text,
  email_verified_at timestamptz,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  phone text check (phone is null or phone ~ '^01[0125][0-9]{8}$'),
  phone_verified_at timestamptz,
  primary_provider text not null default 'google'
    check (primary_provider ~ '^[a-z0-9_.-]{2,32}$'),
  locale text not null default 'ar-EG' check (char_length(locale) between 2 and 16),
  is_active boolean not null default true,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone_verified_at is null or phone is not null)
);

create unique index marketplace_customers_email_idx
  on public.marketplace_customers (lower(email)) where email is not null;

create table public.merchant_memberships (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.marketplace_membership_role not null default 'owner',
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

create index merchant_memberships_user_idx
  on public.merchant_memberships (user_id, is_active, merchant_id);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 150),
  short_description text check (
    short_description is null or char_length(trim(short_description)) between 2 and 240
  ),
  description text check (description is null or char_length(description) <= 5000),
  status public.marketplace_store_status not null default 'draft',
  delivery_mode public.marketplace_delivery_mode not null default 'platform',
  currency text not null default 'EGP' check (currency = 'EGP'),
  commission_rate numeric(5,4) not null default 0.0700
    check (commission_rate = 0.0700),
  city text,
  area text,
  address_text text check (address_text is null or char_length(address_text) <= 500),
  first_submitted_at timestamptz,
  first_published_at timestamptz,
  moderation_notes text check (moderation_notes is null or char_length(moderation_notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or first_published_at is not null)
);

create index stores_public_catalog_idx
  on public.stores (status, created_at desc) where status = 'published';
create index stores_merchant_idx
  on public.stores (merchant_id, status, updated_at desc);

create table public.store_memberships (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.marketplace_membership_role not null,
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_memberships_user_idx
  on public.store_memberships (user_id, is_active, store_id);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(trim(name_ar)) between 2 and 120),
  name_en text check (name_en is null or char_length(trim(name_en)) between 2 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index product_categories_parent_idx
  on public.product_categories (parent_id, sort_order, name_ar);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete set null,
  product_key text not null
    default ('P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    check (char_length(product_key) between 1 and 80 and product_key !~ '[[:cntrl:][:space:]]'),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 200),
  short_description text check (
    short_description is null or char_length(trim(short_description)) between 2 and 240
  ),
  description text check (description is null or char_length(description) <= 10000),
  brand text check (brand is null or char_length(trim(brand)) <= 120),
  status public.marketplace_product_status not null default 'draft',
  is_featured boolean not null default false,
  first_submitted_at timestamptz,
  first_published_at timestamptz,
  moderation_notes text check (moderation_notes is null or char_length(moderation_notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug),
  check (status <> 'active' or first_published_at is not null)
);

create index products_catalog_idx
  on public.products (store_id, status, is_featured desc, created_at desc)
  where status = 'active';
create index products_category_idx
  on public.products (category_id, status, created_at desc)
  where status = 'active';
create unique index products_store_product_key_idx
  on public.products (store_id, lower(product_key));
create index products_search_idx
  on public.products using gin (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(description, ''))
  );

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  sku text not null check (char_length(trim(sku)) between 1 and 80),
  barcode text check (barcode is null or char_length(trim(barcode)) between 4 and 64),
  title text not null default 'Default' check (char_length(trim(title)) between 1 and 160),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  price public.egp_amount not null,
  compare_at_price public.egp_amount check (compare_at_price is null or compare_at_price >= price),
  currency text not null default 'EGP' check (currency = 'EGP'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, sku)
);

create unique index product_variants_default_idx
  on public.product_variants (product_id) where is_default;
create index product_variants_catalog_idx
  on public.product_variants (product_id, is_active, price);
create unique index product_variants_barcode_idx
  on public.product_variants (barcode) where barcode is not null;
create unique index product_variants_store_sku_idx
  on public.product_variants (store_id, upper(trim(sku)));

create table public.inventory_stock (
  variant_id uuid primary key references public.product_variants(id) on delete restrict,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  track_inventory boolean not null default true,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name_ar text not null check (char_length(trim(name_ar)) between 2 and 120),
  name_en text,
  city text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index delivery_zones_active_idx
  on public.delivery_zones (is_active, sort_order, name_ar);

create table public.store_delivery_zones (
  store_id uuid not null references public.stores(id) on delete cascade,
  zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  delivery_mode public.marketplace_delivery_mode not null default 'platform'
    check (delivery_mode in ('platform', 'self')),
  fee public.egp_amount not null,
  free_delivery_threshold public.egp_amount,
  minimum_order public.egp_amount not null default 0,
  estimated_minutes_min integer check (estimated_minutes_min is null or estimated_minutes_min >= 1),
  estimated_minutes_max integer check (estimated_minutes_max is null or estimated_minutes_max >= estimated_minutes_min),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, zone_id, delivery_mode)
);

create index store_delivery_zones_lookup_idx
  on public.store_delivery_zones (zone_id, store_id, delivery_mode)
  where is_active;

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.marketplace_customers(id) on delete cascade,
  zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  label text not null default 'home' check (char_length(trim(label)) between 1 and 40),
  recipient_name text not null check (char_length(trim(recipient_name)) between 2 and 120),
  recipient_phone text not null check (recipient_phone ~ '^01[0125][0-9]{8}$'),
  address_line text not null check (char_length(trim(address_line)) between 5 and 600),
  building text,
  floor text,
  apartment text,
  landmark text check (landmark is null or char_length(landmark) <= 240),
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_addresses_default_idx
  on public.customer_addresses (customer_id) where is_default;
create index customer_addresses_customer_idx
  on public.customer_addresses (customer_id, updated_at desc);

-- A guest token is never stored in plaintext. Active carts have exactly one
-- owner: either an authenticated customer or a SHA-256 guest-token digest.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.marketplace_customers(id) on delete cascade,
  guest_token_hash bytea,
  status public.marketplace_cart_status not null default 'active',
  currency text not null default 'EGP' check (currency = 'EGP'),
  merged_into_cart_id uuid references public.carts(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'active'
    or ((customer_id is not null)::integer + (guest_token_hash is not null)::integer = 1)
  ),
  check (status <> 'merged' or merged_into_cart_id is not null)
);

create unique index carts_one_active_customer_idx
  on public.carts (customer_id) where status = 'active' and customer_id is not null;
create unique index carts_one_active_guest_idx
  on public.carts (guest_token_hash) where status = 'active' and guest_token_hash is not null;
create index carts_guest_lookup_idx
  on public.carts (id, guest_token_hash) where status = 'active' and guest_token_hash is not null;
create index carts_expiry_idx
  on public.carts (expires_at) where status = 'active';

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index cart_items_cart_idx on public.cart_items (cart_id, created_at);
create index cart_items_variant_idx on public.cart_items (variant_id);

create table public.cart_coupon_selections (
  cart_id uuid primary key references public.carts(id) on delete cascade,
  coupon_id uuid not null,
  applied_store_id uuid not null references public.stores(id) on delete restrict,
  code_snapshot text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.checkout_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  cart_id uuid not null references public.carts(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  order_group_id uuid,
  response jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (customer_id, idempotency_key)
);

create index checkout_requests_cart_idx on public.checkout_requests (cart_id, created_at desc);

create table public.order_groups (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique
    default ('G-' || upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'))),
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  cart_id uuid not null references public.carts(id) on delete restrict,
  address_id uuid references public.customer_addresses(id) on delete set null,
  address_snapshot jsonb not null check (jsonb_typeof(address_snapshot) = 'object'),
  delivery_notes text check (
    delivery_notes is null or char_length(delivery_notes) between 1 and 500
  ),
  currency text not null default 'EGP' check (currency = 'EGP'),
  subtotal public.egp_amount not null default 0,
  merchant_discount_total public.egp_amount not null default 0,
  platform_discount_total public.egp_amount not null default 0,
  discount_total public.egp_amount generated always as (
    merchant_discount_total + platform_discount_total
  ) stored,
  delivery_total public.egp_amount not null default 0,
  grand_total public.egp_amount not null default 0,
  child_order_count integer not null check (child_order_count >= 1),
  pii_redacted_at timestamptz,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (grand_total = subtotal - discount_total + delivery_total),
  check (discount_total <= subtotal)
);

alter table public.checkout_requests
  add constraint checkout_requests_order_group_fk
  foreign key (order_group_id) references public.order_groups(id) on delete restrict;

create index order_groups_customer_idx
  on public.order_groups (customer_id, placed_at desc);

create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique
    default ('O-' || upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'))),
  order_group_id uuid not null references public.order_groups(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  status public.marketplace_order_status not null default 'pending_confirmation',
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  payment_status public.marketplace_payment_status not null default 'pending',
  delivery_mode public.marketplace_delivery_mode not null check (delivery_mode in ('platform', 'self')),
  delivery_zone_id uuid not null references public.delivery_zones(id) on delete restrict,
  address_snapshot jsonb not null check (jsonb_typeof(address_snapshot) = 'object'),
  store_name_snapshot text not null,
  currency text not null default 'EGP' check (currency = 'EGP'),
  subtotal public.egp_amount not null,
  merchant_discount_total public.egp_amount not null default 0,
  platform_discount_total public.egp_amount not null default 0,
  discount_total public.egp_amount generated always as (
    merchant_discount_total + platform_discount_total
  ) stored,
  delivery_fee public.egp_amount not null default 0,
  grand_total public.egp_amount not null,
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 1000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  confirmed_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  pii_redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_group_id, store_id),
  check (grand_total = subtotal - discount_total + delivery_fee),
  check (discount_total <= subtotal),
  check (status <> 'delivered' or delivered_at is not null),
  check (status not in ('cancelled', 'rejected') or cancelled_at is not null)
);

create index marketplace_orders_customer_idx
  on public.marketplace_orders (customer_id, created_at desc);
create index marketplace_orders_store_queue_idx
  on public.marketplace_orders (store_id, status, created_at)
  where status not in ('delivered', 'cancelled', 'rejected');
create index marketplace_orders_group_idx on public.marketplace_orders (order_group_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_name_snapshot text not null,
  sku_snapshot text not null,
  attributes_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes_snapshot) = 'object'),
  image_url_snapshot text,
  unit_price public.egp_amount not null,
  quantity integer not null check (quantity between 1 and 99),
  line_total public.egp_amount generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  unique (order_id, variant_id)
);

create index order_items_order_idx on public.order_items (order_id, created_at);
create index order_items_variant_idx on public.order_items (variant_id);

create table public.marketplace_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (char_length(event_type) between 2 and 80),
  from_status public.marketplace_order_status,
  to_status public.marketplace_order_status,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index marketplace_order_events_order_idx
  on public.marketplace_order_events (order_id, created_at desc);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  status public.marketplace_reservation_status not null default 'reserved',
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'committed' or committed_at is not null),
  check (status not in ('released', 'expired') or released_at is not null)
);

create index inventory_reservations_expiry_idx
  on public.inventory_reservations (expires_at, status) where status = 'reserved';
create index inventory_reservations_order_idx
  on public.inventory_reservations (order_id, status);

create table public.marketplace_coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete restrict,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  title text not null check (char_length(trim(title)) between 2 and 120),
  discount_type public.marketplace_coupon_type not null,
  funding_owner public.marketplace_coupon_funding not null default 'merchant',
  discount_percent numeric(7,4),
  discount_amount_piastres public.egp_amount,
  max_discount public.egp_amount check (max_discount is null or max_discount > 0),
  minimum_order public.egp_amount not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  total_limit integer check (total_limit is null or total_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (store_id, code),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check (
    (discount_type = 'percentage' and discount_percent > 0 and discount_percent <= 100
      and discount_amount_piastres is null)
    or (discount_type = 'fixed' and discount_amount_piastres > 0 and discount_percent is null)
  ),
  check (total_limit is null or redeemed_count <= total_limit)
);

alter table public.cart_coupon_selections
  add constraint cart_coupon_selections_coupon_fk
  foreign key (coupon_id) references public.marketplace_coupons(id) on delete cascade;

create index marketplace_coupons_active_idx
  on public.marketplace_coupons (store_id, code, starts_at, expires_at) where is_active;

create table public.marketplace_coupon_products (
  coupon_id uuid not null references public.marketplace_coupons(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (coupon_id, product_id)
);

create index marketplace_coupon_products_product_idx
  on public.marketplace_coupon_products (product_id, coupon_id);

create table public.marketplace_coupon_categories (
  coupon_id uuid not null references public.marketplace_coupons(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  primary key (coupon_id, category_id)
);

create index marketplace_coupon_categories_category_idx
  on public.marketplace_coupon_categories (category_id, coupon_id);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.marketplace_coupons(id) on delete restrict,
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  code_snapshot text not null,
  discount_amount public.egp_amount not null check (discount_amount > 0),
  funding_owner_snapshot public.marketplace_coupon_funding not null,
  redeemed_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (coupon_id, order_id)
);

create index coupon_redemptions_customer_idx
  on public.coupon_redemptions (customer_id, coupon_id, redeemed_at desc)
  where voided_at is null;

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  order_item_id uuid not null unique references public.order_items(id) on delete restrict,
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(trim(title)) between 2 and 120),
  body text check (body is null or char_length(trim(body)) between 2 and 3000),
  status public.marketplace_review_status not null default 'published',
  verified_purchase boolean not null default true check (verified_purchase),
  moderation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_reviews_public_idx
  on public.product_reviews (product_id, created_at desc) where status = 'published';
create index product_reviews_customer_idx
  on public.product_reviews (customer_id, created_at desc);

create table public.product_rating_aggregates (
  product_id uuid primary key references public.products(id) on delete cascade,
  review_count integer not null default 0 check (review_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_average numeric(3,2) generated always as (
    case when review_count = 0 then null
      else round(rating_sum::numeric / review_count, 2)
    end
  ) stored,
  rating_1_count integer not null default 0 check (rating_1_count >= 0),
  rating_2_count integer not null default 0 check (rating_2_count >= 0),
  rating_3_count integer not null default 0 check (rating_3_count >= 0),
  rating_4_count integer not null default 0 check (rating_4_count >= 0),
  rating_5_count integer not null default 0 check (rating_5_count >= 0),
  updated_at timestamptz not null default now(),
  check (review_count = rating_1_count + rating_2_count + rating_3_count + rating_4_count + rating_5_count),
  check (rating_sum between review_count and review_count * 5)
);

-- DigitalOcean Spaces upload state. A row binds the staging object to an
-- authenticated owner, merchant store and exact entity before bytes are sent.
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  owner_name_snapshot text,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  entity_type public.marketplace_media_entity not null,
  entity_id uuid not null,
  slot text not null default 'gallery' check (slot ~ '^[a-z][a-z0-9_-]{1,31}$'),
  staging_key text not null unique check (staging_key !~ '(^|/)\.\.(/|$)'),
  expected_content_type text not null
    check (expected_content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  expected_size_bytes bigint not null check (expected_size_bytes between 32 and 12582912),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-f0-9]{64}$'),
  status public.marketplace_upload_status not null default 'staging',
  finalize_idempotency_key text check (
    finalize_idempotency_key is null or char_length(finalize_idempotency_key) between 16 and 128
  ),
  finalized_asset_id uuid,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, finalize_idempotency_key),
  check (entity_type in ('product', 'store') or slot <> 'gallery'),
  check (status <> 'ready' or finalized_asset_id is not null)
);

create index upload_sessions_owner_rate_idx
  on public.upload_sessions (owner_id, created_at desc);
create index upload_sessions_expiry_idx
  on public.upload_sessions (expires_at, status)
  where status in ('staging', 'processing');
create index upload_sessions_entity_idx
  on public.upload_sessions (store_id, entity_type, entity_id, status);

create table public.media_assets (
  id uuid primary key,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name_snapshot text,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  entity_type public.marketplace_media_entity not null,
  entity_id uuid not null,
  slot text not null default 'gallery',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  provider text not null default 'digitalocean_spaces' check (provider = 'digitalocean_spaces'),
  bucket text not null check (char_length(trim(bucket)) between 3 and 255),
  object_key text not null unique check (object_key !~ '(^|/)\.\.(/|$)'),
  public_url text unique check (public_url is null or public_url ~ '^https://'),
  content_type text not null check (content_type = 'image/webp'),
  byte_size bigint not null check (byte_size between 32 and 12582912),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status public.marketplace_media_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'deleted' or deleted_at is not null),
  check (
    (entity_type in ('product', 'store') and visibility = 'public' and public_url is not null)
    or (entity_type not in ('product', 'store') and visibility = 'private' and public_url is null)
  )
);

alter table public.upload_sessions
  add constraint upload_sessions_asset_fk
  foreign key (finalized_asset_id) references public.media_assets(id) on delete restrict;

create index media_assets_entity_idx
  on public.media_assets (store_id, entity_type, entity_id, created_at)
  where status = 'active';
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);

create table public.product_images (
  product_id uuid not null references public.products(id) on delete cascade,
  media_asset_id uuid not null unique references public.media_assets(id) on delete restrict,
  position smallint not null check (position between 0 and 9),
  alt_text text check (alt_text is null or char_length(alt_text) <= 240),
  is_primary boolean not null generated always as (position = 0) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, position)
);

create table public.store_images (
  store_id uuid not null references public.stores(id) on delete cascade,
  media_asset_id uuid not null unique references public.media_assets(id) on delete restrict,
  position smallint not null check (position between 0 and 14),
  alt_text text check (alt_text is null or char_length(alt_text) <= 240),
  kind text not null default 'gallery' check (kind in ('logo', 'cover', 'gallery')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, position)
);

create unique index store_images_one_logo_idx
  on public.store_images (store_id) where kind = 'logo';
create unique index store_images_one_cover_idx
  on public.store_images (store_id) where kind = 'cover';

create table public.marketplace_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  driver_name_snapshot text,
  status text not null default 'unassigned'
    check (status in ('unassigned', 'assigned', 'picked_up', 'delivered', 'issue', 'cancelled')),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_asset_id uuid references public.media_assets(id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('assigned', 'picked_up', 'delivered', 'issue')
    or driver_id is not null
    or driver_name_snapshot is not null
  ),
  check (status <> 'assigned' or assigned_at is not null),
  check (status not in ('picked_up', 'delivered') or picked_up_at is not null),
  check (status <> 'delivered' or delivered_at is not null)
);

create index marketplace_delivery_driver_idx
  on public.marketplace_delivery_assignments (driver_id, status, updated_at desc)
  where status in ('assigned', 'picked_up', 'issue');

create table public.marketplace_delivery_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  driver_name_snapshot text,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, driver_id),
  check (expires_at > created_at),
  check (status = 'offered' or responded_at is not null)
);

create index marketplace_delivery_offers_driver_idx
  on public.marketplace_delivery_offers (driver_id, status, expires_at, created_at desc);
create index marketplace_delivery_offers_order_idx
  on public.marketplace_delivery_offers (order_id, status);
create index marketplace_delivery_offers_created_by_idx
  on public.marketplace_delivery_offers (created_by);

create table public.cod_collections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  expected_amount public.egp_amount not null,
  collected_amount public.egp_amount,
  status public.marketplace_payment_status not null default 'pending',
  collected_by uuid references public.profiles(id) on delete set null,
  collected_by_name_snapshot text,
  collected_at timestamptz,
  remitted_at timestamptz,
  discrepancy_reason text check (discrepancy_reason is null or char_length(discrepancy_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('collected', 'remitted') or collected_amount is not null),
  check (status <> 'collected' or collected_at is not null),
  check (status <> 'remitted' or remitted_at is not null)
);

create index cod_collections_pending_idx
  on public.cod_collections (status, created_at) where status in ('pending', 'collected');

create table public.cash_reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 128),
  driver_id uuid references public.profiles(id) on delete set null,
  driver_name_snapshot text,
  status text not null default 'open' check (status in ('open', 'submitted', 'accepted', 'rejected')),
  expected_total public.egp_amount not null default 0,
  submitted_total public.egp_amount,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_by_name_snapshot text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cash_reconciliation_driver_idx
  on public.cash_reconciliation_batches (driver_id, status, created_at desc);

create table public.cash_reconciliation_items (
  batch_id uuid not null references public.cash_reconciliation_batches(id) on delete restrict,
  collection_id uuid not null unique references public.cod_collections(id) on delete restrict,
  expected_amount public.egp_amount not null,
  submitted_amount public.egp_amount,
  created_at timestamptz not null default now(),
  primary key (batch_id, collection_id)
);

-- Append-only COD cash movements. Mutable operational status lives on the
-- collection/batch rows; accounting history is represented only by new events.
create table public.cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 12 and 180),
  entry_type text not null
    check (entry_type in ('collection', 'remittance', 'refund', 'discrepancy_adjustment')),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  collection_id uuid not null references public.cod_collections(id) on delete restrict,
  reconciliation_batch_id uuid references public.cash_reconciliation_batches(id) on delete restrict,
  amount_piastres public.egp_adjustment not null check (amount_piastres <> 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name_snapshot text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (
    (entry_type = 'collection' and amount_piastres > 0)
    or (entry_type in ('remittance', 'refund') and amount_piastres < 0)
    or entry_type = 'discrepancy_adjustment'
  )
);

create index cash_ledger_order_fk_idx on public.cash_ledger_entries (order_id);
create index cash_ledger_collection_fk_idx on public.cash_ledger_entries (collection_id);
create index cash_ledger_batch_fk_idx on public.cash_ledger_entries (reconciliation_batch_id);
create index cash_ledger_actor_fk_idx on public.cash_ledger_entries (actor_user_id);
create index cash_ledger_occurred_idx on public.cash_ledger_entries (occurred_at, id);

create table public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  entry_type text not null default 'earned' check (entry_type in ('earned', 'reversal')),
  source_entry_id uuid references public.commission_ledger(id) on delete restrict,
  gross_merchandise_value public.egp_adjustment not null,
  commission_rate numeric(5,4) not null default 0.0700 check (commission_rate = 0.0700),
  commission_amount public.egp_adjustment not null,
  recognized_at timestamptz not null,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  unique (order_id, entry_type),
  check (
    (entry_type = 'earned' and gross_merchandise_value >= 0 and commission_amount >= 0
      and source_entry_id is null)
    or (entry_type = 'reversal' and gross_merchandise_value <= 0 and commission_amount <= 0
      and source_entry_id is not null)
  )
);

create index commission_ledger_statement_idx
  on public.commission_ledger (store_id, recognized_at);

create table public.commission_statements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_merchandise_value public.egp_adjustment not null default 0,
  commission_rate numeric(5,4) not null default 0.0700 check (commission_rate = 0.0700),
  commission_due public.egp_adjustment not null default 0,
  manual_adjustment public.egp_adjustment not null default 0,
  total_due public.egp_adjustment generated always as (commission_due + manual_adjustment) stored,
  status public.marketplace_statement_status not null default 'draft',
  issued_at timestamptz,
  paid_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, period_start),
  check (period_end > period_start),
  check (period_end = (period_start + interval '1 month')::date),
  check (status = 'draft' or total_due >= 0),
  check (status <> 'issued' or issued_at is not null),
  check (status <> 'paid' or paid_at is not null)
);

create index commission_statements_store_idx
  on public.commission_statements (store_id, period_start desc);

create table public.commission_statement_mutations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  statement_id uuid not null references public.commission_statements(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);
create index commission_statement_mutations_statement_idx
  on public.commission_statement_mutations (statement_id, created_at desc);

alter table public.commission_ledger
  add column statement_id uuid references public.commission_statements(id) on delete restrict;
create index commission_ledger_statement_fk_idx
  on public.commission_ledger (statement_id);

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique,
  type text not null check (type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  title text not null check (char_length(trim(title)) between 2 and 160),
  body text not null check (char_length(trim(body)) between 2 and 1000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index app_notifications_recipient_idx
  on public.app_notifications (recipient_id, created_at desc);
create index app_notifications_unread_idx
  on public.app_notifications (recipient_id, created_at desc) where read_at is null;

create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique
    default ('S-' || upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'))),
  customer_id uuid references public.marketplace_customers(id) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  order_id uuid references public.marketplace_orders(id) on delete restrict,
  subject text not null check (char_length(trim(subject)) between 3 and 160),
  status public.marketplace_support_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  retention_redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is not null or store_id is not null),
  check (status not in ('resolved', 'closed') or resolved_at is not null)
);

create index support_threads_customer_idx
  on public.support_threads (customer_id, last_message_at desc);
create index support_threads_store_idx
  on public.support_threads (store_id, status, last_message_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_kind text not null check (sender_kind in ('customer', 'merchant', 'admin', 'system')),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

create table public.support_thread_reads (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index support_thread_reads_user_idx
  on public.support_thread_reads (user_id, last_read_at desc);

-- Excel workbooks stay private in Spaces. They are not media assets and never
-- receive a public URL.
create table public.catalog_import_files (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name_snapshot text,
  bucket text not null check (char_length(trim(bucket)) between 3 and 255),
  object_key text not null unique check (object_key !~ '(^|/)\.\.(/|$)'),
  content_type text not null check (
    content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'deleted', 'quarantined')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'deleted' or deleted_at is not null)
);

create index catalog_import_files_store_idx
  on public.catalog_import_files (store_id, created_at desc) where status = 'active';

create table public.catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  requester_name_snapshot text,
  file_id uuid not null references public.catalog_import_files(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status public.marketplace_import_status not null default 'uploaded',
  source_filename text not null check (char_length(source_filename) between 1 and 255),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  applied_rows integer not null default 0 check (applied_rows >= 0),
  error_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(error_summary) = 'array'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  retention_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, idempotency_key),
  check (valid_rows + invalid_rows <= total_rows),
  check (applied_rows <= valid_rows),
  check (status not in ('completed', 'failed', 'cancelled') or completed_at is not null)
);

create index catalog_import_jobs_store_idx
  on public.catalog_import_jobs (store_id, created_at desc);
create index catalog_import_jobs_processing_idx
  on public.catalog_import_jobs (id) where status = 'processing';

create table public.catalog_import_rows (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.catalog_import_jobs(id) on delete cascade,
  sheet_name text not null check (sheet_name in ('Products', 'Variants', 'Images')),
  row_number integer not null check (row_number >= 2),
  entity_type text not null check (entity_type in ('product', 'variant', 'image')),
  raw_data jsonb not null check (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb check (normalized_data is null or jsonb_typeof(normalized_data) = 'object'),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'valid', 'invalid', 'applied', 'skipped')),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  worker_status text not null default 'pending'
    check (worker_status in ('pending', 'leased', 'retry', 'completed', 'dead_letter')),
  worker_attempts integer not null default 0 check (worker_attempts between 0 and 10),
  worker_available_at timestamptz not null default now(),
  worker_lease_expires_at timestamptz,
  worker_id uuid,
  worker_last_error text check (worker_last_error is null or char_length(worker_last_error) <= 1000),
  created_at timestamptz not null default now(),
  check (worker_status <> 'leased' or (worker_id is not null and worker_lease_expires_at is not null)),
  unique (job_id, sheet_name, row_number)
);

create index catalog_import_rows_job_idx
  on public.catalog_import_rows (job_id, status, sheet_name, row_number);
create index catalog_import_image_worker_idx
  on public.catalog_import_rows (worker_available_at, id)
  where sheet_name = 'Images' and status = 'valid'
    and worker_status in ('pending', 'retry', 'leased');
create index catalog_import_image_lease_expiry_idx
  on public.catalog_import_rows (worker_lease_expires_at, id)
  where sheet_name = 'Images' and status = 'valid' and worker_status = 'leased';

create table public.marketplace_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id text,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index marketplace_audit_entity_idx
  on public.marketplace_audit_log (entity_type, entity_id, created_at desc);
create index marketplace_audit_actor_idx
  on public.marketplace_audit_log (actor_user_id, created_at desc);

create table public.marketplace_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  topic text not null check (topic ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id uuid,
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now()
);

create index marketplace_outbox_pending_idx
  on public.marketplace_outbox (available_at, id)
  where processed_at is null;

create table public.marketplace_runtime_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{2,79}$'),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Server-only idempotency journal for catalog mutations. It is intentionally
-- not exposed through the Data API; authenticated callers use the auth-bound
-- RPCs defined below.
create table public.marketplace_catalog_mutations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name_snapshot text,
  store_id uuid not null references public.stores(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  operation text not null check (operation in ('create', 'update', 'archive')),
  product_id uuid references public.products(id) on delete restrict,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);

insert into public.marketplace_runtime_settings (key, value)
values (
  'schema_version',
  jsonb_build_object(
    'version', '20260810070000',
    'name', 'marketplace_commerce_foundation'
  )
), (
  'cod_risk_limits',
  jsonb_build_object(
    'max_open_order_groups', 1,
    'max_first_order_units', 10,
    'max_first_order_amount_piastres', 200000
  )
), (
  'marketplace_policy',
  jsonb_build_object(
    'return_window_days', 14,
    'order_pii_retention_days', 180,
    'import_retention_days', 30,
    'support_retention_days', 365
  )
);

-- Non-partial foreign-key indexes keep deletes and parent updates bounded.
create index customer_addresses_zone_fk_idx on public.customer_addresses (zone_id);
create index cart_coupon_selections_coupon_fk_idx on public.cart_coupon_selections (coupon_id);
create index cart_coupon_selections_store_fk_idx
  on public.cart_coupon_selections (applied_store_id);
create index checkout_requests_order_group_fk_idx on public.checkout_requests (order_group_id);
create index order_groups_cart_fk_idx on public.order_groups (cart_id);
create index order_groups_address_fk_idx on public.order_groups (address_id);
create index marketplace_orders_store_fk_idx on public.marketplace_orders (store_id);
create index marketplace_orders_zone_fk_idx on public.marketplace_orders (delivery_zone_id);
create index order_items_product_fk_idx on public.order_items (product_id);
create index inventory_reservations_variant_fk_idx on public.inventory_reservations (variant_id);
create index coupon_redemptions_order_fk_idx on public.coupon_redemptions (order_id);
create index products_category_fk_idx on public.products (category_id);
create index product_reviews_product_fk_idx on public.product_reviews (product_id);
create index upload_sessions_finalized_asset_fk_idx on public.upload_sessions (finalized_asset_id);
create index marketplace_delivery_driver_fk_idx on public.marketplace_delivery_assignments (driver_id);
create index marketplace_delivery_proof_asset_fk_idx on public.marketplace_delivery_assignments (proof_asset_id);
create index cod_collections_collected_by_fk_idx on public.cod_collections (collected_by);
create index cash_reconciliation_reviewed_by_fk_idx on public.cash_reconciliation_batches (reviewed_by);
create index support_threads_order_fk_idx on public.support_threads (order_id);
create index support_threads_admin_fk_idx on public.support_threads (assigned_admin_id);
create index support_messages_sender_fk_idx on public.support_messages (sender_user_id);
create index catalog_import_jobs_file_fk_idx on public.catalog_import_jobs (file_id);
create index catalog_import_rows_product_fk_idx on public.catalog_import_rows (product_id);
create index catalog_import_rows_variant_fk_idx on public.catalog_import_rows (variant_id);
create index marketplace_order_events_actor_fk_idx on public.marketplace_order_events (actor_user_id);
create index commission_ledger_store_fk_idx on public.commission_ledger (store_id);
create index merchant_memberships_invited_by_fk_idx on public.merchant_memberships (invited_by);
create index stores_created_by_fk_idx on public.stores (created_by);
create index store_memberships_invited_by_fk_idx on public.store_memberships (invited_by);
create index products_created_by_fk_idx on public.products (created_by);
create index carts_customer_fk_idx on public.carts (customer_id);
create index carts_merged_into_fk_idx on public.carts (merged_into_cart_id);
create index marketplace_coupons_store_fk_idx on public.marketplace_coupons (store_id);
create index marketplace_coupons_created_by_fk_idx on public.marketplace_coupons (created_by);
create index coupon_redemptions_customer_fk_idx on public.coupon_redemptions (customer_id);
create index upload_sessions_merchant_fk_idx on public.upload_sessions (merchant_id);
create index media_assets_merchant_fk_idx on public.media_assets (merchant_id);
create index marketplace_delivery_driver_full_fk_idx
  on public.marketplace_delivery_assignments (driver_id);
create index commission_ledger_source_fk_idx on public.commission_ledger (source_entry_id);
create index catalog_import_files_owner_fk_idx on public.catalog_import_files (owner_id);
create index catalog_import_jobs_requested_by_fk_idx on public.catalog_import_jobs (requested_by);
create index marketplace_runtime_settings_updated_by_fk_idx
  on public.marketplace_runtime_settings (updated_by);
create index marketplace_catalog_mutations_store_fk_idx
  on public.marketplace_catalog_mutations (store_id);
create index marketplace_catalog_mutations_product_fk_idx
  on public.marketplace_catalog_mutations (product_id);
create index marketplace_catalog_mutations_actor_fk_idx
  on public.marketplace_catalog_mutations (actor_user_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers and authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'marketplace_customers', 'merchant_memberships', 'stores', 'store_memberships',
    'product_categories', 'products', 'product_variants', 'delivery_zones',
    'store_delivery_zones', 'customer_addresses', 'carts', 'cart_items',
    'cart_coupon_selections',
    'marketplace_orders', 'product_reviews', 'upload_sessions', 'media_assets',
    'product_images', 'store_images', 'marketplace_delivery_assignments',
    'marketplace_delivery_offers',
    'cod_collections', 'cash_reconciliation_batches', 'commission_statements',
    'support_threads', 'catalog_import_files', 'catalog_import_jobs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.marketplace_touch_updated_at()',
      table_name || '_marketplace_touch_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.is_marketplace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
      and profile.is_active
  );
$$;

create or replace function public.can_manage_merchant(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_marketplace_admin() or exists (
    select 1
    from public.merchant_memberships as membership
    where membership.merchant_id = p_merchant_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('owner', 'manager')
  ) or exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'merchant'
      and profile.merchant_id = p_merchant_id
      and profile.is_active
  );
$$;

create or replace function public.can_manage_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_marketplace_admin() or exists (
    select 1
    from public.store_memberships as membership
    where membership.store_id = p_store_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('owner', 'manager')
  ) or exists (
    select 1
    from public.stores as store
    where store.id = p_store_id
      and public.can_manage_merchant(store.merchant_id)
  );
$$;

create or replace function public.can_catalog_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_marketplace_admin() or exists (
    select 1
    from public.store_memberships as membership
    where membership.store_id = p_store_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('owner', 'manager', 'catalog')
  ) or exists (
    select 1
    from public.stores as store
    where store.id = p_store_id
      and public.can_manage_merchant(store.merchant_id)
  );
$$;

create or replace function public.can_fulfill_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_marketplace_admin() or exists (
    select 1
    from public.store_memberships as membership
    where membership.store_id = p_store_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('owner', 'manager', 'fulfillment')
  ) or exists (
    select 1
    from public.stores as store
    where store.id = p_store_id
      and public.can_manage_merchant(store.merchant_id)
  );
$$;

create or replace function public.can_read_marketplace_order(
  p_order_id uuid,
  p_store_id uuid,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_marketplace_admin()
    or public.can_fulfill_store(p_store_id)
    or exists (
      select 1 from public.marketplace_customers as customer
      where customer.id = p_customer_id
        and customer.auth_user_id = (select auth.uid())
        and customer.is_active
    )
    or exists (
      select 1 from public.marketplace_delivery_assignments as assignment
      where assignment.order_id = p_order_id
        and assignment.driver_id = (select auth.uid())
    );
$$;

create or replace function public.enforce_store_moderation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('pending_review', 'archived'))
    or (old.status = 'pending_review' and new.status in ('draft', 'published', 'archived'))
    or (old.status = 'published' and new.status in ('suspended', 'archived'))
    or (old.status = 'suspended' and new.status in ('published', 'archived'))
  ) then
    raise exception 'invalid_store_moderation_transition:%->%', old.status, new.status;
  end if;

  if new.status = 'pending_review' and new.first_submitted_at is null then
    new.first_submitted_at := now();
  end if;
  if new.status = 'published' and old.first_published_at is null then
    if old.status <> 'pending_review' then
      raise exception 'first_store_publication_requires_review';
    end if;
    new.first_published_at := now();
  end if;
  return new;
end;
$$;

create trigger stores_enforce_moderation
before update of status on public.stores
for each row execute function public.enforce_store_moderation_transition();

create or replace function public.enforce_product_moderation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    if nullif(trim(coalesce(new.description, '')), '') is null then
      raise exception 'active_product_description_required' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.product_images as image
      join public.media_assets as asset on asset.id = image.media_asset_id
      where image.product_id = old.id and asset.status = 'active'
    ) then
      raise exception 'active_product_image_required' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.product_variants as variant
      join public.inventory_stock as stock on stock.variant_id = variant.id
      where variant.product_id = old.id and variant.is_active
    ) then
      raise exception 'active_product_variant_required' using errcode = '23514';
    end if;
  end if;
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('pending_review', 'archived'))
    or (old.status = 'pending_review' and new.status in ('draft', 'active', 'rejected', 'archived'))
    or (old.status = 'rejected' and new.status in ('draft', 'pending_review', 'archived'))
    or (old.status = 'active' and new.status = 'archived')
  ) then
    raise exception 'invalid_product_moderation_transition:%->%', old.status, new.status;
  end if;

  if new.status = 'pending_review' and new.first_submitted_at is null then
    new.first_submitted_at := now();
  end if;
  if new.status = 'active' and old.first_published_at is null then
    if old.status <> 'pending_review' then
      raise exception 'first_product_publication_requires_review';
    end if;
    new.first_published_at := now();
  end if;
  return new;
end;
$$;

create trigger products_enforce_moderation
before update of status, description on public.products
for each row execute function public.enforce_product_moderation_transition();

-- Product publication requirements are also checked at transaction end when
-- related image, variant, stock, or media rows change. Deferral permits safe
-- atomic reorder/replacement operations without creating a transient invalid
-- product while still preventing an active product from committing invalid.
create or replace function public.enforce_active_product_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  if tg_table_name = 'product_images' then
    v_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  elsif tg_table_name = 'product_variants' then
    v_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  elsif tg_table_name = 'inventory_stock' then
    select variant.product_id into v_product_id
    from public.product_variants as variant
    where variant.id = case when tg_op = 'DELETE' then old.variant_id else new.variant_id end;
  elsif tg_table_name = 'media_assets' then
    if (case when tg_op = 'DELETE' then old.entity_type else new.entity_type end) = 'product' then
      v_product_id := case when tg_op = 'DELETE' then old.entity_id else new.entity_id end;
    end if;
  end if;

  if v_product_id is null or not exists (
    select 1 from public.products
    where id = v_product_id and status = 'active'
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.products
    where id = v_product_id
      and nullif(trim(coalesce(description, '')), '') is not null
  ) then
    raise exception 'active_product_description_required' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.product_images as image
    join public.media_assets as asset
      on asset.id = image.media_asset_id and asset.status = 'active'
    where image.product_id = v_product_id
  ) then
    raise exception 'active_product_image_required' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.product_variants as variant
    join public.inventory_stock as stock on stock.variant_id = variant.id
    where variant.product_id = v_product_id and variant.is_active
  ) then
    raise exception 'active_product_variant_required' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger product_images_enforce_active_product
after insert or update or delete on public.product_images
deferrable initially deferred
for each row execute function public.enforce_active_product_integrity();
create constraint trigger product_variants_enforce_active_product
after insert or update or delete on public.product_variants
deferrable initially deferred
for each row execute function public.enforce_active_product_integrity();
create constraint trigger inventory_stock_enforce_active_product
after insert or update or delete on public.inventory_stock
deferrable initially deferred
for each row execute function public.enforce_active_product_integrity();
create constraint trigger media_assets_enforce_active_product
after update or delete on public.media_assets
deferrable initially deferred
for each row execute function public.enforce_active_product_integrity();

create or replace function public.validate_product_variant_store()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_store_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.product_id is distinct from old.product_id
    or new.store_id is distinct from old.store_id
  ) then
    raise exception 'variant_tenant_identity_is_immutable';
  end if;
  select store_id into v_store_id
  from public.products
  where id = new.product_id;
  if v_store_id is null then
    raise exception 'variant_product_not_found';
  end if;
  if new.store_id is not null and new.store_id <> v_store_id then
    raise exception 'variant_store_mismatch';
  end if;
  new.store_id := v_store_id;
  return new;
end;
$$;

create trigger product_variants_validate_store
before insert or update of product_id, store_id on public.product_variants
for each row execute function public.validate_product_variant_store();

create or replace function public.protect_marketplace_tenant_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'stores' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.first_submitted_at := null;
      new.first_published_at := null;
    elsif new.merchant_id is distinct from old.merchant_id then
      raise exception 'store_merchant_is_immutable';
    end if;
  elsif tg_table_name = 'products' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.first_submitted_at := null;
      new.first_published_at := null;
    elsif new.store_id is distinct from old.store_id then
      raise exception 'product_store_is_immutable';
    end if;
  elsif tg_table_name = 'upload_sessions' then
    if tg_op = 'UPDATE' and (
      new.owner_id is distinct from old.owner_id
      or new.merchant_id is distinct from old.merchant_id
      or new.store_id is distinct from old.store_id
      or new.entity_type is distinct from old.entity_type
      or new.entity_id is distinct from old.entity_id
      or new.staging_key is distinct from old.staging_key
    ) then
      -- FK-driven user deletion may null owner_id; that is the only identity
      -- change allowed after creation.
      if not (old.owner_id is not null and new.owner_id is null
              and new.merchant_id = old.merchant_id
              and new.store_id = old.store_id
              and new.entity_type = old.entity_type
              and new.entity_id = old.entity_id
              and new.staging_key = old.staging_key) then
        raise exception 'upload_session_identity_is_immutable';
      end if;
    end if;
  elsif tg_table_name = 'media_assets' and tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id
       and not (old.owner_id is not null and new.owner_id is null) then
      raise exception 'media_asset_owner_is_immutable';
    end if;
    if new.merchant_id is distinct from old.merchant_id
       or new.store_id is distinct from old.store_id
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.bucket is distinct from old.bucket
       or new.object_key is distinct from old.object_key
       or new.public_url is distinct from old.public_url then
      raise exception 'media_asset_identity_is_immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger stores_protect_tenant_identity
before insert or update of merchant_id on public.stores
for each row execute function public.protect_marketplace_tenant_identity();
create trigger products_protect_tenant_identity
before insert or update of store_id on public.products
for each row execute function public.protect_marketplace_tenant_identity();
create trigger upload_sessions_protect_identity
before update of owner_id, merchant_id, store_id, entity_type, entity_id, staging_key
on public.upload_sessions
for each row execute function public.protect_marketplace_tenant_identity();
create trigger media_assets_protect_identity
before update of owner_id, merchant_id, store_id, entity_type, entity_id, bucket, object_key, public_url
on public.media_assets
for each row execute function public.protect_marketplace_tenant_identity();

create or replace function public.ensure_marketplace_customer()
returns public.marketplace_customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
  v_customer public.marketplace_customers;
  v_display_name text;
  v_avatar_url text;
  v_provider text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_user
  from auth.users
  where id = (select auth.uid());

  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- raw_user_meta_data is used only for presentation fields, never for access
  -- control. Provider authorization data comes from server-owned app metadata.
  v_display_name := nullif(trim(coalesce(
    v_user.raw_user_meta_data ->> 'full_name',
    v_user.raw_user_meta_data ->> 'name',
    split_part(coalesce(v_user.email, ''), '@', 1),
    'Customer'
  )), '');
  v_display_name := left(coalesce(v_display_name, 'Customer'), 120);

  v_avatar_url := nullif(v_user.raw_user_meta_data ->> 'avatar_url', '');
  if v_avatar_url is not null and v_avatar_url !~ '^https://' then
    v_avatar_url := null;
  end if;

  v_provider := lower(coalesce(v_user.raw_app_meta_data ->> 'provider', 'google'));
  if v_provider !~ '^[a-z0-9_.-]{2,32}$' then
    v_provider := 'google';
  end if;

  insert into public.marketplace_customers (
    auth_user_id,
    email,
    email_verified_at,
    display_name,
    avatar_url,
    primary_provider
  ) values (
    v_user.id,
    lower(v_user.email),
    v_user.email_confirmed_at,
    v_display_name,
    v_avatar_url,
    v_provider
  )
  on conflict (auth_user_id) do update
  set email = excluded.email,
      email_verified_at = excluded.email_verified_at,
      avatar_url = coalesce(excluded.avatar_url, public.marketplace_customers.avatar_url),
      primary_provider = excluded.primary_provider,
      updated_at = now()
  returning * into v_customer;

  return v_customer;
end;
$$;

create or replace function public.enforce_cart_item_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.carts where id = new.cart_id for update;
  if not found then
    raise exception 'cart_not_found';
  end if;

  if tg_op = 'INSERT' and (
    select count(*) from public.cart_items where cart_id = new.cart_id
  ) >= 100 then
    raise exception 'cart_item_limit_reached';
  end if;
  return new;
end;
$$;

create trigger cart_items_enforce_limit
before insert or update on public.cart_items
for each row execute function public.enforce_cart_item_limit();

create or replace function public.claim_guest_cart(
  p_cart_id uuid,
  p_guest_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.marketplace_customers;
  v_guest public.carts;
  v_target public.carts;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_guest_token is null or char_length(p_guest_token) not between 32 and 256 then
    raise exception 'invalid_guest_token' using errcode = '22023';
  end if;

  v_customer := public.ensure_marketplace_customer();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-cart:' || v_customer.id::text, 0)
  );

  select * into v_guest
  from public.carts
  where id = p_cart_id
    and status = 'active'
    and guest_token_hash = extensions.digest(pg_catalog.convert_to(p_guest_token, 'UTF8'), 'sha256')
  for update;

  if v_guest is null or v_guest.expires_at <= now() then
    raise exception 'guest_cart_not_found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.carts
  where customer_id = v_customer.id
    and status = 'active'
  for update;

  if v_target is null then
    update public.carts
    set customer_id = v_customer.id,
        guest_token_hash = null,
        expires_at = now() + interval '30 days',
        updated_at = now()
    where id = v_guest.id;
    return v_guest.id;
  end if;

  if exists (
    select 1
    from public.cart_items as guest_item
    join public.cart_items as target_item
      on target_item.cart_id = v_target.id
     and target_item.variant_id = guest_item.variant_id
    where guest_item.cart_id = v_guest.id
      and guest_item.quantity + target_item.quantity > 99
  ) then
    raise exception 'cart_quantity_limit_reached' using errcode = '22023';
  end if;

  if (
    select count(distinct variant_id)
    from public.cart_items
    where cart_id in (v_guest.id, v_target.id)
  ) > 100 then
    raise exception 'cart_item_limit_reached' using errcode = '22023';
  end if;

  insert into public.cart_items (cart_id, variant_id, quantity)
  select v_target.id, item.variant_id, item.quantity
  from public.cart_items as item
  where item.cart_id = v_guest.id
  on conflict (cart_id, variant_id) do update
  set quantity = public.cart_items.quantity + excluded.quantity,
      updated_at = now();

  delete from public.cart_items where cart_id = v_guest.id;
  update public.carts
  set customer_id = v_customer.id,
      guest_token_hash = null,
      status = 'merged',
      merged_into_cart_id = v_target.id,
      updated_at = now()
  where id = v_guest.id;

  return v_target.id;
end;
$$;

create or replace function public.marketplace_cart_is_owned(
  p_cart_id uuid,
  p_customer_id uuid,
  p_guest_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.carts as cart
    where cart.id = p_cart_id
      and cart.status = 'active'
      and cart.expires_at > now()
      and (
        (p_customer_id is not null and cart.customer_id = p_customer_id)
        or (
          p_customer_id is null
          and p_guest_token is not null
          and char_length(p_guest_token) between 32 and 256
          and cart.guest_token_hash = extensions.digest(
            pg_catalog.convert_to(p_guest_token, 'UTF8'), 'sha256'
          )
        )
      )
  );
$$;

create or replace function public.get_or_create_guest_cart(p_guest_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_cart_id uuid;
begin
  if p_guest_token is null or char_length(p_guest_token) not between 32 and 256 then
    raise exception 'invalid_guest_token' using errcode = '22023';
  end if;
  v_hash := extensions.digest(pg_catalog.convert_to(p_guest_token, 'UTF8'), 'sha256');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.encode(v_hash, 'hex'), 0)
  );

  update public.carts
  set status = 'abandoned', updated_at = now()
  where guest_token_hash = v_hash
    and status = 'active'
    and expires_at <= now();

  select id into v_cart_id
  from public.carts
  where guest_token_hash = v_hash
    and status = 'active'
  for update;

  if v_cart_id is null then
    insert into public.carts (guest_token_hash)
    values (v_hash)
    returning id into v_cart_id;
  end if;
  return v_cart_id;
end;
$$;

create or replace function public.get_or_create_customer_cart(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
begin
  if not exists (
    select 1 from public.marketplace_customers
    where id = p_customer_id and is_active
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-cart:' || p_customer_id::text, 0)
  );

  update public.carts
  set status = 'abandoned', updated_at = now()
  where customer_id = p_customer_id
    and status = 'active'
    and expires_at <= now();

  select id into v_cart_id
  from public.carts
  where customer_id = p_customer_id and status = 'active'
  for update;
  if v_cart_id is null then
    insert into public.carts (customer_id)
    values (p_customer_id)
    returning id into v_cart_id;
  end if;
  return v_cart_id;
end;
$$;

create or replace function public.get_marketplace_cart(
  p_cart_id uuid,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.marketplace_cart_is_owned(p_cart_id, p_customer_id, p_guest_token) then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', cart.id,
    'status', cart.status,
    'currency', cart.currency,
    'expires_at', cart.expires_at,
    'item_count', coalesce((
      select sum(item.quantity)::integer from public.cart_items as item where item.cart_id = cart.id
    ), 0),
    'subtotal', coalesce((
      select sum(item.quantity * variant.price)::bigint
      from public.cart_items as item
      join public.product_variants as variant on variant.id = item.variant_id
      where item.cart_id = cart.id
    ), 0),
    'coupon', (
      select jsonb_build_object(
        'coupon_id', selection.coupon_id,
        'code', selection.code_snapshot,
        'store_id', selection.applied_store_id,
        'discount_type', coupon.discount_type,
        'discount_percent', coupon.discount_percent,
        'discount_amount_piastres', coupon.discount_amount_piastres,
        'discount_preview', case coupon.discount_type
          when 'fixed' then least(coupon.discount_amount_piastres, eligible.subtotal)
          else least(
            round(eligible.subtotal * coupon.discount_percent / 100, 0)::bigint,
            coalesce(coupon.max_discount, eligible.subtotal)
          )
        end
      )
      from public.cart_coupon_selections as selection
      join public.marketplace_coupons as coupon on coupon.id = selection.coupon_id
      cross join lateral (
        select coalesce(sum(variant.price * item.quantity), 0)::bigint as subtotal
        from public.cart_items as item
        join public.product_variants as variant on variant.id = item.variant_id
        join public.products as product on product.id = variant.product_id
        where item.cart_id = cart.id
          and product.store_id = selection.applied_store_id
          and (
            (
              not exists (
                select 1 from public.marketplace_coupon_products
                where coupon_id = coupon.id
              )
              and not exists (
                select 1 from public.marketplace_coupon_categories
                where coupon_id = coupon.id
              )
            )
            or exists (
              select 1 from public.marketplace_coupon_products
              where coupon_id = coupon.id and product_id = product.id
            )
            or exists (
              select 1 from public.marketplace_coupon_categories
              where coupon_id = coupon.id and category_id = product.category_id
            )
          )
      ) as eligible
      where selection.cart_id = cart.id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'variant_id', variant.id,
        'product_id', product.id,
        'store_id', product.store_id,
        'store', jsonb_build_object('id', store.id, 'name', store.name, 'slug', store.slug),
        'product_name', product.name,
        'product_slug', product.slug,
        'variant_name', variant.title,
        'sku', variant.sku,
        'attributes', variant.attributes,
        'unit_price', variant.price,
        'compare_at_price', variant.compare_at_price,
        'is_default', variant.is_default,
        'quantity', item.quantity,
        'max_quantity', case
          when stock.variant_id is null then 0
          when not stock.track_inventory then 99
          else greatest(0, least(99, stock.on_hand - stock.reserved))
        end,
        'line_total', variant.price * item.quantity,
        'image_url', (
          select asset.public_url
          from public.product_images as image
          join public.media_assets as asset on asset.id = image.media_asset_id
          where image.product_id = product.id and asset.status = 'active'
          order by image.position limit 1
        ),
        'available', (
          stock.variant_id is not null
          and product.status = 'active'
          and variant.is_active
          and store.status = 'published'
          and (not stock.track_inventory or stock.on_hand - stock.reserved >= item.quantity)
        )
      ) order by item.created_at)
      from public.cart_items as item
      join public.product_variants as variant on variant.id = item.variant_id
      join public.products as product on product.id = variant.product_id
      join public.stores as store on store.id = product.store_id
      left join public.inventory_stock as stock on stock.variant_id = variant.id
      where item.cart_id = cart.id
    ), '[]'::jsonb)
  ) into v_result
  from public.carts as cart
  where cart.id = p_cart_id;

  return v_result;
end;
$$;

create or replace function public.mutate_marketplace_cart_item(
  p_operation text,
  p_cart_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_customer_id uuid,
  p_guest_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart public.carts;
  v_existing public.cart_items;
  v_stock public.inventory_stock;
  v_result_quantity integer;
begin
  select * into v_cart from public.carts where id = p_cart_id for update;
  if v_cart is null
     or not public.marketplace_cart_is_owned(p_cart_id, p_customer_id, p_guest_token) then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.cart_items
  where cart_id = p_cart_id and variant_id = p_variant_id
  for update;

  if p_operation = 'remove' then
    delete from public.cart_items where id = v_existing.id;
    delete from public.cart_coupon_selections where cart_id = p_cart_id;
    return public.get_marketplace_cart(p_cart_id, p_customer_id, p_guest_token);
  end if;

  if p_quantity is null or p_quantity not between 1 and 99 then
    raise exception 'invalid_cart_quantity' using errcode = '22023';
  end if;
  if p_operation = 'add' then
    v_result_quantity := coalesce(v_existing.quantity, 0) + p_quantity;
  elsif p_operation = 'update' then
    if v_existing is null then
      raise exception 'cart_item_not_found' using errcode = 'P0002';
    end if;
    v_result_quantity := p_quantity;
  else
    raise exception 'invalid_cart_operation' using errcode = '22023';
  end if;
  if v_result_quantity > 99 then
    raise exception 'cart_quantity_limit_reached' using errcode = '22023';
  end if;

  select stock.* into v_stock
  from public.inventory_stock as stock
  join public.product_variants as variant
    on variant.id = stock.variant_id and variant.is_active
  join public.products as product
    on product.id = variant.product_id and product.status = 'active'
  join public.stores as store
    on store.id = product.store_id and store.status = 'published'
  where stock.variant_id = p_variant_id
  for update of stock;

  if v_stock is null
     or (v_stock.track_inventory and v_stock.on_hand - v_stock.reserved < v_result_quantity) then
    raise exception 'variant_unavailable' using errcode = '22023';
  end if;

  insert into public.cart_items (cart_id, variant_id, quantity)
  values (p_cart_id, p_variant_id, v_result_quantity)
  on conflict (cart_id, variant_id) do update
  set quantity = excluded.quantity,
      updated_at = now();

  -- Product changes can invalidate the previewed coupon. Re-application is
  -- explicit so checkout never silently changes a promised code.
  delete from public.cart_coupon_selections where cart_id = p_cart_id;
  update public.carts set expires_at = now() + interval '30 days', updated_at = now()
  where id = p_cart_id;
  return public.get_marketplace_cart(p_cart_id, p_customer_id, p_guest_token);
end;
$$;

create or replace function public.add_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.mutate_marketplace_cart_item(
    'add', p_cart_id, p_variant_id, p_quantity, p_customer_id, p_guest_token
  );
$$;

create or replace function public.update_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.mutate_marketplace_cart_item(
    'update', p_cart_id, p_variant_id, p_quantity, p_customer_id, p_guest_token
  );
$$;

create or replace function public.remove_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.mutate_marketplace_cart_item(
    'remove', p_cart_id, p_variant_id, null, p_customer_id, p_guest_token
  );
$$;

create or replace function public.apply_marketplace_cart_coupon(
  p_cart_id uuid,
  p_code text,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coupon public.marketplace_coupons;
  v_choice record;
  v_customer_redemptions integer;
  v_eligible bigint;
  v_discount bigint;
begin
  perform 1 from public.carts where id = p_cart_id for update;
  if not found
     or not public.marketplace_cart_is_owned(p_cart_id, p_customer_id, p_guest_token) then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;
  if p_code is null or upper(trim(p_code)) !~ '^[A-Z0-9_-]{3,32}$' then
    raise exception 'invalid_coupon_code' using errcode = '22023';
  end if;

  select coupon.id as coupon_id, totals.store_id, totals.subtotal
  into v_choice
  from public.marketplace_coupons as coupon
  join (
    select product.store_id, sum(variant.price * item.quantity)::bigint as subtotal
    from public.cart_items as item
    join public.product_variants as variant on variant.id = item.variant_id
    join public.products as product on product.id = variant.product_id
    where item.cart_id = p_cart_id
    group by product.store_id
  ) as totals on coupon.store_id is null or coupon.store_id = totals.store_id
  where coupon.code = upper(trim(p_code))
    and coupon.is_active
    and (coupon.starts_at is null or coupon.starts_at <= now())
    and (coupon.expires_at is null or coupon.expires_at > now())
    and totals.subtotal >= coupon.minimum_order
    and (coupon.total_limit is null or coupon.redeemed_count < coupon.total_limit)
  order by (coupon.store_id is not null) desc, totals.subtotal desc, coupon.id
  limit 1;

  if v_choice is null then
    raise exception 'coupon_not_applicable' using errcode = '22023';
  end if;

  select * into v_coupon
  from public.marketplace_coupons
  where id = v_choice.coupon_id
  for update;

  if p_customer_id is not null then
    select count(*)::integer into v_customer_redemptions
    from public.coupon_redemptions
    where coupon_id = v_coupon.id
      and customer_id = p_customer_id
      and voided_at is null;
    if v_customer_redemptions >= v_coupon.per_customer_limit then
      raise exception 'coupon_customer_limit_reached' using errcode = '22023';
    end if;
  end if;

  select coalesce(sum(variant.price * item.quantity), 0)::bigint
  into v_eligible
  from public.cart_items as item
  join public.product_variants as variant on variant.id = item.variant_id
  join public.products as product on product.id = variant.product_id
  where item.cart_id = p_cart_id
    and product.store_id = v_choice.store_id
    and (
      (
        not exists (select 1 from public.marketplace_coupon_products where coupon_id = v_coupon.id)
        and not exists (select 1 from public.marketplace_coupon_categories where coupon_id = v_coupon.id)
      )
      or exists (
        select 1 from public.marketplace_coupon_products
        where coupon_id = v_coupon.id and product_id = product.id
      )
      or exists (
        select 1 from public.marketplace_coupon_categories
        where coupon_id = v_coupon.id and category_id = product.category_id
      )
    );

  if v_eligible <= 0 then
    raise exception 'coupon_has_no_eligible_items' using errcode = '22023';
  end if;
  if v_eligible < v_coupon.minimum_order then
    raise exception 'coupon_minimum_order_not_met' using errcode = '22023';
  end if;
  v_discount := case v_coupon.discount_type
    when 'fixed' then least(v_coupon.discount_amount_piastres, v_eligible)
    else round(v_eligible * v_coupon.discount_percent / 100, 0)::bigint
  end;
  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;

  insert into public.cart_coupon_selections (
    cart_id, coupon_id, applied_store_id, code_snapshot
  ) values (
    p_cart_id, v_coupon.id, v_choice.store_id, v_coupon.code
  ) on conflict (cart_id) do update
  set coupon_id = excluded.coupon_id,
      applied_store_id = excluded.applied_store_id,
      code_snapshot = excluded.code_snapshot,
      applied_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'code', v_coupon.code,
    'store_id', v_choice.store_id,
    'discount_preview', v_discount,
    'currency', 'EGP'
  );
end;
$$;

create or replace function public.remove_marketplace_cart_coupon(
  p_cart_id uuid,
  p_customer_id uuid default null,
  p_guest_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.carts where id = p_cart_id for update;
  if not found
     or not public.marketplace_cart_is_owned(p_cart_id, p_customer_id, p_guest_token) then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;
  delete from public.cart_coupon_selections where cart_id = p_cart_id;
  return found;
end;
$$;

create or replace function public.preview_marketplace_checkout(
  p_customer_id uuid,
  p_cart_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cart jsonb;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.marketplace_customers
    where id = p_customer_id and is_active
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  v_cart := public.get_marketplace_cart(p_cart_id, p_customer_id, null);

  with cart_stores as materialized (
    select
      store.id,
      store.slug,
      store.name,
      store.delivery_mode,
      sum(variant.price * item.quantity)::bigint as subtotal_piastres
    from public.cart_items as item
    join public.product_variants as variant on variant.id = item.variant_id
    join public.products as product on product.id = variant.product_id
    join public.stores as store on store.id = product.store_id
    where item.cart_id = p_cart_id
    group by store.id, store.slug, store.name, store.delivery_mode
  ), zone_store_options as materialized (
    select
      zone.id as zone_id,
      zone.code as zone_code,
      zone.name_ar,
      zone.name_en,
      cart_store.id as store_id,
      min(case
        when delivery.free_delivery_threshold is not null
         and cart_store.subtotal_piastres >= delivery.free_delivery_threshold then 0
        else delivery.fee
      end)::bigint as minimum_fee_piastres,
      jsonb_agg(jsonb_build_object(
        'mode', delivery.delivery_mode,
        'fee_piastres', case
          when delivery.free_delivery_threshold is not null
           and cart_store.subtotal_piastres >= delivery.free_delivery_threshold then 0
          else delivery.fee
        end,
        'estimated_minutes_min', delivery.estimated_minutes_min,
        'estimated_minutes_max', delivery.estimated_minutes_max
      ) order by delivery.delivery_mode) as options
    from cart_stores as cart_store
    join public.store_delivery_zones as delivery
      on delivery.store_id = cart_store.id and delivery.is_active
    join public.delivery_zones as zone
      on zone.id = delivery.zone_id and zone.is_active
    where cart_store.subtotal_piastres >= delivery.minimum_order
      and (
        cart_store.delivery_mode = 'flexible'
        or cart_store.delivery_mode = delivery.delivery_mode
      )
    group by zone.id, zone.code, zone.name_ar, zone.name_en, cart_store.id
  ), valid_zones as (
    select
      option.zone_id,
      max(option.zone_code) as zone_code,
      max(option.name_ar) as name_ar,
      max(option.name_en) as name_en,
      sum(option.minimum_fee_piastres)::bigint as aggregate_fee_piastres,
      jsonb_agg(jsonb_build_object(
        'store_id', option.store_id,
        'options', option.options
      ) order by option.store_id) as store_options
    from zone_store_options as option
    group by option.zone_id
    having count(distinct option.store_id) = (select count(*) from cart_stores)
  )
  select jsonb_build_object(
    'cart', v_cart,
    'customer', (
      select jsonb_build_object(
        'id', customer.id,
        'display_name', customer.display_name,
        'email', customer.email,
        'phone', customer.phone,
        'phone_verified', customer.phone_verified_at is not null
      )
      from public.marketplace_customers as customer
      where customer.id = p_customer_id
    ),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', address.id,
        'zone_id', address.zone_id,
        'label', address.label,
        'recipient_name', address.recipient_name,
        'recipient_phone', address.recipient_phone,
        'address_line', address.address_line,
        'building', address.building,
        'floor', address.floor,
        'apartment', address.apartment,
        'landmark', address.landmark,
        'is_default', address.is_default
      ) order by address.is_default desc, address.updated_at desc)
      from public.customer_addresses as address
      where address.customer_id = p_customer_id
    ), '[]'::jsonb),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cart_store.id,
        'slug', cart_store.slug,
        'name', cart_store.name,
        'delivery_mode', cart_store.delivery_mode,
        'subtotal_piastres', cart_store.subtotal_piastres
      ) order by cart_store.id)
      from cart_stores as cart_store
    ), '[]'::jsonb),
    'delivery_zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', valid_zone.zone_id,
        'code', valid_zone.zone_code,
        'name_ar', valid_zone.name_ar,
        'name_en', valid_zone.name_en,
        'aggregate_fee_piastres', valid_zone.aggregate_fee_piastres,
        'store_options', valid_zone.store_options
      ) order by valid_zone.name_ar)
      from valid_zones as valid_zone
    ), '[]'::jsonb),
    'coupon', v_cart -> 'coupon'
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_or_create_my_marketplace_cart()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer public.marketplace_customers;
begin
  v_customer := public.ensure_marketplace_customer();
  return public.get_or_create_customer_cart(v_customer.id);
end;
$$;

create or replace function public.get_my_marketplace_cart(p_cart_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id
  from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.get_marketplace_cart(p_cart_id, v_customer_id, null);
end;
$$;

create or replace function public.add_my_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.add_marketplace_cart_item(
    p_cart_id, p_variant_id, p_quantity, v_customer_id, null
  );
end;
$$;

create or replace function public.update_my_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.update_marketplace_cart_item(
    p_cart_id, p_variant_id, p_quantity, v_customer_id, null
  );
end;
$$;

create or replace function public.remove_my_marketplace_cart_item(
  p_cart_id uuid,
  p_variant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.remove_marketplace_cart_item(p_cart_id, p_variant_id, v_customer_id, null);
end;
$$;

create or replace function public.apply_my_marketplace_cart_coupon(
  p_cart_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.apply_marketplace_cart_coupon(p_cart_id, p_code, v_customer_id, null);
end;
$$;

create or replace function public.remove_my_marketplace_cart_coupon(p_cart_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.remove_marketplace_cart_coupon(p_cart_id, v_customer_id, null);
end;
$$;

create or replace function public.preview_my_marketplace_checkout(p_cart_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  return public.preview_marketplace_checkout(v_customer_id, p_cart_id);
end;
$$;

create or replace function public.validate_marketplace_media_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_store_id uuid;
begin
  select store.merchant_id into v_merchant_id
  from public.stores as store
  where store.id = new.store_id;

  if v_merchant_id is null or v_merchant_id <> new.merchant_id then
    raise exception 'media_store_merchant_mismatch';
  end if;

  case new.entity_type
    when 'product' then
      select product.store_id into v_store_id
      from public.products as product
      where product.id = new.entity_id;
      if v_store_id is null or v_store_id <> new.store_id then
        raise exception 'media_product_store_mismatch';
      end if;
    when 'store' then
      if new.entity_id <> new.store_id then
        raise exception 'media_store_entity_mismatch';
      end if;
    when 'review' then
      select product.store_id into v_store_id
      from public.product_reviews as review
      join public.products as product on product.id = review.product_id
      where review.id = new.entity_id;
      if v_store_id is null or v_store_id <> new.store_id then
        raise exception 'media_review_store_mismatch';
      end if;
    when 'support' then
      select thread.store_id into v_store_id
      from public.support_threads as thread
      where thread.id = new.entity_id;
      if v_store_id is null or v_store_id <> new.store_id then
        raise exception 'media_support_store_mismatch';
      end if;
    when 'import' then
      if new.entity_id <> new.store_id then
        raise exception 'media_import_store_mismatch';
      end if;
    when 'delivery_proof' then
      select marketplace_order.store_id into v_store_id
      from public.marketplace_orders as marketplace_order
      where marketplace_order.id = new.entity_id;
      if v_store_id is null or v_store_id <> new.store_id then
        raise exception 'media_delivery_proof_order_mismatch';
      end if;
  end case;

  return new;
end;
$$;

create trigger upload_sessions_validate_binding
before insert or update of merchant_id, store_id, entity_type, entity_id
on public.upload_sessions
for each row execute function public.validate_marketplace_media_binding();

create trigger media_assets_validate_binding
before insert or update of merchant_id, store_id, entity_type, entity_id
on public.media_assets
for each row execute function public.validate_marketplace_media_binding();

create or replace function public.validate_product_image_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.media_assets as asset
    join public.products as product on product.id = new.product_id
    where asset.id = new.media_asset_id
      and asset.status = 'active'
      and asset.entity_type = 'product'
      and asset.entity_id = new.product_id
      and asset.store_id = product.store_id
  ) then
    raise exception 'invalid_product_media_asset';
  end if;
  return new;
end;
$$;

create trigger product_images_validate_binding
before insert or update on public.product_images
for each row execute function public.validate_product_image_binding();

create or replace function public.validate_store_image_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.media_assets as asset
    where asset.id = new.media_asset_id
      and asset.status = 'active'
      and asset.entity_type = 'store'
      and asset.entity_id = new.store_id
      and asset.store_id = new.store_id
  ) then
    raise exception 'invalid_store_media_asset';
  end if;
  return new;
end;
$$;

create trigger store_images_validate_binding
before insert or update on public.store_images
for each row execute function public.validate_store_image_binding();

create or replace function public.validate_delivery_proof_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.proof_asset_id is not null
     and new.proof_asset_id is distinct from old.proof_asset_id then
    raise exception 'delivery_proof_is_immutable' using errcode = '55000';
  end if;
  if new.proof_asset_id is not null and not exists (
    select 1
    from public.media_assets as asset
    join public.marketplace_orders as marketplace_order on marketplace_order.id = new.order_id
    where asset.id = new.proof_asset_id
      and asset.status = 'active'
      and asset.entity_type = 'delivery_proof'
      and asset.entity_id = new.order_id
      and asset.store_id = marketplace_order.store_id
  ) then
    raise exception 'invalid_delivery_proof_asset';
  end if;
  return new;
end;
$$;

create trigger marketplace_delivery_validate_proof
before insert or update of order_id, proof_asset_id
on public.marketplace_delivery_assignments
for each row execute function public.validate_delivery_proof_binding();

create or replace function public.prevent_order_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'order_item_snapshots_are_immutable' using errcode = '55000';
end;
$$;

create trigger order_items_immutable
before update or delete on public.order_items
for each row execute function public.prevent_order_item_mutation();

create or replace function public.apply_product_rating_delta(
  p_product_id uuid,
  p_count_delta integer,
  p_sum_delta integer,
  p_rating_1_delta integer,
  p_rating_2_delta integer,
  p_rating_3_delta integer,
  p_rating_4_delta integer,
  p_rating_5_delta integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.product_rating_aggregates (product_id)
  values (p_product_id)
  on conflict (product_id) do nothing;

  -- This row update is the serialization point. Concurrent reviews accumulate
  -- deltas instead of overwriting a snapshot-derived aggregate.
  update public.product_rating_aggregates
  set review_count = review_count + p_count_delta,
      rating_sum = rating_sum + p_sum_delta,
      rating_1_count = rating_1_count + p_rating_1_delta,
      rating_2_count = rating_2_count + p_rating_2_delta,
      rating_3_count = rating_3_count + p_rating_3_delta,
      rating_4_count = rating_4_count + p_rating_4_delta,
      rating_5_count = rating_5_count + p_rating_5_delta,
      updated_at = now()
  where product_id = p_product_id;
end;
$$;

create or replace function public.refresh_product_rating_aggregate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.status = 'published' then
    perform public.apply_product_rating_delta(
      old.product_id,
      -1,
      -old.rating,
      case when old.rating = 1 then -1 else 0 end,
      case when old.rating = 2 then -1 else 0 end,
      case when old.rating = 3 then -1 else 0 end,
      case when old.rating = 4 then -1 else 0 end,
      case when old.rating = 5 then -1 else 0 end
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.status = 'published' then
    perform public.apply_product_rating_delta(
      new.product_id,
      1,
      new.rating,
      case when new.rating = 1 then 1 else 0 end,
      case when new.rating = 2 then 1 else 0 end,
      case when new.rating = 3 then 1 else 0 end,
      case when new.rating = 4 then 1 else 0 end,
      case when new.rating = 5 then 1 else 0 end
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger product_reviews_refresh_aggregate
after insert or delete or update of product_id, rating, status
on public.product_reviews
for each row execute function public.refresh_product_rating_aggregate();

create or replace function public.submit_product_review(
  p_order_item_id uuid,
  p_rating smallint,
  p_title text default null,
  p_body text default null
)
returns public.product_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.marketplace_customers;
  v_item public.order_items;
  v_review public.product_reviews;
begin
  if p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  v_customer := public.ensure_marketplace_customer();

  select item.* into v_item
  from public.order_items as item
  join public.marketplace_orders as marketplace_order on marketplace_order.id = item.order_id
  where item.id = p_order_item_id
    and marketplace_order.customer_id = v_customer.id
    and marketplace_order.status = 'delivered';

  if v_item is null then
    raise exception 'verified_purchase_required' using errcode = '42501';
  end if;

  insert into public.product_reviews (
    product_id,
    order_item_id,
    customer_id,
    rating,
    title,
    body,
    status,
    verified_purchase
  ) values (
    v_item.product_id,
    v_item.id,
    v_customer.id,
    p_rating,
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    'published',
    true
  )
  on conflict (order_item_id) do update
  set rating = excluded.rating,
      title = excluded.title,
      body = excluded.body,
      status = 'published',
      updated_at = now()
  where public.product_reviews.customer_id = v_customer.id
  returning * into v_review;

  if v_review is null then
    raise exception 'review_owner_mismatch' using errcode = '42501';
  end if;
  return v_review;
end;
$$;

create or replace function public.finalize_media_upload(
  p_session_id uuid,
  p_asset_id uuid,
  p_bucket text,
  p_object_key text,
  p_public_url text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_sha256 text,
  p_idempotency_key text
)
returns table (
  asset_id uuid,
  "position" smallint,
  public_url text,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.upload_sessions;
  v_position smallint;
  v_existing_url text;
begin
  select * into v_session
  from public.upload_sessions
  where id = p_session_id
  for update;

  if v_session is null then
    raise exception 'upload_session_not_found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if v_session.status = 'ready' and v_session.finalized_asset_id is not null then
    if v_session.finalize_idempotency_key is distinct from p_idempotency_key then
      raise exception 'upload_idempotency_conflict' using errcode = '23505';
    end if;
    select asset.public_url into v_existing_url
    from public.media_assets as asset
    where asset.id = v_session.finalized_asset_id;
    select coalesce(product_image.position, store_image.position) into v_position
    from (select 1) as singleton
    left join public.product_images as product_image
      on product_image.media_asset_id = v_session.finalized_asset_id
    left join public.store_images as store_image
      on store_image.media_asset_id = v_session.finalized_asset_id;
    return query select v_session.finalized_asset_id, v_position, v_existing_url, true;
    return;
  end if;

  if v_session.status <> 'processing' then
    raise exception 'upload_session_not_processing' using errcode = '55000';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'upload_session_expired' using errcode = '55000';
  end if;
  if p_content_type <> 'image/webp'
     or p_byte_size not between 32 and 12582912
     or p_width not between 1 and 10000
     or p_height not between 1 and 10000
     or p_sha256 !~ '^[a-f0-9]{64}$'
     or (
       v_session.entity_type in ('product', 'store')
       and (p_public_url is null or p_public_url !~ '^https://')
     )
     or (
       v_session.entity_type not in ('product', 'store')
       and p_public_url is not null
     )
     or p_object_key !~ ('^media/' || v_session.merchant_id::text || '/' || v_session.entity_type::text || '/' || v_session.entity_id::text || '/') then
    raise exception 'invalid_finalized_media' using errcode = '22023';
  end if;

  if v_session.entity_type = 'product' then
    perform 1 from public.products where id = v_session.entity_id for update;
    select candidate::smallint into v_position
    from generate_series(0, 9) as candidate
    where not exists (
      select 1 from public.product_images
      where product_id = v_session.entity_id and position = candidate
    )
    order by candidate
    limit 1;
    if v_position is null then
      raise exception 'product_image_limit_reached' using errcode = '23514';
    end if;
  elsif v_session.entity_type = 'store' then
    perform 1 from public.stores where id = v_session.entity_id for update;
    select candidate::smallint into v_position
    from generate_series(0, 14) as candidate
    where not exists (
      select 1 from public.store_images
      where store_id = v_session.entity_id and position = candidate
    )
    order by candidate
    limit 1;
    if v_position is null then
      raise exception 'store_image_limit_reached' using errcode = '23514';
    end if;
  end if;

  insert into public.media_assets (
    id, owner_id, owner_name_snapshot, merchant_id, store_id, entity_type, entity_id, slot,
    visibility, bucket, object_key, public_url, content_type, byte_size, width, height, sha256
  ) values (
    p_asset_id, v_session.owner_id, v_session.owner_name_snapshot,
    v_session.merchant_id, v_session.store_id,
    v_session.entity_type, v_session.entity_id, v_session.slot,
    case when v_session.entity_type in ('product', 'store') then 'public' else 'private' end,
    p_bucket,
    p_object_key, p_public_url, p_content_type, p_byte_size, p_width, p_height, p_sha256
  );

  if v_session.entity_type = 'product' then
    insert into public.product_images (product_id, media_asset_id, position)
    values (v_session.entity_id, p_asset_id, v_position);
  elsif v_session.entity_type = 'store' then
    insert into public.store_images (store_id, media_asset_id, position, kind)
    values (
      v_session.entity_id,
      p_asset_id,
      v_position,
      case when v_session.slot in ('logo', 'cover') then v_session.slot else 'gallery' end
    );
  end if;

  update public.upload_sessions
  set status = 'ready',
      finalize_idempotency_key = p_idempotency_key,
      finalized_asset_id = p_asset_id,
      updated_at = now()
  where id = v_session.id;

  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'media.finalized:' || p_session_id::text,
    'media.finalized',
    v_session.entity_type::text,
    v_session.entity_id::text,
    jsonb_build_object(
      'asset_id', p_asset_id,
      'position', v_position,
      'staging_key', v_session.staging_key
    )
  );

  return query select p_asset_id, v_position, p_public_url, false;
end;
$$;

create or replace function public.create_my_delivery_proof_upload_session(
  p_order_id uuid,
  p_session_id uuid,
  p_staging_key text,
  p_expected_content_type text,
  p_expected_size_bytes bigint,
  p_expected_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.marketplace_orders;
  v_merchant_id uuid;
  v_actor_name text;
  v_session public.upload_sessions;
begin
  if v_actor_id is null or p_session_id is null
     or p_expected_content_type not in ('image/jpeg','image/png','image/webp','image/avif')
     or p_expected_size_bytes not between 32 and 12582912
     or p_expected_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_delivery_proof_upload' using errcode = '22023';
  end if;
  select * into v_order from public.marketplace_orders where id = p_order_id;
  if v_order is null or v_order.delivery_mode <> 'platform' then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if not (
    public.is_marketplace_admin()
    or exists (
      select 1 from public.marketplace_delivery_assignments
      where order_id = v_order.id and driver_id = v_actor_id
        and status in ('assigned','picked_up','issue')
    )
  ) then
    raise exception 'delivery_assignment_access_required' using errcode = '42501';
  end if;
  select merchant_id into v_merchant_id from public.stores where id = v_order.store_id;
  if p_staging_key !~ (
    '^staging/' || v_merchant_id::text || '/delivery_proof/' ||
    v_order.id::text || '/proof/' || p_session_id::text || '\.(?:jpe?g|png|webp|avif)$'
  ) or p_staging_key ~ '(^|/)\.\.(/|$)' then
    raise exception 'invalid_delivery_proof_staging_key' using errcode = '22023';
  end if;
  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  insert into public.upload_sessions (
    id, owner_id, owner_name_snapshot, merchant_id, store_id, entity_type,
    entity_id, slot, staging_key, expected_content_type, expected_size_bytes,
    expected_sha256
  ) values (
    p_session_id, v_actor_id, v_actor_name, v_merchant_id, v_order.store_id,
    'delivery_proof', v_order.id, 'proof', p_staging_key,
    p_expected_content_type, p_expected_size_bytes, p_expected_sha256
  ) on conflict (id) do nothing
  returning * into v_session;
  if v_session is null then
    select * into v_session from public.upload_sessions where id = p_session_id;
    if v_session.owner_id is distinct from v_actor_id
       or v_session.entity_type <> 'delivery_proof'
       or v_session.entity_id <> v_order.id
       or v_session.staging_key <> p_staging_key
       or v_session.expected_sha256 <> p_expected_sha256 then
      raise exception 'delivery_proof_upload_idempotency_conflict' using errcode = '23505';
    end if;
  end if;
  return jsonb_build_object(
    'session_id', v_session.id, 'staging_key', v_session.staging_key,
    'expires_at', v_session.expires_at, 'status', v_session.status
  );
end;
$$;

create or replace function public.get_private_marketplace_media_locator(
  p_asset_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_asset public.media_assets;
begin
  select * into v_asset from public.media_assets
  where id = p_asset_id and status = 'active' and visibility = 'private';
  if v_asset is null then raise exception 'private_media_not_found' using errcode = 'P0002'; end if;
  if v_asset.entity_type = 'delivery_proof' then
    if not (
      exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active)
      or exists (
        select 1 from public.marketplace_orders as marketplace_order
        where marketplace_order.id = v_asset.entity_id
          and (
            exists (
              select 1 from public.marketplace_customers
              where id = marketplace_order.customer_id and auth_user_id = p_actor_id and is_active
            )
            or exists (
              select 1 from public.marketplace_delivery_assignments
              where order_id = marketplace_order.id and driver_id = p_actor_id
            )
            or exists (
              select 1 from public.store_memberships
              where store_id = marketplace_order.store_id and user_id = p_actor_id
                and is_active and role in ('owner','manager','fulfillment')
            )
          )
      )
    ) then raise exception 'private_media_not_found' using errcode = 'P0002'; end if;
  elsif v_asset.owner_id is distinct from p_actor_id
        and not exists (
          select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active
        ) then
    raise exception 'private_media_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'asset_id', v_asset.id, 'bucket', v_asset.bucket, 'object_key', v_asset.object_key,
    'content_type', v_asset.content_type, 'byte_size', v_asset.byte_size,
    'sha256', v_asset.sha256
  );
end;
$$;

create or replace function public.authorize_my_private_marketplace_media(p_asset_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_locator jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  v_locator := public.get_private_marketplace_media_locator(p_asset_id, (select auth.uid()));
  return jsonb_build_object(
    'asset_id', v_locator -> 'asset_id', 'authorized', true,
    'content_type', v_locator -> 'content_type', 'byte_size', v_locator -> 'byte_size'
  );
end;
$$;

create or replace function public.reorder_marketplace_media(
  p_store_id uuid,
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid,
  p_ordered_asset_ids uuid[],
  p_expected_entity_updated_at timestamptz,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
  v_existing_ids uuid[];
  v_requested_ids uuid[];
  v_authorized boolean;
begin
  if p_entity_type not in ('product', 'store') then
    raise exception 'unsupported_reorder_entity' using errcode = '22023';
  end if;
  if p_ordered_asset_ids is null
     or cardinality(p_ordered_asset_ids) > (case when p_entity_type = 'product' then 10 else 15 end)
     or cardinality(p_ordered_asset_ids) <> cardinality(array(
       select distinct asset_id from unnest(p_ordered_asset_ids) as asset_id
     )) then
    raise exception 'invalid_media_order' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or exists (
    select 1 from public.store_memberships
    where store_id = p_store_id
      and user_id = p_actor_id
      and is_active
      and role in ('owner', 'manager', 'catalog')
  ) or exists (
    select 1
    from public.stores as store
    join public.profiles as profile on profile.merchant_id = store.merchant_id
    where store.id = p_store_id
      and profile.id = p_actor_id
      and profile.role = 'merchant'
      and profile.is_active
  ) into v_authorized;
  if not v_authorized then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  if p_entity_type = 'product' then
    select updated_at into v_updated_at
    from public.products
    where id = p_entity_id and store_id = p_store_id
    for update;
    select array_agg(media_asset_id order by media_asset_id) into v_existing_ids
    from public.product_images where product_id = p_entity_id;
  else
    if p_entity_id <> p_store_id then
      raise exception 'store_entity_mismatch' using errcode = '22023';
    end if;
    select updated_at into v_updated_at
    from public.stores
    where id = p_store_id
    for update;
    select array_agg(media_asset_id order by media_asset_id) into v_existing_ids
    from public.store_images where store_id = p_store_id;
  end if;
  if v_updated_at is null then
    raise exception 'media_entity_not_found' using errcode = 'P0002';
  end if;
  if v_updated_at is distinct from p_expected_entity_updated_at then
    raise exception 'media_order_version_conflict' using errcode = '40001';
  end if;
  select array_agg(asset_id order by asset_id) into v_requested_ids
  from unnest(p_ordered_asset_ids) as asset_id;
  if v_existing_ids is distinct from v_requested_ids then
    raise exception 'media_order_asset_set_mismatch' using errcode = '22023';
  end if;

  if p_entity_type = 'product' then
    with deleted as (
      delete from public.product_images
      where product_id = p_entity_id
      returning media_asset_id, alt_text, created_at
    )
    insert into public.product_images (
      product_id, media_asset_id, position, alt_text, created_at
    )
    select
      p_entity_id,
      requested.asset_id,
      (requested.ordinality - 1)::smallint,
      deleted.alt_text,
      deleted.created_at
    from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
    join deleted on deleted.media_asset_id = requested.asset_id
    order by requested.ordinality;
    update public.products set updated_at = now() where id = p_entity_id
    returning updated_at into v_updated_at;
  else
    with deleted as (
      delete from public.store_images
      where store_id = p_store_id
      returning media_asset_id, alt_text, kind, created_at
    )
    insert into public.store_images (
      store_id, media_asset_id, position, alt_text, kind, created_at
    )
    select
      p_store_id,
      requested.asset_id,
      (requested.ordinality - 1)::smallint,
      deleted.alt_text,
      deleted.kind,
      deleted.created_at
    from unnest(p_ordered_asset_ids) with ordinality as requested(asset_id, ordinality)
    join deleted on deleted.media_asset_id = requested.asset_id
    order by requested.ordinality;
    update public.stores set updated_at = now() where id = p_store_id
    returning updated_at into v_updated_at;
  end if;

  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'media.reordered:' || gen_random_uuid()::text,
    'media.reordered',
    p_entity_type::text,
    p_entity_id::text,
    jsonb_build_object('asset_ids', p_ordered_asset_ids, 'updated_at', v_updated_at)
  );
  return jsonb_build_object(
    'entity_id', p_entity_id,
    'asset_ids', p_ordered_asset_ids,
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.delete_marketplace_media(
  p_asset_id uuid,
  p_expected_asset_updated_at timestamptz,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets;
  v_authorized boolean;
  v_entity_updated_at timestamptz;
begin
  select * into v_asset
  from public.media_assets
  where id = p_asset_id
  for update;
  if v_asset is null or v_asset.status <> 'active' then
    raise exception 'media_asset_not_found' using errcode = 'P0002';
  end if;
  if v_asset.updated_at is distinct from p_expected_asset_updated_at then
    raise exception 'media_asset_version_conflict' using errcode = '40001';
  end if;
  if v_asset.entity_type not in ('product', 'store') then
    raise exception 'media_delete_requires_entity_specific_workflow' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.marketplace_delivery_assignments
    where proof_asset_id = v_asset.id
  ) then
    raise exception 'delivery_proof_is_immutable' using errcode = '55000';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or exists (
    select 1 from public.store_memberships
    where store_id = v_asset.store_id
      and user_id = p_actor_id
      and is_active
      and role in ('owner', 'manager', 'catalog')
  ) or exists (
    select 1
    from public.stores as store
    join public.profiles as profile on profile.merchant_id = store.merchant_id
    where store.id = v_asset.store_id
      and profile.id = p_actor_id
      and profile.role = 'merchant'
      and profile.is_active
  ) into v_authorized;
  if not v_authorized then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  if v_asset.entity_type = 'product' then
    perform 1 from public.products where id = v_asset.entity_id for update;
    if exists (
      select 1 from public.products
      where id = v_asset.entity_id and status = 'active'
    ) and not exists (
      select 1 from public.product_images
      where product_id = v_asset.entity_id and media_asset_id <> v_asset.id
    ) then
      raise exception 'active_product_last_image_cannot_be_deleted' using errcode = '23514';
    end if;
    with remaining as materialized (
      select media_asset_id, alt_text, created_at, position
      from public.product_images
      where product_id = v_asset.entity_id and media_asset_id <> v_asset.id
      order by position
    ), removed as (
      delete from public.product_images where product_id = v_asset.entity_id
    )
    insert into public.product_images (
      product_id, media_asset_id, position, alt_text, created_at
    )
    select
      v_asset.entity_id,
      remaining.media_asset_id,
      (row_number() over (order by remaining.position) - 1)::smallint,
      remaining.alt_text,
      remaining.created_at
    from remaining;
    update public.products set updated_at = now() where id = v_asset.entity_id
    returning updated_at into v_entity_updated_at;
  elsif v_asset.entity_type = 'store' then
    perform 1 from public.stores where id = v_asset.store_id for update;
    with remaining as materialized (
      select media_asset_id, alt_text, kind, created_at, position
      from public.store_images
      where store_id = v_asset.store_id and media_asset_id <> v_asset.id
      order by position
    ), removed as (
      delete from public.store_images where store_id = v_asset.store_id
    )
    insert into public.store_images (
      store_id, media_asset_id, position, alt_text, kind, created_at
    )
    select
      v_asset.store_id,
      remaining.media_asset_id,
      (row_number() over (order by remaining.position) - 1)::smallint,
      remaining.alt_text,
      remaining.kind,
      remaining.created_at
    from remaining;
    update public.stores set updated_at = now() where id = v_asset.store_id
    returning updated_at into v_entity_updated_at;
  end if;

  update public.media_assets
  set status = 'deleted', deleted_at = now(), updated_at = now()
  where id = v_asset.id;
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'media.delete_requested:' || v_asset.id::text,
    'media.delete_requested',
    v_asset.entity_type::text,
    v_asset.entity_id::text,
    jsonb_build_object(
      'asset_id', v_asset.id,
      'bucket', v_asset.bucket,
      'object_key', v_asset.object_key
    )
  );
  return jsonb_build_object(
    'asset_id', v_asset.id,
    'deleted', true,
    'entity_updated_at', v_entity_updated_at
  );
end;
$$;

create or replace function public.submit_store_for_review(
  p_store_id uuid,
  p_actor_id uuid
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores;
begin
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_store.status <> 'draft' then raise exception 'store_not_draft'; end if;
  if not (
    exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active)
    or exists (
      select 1 from public.store_memberships
      where store_id = p_store_id and user_id = p_actor_id and is_active
        and role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.profiles
      where id = p_actor_id and role = 'merchant' and merchant_id = v_store.merchant_id and is_active
    )
  ) then
    raise exception 'store_management_required' using errcode = '42501';
  end if;
  update public.stores set status = 'pending_review', moderation_notes = null
  where id = p_store_id returning * into v_store;
  return v_store;
end;
$$;

create or replace function public.moderate_store(
  p_store_id uuid,
  p_approve boolean,
  p_notes text,
  p_admin_id uuid
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare v_store public.stores;
begin
  if not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active
  ) then raise exception 'admin_access_required' using errcode = '42501'; end if;
  select * into v_store from public.stores where id = p_store_id for update;
  if v_store is null then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  if v_store.status <> 'pending_review' then raise exception 'store_not_pending_review'; end if;
  if not p_approve and nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'moderation_notes_required' using errcode = '22023';
  end if;
  update public.stores
  set status = case when p_approve then 'published' else 'draft' end,
      moderation_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_store_id returning * into v_store;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_admin_id, case when p_approve then 'store.approved' else 'store.rejected' end,
    'store', p_store_id::text, to_jsonb(v_store)
  );
  return v_store;
end;
$$;

create or replace function public.submit_product_for_review(
  p_product_id uuid,
  p_actor_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if v_product.status not in ('draft', 'rejected') then raise exception 'product_not_submittable'; end if;
  if nullif(trim(coalesce(v_product.description, '')), '') is null
     or not exists (
       select 1
       from public.product_images as image
       join public.media_assets as asset
         on asset.id = image.media_asset_id and asset.status = 'active'
       where image.product_id = p_product_id
     )
     or not exists (
       select 1
       from public.product_variants as variant
       join public.inventory_stock as stock on stock.variant_id = variant.id
       where variant.product_id = p_product_id and variant.is_active
     ) then
    raise exception 'product_content_incomplete' using errcode = '22023';
  end if;
  if not (
    exists (select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active)
    or exists (
      select 1 from public.store_memberships
      where store_id = v_product.store_id and user_id = p_actor_id and is_active
        and role in ('owner', 'manager', 'catalog')
    )
    or exists (
      select 1
      from public.stores as store
      join public.profiles as profile on profile.merchant_id = store.merchant_id
      where store.id = v_product.store_id
        and profile.id = p_actor_id and profile.role = 'merchant' and profile.is_active
    )
  ) then raise exception 'catalog_access_required' using errcode = '42501'; end if;
  update public.products set status = 'pending_review', moderation_notes = null
  where id = p_product_id returning * into v_product;
  return v_product;
end;
$$;

create or replace function public.moderate_product(
  p_product_id uuid,
  p_approve boolean,
  p_notes text,
  p_admin_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v_product public.products;
begin
  if not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin' and is_active
  ) then raise exception 'admin_access_required' using errcode = '42501'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if v_product.status <> 'pending_review' then raise exception 'product_not_pending_review'; end if;
  if not p_approve and nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'moderation_notes_required' using errcode = '22023';
  end if;
  update public.products
  set status = case when p_approve then 'active' else 'rejected' end,
      moderation_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_product_id returning * into v_product;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_admin_id, case when p_approve then 'product.approved' else 'product.rejected' end,
    'product', p_product_id::text, to_jsonb(v_product)
  );
  return v_product;
end;
$$;

create or replace function public.checkout_marketplace_cart(
  p_customer_id uuid,
  p_cart_id uuid,
  p_idempotency_key text,
  p_address_id uuid,
  p_delivery_modes jsonb default '{}'::jsonb,
  p_delivery_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.checkout_requests;
  v_request_hash text;
  v_insert_count integer;
  v_cart public.carts;
  v_address public.customer_addresses;
  v_group public.order_groups;
  v_store record;
  v_item record;
  v_stock public.inventory_stock;
  v_zone public.store_delivery_zones;
  v_order public.marketplace_orders;
  v_order_item public.order_items;
  v_coupon public.marketplace_coupons;
  v_coupon_selection public.cart_coupon_selections;
  v_coupon_code text;
  v_delivery_mode_text text;
  v_store_subtotal bigint;
  v_eligible_subtotal bigint;
  v_discount bigint;
  v_merchant_discount bigint;
  v_platform_discount bigint;
  v_delivery_fee bigint;
  v_subtotal bigint := 0;
  v_merchant_discount_total bigint := 0;
  v_platform_discount_total bigint := 0;
  v_delivery_total bigint := 0;
  v_child_count integer;
  v_redemption_count integer;
  v_response jsonb;
  v_is_first_order boolean;
  v_max_open_groups integer;
  v_max_first_units integer;
  v_max_first_amount bigint;
begin
  if p_customer_id is null or not exists (
    select 1 from public.marketplace_customers
    where id = p_customer_id and is_active
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_address_id is null then
    raise exception 'delivery_address_required' using errcode = '22023';
  end if;
  p_delivery_notes := nullif(trim(coalesce(p_delivery_notes, '')), '');
  if char_length(coalesce(p_delivery_notes, '')) > 500 then
    raise exception 'delivery_notes_too_long' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-checkout:' || p_customer_id::text, 0)
  );
  select
    coalesce((value ->> 'max_open_order_groups')::integer, 1),
    coalesce((value ->> 'max_first_order_units')::integer, 10),
    coalesce((value ->> 'max_first_order_amount_piastres')::bigint, 200000)
  into v_max_open_groups, v_max_first_units, v_max_first_amount
  from public.marketplace_runtime_settings
  where key = 'cod_risk_limits';
  v_max_open_groups := coalesce(v_max_open_groups, 1);
  v_max_first_units := coalesce(v_max_first_units, 10);
  v_max_first_amount := coalesce(v_max_first_amount, 200000);

  if jsonb_typeof(coalesce(p_delivery_modes, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_checkout_options' using errcode = '22023';
  end if;

  select * into v_cart
  from public.carts
  where id = p_cart_id
    and customer_id = p_customer_id
  for update;

  if v_cart is null then
    raise exception 'customer_cart_not_found' using errcode = 'P0002';
  end if;

  select * into v_coupon_selection
  from public.cart_coupon_selections
  where cart_id = v_cart.id
  for update;

  v_request_hash := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(
      p_cart_id::text || '|' || p_address_id::text || '|' ||
      coalesce(v_coupon_selection.coupon_id::text, '-') || '|' ||
      coalesce(v_coupon_selection.applied_store_id::text, '-') || '|' ||
      coalesce(p_delivery_modes, '{}'::jsonb)::text || '|' ||
      coalesce(p_delivery_notes, '-'),
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  insert into public.checkout_requests (
    customer_id, cart_id, idempotency_key, request_hash
  ) values (
    p_customer_id, p_cart_id, p_idempotency_key, v_request_hash
  ) on conflict (customer_id, idempotency_key) do nothing;
  get diagnostics v_insert_count = row_count;

  select * into v_request
  from public.checkout_requests
  where customer_id = p_customer_id
    and idempotency_key = p_idempotency_key
  for update;

  if v_request.request_hash <> v_request_hash then
    raise exception 'checkout_idempotency_conflict' using errcode = '23505';
  end if;
  if v_insert_count = 0 and v_request.status = 'completed' then
    return v_request.response || jsonb_build_object('idempotent', true);
  elsif v_insert_count = 0 then
    raise exception 'checkout_request_in_progress' using errcode = '55000';
  end if;

  if (
    select count(distinct marketplace_order.order_group_id)
    from public.marketplace_orders as marketplace_order
    where marketplace_order.customer_id = p_customer_id
      and marketplace_order.status not in ('delivered', 'cancelled', 'rejected', 'returned')
  ) >= v_max_open_groups then
    raise exception 'cod_open_order_limit_reached' using errcode = '22023';
  end if;
  select not exists (
    select 1 from public.marketplace_orders
    where customer_id = p_customer_id and status in ('delivered', 'returned')
  ) into v_is_first_order;

  if v_cart.status <> 'active' or v_cart.expires_at <= now() then
    raise exception 'active_cart_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.cart_items where cart_id = v_cart.id) then
    raise exception 'cart_is_empty' using errcode = '22023';
  end if;
  if v_is_first_order and (
    select coalesce(sum(quantity), 0) from public.cart_items where cart_id = v_cart.id
  ) > v_max_first_units then
    raise exception 'first_cod_order_unit_limit_reached' using errcode = '22023';
  end if;

  -- Freeze the canonical catalog snapshot in deterministic key order before
  -- computing any subtotal. Catalog edits then wait until checkout commits.
  perform item.id
  from public.cart_items as item
  where item.cart_id = v_cart.id
  order by item.id
  for update of item;

  perform store.id
  from public.stores as store
  where store.id in (
    select product.store_id
    from public.cart_items as item
    join public.product_variants as variant on variant.id = item.variant_id
    join public.products as product on product.id = variant.product_id
    where item.cart_id = v_cart.id
  )
  order by store.id
  for no key update of store;

  perform product.id
  from public.products as product
  where product.id in (
    select variant.product_id
    from public.cart_items as item
    join public.product_variants as variant on variant.id = item.variant_id
    where item.cart_id = v_cart.id
  )
  order by product.id
  for no key update of product;

  perform variant.id
  from public.product_variants as variant
  where variant.id in (
    select item.variant_id from public.cart_items as item where item.cart_id = v_cart.id
  )
  order by variant.id
  for no key update of variant;

  select address.* into v_address
  from public.customer_addresses as address
  join public.delivery_zones as zone on zone.id = address.zone_id and zone.is_active
  where address.id = p_address_id
    and address.customer_id = p_customer_id;

  if v_address is null then
    raise exception 'delivery_address_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.cart_items as cart_item
    left join public.product_variants as variant
      on variant.id = cart_item.variant_id and variant.is_active
    left join public.products as product
      on product.id = variant.product_id and product.status = 'active'
    left join public.stores as store
      on store.id = product.store_id and store.status = 'published'
    left join public.inventory_stock as stock on stock.variant_id = variant.id
    where cart_item.cart_id = v_cart.id
      and (
        variant.id is null
        or product.id is null
        or store.id is null
        or stock.variant_id is null
        or (stock.track_inventory and stock.on_hand - stock.reserved < cart_item.quantity)
      )
  ) then
    raise exception 'cart_contains_unavailable_item' using errcode = '22023';
  end if;

  select count(distinct product.store_id)::integer into v_child_count
  from public.cart_items as cart_item
  join public.product_variants as variant on variant.id = cart_item.variant_id
  join public.products as product on product.id = variant.product_id
  where cart_item.cart_id = v_cart.id;

  insert into public.order_groups (
    customer_id,
    cart_id,
    address_id,
    address_snapshot,
    delivery_notes,
    child_order_count
  ) values (
    p_customer_id,
    v_cart.id,
    v_address.id,
    jsonb_build_object(
      'zone_id', v_address.zone_id,
      'label', v_address.label,
      'recipient_name', v_address.recipient_name,
      'recipient_phone', v_address.recipient_phone,
      'address_line', v_address.address_line,
      'building', v_address.building,
      'floor', v_address.floor,
      'apartment', v_address.apartment,
      'landmark', v_address.landmark,
      'latitude', v_address.latitude,
      'longitude', v_address.longitude
    ),
    p_delivery_notes,
    v_child_count
  ) returning * into v_group;

  for v_store in
    select
      store.id,
      store.name,
      store.delivery_mode,
      sum(variant.price * cart_item.quantity)::bigint as subtotal
    from public.cart_items as cart_item
    join public.product_variants as variant on variant.id = cart_item.variant_id
    join public.products as product on product.id = variant.product_id
    join public.stores as store on store.id = product.store_id
    where cart_item.cart_id = v_cart.id
    group by store.id, store.name, store.delivery_mode
    order by store.id
  loop
    v_store_subtotal := v_store.subtotal;
    v_delivery_mode_text := lower(coalesce(
      p_delivery_modes ->> v_store.id::text,
      case when v_store.delivery_mode = 'self' then 'self' else 'platform' end
    ));

    if v_delivery_mode_text not in ('platform', 'self')
       or (v_store.delivery_mode <> 'flexible' and v_store.delivery_mode::text <> v_delivery_mode_text) then
      raise exception 'unsupported_delivery_mode_for_store:%', v_store.id using errcode = '22023';
    end if;

    select zone.* into v_zone
    from public.store_delivery_zones as zone
    where zone.store_id = v_store.id
      and zone.zone_id = v_address.zone_id
      and zone.delivery_mode::text = v_delivery_mode_text
      and zone.is_active;

    if v_zone is null then
      raise exception 'store_does_not_deliver_to_zone:%', v_store.id using errcode = '22023';
    end if;
    if v_store_subtotal < v_zone.minimum_order then
      raise exception 'store_minimum_order_not_met:%', v_store.id using errcode = '22023';
    end if;

    v_delivery_fee := case
      when v_zone.free_delivery_threshold is not null
       and v_store_subtotal >= v_zone.free_delivery_threshold then 0
      else v_zone.fee
    end;
    v_discount := 0;
    v_merchant_discount := 0;
    v_platform_discount := 0;
    v_coupon_code := case
      when v_coupon_selection.applied_store_id = v_store.id
      then v_coupon_selection.code_snapshot
      else null
    end;

    if v_coupon_code is not null then
      select coupon.* into v_coupon
      from public.marketplace_coupons as coupon
      where coupon.id = v_coupon_selection.coupon_id
        and coupon.code = v_coupon_code
        and (coupon.store_id = v_store.id or coupon.store_id is null)
        and coupon.is_active
        and (coupon.starts_at is null or coupon.starts_at <= now())
        and (coupon.expires_at is null or coupon.expires_at > now())
      order by (coupon.store_id is not null) desc
      limit 1
      for update;

      if v_coupon is null then
        raise exception 'invalid_coupon_for_store:%', v_store.id using errcode = '22023';
      end if;
      if v_coupon.total_limit is not null and v_coupon.redeemed_count >= v_coupon.total_limit then
        raise exception 'coupon_usage_limit_reached' using errcode = '22023';
      end if;
      select count(*)::integer into v_redemption_count
      from public.coupon_redemptions as redemption
      where redemption.coupon_id = v_coupon.id
        and redemption.customer_id = p_customer_id
        and redemption.voided_at is null;

      if v_redemption_count >= v_coupon.per_customer_limit then
        raise exception 'coupon_customer_limit_reached' using errcode = '22023';
      end if;

      select coalesce(sum(variant.price * cart_item.quantity), 0)::bigint
      into v_eligible_subtotal
      from public.cart_items as cart_item
      join public.product_variants as variant on variant.id = cart_item.variant_id
      join public.products as product on product.id = variant.product_id
      where cart_item.cart_id = v_cart.id
        and product.store_id = v_store.id
        and (
          (
            not exists (select 1 from public.marketplace_coupon_products where coupon_id = v_coupon.id)
            and not exists (select 1 from public.marketplace_coupon_categories where coupon_id = v_coupon.id)
          )
          or exists (
            select 1 from public.marketplace_coupon_products
            where coupon_id = v_coupon.id and product_id = product.id
          )
          or exists (
            select 1 from public.marketplace_coupon_categories
            where coupon_id = v_coupon.id and category_id = product.category_id
          )
        );

      if v_eligible_subtotal <= 0 then
        raise exception 'coupon_has_no_eligible_items' using errcode = '22023';
      end if;
      if v_eligible_subtotal < v_coupon.minimum_order then
        raise exception 'coupon_minimum_order_not_met' using errcode = '22023';
      end if;

      v_discount := case v_coupon.discount_type
        when 'fixed' then least(v_coupon.discount_amount_piastres, v_eligible_subtotal)
        else round(v_eligible_subtotal * v_coupon.discount_percent / 100, 0)::bigint
      end;
      if v_coupon.max_discount is not null then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
      v_discount := least(v_discount, v_store_subtotal);
      if v_coupon.funding_owner = 'platform' then
        v_platform_discount := v_discount;
      else
        v_merchant_discount := v_discount;
      end if;
    else
      v_coupon := null;
    end if;

    insert into public.marketplace_orders (
      order_group_id,
      store_id,
      customer_id,
      delivery_mode,
      delivery_zone_id,
      address_snapshot,
      store_name_snapshot,
      customer_notes,
      subtotal,
      merchant_discount_total,
      platform_discount_total,
      delivery_fee,
      grand_total
    ) values (
      v_group.id,
      v_store.id,
      p_customer_id,
      v_delivery_mode_text::public.marketplace_delivery_mode,
      v_address.zone_id,
      v_group.address_snapshot,
      v_store.name,
      v_group.delivery_notes,
      v_store_subtotal,
      v_merchant_discount,
      v_platform_discount,
      v_delivery_fee,
      v_store_subtotal - v_discount + v_delivery_fee
    ) returning * into v_order;

    for v_item in
      select
        cart_item.quantity,
        variant.id as variant_id,
        variant.product_id,
        variant.sku,
        variant.title as variant_title,
        variant.attributes,
        variant.price,
        product.name as product_name,
        (
          select asset.public_url
          from public.product_images as image
          join public.media_assets as asset on asset.id = image.media_asset_id
          where image.product_id = product.id and asset.status = 'active'
          order by image.position
          limit 1
        ) as image_url
      from public.cart_items as cart_item
      join public.product_variants as variant on variant.id = cart_item.variant_id
      join public.products as product on product.id = variant.product_id
      where cart_item.cart_id = v_cart.id
        and product.store_id = v_store.id
      order by variant.id
    loop
      select * into v_stock
      from public.inventory_stock
      where variant_id = v_item.variant_id
      for update;

      if v_stock is null then
        raise exception 'inventory_record_missing:%', v_item.variant_id using errcode = '22023';
      end if;
      if v_stock.track_inventory and v_stock.on_hand - v_stock.reserved < v_item.quantity then
        raise exception 'insufficient_inventory:%', v_item.variant_id using errcode = '22023';
      end if;

      insert into public.order_items (
        order_id,
        product_id,
        variant_id,
        product_name_snapshot,
        variant_name_snapshot,
        sku_snapshot,
        attributes_snapshot,
        image_url_snapshot,
        unit_price,
        quantity
      ) values (
        v_order.id,
        v_item.product_id,
        v_item.variant_id,
        v_item.product_name,
        v_item.variant_title,
        v_item.sku,
        v_item.attributes,
        v_item.image_url,
        v_item.price,
        v_item.quantity
      ) returning * into v_order_item;

      if v_stock.track_inventory then
        update public.inventory_stock
        set reserved = reserved + v_item.quantity,
            version = version + 1,
            updated_at = now()
        where variant_id = v_item.variant_id;

        insert into public.inventory_reservations (
          variant_id, order_item_id, order_id, quantity
        ) values (
          v_item.variant_id, v_order_item.id, v_order.id, v_item.quantity
        );
      end if;
    end loop;

    if v_coupon is not null and v_discount > 0 then
      insert into public.coupon_redemptions (
        coupon_id, customer_id, order_id, code_snapshot, discount_amount,
        funding_owner_snapshot
      ) values (
        v_coupon.id, p_customer_id, v_order.id, v_coupon.code, v_discount,
        v_coupon.funding_owner
      );
      update public.marketplace_coupons
      set redeemed_count = redeemed_count + 1,
          updated_at = now()
      where id = v_coupon.id;
    end if;

    insert into public.cod_collections (order_id, expected_amount)
    values (v_order.id, v_order.grand_total);

    if v_delivery_mode_text = 'platform' then
      insert into public.marketplace_delivery_assignments (order_id)
      values (v_order.id);
    end if;

    insert into public.marketplace_order_events (
      order_id, event_type, to_status, metadata
    ) values (
      v_order.id,
      'order.placed',
      'pending_confirmation',
      jsonb_build_object('order_group_id', v_group.id, 'delivery_mode', v_delivery_mode_text)
    );

    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    ) values (
      'marketplace.order.placed:' || v_order.id::text,
      'marketplace.order.placed',
      'marketplace_order',
      v_order.id::text,
      jsonb_build_object('order_id', v_order.id, 'store_id', v_order.store_id)
    );

    v_subtotal := v_subtotal + v_store_subtotal;
    v_merchant_discount_total := v_merchant_discount_total + v_merchant_discount;
    v_platform_discount_total := v_platform_discount_total + v_platform_discount;
    v_delivery_total := v_delivery_total + v_delivery_fee;
  end loop;

  update public.order_groups
  set subtotal = v_subtotal,
      merchant_discount_total = v_merchant_discount_total,
      platform_discount_total = v_platform_discount_total,
      delivery_total = v_delivery_total,
      grand_total = v_subtotal - v_merchant_discount_total - v_platform_discount_total + v_delivery_total
  where id = v_group.id
  returning * into v_group;

  if v_is_first_order and v_group.grand_total > v_max_first_amount then
    raise exception 'first_cod_order_amount_limit_reached' using errcode = '22023';
  end if;

  update public.carts
  set status = 'converted',
      converted_at = now(),
      updated_at = now()
  where id = v_cart.id;

  select jsonb_build_object(
    'order_group_id', v_group.id,
    'public_code', v_group.public_code,
    'delivery_notes', v_group.delivery_notes,
    'order_ids', coalesce(jsonb_agg(marketplace_order.id order by marketplace_order.created_at), '[]'::jsonb),
    'subtotal', v_group.subtotal,
    'discount_total', v_group.discount_total,
    'delivery_total', v_group.delivery_total,
    'grand_total', v_group.grand_total,
    'currency', v_group.currency,
    'idempotent', false
  ) into v_response
  from public.marketplace_orders as marketplace_order
  where marketplace_order.order_group_id = v_group.id;

  update public.checkout_requests
  set status = 'completed',
      order_group_id = v_group.id,
      response = v_response,
      completed_at = now()
  where id = v_request.id;

  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.order_group.placed:' || v_group.id::text,
    'marketplace.order_group.placed',
    'order_group',
    v_group.id::text,
    v_response
  );

  return v_response;
end;
$$;

create or replace function public.assign_marketplace_delivery_driver(
  p_order_id uuid,
  p_driver_id uuid,
  p_actor_id uuid
)
returns public.marketplace_delivery_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.marketplace_orders;
  v_assignment public.marketplace_delivery_assignments;
  v_authorized boolean;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if v_order is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.delivery_mode <> 'platform'
     or v_order.status not in ('confirmed', 'preparing', 'ready_for_pickup') then
    raise exception 'order_not_assignable' using errcode = '55000';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) or exists (
    select 1 from public.store_memberships
    where store_id = v_order.store_id
      and user_id = p_actor_id
      and is_active
      and role in ('owner', 'manager', 'fulfillment')
  ) or exists (
    select 1
    from public.stores as store
    join public.profiles as profile on profile.merchant_id = store.merchant_id
    where store.id = v_order.store_id
      and profile.id = p_actor_id
      and profile.role = 'merchant'
      and profile.is_active
  ) into v_authorized;

  if not v_authorized then
    raise exception 'fulfillment_access_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles as profile
    join public.driver_profiles as driver on driver.profile_id = profile.id
    where profile.id = p_driver_id
      and profile.role = 'driver'
      and profile.is_active
      and driver.is_available
      and driver.active_until > now()
  ) then
    raise exception 'driver_unavailable' using errcode = '22023';
  end if;

  update public.marketplace_delivery_assignments
  set driver_id = p_driver_id,
      driver_name_snapshot = (
        select profile.display_name from public.profiles as profile where profile.id = p_driver_id
      ),
      status = 'assigned',
      assigned_at = now(),
      updated_at = now()
  where order_id = p_order_id
  returning * into v_assignment;

  insert into public.marketplace_order_events (
    order_id, actor_user_id, event_type, metadata
  ) values (
    p_order_id,
    p_actor_id,
    'delivery.driver_assigned',
    jsonb_build_object('driver_id', p_driver_id)
  );
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.delivery.assigned:' || p_order_id::text || ':' || p_driver_id::text,
    'marketplace.delivery.assigned',
    'marketplace_order',
    p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'driver_id', p_driver_id)
  ) on conflict (event_key) do nothing;
  return v_assignment;
end;
$$;

create or replace function public.attach_marketplace_delivery_proof(
  p_order_id uuid,
  p_asset_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_assignment public.marketplace_delivery_assignments;
begin
  if p_asset_id is null then
    raise exception 'delivery_proof_required' using errcode = '22023';
  end if;
  select * into v_assignment
  from public.marketplace_delivery_assignments
  where order_id = p_order_id
  for update;
  if v_assignment is null then raise exception 'delivery_assignment_not_found' using errcode = 'P0002'; end if;
  if v_assignment.driver_id <> p_actor_id and not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active
  ) then raise exception 'delivery_assignment_access_required' using errcode = '42501'; end if;
  if v_assignment.proof_asset_id is not null then
    if v_assignment.proof_asset_id = p_asset_id then
      return jsonb_build_object(
        'order_id', p_order_id,
        'proof_asset_id', p_asset_id,
        'idempotent', true
      );
    end if;
    raise exception 'delivery_proof_is_immutable' using errcode = '55000';
  end if;
  update public.marketplace_delivery_assignments
  set proof_asset_id = p_asset_id, updated_at = now()
  where id = v_assignment.id;
  return jsonb_build_object('order_id', p_order_id, 'proof_asset_id', p_asset_id);
end;
$$;

create or replace function public.set_marketplace_order_status(
  p_order_id uuid,
  p_next public.marketplace_order_status,
  p_actor_id uuid,
  p_reason text default null,
  p_collected_amount public.egp_amount default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.marketplace_orders;
  v_previous public.marketplace_order_status;
  v_is_customer boolean;
  v_is_admin boolean;
  v_is_store_staff boolean;
  v_is_assigned_driver boolean;
  v_transition_allowed boolean := false;
  v_reservation record;
  v_earned_commission public.commission_ledger;
  v_return_window_days integer;
begin
  select * into v_order
  from public.marketplace_orders
  where id = p_order_id
  for update;
  if v_order is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_previous := v_order.status;

  select exists (
    select 1 from public.marketplace_customers
    where id = v_order.customer_id and auth_user_id = p_actor_id and is_active
  ) into v_is_customer;
  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) into v_is_admin;
  select exists (
    select 1 from public.store_memberships
    where store_id = v_order.store_id
      and user_id = p_actor_id
      and is_active
      and role in ('owner', 'manager', 'fulfillment')
  ) or exists (
    select 1
    from public.stores as store
    join public.profiles as profile on profile.merchant_id = store.merchant_id
    where store.id = v_order.store_id
      and profile.id = p_actor_id
      and profile.role = 'merchant'
      and profile.is_active
  ) into v_is_store_staff;
  select exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    join public.profiles as profile on profile.id = assignment.driver_id
    where assignment.order_id = v_order.id
      and assignment.driver_id = p_actor_id
      and profile.role = 'driver'
      and profile.is_active
  ) into v_is_assigned_driver;

  if p_next = v_previous then
    if not (v_is_customer or v_is_admin or v_is_store_staff or v_is_assigned_driver) then
      raise exception 'order_access_required' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'id', v_order.id,
      'public_code', v_order.public_code,
      'order_group_id', v_order.order_group_id,
      'store_id', v_order.store_id,
      'status', v_order.status,
      'payment_status', v_order.payment_status,
      'subtotal_piastres', v_order.subtotal,
      'discount_total_piastres', v_order.discount_total,
      'delivery_fee_piastres', v_order.delivery_fee,
      'grand_total_piastres', v_order.grand_total,
      'updated_at', v_order.updated_at,
      'idempotent', true
    );
  end if;

  v_transition_allowed := case
    when v_previous = 'pending_confirmation' and p_next = 'confirmed'
      then v_is_store_staff or v_is_admin
    when v_previous = 'pending_confirmation' and p_next = 'rejected'
      then v_is_store_staff or v_is_admin
    when v_previous = 'pending_confirmation' and p_next = 'cancelled'
      then v_is_customer or v_is_store_staff or v_is_admin or p_actor_id is null
    when v_previous = 'confirmed' and p_next = 'preparing'
      then v_is_store_staff or v_is_admin
    when v_previous in ('confirmed', 'preparing') and p_next = 'cancelled'
      then v_is_store_staff or v_is_admin
    when v_previous = 'preparing' and p_next = 'ready_for_pickup'
      then v_is_store_staff or v_is_admin
    when v_previous = 'ready_for_pickup' and p_next = 'out_for_delivery'
      then (
        (v_order.delivery_mode = 'self' and v_is_store_staff)
        or (v_order.delivery_mode = 'platform' and v_is_assigned_driver)
        or v_is_admin
      )
    when v_previous = 'out_for_delivery' and p_next in ('delivery_failed', 'issue')
      then v_is_assigned_driver or v_is_store_staff or v_is_admin
    when v_previous = 'delivery_failed' and p_next = 'out_for_delivery'
      then v_is_assigned_driver or v_is_store_staff or v_is_admin
    when v_previous = 'delivery_failed' and p_next = 'cancelled'
      then v_is_store_staff or v_is_admin
    when v_previous in ('ready_for_pickup', 'out_for_delivery') and p_next = 'delivered'
      then (
        (v_order.delivery_mode = 'self' and v_is_store_staff)
        or (v_order.delivery_mode = 'platform' and v_is_assigned_driver)
        or v_is_admin
      )
    when v_previous = 'issue' and p_next in ('out_for_delivery', 'delivery_failed')
      then v_is_store_staff or v_is_admin
    when v_previous = 'delivered' and p_next = 'return_requested'
      then v_is_customer or v_is_admin
    when v_previous = 'return_requested' and p_next in ('return_approved', 'delivered')
      then v_is_store_staff or v_is_admin
    when v_previous = 'return_approved' and p_next = 'returned'
      then v_is_store_staff or v_is_admin
    else false
  end;

  if not v_transition_allowed then
    raise exception 'invalid_or_unauthorized_order_transition:%->%', v_previous, p_next
      using errcode = '42501';
  end if;

  if p_next in ('rejected', 'cancelled', 'delivery_failed', 'issue', 'return_requested')
     and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'transition_reason_required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) > 1000 then
    raise exception 'transition_reason_too_long' using errcode = '22023';
  end if;
  if p_next = 'delivered' and v_order.delivery_mode = 'platform' and not exists (
    select 1
    from public.marketplace_delivery_assignments as assignment
    where assignment.order_id = v_order.id
      and assignment.proof_asset_id is not null
  ) then
    raise exception 'delivery_proof_required' using errcode = '23514';
  end if;
  if v_previous = 'delivered' and p_next = 'return_requested' then
    select coalesce((value ->> 'return_window_days')::integer, 14)
    into v_return_window_days
    from public.marketplace_runtime_settings
    where key = 'marketplace_policy';
    v_return_window_days := coalesce(v_return_window_days, 14);
    if v_return_window_days not between 1 and 90
       or v_order.delivered_at is null
       or v_order.delivered_at < now() - make_interval(days => v_return_window_days) then
      raise exception 'return_window_expired' using errcode = '22023';
    end if;
  end if;

  if p_next = 'confirmed' then
    if exists (
      select 1 from public.inventory_reservations
      where order_id = v_order.id
        and (status <> 'reserved' or expires_at <= now())
    ) then
      raise exception 'inventory_reservation_unavailable' using errcode = '55000';
    end if;
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status = 'reserved'
      order by variant_id
      for update
    loop
      update public.inventory_stock
      set on_hand = on_hand - v_reservation.quantity,
          reserved = reserved - v_reservation.quantity,
          version = version + 1,
          updated_at = now()
      where variant_id = v_reservation.variant_id
        and reserved >= v_reservation.quantity
        and on_hand >= v_reservation.quantity;
      if not found then
        raise exception 'inventory_commit_failed:%', v_reservation.variant_id;
      end if;
      update public.inventory_reservations
      set status = 'committed', committed_at = now()
      where id = v_reservation.id;
    end loop;
  elsif p_next in ('cancelled', 'rejected') then
    perform coupon.id
    from public.marketplace_coupons as coupon
    join public.coupon_redemptions as redemption on redemption.coupon_id = coupon.id
    where redemption.order_id = v_order.id and redemption.voided_at is null
    order by coupon.id
    for update of coupon;
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status in ('reserved', 'committed')
      order by variant_id
      for update
    loop
      if v_reservation.status = 'reserved' then
        update public.inventory_stock
        set reserved = reserved - v_reservation.quantity,
            version = version + 1,
            updated_at = now()
        where variant_id = v_reservation.variant_id
          and reserved >= v_reservation.quantity;
      else
        update public.inventory_stock
        set on_hand = on_hand + v_reservation.quantity,
            version = version + 1,
            updated_at = now()
        where variant_id = v_reservation.variant_id;
      end if;
      update public.inventory_reservations
      set status = case
            when p_actor_id is null and p_reason = 'inventory_reservation_expired'
            then 'expired'::public.marketplace_reservation_status
            else 'released'::public.marketplace_reservation_status
          end,
          released_at = now()
      where id = v_reservation.id;
    end loop;

    with voided as (
      update public.coupon_redemptions
      set voided_at = now()
      where order_id = v_order.id and voided_at is null
      returning coupon_id
    )
    update public.marketplace_coupons as coupon
    set redeemed_count = greatest(0, coupon.redeemed_count - counts.quantity),
        updated_at = now()
    from (
      select coupon_id, count(*)::integer as quantity from voided group by coupon_id
    ) as counts
    where coupon.id = counts.coupon_id;

    update public.cod_collections
    set status = 'failed', updated_at = now()
    where order_id = v_order.id and status = 'pending';
  elsif p_next = 'delivered' and v_previous <> 'return_requested' then
    if p_collected_amount is null or p_collected_amount <> v_order.grand_total then
      raise exception 'cod_amount_mismatch' using errcode = '22023';
    end if;
    update public.cod_collections
    set collected_amount = p_collected_amount,
        status = 'collected',
        collected_by = case
          when exists (select 1 from public.profiles where id = p_actor_id) then p_actor_id
          else null
        end,
        collected_by_name_snapshot = (
          select profile.display_name from public.profiles as profile where profile.id = p_actor_id
        ),
        collected_at = now(),
        updated_at = now()
    where order_id = v_order.id and status = 'pending';
    if not found then
      raise exception 'cod_collection_not_pending';
    end if;

    insert into public.cash_ledger_entries (
      event_key, entry_type, order_id, collection_id, amount_piastres,
      actor_user_id, actor_name_snapshot, metadata
    )
    select
      'cod.collection:' || collection.id::text,
      'collection',
      collection.order_id,
      collection.id,
      collection.collected_amount,
      p_actor_id,
      (select profile.display_name from public.profiles as profile where profile.id = p_actor_id),
      jsonb_build_object('payment_method', 'cod')
    from public.cod_collections as collection
    where collection.order_id = v_order.id
    on conflict (event_key) do nothing;

    insert into public.commission_ledger (
      store_id,
      order_id,
      gross_merchandise_value,
      commission_amount,
      recognized_at
    ) values (
      v_order.store_id,
      v_order.id,
      v_order.subtotal - v_order.merchant_discount_total,
      round((v_order.subtotal - v_order.merchant_discount_total) * 0.0700, 0)::bigint,
      now()
    ) on conflict (order_id, entry_type) do nothing;
  elsif p_next = 'returned' then
    for v_reservation in
      select * from public.inventory_reservations
      where order_id = v_order.id and status = 'committed'
      order by variant_id
      for update
    loop
      update public.inventory_stock
      set on_hand = on_hand + v_reservation.quantity,
          version = version + 1,
          updated_at = now()
      where variant_id = v_reservation.variant_id;
      update public.inventory_reservations
      set status = 'released', released_at = now()
      where id = v_reservation.id;
    end loop;
    select * into v_earned_commission
    from public.commission_ledger
    where order_id = v_order.id and entry_type = 'earned'
    for update;
    if v_earned_commission is not null then
      update public.commission_ledger
      set reversed_at = now(),
          reversal_reason = coalesce(nullif(trim(p_reason), ''), 'order_returned')
      where id = v_earned_commission.id and reversed_at is null;
      insert into public.commission_ledger (
        store_id, order_id, entry_type, source_entry_id,
        gross_merchandise_value, commission_amount, recognized_at, reversal_reason
      ) values (
        v_earned_commission.store_id,
        v_earned_commission.order_id,
        'reversal',
        v_earned_commission.id,
        -v_earned_commission.gross_merchandise_value,
        -v_earned_commission.commission_amount,
        now(),
        coalesce(nullif(trim(p_reason), ''), 'order_returned')
      ) on conflict (order_id, entry_type) do nothing;
    end if;
    update public.cod_collections
    set status = 'refunded', updated_at = now()
    where order_id = v_order.id;
    insert into public.cash_ledger_entries (
      event_key, entry_type, order_id, collection_id, amount_piastres,
      actor_user_id, actor_name_snapshot, metadata
    )
    select
      'cod.refund:' || collection.id::text,
      'refund',
      collection.order_id,
      collection.id,
      -collection.collected_amount,
      p_actor_id,
      (select profile.display_name from public.profiles as profile where profile.id = p_actor_id),
      jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'order_returned'))
    from public.cod_collections as collection
    where collection.order_id = v_order.id
      and collection.collected_amount is not null
    on conflict (event_key) do nothing;
  end if;

  update public.marketplace_orders
  set status = p_next,
      payment_status = case
        when p_next = 'delivered' and v_previous <> 'return_requested' then 'collected'
        when p_next = 'returned' then 'refunded'
        else payment_status
      end,
      cancellation_reason = case
        when p_next in ('cancelled', 'rejected') then nullif(trim(p_reason), '')
        else cancellation_reason
      end,
      confirmed_at = case when p_next = 'confirmed' then now() else confirmed_at end,
      ready_at = case when p_next = 'ready_for_pickup' then now() else ready_at end,
      delivered_at = case when p_next = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      cancelled_at = case when p_next in ('cancelled', 'rejected') then now() else cancelled_at end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.marketplace_delivery_assignments
  set status = case
        when p_next = 'out_for_delivery' then 'picked_up'
        when p_next = 'delivered' then 'delivered'
        when p_next in ('delivery_failed', 'issue') then 'issue'
        when p_next in ('cancelled', 'rejected') then 'cancelled'
        else status
      end,
      picked_up_at = case
        when p_next in ('out_for_delivery', 'delivered') then coalesce(picked_up_at, now())
        else picked_up_at
      end,
      delivered_at = case when p_next = 'delivered' then now() else delivered_at end,
      notes = case when p_next in ('delivery_failed', 'issue') then nullif(trim(p_reason), '') else notes end,
      updated_at = now()
  where order_id = v_order.id;

  insert into public.marketplace_order_events (
    order_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_order.id,
    p_actor_id,
    'order.status_changed',
    v_previous,
    p_next,
    jsonb_build_object('reason', p_reason)
  );
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.order.status:' || gen_random_uuid()::text,
    'marketplace.order.status_changed',
    'marketplace_order',
    v_order.id::text,
    jsonb_build_object(
      'order_id', v_order.id,
      'customer_id', v_order.customer_id,
      'store_id', v_order.store_id,
      'from', v_previous,
      'to', p_next
    )
  );
  return jsonb_build_object(
    'id', v_order.id,
    'public_code', v_order.public_code,
    'order_group_id', v_order.order_group_id,
    'store_id', v_order.store_id,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'subtotal_piastres', v_order.subtotal,
    'discount_total_piastres', v_order.discount_total,
    'delivery_fee_piastres', v_order.delivery_fee,
    'grand_total_piastres', v_order.grand_total,
    'updated_at', v_order.updated_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.create_cash_reconciliation_batch(
  p_driver_id uuid,
  p_collection_ids uuid[],
  p_submitted_amounts_piastres bigint[],
  p_actor_id uuid,
  p_idempotency_key text
)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cash_reconciliation_batches;
  v_collection public.cod_collections;
  v_driver_name text;
  v_expected bigint := 0;
  v_submitted bigint := 0;
  v_index integer;
  v_is_admin boolean;
begin
  if p_driver_id is null
     or p_collection_ids is null
     or p_submitted_amounts_piastres is null
     or cardinality(p_collection_ids) not between 1 and 100
     or cardinality(p_collection_ids) <> cardinality(p_submitted_amounts_piastres)
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or exists (select 1 from unnest(p_submitted_amounts_piastres) as amount where amount < 0)
     or (select count(*) from unnest(p_collection_ids)) <>
        (select count(distinct id) from unnest(p_collection_ids) as id) then
    raise exception 'invalid_reconciliation_batch' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) into v_is_admin;
  if p_actor_id is distinct from p_driver_id and not v_is_admin then
    raise exception 'reconciliation_access_required' using errcode = '42501';
  end if;
  select display_name into v_driver_name
  from public.profiles
  where id = p_driver_id and role = 'driver' and is_active;
  if v_driver_name is null then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cash-reconciliation:' || p_idempotency_key, 0)
  );
  select * into v_batch
  from public.cash_reconciliation_batches
  where idempotency_key = p_idempotency_key;
  if v_batch is not null then
    if v_batch.driver_id is distinct from p_driver_id then
      raise exception 'reconciliation_idempotency_conflict' using errcode = '23505';
    end if;
    return v_batch;
  end if;

  insert into public.cash_reconciliation_batches (
    idempotency_key, driver_id, driver_name_snapshot, expected_total,
    submitted_total
  ) values (
    p_idempotency_key, p_driver_id, v_driver_name, 0, 0
  ) returning * into v_batch;

  for v_index in 1..cardinality(p_collection_ids) loop
    select * into v_collection
    from public.cod_collections
    where id = p_collection_ids[v_index]
    for update;
    if v_collection is null
       or v_collection.status <> 'collected'
       or v_collection.collected_by is distinct from p_driver_id
       or v_collection.collected_amount is null then
      raise exception 'collection_not_reconcilable:%', p_collection_ids[v_index]
        using errcode = '55000';
    end if;
    insert into public.cash_reconciliation_items (
      batch_id, collection_id, expected_amount, submitted_amount
    ) values (
      v_batch.id,
      v_collection.id,
      v_collection.collected_amount,
      p_submitted_amounts_piastres[v_index]
    );
    v_expected := v_expected + v_collection.collected_amount;
    v_submitted := v_submitted + p_submitted_amounts_piastres[v_index];
  end loop;

  update public.cash_reconciliation_batches
  set expected_total = v_expected,
      submitted_total = v_submitted,
      updated_at = now()
  where id = v_batch.id
  returning * into v_batch;
  return v_batch;
end;
$$;

create or replace function public.submit_cash_reconciliation_batch(
  p_batch_id uuid,
  p_actor_id uuid
)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cash_reconciliation_batches;
  v_is_admin boolean;
begin
  select * into v_batch
  from public.cash_reconciliation_batches
  where id = p_batch_id
  for update;
  if v_batch is null then
    raise exception 'reconciliation_batch_not_found' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_active
  ) into v_is_admin;
  if p_actor_id is distinct from v_batch.driver_id and not v_is_admin then
    raise exception 'reconciliation_access_required' using errcode = '42501';
  end if;
  if v_batch.status = 'submitted' then return v_batch; end if;
  if v_batch.status <> 'open' then
    raise exception 'reconciliation_batch_not_open' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.cash_reconciliation_items
    where batch_id = v_batch.id and submitted_amount is null
  ) then
    raise exception 'reconciliation_amount_missing' using errcode = '23514';
  end if;
  update public.cash_reconciliation_batches
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = v_batch.id
  returning * into v_batch;
  return v_batch;
end;
$$;

create or replace function public.review_cash_reconciliation_batch(
  p_batch_id uuid,
  p_accept boolean,
  p_actor_id uuid,
  p_notes text default null
)
returns public.cash_reconciliation_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.cash_reconciliation_batches;
  v_item record;
  v_actor_name text;
  v_adjustment bigint;
begin
  if p_accept is null or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'invalid_reconciliation_review' using errcode = '22023';
  end if;
  select display_name into v_actor_name
  from public.profiles
  where id = p_actor_id and role = 'admin' and is_active;
  if v_actor_name is null then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  select * into v_batch
  from public.cash_reconciliation_batches
  where id = p_batch_id
  for update;
  if v_batch is null then
    raise exception 'reconciliation_batch_not_found' using errcode = 'P0002';
  end if;
  if v_batch.status in ('accepted', 'rejected') then return v_batch; end if;
  if v_batch.status <> 'submitted' then
    raise exception 'reconciliation_batch_not_submitted' using errcode = '55000';
  end if;

  if p_accept then
    for v_item in
      select item.*, collection.order_id
      from public.cash_reconciliation_items as item
      join public.cod_collections as collection on collection.id = item.collection_id
      where item.batch_id = v_batch.id
      order by item.collection_id
      for update of collection
    loop
      update public.cod_collections
      set status = 'remitted', remitted_at = now(), updated_at = now()
      where id = v_item.collection_id and status = 'collected';
      if not found then
        raise exception 'collection_state_changed:%', v_item.collection_id using errcode = '55000';
      end if;
      update public.marketplace_orders
      set payment_status = 'remitted', updated_at = now()
      where id = v_item.order_id and payment_status = 'collected';
      if v_item.submitted_amount > 0 then
        insert into public.cash_ledger_entries (
          event_key, entry_type, order_id, collection_id,
          reconciliation_batch_id, amount_piastres, actor_user_id,
          actor_name_snapshot, metadata
        ) values (
          'cod.remittance:' || v_batch.id::text || ':' || v_item.collection_id::text,
          'remittance', v_item.order_id, v_item.collection_id, v_batch.id,
          -v_item.submitted_amount, p_actor_id, v_actor_name,
          jsonb_build_object('expected_piastres', v_item.expected_amount)
        ) on conflict (event_key) do nothing;
      end if;
      v_adjustment := v_item.submitted_amount - v_item.expected_amount;
      if v_adjustment <> 0 then
        insert into public.cash_ledger_entries (
          event_key, entry_type, order_id, collection_id,
          reconciliation_batch_id, amount_piastres, actor_user_id,
          actor_name_snapshot, metadata
        ) values (
          'cod.discrepancy:' || v_batch.id::text || ':' || v_item.collection_id::text,
          'discrepancy_adjustment', v_item.order_id, v_item.collection_id,
          v_batch.id, v_adjustment, p_actor_id, v_actor_name,
          jsonb_build_object('review_notes', p_notes)
        ) on conflict (event_key) do nothing;
      end if;
    end loop;
  end if;

  update public.cash_reconciliation_batches
  set status = case when p_accept then 'accepted' else 'rejected' end,
      reviewed_by = p_actor_id,
      reviewed_by_name_snapshot = v_actor_name,
      reviewed_at = now(),
      notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where id = v_batch.id
  returning * into v_batch;
  return v_batch;
end;
$$;

create or replace function public.prevent_cash_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cash_ledger_is_append_only' using errcode = '55000';
end;
$$;

create trigger cash_ledger_entries_immutable
before update or delete on public.cash_ledger_entries
for each row execute function public.prevent_cash_ledger_mutation();

create or replace function public.generate_commission_statement(
  p_store_id uuid,
  p_period_start date,
  p_actor_id uuid default null
)
returns public.commission_statements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.commission_statements;
  v_period_end date;
  v_period_start_utc timestamptz;
  v_period_end_utc timestamptz;
  v_gmv bigint;
  v_due bigint;
begin
  if p_period_start <> date_trunc('month', p_period_start)::date
     or p_period_start >= date_trunc(
       'month', (now() at time zone 'Africa/Cairo')::date
     )::date then
    raise exception 'invalid_statement_period' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'store_not_found' using errcode = 'P0002';
  end if;
  v_period_end := (p_period_start + interval '1 month')::date;
  v_period_start_utc := p_period_start::timestamp at time zone 'Africa/Cairo';
  v_period_end_utc := v_period_end::timestamp at time zone 'Africa/Cairo';

  select
    coalesce(sum(ledger.gross_merchandise_value), 0)::bigint,
    coalesce(sum(ledger.commission_amount), 0)::bigint
  into v_gmv, v_due
  from public.commission_ledger as ledger
  where ledger.store_id = p_store_id
    and ledger.recognized_at >= v_period_start_utc
    and ledger.recognized_at < v_period_end_utc;

  insert into public.commission_statements (
    store_id, period_start, period_end, gross_merchandise_value, commission_due
  ) values (
    p_store_id, p_period_start, v_period_end, v_gmv, v_due
  ) on conflict (store_id, period_start) do update
  set gross_merchandise_value = excluded.gross_merchandise_value,
      commission_due = excluded.commission_due,
      updated_at = now()
  where public.commission_statements.status = 'draft'
  returning * into v_statement;

  if v_statement is null then
    select * into v_statement
    from public.commission_statements
    where store_id = p_store_id and period_start = p_period_start;
  end if;
  if v_statement.status = 'draft' then
    update public.commission_ledger
    set statement_id = v_statement.id
    where store_id = p_store_id
      and recognized_at >= v_period_start_utc
      and recognized_at < v_period_end_utc
      and statement_id is null;
  end if;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_actor_id,
    'commission.statement_generated',
    'commission_statement',
    v_statement.id::text,
    to_jsonb(v_statement)
  );
  return v_statement;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth-bound merchant catalog API
-- ---------------------------------------------------------------------------

create or replace function public.get_my_marketplace_product(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_result jsonb;
begin
  select product.store_id into v_store_id
  from public.products as product
  where product.id = p_product_id;
  if v_store_id is null then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if (select auth.uid()) is null or not public.can_catalog_store(v_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', product.id,
    'store_id', product.store_id,
    'category_id', product.category_id,
    'product_key', product.product_key,
    'slug', product.slug,
    'name', product.name,
    'short_description', product.short_description,
    'description', product.description,
    'brand', product.brand,
    'status', product.status,
    'is_featured', product.is_featured,
    'first_submitted_at', product.first_submitted_at,
    'first_published_at', product.first_published_at,
    'moderation_notes', product.moderation_notes,
    'created_at', product.created_at,
    'updated_at', product.updated_at,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_id', image.media_asset_id,
        'position', image.position,
        'alt_text', image.alt_text,
        'public_url', asset.public_url,
        'updated_at', asset.updated_at
      ) order by image.position)
      from public.product_images as image
      join public.media_assets as asset on asset.id = image.media_asset_id
      where image.product_id = product.id and asset.status = 'active'
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', variant.id,
        'sku', variant.sku,
        'barcode', variant.barcode,
        'title', variant.title,
        'attributes', variant.attributes,
        'price_piastres', variant.price,
        'compare_at_price_piastres', variant.compare_at_price,
        'is_default', variant.is_default,
        'is_active', variant.is_active,
        'weight_grams', variant.weight_grams,
        'on_hand', stock.on_hand,
        'reserved', stock.reserved,
        'available', case when stock.track_inventory
          then greatest(0, stock.on_hand - stock.reserved)
          else null
        end,
        'track_inventory', stock.track_inventory,
        'low_stock_threshold', stock.low_stock_threshold,
        'version', stock.version,
        'updated_at', variant.updated_at
      ) order by variant.is_default desc, variant.created_at, variant.id)
      from public.product_variants as variant
      left join public.inventory_stock as stock on stock.variant_id = variant.id
      where variant.product_id = product.id
    ), '[]'::jsonb)
  ) into v_result
  from public.products as product
  where product.id = p_product_id;
  return v_result;
end;
$$;

create or replace function public.list_my_marketplace_products(
  p_store_id uuid,
  p_query text default null,
  p_status text default null,
  p_stock text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid_catalog_pagination' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'draft', 'pending_review', 'active', 'rejected', 'archived'
  ) then
    raise exception 'invalid_product_status' using errcode = '22023';
  end if;
  if p_stock is not null and p_stock not in (
    'in_stock', 'low_stock', 'out_of_stock', 'untracked'
  ) then
    raise exception 'invalid_stock_filter' using errcode = '22023';
  end if;

  with variant_rollup as materialized (
    select
      variant.product_id,
      count(*) filter (where variant.is_active)::integer as variant_count,
      min(variant.price) filter (where variant.is_active)::bigint as min_price_piastres,
      max(variant.price) filter (where variant.is_active)::bigint as max_price_piastres,
      coalesce(sum(
        case when variant.is_active and stock.track_inventory
          then greatest(0, stock.on_hand - stock.reserved)
          else 0
        end
      ), 0)::bigint as available_quantity,
      count(*) filter (where variant.is_active and stock.track_inventory)::integer
        as tracked_variant_count,
      count(*) filter (where variant.is_active and not stock.track_inventory)::integer
        as untracked_variant_count,
      coalesce(bool_or(
        variant.is_active and stock.track_inventory
        and stock.on_hand - stock.reserved > 0
        and stock.on_hand - stock.reserved <= stock.low_stock_threshold
      ), false) as has_low_stock
    from public.product_variants as variant
    join public.products as product
      on product.id = variant.product_id and product.store_id = p_store_id
    join public.inventory_stock as stock on stock.variant_id = variant.id
    group by variant.product_id
  ), thumbnails as materialized (
    select distinct on (image.product_id)
      image.product_id,
      asset.public_url as thumbnail_url
    from public.product_images as image
    join public.products as product
      on product.id = image.product_id and product.store_id = p_store_id
    join public.media_assets as asset
      on asset.id = image.media_asset_id and asset.status = 'active'
    order by image.product_id, image.position
  ), catalog_rows as materialized (
    select
      product.*,
      coalesce(category.name_ar, category.name_en) as category_name,
      rollup.min_price_piastres,
      rollup.max_price_piastres,
      coalesce(rollup.variant_count, 0) as variant_count,
      coalesce(rollup.available_quantity, 0) as available_quantity,
      thumbnail.thumbnail_url,
      case
        when coalesce(rollup.variant_count, 0) = 0 then 'out_of_stock'
        when coalesce(rollup.tracked_variant_count, 0) = 0
          and coalesce(rollup.untracked_variant_count, 0) > 0 then 'untracked'
        when coalesce(rollup.untracked_variant_count, 0) > 0 then 'in_stock'
        when coalesce(rollup.available_quantity, 0) <= 0 then 'out_of_stock'
        when rollup.has_low_stock then 'low_stock'
        else 'in_stock'
      end as stock_status
    from public.products as product
    left join public.product_categories as category on category.id = product.category_id
    left join variant_rollup as rollup on rollup.product_id = product.id
    left join thumbnails as thumbnail on thumbnail.product_id = product.id
    where product.store_id = p_store_id
      and (p_status is null or product.status::text = p_status)
      and (
        nullif(trim(coalesce(p_query, '')), '') is null
        or product.name ilike '%' || trim(p_query) || '%'
        or product.product_key ilike '%' || trim(p_query) || '%'
        or product.brand ilike '%' || trim(p_query) || '%'
      )
  ), filtered as materialized (
    select * from catalog_rows
    where p_stock is null or stock_status = p_stock
  ), page as (
    select * from filtered
    order by updated_at desc, id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'limit', p_limit,
    'offset', p_offset,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'store_id', page.store_id,
      'product_key', page.product_key,
      'slug', page.slug,
      'name', page.name,
      'brand', page.brand,
      'category_id', page.category_id,
      'category_name', page.category_name,
      'status', page.status,
      'moderation_notes', page.moderation_notes,
      'latest_rejection', case when page.status = 'rejected'
        then page.moderation_notes else null end,
      'is_featured', page.is_featured,
      'min_price_piastres', page.min_price_piastres,
      'max_price_piastres', page.max_price_piastres,
      'variant_count', page.variant_count,
      'available_quantity', page.available_quantity,
      'stock_status', page.stock_status,
      'thumbnail_url', page.thumbnail_url,
      'created_at', page.created_at,
      'updated_at', page.updated_at
    ) order by page.updated_at desc, page.id), '[]'::jsonb)
  ) into v_result
  from page;
  return v_result;
end;
$$;

create or replace function public.create_my_marketplace_product(
  p_store_id uuid,
  p_idempotency_key text,
  p_product jsonb,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_hash text;
  v_existing public.marketplace_catalog_mutations;
  v_product public.products;
  v_variant_json jsonb;
  v_variant_id uuid;
  v_default_count integer;
  v_response jsonb;
begin
  if v_actor_id is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or jsonb_typeof(p_product) <> 'object'
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) not between 1 and 100 then
    raise exception 'invalid_catalog_mutation' using errcode = '22023';
  end if;
  select count(*)::integer into v_default_count
  from jsonb_array_elements(p_variants) as variant_item(value)
  where coalesce((variant_item.value ->> 'is_active')::boolean, true)
    and coalesce((variant_item.value ->> 'is_default')::boolean, false);
  if v_default_count <> 1 then
    raise exception 'exactly_one_active_default_variant_required' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'create|' || p_store_id::text || '|' || p_product::text || '|' || p_variants::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('catalog:' || v_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_existing
  from public.marketplace_catalog_mutations
  where actor_user_id = v_actor_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.request_hash <> v_hash then
      raise exception 'catalog_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing.response || jsonb_build_object('idempotent', true);
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  insert into public.products (
    store_id, category_id, product_key, slug, name, short_description,
    description, brand, is_featured, created_by, created_by_name_snapshot
  ) values (
    p_store_id,
    nullif(p_product ->> 'category_id', '')::uuid,
    nullif(trim(p_product ->> 'product_key'), ''),
    lower(nullif(trim(p_product ->> 'slug'), '')),
    nullif(trim(p_product ->> 'name'), ''),
    nullif(trim(p_product ->> 'short_description'), ''),
    nullif(trim(p_product ->> 'description'), ''),
    nullif(trim(p_product ->> 'brand'), ''),
    coalesce((p_product ->> 'is_featured')::boolean, false),
    v_actor_id,
    v_actor_name
  ) returning * into v_product;

  for v_variant_json in select value from jsonb_array_elements(p_variants)
  loop
    if jsonb_typeof(v_variant_json) <> 'object'
       or (coalesce((v_variant_json ->> 'is_default')::boolean, false)
           and not coalesce((v_variant_json ->> 'is_active')::boolean, true)) then
      raise exception 'invalid_variant_payload' using errcode = '22023';
    end if;
    v_variant_id := coalesce(nullif(v_variant_json ->> 'id', '')::uuid, gen_random_uuid());
    insert into public.product_variants (
      id, product_id, store_id, sku, barcode, title, attributes, price,
      compare_at_price, is_default, is_active, weight_grams
    ) values (
      v_variant_id, v_product.id, p_store_id,
      nullif(trim(v_variant_json ->> 'sku'), ''),
      nullif(trim(v_variant_json ->> 'barcode'), ''),
      coalesce(nullif(trim(v_variant_json ->> 'title'), ''), 'Default'),
      coalesce(v_variant_json -> 'attributes', '{}'::jsonb),
      (v_variant_json ->> 'price_piastres')::bigint,
      nullif(v_variant_json ->> 'compare_at_price_piastres', '')::bigint,
      coalesce((v_variant_json ->> 'is_default')::boolean, false),
      coalesce((v_variant_json ->> 'is_active')::boolean, true),
      nullif(v_variant_json ->> 'weight_grams', '')::integer
    );
    insert into public.inventory_stock (
      variant_id, on_hand, low_stock_threshold, track_inventory
    ) values (
      v_variant_id,
      coalesce((v_variant_json ->> 'on_hand')::integer, 0),
      coalesce((v_variant_json ->> 'low_stock_threshold')::integer, 0),
      coalesce((v_variant_json ->> 'track_inventory')::boolean, true)
    );
  end loop;

  v_response := public.get_my_marketplace_product(v_product.id)
    || jsonb_build_object('idempotent', false);
  insert into public.marketplace_catalog_mutations (
    actor_user_id, actor_name_snapshot, store_id, idempotency_key,
    request_hash, operation, product_id, response
  ) values (
    v_actor_id, v_actor_name, p_store_id, p_idempotency_key,
    v_hash, 'create', v_product.id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.update_my_marketplace_product(
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_product jsonb,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_hash text;
  v_existing public.marketplace_catalog_mutations;
  v_product public.products;
  v_variant_json jsonb;
  v_variant_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_default_count integer;
  v_response jsonb;
begin
  if v_actor_id is null
     or p_expected_updated_at is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 128
     or jsonb_typeof(p_product) <> 'object'
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) not between 1 and 100 then
    raise exception 'invalid_catalog_mutation' using errcode = '22023';
  end if;
  select count(*)::integer into v_default_count
  from jsonb_array_elements(p_variants) as variant_item(value)
  where coalesce((variant_item.value ->> 'is_active')::boolean, true)
    and coalesce((variant_item.value ->> 'is_default')::boolean, false);
  if v_default_count <> 1 then
    raise exception 'exactly_one_active_default_variant_required' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if not public.can_catalog_store(v_product.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'update|' || p_product_id::text || '|' || p_expected_updated_at::text || '|' ||
    p_product::text || '|' || p_variants::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('catalog:' || v_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_existing
  from public.marketplace_catalog_mutations
  where actor_user_id = v_actor_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.request_hash <> v_hash then
      raise exception 'catalog_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing.response || jsonb_build_object('idempotent', true);
  end if;
  if v_product.updated_at is distinct from p_expected_updated_at then
    raise exception 'product_version_conflict' using errcode = '40001';
  end if;

  update public.products
  set category_id = case when p_product ? 'category_id'
        then nullif(p_product ->> 'category_id', '')::uuid else category_id end,
      product_key = coalesce(nullif(trim(p_product ->> 'product_key'), ''), product_key),
      slug = coalesce(lower(nullif(trim(p_product ->> 'slug'), '')), slug),
      name = coalesce(nullif(trim(p_product ->> 'name'), ''), name),
      short_description = case when p_product ? 'short_description'
        then nullif(trim(p_product ->> 'short_description'), '') else short_description end,
      description = case when p_product ? 'description'
        then nullif(trim(p_product ->> 'description'), '') else description end,
      brand = case when p_product ? 'brand'
        then nullif(trim(p_product ->> 'brand'), '') else brand end,
      is_featured = case when p_product ? 'is_featured'
        then (p_product ->> 'is_featured')::boolean else is_featured end,
      updated_at = now()
  where id = p_product_id;

  -- Clear the old default first to avoid a transient partial-unique conflict;
  -- final active-product integrity is checked by deferred constraint triggers.
  update public.product_variants
  set is_default = false, updated_at = now()
  where product_id = p_product_id and is_default;

  for v_variant_json in select value from jsonb_array_elements(p_variants)
  loop
    if jsonb_typeof(v_variant_json) <> 'object'
       or (coalesce((v_variant_json ->> 'is_default')::boolean, false)
           and not coalesce((v_variant_json ->> 'is_active')::boolean, true)) then
      raise exception 'invalid_variant_payload' using errcode = '22023';
    end if;
    v_variant_id := coalesce(nullif(v_variant_json ->> 'id', '')::uuid, gen_random_uuid());
    if (v_variant_json ? 'id') and not exists (
      select 1 from public.product_variants
      where id = v_variant_id and product_id = p_product_id
    ) then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
    insert into public.product_variants (
      id, product_id, store_id, sku, barcode, title, attributes, price,
      compare_at_price, is_default, is_active, weight_grams
    ) values (
      v_variant_id, p_product_id, v_product.store_id,
      nullif(trim(v_variant_json ->> 'sku'), ''),
      nullif(trim(v_variant_json ->> 'barcode'), ''),
      coalesce(nullif(trim(v_variant_json ->> 'title'), ''), 'Default'),
      coalesce(v_variant_json -> 'attributes', '{}'::jsonb),
      (v_variant_json ->> 'price_piastres')::bigint,
      nullif(v_variant_json ->> 'compare_at_price_piastres', '')::bigint,
      coalesce((v_variant_json ->> 'is_default')::boolean, false),
      coalesce((v_variant_json ->> 'is_active')::boolean, true),
      nullif(v_variant_json ->> 'weight_grams', '')::integer
    ) on conflict (id) do update
    set sku = excluded.sku,
        barcode = excluded.barcode,
        title = excluded.title,
        attributes = excluded.attributes,
        price = excluded.price,
        compare_at_price = excluded.compare_at_price,
        is_default = excluded.is_default,
        is_active = excluded.is_active,
        weight_grams = excluded.weight_grams,
        updated_at = now();

    insert into public.inventory_stock (
      variant_id, on_hand, low_stock_threshold, track_inventory
    ) values (
      v_variant_id,
      coalesce((v_variant_json ->> 'on_hand')::integer, 0),
      coalesce((v_variant_json ->> 'low_stock_threshold')::integer, 0),
      coalesce((v_variant_json ->> 'track_inventory')::boolean, true)
    ) on conflict (variant_id) do update
    set on_hand = excluded.on_hand,
        low_stock_threshold = excluded.low_stock_threshold,
        track_inventory = excluded.track_inventory,
        version = public.inventory_stock.version + 1,
        updated_at = now()
    where excluded.on_hand >= public.inventory_stock.reserved;
    if not found then
      raise exception 'inventory_below_reserved:%', v_variant_id using errcode = '22023';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_variant_id);
  end loop;

  update public.product_variants
  set is_active = false, is_default = false, updated_at = now()
  where product_id = p_product_id and not (id = any(v_seen_ids));
  update public.products set updated_at = now() where id = p_product_id;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  v_response := public.get_my_marketplace_product(p_product_id)
    || jsonb_build_object('idempotent', false);
  insert into public.marketplace_catalog_mutations (
    actor_user_id, actor_name_snapshot, store_id, idempotency_key,
    request_hash, operation, product_id, response
  ) values (
    v_actor_id, v_actor_name, v_product.store_id, p_idempotency_key,
    v_hash, 'update', p_product_id, v_response
  );
  return v_response;
end;
$$;

create or replace function public.archive_my_marketplace_product(
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_hash text;
  v_existing public.marketplace_catalog_mutations;
  v_product public.products;
  v_response jsonb;
begin
  if v_actor_id is null or p_expected_updated_at is null
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then
    raise exception 'invalid_catalog_mutation' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if v_product is null then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if not public.can_catalog_store(v_product.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    'archive|' || p_product_id::text || '|' || p_expected_updated_at::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('catalog:' || v_actor_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_existing
  from public.marketplace_catalog_mutations
  where actor_user_id = v_actor_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing.request_hash <> v_hash then
      raise exception 'catalog_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing.response || jsonb_build_object('idempotent', true);
  end if;
  if v_product.updated_at is distinct from p_expected_updated_at then
    raise exception 'product_version_conflict' using errcode = '40001';
  end if;
  if v_product.status = 'archived' then
    raise exception 'product_already_archived' using errcode = '55000';
  end if;
  update public.products set status = 'archived', updated_at = now()
  where id = p_product_id;
  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  v_response := public.get_my_marketplace_product(p_product_id)
    || jsonb_build_object('idempotent', false);
  insert into public.marketplace_catalog_mutations (
    actor_user_id, actor_name_snapshot, store_id, idempotency_key,
    request_hash, operation, product_id, response
  ) values (
    v_actor_id, v_actor_name, v_product.store_id, p_idempotency_key,
    v_hash, 'archive', p_product_id, v_response
  );
  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth-bound Excel import/export API
-- ---------------------------------------------------------------------------

create or replace function public.create_my_catalog_import_file(
  p_store_id uuid,
  p_file_id uuid,
  p_bucket text,
  p_object_key text,
  p_byte_size bigint,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_file public.catalog_import_files;
begin
  if v_actor_id is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if p_file_id is null
     or p_bucket is null or char_length(trim(p_bucket)) not between 3 and 255
     or p_object_key is null
     or p_object_key !~ ('^imports/' || p_store_id::text || '/[A-Za-z0-9/_-]+\.xlsx$')
     or p_object_key ~ '(^|/)\.\.(/|$)'
     or p_byte_size not between 1 and 10485760
     or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_import_file_metadata' using errcode = '22023';
  end if;
  select * into v_file from public.catalog_import_files where id = p_file_id for update;
  if v_file is not null then
    if v_file.store_id <> p_store_id
       or v_file.bucket <> trim(p_bucket)
       or v_file.object_key <> p_object_key
       or v_file.byte_size <> p_byte_size
       or v_file.sha256 <> p_sha256
       or v_file.status <> 'active' then
      raise exception 'import_file_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'file_id', v_file.id, 'status', v_file.status, 'idempotent', true
    );
  end if;
  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  insert into public.catalog_import_files (
    id, store_id, owner_id, owner_name_snapshot, bucket, object_key,
    content_type, byte_size, sha256
  ) values (
    p_file_id, p_store_id, v_actor_id, v_actor_name, trim(p_bucket), p_object_key,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    p_byte_size, p_sha256
  ) returning * into v_file;
  return jsonb_build_object(
    'file_id', v_file.id, 'status', v_file.status, 'idempotent', false
  );
end;
$$;

create or replace function public.discard_my_catalog_import_file(
  p_file_id uuid,
  p_reason text default 'client_discarded'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_file public.catalog_import_files;
begin
  if v_actor_id is null or p_file_id is null
     or char_length(trim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'invalid_import_file_discard' using errcode = '22023';
  end if;
  select * into v_file from public.catalog_import_files where id = p_file_id for update;
  if v_file is null or not (v_file.owner_id = v_actor_id or public.can_catalog_store(v_file.store_id)) then
    raise exception 'import_file_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.catalog_import_jobs where file_id = v_file.id) then
    raise exception 'import_file_in_use' using errcode = '55000';
  end if;
  if v_file.status = 'deleted' then
    return jsonb_build_object('file_id', v_file.id, 'status', 'deleted', 'idempotent', true);
  end if;
  update public.catalog_import_files
  set status = 'deleted', deleted_at = now(), updated_at = now()
  where id = v_file.id;
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'catalog.import_file_delete_requested:' || v_file.id::text,
    'catalog.import_file_delete_requested', 'catalog_import_file', v_file.id::text,
    jsonb_build_object(
      'file_id', v_file.id, 'bucket', v_file.bucket, 'object_key', v_file.object_key,
      'reason', trim(p_reason), 'requested_by', v_actor_id
    )
  ) on conflict (event_key) do nothing;
  return jsonb_build_object('file_id', v_file.id, 'status', 'deleted', 'idempotent', false);
end;
$$;

create or replace function public.begin_my_catalog_import(
  p_store_id uuid,
  p_file_id uuid,
  p_idempotency_key text,
  p_source_filename text,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_hash text;
  v_job public.catalog_import_jobs;
  v_products jsonb;
  v_variants jsonb;
  v_images jsonb;
  v_product_count integer;
  v_variant_count integer;
  v_image_count integer;
begin
  if v_actor_id is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_source_filename is null or char_length(trim(p_source_filename)) not between 1 and 255
     or jsonb_typeof(p_plan) <> 'object'
     or pg_catalog.pg_column_size(p_plan) > 67108864 then
    raise exception 'invalid_import_plan' using errcode = '22023';
  end if;
  v_products := coalesce(p_plan -> 'products', '[]'::jsonb);
  v_variants := coalesce(p_plan -> 'variants', '[]'::jsonb);
  v_images := coalesce(p_plan -> 'images', '[]'::jsonb);
  if jsonb_typeof(v_products) <> 'array'
     or jsonb_typeof(v_variants) <> 'array'
     or jsonb_typeof(v_images) <> 'array' then
    raise exception 'invalid_import_plan_arrays' using errcode = '22023';
  end if;
  v_product_count := jsonb_array_length(v_products);
  v_variant_count := jsonb_array_length(v_variants);
  v_image_count := jsonb_array_length(v_images);
  if v_product_count not between 1 and 5000
     or v_variant_count not between 1 and 20000
     or v_image_count not between 0 and 50000
     or v_product_count + v_variant_count + v_image_count > 75000 then
    raise exception 'import_plan_limit_exceeded' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.catalog_import_files as import_file
    where import_file.id = p_file_id
      and import_file.store_id = p_store_id
      and import_file.status = 'active'
  ) then
    raise exception 'import_file_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_products) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'product_key', '') !~ '^[A-Za-z0-9._/-]{1,80}$'
      or coalesce(item.value ->> 'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(trim(coalesce(item.value ->> 'name', ''))) not between 2 and 200
  ) or (
    select count(*) from jsonb_array_elements(v_products)
  ) <> (
    select count(distinct lower(trim(item.value ->> 'product_key')))
    from jsonb_array_elements(v_products) as item(value)
  ) then
    raise exception 'invalid_or_duplicate_import_product' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_variants) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'product_key', '') !~ '^[A-Za-z0-9._/-]{1,80}$'
      or char_length(trim(coalesce(item.value ->> 'sku', ''))) not between 1 and 80
      or coalesce(item.value ->> 'price_piastres', '') !~ '^[0-9]{1,14}$'
      or coalesce(item.value ->> 'on_hand', '0') !~ '^[0-9]{1,9}$'
      or not exists (
        select 1 from jsonb_array_elements(v_products) as product_item(value)
        where lower(product_item.value ->> 'product_key') =
              lower(item.value ->> 'product_key')
      )
  ) or (
    select count(*) from jsonb_array_elements(v_variants)
  ) <> (
    select count(distinct upper(trim(item.value ->> 'sku')))
    from jsonb_array_elements(v_variants) as item(value)
  ) or exists (
    select 1
    from jsonb_array_elements(v_products) as product_item(value)
    where (
      select count(*)
      from jsonb_array_elements(v_variants) as variant_item(value)
      where lower(variant_item.value ->> 'product_key') =
            lower(product_item.value ->> 'product_key')
        and coalesce((variant_item.value ->> 'is_active')::boolean, true)
        and coalesce((variant_item.value ->> 'is_default')::boolean, false)
    ) <> 1
  ) then
    raise exception 'invalid_or_duplicate_import_variant' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_images) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'product_key', '') !~ '^[A-Za-z0-9._/-]{1,80}$'
      or coalesce(item.value ->> 'position', '') !~ '^(?:[0-9])$'
      or coalesce(item.value ->> 'source_url', '') !~ '^https://'
      or not exists (
        select 1 from jsonb_array_elements(v_products) as product_item(value)
        where lower(product_item.value ->> 'product_key') =
              lower(item.value ->> 'product_key')
      )
  ) or exists (
    select 1
    from jsonb_array_elements(v_images) as item(value)
    group by lower(item.value ->> 'product_key')
    having count(*) > 10
       or count(*) <> count(distinct (item.value ->> 'position')::integer)
  ) then
    raise exception 'invalid_import_image' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    p_store_id::text || '|' || p_file_id::text || '|' || trim(p_source_filename) || '|' || p_plan::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('catalog-import:' || p_store_id::text || ':' || p_idempotency_key, 0)
  );
  select * into v_job
  from public.catalog_import_jobs
  where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if v_job is not null then
    if v_job.request_hash <> v_hash or v_job.file_id <> p_file_id then
      raise exception 'import_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'job_id', v_job.id, 'status', v_job.status,
      'total_rows', v_job.total_rows, 'valid_rows', v_job.valid_rows,
      'invalid_rows', v_job.invalid_rows, 'idempotent', true
    );
  end if;

  select display_name into v_actor_name from public.profiles where id = v_actor_id;
  insert into public.catalog_import_jobs (
    store_id, requested_by, requester_name_snapshot, file_id,
    idempotency_key, request_hash, status, source_filename,
    total_rows, valid_rows, invalid_rows
  ) values (
    p_store_id, v_actor_id, v_actor_name, p_file_id,
    p_idempotency_key, v_hash, 'ready', trim(p_source_filename),
    v_product_count + v_variant_count + v_image_count,
    v_product_count + v_variant_count + v_image_count,
    0
  ) returning * into v_job;

  insert into public.catalog_import_rows (
    job_id, sheet_name, row_number, entity_type, raw_data, normalized_data, status
  )
  select v_job.id, 'Products', (item.ordinality + 1)::integer, 'product',
         item.value, item.value, 'valid'
  from jsonb_array_elements(v_products) with ordinality as item(value, ordinality);
  insert into public.catalog_import_rows (
    job_id, sheet_name, row_number, entity_type, raw_data, normalized_data, status
  )
  select v_job.id, 'Variants', (item.ordinality + 1)::integer, 'variant',
         item.value, item.value, 'valid'
  from jsonb_array_elements(v_variants) with ordinality as item(value, ordinality);
  insert into public.catalog_import_rows (
    job_id, sheet_name, row_number, entity_type, raw_data, normalized_data, status
  )
  select v_job.id, 'Images', (item.ordinality + 1)::integer, 'image',
         item.value, item.value, 'valid'
  from jsonb_array_elements(v_images) with ordinality as item(value, ordinality);

  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id, 'catalog.import_staged', 'catalog_import_job', v_job.id::text,
    jsonb_build_object(
      'store_id', p_store_id, 'products', v_product_count,
      'variants', v_variant_count, 'images', v_image_count
    )
  );
  return jsonb_build_object(
    'job_id', v_job.id, 'status', v_job.status,
    'total_rows', v_job.total_rows, 'valid_rows', v_job.valid_rows,
    'invalid_rows', 0, 'idempotent', false
  );
end;
$$;

create or replace function public.apply_my_catalog_import(
  p_job_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_job public.catalog_import_jobs;
  v_row public.catalog_import_rows;
  v_product public.products;
  v_variant public.product_variants;
  v_data jsonb;
  v_products_applied integer := 0;
  v_variants_applied integer := 0;
  v_images_pending integer := 0;
begin
  if v_actor_id is null or p_expected_updated_at is null then
    raise exception 'invalid_import_apply_request' using errcode = '22023';
  end if;
  select * into v_job from public.catalog_import_jobs where id = p_job_id for update;
  if v_job is null then raise exception 'import_job_not_found' using errcode = 'P0002'; end if;
  if not public.can_catalog_store(v_job.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if v_job.status = 'completed' then
    return v_job.result || jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'idempotent', true);
  end if;
  if v_job.status = 'processing' then
    return v_job.result || jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'idempotent', true);
  end if;
  if v_job.status <> 'ready' then
    raise exception 'import_job_not_ready' using errcode = '55000';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'import_job_version_conflict' using errcode = '40001';
  end if;
  update public.catalog_import_jobs set status = 'processing', started_at = now(), updated_at = now()
  where id = v_job.id;

  -- Reset defaults only for products in this workbook. Omitted variants remain
  -- active and are never deleted.
  update public.product_variants as variant
  set is_default = false, updated_at = now()
  where variant.product_id in (
    select product.id
    from public.products as product
    join public.catalog_import_rows as import_row
      on import_row.job_id = v_job.id and import_row.sheet_name = 'Products'
     and lower(import_row.normalized_data ->> 'product_key') = lower(product.product_key)
    where product.store_id = v_job.store_id
  ) and variant.is_default;

  for v_row in
    select * from public.catalog_import_rows
    where job_id = v_job.id and sheet_name = 'Products' and status = 'valid'
    order by row_number
    for update
  loop
    v_data := v_row.normalized_data;
    select * into v_product
    from public.products
    where store_id = v_job.store_id
      and lower(product_key) = lower(v_data ->> 'product_key')
    for update;
    if v_product is null then
      insert into public.products (
        store_id, category_id, product_key, slug, name, short_description,
        description, brand, is_featured, created_by
      ) values (
        v_job.store_id, nullif(v_data ->> 'category_id', '')::uuid,
        trim(v_data ->> 'product_key'), lower(trim(v_data ->> 'slug')),
        trim(v_data ->> 'name'), nullif(trim(v_data ->> 'short_description'), ''),
        nullif(trim(v_data ->> 'description'), ''), nullif(trim(v_data ->> 'brand'), ''),
        coalesce((v_data ->> 'is_featured')::boolean, false), v_actor_id
      ) returning * into v_product;
    else
      update public.products
      set category_id = case when v_data ? 'category_id'
            then nullif(v_data ->> 'category_id', '')::uuid else category_id end,
          slug = lower(trim(v_data ->> 'slug')),
          name = trim(v_data ->> 'name'),
          short_description = nullif(trim(v_data ->> 'short_description'), ''),
          description = nullif(trim(v_data ->> 'description'), ''),
          brand = nullif(trim(v_data ->> 'brand'), ''),
          is_featured = coalesce((v_data ->> 'is_featured')::boolean, false),
          updated_at = now()
      where id = v_product.id returning * into v_product;
    end if;
    update public.catalog_import_rows
    set product_id = v_product.id, status = 'applied'
    where id = v_row.id;
    v_products_applied := v_products_applied + 1;
  end loop;

  for v_row in
    select * from public.catalog_import_rows
    where job_id = v_job.id and sheet_name = 'Variants' and status = 'valid'
    order by row_number
    for update
  loop
    v_data := v_row.normalized_data;
    select * into v_product
    from public.products
    where store_id = v_job.store_id
      and lower(product_key) = lower(v_data ->> 'product_key');
    if v_product is null then raise exception 'import_product_not_found' using errcode = 'P0002'; end if;
    select * into v_variant
    from public.product_variants
    where store_id = v_job.store_id and upper(trim(sku)) = upper(trim(v_data ->> 'sku'))
    for update;
    if v_variant is not null and v_variant.product_id <> v_product.id then
      raise exception 'import_sku_belongs_to_another_product:%', v_data ->> 'sku'
        using errcode = '23505';
    end if;
    if v_variant is null then
      insert into public.product_variants (
        product_id, store_id, sku, barcode, title, attributes, price,
        compare_at_price, is_default, is_active, weight_grams
      ) values (
        v_product.id, v_job.store_id, trim(v_data ->> 'sku'),
        nullif(trim(v_data ->> 'barcode'), ''),
        coalesce(nullif(trim(v_data ->> 'title'), ''), 'Default'),
        coalesce(v_data -> 'attributes', '{}'::jsonb),
        (v_data ->> 'price_piastres')::bigint,
        nullif(v_data ->> 'compare_at_price_piastres', '')::bigint,
        coalesce((v_data ->> 'is_default')::boolean, false),
        coalesce((v_data ->> 'is_active')::boolean, true),
        nullif(v_data ->> 'weight_grams', '')::integer
      ) returning * into v_variant;
    else
      update public.product_variants
      set barcode = nullif(trim(v_data ->> 'barcode'), ''),
          title = coalesce(nullif(trim(v_data ->> 'title'), ''), 'Default'),
          attributes = coalesce(v_data -> 'attributes', '{}'::jsonb),
          price = (v_data ->> 'price_piastres')::bigint,
          compare_at_price = nullif(v_data ->> 'compare_at_price_piastres', '')::bigint,
          is_default = coalesce((v_data ->> 'is_default')::boolean, false),
          is_active = coalesce((v_data ->> 'is_active')::boolean, true),
          weight_grams = nullif(v_data ->> 'weight_grams', '')::integer,
          updated_at = now()
      where id = v_variant.id returning * into v_variant;
    end if;
    insert into public.inventory_stock (
      variant_id, on_hand, low_stock_threshold, track_inventory
    ) values (
      v_variant.id, coalesce((v_data ->> 'on_hand')::integer, 0),
      coalesce((v_data ->> 'low_stock_threshold')::integer, 0),
      coalesce((v_data ->> 'track_inventory')::boolean, true)
    ) on conflict (variant_id) do update
    set on_hand = excluded.on_hand,
        low_stock_threshold = excluded.low_stock_threshold,
        track_inventory = excluded.track_inventory,
        version = public.inventory_stock.version + 1,
        updated_at = now()
    where excluded.on_hand >= public.inventory_stock.reserved;
    if not found then
      raise exception 'inventory_below_reserved:%', v_variant.id using errcode = '22023';
    end if;
    update public.catalog_import_rows
    set product_id = v_product.id, variant_id = v_variant.id, status = 'applied'
    where id = v_row.id;
    v_variants_applied := v_variants_applied + 1;
  end loop;

  select count(*)::integer into v_images_pending
  from public.catalog_import_rows
  where job_id = v_job.id and sheet_name = 'Images' and status = 'valid';
  update public.catalog_import_jobs
  set status = case when v_images_pending = 0 then 'completed' else 'processing' end,
      applied_rows = v_products_applied + v_variants_applied,
      result = jsonb_build_object(
        'products_applied', v_products_applied,
        'variants_applied', v_variants_applied,
        'images_pending', v_images_pending
      ),
      completed_at = case when v_images_pending = 0 then now() else null end,
      updated_at = now()
  where id = v_job.id returning * into v_job;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id, 'catalog.import_applied', 'catalog_import_job', v_job.id::text,
    v_job.result
  );
  return v_job.result || jsonb_build_object(
    'job_id', v_job.id, 'status', v_job.status, 'idempotent', false
  );
end;
$$;

create or replace function public.claim_catalog_import_image_jobs(
  p_limit integer,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_limit not between 1 and 100 or p_worker_id is null
     or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid_import_image_claim' using errcode = '22023';
  end if;
  -- A crashed worker must not make a row immortal. Expired leases consume an
  -- attempt just like reported failures and become dead letters at the same
  -- five-attempt boundary; otherwise the sixth claim can poison the batch.
  update public.catalog_import_rows
  set worker_status = case when worker_attempts >= 5 then 'dead_letter' else 'retry' end,
      status = case when worker_attempts >= 5 then 'skipped' else status end,
      worker_id = null,
      worker_lease_expires_at = null,
      worker_available_at = case when worker_attempts >= 5 then worker_available_at
        else now() + make_interval(secs => least(900, 15 * (2 ^ greatest(0, worker_attempts - 1))::integer)) end,
      worker_last_error = 'worker_lease_expired',
      validation_errors = case when worker_attempts >= 5
        then validation_errors || jsonb_build_array(jsonb_build_object('code', 'remote_image_dead_letter'))
        else validation_errors end
  where sheet_name = 'Images' and status = 'valid' and worker_status = 'leased'
    and worker_lease_expires_at <= now();

  update public.catalog_import_rows
  set status = 'skipped', worker_status = 'dead_letter', worker_id = null,
      worker_lease_expires_at = null, worker_last_error = 'worker_attempt_limit_reached',
      validation_errors = validation_errors ||
        jsonb_build_array(jsonb_build_object('code', 'remote_image_dead_letter'))
  where sheet_name = 'Images' and status = 'valid'
    and worker_status in ('pending', 'retry') and worker_attempts >= 5;

  -- Validation occurs before products are applied. If a product was removed or
  -- could not be resolved afterwards, terminate that image row instead of
  -- repeatedly leasing a row that cannot be returned to a worker.
  update public.catalog_import_rows as row
  set status = 'skipped', worker_status = 'dead_letter', worker_id = null,
      worker_lease_expires_at = null, worker_last_error = 'worker_product_not_found',
      validation_errors = row.validation_errors ||
        jsonb_build_array(jsonb_build_object('code', 'remote_image_product_not_found'))
  from public.catalog_import_jobs as job
  where job.id = row.job_id and job.status = 'processing'
    and row.sheet_name = 'Images' and row.status = 'valid'
    and row.worker_status in ('pending', 'retry')
    and not exists (
      select 1 from public.products as product
      where product.store_id = job.store_id
        and lower(product.product_key) = lower(row.normalized_data ->> 'product_key')
    );

  update public.catalog_import_jobs as job
  set status = 'completed', completed_at = now(), updated_at = now(),
      result = job.result || jsonb_build_object(
        'images_pending', 0,
        'images_failed', (
          select count(*) from public.catalog_import_rows as failed
          where failed.job_id = job.id and failed.sheet_name = 'Images'
            and failed.worker_status = 'dead_letter'
        )
      )
  where job.status = 'processing'
    and not exists (
      select 1 from public.catalog_import_rows as pending
      where pending.job_id = job.id and pending.sheet_name = 'Images'
        and pending.status = 'valid'
    );
  with candidates as (
    select row.id
    from public.catalog_import_rows as row
    join public.catalog_import_jobs as job on job.id = row.job_id
    join public.products as product on product.store_id = job.store_id
      and lower(product.product_key) = lower(row.normalized_data ->> 'product_key')
    where row.sheet_name = 'Images' and row.status = 'valid'
      and row.worker_status in ('pending', 'retry')
      and row.worker_available_at <= now() and job.status = 'processing'
    order by row.worker_available_at, row.id
    for update of row skip locked
    limit p_limit
  ), claimed as (
    update public.catalog_import_rows as row
    set worker_status = 'leased', worker_attempts = row.worker_attempts + 1,
        worker_id = p_worker_id,
        worker_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        worker_last_error = null
    from candidates where row.id = candidates.id
    returning row.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'row_id', claimed.id, 'job_id', claimed.job_id, 'row_number', claimed.row_number,
    'store_id', job.store_id, 'product_id', product.id,
    'product_key', claimed.normalized_data ->> 'product_key',
    'source_url', claimed.normalized_data ->> 'source_url',
    'position', (claimed.normalized_data ->> 'position')::integer,
    'attempt', claimed.worker_attempts,
    'lease_expires_at', claimed.worker_lease_expires_at
  ) order by claimed.id), '[]'::jsonb) into v_result
  from claimed
  join public.catalog_import_jobs as job on job.id = claimed.job_id
  join public.products as product on product.store_id = job.store_id
    and lower(product.product_key) = lower(claimed.normalized_data ->> 'product_key');
  return v_result;
end;
$$;

create or replace function public.complete_catalog_import_image_job(
  p_row_id bigint,
  p_worker_id uuid,
  p_bucket text,
  p_object_key text,
  p_public_url text,
  p_byte_size bigint,
  p_sha256 text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.catalog_import_rows;
  v_job public.catalog_import_jobs;
  v_product public.products;
  v_merchant_id uuid;
  v_asset_id uuid := gen_random_uuid();
  v_existing_asset public.media_assets;
  v_previous_asset_id uuid;
  v_previous_asset public.media_assets;
  v_pending integer;
begin
  select * into v_row from public.catalog_import_rows where id = p_row_id for update;
  if v_row is null or v_row.sheet_name <> 'Images' or p_worker_id is null then
    raise exception 'import_image_lease_not_found' using errcode = 'P0002';
  end if;

  -- A client can lose the RPC response after the transaction commits. Return
  -- the already committed asset only when every immutable object attribute
  -- matches, instead of converting a successful job into a false retry.
  if v_row.status = 'applied' and v_row.worker_status = 'completed' then
    select asset.* into v_existing_asset
    from public.media_assets as asset
    where asset.id::text = (v_row.normalized_data ->> 'media_asset_id')
      and (asset.metadata ->> 'catalog_import_row_id') = v_row.id::text;
    if v_existing_asset.id is not null
       and v_existing_asset.bucket = p_bucket
       and v_existing_asset.object_key = p_object_key
       and v_existing_asset.public_url = p_public_url
       and v_existing_asset.byte_size = p_byte_size
       and v_existing_asset.sha256 = p_sha256
       and v_existing_asset.width = p_width
       and v_existing_asset.height = p_height then
      return jsonb_build_object(
        'row_id', v_row.id, 'job_id', v_row.job_id,
        'asset_id', v_existing_asset.id, 'status', 'completed', 'idempotent', true
      );
    end if;
    raise exception 'import_image_completion_mismatch' using errcode = '22023';
  end if;

  if v_row.status <> 'valid' or v_row.worker_status <> 'leased'
     or v_row.worker_id is distinct from p_worker_id
     or v_row.worker_lease_expires_at is null or v_row.worker_lease_expires_at <= now() then
    raise exception 'import_image_lease_not_found' using errcode = 'P0002';
  end if;
  select * into v_job from public.catalog_import_jobs where id = v_row.job_id for update;
  select product.* into v_product from public.products as product
  where product.store_id = v_job.store_id
    and lower(product.product_key) = lower(v_row.normalized_data ->> 'product_key');
  select merchant_id into v_merchant_id from public.stores where id = v_job.store_id;
  if v_job.status <> 'processing' or v_product is null
     or p_bucket is distinct from (select bucket from public.catalog_import_files where id = v_job.file_id)
     or p_object_key is distinct from (
       'media/' || v_job.store_id::text || '/product/' || v_product.id::text ||
       '/import-' || v_row.id::text || '-' || left(p_sha256, 32) || '.webp'
     )
     or p_public_url !~ '^https://' or p_byte_size not between 32 and 12582912
     or p_sha256 !~ '^[a-f0-9]{64}$' or p_width not between 1 and 10000 or p_height not between 1 and 10000 then
    raise exception 'invalid_import_image_completion' using errcode = '22023';
  end if;
  insert into public.media_assets (
    id, owner_id, merchant_id, store_id, entity_type, entity_id, slot, visibility,
    bucket, object_key, public_url, content_type, byte_size, width, height, sha256,
    metadata
  ) values (
    v_asset_id, v_job.requested_by, v_merchant_id, v_job.store_id, 'product', v_product.id,
    'gallery', 'public', p_bucket, p_object_key, p_public_url, 'image/webp', p_byte_size,
    p_width, p_height, p_sha256,
    jsonb_build_object('catalog_import_job_id', v_job.id, 'catalog_import_row_id', v_row.id)
  );
  select media_asset_id into v_previous_asset_id
  from public.product_images
  where product_id = v_product.id
    and position = (v_row.normalized_data ->> 'position')::smallint
  for update;
  insert into public.product_images (product_id, media_asset_id, position, alt_text)
  values (v_product.id, v_asset_id, (v_row.normalized_data ->> 'position')::smallint, v_product.name)
  on conflict (product_id, position) do update
  set media_asset_id = excluded.media_asset_id, alt_text = excluded.alt_text, updated_at = now();
  if v_previous_asset_id is not null and v_previous_asset_id <> v_asset_id then
    update public.media_assets
    set status = 'deleted', deleted_at = now(), updated_at = now()
    where id = v_previous_asset_id and status = 'active'
    returning * into v_previous_asset;
    if v_previous_asset.id is not null then
      insert into public.marketplace_outbox (
        event_key, topic, aggregate_type, aggregate_id, payload
      ) values (
        'media.delete_requested:' || v_previous_asset.id::text,
        'media.delete_requested', 'media_asset', v_previous_asset.id::text,
        jsonb_build_object(
          'asset_id', v_previous_asset.id, 'bucket', v_previous_asset.bucket,
          'object_key', v_previous_asset.object_key, 'reason', 'catalog_import_position_replaced'
        )
      ) on conflict (event_key) do nothing;
    end if;
  end if;
  update public.catalog_import_rows
  set product_id = v_product.id, status = 'applied', worker_status = 'completed',
      worker_id = null, worker_lease_expires_at = null,
      normalized_data = normalized_data || jsonb_build_object('media_asset_id', v_asset_id)
  where id = v_row.id;
  update public.catalog_import_jobs set applied_rows = applied_rows + 1, updated_at = now() where id = v_job.id;
  select count(*) into v_pending from public.catalog_import_rows
  where job_id = v_job.id and sheet_name = 'Images' and status = 'valid';
  if v_pending = 0 then
    update public.catalog_import_jobs
    set status = 'completed', completed_at = now(), updated_at = now(),
        result = result || jsonb_build_object(
          'images_pending', 0,
          'images_failed', (select count(*) from public.catalog_import_rows where job_id = v_job.id and sheet_name = 'Images' and worker_status = 'dead_letter')
        )
    where id = v_job.id;
  end if;
  return jsonb_build_object(
    'row_id', v_row.id, 'job_id', v_job.id, 'asset_id', v_asset_id,
    'status', 'completed', 'idempotent', false
  );
end;
$$;

create or replace function public.fail_catalog_import_image_job(
  p_row_id bigint,
  p_worker_id uuid,
  p_error text,
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.catalog_import_rows;
  v_dead boolean;
  v_pending integer;
begin
  select * into v_row from public.catalog_import_rows where id = p_row_id for update;
  if v_row is null or v_row.sheet_name <> 'Images' or v_row.status <> 'valid'
     or v_row.worker_status <> 'leased' or v_row.worker_id is distinct from p_worker_id
     or char_length(trim(coalesce(p_error, ''))) not between 1 and 1000 then
    raise exception 'import_image_lease_not_found' using errcode = 'P0002';
  end if;
  v_dead := not coalesce(p_retryable, false) or v_row.worker_attempts >= 5;
  update public.catalog_import_rows
  set worker_status = case when v_dead then 'dead_letter' else 'retry' end,
      status = case when v_dead then 'skipped' else status end,
      worker_available_at = case when v_dead then worker_available_at
        else now() + make_interval(secs => least(900, 15 * (2 ^ greatest(0, worker_attempts - 1))::integer)) end,
      worker_id = null, worker_lease_expires_at = null, worker_last_error = left(trim(p_error), 1000),
      validation_errors = case when v_dead then validation_errors ||
        jsonb_build_array(jsonb_build_object('code', 'remote_image_dead_letter')) else validation_errors end
  where id = v_row.id;
  if v_dead then
    select count(*) into v_pending from public.catalog_import_rows
    where job_id = v_row.job_id and sheet_name = 'Images' and status = 'valid';
    if v_pending = 0 then
      update public.catalog_import_jobs
      set status = 'completed', completed_at = now(), updated_at = now(),
          result = result || jsonb_build_object(
            'images_pending', 0,
            'images_failed', (select count(*) from public.catalog_import_rows where job_id = v_row.job_id and sheet_name = 'Images' and worker_status = 'dead_letter')
          )
      where id = v_row.job_id;
    end if;
  end if;
  return jsonb_build_object(
    'row_id', v_row.id, 'job_id', v_row.job_id,
    'status', case when v_dead then 'dead_letter' else 'retry' end,
    'attempts', v_row.worker_attempts
  );
end;
$$;

create or replace function public.finalize_my_catalog_import(
  p_job_id uuid,
  p_image_results jsonb,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_job public.catalog_import_jobs;
  v_item jsonb;
  v_row public.catalog_import_rows;
  v_product_id uuid;
  v_asset_id uuid;
  v_status text;
begin
  if v_actor_id is null or jsonb_typeof(p_image_results) <> 'array'
     or jsonb_array_length(p_image_results) > 10000
     or jsonb_typeof(p_result) <> 'object'
     or pg_catalog.pg_column_size(p_result) > 65536 then
    raise exception 'invalid_import_finalize_request' using errcode = '22023';
  end if;
  select * into v_job from public.catalog_import_jobs where id = p_job_id for update;
  if v_job is null then raise exception 'import_job_not_found' using errcode = 'P0002'; end if;
  if not public.can_catalog_store(v_job.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if v_job.status = 'completed' then
    return v_job.result || jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'idempotent', true);
  end if;
  if v_job.status <> 'processing' then
    raise exception 'import_job_not_processing' using errcode = '55000';
  end if;

  for v_item in select value from jsonb_array_elements(p_image_results)
  loop
    v_status := v_item ->> 'status';
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'row_number', '') !~ '^[0-9]{1,6}$'
       or v_status not in ('applied', 'skipped') then
      raise exception 'invalid_import_image_result' using errcode = '22023';
    end if;
    if (v_item ->> 'row_number')::integer < 2 then
      raise exception 'invalid_import_image_result' using errcode = '22023';
    end if;
    select * into v_row
    from public.catalog_import_rows
    where job_id = v_job.id and sheet_name = 'Images'
      and row_number = (v_item ->> 'row_number')::integer
    for update;
    if v_row is null then raise exception 'import_image_row_not_found' using errcode = 'P0002'; end if;
    if v_row.status in ('applied', 'skipped') then continue; end if;
    if v_row.status <> 'valid' then raise exception 'import_image_row_not_ready' using errcode = '55000'; end if;
    select id into v_product_id from public.products
    where store_id = v_job.store_id
      and lower(product_key) = lower(v_row.normalized_data ->> 'product_key');
    if v_product_id is null then raise exception 'import_product_not_found' using errcode = 'P0002'; end if;
    if v_status = 'applied' then
      v_asset_id := nullif(v_item ->> 'media_asset_id', '')::uuid;
      if v_asset_id is null or not exists (
        select 1 from public.media_assets
        where id = v_asset_id and store_id = v_job.store_id
          and entity_type = 'product' and entity_id = v_product_id and status = 'active'
      ) then
        raise exception 'import_image_asset_not_ready' using errcode = '55000';
      end if;
    else
      v_asset_id := null;
    end if;
    update public.catalog_import_rows
    set product_id = v_product_id,
        status = v_status,
        validation_errors = case when v_status = 'skipped' then jsonb_build_array(
          jsonb_build_object('code', coalesce(v_item ->> 'error_code', 'image_skipped'))
        ) else '[]'::jsonb end,
        normalized_data = normalized_data || jsonb_build_object('media_asset_id', v_asset_id)
    where id = v_row.id;
  end loop;
  if exists (
    select 1 from public.catalog_import_rows
    where job_id = v_job.id and sheet_name = 'Images' and status = 'valid'
  ) then
    raise exception 'import_image_results_incomplete' using errcode = '22023';
  end if;
  update public.catalog_import_jobs
  set status = 'completed',
      applied_rows = (
        select count(*) from public.catalog_import_rows
        where job_id = v_job.id and status = 'applied'
      ),
      result = v_job.result || p_result || jsonb_build_object('images_pending', 0),
      completed_at = now(), updated_at = now()
  where id = v_job.id returning * into v_job;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id, 'catalog.import_completed', 'catalog_import_job', v_job.id::text,
    v_job.result
  );
  return v_job.result || jsonb_build_object(
    'job_id', v_job.id, 'status', v_job.status, 'idempotent', false
  );
end;
$$;

create or replace function public.fail_my_catalog_import(
  p_job_id uuid,
  p_error_code text,
  p_issues jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_job public.catalog_import_jobs;
begin
  if v_actor_id is null
     or p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_.-]{1,99}$'
     or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) > 100
     or pg_catalog.pg_column_size(p_issues) > 65536 then
    raise exception 'invalid_import_failure' using errcode = '22023';
  end if;
  select * into v_job from public.catalog_import_jobs where id = p_job_id for update;
  if v_job is null then raise exception 'import_job_not_found' using errcode = 'P0002'; end if;
  if not public.can_catalog_store(v_job.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if v_job.status = 'completed' then
    raise exception 'completed_import_cannot_fail' using errcode = '55000';
  end if;
  update public.catalog_import_jobs
  set status = 'failed', error_summary = p_issues,
      result = result || jsonb_build_object('error_code', p_error_code),
      completed_at = now(), updated_at = now()
  where id = v_job.id returning * into v_job;
  insert into public.marketplace_audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id, 'catalog.import_failed', 'catalog_import_job', v_job.id::text,
    jsonb_build_object('error_code', p_error_code)
  );
  return jsonb_build_object(
    'job_id', v_job.id, 'status', v_job.status,
    'error_code', p_error_code, 'issues', v_job.error_summary
  );
end;
$$;

create or replace function public.get_my_catalog_import(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job public.catalog_import_jobs;
begin
  select * into v_job from public.catalog_import_jobs where id = p_job_id;
  if v_job is null then raise exception 'import_job_not_found' using errcode = 'P0002'; end if;
  if (select auth.uid()) is null or not public.can_catalog_store(v_job.store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'job_id', v_job.id, 'store_id', v_job.store_id, 'file_id', v_job.file_id,
    'source_filename', v_job.source_filename, 'status', v_job.status,
    'total_rows', v_job.total_rows, 'valid_rows', v_job.valid_rows,
    'invalid_rows', v_job.invalid_rows, 'applied_rows', v_job.applied_rows,
    'error_summary', v_job.error_summary, 'result', v_job.result,
    'started_at', v_job.started_at, 'completed_at', v_job.completed_at,
    'created_at', v_job.created_at, 'updated_at', v_job.updated_at,
    'row_counts', (
      select coalesce(jsonb_object_agg(counts.sheet_name, counts.count), '{}'::jsonb)
      from (
        select sheet_name, count(*)::integer as count
        from public.catalog_import_rows where job_id = v_job.id group by sheet_name
      ) as counts
    )
  );
end;
$$;

create or replace function public.export_my_marketplace_catalog(
  p_store_id uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.can_catalog_store(p_store_id) then
    raise exception 'catalog_access_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 or p_offset < 0 then
    raise exception 'invalid_export_pagination' using errcode = '22023';
  end if;
  with product_page as materialized (
    select * from public.products
    where store_id = p_store_id
    order by created_at, id limit p_limit offset p_offset
  ), variant_rows as materialized (
    select variant.product_id, jsonb_agg(jsonb_build_object(
      'id', variant.id, 'sku', variant.sku, 'barcode', variant.barcode,
      'title', variant.title, 'attributes', variant.attributes,
      'price_piastres', variant.price,
      'compare_at_price_piastres', variant.compare_at_price,
      'is_default', variant.is_default, 'is_active', variant.is_active,
      'weight_grams', variant.weight_grams,
      'on_hand', stock.on_hand, 'reserved', stock.reserved,
      'track_inventory', stock.track_inventory,
      'low_stock_threshold', stock.low_stock_threshold
    ) order by variant.created_at, variant.id) as variants
    from public.product_variants as variant
    join product_page on product_page.id = variant.product_id
    join public.inventory_stock as stock on stock.variant_id = variant.id
    group by variant.product_id
  ), image_rows as materialized (
    select image.product_id, jsonb_agg(jsonb_build_object(
      'media_asset_id', image.media_asset_id, 'position', image.position,
      'source_url', asset.public_url, 'alt_text', image.alt_text
    ) order by image.position) as images
    from public.product_images as image
    join product_page on product_page.id = image.product_id
    join public.media_assets as asset
      on asset.id = image.media_asset_id and asset.status = 'active'
    group by image.product_id
  )
  select jsonb_build_object(
    'store_id', p_store_id,
    'total', (select count(*) from public.products where store_id = p_store_id),
    'limit', p_limit, 'offset', p_offset,
    'products', coalesce(jsonb_agg(jsonb_build_object(
      'id', product_page.id, 'product_key', product_page.product_key,
      'slug', product_page.slug, 'name', product_page.name,
      'category_id', product_page.category_id,
      'short_description', product_page.short_description,
      'description', product_page.description, 'brand', product_page.brand,
      'status', product_page.status, 'is_featured', product_page.is_featured,
      'variants', coalesce(variant_rows.variants, '[]'::jsonb),
      'images', coalesce(image_rows.images, '[]'::jsonb),
      'updated_at', product_page.updated_at
    ) order by product_page.created_at, product_page.id), '[]'::jsonb)
  ) into v_result
  from product_page
  left join variant_rows on variant_rows.product_id = product_page.id
  left join image_rows on image_rows.product_id = product_page.id;
  return v_result;
end;
$$;

-- Authenticated entry points never accept a customer or actor identity from
-- browser input. They derive it from the verified Supabase JWT and delegate to
-- the service-only cores above.
create or replace function public.claim_my_guest_marketplace_cart(
  p_cart_id uuid,
  p_guest_token text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.claim_guest_cart(p_cart_id, p_guest_token);
$$;

create or replace function public.save_my_marketplace_address(
  p_zone_id uuid,
  p_label text,
  p_recipient_name text,
  p_recipient_phone text,
  p_address_line text,
  p_building text default null,
  p_floor text default null,
  p_apartment text default null,
  p_landmark text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_is_default boolean default false,
  p_address_id uuid default null
)
returns public.customer_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.marketplace_customers;
  v_address public.customer_addresses;
begin
  select * into v_customer from public.ensure_marketplace_customer();
  if not v_customer.is_active then
    raise exception 'customer_inactive' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.delivery_zones where id = p_zone_id and is_active
  ) then
    raise exception 'delivery_zone_unavailable' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || v_customer.id::text, 0)
  );
  if coalesce(p_is_default, false) then
    update public.customer_addresses
    set is_default = false, updated_at = now()
    where customer_id = v_customer.id and is_default;
  end if;
  if p_address_id is null then
    insert into public.customer_addresses (
      customer_id, zone_id, label, recipient_name, recipient_phone,
      address_line, building, floor, apartment, landmark, latitude, longitude,
      is_default
    ) values (
      v_customer.id, p_zone_id, p_label, p_recipient_name, p_recipient_phone,
      p_address_line, p_building, p_floor, p_apartment, p_landmark,
      p_latitude, p_longitude, coalesce(p_is_default, false)
    ) returning * into v_address;
  else
    update public.customer_addresses
    set zone_id = p_zone_id,
        label = p_label,
        recipient_name = p_recipient_name,
        recipient_phone = p_recipient_phone,
        address_line = p_address_line,
        building = p_building,
        floor = p_floor,
        apartment = p_apartment,
        landmark = p_landmark,
        latitude = p_latitude,
        longitude = p_longitude,
        is_default = coalesce(p_is_default, false),
        updated_at = now()
    where id = p_address_id and customer_id = v_customer.id
    returning * into v_address;
    if v_address is null then
      raise exception 'address_not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_address;
end;
$$;

create or replace function public.delete_my_marketplace_address(p_address_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  select id into v_customer_id
  from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  delete from public.customer_addresses
  where id = p_address_id and customer_id = v_customer_id;
  return found;
end;
$$;

create or replace function public.checkout_my_marketplace_cart(
  p_cart_id uuid,
  p_idempotency_key text,
  p_address_id uuid,
  p_delivery_modes jsonb default '{}'::jsonb,
  p_delivery_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer public.marketplace_customers;
begin
  select * into v_customer from public.ensure_marketplace_customer();
  return public.checkout_marketplace_cart(
    v_customer.id,
    p_cart_id,
    p_idempotency_key,
    p_address_id,
    p_delivery_modes,
    p_delivery_notes
  );
end;
$$;

create or replace function public.set_my_marketplace_order_status(
  p_order_id uuid,
  p_next public.marketplace_order_status,
  p_reason text default null,
  p_collected_amount public.egp_amount default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return public.set_marketplace_order_status(
    p_order_id, p_next, v_actor_id, p_reason, p_collected_amount
  );
end;
$$;

create or replace function public.get_my_marketplace_order_group(p_order_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_result jsonb;
begin
  select id into v_customer_id
  from public.marketplace_customers
  where auth_user_id = (select auth.uid()) and is_active;
  if v_customer_id is null then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'id', order_group.id,
    'public_code', order_group.public_code,
    'status', case
      when bool_and(marketplace_order.status in ('delivered', 'cancelled', 'rejected', 'returned'))
        then 'completed'
      else 'active'
    end,
    'currency', order_group.currency,
    'subtotal_piastres', order_group.subtotal,
    'merchant_discount_total_piastres', order_group.merchant_discount_total,
    'platform_discount_total_piastres', order_group.platform_discount_total,
    'discount_total_piastres', order_group.discount_total,
    'delivery_total_piastres', order_group.delivery_total,
    'grand_total_piastres', order_group.grand_total,
    'address', order_group.address_snapshot,
    'delivery_notes', order_group.delivery_notes,
    'placed_at', order_group.placed_at,
    'orders', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', marketplace_order.id,
        'public_code', marketplace_order.public_code,
        'store_id', marketplace_order.store_id,
        'store_name', marketplace_order.store_name_snapshot,
        'status', marketplace_order.status,
        'payment_method', marketplace_order.payment_method,
        'payment_status', marketplace_order.payment_status,
        'delivery_mode', marketplace_order.delivery_mode,
        'subtotal_piastres', marketplace_order.subtotal,
        'merchant_discount_total_piastres', marketplace_order.merchant_discount_total,
        'platform_discount_total_piastres', marketplace_order.platform_discount_total,
        'discount_total_piastres', marketplace_order.discount_total,
        'delivery_fee_piastres', marketplace_order.delivery_fee,
        'grand_total_piastres', marketplace_order.grand_total,
        'created_at', marketplace_order.created_at,
        'updated_at', marketplace_order.updated_at,
        'items', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', order_item.id,
              'product_id', order_item.product_id,
              'variant_id', order_item.variant_id,
              'product_name', order_item.product_name_snapshot,
              'variant_name', order_item.variant_name_snapshot,
              'sku', order_item.sku_snapshot,
              'attributes', order_item.attributes_snapshot,
              'image_url', order_item.image_url_snapshot,
              'unit_price_piastres', order_item.unit_price,
              'quantity', order_item.quantity,
              'line_total_piastres', order_item.line_total
            ) order by order_item.created_at, order_item.id
          ), '[]'::jsonb)
          from public.order_items as order_item
          where order_item.order_id = marketplace_order.id
        )
      ) order by marketplace_order.created_at, marketplace_order.id
    ), '[]'::jsonb)
  ) into v_result
  from public.order_groups as order_group
  join public.marketplace_orders as marketplace_order
    on marketplace_order.order_group_id = order_group.id
  where order_group.id = p_order_group_id
    and order_group.customer_id = v_customer_id
  group by order_group.id;
  if v_result is null then
    raise exception 'order_group_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_my_marketplace_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.marketplace_orders;
  v_authorized boolean;
  v_is_customer boolean;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_order from public.marketplace_orders where id = p_order_id;
  if v_order is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select exists (
    select 1 from public.marketplace_customers
    where id = v_order.customer_id and auth_user_id = v_actor_id and is_active
  ) into v_is_customer;
  select public.is_marketplace_admin()
    or public.can_fulfill_store(v_order.store_id)
    or exists (
      select 1 from public.marketplace_customers
      where id = v_order.customer_id and auth_user_id = v_actor_id and is_active
    )
    or exists (
      select 1 from public.marketplace_delivery_assignments
      where order_id = v_order.id and driver_id = v_actor_id
    ) into v_authorized;
  if not v_authorized then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', marketplace_order.id,
    'public_code', marketplace_order.public_code,
    'order_group_id', marketplace_order.order_group_id,
    'store_id', marketplace_order.store_id,
    'store_name', marketplace_order.store_name_snapshot,
    'status', marketplace_order.status,
    'payment_method', marketplace_order.payment_method,
    'payment_status', marketplace_order.payment_status,
    'delivery_mode', marketplace_order.delivery_mode,
    'address', marketplace_order.address_snapshot,
    'recipient', jsonb_build_object(
      'name', marketplace_order.address_snapshot ->> 'recipient_name',
      'phone', marketplace_order.address_snapshot ->> 'recipient_phone',
      'address_line', marketplace_order.address_snapshot ->> 'address_line',
      'building', marketplace_order.address_snapshot ->> 'building',
      'floor', marketplace_order.address_snapshot ->> 'floor',
      'apartment', marketplace_order.address_snapshot ->> 'apartment',
      'landmark', marketplace_order.address_snapshot ->> 'landmark',
      'latitude', marketplace_order.address_snapshot -> 'latitude',
      'longitude', marketplace_order.address_snapshot -> 'longitude'
    ),
    'delivery_notes', marketplace_order.customer_notes,
    'subtotal_piastres', marketplace_order.subtotal,
    'merchant_discount_total_piastres', marketplace_order.merchant_discount_total,
    'platform_discount_total_piastres', marketplace_order.platform_discount_total,
    'discount_total_piastres', marketplace_order.discount_total,
    'delivery_fee_piastres', marketplace_order.delivery_fee,
    'grand_total_piastres', marketplace_order.grand_total,
    'confirmed_at', marketplace_order.confirmed_at,
    'ready_at', marketplace_order.ready_at,
    'delivered_at', marketplace_order.delivered_at,
    'cancelled_at', marketplace_order.cancelled_at,
    'created_at', marketplace_order.created_at,
    'updated_at', marketplace_order.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'product_id', item.product_id,
        'variant_id', item.variant_id,
        'product_name', item.product_name_snapshot,
        'variant_name', item.variant_name_snapshot,
        'sku', item.sku_snapshot,
        'attributes', item.attributes_snapshot,
        'image_url', item.image_url_snapshot,
        'unit_price_piastres', item.unit_price,
        'quantity', item.quantity,
        'line_total_piastres', item.line_total,
        'review', case when v_is_customer then (
          select jsonb_build_object(
            'id', review.id, 'rating', review.rating, 'title', review.title,
            'body', review.body, 'status', review.status, 'updated_at', review.updated_at
          )
          from public.product_reviews as review
          where review.order_item_id = item.id and review.customer_id = v_order.customer_id
        ) else null end
      ) order by item.created_at, item.id)
      from public.order_items as item where item.order_id = marketplace_order.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'type', event.event_type,
        'from_status', event.from_status,
        'to_status', event.to_status,
        'created_at', event.created_at
      ) order by event.created_at, event.id)
      from public.marketplace_order_events as event
      where event.order_id = marketplace_order.id
    ), '[]'::jsonb),
    'delivery', (
      select jsonb_build_object(
        'status', assignment.status,
        'driver_name', assignment.driver_name_snapshot,
        'assigned_at', assignment.assigned_at,
        'picked_up_at', assignment.picked_up_at,
        'delivered_at', assignment.delivered_at,
        'proof_asset_id', assignment.proof_asset_id,
        'proof_available', assignment.proof_asset_id is not null
      )
      from public.marketplace_delivery_assignments as assignment
      where assignment.order_id = marketplace_order.id
    )
  ) into v_result
  from public.marketplace_orders as marketplace_order
  where marketplace_order.id = p_order_id;
  return v_result;
end;
$$;

create or replace function public.list_my_marketplace_orders(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'invalid_order_page_size' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id,
    'public_code', page.public_code,
    'order_group_id', page.order_group_id,
    'store_id', page.store_id,
    'store_name', page.store_name_snapshot,
    'status', page.status,
    'payment_status', page.payment_status,
    'delivery_mode', page.delivery_mode,
    'grand_total_piastres', page.grand_total,
    'created_at', page.created_at,
    'updated_at', page.updated_at
  ) order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_result
  from (
    select marketplace_order.*
    from public.marketplace_orders as marketplace_order
    where (p_before is null or marketplace_order.created_at < p_before)
      and (
        public.is_marketplace_admin()
        or public.can_fulfill_store(marketplace_order.store_id)
        or exists (
          select 1 from public.marketplace_customers as customer
          where customer.id = marketplace_order.customer_id
            and customer.auth_user_id = v_actor_id and customer.is_active
        )
        or exists (
          select 1 from public.marketplace_delivery_assignments as assignment
          where assignment.order_id = marketplace_order.id
            and assignment.driver_id = v_actor_id
        )
      )
    order by marketplace_order.created_at desc, marketplace_order.id desc
    limit p_limit
  ) as page;
  return v_result;
end;
$$;

create or replace function public.create_my_cash_reconciliation_batch(
  p_collection_ids uuid[],
  p_submitted_amounts_piastres bigint[],
  p_idempotency_key text
)
returns public.cash_reconciliation_batches
language sql
security definer
set search_path = ''
as $$
  select public.create_cash_reconciliation_batch(
    (select auth.uid()), p_collection_ids, p_submitted_amounts_piastres,
    (select auth.uid()), p_idempotency_key
  );
$$;

create or replace function public.submit_my_cash_reconciliation_batch(p_batch_id uuid)
returns public.cash_reconciliation_batches
language sql
security definer
set search_path = ''
as $$
  select public.submit_cash_reconciliation_batch(p_batch_id, (select auth.uid()));
$$;

create or replace function public.review_cash_reconciliation_batch_as_admin(
  p_batch_id uuid,
  p_accept boolean,
  p_notes text default null
)
returns public.cash_reconciliation_batches
language sql
security definer
set search_path = ''
as $$
  select public.review_cash_reconciliation_batch(
    p_batch_id, p_accept, (select auth.uid()), p_notes
  );
$$;

create or replace function public.reorder_my_marketplace_media(
  p_store_id uuid,
  p_entity_type public.marketplace_media_entity,
  p_entity_id uuid,
  p_ordered_asset_ids uuid[],
  p_expected_entity_updated_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.reorder_marketplace_media(
    p_store_id, p_entity_type, p_entity_id, p_ordered_asset_ids,
    p_expected_entity_updated_at, (select auth.uid())
  );
$$;

create or replace function public.delete_my_marketplace_media(
  p_asset_id uuid,
  p_expected_asset_updated_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.delete_marketplace_media(
    p_asset_id, p_expected_asset_updated_at, (select auth.uid())
  );
$$;

create or replace function public.submit_my_store_for_review(p_store_id uuid)
returns public.stores
language sql
security definer
set search_path = ''
as $$
  select public.submit_store_for_review(p_store_id, (select auth.uid()));
$$;

create or replace function public.submit_my_product_for_review(p_product_id uuid)
returns public.products
language sql
security definer
set search_path = ''
as $$
  select public.submit_product_for_review(p_product_id, (select auth.uid()));
$$;

create or replace function public.moderate_store_as_admin(
  p_store_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns public.stores
language sql
security definer
set search_path = ''
as $$
  select public.moderate_store(p_store_id, p_approve, p_notes, (select auth.uid()));
$$;

create or replace function public.moderate_product_as_admin(
  p_product_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns public.products
language sql
security definer
set search_path = ''
as $$
  select public.moderate_product(p_product_id, p_approve, p_notes, (select auth.uid()));
$$;

create or replace function public.assign_marketplace_delivery_driver_as_caller(
  p_order_id uuid,
  p_driver_id uuid
)
returns public.marketplace_delivery_assignments
language sql
security definer
set search_path = ''
as $$
  select public.assign_marketplace_delivery_driver(
    p_order_id, p_driver_id, (select auth.uid())
  );
$$;

create or replace function public.attach_my_marketplace_delivery_proof(
  p_order_id uuid,
  p_asset_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.attach_marketplace_delivery_proof(
    p_order_id, p_asset_id, (select auth.uid())
  );
$$;

create or replace function public.generate_my_commission_statement(
  p_store_id uuid,
  p_period_start date
)
returns public.commission_statements
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_finance_access_required' using errcode = '42501';
  end if;
  return public.generate_commission_statement(
    p_store_id, p_period_start, (select auth.uid())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Role-scoped operations DTOs
-- ---------------------------------------------------------------------------

create or replace function public.list_pending_marketplace_moderation(
  p_entity text default 'all',
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_entity not in ('all', 'product', 'store') or p_limit not between 1 and 100 then
    raise exception 'invalid_moderation_page' using errcode = '22023';
  end if;
  with pending as materialized (
    select
      'product'::text as entity_type,
      product.id,
      product.store_id,
      product.name,
      product.status::text as status,
      product.first_submitted_at as submitted_at,
      (
        select asset.public_url
        from public.product_images as image
        join public.media_assets as asset
          on asset.id = image.media_asset_id and asset.status = 'active'
        where image.product_id = product.id order by image.position limit 1
      ) as primary_image_url
    from public.products as product
    where product.status = 'pending_review'
      and p_entity in ('all', 'product')
      and (p_before is null or product.first_submitted_at < p_before)
    union all
    select
      'store'::text, store.id, store.id, store.name, store.status::text,
      store.first_submitted_at,
      (
        select asset.public_url
        from public.store_images as image
        join public.media_assets as asset
          on asset.id = image.media_asset_id and asset.status = 'active'
        where image.store_id = store.id
        order by case image.kind when 'logo' then 0 when 'cover' then 1 else 2 end,
                 image.position
        limit 1
      )
    from public.stores as store
    where store.status = 'pending_review'
      and p_entity in ('all', 'store')
      and (p_before is null or store.first_submitted_at < p_before)
  ), page as (
    select * from pending order by submitted_at desc, id limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'entity_type', page.entity_type, 'id', page.id, 'store_id', page.store_id,
      'name', page.name, 'status', page.status, 'submitted_at', page.submitted_at,
      'primary_image_url', page.primary_image_url
    ) order by page.submitted_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.submitted_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.offer_marketplace_delivery_to_driver_as_caller(
  p_order_id uuid,
  p_driver_id uuid,
  p_expires_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.marketplace_orders;
  v_assignment public.marketplace_delivery_assignments;
  v_driver_name text;
  v_offer public.marketplace_delivery_offers;
begin
  if v_actor_id is null or p_expires_minutes not between 1 and 15 then
    raise exception 'invalid_delivery_offer' using errcode = '22023';
  end if;
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if v_order is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not (public.is_marketplace_admin() or public.can_fulfill_store(v_order.store_id)) then
    raise exception 'fulfillment_access_required' using errcode = '42501';
  end if;
  if v_order.delivery_mode <> 'platform'
     or v_order.status not in ('preparing', 'ready_for_pickup') then
    raise exception 'order_not_offerable' using errcode = '55000';
  end if;
  select display_name into v_driver_name
  from public.profiles as profile
  join public.driver_profiles as driver on driver.profile_id = profile.id
  where profile.id = p_driver_id and profile.role = 'driver' and profile.is_active
    and driver.is_available and driver.active_until > now();
  if v_driver_name is null then raise exception 'driver_unavailable' using errcode = '22023'; end if;
  select * into v_assignment
  from public.marketplace_delivery_assignments where order_id = p_order_id for update;
  if v_assignment is null or v_assignment.status <> 'unassigned' then
    raise exception 'delivery_assignment_unavailable' using errcode = '55000';
  end if;
  insert into public.marketplace_delivery_offers (
    order_id, driver_id, driver_name_snapshot, expires_at, created_by
  ) values (
    p_order_id, p_driver_id, v_driver_name,
    now() + make_interval(mins => p_expires_minutes), v_actor_id
  ) on conflict (order_id, driver_id) do update
  set status = 'offered', expires_at = excluded.expires_at,
      responded_at = null, created_by = excluded.created_by, updated_at = now()
  where public.marketplace_delivery_offers.status in ('declined', 'expired', 'cancelled')
  returning * into v_offer;
  if v_offer is null then raise exception 'delivery_offer_already_open' using errcode = '55000'; end if;
  return jsonb_build_object(
    'id', v_offer.id, 'order_id', v_offer.order_id,
    'status', v_offer.status, 'expires_at', v_offer.expires_at
  );
end;
$$;

create or replace function public.list_my_marketplace_delivery_offers(
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
  if v_actor_id is null or p_limit not between 1 and 100 or not exists (
    select 1 from public.profiles
    where id = v_actor_id and role = 'driver' and is_active
  ) then
    raise exception 'driver_access_required' using errcode = '42501';
  end if;
  update public.marketplace_delivery_offers
  set status = 'expired', responded_at = now(), updated_at = now()
  where driver_id = v_actor_id and status = 'offered' and expires_at <= now();
  with page as (
    select
      offer.id, offer.order_id, marketplace_order.public_code as order_code,
      marketplace_order.store_name_snapshot as store_name,
      zone.name_ar as delivery_zone_name,
      marketplace_order.delivery_fee as delivery_fee_piastres,
      coalesce(sum(item.quantity), 0)::integer as package_count,
      marketplace_order.ready_at, offer.expires_at, offer.created_at
    from public.marketplace_delivery_offers as offer
    join public.marketplace_orders as marketplace_order on marketplace_order.id = offer.order_id
    join public.delivery_zones as zone on zone.id = marketplace_order.delivery_zone_id
    left join public.order_items as item on item.order_id = marketplace_order.id
    where offer.driver_id = v_actor_id and offer.status = 'offered' and offer.expires_at > now()
      and (p_before is null or offer.created_at < p_before)
    group by offer.id, marketplace_order.id, zone.id
    order by offer.created_at desc, offer.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'order_id', page.order_id, 'order_code', page.order_code,
      'store_name', page.store_name, 'delivery_zone_name', page.delivery_zone_name,
      'delivery_fee_piastres', page.delivery_fee_piastres,
      'package_count', page.package_count, 'ready_at', page.ready_at,
      'expires_at', page.expires_at
    ) order by page.created_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.created_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.respond_to_my_marketplace_delivery_offer(
  p_offer_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_offer public.marketplace_delivery_offers;
  v_order public.marketplace_orders;
  v_assignment public.marketplace_delivery_assignments;
begin
  if v_actor_id is null or p_accept is null then
    raise exception 'invalid_delivery_offer_response' using errcode = '22023';
  end if;
  select * into v_offer
  from public.marketplace_delivery_offers where id = p_offer_id for update;
  if v_offer is null or v_offer.driver_id is distinct from v_actor_id then
    raise exception 'delivery_offer_not_found' using errcode = 'P0002';
  end if;
  if v_offer.status = (case when p_accept then 'accepted' else 'declined' end) then
    return jsonb_build_object(
      'id', v_offer.id, 'order_id', v_offer.order_id,
      'status', v_offer.status, 'idempotent', true
    );
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at <= now() then
    if v_offer.status = 'offered' then
      update public.marketplace_delivery_offers
      set status = 'expired', responded_at = now(), updated_at = now()
      where id = v_offer.id;
    end if;
    raise exception 'delivery_offer_expired' using errcode = '55000';
  end if;
  if not p_accept then
    update public.marketplace_delivery_offers
    set status = 'declined', responded_at = now(), updated_at = now()
    where id = v_offer.id;
    return jsonb_build_object(
      'id', v_offer.id, 'order_id', v_offer.order_id,
      'status', 'declined', 'idempotent', false
    );
  end if;
  select * into v_order from public.marketplace_orders where id = v_offer.order_id for update;
  select * into v_assignment
  from public.marketplace_delivery_assignments where order_id = v_offer.order_id for update;
  if v_order is null or v_order.delivery_mode <> 'platform'
     or v_order.status not in ('preparing', 'ready_for_pickup')
     or v_assignment is null or v_assignment.status <> 'unassigned' then
    raise exception 'delivery_offer_no_longer_available' using errcode = '55000';
  end if;
  update public.marketplace_delivery_assignments
  set driver_id = v_actor_id, driver_name_snapshot = v_offer.driver_name_snapshot,
      status = 'assigned', assigned_at = now(), updated_at = now()
  where id = v_assignment.id;
  update public.marketplace_delivery_offers
  set status = case when id = v_offer.id then 'accepted' else 'cancelled' end,
      responded_at = now(), updated_at = now()
  where order_id = v_offer.order_id and status = 'offered';
  insert into public.marketplace_order_events (
    order_id, actor_user_id, event_type, metadata
  ) values (
    v_offer.order_id, v_actor_id, 'delivery.offer_accepted',
    jsonb_build_object('offer_id', v_offer.id)
  );
  insert into public.marketplace_outbox (
    event_key, topic, aggregate_type, aggregate_id, payload
  ) values (
    'marketplace.delivery.offer_accepted:' || v_offer.id::text,
    'marketplace.delivery.assigned', 'marketplace_order', v_offer.order_id::text,
    jsonb_build_object('order_id', v_offer.order_id, 'driver_id', v_actor_id)
  ) on conflict (event_key) do nothing;
  return jsonb_build_object(
    'id', v_offer.id, 'order_id', v_offer.order_id,
    'status', 'accepted', 'idempotent', false
  );
end;
$$;

create or replace function public.list_my_cod_collections(
  p_status text default null,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('pending','collected','remitted','failed','refunded')) then
    raise exception 'invalid_cod_collection_page' using errcode = '22023';
  end if;
  with page as (
    select collection.*, marketplace_order.public_code as order_code,
           marketplace_order.store_id
    from public.cod_collections as collection
    join public.marketplace_orders as marketplace_order on marketplace_order.id = collection.order_id
    where (p_status is null or collection.status::text = p_status)
      and (p_before is null or collection.created_at < p_before)
      and (
        public.is_marketplace_admin()
        or collection.collected_by = v_actor_id
        or public.can_manage_store(marketplace_order.store_id)
      )
    order by collection.created_at desc, collection.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'collection_id', page.id, 'order_id', page.order_id,
      'order_code', page.order_code,
      'amount_piastres', coalesce(page.collected_amount, page.expected_amount),
      'status', page.status, 'collected_at', page.collected_at
    ) order by page.created_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.created_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.list_my_cash_reconciliations(
  p_status text default null,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('open','submitted','accepted','rejected')) then
    raise exception 'invalid_reconciliation_page' using errcode = '22023';
  end if;
  with page as (
    select batch.*
    from public.cash_reconciliation_batches as batch
    where (p_status is null or batch.status = p_status)
      and (p_before is null or batch.created_at < p_before)
      and (public.is_marketplace_admin() or batch.driver_id = v_actor_id)
    order by batch.created_at desc, batch.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'status', page.status,
      'expected_total_piastres', page.expected_total,
      'submitted_total_piastres', page.submitted_total,
      'submitted_at', page.submitted_at, 'reviewed_at', page.reviewed_at,
      'created_at', page.created_at
    ) order by page.created_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.created_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.get_my_cash_reconciliation(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_batch public.cash_reconciliation_batches;
  v_result jsonb;
begin
  select * into v_batch from public.cash_reconciliation_batches where id = p_batch_id;
  if v_batch is null then raise exception 'reconciliation_batch_not_found' using errcode = 'P0002'; end if;
  if v_actor_id is null or not (public.is_marketplace_admin() or v_batch.driver_id = v_actor_id) then
    raise exception 'reconciliation_batch_not_found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'id', v_batch.id, 'status', v_batch.status,
    'expected_total_piastres', v_batch.expected_total,
    'submitted_total_piastres', v_batch.submitted_total,
    'submitted_at', v_batch.submitted_at,
    'accepted_at', case when v_batch.status = 'accepted' then v_batch.reviewed_at else null end,
    'reviewed_at', v_batch.reviewed_at, 'notes', v_batch.notes,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'collection_id', item.collection_id, 'order_id', collection.order_id,
      'order_code', marketplace_order.public_code,
      'expected_amount_piastres', item.expected_amount,
      'submitted_amount_piastres', item.submitted_amount,
      'collection_status', collection.status,
      'collected_at', collection.collected_at
    ) order by item.created_at, item.collection_id), '[]'::jsonb)
  ) into v_result
  from public.cash_reconciliation_items as item
  join public.cod_collections as collection on collection.id = item.collection_id
  join public.marketplace_orders as marketplace_order on marketplace_order.id = collection.order_id
  where item.batch_id = v_batch.id;
  return v_result;
end;
$$;

create or replace function public.list_my_commission_statements(
  p_store_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.can_manage_store(p_store_id) then
    raise exception 'store_finance_access_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'invalid_statement_page' using errcode = '22023';
  end if;
  with page as (
    select * from public.commission_statements
    where store_id = p_store_id
    order by period_start desc, id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'store_id', page.store_id,
      'period_start', page.period_start, 'period_end', page.period_end,
      'status', page.status, 'gross_piastres', page.gross_merchandise_value,
      'commission_piastres', page.total_due, 'generated_at', page.created_at
    ) order by page.period_start desc, page.id), '[]'::jsonb),
    'total', (select count(*) from public.commission_statements where store_id = p_store_id)
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.get_my_commission_statement(p_statement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statement public.commission_statements;
  v_result jsonb;
begin
  select * into v_statement from public.commission_statements where id = p_statement_id;
  if v_statement is null then raise exception 'statement_not_found' using errcode = 'P0002'; end if;
  if (select auth.uid()) is null or not public.can_manage_store(v_statement.store_id) then
    raise exception 'statement_not_found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'id', v_statement.id, 'store_id', v_statement.store_id,
    'period_start', v_statement.period_start, 'period_end', v_statement.period_end,
    'status', v_statement.status,
    'gross_piastres', v_statement.gross_merchandise_value,
    'commission_rate', v_statement.commission_rate,
    'commission_piastres', v_statement.commission_due,
    'manual_adjustment_piastres', v_statement.manual_adjustment,
    'total_due_piastres', v_statement.total_due,
    'issued_at', v_statement.issued_at, 'paid_at', v_statement.paid_at,
    'notes', v_statement.notes,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ledger.id, 'order_id', ledger.order_id,
        'entry_type', ledger.entry_type,
        'gross_piastres', ledger.gross_merchandise_value,
        'commission_piastres', ledger.commission_amount,
        'recognized_at', ledger.recognized_at
      ) order by ledger.recognized_at, ledger.id)
      from public.commission_ledger as ledger
      where ledger.statement_id = v_statement.id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.list_all_commission_statements_as_admin(
  p_status text default null,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('draft','issued','paid','disputed','void')) then
    raise exception 'invalid_statement_page' using errcode = '22023';
  end if;
  with page as (
    select statement.*, store.name as store_name
    from public.commission_statements as statement
    join public.stores as store on store.id = statement.store_id
    where (p_status is null or statement.status::text = p_status)
      and (p_before is null or statement.created_at < p_before)
    order by statement.created_at desc, statement.id
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'store_id', page.store_id, 'store_name', page.store_name,
      'period_start', page.period_start, 'period_end', page.period_end,
      'status', page.status, 'gross_piastres', page.gross_merchandise_value,
      'commission_piastres', page.commission_due,
      'manual_adjustment_piastres', page.manual_adjustment,
      'total_due_piastres', page.total_due, 'issued_at', page.issued_at,
      'paid_at', page.paid_at, 'notes', page.notes,
      'created_at', page.created_at, 'updated_at', page.updated_at
    ) order by page.created_at desc, page.id), '[]'::jsonb),
    'next_before', case when count(*) = p_limit then min(page.created_at) else null end
  ) into v_result from page;
  return v_result;
end;
$$;

create or replace function public.transition_commission_statement_as_admin(
  p_statement_id uuid,
  p_next public.marketplace_statement_status,
  p_idempotency_key text,
  p_notes text default null,
  p_manual_adjustment_piastres bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_statement public.commission_statements;
  v_before public.commission_statements;
  v_existing public.commission_statement_mutations;
  v_hash text;
  v_response jsonb;
begin
  if v_actor_id is null or not public.is_marketplace_admin() then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_statement_id is null or p_next is null
     or char_length(trim(coalesce(p_idempotency_key, ''))) not between 16 and 128
     or (p_notes is not null and char_length(trim(p_notes)) > 2000)
     or (p_next in ('disputed', 'void') and char_length(trim(coalesce(p_notes, ''))) < 3) then
    raise exception 'invalid_statement_transition' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    p_statement_id::text || '|' || p_next::text || '|' || coalesce(trim(p_notes), '') || '|' ||
    coalesce(p_manual_adjustment_piastres::text, ''), 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commission-transition:' || v_actor_id::text || ':' || trim(p_idempotency_key), 0)
  );
  select * into v_existing from public.commission_statement_mutations
  where actor_user_id = v_actor_id and idempotency_key = trim(p_idempotency_key);
  if v_existing is not null then
    if v_existing.statement_id <> p_statement_id or v_existing.request_hash <> v_hash then
      raise exception 'statement_idempotency_conflict' using errcode = '23505';
    end if;
    return v_existing.response || jsonb_build_object('idempotent', true);
  end if;
  select * into v_statement from public.commission_statements where id = p_statement_id for update;
  if v_statement is null then raise exception 'statement_not_found' using errcode = 'P0002'; end if;
  v_before := v_statement;
  if not (
    (v_statement.status = 'draft' and p_next in ('issued', 'void'))
    or (v_statement.status = 'issued' and p_next in ('paid', 'disputed', 'void'))
    or (v_statement.status = 'disputed' and p_next in ('issued', 'void'))
  ) then
    raise exception 'invalid_statement_transition' using errcode = '55000';
  end if;
  if p_manual_adjustment_piastres is not null and v_statement.status <> 'draft' then
    raise exception 'statement_adjustment_locked' using errcode = '55000';
  end if;
  if v_statement.commission_due + coalesce(p_manual_adjustment_piastres, v_statement.manual_adjustment) < 0 then
    raise exception 'statement_total_due_negative' using errcode = '22023';
  end if;
  update public.commission_statements
  set status = p_next,
      manual_adjustment = case when p_manual_adjustment_piastres is null then manual_adjustment else p_manual_adjustment_piastres end,
      notes = case when p_notes is null then notes else trim(p_notes) end,
      issued_at = case when p_next = 'issued' then coalesce(issued_at, now()) else issued_at end,
      paid_at = case when p_next = 'paid' then now() else null end,
      updated_at = now()
  where id = v_statement.id returning * into v_statement;
  v_response := jsonb_build_object(
    'id', v_statement.id, 'store_id', v_statement.store_id,
    'status', v_statement.status, 'gross_piastres', v_statement.gross_merchandise_value,
    'commission_piastres', v_statement.commission_due,
    'manual_adjustment_piastres', v_statement.manual_adjustment,
    'total_due_piastres', v_statement.total_due, 'issued_at', v_statement.issued_at,
    'paid_at', v_statement.paid_at, 'notes', v_statement.notes, 'updated_at', v_statement.updated_at
  );
  insert into public.commission_statement_mutations (
    actor_user_id, statement_id, idempotency_key, request_hash, response
  ) values (v_actor_id, v_statement.id, trim(p_idempotency_key), v_hash, v_response);
  insert into public.marketplace_audit_log (
    actor_user_id, request_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    v_actor_id, trim(p_idempotency_key), 'commission.statement_transitioned',
    'commission_statement', v_statement.id::text, to_jsonb(v_before), to_jsonb(v_statement)
  );
  return v_response || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.can_access_marketplace_support_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_threads as thread
    where thread.id = p_thread_id
      and (
        public.is_marketplace_admin()
        or (thread.store_id is not null and public.can_manage_store(thread.store_id))
        or exists (
          select 1 from public.marketplace_customers as customer
          where customer.id = thread.customer_id
            and customer.auth_user_id = (select auth.uid()) and customer.is_active
        )
      )
  );
$$;

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
  v_actor_id uuid := (select auth.uid());
  v_customer_id uuid;
  v_order public.marketplace_orders;
  v_store_id uuid := p_store_id;
  v_sender_kind text;
  v_thread public.support_threads;
begin
  if v_actor_id is null
     or char_length(trim(coalesce(p_subject, ''))) not between 3 and 160
     or char_length(trim(coalesce(p_message, ''))) not between 1 and 5000 then
    raise exception 'invalid_support_thread' using errcode = '22023';
  end if;
  select id into v_customer_id from public.marketplace_customers
  where auth_user_id = v_actor_id and is_active;
  if p_order_id is not null then
    select * into v_order from public.marketplace_orders where id = p_order_id;
    if v_order is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
    v_store_id := v_order.store_id;
    if v_customer_id = v_order.customer_id then
      v_sender_kind := 'customer';
    elsif public.is_marketplace_admin() then
      v_sender_kind := 'admin';
    elsif public.can_manage_store(v_order.store_id) then
      v_sender_kind := 'merchant';
      v_customer_id := v_order.customer_id;
    else
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
  elsif v_store_id is not null and public.can_manage_store(v_store_id) then
    v_sender_kind := case when public.is_marketplace_admin() then 'admin' else 'merchant' end;
  elsif v_store_id is not null and v_customer_id is not null
        and exists (select 1 from public.stores where id = v_store_id and status = 'published') then
    v_sender_kind := 'customer';
  else
    raise exception 'support_participant_required' using errcode = '42501';
  end if;
  insert into public.support_threads (
    customer_id, store_id, order_id, subject
  ) values (
    v_customer_id, v_store_id, p_order_id, trim(p_subject)
  ) returning * into v_thread;
  insert into public.support_messages (thread_id, sender_user_id, sender_kind, body)
  values (v_thread.id, v_actor_id, v_sender_kind, trim(p_message));
  insert into public.support_thread_reads (thread_id, user_id, last_read_at)
  values (v_thread.id, v_actor_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object(
    'id', v_thread.id, 'public_code', v_thread.public_code,
    'subject', v_thread.subject, 'status', v_thread.status,
    'order_id', v_thread.order_id, 'last_message_at', v_thread.last_message_at
  );
end;
$$;

create or replace function public.list_my_marketplace_support_threads(
  p_status text default null,
  p_limit integer default 30,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_actor_id is null or p_limit not between 1 and 100
     or (p_status is not null and p_status not in ('open','waiting_customer','waiting_support','resolved','closed')) then
    raise exception 'invalid_support_page' using errcode = '22023';
  end if;
  with page as (
    select thread.*,
      (
        select count(*)::integer from public.support_messages as message
        where message.thread_id = thread.id
          and message.sender_user_id is distinct from v_actor_id
          and message.created_at > coalesce((
            select reads.last_read_at from public.support_thread_reads as reads
            where reads.thread_id = thread.id and reads.user_id = v_actor_id
          ), '-infinity'::timestamptz)
      ) as unread_count
    from public.support_threads as thread
    where public.can_access_marketplace_support_thread(thread.id)
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

create or replace function public.get_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
  v_result jsonb;
begin
  if v_actor_id is null or not public.can_access_marketplace_support_thread(p_thread_id) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  select * into v_thread from public.support_threads where id = p_thread_id;
  select jsonb_build_object(
    'id', v_thread.id, 'public_code', v_thread.public_code,
    'subject', v_thread.subject, 'status', v_thread.status,
    'order_id', v_thread.order_id, 'store_id', v_thread.store_id,
    'last_message_at', v_thread.last_message_at,
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'id', message.id, 'author_role', message.sender_kind,
      'body', message.body, 'created_at', message.created_at
    ) order by message.created_at, message.id), '[]'::jsonb)
  ) into v_result
  from public.support_messages as message where message.thread_id = v_thread.id;
  insert into public.support_thread_reads (thread_id, user_id, last_read_at)
  values (v_thread.id, v_actor_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return v_result;
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
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
  v_sender_kind text;
  v_message public.support_messages;
begin
  if v_actor_id is null or char_length(trim(coalesce(p_body, ''))) not between 1 and 5000
     or not public.can_access_marketplace_support_thread(p_thread_id) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if v_thread.status = 'closed' then raise exception 'support_thread_closed' using errcode = '55000'; end if;
  if public.is_marketplace_admin() then
    v_sender_kind := 'admin';
  elsif exists (
    select 1 from public.marketplace_customers
    where id = v_thread.customer_id and auth_user_id = v_actor_id and is_active
  ) then
    v_sender_kind := 'customer';
  else
    v_sender_kind := 'merchant';
  end if;
  insert into public.support_messages (thread_id, sender_user_id, sender_kind, body)
  values (v_thread.id, v_actor_id, v_sender_kind, trim(p_body))
  returning * into v_message;
  update public.support_threads
  set status = case when v_sender_kind = 'customer' then 'waiting_support'
                    else 'waiting_customer' end,
      last_message_at = v_message.created_at, resolved_at = null, updated_at = now()
  where id = v_thread.id;
  insert into public.support_thread_reads (thread_id, user_id, last_read_at)
  values (v_thread.id, v_actor_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object(
    'id', v_message.id, 'author_role', v_message.sender_kind,
    'body', v_message.body, 'created_at', v_message.created_at
  );
end;
$$;

create or replace function public.close_my_marketplace_support_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_thread public.support_threads;
begin
  if v_actor_id is null or not public.can_access_marketplace_support_thread(p_thread_id) then
    raise exception 'support_thread_not_found' using errcode = 'P0002';
  end if;
  update public.support_threads
  set status = 'closed', resolved_at = coalesce(resolved_at, now()), updated_at = now()
  where id = p_thread_id returning * into v_thread;
  return jsonb_build_object(
    'id', v_thread.id, 'status', v_thread.status,
    'resolved_at', v_thread.resolved_at, 'idempotent', v_thread.status = 'closed'
  );
end;
$$;

create or replace function public.list_marketplace_catalog(
  p_query text default null,
  p_category_slug text default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  if p_sort is null
     or p_page is null
     or p_page_size is null
     or p_sort not in ('newest', 'price_asc', 'price_desc', 'rating_desc', 'relevance')
     or p_page not between 1 and 1000
     or p_page_size not between 1 and 48
     or char_length(coalesce(v_query, '')) > 100
     or char_length(coalesce(p_category_slug, '')) > 80
     or (p_category_slug is not null and p_category_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
    raise exception 'invalid_catalog_parameters' using errcode = '22023';
  end if;

  with query_base as materialized (
    select
      product.id,
      product.store_id,
      product.category_id,
      product.slug,
      product.name,
      product.short_description,
      product.brand,
      product.is_featured,
      product.created_at,
      store.slug as store_slug,
      store.name as store_name,
      category.slug as category_slug,
      category.name_ar as category_name_ar,
      category.name_en as category_name_en,
      case when p_sort in ('price_asc', 'price_desc') then (
        select min(variant.price)
        from public.product_variants as variant
        where variant.product_id = product.id and variant.is_active
      ) end as sort_min_price,
      case when aggregate.review_count > 0 then aggregate.rating_average else null end as rating_average,
      case when aggregate.review_count > 0 then aggregate.review_count else null end as review_count,
      case when v_query is null then 0::real else ts_rank(
        to_tsvector(
          'simple',
          coalesce(product.name, '') || ' ' || coalesce(product.brand, '') || ' ' ||
          coalesce(product.description, '')
        ),
        websearch_to_tsquery('simple', v_query)
      ) end as relevance
    from public.products as product
    join public.stores as store
      on store.id = product.store_id and store.status = 'published'
    left join public.product_categories as category
      on category.id = product.category_id and category.is_active
    left join public.product_rating_aggregates as aggregate on aggregate.product_id = product.id
    where product.status = 'active'
      and exists (
        select 1
        from public.product_variants as variant
        join public.inventory_stock as inventory on inventory.variant_id = variant.id
        where variant.product_id = product.id and variant.is_active
      )
      and (
        v_query is null
        or to_tsvector(
          'simple',
          coalesce(product.name, '') || ' ' || coalesce(product.brand, '') || ' ' ||
          coalesce(product.description, '')
        ) @@ websearch_to_tsquery('simple', v_query)
      )
  ), filtered as materialized (
    select * from query_base
    where p_category_slug is null or category_slug = p_category_slug
  ), page_base as materialized (
    select * from filtered
    order by
      case when p_sort = 'price_asc' then sort_min_price end asc nulls last,
      case when p_sort = 'price_desc' then sort_min_price end desc nulls last,
      case when p_sort = 'rating_desc' then rating_average end desc nulls last,
      case when p_sort = 'relevance' and v_query is not null then relevance end desc nulls last,
      case when p_sort = 'newest' then created_at end desc nulls last,
      is_featured desc,
      created_at desc,
      id
    limit p_page_size
    offset ((p_page - 1) * p_page_size)
  ), page_rows as (
    select
      page_base.*,
      chosen.id as default_variant_id,
      chosen.title as default_variant_title,
      chosen.price as default_price,
      chosen.compare_at_price,
      prices.min_price,
      prices.available,
      prices.max_quantity,
      image.public_url as primary_image_url
    from page_base
    join lateral (
      select variant.id, variant.title, variant.price, variant.compare_at_price
      from public.product_variants as variant
      join public.inventory_stock as inventory on inventory.variant_id = variant.id
      where variant.product_id = page_base.id and variant.is_active
      order by
        (not inventory.track_inventory or inventory.on_hand > inventory.reserved) desc,
        variant.is_default desc,
        variant.price,
        variant.id
      limit 1
    ) as chosen on true
    join lateral (
      select
        min(variant.price)::bigint as min_price,
        coalesce(bool_or(not inventory.track_inventory or inventory.on_hand > inventory.reserved), false) as available,
        coalesce(max(case when inventory.track_inventory
          then greatest(0, least(99, inventory.on_hand - inventory.reserved))
          else 99 end), 0)::integer as max_quantity
      from public.product_variants as variant
      join public.inventory_stock as inventory on inventory.variant_id = variant.id
      where variant.product_id = page_base.id and variant.is_active
    ) as prices on true
    left join lateral (
      select asset.public_url
      from public.product_images as product_image
      join public.media_assets as asset
        on asset.id = product_image.media_asset_id and asset.status = 'active'
      where product_image.product_id = page_base.id
      order by product_image.position
      limit 1
    ) as image on true
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', row.id,
        'slug', row.slug,
        'name', row.name,
        'short_description', row.short_description,
        'brand', row.brand,
        'store', jsonb_build_object(
          'id', row.store_id, 'slug', row.store_slug, 'name', row.store_name
        ),
        'category', case when row.category_id is null then null else jsonb_build_object(
          'id', row.category_id,
          'slug', row.category_slug,
          'name_ar', row.category_name_ar,
          'name_en', row.category_name_en
        ) end,
        'default_variant', jsonb_build_object(
          'id', row.default_variant_id,
          'title', row.default_variant_title,
          'price', row.default_price,
          'compare_at_price', row.compare_at_price
        ),
        'min_price', row.min_price,
        'available', row.available,
        'max_quantity', row.max_quantity,
        'primary_image_url', row.primary_image_url,
        'rating', case when row.review_count is null then null else jsonb_build_object(
          'average', row.rating_average, 'count', row.review_count
        ) end
      ) order by
        case when p_sort = 'price_asc' then row.min_price end asc nulls last,
        case when p_sort = 'price_desc' then row.min_price end desc nulls last,
        case when p_sort = 'rating_desc' then row.rating_average end desc nulls last,
        case when p_sort = 'relevance' and v_query is not null then row.relevance end desc nulls last,
        case when p_sort = 'newest' then row.created_at end desc nulls last,
        row.is_featured desc, row.created_at desc, row.id
      ) from page_rows as row
    ), '[]'::jsonb),
    'page', p_page,
    'page_size', p_page_size,
    'total', (select count(*) from filtered),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', category_rows.category_slug,
        'name_ar', category_rows.category_name_ar,
        'name_en', category_rows.category_name_en,
        'count', category_rows.product_count
      ) order by category_rows.category_name_ar)
      from (
        select
          category_slug,
          max(category_name_ar) as category_name_ar,
          max(category_name_en) as category_name_en,
          count(*) as product_count
        from query_base
        where category_slug is not null
        group by category_slug
      ) as category_rows
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_marketplace_product(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', product.id,
    'slug', product.slug,
    'name', product.name,
    'description', product.description,
    'brand', product.brand,
    'store', jsonb_build_object(
      'id', store.id, 'slug', store.slug, 'name', store.name,
      'short_description', store.short_description
    ),
    'category', case when category.id is null then null else jsonb_build_object(
      'id', category.id,
      'slug', category.slug,
      'name_ar', category.name_ar,
      'name_en', category.name_en
    ) end,
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', asset.id,
        'url', asset.public_url,
        'width', asset.width,
        'height', asset.height,
        'alt_text', product_image.alt_text,
        'position', product_image.position
      ) order by product_image.position)
      from public.product_images as product_image
      join public.media_assets as asset
        on asset.id = product_image.media_asset_id and asset.status = 'active'
      where product_image.product_id = product.id
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', variant.id,
        'title', variant.title,
        'sku', variant.sku,
        'attributes', variant.attributes,
        'price', variant.price,
        'compare_at_price', variant.compare_at_price,
        'is_default', variant.is_default,
        'available', not inventory.track_inventory or inventory.on_hand > inventory.reserved,
        'max_quantity', case when inventory.track_inventory
          then greatest(0, least(99, inventory.on_hand - inventory.reserved))
          else 99
        end
      ) order by variant.is_default desc, variant.price, variant.id)
      from public.product_variants as variant
      join public.inventory_stock as inventory on inventory.variant_id = variant.id
      where variant.product_id = product.id and variant.is_active
    ), '[]'::jsonb),
    'rating', case when aggregate.review_count > 0 then jsonb_build_object(
      'average', aggregate.rating_average,
      'count', aggregate.review_count,
      'distribution', jsonb_build_object(
        '1', aggregate.rating_1_count,
        '2', aggregate.rating_2_count,
        '3', aggregate.rating_3_count,
        '4', aggregate.rating_4_count,
        '5', aggregate.rating_5_count
      )
    ) else null end
  )
  from public.products as product
  join public.stores as store
    on store.id = product.store_id and store.status = 'published'
  left join public.product_categories as category on category.id = product.category_id
  left join public.product_rating_aggregates as aggregate on aggregate.product_id = product.id
  where product.id = p_product_id and product.status = 'active';
$$;

create or replace function public.claim_marketplace_outbox(
  p_topics text[],
  p_limit integer,
  p_worker_id uuid
)
returns table (
  id bigint,
  topic text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null
     or p_limit is null
     or p_limit not between 1 and 100
     or p_topics is null
     or cardinality(p_topics) not between 1 and 16
     or not p_topics <@ array[
       'media.staging_delete_requested',
       'catalog.import_file_delete_requested',
       'media.delete_requested',
       'media.finalized',
       'media.reordered',
       'marketplace.order.placed',
       'marketplace.order_group.placed',
       'marketplace.order.status_changed',
       'marketplace.delivery.assigned'
     ]::text[] then
    raise exception 'invalid_outbox_claim' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.marketplace_outbox as outbox
    where outbox.topic = any(p_topics)
      and outbox.processed_at is null
      and outbox.dead_lettered_at is null
      and outbox.available_at <= now()
      and outbox.locked_at is null
      and outbox.attempts < 10
    order by outbox.available_at, outbox.id
    for update skip locked
    limit p_limit
  )
  update public.marketplace_outbox as outbox
  set locked_at = now(),
      worker_id = p_worker_id,
      attempts = outbox.attempts + 1
  from candidates
  where outbox.id = candidates.id
  returning outbox.id, outbox.topic, outbox.payload, outbox.attempts;
end;
$$;

create or replace function public.complete_marketplace_outbox(
  p_id bigint,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_outbox
  set processed_at = now(), locked_at = null, worker_id = null, last_error = null
  where id = p_id
    and worker_id = p_worker_id
    and locked_at is not null
    and processed_at is null
    and dead_lettered_at is null;
  return found;
end;
$$;

create or replace function public.fail_marketplace_outbox(
  p_id bigint,
  p_worker_id uuid,
  p_error text,
  p_retry_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox public.marketplace_outbox;
begin
  select * into v_outbox
  from public.marketplace_outbox
  where id = p_id and worker_id = p_worker_id and locked_at is not null
  for update;
  if v_outbox is null then
    raise exception 'outbox_claim_not_found' using errcode = 'P0002';
  end if;
  update public.marketplace_outbox
  set locked_at = null,
      worker_id = null,
      last_error = left(coalesce(p_error, 'worker_failed'), 2000),
      available_at = greatest(coalesce(p_retry_at, now() + interval '1 minute'), now()),
      dead_lettered_at = case when attempts >= 10 then now() else null end
  where id = p_id
  returning * into v_outbox;
  return jsonb_build_object(
    'id', v_outbox.id,
    'attempts', v_outbox.attempts,
    'dead_lettered', v_outbox.dead_lettered_at is not null,
    'retry_at', case when v_outbox.dead_lettered_at is null then v_outbox.available_at else null end
  );
end;
$$;

create or replace function public.anonymize_marketplace_customer_on_auth_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_customer_id uuid;
begin
  update public.marketplace_customers
  set auth_user_id = null,
      email = null,
      email_verified_at = null,
      display_name = 'Deleted customer',
      avatar_url = null,
      phone = null,
      phone_verified_at = null,
      is_active = false,
      anonymized_at = now(),
      updated_at = now()
  where auth_user_id = old.id
  returning id into v_customer_id;

  if v_customer_id is not null then
    delete from public.customer_addresses where customer_id = v_customer_id;
    update public.carts
    set status = 'abandoned', updated_at = now()
    where customer_id = v_customer_id and status = 'active';
  end if;
  return old;
end;
$$;

create trigger auth_users_anonymize_marketplace_customer
before delete on auth.users
for each row execute function public.anonymize_marketplace_customer_on_auth_delete();

create or replace function public.run_marketplace_maintenance(
  p_batch_size integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uploads integer := 0;
  v_carts integer := 0;
  v_checkouts integer := 0;
  v_orders integer := 0;
  v_redacted_orders integer := 0;
  v_redacted_groups integer := 0;
  v_purged_import_jobs integer := 0;
  v_deleted_import_files integer := 0;
  v_redacted_support_threads integer := 0;
  v_outbox integer := 0;
  v_statements integer := 0;
  v_expired_upload_keys jsonb := '[]'::jsonb;
  v_order record;
  v_store record;
  v_previous_month date := (
    date_trunc('month', (now() at time zone 'Africa/Cairo')::date) - interval '1 month'
  )::date;
begin
  if p_batch_size not between 1 and 2000 then
    raise exception 'invalid_batch_size' using errcode = '22023';
  end if;

  with expired as (
    select id
    from public.upload_sessions
    where status in ('staging', 'processing')
      and expires_at <= now()
    order by expires_at
    for update skip locked
    limit p_batch_size
  ), marked as (
    update public.upload_sessions as session
    set status = 'expired',
        failure_code = coalesce(session.failure_code, 'upload_session_expired'),
        updated_at = now()
    from expired
    where session.id = expired.id
    returning session.id, session.staging_key
  ), queued as (
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    )
    select
      'media.staging_delete_requested:' || marked.id::text,
      'media.staging_delete_requested',
      'upload_session',
      marked.id::text,
      jsonb_build_object('staging_key', marked.staging_key)
    from marked
    on conflict (event_key) do nothing
    returning id
  )
  select count(*)::integer, coalesce(jsonb_agg(marked.staging_key), '[]'::jsonb)
  into v_uploads, v_expired_upload_keys
  from marked;

  with expired as (
    select id
    from public.carts
    where status = 'active' and expires_at <= now()
    order by expires_at
    for update skip locked
    limit p_batch_size
  )
  update public.carts as cart
  set status = 'abandoned', updated_at = now()
  from expired
  where cart.id = expired.id;
  get diagnostics v_carts = row_count;

  with stale as (
    select id
    from public.checkout_requests
    where status = 'processing' and created_at <= now() - interval '15 minutes'
    order by created_at
    for update skip locked
    limit p_batch_size
  )
  update public.checkout_requests as request
  set status = 'failed',
      failure_code = 'checkout_processing_timeout',
      completed_at = now()
  from stale
  where request.id = stale.id;
  get diagnostics v_checkouts = row_count;

  for v_order in
    select marketplace_order.id
    from public.marketplace_orders as marketplace_order
    where marketplace_order.status = 'pending_confirmation'
      and exists (
        select 1
        from public.inventory_reservations as reservation
        where reservation.order_id = marketplace_order.id
          and reservation.status = 'reserved'
          and reservation.expires_at <= now()
      )
    order by marketplace_order.created_at
    for update of marketplace_order skip locked
    limit p_batch_size
  loop
    perform public.set_marketplace_order_status(
      v_order.id,
      'cancelled',
      null,
      'inventory_reservation_expired',
      null
    );
    v_orders := v_orders + 1;
  end loop;

  update public.marketplace_outbox
  set locked_at = null,
      worker_id = null,
      available_at = now() + interval '1 minute',
      last_error = coalesce(last_error, 'stale_worker_lock_released'),
      dead_lettered_at = case when attempts >= 10 then now() else dead_lettered_at end
  where id in (
    select id
    from public.marketplace_outbox
    where processed_at is null
      and locked_at <= now() - interval '10 minutes'
    order by locked_at
    for update skip locked
    limit p_batch_size
  );
  get diagnostics v_outbox = row_count;

  -- Fulfilment history remains durable, but delivery PII is removed 180 days
  -- after a terminal outcome. No public policy exposes these snapshots before
  -- or after redaction.
  with candidates as (
    select marketplace_order.id
    from public.marketplace_orders as marketplace_order
    where marketplace_order.pii_redacted_at is null
      and marketplace_order.status in ('delivered', 'cancelled', 'rejected', 'returned')
      and coalesce(
        marketplace_order.delivered_at,
        marketplace_order.cancelled_at,
        marketplace_order.updated_at
      ) <= now() - interval '180 days'
    order by marketplace_order.updated_at
    for update skip locked
    limit p_batch_size
  ), redacted as (
    update public.marketplace_orders as marketplace_order
    set address_snapshot = jsonb_build_object(
          'redacted', true,
          'redacted_at', now()
        ),
        customer_notes = null,
        cancellation_reason = null,
        pii_redacted_at = now(),
        updated_at = now()
    from candidates
    where marketplace_order.id = candidates.id
    returning marketplace_order.id
  )
  select count(*)::integer into v_redacted_orders from redacted;

  with candidates as (
    select order_group.id
    from public.order_groups as order_group
    where order_group.pii_redacted_at is null
      and order_group.placed_at <= now() - interval '180 days'
      and not exists (
        select 1
        from public.marketplace_orders as marketplace_order
        where marketplace_order.order_group_id = order_group.id
          and marketplace_order.status not in ('delivered', 'cancelled', 'rejected', 'returned')
      )
    order by order_group.placed_at
    for update skip locked
    limit p_batch_size
  ), redacted as (
    update public.order_groups as order_group
    set address_snapshot = jsonb_build_object(
          'redacted', true,
          'redacted_at', now()
        ),
        pii_redacted_at = now()
    from candidates
    where order_group.id = candidates.id
    returning order_group.id
  )
  select count(*)::integer into v_redacted_groups from redacted;

  -- Raw Excel rows and private source objects have short, explicit retention.
  with candidates as (
    select import_job.id
    from public.catalog_import_jobs as import_job
    where import_job.retention_purged_at is null
      and import_job.status in ('completed', 'failed', 'cancelled')
      and import_job.completed_at <= now() - interval '30 days'
    order by import_job.completed_at
    for update skip locked
    limit p_batch_size
  ), deleted_rows as (
    delete from public.catalog_import_rows as import_row
    using candidates
    where import_row.job_id = candidates.id
    returning import_row.id
  ), marked_jobs as (
    update public.catalog_import_jobs as import_job
    set error_summary = '[]'::jsonb,
        result = jsonb_build_object('retention_purged', true),
        retention_purged_at = now(),
        updated_at = now()
    from candidates
    where import_job.id = candidates.id
    returning import_job.id
  )
  select count(*)::integer into v_purged_import_jobs from marked_jobs;

  with candidates as (
    select import_file.id
    from public.catalog_import_files as import_file
    where import_file.status = 'active'
      and exists (
        select 1 from public.catalog_import_jobs as import_job
        where import_job.file_id = import_file.id
      )
      and not exists (
        select 1 from public.catalog_import_jobs as import_job
        where import_job.file_id = import_file.id
          and import_job.retention_purged_at is null
      )
    order by import_file.created_at
    for update skip locked
    limit p_batch_size
  ), marked_files as (
    update public.catalog_import_files as import_file
    set status = 'deleted', deleted_at = now(), updated_at = now()
    from candidates
    where import_file.id = candidates.id
    returning import_file.id, import_file.bucket, import_file.object_key
  ), queued as (
    insert into public.marketplace_outbox (
      event_key, topic, aggregate_type, aggregate_id, payload
    )
    select
      'catalog.import_file_delete_requested:' || marked_file.id::text,
      'catalog.import_file_delete_requested',
      'catalog_import_file',
      marked_file.id::text,
      jsonb_build_object(
        'bucket', marked_file.bucket,
        'object_key', marked_file.object_key
      )
    from marked_files as marked_file
    on conflict (event_key) do nothing
    returning id
  )
  select count(*)::integer into v_deleted_import_files from marked_files;

  with candidates as (
    select support_thread.id
    from public.support_threads as support_thread
    where support_thread.retention_redacted_at is null
      and support_thread.status in ('resolved', 'closed')
      and support_thread.resolved_at <= now() - interval '365 days'
    order by support_thread.resolved_at
    for update skip locked
    limit p_batch_size
  ), redacted_messages as (
    update public.support_messages as support_message
    set body = '[redacted]'
    from candidates
    where support_message.thread_id = candidates.id
    returning support_message.id
  ), redacted_threads as (
    update public.support_threads as support_thread
    set subject = '[redacted]',
        retention_redacted_at = now(),
        updated_at = now()
    from candidates
    where support_thread.id = candidates.id
    returning support_thread.id
  )
  select count(*)::integer into v_redacted_support_threads from redacted_threads;

  for v_store in
    select distinct ledger.store_id as id
    from public.commission_ledger as ledger
    where ledger.recognized_at >= (
        v_previous_month::timestamp at time zone 'Africa/Cairo'
      )
      and ledger.recognized_at < (
        (v_previous_month + interval '1 month')::timestamp at time zone 'Africa/Cairo'
      )
      and not exists (
        select 1 from public.commission_statements as statement
        where statement.store_id = ledger.store_id
          and statement.period_start = v_previous_month
      )
    order by ledger.store_id
    limit p_batch_size
  loop
    perform public.generate_commission_statement(v_store.id, v_previous_month, null);
    v_statements := v_statements + 1;
  end loop;

  return jsonb_build_object(
    'expired_upload_sessions', v_uploads,
    'expired_upload_keys', v_expired_upload_keys,
    'abandoned_carts', v_carts,
    'timed_out_checkouts', v_checkouts,
    'cancelled_expired_orders', v_orders,
    'redacted_orders', v_redacted_orders,
    'redacted_order_groups', v_redacted_groups,
    'purged_import_jobs', v_purged_import_jobs,
    'deleted_import_files', v_deleted_import_files,
    'redacted_support_threads', v_redacted_support_threads,
    'released_outbox_locks', v_outbox,
    'created_commission_statements', v_statements
  );
end;
$$;

-- Database-only lifecycle work runs inside hosted Supabase every five minutes;
-- DigitalOcean object deletion remains in the separately authenticated Vercel
-- worker. Scheduling by stable name is idempotent on Supabase Cron.
select cron.schedule(
  'dairtak-marketplace-db-maintenance',
  '*/5 * * * *',
  'select public.run_marketplace_maintenance(100);'
);

-- ---------------------------------------------------------------------------
-- Row-level security and least-privilege API surface
-- ---------------------------------------------------------------------------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'marketplace_customers', 'merchant_memberships', 'stores', 'store_memberships',
    'product_categories', 'products', 'product_variants', 'inventory_stock',
    'delivery_zones', 'store_delivery_zones', 'customer_addresses', 'carts',
    'cart_items', 'cart_coupon_selections', 'checkout_requests', 'order_groups',
    'marketplace_orders', 'order_items', 'marketplace_order_events',
    'inventory_reservations', 'marketplace_coupons', 'marketplace_coupon_products',
    'marketplace_coupon_categories', 'coupon_redemptions', 'product_reviews',
    'product_rating_aggregates', 'upload_sessions', 'media_assets', 'product_images',
    'store_images', 'marketplace_delivery_assignments', 'cod_collections',
    'marketplace_delivery_offers',
    'cash_reconciliation_batches', 'cash_reconciliation_items', 'cash_ledger_entries',
    'commission_ledger', 'commission_statements', 'commission_statement_mutations', 'app_notifications',
    'support_threads', 'support_messages', 'support_thread_reads', 'catalog_import_files',
    'catalog_import_jobs', 'catalog_import_rows', 'marketplace_audit_log',
    'marketplace_outbox', 'marketplace_runtime_settings',
    'marketplace_catalog_mutations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on sequence public.marketplace_order_events_id_seq from public, anon, authenticated;
revoke all on sequence public.catalog_import_rows_id_seq from public, anon, authenticated;
revoke all on sequence public.marketplace_audit_log_id_seq from public, anon, authenticated;
revoke all on sequence public.marketplace_outbox_id_seq from public, anon, authenticated;
grant all on sequence public.marketplace_order_events_id_seq to service_role;
grant all on sequence public.catalog_import_rows_id_seq to service_role;
grant all on sequence public.marketplace_audit_log_id_seq to service_role;
grant all on sequence public.marketplace_outbox_id_seq to service_role;

create policy marketplace_customers_read_own
on public.marketplace_customers for select to authenticated
using (auth_user_id = (select auth.uid()) or public.is_marketplace_admin());

create policy merchant_memberships_read_authorized
on public.merchant_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_merchant(merchant_id)
);

create policy stores_read_staff
on public.stores for select to authenticated
using (
  public.can_manage_store(id)
  or public.can_catalog_store(id)
  or public.can_fulfill_store(id)
);

create policy store_memberships_read_authorized
on public.store_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_store(store_id)
);

create policy product_categories_read_active
on public.product_categories for select to anon
using (is_active);
create policy product_categories_read_active_or_admin
on public.product_categories for select to authenticated
using (is_active or public.is_marketplace_admin());

create policy products_read_staff
on public.products for select to authenticated
using (
  public.can_catalog_store(store_id)
  or public.can_fulfill_store(store_id)
);

create policy product_variants_read_staff
on public.product_variants for select to authenticated
using (
  public.can_catalog_store(store_id)
  or public.can_fulfill_store(store_id)
);

create policy inventory_stock_read_staff
on public.inventory_stock for select to authenticated
using (exists (
  select 1 from public.product_variants as variant
  where variant.id = inventory_stock.variant_id
    and (
      public.can_catalog_store(variant.store_id)
      or public.can_fulfill_store(variant.store_id)
    )
));

create policy delivery_zones_read_active
on public.delivery_zones for select to anon
using (is_active);
create policy delivery_zones_read_active_or_admin
on public.delivery_zones for select to authenticated
using (is_active or public.is_marketplace_admin());

create policy store_delivery_zones_read_staff
on public.store_delivery_zones for select to authenticated
using (
  public.can_catalog_store(store_id)
  or public.can_fulfill_store(store_id)
);

create policy customer_addresses_read_own
on public.customer_addresses for select to authenticated
using (exists (
  select 1 from public.marketplace_customers as customer
  where customer.id = customer_addresses.customer_id
    and customer.auth_user_id = (select auth.uid())
    and customer.is_active
));

create policy carts_read_own
on public.carts for select to authenticated
using (exists (
  select 1 from public.marketplace_customers as customer
  where customer.id = carts.customer_id
    and customer.auth_user_id = (select auth.uid())
    and customer.is_active
));

create policy cart_items_read_own
on public.cart_items for select to authenticated
using (exists (
  select 1
  from public.carts as cart
  join public.marketplace_customers as customer on customer.id = cart.customer_id
  where cart.id = cart_items.cart_id
    and customer.auth_user_id = (select auth.uid())
    and customer.is_active
));

create policy cart_coupon_selections_read_own
on public.cart_coupon_selections for select to authenticated
using (exists (
  select 1
  from public.carts as cart
  join public.marketplace_customers as customer on customer.id = cart.customer_id
  where cart.id = cart_coupon_selections.cart_id
    and customer.auth_user_id = (select auth.uid())
    and customer.is_active
));

create policy checkout_requests_read_own
on public.checkout_requests for select to authenticated
using (exists (
  select 1 from public.marketplace_customers as customer
  where customer.id = checkout_requests.customer_id
    and customer.auth_user_id = (select auth.uid())
    and customer.is_active
));

create policy order_groups_read_customer_or_admin
on public.order_groups for select to authenticated
using (
  public.is_marketplace_admin()
  or exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = order_groups.customer_id
      and customer.auth_user_id = (select auth.uid())
      and customer.is_active
  )
);

create policy marketplace_orders_read_participant
on public.marketplace_orders for select to authenticated
using (public.can_read_marketplace_order(id, store_id, customer_id));

create policy order_items_read_participant
on public.order_items for select to authenticated
using (exists (
  select 1 from public.marketplace_orders as marketplace_order
  where marketplace_order.id = order_items.order_id
    and (
      public.is_marketplace_admin()
      or public.can_fulfill_store(marketplace_order.store_id)
      or exists (
        select 1 from public.marketplace_customers as customer
        where customer.id = marketplace_order.customer_id
          and customer.auth_user_id = (select auth.uid())
          and customer.is_active
      )
      or exists (
        select 1 from public.marketplace_delivery_assignments as assignment
        where assignment.order_id = marketplace_order.id
          and assignment.driver_id = (select auth.uid())
      )
    )
));

create policy marketplace_order_events_read_participant
on public.marketplace_order_events for select to authenticated
using (exists (
  select 1 from public.marketplace_orders as marketplace_order
  where marketplace_order.id = marketplace_order_events.order_id
    and (
      public.is_marketplace_admin()
      or public.can_fulfill_store(marketplace_order.store_id)
      or exists (
        select 1 from public.marketplace_customers as customer
        where customer.id = marketplace_order.customer_id
          and customer.auth_user_id = (select auth.uid())
          and customer.is_active
      )
      or exists (
        select 1 from public.marketplace_delivery_assignments as assignment
        where assignment.order_id = marketplace_order.id
          and assignment.driver_id = (select auth.uid())
      )
    )
));

create policy inventory_reservations_read_staff
on public.inventory_reservations for select to authenticated
using (exists (
  select 1 from public.marketplace_orders as marketplace_order
  where marketplace_order.id = inventory_reservations.order_id
    and (
      public.is_marketplace_admin()
      or public.can_fulfill_store(marketplace_order.store_id)
    )
));

create policy marketplace_coupons_read_staff
on public.marketplace_coupons for select to authenticated
using (
  public.is_marketplace_admin()
  or (store_id is not null and public.can_catalog_store(store_id))
);

create policy marketplace_coupon_products_read_staff
on public.marketplace_coupon_products for select to authenticated
using (exists (
  select 1 from public.marketplace_coupons as coupon
  where coupon.id = marketplace_coupon_products.coupon_id
    and (
      public.is_marketplace_admin()
      or (coupon.store_id is not null and public.can_catalog_store(coupon.store_id))
    )
));

create policy marketplace_coupon_categories_read_staff
on public.marketplace_coupon_categories for select to authenticated
using (exists (
  select 1 from public.marketplace_coupons as coupon
  where coupon.id = marketplace_coupon_categories.coupon_id
    and (
      public.is_marketplace_admin()
      or (coupon.store_id is not null and public.can_catalog_store(coupon.store_id))
    )
));

create policy coupon_redemptions_read_authorized
on public.coupon_redemptions for select to authenticated
using (
  public.is_marketplace_admin()
  or exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = coupon_redemptions.customer_id
      and customer.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.marketplace_orders as marketplace_order
    where marketplace_order.id = coupon_redemptions.order_id
      and public.can_manage_store(marketplace_order.store_id)
  )
);

create policy product_reviews_read_authorized
on public.product_reviews for select to authenticated
using (
  public.is_marketplace_admin()
  or exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = product_reviews.customer_id
      and customer.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.products as product
    where product.id = product_reviews.product_id
      and public.can_catalog_store(product.store_id)
  )
);

create policy product_rating_aggregates_read_staff
on public.product_rating_aggregates for select to authenticated
using (exists (
  select 1 from public.products as product
  where product.id = product_rating_aggregates.product_id
    and (
      public.can_catalog_store(product.store_id)
      or public.can_fulfill_store(product.store_id)
    )
));

create policy upload_sessions_read_owner_or_staff
on public.upload_sessions for select to authenticated
using (
  owner_id = (select auth.uid())
  or public.can_catalog_store(store_id)
  or (entity_type = 'delivery_proof' and public.can_fulfill_store(store_id))
);

create policy media_assets_read_owner_or_staff
on public.media_assets for select to authenticated
using (
  visibility = 'public'
  and entity_type in ('product', 'store')
  and (
    owner_id = (select auth.uid())
    or public.can_catalog_store(store_id)
    or public.is_marketplace_admin()
  )
);

create policy product_images_read_staff
on public.product_images for select to authenticated
using (exists (
  select 1 from public.products as product
  where product.id = product_images.product_id
    and public.can_catalog_store(product.store_id)
));

create policy store_images_read_staff
on public.store_images for select to authenticated
using (public.can_catalog_store(store_id));

create policy delivery_assignments_read_participant
on public.marketplace_delivery_assignments for select to authenticated
using (
  public.is_marketplace_admin()
  or driver_id = (select auth.uid())
  or exists (
    select 1 from public.marketplace_orders as marketplace_order
    where marketplace_order.id = marketplace_delivery_assignments.order_id
      and (
        public.can_fulfill_store(marketplace_order.store_id)
        or exists (
          select 1 from public.marketplace_customers as customer
          where customer.id = marketplace_order.customer_id
            and customer.auth_user_id = (select auth.uid())
        )
      )
  )
);

create policy cod_collections_read_participant
on public.cod_collections for select to authenticated
using (
  public.is_marketplace_admin()
  or collected_by = (select auth.uid())
  or exists (
    select 1 from public.marketplace_orders as marketplace_order
    where marketplace_order.id = cod_collections.order_id
      and (
        public.can_manage_store(marketplace_order.store_id)
        or exists (
          select 1 from public.marketplace_customers as customer
          where customer.id = marketplace_order.customer_id
            and customer.auth_user_id = (select auth.uid())
        )
      )
  )
);

create policy cash_reconciliation_batches_read_participant
on public.cash_reconciliation_batches for select to authenticated
using (public.is_marketplace_admin() or driver_id = (select auth.uid()));

create policy cash_reconciliation_items_read_participant
on public.cash_reconciliation_items for select to authenticated
using (exists (
  select 1 from public.cash_reconciliation_batches as batch
  where batch.id = cash_reconciliation_items.batch_id
    and (public.is_marketplace_admin() or batch.driver_id = (select auth.uid()))
));

create policy cash_ledger_entries_read_finance
on public.cash_ledger_entries for select to authenticated
using (
  public.is_marketplace_admin()
  or actor_user_id = (select auth.uid())
  or exists (
    select 1 from public.marketplace_orders as marketplace_order
    where marketplace_order.id = cash_ledger_entries.order_id
      and public.can_manage_store(marketplace_order.store_id)
  )
);

create policy commission_ledger_read_finance
on public.commission_ledger for select to authenticated
using (public.can_manage_store(store_id));

create policy commission_statements_read_finance
on public.commission_statements for select to authenticated
using (public.can_manage_store(store_id));

create policy app_notifications_read_own
on public.app_notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create policy app_notifications_mark_read_own
on public.app_notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create policy support_threads_read_participant
on public.support_threads for select to authenticated
using (
  public.is_marketplace_admin()
  or exists (
    select 1 from public.marketplace_customers as customer
    where customer.id = support_threads.customer_id
      and customer.auth_user_id = (select auth.uid())
  )
  or (store_id is not null and public.can_manage_store(store_id))
);

create policy support_messages_read_participant
on public.support_messages for select to authenticated
using (exists (
  select 1 from public.support_threads as thread
  where thread.id = support_messages.thread_id
    and (
      public.is_marketplace_admin()
      or exists (
        select 1 from public.marketplace_customers as customer
        where customer.id = thread.customer_id
          and customer.auth_user_id = (select auth.uid())
      )
      or (thread.store_id is not null and public.can_manage_store(thread.store_id))
    )
));

create policy catalog_import_files_read_catalog_staff
on public.catalog_import_files for select to authenticated
using (public.can_catalog_store(store_id));
create policy catalog_import_jobs_read_catalog_staff
on public.catalog_import_jobs for select to authenticated
using (public.can_catalog_store(store_id));
create policy catalog_import_rows_read_catalog_staff
on public.catalog_import_rows for select to authenticated
using (exists (
  select 1 from public.catalog_import_jobs as import_job
  where import_job.id = catalog_import_rows.job_id
    and public.can_catalog_store(import_job.store_id)
));

create policy marketplace_audit_log_read_admin
on public.marketplace_audit_log for select to authenticated
using (public.is_marketplace_admin());

grant select on table public.product_categories, public.delivery_zones to anon, authenticated;
grant select on table
  public.marketplace_customers, public.merchant_memberships, public.stores,
  public.store_memberships, public.products, public.product_variants,
  public.inventory_stock, public.store_delivery_zones, public.customer_addresses,
  public.carts, public.cart_items, public.cart_coupon_selections,
  public.checkout_requests, public.order_groups, public.marketplace_orders,
  public.order_items, public.marketplace_order_events, public.inventory_reservations,
  public.marketplace_coupons, public.marketplace_coupon_products,
  public.marketplace_coupon_categories, public.coupon_redemptions,
  public.product_reviews, public.product_rating_aggregates, public.upload_sessions,
  public.media_assets, public.product_images, public.store_images,
  public.marketplace_delivery_assignments, public.cod_collections,
  public.cash_reconciliation_batches, public.cash_reconciliation_items,
  public.cash_ledger_entries, public.commission_ledger, public.commission_statements,
  public.app_notifications, public.support_threads, public.support_messages,
  public.catalog_import_files, public.catalog_import_jobs, public.catalog_import_rows,
  public.marketplace_audit_log
to authenticated;
grant update (read_at) on table public.app_notifications to authenticated;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Revoke that
-- implicit privilege from every marketplace routine before adding the exact API
-- roles below. The name array is deliberately exhaustive and migration-local.
do $$
declare routine record;
begin
  for routine in
    select namespace.nspname, procedure.proname,
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) as arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'marketplace_touch_updated_at', 'is_marketplace_admin', 'can_manage_merchant',
        'can_manage_store', 'can_catalog_store', 'can_fulfill_store',
        'can_read_marketplace_order',
        'enforce_store_moderation_transition', 'enforce_product_moderation_transition',
        'enforce_active_product_integrity',
        'validate_product_variant_store', 'protect_marketplace_tenant_identity',
        'ensure_marketplace_customer', 'enforce_cart_item_limit', 'claim_guest_cart',
        'marketplace_cart_is_owned', 'get_or_create_guest_cart',
        'get_or_create_customer_cart', 'get_marketplace_cart',
        'mutate_marketplace_cart_item', 'add_marketplace_cart_item',
        'update_marketplace_cart_item', 'remove_marketplace_cart_item',
        'apply_marketplace_cart_coupon', 'remove_marketplace_cart_coupon',
        'preview_marketplace_checkout', 'get_or_create_my_marketplace_cart',
        'get_my_marketplace_cart', 'add_my_marketplace_cart_item',
        'update_my_marketplace_cart_item', 'remove_my_marketplace_cart_item',
        'apply_my_marketplace_cart_coupon', 'remove_my_marketplace_cart_coupon',
        'preview_my_marketplace_checkout', 'validate_marketplace_media_binding',
        'validate_product_image_binding', 'validate_store_image_binding',
        'validate_delivery_proof_binding', 'prevent_order_item_mutation',
        'apply_product_rating_delta', 'refresh_product_rating_aggregate',
        'submit_product_review', 'finalize_media_upload',
        'create_my_delivery_proof_upload_session',
        'get_private_marketplace_media_locator',
        'authorize_my_private_marketplace_media', 'reorder_marketplace_media',
        'delete_marketplace_media', 'submit_store_for_review', 'moderate_store',
        'submit_product_for_review', 'moderate_product', 'checkout_marketplace_cart',
        'assign_marketplace_delivery_driver', 'attach_marketplace_delivery_proof',
        'set_marketplace_order_status', 'create_cash_reconciliation_batch',
        'submit_cash_reconciliation_batch', 'review_cash_reconciliation_batch',
        'prevent_cash_ledger_mutation', 'generate_commission_statement',
        'get_my_marketplace_product', 'list_my_marketplace_products',
        'create_my_marketplace_product', 'update_my_marketplace_product',
        'archive_my_marketplace_product',
        'create_my_catalog_import_file', 'discard_my_catalog_import_file',
        'begin_my_catalog_import', 'apply_my_catalog_import',
        'claim_catalog_import_image_jobs', 'complete_catalog_import_image_job',
        'fail_catalog_import_image_job',
        'finalize_my_catalog_import', 'fail_my_catalog_import',
        'get_my_catalog_import', 'export_my_marketplace_catalog',
        'claim_my_guest_marketplace_cart', 'save_my_marketplace_address',
        'delete_my_marketplace_address', 'checkout_my_marketplace_cart',
        'set_my_marketplace_order_status', 'get_my_marketplace_order_group',
        'get_my_marketplace_order', 'list_my_marketplace_orders',
        'create_my_cash_reconciliation_batch',
        'submit_my_cash_reconciliation_batch',
        'review_cash_reconciliation_batch_as_admin',
        'reorder_my_marketplace_media', 'delete_my_marketplace_media',
        'submit_my_store_for_review', 'submit_my_product_for_review',
        'moderate_store_as_admin', 'moderate_product_as_admin',
        'assign_marketplace_delivery_driver_as_caller',
        'attach_my_marketplace_delivery_proof', 'generate_my_commission_statement',
        'list_pending_marketplace_moderation',
        'offer_marketplace_delivery_to_driver_as_caller',
        'list_my_marketplace_delivery_offers',
        'respond_to_my_marketplace_delivery_offer',
        'list_my_cod_collections', 'list_my_cash_reconciliations',
        'get_my_cash_reconciliation', 'list_my_commission_statements',
        'get_my_commission_statement', 'list_all_commission_statements_as_admin',
        'transition_commission_statement_as_admin', 'can_access_marketplace_support_thread',
        'create_my_marketplace_support_thread',
        'list_my_marketplace_support_threads',
        'get_my_marketplace_support_thread',
        'reply_my_marketplace_support_thread',
        'close_my_marketplace_support_thread',
        'list_marketplace_catalog', 'get_marketplace_product',
        'claim_marketplace_outbox', 'complete_marketplace_outbox',
        'fail_marketplace_outbox', 'anonymize_marketplace_customer_on_auth_delete',
        'run_marketplace_maintenance'
      ])
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      routine.nspname, routine.proname, routine.arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      routine.nspname, routine.proname, routine.arguments
    );
  end loop;
end;
$$;

grant execute on function public.is_marketplace_admin() to authenticated;
grant execute on function public.can_manage_merchant(uuid) to authenticated;
grant execute on function public.can_manage_store(uuid) to authenticated;
grant execute on function public.can_catalog_store(uuid) to authenticated;
grant execute on function public.can_fulfill_store(uuid) to authenticated;
grant execute on function public.can_read_marketplace_order(uuid, uuid, uuid) to authenticated;
grant execute on function public.ensure_marketplace_customer() to authenticated;
grant execute on function public.get_or_create_my_marketplace_cart() to authenticated;
grant execute on function public.get_my_marketplace_cart(uuid) to authenticated;
grant execute on function public.add_my_marketplace_cart_item(uuid, uuid, integer) to authenticated;
grant execute on function public.update_my_marketplace_cart_item(uuid, uuid, integer) to authenticated;
grant execute on function public.remove_my_marketplace_cart_item(uuid, uuid) to authenticated;
grant execute on function public.apply_my_marketplace_cart_coupon(uuid, text) to authenticated;
grant execute on function public.remove_my_marketplace_cart_coupon(uuid) to authenticated;
grant execute on function public.preview_my_marketplace_checkout(uuid) to authenticated;
grant execute on function public.claim_my_guest_marketplace_cart(uuid, text) to authenticated;
grant execute on function public.save_my_marketplace_address(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, boolean, uuid
) to authenticated;
grant execute on function public.delete_my_marketplace_address(uuid) to authenticated;
grant execute on function public.checkout_my_marketplace_cart(uuid, text, uuid, jsonb, text)
  to authenticated;
grant execute on function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) to authenticated;
grant execute on function public.get_my_marketplace_order_group(uuid) to authenticated;
grant execute on function public.get_my_marketplace_order(uuid) to authenticated;
grant execute on function public.list_my_marketplace_orders(integer, timestamptz) to authenticated;
grant execute on function public.submit_product_review(uuid, smallint, text, text) to authenticated;
grant execute on function public.get_my_marketplace_product(uuid) to authenticated;
grant execute on function public.list_my_marketplace_products(
  uuid, text, text, text, integer, integer
)
  to authenticated;
grant execute on function public.create_my_marketplace_product(uuid, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.update_my_marketplace_product(
  uuid, timestamptz, text, jsonb, jsonb
) to authenticated;
grant execute on function public.archive_my_marketplace_product(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.begin_my_catalog_import(uuid, uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.create_my_catalog_import_file(
  uuid, uuid, text, text, bigint, text
) to authenticated;
grant execute on function public.discard_my_catalog_import_file(uuid, text)
  to authenticated;
grant execute on function public.apply_my_catalog_import(uuid, timestamptz)
  to authenticated;
grant execute on function public.finalize_my_catalog_import(uuid, jsonb, jsonb)
  to authenticated;
grant execute on function public.fail_my_catalog_import(uuid, text, jsonb)
  to authenticated;
grant execute on function public.get_my_catalog_import(uuid) to authenticated;
grant execute on function public.export_my_marketplace_catalog(uuid, integer, integer)
  to authenticated;
grant execute on function public.create_my_cash_reconciliation_batch(uuid[], bigint[], text)
  to authenticated;
grant execute on function public.submit_my_cash_reconciliation_batch(uuid) to authenticated;
grant execute on function public.review_cash_reconciliation_batch_as_admin(uuid, boolean, text)
  to authenticated;
grant execute on function public.reorder_my_marketplace_media(
  uuid, public.marketplace_media_entity, uuid, uuid[], timestamptz
) to authenticated;
grant execute on function public.delete_my_marketplace_media(uuid, timestamptz) to authenticated;
grant execute on function public.submit_my_store_for_review(uuid) to authenticated;
grant execute on function public.submit_my_product_for_review(uuid) to authenticated;
grant execute on function public.moderate_store_as_admin(uuid, boolean, text) to authenticated;
grant execute on function public.moderate_product_as_admin(uuid, boolean, text) to authenticated;
grant execute on function public.assign_marketplace_delivery_driver_as_caller(uuid, uuid) to authenticated;
grant execute on function public.attach_my_marketplace_delivery_proof(uuid, uuid) to authenticated;
grant execute on function public.create_my_delivery_proof_upload_session(
  uuid, uuid, text, text, bigint, text
) to authenticated;
grant execute on function public.authorize_my_private_marketplace_media(uuid)
  to authenticated;
grant execute on function public.list_pending_marketplace_moderation(text, integer, timestamptz)
  to authenticated;
grant execute on function public.offer_marketplace_delivery_to_driver_as_caller(
  uuid, uuid, integer
) to authenticated;
grant execute on function public.list_my_marketplace_delivery_offers(integer, timestamptz)
  to authenticated;
grant execute on function public.respond_to_my_marketplace_delivery_offer(uuid, boolean)
  to authenticated;
grant execute on function public.list_my_cod_collections(text, integer, timestamptz)
  to authenticated;
grant execute on function public.list_my_cash_reconciliations(text, integer, timestamptz)
  to authenticated;
grant execute on function public.get_my_cash_reconciliation(uuid) to authenticated;
grant execute on function public.list_my_commission_statements(uuid, integer, integer)
  to authenticated;
grant execute on function public.get_my_commission_statement(uuid) to authenticated;
grant execute on function public.list_all_commission_statements_as_admin(text, integer, timestamptz)
  to authenticated;
grant execute on function public.transition_commission_statement_as_admin(
  uuid, public.marketplace_statement_status, text, text, bigint
) to authenticated;
grant execute on function public.create_my_marketplace_support_thread(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.list_my_marketplace_support_threads(text, integer, timestamptz)
  to authenticated;
grant execute on function public.get_my_marketplace_support_thread(uuid) to authenticated;
grant execute on function public.reply_my_marketplace_support_thread(uuid, text)
  to authenticated;
grant execute on function public.close_my_marketplace_support_thread(uuid) to authenticated;
grant execute on function public.list_marketplace_catalog(text, text, text, integer, integer)
  to anon, authenticated;
grant execute on function public.get_marketplace_product(uuid) to anon, authenticated;

commit;
