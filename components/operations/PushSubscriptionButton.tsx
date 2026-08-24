'use client';

import { useEffect, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';
import { BellOff, BellRing } from 'lucide-react';

function urlBase64ToUint8Array(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(base64 + padding);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

type PushState = 'idle' | 'loading' | 'enabled' | 'unsupported' | 'denied' | 'error';

export function PushSubscriptionButton() {
  const [state, setState] = useState<PushState>('idle');

  useEffect(() => {
    if (
      !('serviceWorker' in navigator)
      || !('PushManager' in window)
      || !('Notification' in window)
    ) {
      const unsupportedTimer = window.setTimeout(() => setState('unsupported'), 0);
      return () => window.clearTimeout(unsupportedTimer);
    }
    if (Notification.permission === 'denied') {
      const deniedTimer = window.setTimeout(() => setState('denied'), 0);
      return () => window.clearTimeout(deniedTimer);
    }

    let active = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return;
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) {
          await subscription.unsubscribe().catch(() => false);
          throw new Error('push_subscription_sync_failed');
        }
        if (active) setState('enabled');
      })
      .catch(() => {
        // Registration can be unavailable in privacy-restricted browsers.
      });
    return () => {
      active = false;
    };
  }, []);

  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (
      !key
      || !('serviceWorker' in navigator)
      || !('PushManager' in window)
      || !('Notification' in window)
    ) {
      setState('unsupported');
      return;
    }

    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('denied');
        return;
      }
      if (permission !== 'granted') {
        setState('idle');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => false);
        throw new Error('push_subscription_failed');
      }
      setState('enabled');
    } catch {
      setState('error');
    }
  }

  const label = {
    idle: 'تفعيل الإشعارات',
    loading: 'جارٍ التفعيل…',
    enabled: 'الإشعارات مفعلة',
    unsupported: 'غير مدعومة هنا',
    denied: 'الإشعارات محظورة',
    error: 'إعادة تفعيل الإشعارات',
  }[state];
  const help = state === 'unsupported'
    ? 'على iPhone: ثبّت التطبيق على الشاشة الرئيسية أولًا، ثم افتحه من الأيقونة.'
    : state === 'denied'
      ? 'فعّل الإشعارات من إعدادات الهاتف أو المتصفح.'
      : state === 'error'
        ? 'تعذر التفعيل. تحقق من الشبكة ثم حاول مرة أخرى.'
        : '';

  const button = (
    <Button
      size="sm"
      variant="secondary"
      isPending={state === 'loading'}
      onPress={subscribe}
      isDisabled={state === 'enabled' || state === 'unsupported' || state === 'denied'}
      className="min-h-10 font-bold"
    >
      {state !== 'loading'
        ? state === 'denied'
          ? <BellOff className="size-4" aria-hidden="true" />
          : <BellRing className="size-4" aria-hidden="true" />
        : null}
      {label}
    </Button>
  );

  return help ? (
    <Tooltip>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>{help}</Tooltip.Content>
    </Tooltip>
  ) : button;
}
