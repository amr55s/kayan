begin;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_marketplace_arabic_search(p_value text)
returns text
language sql
immutable
parallel safe
returns null on null input
set search_path = ''
as $$
  select trim(
    regexp_replace(
      translate(
        lower(p_value),
        'أإآٱىئؤةـ',
        'ااااييوه '
      ),
      '[ً-ٰٟۖ-ۭ]+',
      '',
      'g'
    )
  );
$$;

create index if not exists products_marketplace_search_trgm_idx
  on public.products using gin (
    public.normalize_marketplace_arabic_search(
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(description, '')
    ) extensions.gin_trgm_ops
  )
  where status = 'active';

create index if not exists stores_marketplace_name_trgm_idx
  on public.stores using gin (
    public.normalize_marketplace_arabic_search(name) extensions.gin_trgm_ops
  )
  where status = 'published';

create index if not exists marketplace_orders_catalog_signal_idx
  on public.marketplace_orders (store_id, status, delivered_at desc, id);

create or replace function public.list_marketplace_catalog_v2(
  p_query text default null,
  p_category_slug text default null,
  p_store_slug text default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_in_stock boolean default null,
  p_min_rating numeric default null,
  p_sort text default 'newest',
  p_cursor jsonb default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(public.normalize_marketplace_arabic_search(trim(coalesce(p_query, ''))), '');
  v_cursor_sort numeric;
  v_cursor_available integer;
  v_cursor_rating numeric;
  v_cursor_quality numeric;
  v_cursor_sales bigint;
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
  v_result jsonb;
begin
  if p_sort is null
     or p_sort not in ('newest', 'price_asc', 'price_desc', 'rating_desc', 'relevance')
     or p_limit is null or p_limit not between 1 and 48
     or char_length(coalesce(p_query, '')) > 100
     or char_length(coalesce(p_category_slug, '')) > 80
     or char_length(coalesce(p_store_slug, '')) > 180
     or (p_category_slug is not null and p_category_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
     or (p_store_slug is not null and p_store_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
     or p_min_price is not null and p_min_price < 0
     or p_max_price is not null and p_max_price < 0
     or p_min_price is not null and p_max_price is not null and p_min_price > p_max_price
     or p_min_rating is not null and (p_min_rating < 1 or p_min_rating > 5)
     or (p_sort = 'relevance' and v_query is null) then
    raise exception 'invalid_catalog_parameters' using errcode = '22023';
  end if;

  if p_cursor is not null then
    if pg_column_size(p_cursor) > 2048
       or jsonb_typeof(p_cursor) <> 'object'
       or not (p_cursor ?& array['sort','available','rating','quality','sales','created_at','id']) then
      raise exception 'invalid_catalog_cursor' using errcode = '22023';
    end if;
    begin
      v_cursor_sort := (p_cursor ->> 'sort')::numeric;
      v_cursor_available := (p_cursor ->> 'available')::integer;
      v_cursor_rating := (p_cursor ->> 'rating')::numeric;
      v_cursor_quality := (p_cursor ->> 'quality')::numeric;
      v_cursor_sales := (p_cursor ->> 'sales')::bigint;
      v_cursor_created_at := (p_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'id')::uuid;
    exception when invalid_text_representation or invalid_datetime_format
      or numeric_value_out_of_range or datetime_field_overflow then
      raise exception 'invalid_catalog_cursor' using errcode = '22023';
    end;
    if v_cursor_available not between 0 and 1
       or abs(v_cursor_sort) > 1000000000000000000
       or v_cursor_rating not between 0 and 50000
       or v_cursor_quality not between 0 and 100
       or v_cursor_sales not between 0 and 1000000000000 then
      raise exception 'invalid_catalog_cursor' using errcode = '22023';
    end if;
  end if;

  with all_facts as materialized (
    select
      product.id,
      product.store_id,
      product.category_id,
      product.slug,
      product.name,
      product.short_description,
      product.brand,
      product.created_at,
      store.slug as store_slug,
      store.name as store_name,
      category.slug as category_slug,
      category.name_ar as category_name_ar,
      category.name_en as category_name_en,
      prices.min_price,
      prices.available,
      prices.max_quantity,
      coalesce(aggregate.rating_average, 0)::numeric as rating_average,
      coalesce(aggregate.review_count, 0)::integer as review_count,
      coalesce(signals.recent_sales, 0)::bigint as recent_sales,
      coalesce(store_signal.quality_score, 0)::numeric as store_quality,
      case when v_query is null then 0::numeric else (
        ts_rank(
          to_tsvector('simple', public.normalize_marketplace_arabic_search(
            coalesce(product.name, '') || ' ' || coalesce(product.brand, '') || ' ' ||
            coalesce(product.description, '') || ' ' || store.name
          )),
          websearch_to_tsquery('simple', v_query)
        )::numeric
        + greatest(
            extensions.similarity(public.normalize_marketplace_arabic_search(product.name), v_query),
            extensions.similarity(public.normalize_marketplace_arabic_search(store.name), v_query)
          )::numeric
      ) end as relevance
    from public.products as product
    join public.stores as store on store.id = product.store_id and store.status = 'published'
    left join public.product_categories as category
      on category.id = product.category_id and category.is_active
    left join public.product_rating_aggregates as aggregate on aggregate.product_id = product.id
    join lateral (
      select
        min(variant.price)::bigint as min_price,
        coalesce(bool_or(not inventory.track_inventory or inventory.on_hand > inventory.reserved), false) as available,
        coalesce(max(case when inventory.track_inventory
          then greatest(0, least(99, inventory.on_hand - inventory.reserved)) else 99 end), 0)::integer as max_quantity
      from public.product_variants as variant
      join public.inventory_stock as inventory on inventory.variant_id = variant.id
      where variant.product_id = product.id and variant.is_active
    ) as prices on prices.min_price is not null
    left join lateral (
      select coalesce(sum(item.quantity), 0)::bigint as recent_sales
      from public.order_items as item
      join public.marketplace_orders as recent_order on recent_order.id = item.order_id
      where item.product_id = product.id
        and recent_order.status = 'delivered'
        and recent_order.delivered_at >= now() - interval '30 days'
    ) as signals on true
    left join lateral (
      select coalesce(
        100 * count(*) filter (where quality_order.status = 'delivered') /
        nullif(count(*) filter (where quality_order.status in ('delivered','rejected','cancelled','delivery_failed','returned')), 0),
        0
      )::numeric as quality_score
      from public.marketplace_orders as quality_order
      where quality_order.store_id = store.id
        and quality_order.created_at >= now() - interval '90 days'
    ) as store_signal on true
    where product.status = 'active'
      and (p_min_price is null or prices.min_price >= p_min_price)
      and (p_max_price is null or prices.min_price <= p_max_price)
      and (p_in_stock is null or prices.available = p_in_stock)
      and (p_min_rating is null or (aggregate.review_count > 0 and aggregate.rating_average >= p_min_rating))
      and (
        v_query is null
        or to_tsvector('simple', public.normalize_marketplace_arabic_search(
          coalesce(product.name, '') || ' ' || coalesce(product.brand, '') || ' ' ||
          coalesce(product.description, '') || ' ' || store.name
        )) @@ websearch_to_tsquery('simple', v_query)
        or public.normalize_marketplace_arabic_search(
          coalesce(product.name, '') || ' ' || coalesce(product.brand, '') || ' ' || coalesce(product.description, '')
        ) operator(extensions.%) v_query
        or public.normalize_marketplace_arabic_search(store.name) operator(extensions.%) v_query
      )
  ), product_facts as materialized (
    select * from all_facts
    where (p_category_slug is null or category_slug = p_category_slug)
      and (p_store_slug is null or store_slug = p_store_slug)
  ), ranked as materialized (
    select product_facts.*,
      case p_sort
        when 'price_asc' then -min_price::numeric
        when 'price_desc' then min_price::numeric
        when 'rating_desc' then rating_average * 10000
        when 'relevance' then relevance * 1000000
        else extract(epoch from created_at)::numeric
      end as sort_key,
      case when available then 1 else 0 end as available_key,
      rating_average * 10000 as rating_key
    from product_facts
  ), cursor_filtered as materialized (
    select * from ranked
    where p_cursor is null or (
      sort_key, available_key, rating_key, store_quality, recent_sales, created_at, id
    ) < (
      v_cursor_sort, v_cursor_available, v_cursor_rating, v_cursor_quality,
      v_cursor_sales, v_cursor_created_at, v_cursor_id
    )
    order by sort_key desc, available_key desc, rating_key desc,
      store_quality desc, recent_sales desc, created_at desc, id desc
    limit p_limit + 1
  ), page_rows as materialized (
    select cursor_filtered.*,
      chosen.id as default_variant_id,
      chosen.title as default_variant_title,
      chosen.price as default_price,
      chosen.compare_at_price,
      image.public_url as primary_image_url
    from cursor_filtered
    join lateral (
      select variant.id, variant.title, variant.price, variant.compare_at_price
      from public.product_variants as variant
      join public.inventory_stock as inventory on inventory.variant_id = variant.id
      where variant.product_id = cursor_filtered.id and variant.is_active
      order by (not inventory.track_inventory or inventory.on_hand > inventory.reserved) desc,
        variant.is_default desc, variant.price, variant.id
      limit 1
    ) as chosen on true
    left join lateral (
      select asset.public_url
      from public.product_images as product_image
      join public.media_assets as asset on asset.id = product_image.media_asset_id and asset.status = 'active'
      where product_image.product_id = cursor_filtered.id
      order by product_image.position
      limit 1
    ) as image on true
    order by sort_key desc, available_key desc, rating_key desc,
      store_quality desc, recent_sales desc, created_at desc, id desc
    limit p_limit
  ), last_row as (
    select * from page_rows
    order by sort_key asc, available_key asc, rating_key asc,
      store_quality asc, recent_sales asc, created_at asc, id asc
    limit 1
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id, 'slug', row.slug, 'name', row.name,
      'short_description', row.short_description, 'brand', row.brand,
      'store', jsonb_build_object('id', row.store_id, 'slug', row.store_slug, 'name', row.store_name),
      'category', case when row.category_id is null then null else jsonb_build_object(
        'id', row.category_id, 'slug', row.category_slug,
        'name_ar', row.category_name_ar, 'name_en', row.category_name_en
      ) end,
      'default_variant', jsonb_build_object(
        'id', row.default_variant_id, 'title', row.default_variant_title,
        'price', row.default_price, 'compare_at_price', row.compare_at_price
      ),
      'min_price', row.min_price, 'available', row.available,
      'max_quantity', row.max_quantity, 'primary_image_url', row.primary_image_url,
      'rating', case when row.review_count = 0 then null else jsonb_build_object(
        'average', row.rating_average, 'count', row.review_count
      ) end
    ) order by row.sort_key desc, row.available_key desc, row.rating_key desc,
      row.store_quality desc, row.recent_sales desc, row.created_at desc, row.id desc)
    from page_rows as row), '[]'::jsonb),
    'has_more', (select count(*) > p_limit from cursor_filtered),
    'next_cursor', case when (select count(*) > p_limit from cursor_filtered) then (
      select jsonb_build_object(
        'sort', sort_key, 'available', available_key, 'rating', rating_key,
        'quality', store_quality, 'sales', recent_sales,
        'created_at', created_at, 'id', id
      ) from last_row
    ) else null end,
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'slug', facet.category_slug, 'name_ar', facet.category_name_ar,
      'name_en', facet.category_name_en, 'count', facet.product_count
    ) order by facet.category_name_ar) from (
      select category_slug, max(category_name_ar) as category_name_ar,
        max(category_name_en) as category_name_en, count(*) as product_count
      from all_facts
      where category_slug is not null
        and (p_store_slug is null or store_slug = p_store_slug)
      group by category_slug
    ) facet), '[]'::jsonb),
    'stores', coalesce((select jsonb_agg(jsonb_build_object(
      'slug', facet.store_slug, 'name', facet.store_name, 'count', facet.product_count
    ) order by facet.store_name) from (
      select store_slug, max(store_name) as store_name, count(*) as product_count
      from all_facts
      where p_category_slug is null or category_slug = p_category_slug
      group by store_slug
    ) facet), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.normalize_marketplace_arabic_search(text) from public, anon, authenticated;
revoke all on function public.list_marketplace_catalog_v2(
  text, text, text, bigint, bigint, boolean, numeric, text, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.list_marketplace_catalog_v2(
  text, text, text, bigint, bigint, boolean, numeric, text, jsonb, integer
) to anon, authenticated;

commit;
