'use client';

import { useState } from 'react';
import { Button } from '@heroui/react';
import { BellRing } from 'lucide-react';

function urlBase64ToUint8Array(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushSubscriptionButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'enabled' | 'unsupported'>('idle');
  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return; }
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('لم تسمح بالإشعارات.');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error('تعذر حفظ الاشتراك.');
      setState('enabled');
    } catch { setState('idle'); }
  }
  return <Button size="sm" variant="flat" isLoading={state === 'loading'} onPress={subscribe} isDisabled={state === 'enabled'} startContent={<BellRing className="size-4" />}>{state === 'enabled' ? 'الإشعارات مفعلة' : state === 'unsupported' ? 'الإشعارات غير متاحة' : 'تفعيل الإشعارات'}</Button>;
}
