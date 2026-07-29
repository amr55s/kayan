'use client';

import { useEffect } from 'react';
import { trackSiteEvent } from '@/lib/analytics/client';

export function GuideAnalytics({ page }: { page: 'guide' | 'share' }) {
  useEffect(() => {
    trackSiteEvent('guide_open', {
      targetType: 'feature',
      targetKey: page,
    });
  }, [page]);
  return null;
}
