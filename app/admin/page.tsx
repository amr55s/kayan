import { AdminWorkspace } from '@/components/operations/AdminWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBehaviorAnalytics } from '@/lib/analytics/admin';
import { fetchHomePageData } from '@/lib/supabase/queries';

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
      .select('id, fingerprint, event_type, error_kind, route, browser_family, os_family, release, occurrences, first_seen_at, last_seen_at')
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
  const adminData = createAdminClient();

  const [
    { data: merchants },
    { data: profiles },
    { data: orders },
    { data: branches },
    { data: places },
    { data: pendingRequests },
    { data: feedbackRequests },
    { data: drivers },
    { data: registeredDrivers },
    { data: auditLog },
    { data: accountRequests },
    clientErrors,
    behaviorAnalytics,
    { data: marketingChannels },
    { data: marketingCampaigns },
    { data: marketingPublications },
    marketingHomeData,
  ] = await Promise.all([
    safeAdminQuery('merchants', (supabase as any)
      .from('merchants')
      .select('id, display_name, is_active')
      .order('created_at', { ascending: false })),
    safeAdminQuery('profiles', (supabase as any)
      .from('profiles')
      .select('id, display_name, phone, role, is_active, merchant_id, must_change_password, created_at')
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
    safeAdminQuery('registered_driver_profiles', (adminData as any)
      .from('driver_profiles')
      .select('profile_id, contact_phone, whatsapp, vehicle_type, is_available, active_until, legacy_driver_id, created_at, profile:profiles!driver_profiles_profile_id_fkey(display_name, phone, is_active, created_at, role)')
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
    safeAdminQuery('marketing_channels', (adminData as any)
      .from('marketing_channels')
      .select('*')
      .order('created_at', { ascending: true })),
    safeAdminQuery('marketing_campaigns', (adminData as any)
      .from('marketing_campaigns')
      .select('*')
      .order('updated_at', { ascending: false })),
    safeAdminQuery('marketing_publications', (adminData as any)
      .from('marketing_publications')
      .select('campaign_id, published_at')
      .order('published_at', { ascending: false })
      .limit(5_000)),
    fetchHomePageData().catch((error) => {
      console.warn('Marketing driver queue could not be loaded:', error);
      return { places: [], drivers: [], renderedAt: 0 };
    }),
  ]);

  const publicationCounts = new Map<string, number>();
  for (const publication of marketingPublications ?? []) {
    publicationCounts.set(
      publication.campaign_id,
      (publicationCounts.get(publication.campaign_id) ?? 0) + 1,
    );
  }
  const campaignEvents = new Map(
    behaviorAnalytics.campaignEvents.map((item) => [item.campaignKey, item]),
  );
  const enrichedCampaigns = (marketingCampaigns ?? []).map((campaign: any) => ({
    ...campaign,
    publication_count: publicationCounts.get(campaign.id) ?? 0,
    ...(campaignEvents.get(campaign.campaign_code) ?? {
      visits: 0,
      opens: 0,
      actions: 0,
      shares: 0,
    }),
  }));
  const registeredByProfile = new Map(
    (registeredDrivers ?? []).map((driver: any) => [driver.profile_id, driver]),
  );
  const linkedLegacyIds = new Set(
    (registeredDrivers ?? []).map((driver: any) => driver.legacy_driver_id).filter(Boolean),
  );
  const adminRenderedAt = marketingHomeData.renderedAt;
  const managedDrivers = [
    ...(profiles ?? [])
      .filter((account: any) => account.role === 'driver')
      .map((account: any) => {
        const driver: any = registeredByProfile.get(account.id);
        return {
          id: account.id,
          name: account?.display_name ?? 'كابتن توصيل',
          phone: driver?.contact_phone ?? account?.phone ?? '',
          whatsapp: driver?.whatsapp,
          vehicle_type: driver?.vehicle_type,
          is_active: Boolean(account?.is_active),
          is_available: Boolean(driver?.is_available)
            && Boolean(driver?.active_until)
            && new Date(driver.active_until).getTime() > adminRenderedAt,
          active_until: driver?.active_until ?? null,
          created_at: account?.created_at ?? driver?.created_at,
          profile_complete: Boolean(driver),
          source: 'account' as const,
        };
      }),
    ...(drivers ?? [])
      .filter((driver: any) => !linkedLegacyIds.has(driver.id))
      .map((driver: any) => ({
        ...driver,
        is_active: Boolean(driver.is_active),
        is_available: Boolean(driver.is_active)
          && Boolean(driver.active_until)
          && new Date(driver.active_until).getTime() > adminRenderedAt,
        profile_complete: true,
        source: 'public' as const,
      })),
  ];

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
        drivers={managedDrivers}
        auditLog={auditLog ?? []}
        accountRequests={accountRequests ?? []}
        clientErrors={clientErrors}
        currentRelease={process.env.VERCEL_GIT_COMMIT_SHA || 'local'}
        behaviorAnalytics={behaviorAnalytics}
        marketingChannels={marketingChannels ?? []}
        marketingCampaigns={enrichedCampaigns}
        marketingDrivers={marketingHomeData.drivers}
      />
    </>
  );
}
