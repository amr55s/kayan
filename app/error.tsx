'use client';

import { useEffect } from 'react';
import { Button } from '@heroui/react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  const isNetworkOrTimeout =
    error?.message?.includes('fetch') ||
    error?.message?.includes('timeout') ||
    error?.message?.includes('Network');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 dir-rtl">
      <div className="text-center space-y-5 max-w-md w-full bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-inner">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
            {isNetworkOrTimeout ? 'تعثر الاتصال بالشبكة' : 'حدث خطأ غير متوقع'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
            {isNetworkOrTimeout
              ? 'يبدو أن الاتصال بطيء أو انقطع مؤقتاً. جاري استرجاع البيانات المحفوظة.'
              : 'نعتذر عن هذا الخلل المؤقت. يمكنك المحاولة مرة أخرى أو العودة للرئيسية.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={reset}
            startContent={<RefreshCw className="w-4 h-4" />}
            className="flex-1 font-extrabold text-xs text-white dark:text-zinc-900 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 h-11 rounded-xl shadow-sm"
          >
            إعادة المحاولة
          </Button>

          <Button
            as={Link}
            href="/"
            variant="flat"
            startContent={<Home className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
            className="flex-1 font-bold text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 h-11 rounded-xl"
          >
            الرئيسية
          </Button>
        </div>
      </div>
    </div>
  );
}
