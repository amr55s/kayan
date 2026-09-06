-- Quantity-aware marketplace returns. Financial and stock effects are applied
-- only when approved goods are received, and every accounting effect is
-- represented by an append-only row keyed to the return request.

begin;

create table public.marketplace_return_category_policies (
  category_id uuid primary key references public.product_categories(id) on delete cascade,
  allow_change_of_mind boolean not null default true,
  change_of_mind_days integer not null default 14 check (change_of_mind_days between 0 and 90),
  allow_defect_return boolean not null default true,
  defect_days integer not null default 30 check (defect_days between 1 and 180),
  default_restock_defects boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.marketplace_return_requests (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique
    default ('R-' || upper(pg_catalog.encode(extensions.gen_random_bytes(12), 'hex'))),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  customer_id uuid not null references public.marketplace_customers(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  reason_code text not null check (reason_code in (
    'change_of_mind', 'defective', 'damaged', 'wrong_item', 'missing_parts', 'other'
  )),
  reason_details text check (reason_details is null or char_length(trim(reason_details)) between 3 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'received', 'cancelled')),
  request_idempotency_key text not null check (char_length(request_idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text check (review_notes is null or char_length(trim(review_notes)) <= 1000),
  reviewed_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  returned_gross_piastres public.egp_amount not null default 0,
  merchant_discount_adjustment_piastres public.egp_amount not null default 0,
  platform_discount_adjustment_piastres public.egp_amount not null default 0,
  delivery_refund_piastres public.egp_amount not null default 0,
  refund_amount_piastres public.egp_amount not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, request_idempotency_key),
  check (status not in ('approved','rejected') or reviewed_at is not null),
  check (status <> 'received' or received_at is not null),
  check (refund_amount_piastres = returned_gross_piastres
    - merchant_discount_adjustment_piastres
    - platform_discount_adjustment_piastres
    + delivery_refund_piastres)
);

create index marketplace_return_requests_order_idx
  on public.marketplace_return_requests (order_id, created_at desc, id desc);
create index marketplace_return_requests_store_queue_idx
  on public.marketplace_return_requests (store_id, status, created_at)
  where status in ('requested','approved');
create index marketplace_return_requests_customer_idx
  on public.marketplace_return_requests (customer_id, created_at desc);

create table public.marketplace_return_request_items (
  return_request_id uuid not null references public.marketplace_return_requests(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  eligibility_deadline timestamptz not null,
  policy_days integer not null check (policy_days between 0 and 180),
  gross_amount_piastres public.egp_amount not null,
  merchant_discount_adjustment_piastres public.egp_amount not null default 0,
  platform_discount_adjustment_piastres public.egp_amount not null default 0,
  refund_amount_piastres public.egp_amount not null default 0,
  restock_quantity integer not null default 0 check (restock_quantity >= 0 and restock_quantity <= quantity),
  created_at timestamptz not null default now(),
  primary key (return_request_id, order_item_id),
  check (refund_amount_piastres = gross_amount_piastres
    - merchant_discount_adjustment_piastres
    - platform_discount_adjustment_piastres)
);

create index marketplace_return_request_items_order_item_idx
  on public.marketplace_return_request_items (order_item_id, return_request_id);

create table public.marketplace_return_mutations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  return_request_id uuid not null references public.marketplace_return_requests(id) on delete restrict,
  operation text not null check (operation in ('review','receive')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);

create index marketplace_return_mutations_request_idx
  on public.marketplace_return_mutations (return_request_id, created_at);

create table public.marketplace_coupon_return_adjustments (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null references public.coupon_redemptions(id) on delete restrict,
  return_request_id uuid not null unique references public.marketplace_return_requests(id) on delete restrict,
  amount_piastres public.egp_adjustment not null check (amount_piastres < 0),
  funding_owner public.marketplace_coupon_funding not null,
  created_at timestamptz not null default now()
);

alter table public.commission_ledger
  add column return_request_id uuid references public.marketplace_return_requests(id) on delete restrict;
alter table public.commission_ledger
  drop constraint commission_ledger_order_id_entry_type_key;
create unique index commission_ledger_one_earned_per_order_idx
  on public.commission_ledger (order_id) where entry_type = 'earned';
create unique index commission_ledger_one_reversal_per_return_idx
  on public.commission_ledger (return_request_id) where return_request_id is not null;
create index commission_ledger_return_request_fk_idx
  on public.commission_ledger (return_request_id);

create or replace function public.prevent_marketplace_return_append_only_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'marketplace_return_mutations' and tg_op = 'UPDATE'
     and old.actor_user_id is not null and new.actor_user_id is null
     and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id') then return new; end if;
  raise exception 'marketplace_return_ledger_is_append_only' using errcode = '55000';
end;
$$;

create trigger marketplace_return_mutations_immutable
before update or delete on public.marketplace_return_mutations
for each row execute function public.prevent_marketplace_return_append_only_mutation();
create trigger marketplace_coupon_return_adjustments_immutable
before update or delete on public.marketplace_coupon_return_adjustments
for each row execute function public.prevent_marketplace_return_append_only_mutation();

create or replace function public.create_my_marketplace_return_request(
  p_order_id uuid,
  p_reason_code text,
  p_reason_details text,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_customer public.marketplace_customers;
  v_order public.marketplace_orders;
  v_request public.marketplace_return_requests;
  v_item record;
  v_hash text;
  v_days integer;
  v_allowed boolean;
  v_deadline timestamptz;
  v_prior integer;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  p_reason_code := trim(coalesce(p_reason_code, ''));
  if p_reason_code not in ('change_of_mind','defective','damaged','wrong_item','missing_parts','other')
     or char_length(trim(coalesce(p_reason_details, ''))) > 1000
     or (p_reason_code = 'other' and char_length(trim(coalesce(p_reason_details, ''))) < 3)
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 128 then
    raise exception 'invalid_return_request' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity integer))
     <> (select count(distinct x.order_item_id) from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity integer))
     or exists (select 1 from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity integer)
       where x.order_item_id is null or x.quantity is null or x.quantity not between 1 and 99) then
    raise exception 'invalid_return_items' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('order_id', p_order_id, 'reason', p_reason_code,
      'details', nullif(trim(coalesce(p_reason_details, '')), ''), 'items', p_items)::text,
    'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'return-request:' || v_actor::text || ':' || p_idempotency_key, 0));
  select * into v_request from public.marketplace_return_requests
  where customer_id in (select id from public.marketplace_customers where auth_user_id = v_actor)
    and request_idempotency_key = p_idempotency_key;
  if v_request is not null then
    if v_request.request_hash <> v_hash then raise exception 'return_idempotency_conflict' using errcode = '23505'; end if;
    return jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code,
      'status', v_request.status, 'idempotent', true);
  end if;
  select * into v_customer from public.marketplace_customers
  where auth_user_id = v_actor and is_active;
  if v_customer is null then raise exception 'customer_access_required' using errcode = '42501'; end if;
  select * into v_order from public.marketplace_orders where id = p_order_id for update;
  if v_order is null or v_order.customer_id <> v_customer.id then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.status <> 'delivered' or v_order.delivered_at is null then
    raise exception 'return_requires_delivered_order' using errcode = '55000';
  end if;
  perform 1 from public.order_items where order_id = v_order.id order by id for update;
  insert into public.marketplace_return_requests (
    order_id, customer_id, store_id, reason_code, reason_details,
    request_idempotency_key, request_hash, requested_by
  ) values (
    v_order.id, v_order.customer_id, v_order.store_id, p_reason_code,
    nullif(trim(coalesce(p_reason_details, '')), ''), p_idempotency_key, v_hash, v_actor
  ) returning * into v_request;
  for v_item in
    select item.*, product.category_id,
      requested.quantity as requested_quantity
    from jsonb_to_recordset(p_items) as requested(order_item_id uuid, quantity integer)
    join public.order_items as item on item.id = requested.order_item_id and item.order_id = v_order.id
    join public.products as product on product.id = item.product_id
    order by item.id
  loop
    select case when p_reason_code = 'change_of_mind'
        then coalesce(policy.allow_change_of_mind, true)
        else coalesce(policy.allow_defect_return, true) end,
      case when p_reason_code = 'change_of_mind'
        then coalesce(policy.change_of_mind_days, 14)
        else coalesce(policy.defect_days, 30) end
    into v_allowed, v_days
    from (select 1) as seed
    left join public.marketplace_return_category_policies as policy
      on policy.category_id = v_item.category_id;
    v_deadline := v_order.delivered_at + make_interval(days => v_days);
    if not v_allowed then raise exception 'return_category_excluded:%', v_item.order_item_id using errcode = '22023'; end if;
    if now() > v_deadline then raise exception 'return_window_expired:%', v_item.order_item_id using errcode = '22023'; end if;
    select coalesce(sum(return_item.quantity), 0)::integer into v_prior
    from public.marketplace_return_request_items as return_item
    join public.marketplace_return_requests as request on request.id = return_item.return_request_id
    where return_item.order_item_id = v_item.order_item_id
      and request.status in ('requested','approved','received');
    if v_prior + v_item.requested_quantity > v_item.quantity then
      raise exception 'return_quantity_exceeded:%', v_item.order_item_id using errcode = '23514';
    end if;
    insert into public.marketplace_return_request_items (
      return_request_id, order_item_id, quantity, eligibility_deadline,
      policy_days, gross_amount_piastres, refund_amount_piastres
    ) values (
      v_request.id, v_item.order_item_id, v_item.requested_quantity,
      v_deadline, v_days, v_item.unit_price * v_item.requested_quantity,
      v_item.unit_price * v_item.requested_quantity
    );
  end loop;
  if (select count(*) from public.marketplace_return_request_items where return_request_id = v_request.id)
     <> jsonb_array_length(p_items) then raise exception 'return_item_not_in_order' using errcode = '22023'; end if;
  insert into public.marketplace_order_events (order_id, actor_user_id, event_type, metadata)
  values (v_order.id, v_actor, 'return.requested', jsonb_build_object(
    'return_request_id', v_request.id, 'reason_code', p_reason_code));
  perform public.notify_marketplace_store_members(v_order.store_id,
    'return.requested:' || v_request.id::text, 'return.requested',
    'طلب إرجاع جديد', 'يوجد طلب إرجاع يحتاج إلى المراجعة.',
    '/merchant/marketplace/orders/' || v_order.id::text, v_actor);
  perform public.notify_marketplace_admins('return.requested:' || v_request.id::text,
    'return.requested', 'طلب إرجاع جديد', 'يوجد طلب إرجاع يحتاج إلى المراجعة.',
    '/admin/marketplace/orders/' || v_order.id::text, v_actor);
  return jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code,
    'status', v_request.status, 'idempotent', false);
