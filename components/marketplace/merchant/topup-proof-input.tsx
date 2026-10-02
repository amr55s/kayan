'use client';

import { useState } from 'react';

const MAX_BYTES = 3 * 1024 * 1024;

/** Rejects an oversized screenshot in the browser, before the upload is attempted. */
export function TopupProofInput({ className, inputClassName }: { className?: string; inputClassName?: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <label className={className}>
      <span>لقطة شاشة التحويل</span>
      <input
        name="proof"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        className={inputClassName}
        aria-describedby="topup-proof-hint"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const message = file && file.size > MAX_BYTES ? 'حجم الصورة أكبر من ٣ ميجابايت. اختر صورة أصغر.' : '';
          event.currentTarget.setCustomValidity(message);
          setError(message || null);
        }}
      />
      <small id="topup-proof-hint" role={error ? 'alert' : undefined} data-error={error ? 'true' : undefined}>
        {error ?? 'صورة JPG أو PNG حتى ٣ ميجابايت، يظهر فيها المبلغ والتاريخ.'}
      </small>
    </label>
  );
}
