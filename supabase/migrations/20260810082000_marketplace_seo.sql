begin;

-- Public sitemap readers get only the three fields needed to build canonical
-- product URLs. The underlying marketplace tables remain inaccessible to anon.
create index if not exists products_public_sitemap_idx
  on public.products (updated_at, id)
  where status = 'active';

create or replace function public.count_marketplace_sitemap_products()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.products as product
  join public.stores as store
    on store.id = product.store_id
   and store.status = 'published'
  where product.status = 'active'
    and exists (
      select 1
      from public.product_variants as variant
      join public.inventory_stock as inventory
        on inventory.variant_id = variant.id
      where variant.product_id = product.id
        and variant.is_active
    );
$$;

create or replace function public.list_marketplace_sitemap_products(
  p_page integer default 1,
  p_page_size integer default 50000
)
returns table (
  id uuid,
  slug text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_page is null
     or p_page_size is null
     or p_page not between 1 and 10000
     or p_page_size not between 1 and 50000 then
    raise exception 'invalid_sitemap_parameters' using errcode = '22023';
  end if;

  return query
  select product.id, product.slug, product.updated_at
  from public.products as product
  join public.stores as store
    on store.id = product.store_id
   and store.status = 'published'
  where product.status = 'active'
    and exists (
      select 1
      from public.product_variants as variant
      join public.inventory_stock as inventory
        on inventory.variant_id = variant.id
      where variant.product_id = product.id
        and variant.is_active
    )
  order by product.updated_at, product.id
  limit p_page_size
  offset ((p_page - 1)::bigint * p_page_size::bigint);
end;
$$;

revoke all on function public.count_marketplace_sitemap_products() from public;
revoke all on function public.list_marketplace_sitemap_products(integer, integer) from public;
grant execute on function public.count_marketplace_sitemap_products() to anon, authenticated;
grant execute on function public.list_marketplace_sitemap_products(integer, integer) to anon, authenticated;

commit;
