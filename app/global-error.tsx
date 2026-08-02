'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  reportClientError,
  scheduleRuntimeRecovery,
} from '@/lib/observability/client-errors';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    void reportClientError(error, 'react_boundary');
    const recoveryTimer = scheduleRuntimeRecovery(error);
    return () => {
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
    };
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, background: '#fafafa', color: '#18181b', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section style={{ width: '100%', maxWidth: 420, border: '1px solid #e4e4e7', borderRadius: 24, background: '#fff', padding: 24, textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>تعذر تشغيل الصفحة</h1>
            <p style={{ margin: '12px 0 20px', lineHeight: 1.8, color: '#52525b' }}>
              لم تُفقد بياناتك. جرّب تشغيل الصفحة مرة أخرى أو ارجع للرئيسية.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                onClick={reset}
                style={{ minHeight: 48, border: 0, borderRadius: 12, background: '#18181b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                إعادة المحاولة
              </button>
              {/* A plain anchor remains usable even when the Next.js runtime failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{ minHeight: 48, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#f4f4f5', color: '#18181b', fontWeight: 700, textDecoration: 'none' }}
              >
                العودة للرئيسية
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
