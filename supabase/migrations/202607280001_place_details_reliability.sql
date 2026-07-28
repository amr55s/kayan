-- Place details, anonymous client diagnostics, upload throttling, and
-- least-privilege reconciliation. Apply before deploying the matching app code.

-- ---------------------------------------------------------------------------
-- Optional place-detail fields (additive and safe for existing rows)
-- ---------------------------------------------------------------------------

alter table public.places
  add column if not exists whatsapp_group_url text,
  add column if not exists telegram_url text,
  add column if not exists address text,
  add column if not exists map_url text;

alter table public.pending_requests
  add column if not exists whatsapp_group_url text,
  add column if not exists telegram_url text,
  add column if not exists address text,
  add column if not exists map_url text;

alter table public.account_requests
  add column if not exists place_whatsapp_group_url text,
  add column if not exists place_telegram_url text,
  add column if not exists place_address text,
  add column if not exists place_map_url text;

alter table public.feedback_requests
  add column if not exists proposed_whatsapp_group_url text,
  add column if not exists proposed_telegram_url text,
  add column if not exists proposed_address text,
  add column if not exists proposed_map_url text;

alter table public.feedback_requests
  drop constraint if exists feedback_requests_type_check,
  add constraint feedback_requests_type_check
    check (
      feedback_type in (
        'merchant_update',
        'menu_update',
        'phone_change',
        'details_update',
        'report_issue',
        'general_suggestion',
        'rating'
      )
    );

alter table public.places
  drop constraint if exists places_address_length_check,
  add constraint places_address_length_check
    check (address is null or char_length(address) <= 500),
  drop constraint if exists places_whatsapp_group_url_check,
  add constraint places_whatsapp_group_url_check
    check (
      whatsapp_group_url is null
      or whatsapp_group_url ~* '^https://(chat\.whatsapp\.com/[^[:space:]]+|(www\.)?whatsapp\.com/channel/[^[:space:]]+)$'
    ),
  drop constraint if exists places_telegram_url_check,
  add constraint places_telegram_url_check
    check (
      telegram_url is null
      or telegram_url ~* '^https://(t\.me|telegram\.me)/[^[:space:]]+$'
    ),
  drop constraint if exists places_map_url_check,
  add constraint places_map_url_check
    check (
      map_url is null
      or map_url ~* '^https://((www\.)?google\.com/maps([/?].*)?|maps\.google\.com/.*|maps\.app\.goo\.gl/.*|goo\.gl/maps/.*|maps\.apple\.com/.*|(www\.)?openstreetmap\.org/.*)$'
    );

-- Apply optional place details in the same account-approval transaction without
-- rewriting the existing account provisioning function.
create or replace function public.apply_account_request_place_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending'
     and new.status = 'approved'
     and new.kind = 'merchant'
     and new.place_mode = 'new' then
    update public.places as place
    set whatsapp_group_url = nullif(trim(coalesce(new.place_whatsapp_group_url, '')), ''),
        telegram_url = nullif(trim(coalesce(new.place_telegram_url, '')), ''),
        address = nullif(trim(coalesce(new.place_address, '')), ''),
        map_url = nullif(trim(coalesce(new.place_map_url, '')), '')
    from public.merchant_branches as branch
    join public.profiles as profile
      on profile.merchant_id = branch.merchant_id
    where profile.id = new.auth_user_id
      and branch.place_id = place.id;
  end if;
  return new;
end;
$$;

drop trigger if exists account_request_apply_place_details
  on public.account_requests;
create trigger account_request_apply_place_details
after update of status on public.account_requests
for each row execute function public.apply_account_request_place_details();
revoke all on function public.apply_account_request_place_details()
  from public, anon, authenticated;

