-- Require a verified TOTP session (AAL2) for every authenticated marketplace
-- administrator. Service-role jobs keep their existing privileged posture.

begin;

create or replace function public.is_marketplace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
    or (
      (select auth.uid()) is not null
      and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.role = 'admin'
          and profile.is_active
      )
    );
$$;

-- Legacy directory and delivery policies call is_admin(). Keep that boundary in
-- sync so an AAL1 administrator cannot bypass MFA through the older Data API.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
    or (
      (select auth.uid()) is not null
      and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.role = 'admin'
          and profile.is_active
      )
    );
$$;

revoke all on function public.is_marketplace_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_marketplace_admin() to authenticated, service_role;
revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

commit;
