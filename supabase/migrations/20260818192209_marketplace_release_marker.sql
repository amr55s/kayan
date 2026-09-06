-- Final advisor pass after executing the complete schema on a hosted project.
-- Keep this additive so already-applied staging/production databases converge.
begin;

-- Anonymous callers use bounded RPCs only. These broad legacy grants were
-- inherited from the original baseline and are unnecessary even with RLS.
revoke insert, update, delete, truncate, references, trigger on table
  public.audit_log,
  public.feedback_requests,
  public.merchants,
  public.notification_outbox,
  public.order_events,
  public.pending_requests,
  public.profiles
from anon;

-- Cache auth.uid() once per statement rather than once per candidate row.
drop policy if exists "profiles are private" on public.profiles;
create policy "profiles are private" on public.profiles for select
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "merchants see available drivers" on public.driver_profiles;
create policy "merchants see available drivers" on public.driver_profiles for select
using (
  public.is_current_merchant_for((
    select profile.merchant_id from public.profiles as profile
    where profile.id = (select auth.uid())
  ))
  and is_available and active_until > pg_catalog.now()
);

drop policy if exists "drivers see current eligible orders" on public.delivery_orders;
create policy "drivers see current eligible orders" on public.delivery_orders for select
using (
  public.is_current_active_driver() and (
    (status = 'open' and expires_at > pg_catalog.now()
      and (assigned_driver_id is null or assigned_driver_id = (select auth.uid())))
    or (assigned_driver_id = (select auth.uid())
      and status in ('assigned', 'picked_up', 'issue'))
  )
);

drop policy if exists "drivers read own active events" on public.order_events;
create policy "drivers read own active events" on public.order_events for select
using (exists (
  select 1 from public.delivery_orders as delivery_order
  where delivery_order.id = order_events.order_id
    and delivery_order.assigned_driver_id = (select auth.uid())
    and delivery_order.status in ('assigned', 'picked_up', 'issue')
));

drop policy if exists "requesters read own account request" on public.account_requests;
create policy "requesters read own account request" on public.account_requests
for select to authenticated using (auth_user_id = (select auth.uid()));

-- Cover every FK reported by the hosted Supabase advisor. Besides joins, these
-- indexes keep account deletion/anonymisation and referential checks bounded.
create index if not exists account_requests_reviewed_by_fk_idx on public.account_requests (reviewed_by);
create index if not exists admin_memberships_granted_by_fk_idx on public.admin_memberships (granted_by);
create index if not exists audit_log_actor_id_fk_idx on public.audit_log (actor_id);
create index if not exists delivery_orders_created_by_fk_idx on public.delivery_orders (created_by);
create index if not exists feedback_requests_submitted_by_fk_idx on public.feedback_requests (submitted_by);
create index if not exists inventory_movement_references_order_item_fk_idx on public.inventory_movement_references (order_item_id);
create index if not exists inventory_movements_actor_user_fk_idx on public.inventory_movements (actor_user_id);
create index if not exists legacy_media_uploads_merchant_fk_idx on public.legacy_media_uploads (merchant_id);
create index if not exists marketplace_admin_capability_user_fk_idx on public.marketplace_admin_capability_context (user_id);
create index if not exists marketplace_coupon_return_redemption_fk_idx on public.marketplace_coupon_return_adjustments (redemption_id);
create index if not exists marketplace_media_deletion_asset_fk_idx on public.marketplace_media_deletion_intents (asset_id);
create index if not exists marketplace_media_deletion_outbox_fk_idx on public.marketplace_media_deletion_intents (outbox_id);
create index if not exists marketplace_media_deletion_store_fk_idx on public.marketplace_media_deletion_intents (store_id);
create index if not exists marketplace_orders_branch_store_fk_idx on public.marketplace_orders (branch_id, store_id);
create index if not exists marketplace_push_jobs_recipient_fk_idx on public.marketplace_push_jobs (recipient_id);
create index if not exists marketplace_return_category_updated_by_fk_idx on public.marketplace_return_category_policies (updated_by);
create index if not exists marketplace_return_requests_received_by_fk_idx on public.marketplace_return_requests (received_by);
create index if not exists marketplace_return_requests_requested_by_fk_idx on public.marketplace_return_requests (requested_by);
create index if not exists marketplace_return_requests_reviewed_by_fk_idx on public.marketplace_return_requests (reviewed_by);
create index if not exists notification_outbox_order_fk_idx on public.notification_outbox (order_id);
create index if not exists notification_outbox_profile_fk_idx on public.notification_outbox (profile_id);
create index if not exists order_events_actor_fk_idx on public.order_events (actor_id);
create index if not exists place_upvote_receipts_place_fk_idx on public.place_upvote_receipts (place_id);
create index if not exists product_revision_apply_product_fk_idx on public.product_revision_apply_context (product_id);
create index if not exists product_revision_apply_revision_fk_idx on public.product_revision_apply_context (revision_id);
create index if not exists product_revisions_created_by_fk_idx on public.product_revisions (created_by);
create index if not exists product_revisions_reviewed_by_fk_idx on public.product_revisions (reviewed_by);
create index if not exists profiles_merchant_fk_idx on public.profiles (merchant_id);
create index if not exists push_subscriptions_profile_fk_idx on public.push_subscriptions (profile_id);
create index if not exists store_branches_created_by_fk_idx on public.store_branches (created_by);
create index if not exists store_coupons_created_by_fk_idx on public.store_coupons (created_by);
create index if not exists store_delivery_zones_branch_store_fk_idx on public.store_delivery_zones (selected_branch_id, store_id);
create index if not exists store_revision_apply_revision_fk_idx on public.store_revision_apply_context (revision_id);
create index if not exists store_revision_apply_store_fk_idx on public.store_revision_apply_context (store_id);
create index if not exists store_revisions_created_by_fk_idx on public.store_revisions (created_by);
create index if not exists store_revisions_reviewed_by_fk_idx on public.store_revisions (reviewed_by);