-- Moderated public/merchant updates now include social and location details.
create or replace function public.apply_feedback_to_place(
  p_feedback_id uuid,
  p_image_mode text default 'append'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.feedback_requests;
  v_place public.places;
  v_images text[];
  v_is_merchant_update boolean;
  v_is_details_update boolean;
begin
  if not public.is_admin() then
    raise exception 'admin_access_required';
  end if;
  if p_image_mode not in ('append', 'replace') then
    raise exception 'invalid_image_mode';
  end if;

  select *
  into v_request
  from public.feedback_requests
  where id = p_feedback_id and status = 'pending'
  for update;

  if v_request is null then raise exception 'request_already_processed'; end if;
  if v_request.feedback_type in ('general_suggestion', 'rating') then
    raise exception 'feedback_not_applicable';
  end if;
  if v_request.target_place_id is null then raise exception 'target_place_required'; end if;

  select *
  into v_place
  from public.places
  where id = v_request.target_place_id
  for update;
  if v_place is null then raise exception 'target_place_missing'; end if;

  v_is_merchant_update := v_request.feedback_type = 'merchant_update';
  v_is_details_update := v_request.feedback_type = 'details_update';
  v_images := case
    when coalesce(cardinality(v_request.proposed_images), 0) > 0
      then v_request.proposed_images
    else coalesce(v_request.images, '{}'::text[])
  end;

  if not v_is_merchant_update
     and nullif(trim(coalesce(v_request.proposed_phone, '')), '') is null
     and coalesce(cardinality(v_images), 0) = 0
     and nullif(trim(coalesce(v_request.proposed_whatsapp_group_url, '')), '') is null
     and nullif(trim(coalesce(v_request.proposed_telegram_url, '')), '') is null
     and nullif(trim(coalesce(v_request.proposed_address, '')), '') is null
     and nullif(trim(coalesce(v_request.proposed_map_url, '')), '') is null then
    raise exception 'no_applicable_changes';
  end if;
  if nullif(trim(coalesce(v_request.proposed_phone, '')), '') is not null
     and trim(v_request.proposed_phone) !~ '^01[0125][0-9]{8}$' then
    raise exception 'invalid_phone';
  end if;
  if p_image_mode = 'replace'
     and coalesce(cardinality(v_images), 0) = 0
     and not v_is_merchant_update then
    raise exception 'replacement_images_required';
  end if;

  update public.places
  set title = case
        when v_is_merchant_update
          then coalesce(nullif(trim(v_request.proposed_title), ''), v_place.title)
        else v_place.title
      end,
      category = case
        when v_is_merchant_update
          then coalesce(nullif(trim(v_request.proposed_category), ''), v_place.category)
        else v_place.category
      end,
      phone = coalesce(nullif(trim(v_request.proposed_phone), ''), v_place.phone),
      whatsapp = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_whatsapp, '')), '')
        else v_place.whatsapp
      end,
      instapay_vfcash = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_instapay_vfcash, '')), '')
        else v_place.instapay_vfcash
      end,
      description = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_description, '')), '')
        else v_place.description
      end,
      whatsapp_group_url = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_whatsapp_group_url, '')), '')
        when v_is_details_update
          then coalesce(nullif(trim(v_request.proposed_whatsapp_group_url), ''), v_place.whatsapp_group_url)
        else v_place.whatsapp_group_url
      end,
      telegram_url = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_telegram_url, '')), '')
        when v_is_details_update
          then coalesce(nullif(trim(v_request.proposed_telegram_url), ''), v_place.telegram_url)
        else v_place.telegram_url
      end,
      address = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_address, '')), '')
        when v_is_details_update
          then coalesce(nullif(trim(v_request.proposed_address), ''), v_place.address)
        else v_place.address
      end,
      map_url = case
        when v_is_merchant_update
          then nullif(trim(coalesce(v_request.proposed_map_url, '')), '')
        when v_is_details_update
          then coalesce(nullif(trim(v_request.proposed_map_url), ''), v_place.map_url)
        else v_place.map_url
      end,
      images = case
        when v_is_merchant_update and p_image_mode = 'replace' then v_images
        when coalesce(cardinality(v_images), 0) = 0 then v_place.images
        when p_image_mode = 'replace' then v_images
        else array(
          select distinct image_url
          from unnest(coalesce(v_place.images, '{}'::text[]) || v_images) as image_url
          where image_url is not null and image_url <> ''
        )
      end
  where id = v_place.id;

  update public.feedback_requests set status = 'resolved' where id = v_request.id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'feedback_applied',
    'place',
    v_place.id::text,
    jsonb_build_object(
      'feedback_id', v_request.id,
      'feedback_type', v_request.feedback_type,
      'source', v_request.source,
      'image_mode', p_image_mode
    )
  );
  return v_place.id;
