-- Invoke the bounded Vercel image worker from hosted Supabase. The endpoint
-- and bearer token are deliberately provisioned in Vault after a Preview URL
-- exists; until then the scheduled function is a safe no-op.
begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_catalog_image_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
  v_request_id bigint;
begin
  select secret.decrypted_secret
  into v_base_url
  from vault.decrypted_secrets as secret
  where secret.name = 'dairtak_worker_base_url'
  limit 1;

  select secret.decrypted_secret
  into v_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'dairtak_worker_cron_secret'
  limit 1;

  if nullif(trim(v_base_url), '') is null or nullif(v_secret, '') is null then
    return null;
  end if;
  v_base_url := regexp_replace(trim(v_base_url), '/+$', '');
  if v_base_url !~ '^https://[A-Za-z0-9.-]+(?::443)?$'
     or char_length(v_secret) < 32 then
    return null;
  end if;

  select net.http_post(
    url => v_base_url || '/api/cron/import-images',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body => jsonb_build_object('source', 'supabase_cron'),
    timeout_milliseconds => 55000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.invoke_catalog_image_worker()
  from public, anon, authenticated;
grant execute on function public.invoke_catalog_image_worker() to service_role;

create or replace function public.catalog_image_worker_configured()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      nullif(trim(base_url.decrypted_secret), '') is not null
      and trim(base_url.decrypted_secret) ~ '^https://[A-Za-z0-9.-]+(?::443)?/?$'
      and nullif(worker_secret.decrypted_secret, '') is not null
      and char_length(worker_secret.decrypted_secret) >= 32
    from vault.decrypted_secrets as base_url
    cross join vault.decrypted_secrets as worker_secret
    where base_url.name = 'dairtak_worker_base_url'
      and worker_secret.name = 'dairtak_worker_cron_secret'
    limit 1
  ), false);
$$;

revoke all on function public.catalog_image_worker_configured()
  from public, anon, authenticated;
grant execute on function public.catalog_image_worker_configured() to service_role;

select cron.schedule(
  'dairtak-catalog-image-worker',
  '30 seconds',
  'select public.invoke_catalog_image_worker();'
);

commit;
