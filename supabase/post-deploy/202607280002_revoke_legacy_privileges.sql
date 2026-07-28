-- POST-DEPLOY SECURITY STEP
--
-- Run only after:
-- 1. 202607280001_place_details_reliability.sql is applied.
-- 2. SUPABASE_SECRET_KEY is configured in Vercel (legacy service-role fallback
--    may remain temporarily).
-- 3. The matching application version is healthy in Production.
--
-- This file intentionally lives outside supabase/migrations so a normal
-- `supabase db push` cannot remove legacy access before the new code is live.

begin;

drop policy if exists "public reads directory media" on storage.objects;
drop policy if exists "public submit directory media" on storage.objects;
drop policy if exists "merchants upload linked place media" on storage.objects;
drop policy if exists "Allow public uploads to listing-images" on storage.objects;
drop policy if exists "Allow public read from listing-images" on storage.objects;
drop policy if exists "Allow anon insert for listing-images" on storage.objects;
drop policy if exists "Allow anon insert feedback_requests" on public.feedback_requests;
drop policy if exists "Allow public insert for feedback requests" on public.feedback_requests;

revoke insert on public.feedback_requests from anon, authenticated;
revoke insert, update, delete on public.places from anon, authenticated;

-- Public bucket object URLs remain readable. Only direct object listing and
-- browser-side uploads are withdrawn; all new uploads use the server client.
revoke all on function public.touch_updated_at()
  from public, anon, authenticated;

do $$
declare
  item record;
begin
  for item in
    select proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = any (array[
        'apply_feedback_to_place',
        'approve_account_request',
        'approve_pending_place',
        'claim_delivery_order',
        'consume_account_request_rate_limit',
        'consume_public_submission_rate_limit',
        'create_delivery_order',
        'current_profile',
        'expire_delivery_offers',
        'get_admin_metrics',
        'is_admin',
        'is_current_active_driver',
        'is_current_merchant_for',
        'list_public_legacy_drivers',
        'list_public_registered_drivers',
        'rebroadcast_delivery_order',
        'reject_account_request',
        'renew_driver_availability',
        'rls_auto_enable',
        'set_delivery_order_status',
        'update_driver_public_profile'
      ])
  loop
    execute format('revoke execute on function %s from public, anon', item.signature);
  end loop;

  for item in
    select proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = any (array[
        'apply_feedback_to_place',
        'approve_account_request',
        'approve_pending_place',
        'consume_account_request_rate_limit',
        'consume_public_submission_rate_limit',
        'expire_delivery_offers',
        'get_admin_metrics',
        'list_public_legacy_drivers',
        'list_public_registered_drivers',
        'reject_account_request',
        'rls_auto_enable'
      ])
  loop
    execute format('revoke execute on function %s from authenticated', item.signature);
    execute format('grant execute on function %s to service_role', item.signature);
  end loop;

  for item in
    select proc.oid::regprocedure as signature
    from pg_proc as proc
    join pg_namespace as ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = any (array[
        'claim_delivery_order',
        'create_delivery_order',
        'current_profile',
        'is_admin',
        'is_current_active_driver',
        'is_current_merchant_for',
        'rebroadcast_delivery_order',
        'renew_driver_availability',
        'set_delivery_order_status',
        'update_driver_public_profile'
      ])
  loop
    execute format('grant execute on function %s to authenticated', item.signature);
  end loop;
end;
$$;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
