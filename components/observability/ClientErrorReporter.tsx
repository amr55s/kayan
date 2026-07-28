'use client';

import { useEffect } from 'react';
import {
  reportClientError,
  setClientErrorRelease,
} from '@/lib/observability/client-errors';

export function ClientErrorReporter({ release }: { release: string }) {
  useEffect(() => {
    setClientErrorRelease(release);

    const onError = (event: ErrorEvent) => {
      void reportClientError(
        event.error instanceof Error ? event.error : new Error(event.type),
        'window_error',
      );
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError(event.reason, 'unhandled_rejection');
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [release]);

  return null;
}
