-- Release marker for the additive, reviewable category-classification rollout.
begin;

insert into public.marketplace_runtime_settings (key, value, updated_by, updated_at)
values (
  'schema_version',
  pg_catalog.jsonb_build_object(
    'version', '20260824105433',
    'name', 'smart_category_classification',
    'capabilities', pg_catalog.jsonb_build_array(
      'catalog_search_v2', 'admin_aal2', 'partial_returns',
      'reversible_media', 'granular_admin_roles', 'store_branches',
      'notifications', 'spaces_media', 'advisor_hardening',
      'smart_category_classification', 'reviewed_category_proposals'
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
    'catalog_image_worker_configured', 'record_my_product_category_classification'
  ];
  v_function_count integer;
  v_active_job_count integer;
begin
  select setting.value ->> 'version' into v_version
  from public.marketplace_runtime_settings as setting
  where setting.key = 'schema_version';

  if v_version is distinct from '20260824105433' then return false; end if;

  if pg_catalog.to_regclass('public.store_branches') is null
     or pg_catalog.to_regclass('public.marketplace_return_requests') is null
     or pg_catalog.to_regclass('public.marketplace_admin_memberships') is null
     or pg_catalog.to_regclass('public.app_notifications') is null
     or pg_catalog.to_regclass('public.product_revisions') is null
     or pg_catalog.to_regclass('public.store_revisions') is null
     or pg_catalog.to_regclass('public.marketplace_media_deletion_intents') is null
     or pg_catalog.to_regclass('public.product_category_aliases') is null
     or pg_catalog.to_regclass('public.product_category_proposals') is null
     or pg_catalog.to_regclass('public.product_category_classification_events') is null then
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