end;
$$;

create or replace function public.review_my_marketplace_return_request(
  p_return_request_id uuid, p_approve boolean, p_notes text, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_request public.marketplace_return_requests;
  v_hash text; v_mutation public.marketplace_return_mutations; v_response jsonb;
begin
  if v_actor is null or p_approve is null or char_length(trim(coalesce(p_notes, ''))) > 1000
     or (not p_approve and char_length(trim(coalesce(p_notes, ''))) < 3)
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 128 then
    raise exception 'invalid_return_review' using errcode = '22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'request_id', p_return_request_id, 'approve', p_approve,
    'notes', nullif(trim(coalesce(p_notes, '')), ''))::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'return-mutation:' || v_actor::text || ':' || p_idempotency_key, 0));
  select * into v_mutation from public.marketplace_return_mutations
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if v_mutation is not null then
    if v_mutation.operation <> 'review' or v_mutation.request_hash <> v_hash then
      raise exception 'return_idempotency_conflict' using errcode = '23505'; end if;
    return v_mutation.response || jsonb_build_object('idempotent', true);
  end if;
  select * into v_request from public.marketplace_return_requests
  where id = p_return_request_id for update;
  if v_request is null then raise exception 'return_request_not_found' using errcode = 'P0002'; end if;
  if not (public.is_marketplace_admin() or public.can_fulfill_store(v_request.store_id)) then
    raise exception 'return_review_access_required' using errcode = '42501'; end if;
  if v_request.status <> 'requested' then raise exception 'return_request_not_reviewable' using errcode = '55000'; end if;
  update public.marketplace_return_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = v_actor, review_notes = nullif(trim(coalesce(p_notes, '')), ''),
    reviewed_at = now(), updated_at = now()
  where id = v_request.id returning * into v_request;
  v_response := jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code,
    'status', v_request.status, 'idempotent', false);
  insert into public.marketplace_return_mutations (
    actor_user_id, return_request_id, operation, idempotency_key, request_hash, response
  ) values (v_actor, v_request.id, 'review', p_idempotency_key, v_hash, v_response);
  insert into public.marketplace_order_events (order_id, actor_user_id, event_type, metadata)
  values (v_request.order_id, v_actor,
    case when p_approve then 'return.approved' else 'return.rejected' end,
    jsonb_build_object('return_request_id', v_request.id, 'notes', v_request.review_notes));
  perform public.emit_marketplace_notification(
    (select customer.auth_user_id from public.marketplace_customers as customer
      where customer.id = v_request.customer_id),
    'return.reviewed:' || v_request.id::text,
    case when p_approve then 'return.approved' else 'return.rejected' end,
    case when p_approve then 'تمت الموافقة على الإرجاع' else 'تم رفض طلب الإرجاع' end,
    case when p_approve then 'يمكنك متابعة حالة الإرجاع من صفحة الطلب.' else 'راجع سبب الرفض في صفحة الطلب.' end,
    '/account/orders/' || v_request.order_id::text);
  return v_response;
