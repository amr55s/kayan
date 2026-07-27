'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Refreshes server-rendered dashboards only when RLS permits the changed row. */
export function useDeliveryRealtime(scope: 'merchant' | 'driver' | 'admin') {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`delivery:${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, scope]);
}
