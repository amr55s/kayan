'use client';

import {
  createMediaUploadSchema,
  MAX_MEDIA_SOURCE_BYTES,
  supportedMediaTypes,
  type MediaPurpose,
} from '@/lib/media/contracts';

export type FinalizedMediaAsset = {
  assetId: string;
  height: number;
  position: number;
  publicUrl: string | null;
  viewUrl?: string;
  width: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

async function readJson(response: Response): Promise<any> {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error || `media_request_failed_${response.status}`);
  return value;
}

async function finalizeUploadSession(sessionId: string, signal?: AbortSignal): Promise<FinalizedMediaAsset> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`/api/media/uploads/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal,
      });
      if (response.ok) return readJson(response);
      const body = await response.json().catch(() => null);
      const retryable = response.status >= 500
        || (response.status === 409 && body?.error === 'upload_session_busy');
      if (!retryable || attempt === 2) {
        return Promise.reject(new Error(body?.error || `media_request_failed_${response.status}`));
      }
    } catch (error) {
      if (signal?.aborted || attempt === 2) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, 250 * (attempt + 1));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  throw new Error('media_finalize_failed');
}

export async function uploadMarketplaceImage(input: {
  entityId: string;
  file: File;
  merchantId?: string;
  onProgress?: (stage: 'hashing' | 'uploading' | 'processing') => void;
  purpose: MediaPurpose;
  slot?: 'gallery' | 'logo' | 'cover' | 'proof';
  signal?: AbortSignal;
}): Promise<FinalizedMediaAsset> {
  if (/\.(?:heic|heif)$/iu.test(input.file.name) || /image\/hei[cf]/iu.test(input.file.type)) {
    throw new Error('صيغة HEIC غير مدعومة حاليًا. حوّل الصورة إلى JPG أو PNG أو WebP أو AVIF ثم أعد المحاولة.');
  }
  if (!input.file.size || input.file.size > MAX_MEDIA_SOURCE_BYTES) {
    throw new Error('حجم الصورة يجب ألا يتجاوز 12 ميجابايت.');
  }
  if (!supportedMediaTypes.includes(input.file.type as (typeof supportedMediaTypes)[number])) {
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو AVIF.');
  }

  input.onProgress?.('hashing');
  const checksumSha256 = await sha256(input.file);
  const payload = createMediaUploadSchema.parse({
    purpose: input.purpose,
    slot: input.slot ?? 'gallery',
    merchantId: input.merchantId,
    entityId: input.entityId,
    contentType: input.file.type,
    sizeBytes: input.file.size,
    checksumSha256,
  });
  const prepared = await readJson(await fetch('/api/media/uploads', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    signal: input.signal,
  }));

  input.onProgress?.('uploading');
  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    body: input.file,
    headers: prepared.requiredHeaders,
    signal: input.signal,
  });
  if (!uploadResponse.ok) throw new Error(`media_upload_failed_${uploadResponse.status}`);

  input.onProgress?.('processing');
  return finalizeUploadSession(prepared.sessionId, input.signal);
}
