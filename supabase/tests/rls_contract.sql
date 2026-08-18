begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind in ('r','p')
      and not relation.relrowsecurity),
  0,
  'every public application table has RLS enabled'
);

select extensions.is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')),
  0,
  'anon has no direct mutation privileges on public tables'
);

select extensions.is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('marketplace_return_requests','marketplace_return_request_items')
      and privilege_type = 'SELECT'),
  0,
  'return internals are available only through participant-scoped RPC DTOs'
);

select extensions.is(
  (select count(*)::integer from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.prosecdef
      and not exists (
        select 1 from unnest(coalesce(procedure.proconfig, '{}'::text[])) as setting
        where setting in (
          'search_path=', 'search_path=""',
          'search_path=pg_catalog, public', 'search_path=pg_catalog,public'
        )
      )),
  0,
  'all public SECURITY DEFINER routines pin a trusted search_path'
);

select * from extensions.finish();
rollback;
