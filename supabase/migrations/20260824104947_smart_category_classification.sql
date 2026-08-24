begin;

create or replace function public.normalize_marketplace_category_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.translate(
          pg_catalog.lower(coalesce(p_value, '')),
          'أإآٱىةؤئـ',
          'اااايهوي'
        ),
        '[ً-ٰٟ]',
        '',
        'g'
      ),
      '[^[:alnum:]ء-ي]+',
      ' ',
      'g'
    )
  );
$$;

create table public.product_category_aliases (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete cascade,
  phrase text not null check (char_length(pg_catalog.btrim(phrase)) between 2 and 120),
  normalized_phrase text generated always as (
    public.normalize_marketplace_category_text(phrase)
  ) stored,
  match_scope text not null default 'any'
    check (match_scope in ('any', 'name', 'brand', 'description')),
  weight smallint not null default 50 check (weight between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, normalized_phrase, match_scope)
);

create index product_category_aliases_lookup_idx
  on public.product_category_aliases (normalized_phrase, category_id)
  where is_active;
create index product_category_aliases_category_fk_idx
  on public.product_category_aliases (category_id);

create table public.product_category_proposals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  proposed_name text not null check (char_length(pg_catalog.btrim(proposed_name)) between 2 and 120),
  normalized_name text not null check (char_length(normalized_name) between 2 and 120),
  example_product_name text not null check (char_length(pg_catalog.btrim(example_product_name)) between 2 and 200),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'merged', 'rejected')),
  resolved_category_id uuid references public.product_categories(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewer_id is null and reviewed_at is null)
    or (status <> 'pending' and reviewer_id is not null and reviewed_at is not null)
  )
);

create unique index product_category_proposals_pending_store_name_idx
  on public.product_category_proposals (store_id, normalized_name)
  where status = 'pending';
create index product_category_proposals_review_queue_idx
  on public.product_category_proposals (status, created_at, id);
create index product_category_proposals_store_fk_idx on public.product_category_proposals (store_id);
create index product_category_proposals_product_fk_idx on public.product_category_proposals (product_id);
create index product_category_proposals_proposed_by_fk_idx on public.product_category_proposals (proposed_by);
create index product_category_proposals_resolved_category_fk_idx on public.product_category_proposals (resolved_category_id);
create index product_category_proposals_reviewer_fk_idx on public.product_category_proposals (reviewer_id);

create table public.product_category_classification_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  algorithm_version text not null check (algorithm_version ~ '^category-v[0-9]+$'),
  predicted_category_id uuid references public.product_categories(id) on delete set null,
  selected_category_id uuid references public.product_categories(id) on delete set null,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  signals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(signals) = 'array' and jsonb_array_length(signals) <= 12),
  outcome text not null
    check (outcome in ('accepted', 'overridden', 'unclassified', 'proposed')),
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create index product_category_classification_events_product_idx
  on public.product_category_classification_events (product_id, created_at desc);
create index product_category_classification_events_store_fk_idx on public.product_category_classification_events (store_id);
create index product_category_classification_events_actor_fk_idx on public.product_category_classification_events (actor_id);
create index product_category_classification_events_predicted_fk_idx on public.product_category_classification_events (predicted_category_id);
create index product_category_classification_events_selected_fk_idx on public.product_category_classification_events (selected_category_id);

insert into public.product_category_aliases (category_id, phrase, match_scope, weight)
select category.id, category.name_ar, 'any', 100
from public.product_categories as category
where category.is_active
on conflict (category_id, normalized_phrase, match_scope) do nothing;

insert into public.product_category_aliases (category_id, phrase, match_scope, weight)
select category.id, category.name_en, 'any', 90
from public.product_categories as category
where category.is_active and category.name_en is not null
on conflict (category_id, normalized_phrase, match_scope) do nothing;

alter table public.product_category_aliases enable row level security;
alter table public.product_category_proposals enable row level security;
alter table public.product_category_classification_events enable row level security;

create policy product_category_aliases_read_active
on public.product_category_aliases
for select to authenticated
using (
  is_active and exists (
    select 1
    from public.product_categories as category
    where category.id = product_category_aliases.category_id
      and category.is_active
  )
);