drop index if exists public.marketplace_delivery_driver_fk_idx;

insert into public.marketplace_runtime_settings (key, value, updated_by, updated_at)
values (
  'schema_version',
  pg_catalog.jsonb_build_object(
    'version', '20260818192209',
    'name', 'finalize_marketplace_advisor_hardening',
    'capabilities', pg_catalog.jsonb_build_array(
      'catalog_search_v2', 'admin_aal2', 'partial_returns',
      'reversible_media', 'granular_admin_roles', 'store_branches',
      'notifications', 'spaces_media', 'advisor_hardening'
    )
  ),
  null,
  pg_catalog.now()
)
on conflict (key) do update set
  value = excluded.value,
  updated_by = null,
  updated_at = excluded.updated_at;

create or replace function public.marketplace_release_ready()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version text;
  v_required_functions constant text[] := array[
    'list_marketplace_catalog_v2', 'is_marketplace_admin',
    'create_my_marketplace_return_request', 'undo_my_marketplace_media_deletion',
    'list_my_store_branches', 'register_my_push_subscription',
    'catalog_image_worker_configured'
  ];
  v_function_count integer;
  v_active_job_count integer;
begin
  select setting.value ->> 'version' into v_version
  from public.marketplace_runtime_settings as setting
  where setting.key = 'schema_version';

  if v_version is distinct from '20260818192209' then return false; end if;

  if pg_catalog.to_regclass('public.store_branches') is null
     or pg_catalog.to_regclass('public.marketplace_return_requests') is null
     or pg_catalog.to_regclass('public.marketplace_admin_memberships') is null
     or pg_catalog.to_regclass('public.app_notifications') is null
     or pg_catalog.to_regclass('public.product_revisions') is null
     or pg_catalog.to_regclass('public.store_revisions') is null
     or pg_catalog.to_regclass('public.marketplace_media_deletion_intents') is null then
    return false;
  end if;

  select pg_catalog.count(distinct procedure.proname)::integer
  into v_function_count
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = any (v_required_functions);
  if v_function_count <> pg_catalog.array_length(v_required_functions, 1) then return false; end if;

  select pg_catalog.count(*)::integer into v_active_job_count
  from cron.job as job
  where job.active and job.jobname = any (array[
    'dairtak-marketplace-db-maintenance',
    'dairtak-catalog-image-worker',
    'dairtak-marketplace-push-worker'
  ]);
  if v_active_job_count <> 3 then return false; end if;

  return public.catalog_image_worker_configured();
exception when others then
  return false;
end;
$$;

revoke all on function public.marketplace_release_ready() from public, anon, authenticated;
grant execute on function public.marketplace_release_ready() to service_role;

commit;