end;
$$;

create or replace function public.approve_pending_place(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.pending_requests;
  v_place_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_access_required'; end if;
  select * into v_request
  from public.pending_requests
  where id = p_request_id and status = 'pending'
  for update;
  if v_request is null then raise exception 'request_already_processed'; end if;

  insert into public.places (
    title, category, phone, whatsapp, instapay_vfcash, description,
    whatsapp_group_url, telegram_url, address, map_url, images, is_featured
  )
  values (
    trim(v_request.title),
    v_request.category,
    trim(v_request.phone),
    nullif(trim(v_request.whatsapp), ''),
    nullif(trim(v_request.instapay_vfcash), ''),
    nullif(trim(v_request.description), ''),
    nullif(trim(v_request.whatsapp_group_url), ''),
    nullif(trim(v_request.telegram_url), ''),
    nullif(trim(v_request.address), ''),
    nullif(trim(v_request.map_url), ''),
    coalesce(v_request.images, '{}'::text[]),
    false
  )
  returning id into v_place_id;

  update public.pending_requests set status = 'approved' where id = v_request.id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'pending_place_approved',
    'place',
    v_place_id::text,
    jsonb_build_object('request_id', v_request.id)
  );
  return v_place_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anonymous, sanitized client error aggregation
-- ---------------------------------------------------------------------------

create table if not exists public.client_error_reports (
  id bigint generated always as identity primary key,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{16,64}$'),
  event_type text not null check (event_type in ('window_error', 'unhandled_rejection', 'react_boundary')),
  route text not null check (route ~ '^/' and char_length(route) <= 160),
  browser_family text not null check (char_length(browser_family) between 2 and 24),
  os_family text not null check (char_length(os_family) between 2 and 24),
  release text not null check (char_length(release) between 1 and 64),
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (fingerprint, event_type, route, browser_family, os_family, release)
);

create index if not exists client_error_reports_last_seen_idx
  on public.client_error_reports (last_seen_at desc);

