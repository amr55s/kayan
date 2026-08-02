import { DriverWorkspace } from '@/components/operations/DriverWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { getServerTimestamp } from '@/lib/server-time';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DriverPage() {
  const profile = await requireProfile(['driver']);
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: driver }, { data: orders }] = await Promise.all([
    (admin as any)
      .from('driver_profiles')
      .select('active_until, contact_phone, whatsapp, vehicle_type, avatar_url')
      .eq('profile_id', profile.id)
      .single(),
    (supabase as any).from('delivery_orders').select('*').order('created_at', { ascending: false }).limit(50),
  ]);
  const serverNow = getServerTimestamp();
  return (
    <>
      <DashboardHeader displayName={profile.display_name} role="driver" />
      <DriverWorkspace
        orders={orders ?? []}
        availableUntil={driver?.active_until ?? null}
        serverNow={serverNow}
        publicProfile={{
          displayName: profile.display_name,
          contactPhone: driver?.contact_phone ?? profile.phone,
          whatsapp: driver?.whatsapp ?? '',
          vehicleType: driver?.vehicle_type ?? '',
          avatarUrl: driver?.avatar_url ?? null,
        }}
      />
    </>
  );
}
