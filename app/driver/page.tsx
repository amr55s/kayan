import { DriverWorkspace } from '@/components/operations/DriverWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export default async function DriverPage() {
  const profile = await requireProfile(['driver']);
  const supabase = await createClient();
  const [{ data: driver }, { data: orders }] = await Promise.all([
    (supabase as any).from('driver_profiles').select('active_until, whatsapp, vehicle_type').eq('profile_id', profile.id).single(),
    (supabase as any).from('delivery_orders').select('*').order('created_at', { ascending: false }).limit(50),
  ]);
  return (
    <>
      <DashboardHeader displayName={profile.display_name} role="driver" />
      <DriverWorkspace
        orders={orders ?? []}
        availableUntil={driver?.active_until ?? null}
        publicProfile={{
          displayName: profile.display_name,
          whatsapp: driver?.whatsapp ?? '',
          vehicleType: driver?.vehicle_type ?? '',
        }}
      />
    </>
  );
}
