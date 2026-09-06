begin;

create or replace function public.configure_marketplace_worker_vault(
  p_base_url text,
  p_cron_secret text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_base_url text := pg_catalog.regexp_replace(pg_catalog.btrim(p_base_url), '/+$', '');
begin
  if v_base_url !~ '^https://[A-Za-z0-9.-]+(?::443)?$'
    or char_length(v_base_url) > 255
    or p_cron_secret is null
    or char_length(p_cron_secret) not between 32 and 256
    or p_cron_secret ~ '[[:cntrl:][:space:]]' then
    raise exception 'invalid_worker_configuration' using errcode = '22023';
  end if;

  select secret.id into v_secret_id
  from vault.secrets as secret
  where secret.name = 'dairtak_worker_base_url'
  limit 1;
  if v_secret_id is null then
    perform vault.create_secret(
      v_base_url,
      'dairtak_worker_base_url',
      'Dairtak hosted worker origin'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_base_url,
      'dairtak_worker_base_url',
      'Dairtak hosted worker origin'
    );
  end if;

  v_secret_id := null;
  select secret.id into v_secret_id
  from vault.secrets as secret
  where secret.name = 'dairtak_worker_cron_secret'
  limit 1;
  if v_secret_id is null then
    perform vault.create_secret(
      p_cron_secret,
      'dairtak_worker_cron_secret',
      'Bearer secret shared with Dairtak hosted workers'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_cron_secret,
      'dairtak_worker_cron_secret',
      'Bearer secret shared with Dairtak hosted workers'
    );
  end if;

  return public.catalog_image_worker_configured();
end;
$$;

revoke all on function public.configure_marketplace_worker_vault(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_marketplace_worker_vault(text, text)
  to service_role;

commit;