end;
$$;

create or replace function public.receive_my_marketplace_return_request(
  p_return_request_id uuid, p_restock_items jsonb, p_notes text, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_request public.marketplace_return_requests;
  v_order public.marketplace_orders; v_mutation public.marketplace_return_mutations;
  v_hash text; v_response jsonb; v_item record; v_stock public.inventory_stock;
  v_gross bigint; v_previous_gross bigint; v_cumulative_gross bigint;
  v_merchant_previous bigint; v_platform_previous bigint;
  v_merchant_target bigint; v_platform_target bigint;
  v_merchant_current bigint; v_platform_current bigint;
  v_refund bigint; v_delivery_refund bigint := 0; v_total_returned integer; v_total_ordered integer;
  v_earned public.commission_ledger; v_previous_commission bigint; v_commission_target bigint; v_commission_current bigint;
  v_previous_merchant_net bigint; v_current_merchant_net bigint;
  v_collection public.cod_collections; v_redemption public.coupon_redemptions;
  v_restock integer; v_running_gross bigint := 0; v_item_merchant bigint; v_item_platform bigint;
  v_prev_item_merchant bigint := 0; v_prev_item_platform bigint := 0; v_movement_id bigint;
begin
  if v_actor is null or jsonb_typeof(p_restock_items) <> 'array'
     or jsonb_array_length(p_restock_items) not between 1 and 100
     or char_length(trim(coalesce(p_notes, ''))) > 1000
     or char_length(coalesce(p_idempotency_key, '')) not between 16 and 128 then
    raise exception 'invalid_return_receipt' using errcode = '22023'; end if;
  if (select count(*) from jsonb_to_recordset(p_restock_items) as x(order_item_id uuid, quantity integer))
     <> (select count(distinct x.order_item_id) from jsonb_to_recordset(p_restock_items) as x(order_item_id uuid, quantity integer))
     or exists (select 1 from jsonb_to_recordset(p_restock_items) as x(order_item_id uuid, quantity integer)
       where x.order_item_id is null or x.quantity is null or x.quantity < 0) then
    raise exception 'invalid_restock_items' using errcode = '22023'; end if;
  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'request_id', p_return_request_id, 'restock', p_restock_items,
    'notes', nullif(trim(coalesce(p_notes, '')), ''))::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'return-mutation:' || v_actor::text || ':' || p_idempotency_key, 0));
  select * into v_mutation from public.marketplace_return_mutations
  where actor_user_id = v_actor and idempotency_key = p_idempotency_key;
  if v_mutation is not null then
    if v_mutation.operation <> 'receive' or v_mutation.request_hash <> v_hash then
      raise exception 'return_idempotency_conflict' using errcode = '23505'; end if;
    return v_mutation.response || jsonb_build_object('idempotent', true);
  end if;
  select * into v_request from public.marketplace_return_requests
  where id = p_return_request_id for update;
  if v_request is null then raise exception 'return_request_not_found' using errcode = 'P0002'; end if;
  if not (public.is_marketplace_admin() or public.can_fulfill_store(v_request.store_id)) then
    raise exception 'return_receive_access_required' using errcode = '42501'; end if;
  if v_request.status <> 'approved' then raise exception 'return_request_not_receivable' using errcode = '55000'; end if;
  select * into v_order from public.marketplace_orders where id = v_request.order_id for update;
  perform 1 from public.marketplace_return_request_items where return_request_id = v_request.id order by order_item_id for update;
  if (select count(*) from public.marketplace_return_request_items where return_request_id = v_request.id)
     <> jsonb_array_length(p_restock_items) then raise exception 'restock_item_set_mismatch' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_restock_items) as input(order_item_id uuid, quantity integer)
    left join public.marketplace_return_request_items as item
      on item.return_request_id = v_request.id and item.order_item_id = input.order_item_id
    where item.order_item_id is null
  ) or exists (
    select 1 from public.marketplace_return_request_items as item
    left join jsonb_to_recordset(p_restock_items) as input(order_item_id uuid, quantity integer)
      on input.order_item_id = item.order_item_id
    where item.return_request_id = v_request.id and input.order_item_id is null
  ) then raise exception 'restock_item_set_mismatch' using errcode = '22023'; end if;
  v_gross := (select sum(gross_amount_piastres) from public.marketplace_return_request_items where return_request_id = v_request.id);
  select coalesce(sum(request.returned_gross_piastres),0),
    coalesce(sum(request.merchant_discount_adjustment_piastres),0),
    coalesce(sum(request.platform_discount_adjustment_piastres),0)
  into v_previous_gross, v_merchant_previous, v_platform_previous
  from public.marketplace_return_requests as request
  where request.order_id = v_order.id and request.status = 'received';
  v_cumulative_gross := v_previous_gross + v_gross;
  if v_cumulative_gross > v_order.subtotal then raise exception 'return_financial_overflow' using errcode = '23514'; end if;
  v_merchant_target := case when v_cumulative_gross = v_order.subtotal then v_order.merchant_discount_total
    else round(v_order.merchant_discount_total::numeric * v_cumulative_gross / nullif(v_order.subtotal,0), 0)::bigint end;
  v_platform_target := case when v_cumulative_gross = v_order.subtotal then v_order.platform_discount_total
    else round(v_order.platform_discount_total::numeric * v_cumulative_gross / nullif(v_order.subtotal,0), 0)::bigint end;
  v_merchant_current := v_merchant_target - v_merchant_previous;
  v_platform_current := v_platform_target - v_platform_previous;
  select coalesce(sum(item.quantity),0), (select sum(quantity) from public.order_items where order_id = v_order.id)
  into v_total_returned, v_total_ordered
  from public.marketplace_return_request_items as item
  join public.marketplace_return_requests as request on request.id = item.return_request_id
  where request.order_id = v_order.id and (request.status = 'received' or request.id = v_request.id);
  if v_total_returned = v_total_ordered then v_delivery_refund := v_order.delivery_fee; end if;
  v_refund := v_gross - v_merchant_current - v_platform_current + v_delivery_refund;

  for v_item in
    select return_item.*, order_item.variant_id,
      input.quantity as requested_restock
    from public.marketplace_return_request_items as return_item
    join public.order_items as order_item on order_item.id = return_item.order_item_id
    join jsonb_to_recordset(p_restock_items) as input(order_item_id uuid, quantity integer)
      on input.order_item_id = return_item.order_item_id
    where return_item.return_request_id = v_request.id order by return_item.order_item_id
  loop
    if v_item.requested_restock > v_item.quantity then raise exception 'restock_quantity_exceeded:%', v_item.order_item_id using errcode = '23514'; end if;
    v_running_gross := v_running_gross + v_item.gross_amount_piastres;
    v_item_merchant := case when v_running_gross = v_gross then v_merchant_current
      else round(v_merchant_current::numeric * v_running_gross / nullif(v_gross,0),0)::bigint end;
    v_item_platform := case when v_running_gross = v_gross then v_platform_current
      else round(v_platform_current::numeric * v_running_gross / nullif(v_gross,0),0)::bigint end;
    update public.marketplace_return_request_items set
      merchant_discount_adjustment_piastres = v_item_merchant - v_prev_item_merchant,
      platform_discount_adjustment_piastres = v_item_platform - v_prev_item_platform,
      refund_amount_piastres = gross_amount_piastres - (v_item_merchant - v_prev_item_merchant) - (v_item_platform - v_prev_item_platform),
      restock_quantity = v_item.requested_restock
    where return_request_id = v_request.id and order_item_id = v_item.order_item_id;
    v_prev_item_merchant := v_item_merchant; v_prev_item_platform := v_item_platform;
    if v_item.requested_restock > 0 then
      select * into v_stock from public.inventory_stock where variant_id = v_item.variant_id for update;
      if v_stock is null then raise exception 'inventory_stock_not_found:%', v_item.variant_id using errcode = 'P0002'; end if;
      update public.inventory_stock set on_hand = on_hand + v_item.requested_restock,
        version = version + 1, updated_at = now() where variant_id = v_item.variant_id;
      select movement.id into v_movement_id from public.inventory_movements as movement
      where movement.transaction_id = txid_current() and movement.variant_id = v_item.variant_id
        and not exists (select 1 from public.inventory_movement_references as ref where ref.movement_id = movement.id)
      order by movement.id desc limit 1;
      if v_movement_id is null then raise exception 'inventory_return_movement_missing' using errcode = '55000'; end if;
      insert into public.inventory_movement_references (movement_id, reservation_id, order_id, order_item_id, reference_type)
      select v_movement_id, reservation.id, v_order.id, v_item.order_item_id, 'order_return'
      from public.inventory_reservations as reservation where reservation.order_item_id = v_item.order_item_id
      on conflict (movement_id) do nothing;
    end if;
  end loop;
  if (select count(*) from jsonb_to_recordset(p_restock_items) as x(order_item_id uuid, quantity integer))
     <> (select count(*) from public.marketplace_return_request_items where return_request_id = v_request.id) then
    raise exception 'restock_item_set_mismatch' using errcode = '22023'; end if;

  update public.marketplace_return_requests set status = 'received', received_by = v_actor,
    received_at = now(), review_notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), review_notes),
    returned_gross_piastres = v_gross,
    merchant_discount_adjustment_piastres = v_merchant_current,
    platform_discount_adjustment_piastres = v_platform_current,
    delivery_refund_piastres = v_delivery_refund, refund_amount_piastres = v_refund,
    updated_at = now() where id = v_request.id returning * into v_request;

  select * into v_earned from public.commission_ledger
  where order_id = v_order.id and entry_type = 'earned' for update;
  if v_earned is not null then
    select coalesce(-sum(commission_amount),0), coalesce(-sum(gross_merchandise_value),0)
    into v_previous_commission, v_previous_merchant_net
    from public.commission_ledger where source_entry_id = v_earned.id and entry_type = 'reversal';
    v_current_merchant_net := v_gross - v_merchant_current;
    v_commission_target := case
      when v_previous_merchant_net + v_current_merchant_net >= v_earned.gross_merchandise_value then v_earned.commission_amount
      else round(v_earned.commission_amount::numeric * (v_previous_merchant_net + v_current_merchant_net)
        / nullif(v_earned.gross_merchandise_value,0),0)::bigint end;
    v_commission_current := v_commission_target - v_previous_commission;
    if v_current_merchant_net > 0 or v_commission_current > 0 then
      insert into public.commission_ledger (
        store_id, order_id, entry_type, source_entry_id, return_request_id,
        gross_merchandise_value, commission_amount, recognized_at, reversal_reason
      ) values (v_order.store_id, v_order.id, 'reversal', v_earned.id, v_request.id,
        -v_current_merchant_net, -v_commission_current, now(), 'partial_return')
      on conflict (return_request_id) where return_request_id is not null do nothing;
    end if;
    if v_commission_target = v_earned.commission_amount then
      update public.commission_ledger set reversed_at = coalesce(reversed_at, now()),
        reversal_reason = coalesce(reversal_reason, 'fully_returned') where id = v_earned.id;
    end if;
  end if;

  select * into v_collection from public.cod_collections where order_id = v_order.id for update;
  if v_collection.collected_amount is not null and v_refund > 0 then
    if coalesce((select -sum(entry.amount_piastres) from public.cash_ledger_entries as entry
      where entry.order_id = v_order.id and entry.entry_type = 'refund'), 0) + v_refund
      > v_collection.collected_amount then
      raise exception 'return_refund_exceeds_collection' using errcode = '23514';
    end if;
    insert into public.cash_ledger_entries (
      event_key, entry_type, order_id, collection_id, amount_piastres,
      actor_user_id, actor_name_snapshot, metadata
    ) values ('cod.return-refund:' || v_request.id::text, 'refund', v_order.id,
      v_collection.id, -v_refund, v_actor,
      (select display_name from public.profiles where id = v_actor),
      jsonb_build_object('return_request_id', v_request.id, 'partial', v_total_returned < v_total_ordered))
    on conflict (event_key) do nothing;
  end if;
  select * into v_redemption from public.coupon_redemptions
  where order_id = v_order.id and voided_at is null;
  if v_redemption is not null and (case when v_redemption.funding_owner_snapshot = 'merchant'
      then v_merchant_current else v_platform_current end) > 0 then
    insert into public.marketplace_coupon_return_adjustments (
      redemption_id, return_request_id, amount_piastres, funding_owner
    ) values (v_redemption.id, v_request.id,
      -case when v_redemption.funding_owner_snapshot = 'merchant'
        then v_merchant_current else v_platform_current end,
      v_redemption.funding_owner_snapshot)
    on conflict (return_request_id) do nothing;
  end if;
  if v_total_returned = v_total_ordered then
    update public.marketplace_orders set status = 'returned', payment_status = 'refunded', updated_at = now()
      where id = v_order.id;
    update public.cod_collections set status = 'refunded', updated_at = now()
      where id = v_collection.id and collected_amount is not null;
    update public.inventory_reservations as reservation set status = 'released', released_at = now()
      where reservation.order_id = v_order.id and reservation.status = 'committed';
  end if;
  v_response := jsonb_build_object('id', v_request.id, 'public_code', v_request.public_code,
    'status', v_request.status, 'refund_amount_piastres', v_refund,
    'fully_returned', v_total_returned = v_total_ordered, 'idempotent', false);
  insert into public.marketplace_return_mutations (
    actor_user_id, return_request_id, operation, idempotency_key, request_hash, response
  ) values (v_actor, v_request.id, 'receive', p_idempotency_key, v_hash, v_response);
  insert into public.marketplace_order_events (order_id, actor_user_id, event_type, metadata)
  values (v_order.id, v_actor, 'return.received', jsonb_build_object(
    'return_request_id', v_request.id, 'refund_amount_piastres', v_refund));
  perform public.emit_marketplace_notification(
    (select customer.auth_user_id from public.marketplace_customers as customer
      where customer.id = v_request.customer_id),
    'return.received:' || v_request.id::text, 'return.received',
    'تم استلام المرتجع', 'اكتملت تسوية المرتجع ويمكنك مراجعة المبلغ من صفحة الطلب.',
    '/account/orders/' || v_order.id::text);
  return v_response;
