-- Store coupons shown on public place cards and managed from the admin dashboard.
-- Public visitors can only read currently active coupons; all writes stay server-side.

create table if not exists public.store_coupons (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  code text not null check (
    char_length(trim(code)) between 2 and 32
    and code ~ '^[A-Za-z0-9_-]+$'
  ),
  description text not null check (char_length(trim(description)) between 5 and 280),
  discount_type text not null default 'percentage'
    check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10,2) not null check (
    discount_value > 0
    and (discount_type <> 'percentage' or discount_value <= 100)
  ),
  minimum_order_amount numeric(10,2) check (
    minimum_order_amount is null or minimum_order_amount >= 0
  ),
  applies_to text not null default 'كل المنتجات'
    check (char_length(trim(applies_to)) between 2 and 160),
  usage_limit_text text not null default 'تُطبّق شروط المتجر'
    check (char_length(trim(usage_limit_text)) between 2 and 160),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  display_order smallint not null default 0 check (display_order between 0 and 1000),
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_coupons_schedule_check check (
    expires_at is null or starts_at is null or expires_at > starts_at
  ),
  constraint store_coupons_place_code_key unique (place_id, code)
);

create index if not exists store_coupons_public_listing_idx
  on public.store_coupons (place_id, is_featured desc, display_order, created_at desc)
  where is_active;

drop trigger if exists store_coupons_touch_updated_at on public.store_coupons;
create trigger store_coupons_touch_updated_at
before update on public.store_coupons
for each row execute procedure public.touch_updated_at();

alter table public.store_coupons enable row level security;

revoke all on public.store_coupons from public, anon, authenticated;
grant select on public.store_coupons to anon, authenticated;
grant select, insert, update, delete on public.store_coupons to service_role;

drop policy if exists "public can read active store coupons" on public.store_coupons;
create policy "public can read active store coupons"
on public.store_coupons
for select
to anon, authenticated
using (
  is_active
  and (starts_at is null or starts_at <= now())
  and (expires_at is null or expires_at > now())
);

insert into public.store_coupons (
  place_id,
  title,
  code,
  description,
  discount_type,
  discount_value,
  minimum_order_amount,
  applies_to,
  usage_limit_text,
  is_active,
  is_featured,
  display_order
)
select
  p.id,
  'خصم كيان 10%',
  'KAYAN10',
  'خصم 10% على الأوردر من أكل بيتي مميز عندما تصل قيمة الطلب إلى 450 جنيه أو أكثر.',
  'percentage',
  10,
  450,
  'كل منتجات الأوردر المؤهل',
  'الحد الأدنى للطلب 450 جنيه قبل تطبيق الخصم.',
  true,
  true,
  0
from public.places p
where p.title = 'أكل بيتي مميز'
on conflict (place_id, code) do update
set title = excluded.title,
    description = excluded.description,
    discount_type = excluded.discount_type,
    discount_value = excluded.discount_value,
    minimum_order_amount = excluded.minimum_order_amount,
    applies_to = excluded.applies_to,
    usage_limit_text = excluded.usage_limit_text,
    is_active = true,
    is_featured = true,
    display_order = 0,
    updated_at = now();
