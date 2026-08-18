'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from './commerce-operations.module.css';

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function DeliveryProofUploader({ orderId }: { orderId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setState('uploading');
    try {
      const checksumSha256 = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      const prepared = await fetch('/api/media/uploads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose: 'delivery_proof', slot: 'proof', entityId: orderId, contentType: file.type, sizeBytes: file.size, checksumSha256 }),
      });
      const stage = await prepared.json();
      if (!prepared.ok || !stage.uploadUrl || !stage.sessionId) throw new Error('prepare_failed');
      const uploaded = await fetch(stage.uploadUrl, { method: 'PUT', headers: stage.requiredHeaders, body: file });
      if (!uploaded.ok) throw new Error('upload_failed');
      const finalized = await fetch(`/api/media/uploads/${stage.sessionId}/finalize`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: stage.sessionId }),
      });
      const asset = await finalized.json();
      if (!finalized.ok || !asset.assetId) throw new Error('finalize_failed');
      const attached = await fetch(`/api/marketplace/orders/${orderId}/delivery-proof`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset.assetId }),
      });
      if (!attached.ok) throw new Error('attach_failed');
      setState('done');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  return <div className={styles.form}>
    <label className={styles.label}>إثبات التسليم (صورة خاصة لا تظهر على الـCDN)
      <input ref={inputRef} className={styles.field} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={state === 'uploading'} />
    </label>
    <button className={styles.button} type="button" onClick={upload} disabled={state === 'uploading'}>{state === 'uploading' ? 'جارٍ الرفع…' : 'رفع وربط الإثبات'}</button>
    {state === 'done' ? <p role="status">تم حفظ إثبات التسليم.</p> : null}
    {state === 'error' ? <p role="alert" className={styles.error}>تعذر رفع الإثبات. تأكد من نوع الصورة وحاول مرة أخرى.</p> : null}
  </div>;
}
