import { AdminWorkspace } from '@/components/operations/AdminWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBehaviorAnalytics } from '@/lib/analytics/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function safeAdminQuery(
  label: string,
  query: PromiseLike<{ data: any; error?: unknown }>,
): Promise<{ data: any }> {
  try {
    const result = await query;
    if (result.error) {
      console.error(`Admin query "${label}" failed:`, result.error);
      return { data: null };
    }
    return { data: result.data };
  } catch (error) {
    console.error(`Admin query "${label}" exception:`, error);
    return { data: null };
  }
}

async function loadClientErrors() {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('client_error_reports')
      .select('id, fingerprint, event_type, route, browser_family, os_family, release, occurrences, first_seen_at, last_seen_at')
      .gte('last_seen_at', since)
      .order('last_seen_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    console.warn('Anonymous client diagnostics are not available yet:', error);
    return [];
  }
}

export default async function AdminDashboard() {
  const profile = await requireProfile(['admin']);
  const supabase = await createClient();

  const [
    { data: merchants },
    { data: profiles },
    { data: orders },
    { data: branches },
    { data: places },
    { data: pendingRequests },
    { data: feedbackRequests },
    { data: drivers },
    { data: auditLog },
    { data: accountRequests },
    clientErrors,
    behaviorAnalytics,
  ] = await Promise.all([
    safeAdminQuery('merchants', (supabase as any)
      .from('merchants')
      .select('id, display_name, is_active')
      .order('created_at', { ascending: false })),
    safeAdminQuery('profiles', (supabase as any)
      .from('profiles')
      .select('id, display_name, phone, role, is_active, merchant_id, must_change_password')
      .order('created_at', { ascending: false })),
    safeAdminQuery('delivery_orders', (supabase as any)
      .from('delivery_orders')
      .select('id, public_code, status, recipient_name, delivery_area, created_at')
      .order('created_at', { ascending: false })
      .limit(100)),
    safeAdminQuery('merchant_branches', (supabase as any)
      .from('merchant_branches')
      .select('id, merchant_id, place_id, name, phone, address, area, is_default, is_active')
      .order('created_at', { ascending: false })),
    safeAdminQuery('places', (supabase as any)
      .from('places')
      .select('*')
      .order('created_at', { ascending: false })),
    safeAdminQuery('pending_requests', (supabase as any)
      .from('pending_requests')
      .select('*')
      .order('created_at', { ascending: false })),
    safeAdminQuery('feedback_requests', (supabase as any)
      .from('feedback_requests')
      .select('*')
      .order('created_at', { ascending: false })),
    safeAdminQuery('drivers', (supabase as any)
      .from('drivers')
      .select('id, name, phone, whatsapp, vehicle_type, is_active, active_until, created_at')
      .order('created_at', { ascending: false })),
    safeAdminQuery('audit_log', (supabase as any)
      .from('audit_log')
      .select('id, action, entity_type, entity_id, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(100)),
    safeAdminQuery('account_requests', (supabase as any)
      .from('account_requests')
      .select('*')
      .order('created_at', { ascending: false })),
    loadClientErrors(),
    loadBehaviorAnalytics(),
  ]);

  return (
    <>
      <DashboardHeader displayName={profile.display_name} role="admin" />
      <AdminWorkspace
        merchants={merchants ?? []}
        profiles={profiles ?? []}
        orders={orders ?? []}
        branches={branches ?? []}
        places={places ?? []}
        pendingRequests={pendingRequests ?? []}
        feedbackRequests={feedbackRequests ?? []}
        drivers={drivers ?? []}
        auditLog={auditLog ?? []}
        accountRequests={accountRequests ?? []}
        clientErrors={clientErrors}
        behaviorAnalytics={behaviorAnalytics}
      />
    </>
  );
}
