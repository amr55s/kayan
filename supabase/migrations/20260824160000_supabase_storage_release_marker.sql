-- Keep marketplace media inside the existing Supabase project when an external
-- S3 provider would require billing. S3 access keys remain server-only and the
-- private/public trust boundary is represented by distinct buckets.
begin;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('marketplace-media-private', 'marketplace-media-private', false, 26214400),
  ('marketplace-media-public', 'marketplace-media-public', true, 26214400)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

insert into public.marketplace_runtime_settings (key, value, updated_by, updated_at)
values (
  'schema_version',
  pg_catalog.jsonb_build_object(
    'version', '20260824160000',
    'name', 'supabase_storage_release_marker',
    'capabilities', pg_catalog.jsonb_build_array(
      'catalog_search_v2', 'admin_aal2', 'partial_returns',
      'reversible_media', 'granular_admin_roles', 'store_branches',
      'notifications', 's3_compatible_media', 'advisor_hardening',
      'smart_category_classification', 'reviewed_category_proposals',
      'service_role_worker_vault_configuration', 'accurate_release_probe',
      'separate_public_private_storage_buckets'
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
    'catalog_image_worker_configured', 'record_my_product_category_classification',
    'configure_marketplace_worker_vault'
  ];
  v_function_count integer;
  v_active_job_count integer;
  v_bucket_count integer;
begin
  select setting.value ->> 'version' into v_version
  from public.marketplace_runtime_settings as setting
  where setting.key = 'schema_version';
  if v_version is distinct from '20260824160000' then return false; end if;

  if pg_catalog.to_regclass('public.store_branches') is null
     or pg_catalog.to_regclass('public.marketplace_return_requests') is null
     or pg_catalog.to_regclass('public.admin_memberships') is null
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

  select pg_catalog.count(*)::integer into v_bucket_count
  from storage.buckets as bucket
  where (bucket.id = 'marketplace-media-private' and not bucket.public)
     or (bucket.id = 'marketplace-media-public' and bucket.public);
  if v_bucket_count <> 2 then return false; end if;

  return public.catalog_image_worker_configured();
exception when others then
  return false;
end;
$$;

revoke all on function public.marketplace_release_ready() from public, anon, authenticated;
grant execute on function public.marketplace_release_ready() to service_role;

commit;
