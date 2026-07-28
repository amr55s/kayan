'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackSiteEvent } from '@/lib/analytics/client';

export function BehaviorAnalyticsReporter() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;
    const frame = window.requestAnimationFrame(() => {
      trackSiteEvent('page_view', { targetType: 'site' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
