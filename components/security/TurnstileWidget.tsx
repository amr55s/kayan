'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      action: string;
      callback: () => void;
      'error-callback': () => void;
      'expired-callback': () => void;
      language: string;
      sitekey: string;
      theme: 'light';
    },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  action,
  siteKey,
}: {
  action: string;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'ready' | 'error'>('idle');

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      language: 'ar',
      theme: 'light',
      callback: () => setStatus('ready'),
      'expired-callback': () => setStatus('idle'),
      'error-callback': () => setStatus('error'),
    });
  }, [action, siteKey]);

  useEffect(() => () => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, []);

  return (
    <div>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} aria-label="التحقق من أن الطلب حقيقي" />
      <p role="status" aria-live="polite" className="mt-2 text-xs text-zinc-600">
        {status === 'ready' ? 'تم التحقق.' : status === 'error' ? 'تعذر التحقق. حدّث الصفحة وحاول مرة أخرى.' : 'جارٍ تجهيز التحقق الآمن…'}
      </p>
    </div>
  );
}