revoke all on table public.product_category_aliases from anon, authenticated;
revoke all on table public.product_category_proposals from anon, authenticated;
revoke all on table public.product_category_classification_events from anon, authenticated;
grant select on table public.product_category_aliases to authenticated;

create or replace function public.record_my_product_category_classification(
  p_product_id uuid,
  p_algorithm_version text,
  p_idempotency_key uuid,
  p_predicted_category_id uuid,
  p_selected_category_id uuid,
  p_confidence numeric,
  p_signals jsonb,
  p_proposed_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_product public.products%rowtype;
  v_normalized_proposal text;
  v_outcome text;
  v_proposal_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null
    or p_algorithm_version !~ '^category-v[0-9]+$'
    or p_confidence is not null and (p_confidence < 0 or p_confidence > 1)
    or p_signals is null or jsonb_typeof(p_signals) <> 'array'
    or jsonb_array_length(p_signals) > 12
    or pg_catalog.length(p_signals::text) > 4000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select product.* into v_product
  from public.products as product
  where product.id = p_product_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.can_catalog_store(v_product.store_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if p_predicted_category_id is not null and not exists (
    select 1 from public.product_categories as category
    where category.id = p_predicted_category_id and category.is_active
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_selected_category_id is not null and not exists (
    select 1 from public.product_categories as category
    where category.id = p_selected_category_id and category.is_active
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  v_normalized_proposal := public.normalize_marketplace_category_text(p_proposed_name);
  if p_proposed_name is not null and (
    char_length(pg_catalog.btrim(p_proposed_name)) not between 2 and 120
    or char_length(v_normalized_proposal) not between 2 and 120
  ) then
    raise exception 'invalid_proposal' using errcode = '22023';
  end if;

  if p_proposed_name is not null then
    if not exists (
      select 1 from public.product_category_proposals as existing
      where existing.store_id = v_product.store_id
        and existing.normalized_name = v_normalized_proposal
        and existing.status = 'pending'
    ) and (
      select count(*)
      from public.product_category_proposals as proposal
      where proposal.proposed_by = v_actor_id
        and proposal.created_at >= now() - interval '1 hour'
    ) >= 10 then
      raise exception 'rate_limit_exceeded' using errcode = 'P0001';
    end if;
    insert into public.product_category_proposals (
      store_id, product_id, proposed_by, proposed_name,
      normalized_name, example_product_name
    ) values (
      v_product.store_id, v_product.id, v_actor_id, pg_catalog.btrim(p_proposed_name),
      v_normalized_proposal, v_product.name
    )
    on conflict (store_id, normalized_name) where status = 'pending'
    do update set
      product_id = excluded.product_id,
      proposed_by = excluded.proposed_by,
      example_product_name = excluded.example_product_name,
      updated_at = now()
    returning id into v_proposal_id;
  end if;

  v_outcome := case
    when p_proposed_name is not null then 'proposed'
    when p_selected_category_id is null then 'unclassified'
    when p_predicted_category_id = p_selected_category_id then 'accepted'
    else 'overridden'
  end;

  insert into public.product_category_classification_events (
    store_id, product_id, actor_id, idempotency_key, algorithm_version,
    predicted_category_id, selected_category_id, confidence, signals, outcome
  ) values (
    v_product.store_id, v_product.id, v_actor_id, p_idempotency_key, p_algorithm_version,
    p_predicted_category_id, p_selected_category_id, p_confidence,
    p_signals, v_outcome
  ) on conflict (actor_id, idempotency_key) do nothing;

  return jsonb_build_object(
    'outcome', v_outcome,
    'proposal_id', v_proposal_id
  );
end;
$$;

create or replace function public.list_pending_product_category_proposals(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.activate_marketplace_admin_capability(
    array['catalog_reviewer', 'super_admin']::public.marketplace_admin_role[]
  );
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', proposal.id,
    'store_id', proposal.store_id,
    'store_name', store.name,
    'product_id', proposal.product_id,
    'product_name', proposal.example_product_name,
    'proposed_name', proposal.proposed_name,
    'created_at', proposal.created_at
  ) order by proposal.created_at, proposal.id), '[]'::jsonb)
  into v_result
  from (
    select queued.*
    from public.product_category_proposals as queued
    where queued.status = 'pending'
    order by queued.created_at, queued.id
    limit p_limit
  ) as proposal
  join public.stores as store on store.id = proposal.store_id;
  return v_result;
end;
$$;

create or replace function public.review_product_category_proposal_as_admin(
  p_proposal_id uuid,
  p_decision text,
  p_resolved_category_id uuid default null,
  p_new_slug text default null,
  p_new_name_en text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_proposal public.product_category_proposals%rowtype;
  v_category_id uuid;
begin
  perform public.activate_marketplace_admin_capability(
    array['catalog_reviewer', 'super_admin']::public.marketplace_admin_role[]
  );
  if p_decision not in ('approve_new', 'merge', 'reject')
    or p_note is not null and char_length(p_note) > 1000
    or p_new_name_en is not null and char_length(pg_catalog.btrim(p_new_name_en)) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select proposal.* into v_proposal
  from public.product_category_proposals as proposal
  where proposal.id = p_proposal_id
  for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_proposal.status <> 'pending' then
    return jsonb_build_object(
      'id', v_proposal.id,
      'status', v_proposal.status,
      'category_id', v_proposal.resolved_category_id,
      'idempotent', true
    );
  end if;

  if p_decision = 'merge' then
    select category.id into v_category_id
    from public.product_categories as category
    where category.id = p_resolved_category_id and category.is_active;
    if not found then raise exception 'invalid_category' using errcode = '22023'; end if;
  elsif p_decision = 'approve_new' then
    if p_new_slug is null or p_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(p_new_slug) > 120 then
      raise exception 'invalid_slug' using errcode = '22023';
    end if;
    insert into public.product_categories (slug, name_ar, name_en, sort_order, is_active)
    values (
      p_new_slug,
      v_proposal.proposed_name,
      nullif(pg_catalog.btrim(p_new_name_en), ''),
      (select coalesce(max(category.sort_order), 0) + 10 from public.product_categories as category),
      true
    ) returning id into v_category_id;
  end if;

  if p_decision in ('merge', 'approve_new') then
    insert into public.product_category_aliases (
      category_id, phrase, match_scope, weight, is_active
    ) values (
      v_category_id, v_proposal.proposed_name, 'any',
      case when p_decision = 'approve_new' then 100 else 80 end, true
    ) on conflict (category_id, normalized_phrase, match_scope)
      do update set is_active = true, weight = greatest(product_category_aliases.weight, excluded.weight), updated_at = now();
  end if;

  update public.product_category_proposals set
    status = case p_decision when 'approve_new' then 'approved' when 'merge' then 'merged' else 'rejected' end,
    resolved_category_id = v_category_id,
    reviewer_id = v_actor_id,
    review_note = nullif(pg_catalog.btrim(p_note), ''),
    reviewed_at = now(),
    updated_at = now()
  where id = v_proposal.id;

  return jsonb_build_object(
    'id', v_proposal.id,
    'status', case p_decision when 'approve_new' then 'approved' when 'merge' then 'merged' else 'rejected' end,
    'category_id', v_category_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.normalize_marketplace_category_text(text) from public;
revoke all on function public.record_my_product_category_classification(
  uuid, text, uuid, uuid, uuid, numeric, jsonb, text
) from public;
grant execute on function public.record_my_product_category_classification(
  uuid, text, uuid, uuid, uuid, numeric, jsonb, text
) to authenticated;
revoke all on function public.list_pending_product_category_proposals(integer) from public;
revoke all on function public.review_product_category_proposal_as_admin(
  uuid, text, uuid, text, text, text
) from public;
grant execute on function public.list_pending_product_category_proposals(integer) to authenticated;
grant execute on function public.review_product_category_proposal_as_admin(
  uuid, text, uuid, text, text, text
) to authenticated;

commit;
