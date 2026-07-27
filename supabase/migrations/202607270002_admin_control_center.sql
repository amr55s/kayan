-- Kayan Hub admin control center:
-- structured merchant change requests, public ratings, and complete moderation.

alter table public.feedback_requests
  add column if not exists source text not null default 'public',
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists rating smallint,
  add column if not exists proposed_title text,
  add column if not exists proposed_category text,
  add column if not exists proposed_whatsapp text,
  add column if not exists proposed_instapay_vfcash text,
  add column if not exists proposed_description text;

alter table public.feedback_requests
  drop constraint if exists feedback_requests_source_check,
  add constraint feedback_requests_source_check
    check (source in ('public', 'merchant')),
  drop constraint if exists feedback_requests_type_check,
  add constraint feedback_requests_type_check
    check (
      feedback_type in (
        'merchant_update',
        'menu_update',
        'phone_change',
        'report_issue',
        'general_suggestion',
        'rating'
      )
    ),
  drop constraint if exists feedback_requests_rating_check,
  add constraint feedback_requests_rating_check
    check (
      (feedback_type = 'rating' and rating between 1 and 5)
      or (feedback_type <> 'rating' and rating is null)
    );

create index if not exists feedback_requests_moderation_idx
  on public.feedback_requests (status, feedback_type, created_at desc);

create index if not exists feedback_requests_target_idx
  on public.feedback_requests (target_place_id, created_at desc)
  where target_place_id is not null;

-- Merchant edits must always pass through the moderation queue.
drop policy if exists "merchants update linked places" on public.places;

create or replace function public.apply_feedback_to_place(
  p_feedback_id uuid,
  p_image_mode text default 'append'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.feedback_requests;
  v_place public.places;
  v_images text[];
  v_is_merchant_update boolean;
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
  where id = p_feedback_id
    and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'request_already_processed';
  end if;
  if v_request.feedback_type in ('general_suggestion', 'rating') then
    raise exception 'feedback_not_applicable';
  end if;
  if v_request.target_place_id is null then
    raise exception 'target_place_required';
  end if;

  select *
  into v_place
  from public.places
  where id = v_request.target_place_id
  for update;

  if v_place is null then
    raise exception 'target_place_missing';
  end if;

  v_is_merchant_update := v_request.feedback_type = 'merchant_update';
  v_images := case
    when coalesce(cardinality(v_request.proposed_images), 0) > 0
      then v_request.proposed_images
    else coalesce(v_request.images, '{}'::text[])
  end;

  if not v_is_merchant_update
     and nullif(trim(coalesce(v_request.proposed_phone, '')), '') is null
     and coalesce(cardinality(v_images), 0) = 0 then
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

  update public.feedback_requests
  set status = 'resolved'
  where id = v_request.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, metadata
  )
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

revoke all on function public.apply_feedback_to_place(uuid, text) from public;
grant execute on function public.apply_feedback_to_place(uuid, text) to authenticated;
