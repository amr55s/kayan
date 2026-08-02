'use client';

import { useEffect } from 'react';
import { Button } from '@heroui/react';
import { AlertTriangle, RefreshCw, Home, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { reportClientError } from '@/lib/observability/client-errors';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
    Sentry.captureException(error);
    void reportClientError(error, 'react_boundary');
    const retryKey = `admin-error-retry:${error.digest || error.message}`;
    let lastRetry = 0;
    try {
      lastRetry = Number(window.sessionStorage.getItem(retryKey) || 0);
    } catch {
      return;
    }
    if (Date.now() - lastRetry > 30_000) {
      try {
        window.sessionStorage.setItem(retryKey, String(Date.now()));
      } catch {
        return;
      }
      const timer = window.setTimeout(reset, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [error, reset]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 dir-rtl">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-zinc-900 dark:text-white">
          حدث خطأ في لوحة الإدارة
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          حدث انقطاع مؤقت أثناء تحديث البيانات. سنحاول استعادة لوحة الإدارة تلقائياً.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            color="warning"
            variant="solid"
            onClick={reset}
            startContent={<RefreshCw className="w-4 h-4" />}
            className="font-bold text-zinc-950 bg-amber-400 hover:bg-amber-500"
          >
            إعادة المحاولة
          </Button>
          <Button
            variant="bordered"
            onClick={() => window.location.reload()}
            startContent={<RotateCcw className="w-4 h-4" />}
            className="font-bold"
          >
            تحميل أحدث نسخة
          </Button>
          <Button
            as={Link}
            href="/"
            variant="bordered"
            startContent={<Home className="w-4 h-4" />}
          >
            العودة إلى ديرتك
          </Button>
        </div>
      </div>
    </div>
  );
}