end;
$$;

create or replace function public.list_my_marketplace_return_requests(
  p_order_id uuid, p_limit integer default 30, p_before timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_order public.marketplace_orders; v_authorized boolean; v_result jsonb;
begin
  if v_actor is null or p_limit not between 1 and 100 then raise exception 'invalid_return_query' using errcode = '22023'; end if;
  select * into v_order from public.marketplace_orders where id = p_order_id;
  select public.is_marketplace_admin() or public.can_fulfill_store(v_order.store_id) or exists (
    select 1 from public.marketplace_customers where id = v_order.customer_id and auth_user_id = v_actor and is_active
  ) into v_authorized;
  if v_order is null or not coalesce(v_authorized,false) then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  with page as (
    select request.* from public.marketplace_return_requests as request
    where request.order_id = v_order.id and (p_before is null or request.created_at < p_before)
    order by request.created_at desc, request.id desc limit p_limit
  )
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'public_code', page.public_code, 'reason_code', page.reason_code,
    'reason_details', page.reason_details, 'status', page.status,
    'review_notes', page.review_notes, 'refund_amount_piastres', page.refund_amount_piastres,
    'created_at', page.created_at, 'reviewed_at', page.reviewed_at, 'received_at', page.received_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
      'order_item_id', item.order_item_id, 'quantity', item.quantity,
      'eligibility_deadline', item.eligibility_deadline, 'gross_amount_piastres', item.gross_amount_piastres,
      'refund_amount_piastres', item.refund_amount_piastres, 'restock_quantity', item.restock_quantity
    ) order by item.order_item_id), '[]'::jsonb) from public.marketplace_return_request_items as item
      where item.return_request_id = page.id)
  ) order by page.created_at desc, page.id desc), '[]'::jsonb),
  'next_before', case when count(*) = p_limit then min(page.created_at) else null end)
  into v_result from page;
  return v_result;
