'use client';

import { useEffect, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Bell, BellOff } from 'lucide-react';

type PreferenceState = 'checking' | 'unsupported' | 'disabled' | 'enabled';

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const output = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

export function PushPreferences() {
  const [state, setState] = useState<PreferenceState>('checking');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      const timer = window.setTimeout(() => setState('unsupported'), 0);
      return () => window.clearTimeout(timer);
    }
    void navigator.serviceWorker.getRegistration('/').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setState('disabled');
        return;
      }
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (response.ok) setState('enabled');
      else {
        await subscription.unsubscribe().catch(() => false);
        setState('disabled');
      }
    }).catch(() => setState('disabled'));
  }, []);

  async function enablePush() {
    setPending(true);
    setMessage('');
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('missing_public_key');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('لم يتم منح إذن الإشعارات من المتصفح.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => false);
        throw new Error('registration_failed');
      }
      setState('enabled');
      setMessage('تم تفعيل تنبيهات المتصفح لهذا الجهاز.');
    } catch {
      setMessage('تعذر تفعيل التنبيهات الآن. جرّب مرة أخرى.');
    } finally {
      setPending(false);
    }
  }

  async function disablePush() {
    setPending(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error('unregister_failed');
        await subscription.unsubscribe();
      }
      setState('disabled');
      setMessage('تم إيقاف تنبيهات المتصفح لهذا الجهاز.');
    } catch {
      setMessage('تعذر إيقاف التنبيهات الآن.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card.Root className="border border-zinc-200 bg-white shadow-none">
      <Card.Content className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-zinc-950">تنبيهات المتصفح</h2>
          <p className="mt-1 text-sm text-zinc-600">تنبيه عام عند وجود تحديث جديد، بدون عرض بيانات الطلب على شاشة القفل.</p>
          {message ? <p className="mt-2 text-sm font-medium text-zinc-800" role="status">{message}</p> : null}
        </div>
        {state === 'unsupported' ? (
          <span className="text-sm text-zinc-500">المتصفح لا يدعم التنبيهات.</span>
        ) : state === 'enabled' ? (
          <Button variant="outline" onPress={disablePush} isPending={pending} isDisabled={pending}>
            <BellOff className="size-4" aria-hidden="true" /> إيقاف التنبيهات
          </Button>
        ) : (
          <Button onPress={enablePush} isPending={pending || state === 'checking'} isDisabled={pending || state === 'checking'}>
            <Bell className="size-4" aria-hidden="true" /> تفعيل التنبيهات
          </Button>
        )}
      </Card.Content>
    </Card.Root>
  );
}
