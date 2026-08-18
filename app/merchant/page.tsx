import { MerchantOrderWorkspace } from '@/components/operations/MerchantOrderWorkspace';
import { DashboardHeader } from '@/components/operations/DashboardHeader';
import { requireProfile } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export default async function MerchantPage() {
  const profile = await requireProfile(['merchant']);
  const supabase = await createClient();
  const { data: branches } = await (supabase as any)
    .from('merchant_branches')
    .select('id, merchant_id, place_id, name, phone, address, area, is_default, is_active')
    .eq('merchant_id', profile.merchant_id)
    .eq('is_active', true)
    .order('is_default', { ascending: false });
  const placeIds = (branches ?? [])
    .map((branch: { place_id: string | null }) => branch.place_id)
    .filter((id: string | null): id is string => Boolean(id));

  const [{ data: linkedPlaces }, { data: driverRows }, { data: orders }] = await Promise.all([
    placeIds.length
      ? (supabase as any)
          .from('places')
          .select('id,title,category,description,images,is_featured,created_at,address,map_url,view_count,recommend_count')
          .in('id', placeIds)
      : Promise.resolve({ data: [] }),
    (supabase as any).rpc('list_available_delivery_drivers'),
    (supabase as any).rpc('list_merchant_delivery_orders', { p_limit: 50 }),
  ]);
  const drivers = (driverRows ?? []).map((row: any) => ({
    id: row.id,
    name: row.display_name ?? 'كابتن توصيل',
    vehicleType: row.vehicle_type ?? null,
    activeUntil: row.active_until,
  }));
  return (
    <>
      <DashboardHeader displayName={profile.display_name} role="merchant" />
      <MerchantOrderWorkspace
        branches={branches ?? []}
        places={linkedPlaces ?? []}
        drivers={drivers}
        orders={orders ?? []}
      />
    </>
  );
}