end;
$$;

-- Extend the existing role-scoped order DTO without exposing return data to drivers.
alter function public.get_my_marketplace_order(uuid)
  rename to get_my_marketplace_order_base_175213;
revoke all on function public.get_my_marketplace_order_base_175213(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_marketplace_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_base jsonb; v_returns jsonb; v_order public.marketplace_orders; v_actor uuid := (select auth.uid()); v_can_return boolean;
begin
  v_base := public.get_my_marketplace_order_base_175213(p_order_id);
  select * into v_order from public.marketplace_orders where id = p_order_id;
  select public.is_marketplace_admin() or public.can_fulfill_store(v_order.store_id) or exists (
    select 1 from public.marketplace_customers where id = v_order.customer_id and auth_user_id = v_actor and is_active
  ) into v_can_return;
  if v_can_return then
    v_returns := public.list_my_marketplace_return_requests(p_order_id, 100, null);
  else v_returns := jsonb_build_object('items','[]'::jsonb,'next_before',null); end if;
  return v_base || jsonb_build_object(
    'return_requests', v_returns -> 'items',
    'return_eligibility', jsonb_build_object('delivered_at', v_order.delivered_at,
      'default_change_of_mind_deadline', v_order.delivered_at + interval '14 days',
      'default_defect_deadline', v_order.delivered_at + interval '30 days')
  ) || jsonb_build_object('items', (
    select coalesce(jsonb_agg(item_json || jsonb_build_object(
      'returned_quantity', coalesce((select sum(return_item.quantity)
        from public.marketplace_return_request_items return_item
        join public.marketplace_return_requests request on request.id = return_item.return_request_id
        where return_item.order_item_id = (item_json ->> 'id')::uuid
          and request.status in ('requested','approved','received')),0),
      'change_of_mind_deadline', v_order.delivered_at + make_interval(days => coalesce(policy.change_of_mind_days,14)),
      'defect_deadline', v_order.delivered_at + make_interval(days => coalesce(policy.defect_days,30)),
      'change_of_mind_allowed', coalesce(policy.allow_change_of_mind,true),
      'defect_return_allowed', coalesce(policy.allow_defect_return,true)
    ) order by item_ordinal), '[]'::jsonb)
    from jsonb_array_elements(v_base -> 'items') with ordinality as source(item_json,item_ordinal)
    left join public.order_items order_item on order_item.id = (item_json ->> 'id')::uuid
    left join public.products product on product.id = order_item.product_id
    left join public.marketplace_return_category_policies policy on policy.category_id = product.category_id
  ));
end;
$$;

-- Keep the legacy all-items status flow available only before the first
-- quantity-aware request; afterward callers must use the partial-return RPCs.
alter function public.set_my_marketplace_order_status(
  uuid, public.marketplace_order_status, text, public.egp_amount
) rename to set_my_marketplace_order_status_base_175213;
revoke all on function public.set_my_marketplace_order_status_base_175213(
  uuid, public.marketplace_order_status, text, public.egp_amount
) from public, anon, authenticated, service_role;
create or replace function public.set_my_marketplace_order_status(
  p_order_id uuid, p_next public.marketplace_order_status,
  p_reason text default null, p_collected_amount public.egp_amount default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_next in ('return_requested','return_approved','returned') and exists (
    select 1 from public.marketplace_return_requests where order_id = p_order_id
  ) then raise exception 'partial_return_flow_required' using errcode = '55000'; end if;
  return public.set_my_marketplace_order_status_base_175213(
    p_order_id, p_next, p_reason, p_collected_amount);
end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'marketplace_return_category_policies','marketplace_return_requests',
    'marketplace_return_request_items','marketplace_return_mutations',
    'marketplace_coupon_return_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

create policy marketplace_return_policies_read_authenticated
on public.marketplace_return_category_policies for select to authenticated using (true);
create policy marketplace_return_requests_read_participant
on public.marketplace_return_requests for select to authenticated using (
  public.is_marketplace_admin() or public.can_fulfill_store(store_id) or exists (
    select 1 from public.marketplace_customers customer
    where customer.id = marketplace_return_requests.customer_id
      and customer.auth_user_id = (select auth.uid()) and customer.is_active));
create policy marketplace_return_items_read_participant
on public.marketplace_return_request_items for select to authenticated using (exists (
  select 1 from public.marketplace_return_requests request
  where request.id = marketplace_return_request_items.return_request_id and (
    public.is_marketplace_admin() or public.can_fulfill_store(request.store_id) or exists (
      select 1 from public.marketplace_customers customer where customer.id = request.customer_id
        and customer.auth_user_id = (select auth.uid()) and customer.is_active))));

-- Operational rows include idempotency hashes and actor identifiers, so callers
-- consume the participant-scoped DTO instead of selecting the tables directly.
grant select on public.marketplace_return_category_policies to authenticated;

do $$ declare routine record; begin
  for routine in select namespace.nspname, procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) arguments
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = any(array[
      'prevent_marketplace_return_append_only_mutation','create_my_marketplace_return_request',
      'review_my_marketplace_return_request','receive_my_marketplace_return_request',
      'list_my_marketplace_return_requests','get_my_marketplace_order','set_my_marketplace_order_status'
    ])
  loop execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
    routine.nspname, routine.proname, routine.arguments); end loop;
end $$;

grant execute on function public.create_my_marketplace_return_request(uuid,text,text,jsonb,text) to authenticated, service_role;
grant execute on function public.review_my_marketplace_return_request(uuid,boolean,text,text) to authenticated, service_role;
grant execute on function public.receive_my_marketplace_return_request(uuid,jsonb,text,text) to authenticated, service_role;
grant execute on function public.list_my_marketplace_return_requests(uuid,integer,timestamptz) to authenticated, service_role;
grant execute on function public.get_my_marketplace_order(uuid) to authenticated, service_role;
grant execute on function public.set_my_marketplace_order_status(uuid,public.marketplace_order_status,text,public.egp_amount) to authenticated, service_role;

commit;
