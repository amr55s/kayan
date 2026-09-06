-- Must remain separate from the enum ADD migration: PostgreSQL does not allow
-- a new enum value to be used in the same transaction that adds it.
begin;

create or replace function public.get_my_marketplace_admin_roles()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_marketplace_admin_role(array[
    'super_admin', 'operations', 'support', 'finance', 'catalog_reviewer', 'chat_monitor'
  ]::public.marketplace_admin_role[]) then
    raise exception 'admin_membership_required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(membership.role order by membership.role)
    from public.admin_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.is_active
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_my_marketplace_admin_roles() from public, anon;
grant execute on function public.get_my_marketplace_admin_roles() to authenticated;

commit;
