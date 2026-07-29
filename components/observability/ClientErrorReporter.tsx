'use client';

import { useEffect } from 'react';
import {
  normalizeWindowError,
  reportClientError,
  setClientErrorRelease,
} from '@/lib/observability/client-errors';

export function ClientErrorReporter({ release }: { release: string }) {
  useEffect(() => {
    setClientErrorRelease(release);
    const pendingWindowReports = new Set<number>();

    const onError = (event: ErrorEvent) => {
      const error = normalizeWindowError(event);
      if (!error) return;
      const timer = window.setTimeout(() => {
        pendingWindowReports.delete(timer);
        void reportClientError(error, 'window_error');
      }, 750);
      pendingWindowReports.add(timer);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError(event.reason, 'unhandled_rejection');
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      for (const timer of pendingWindowReports) window.clearTimeout(timer);
      pendingWindowReports.clear();
    };
  }, [release]);

  return null;
}
