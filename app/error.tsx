'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import {
  reportClientError,
  scheduleRuntimeRecovery,
} from '@/lib/observability/client-errors';

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
    const recoveryTimer = scheduleRuntimeRecovery(error);
    return () => {
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    };
  }, [error]);

  const isNetworkOrTimeout = /fetch|timeout|network/i.test(error?.message || '');

  return (
    <main id="main-content" className="dir-rtl flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-zinc-900">
      <section className="w-full max-w-md space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-xl sm:p-8">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <AlertTriangle className="size-8" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-balance text-xl font-black sm:text-2xl">
            {isNetworkOrTimeout ? 'تعثر الاتصال بالشبكة' : 'حدث خطأ مؤقت'}
          </h1>
          <p className="text-pretty text-sm leading-7 text-zinc-600">
            أعد المحاولة أولًا. إذا كنت تملأ نموذجًا، تجنّب تحديث الصفحة حتى تحافظ على البيانات المكتوبة.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-200"
          >
            <Home className="size-4" aria-hidden="true" />
            الرئيسية
          </Link>
        </div>
      </section>
    </main>
  );
}