create table if not exists public.client_error_rate_limits (
  request_key text primary key check (request_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.client_error_reports enable row level security;
alter table public.client_error_rate_limits enable row level security;
revoke all on public.client_error_reports from anon, authenticated;
revoke all on public.client_error_rate_limits from anon, authenticated;
grant select on public.client_error_reports to service_role;

create or replace function public.record_client_error(
  p_request_key text,
  p_fingerprint text,
  p_event_type text,
  p_route text,
  p_browser_family text,
  p_os_family text,
  p_release text,
  p_limit integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_request_key !~ '^[a-f0-9]{64}$'
     or p_fingerprint !~ '^[a-f0-9]{16,64}$'
     or p_limit not between 1 and 50 then
    raise exception 'invalid_client_error_input';
  end if;

  delete from public.client_error_rate_limits
  where updated_at < now() - interval '2 hours';
  delete from public.client_error_reports
  where last_seen_at < now() - interval '30 days';

  insert into public.client_error_rate_limits (
    request_key, window_started_at, attempts, updated_at
  )
  values (p_request_key, now(), 1, now())
  on conflict (request_key) do update
  set window_started_at = case
        when client_error_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else client_error_rate_limits.window_started_at
      end,
      attempts = case
        when client_error_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else client_error_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;
  if v_attempts > p_limit then return false; end if;

  insert into public.client_error_reports (
    fingerprint, event_type, route, browser_family, os_family, release
  )
  values (
    p_fingerprint,
    p_event_type,
    left(p_route, 160),
    left(p_browser_family, 24),
    left(p_os_family, 24),
    left(p_release, 64)
  )
  on conflict (fingerprint, event_type, route, browser_family, os_family, release)
  do update set
    occurrences = client_error_reports.occurrences + 1,
    last_seen_at = now();
  return true;
end;
$$;

revoke all on function public.record_client_error(
  text, text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.record_client_error(
  text, text, text, text, text, text, text, integer
) to service_role;

-- ---------------------------------------------------------------------------
-- Upload throttling and storage policy tightening
-- ---------------------------------------------------------------------------

create table if not exists public.listing_upload_rate_limits (
  request_key text primary key check (request_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);
alter table public.listing_upload_rate_limits enable row level security;
revoke all on public.listing_upload_rate_limits from anon, authenticated;

create or replace function public.consume_listing_upload_rate_limit(
  p_request_key text,
  p_limit integer default 12
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_request_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 50 then
    raise exception 'invalid_rate_limit_input';
  end if;
  delete from public.listing_upload_rate_limits
  where updated_at < now() - interval '2 hours';
  insert into public.listing_upload_rate_limits (
    request_key, window_started_at, attempts, updated_at
  )
  values (p_request_key, now(), 1, now())
  on conflict (request_key) do update
  set window_started_at = case
        when listing_upload_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else listing_upload_rate_limits.window_started_at
      end,
      attempts = case
        when listing_upload_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else listing_upload_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_listing_upload_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_listing_upload_rate_limit(text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Privacy-preserving, aggregated product analytics
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_daily_events (
  event_date date not null default current_date,
  event_name text not null check (
    event_name in (
      'page_view',
      'place_open',
      'phone_click',
      'whatsapp_click',
      'group_click',
      'telegram_click',
      'map_click',
      'share_click',
      'favorite_click',
      'upvote_click',
      'search_use',
      'category_select',
      'join_open',
      'feedback_open',
      'add_listing_open',
      'driver_signup_open',
      'support_click'
    )
  ),
  target_type text not null check (target_type in ('site', 'place', 'category', 'feature')),
  target_key text not null default '' check (char_length(target_key) <= 64),
  route text not null check (route ~ '^/[a-zA-Z0-9/_-]*$' and char_length(route) <= 120),
  events bigint not null default 1 check (events > 0),
  updated_at timestamptz not null default now(),
  primary key (event_date, event_name, target_type, target_key, route)
);

create table if not exists public.analytics_daily_visitors (
  event_date date not null default current_date,
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  last_seen_at timestamptz not null default now(),
  primary key (event_date, visitor_hash)
);

create table if not exists public.analytics_rate_limits (
  visitor_hash text primary key check (visitor_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_daily_events_date_idx
  on public.analytics_daily_events (event_date desc);
create index if not exists analytics_daily_visitors_date_idx
  on public.analytics_daily_visitors (event_date desc);

alter table public.analytics_daily_events enable row level security;
alter table public.analytics_daily_visitors enable row level security;
alter table public.analytics_rate_limits enable row level security;
revoke all on public.analytics_daily_events from public, anon, authenticated;
revoke all on public.analytics_daily_visitors from public, anon, authenticated;
revoke all on public.analytics_rate_limits from public, anon, authenticated;
grant select on public.analytics_daily_events to service_role;
grant select on public.analytics_daily_visitors to service_role;

create or replace function public.record_site_analytics(
  p_visitor_hash text,
  p_event_name text,
  p_target_type text,
  p_target_key text,
  p_route text,
  p_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_visitor_hash !~ '^[a-f0-9]{64}$'
     or p_event_name not in (
       'page_view', 'place_open', 'phone_click', 'whatsapp_click',
       'group_click', 'telegram_click', 'map_click', 'share_click',
       'favorite_click', 'upvote_click', 'search_use', 'category_select',
       'join_open', 'feedback_open', 'add_listing_open',
       'driver_signup_open', 'support_click'
     )
     or p_target_type not in ('site', 'place', 'category', 'feature')
     or char_length(p_target_key) > 64
     or p_route !~ '^/[a-zA-Z0-9/_-]*$'
     or char_length(p_route) > 120
     or p_limit not between 1 and 500 then
    raise exception 'invalid_analytics_input';
  end if;

  insert into public.analytics_rate_limits (
    visitor_hash, window_started_at, attempts, updated_at
  )
  values (p_visitor_hash, now(), 1, now())
  on conflict (visitor_hash) do update
  set window_started_at = case
        when analytics_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else analytics_rate_limits.window_started_at
      end,
      attempts = case
        when analytics_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else analytics_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;
  if v_attempts > p_limit then return false; end if;

  insert into public.analytics_daily_visitors (event_date, visitor_hash, last_seen_at)
  values (current_date, p_visitor_hash, now())
  on conflict (event_date, visitor_hash) do update
  set last_seen_at = now();

  insert into public.analytics_daily_events (
    event_date, event_name, target_type, target_key, route, events, updated_at
  )
  values (
    current_date,
    p_event_name,
    p_target_type,
    p_target_key,
    p_route,
    1,
    now()
  )
  on conflict (event_date, event_name, target_type, target_key, route)
  do update set
    events = analytics_daily_events.events + 1,
    updated_at = now();

  if pg_catalog.random() < 0.01 then
    delete from public.analytics_rate_limits
    where updated_at < now() - interval '2 hours';
    delete from public.analytics_daily_visitors
    where event_date < current_date - 30;
    delete from public.analytics_daily_events
    where event_date < current_date - 180;
  end if;
  return true;
end;
$$;

revoke all on function public.record_site_analytics(
  text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.record_site_analytics(
  text, text, text, text, text, integer
) to service_role;

-- ---------------------------------------------------------------------------
-- Server-only public submissions and atomic place recommendations
-- ---------------------------------------------------------------------------

create table if not exists public.public_submission_rate_limits (
  request_key text primary key check (request_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.place_upvote_receipts (
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_key, place_id)
);

alter table public.public_submission_rate_limits enable row level security;
alter table public.place_upvote_receipts enable row level security;
revoke all on public.public_submission_rate_limits from public, anon, authenticated;
revoke all on public.place_upvote_receipts from public, anon, authenticated;

create or replace function public.consume_public_submission_rate_limit(
  p_request_key text,
  p_limit integer default 12
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_request_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 50 then
    raise exception 'invalid_rate_limit_input';
  end if;
  delete from public.public_submission_rate_limits
  where updated_at < now() - interval '2 hours';
  insert into public.public_submission_rate_limits (
    request_key, window_started_at, attempts, updated_at
  )
  values (p_request_key, now(), 1, now())
  on conflict (request_key) do update
  set window_started_at = case
        when public_submission_rate_limits.window_started_at <= now() - interval '1 hour'
          then now()
        else public_submission_rate_limits.window_started_at
      end,
      attempts = case
        when public_submission_rate_limits.window_started_at <= now() - interval '1 hour'
          then 1
        else public_submission_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

create or replace function public.record_place_upvote(
  p_request_key text,
  p_place_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_request_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid_upvote_input'; end if;

  delete from public.place_upvote_receipts
  where created_at < now() - interval '30 days';

  insert into public.place_upvote_receipts (request_key, place_id)
  values (p_request_key, p_place_id)
  on conflict (request_key, place_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  update public.places
  set recommend_count = coalesce(recommend_count, 0) + 1
  where id = p_place_id;
  if not found then raise exception 'place_not_found'; end if;
  return true;
end;
$$;

revoke all on function public.consume_public_submission_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_submission_rate_limit(text, integer)
  to service_role;
revoke all on function public.record_place_upvote(text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_place_upvote(text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Function-path fixes that do not remove existing application privileges.
-- Legacy EXECUTE and Storage privileges are withdrawn by the post-deploy SQL
-- only after the matching server-only application code is live.
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid() and role = 'admin' and is_active
    );
$$;

create or replace function public.get_admin_metrics()
returns table (
  total_places bigint,
  active_drivers bigint,
  pending_additions bigint,
  pending_feedbacks bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.places),
    (select count(*) from public.drivers where is_active),
    (select count(*) from public.pending_requests where status = 'pending'),
    (select count(*) from public.feedback_requests where status = 'pending');
$$;

alter function public.list_public_legacy_drivers() set search_path = '';
alter function public.list_public_registered_drivers() set search_path = '';
