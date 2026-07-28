'use client';

export type ClientErrorEventType =
  | 'window_error'
  | 'unhandled_rejection'
  | 'react_boundary';

let currentRelease = 'local';
const recentlySent = new Map<string, number>();

export function setClientErrorRelease(release: string) {
  currentRelease = release.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64) || 'local';
}

function browserFamily(userAgent: string): string {
  if (/SamsungBrowser/i.test(userAgent)) return 'Samsung';
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Other';
}

function osFamily(userAgent: string): string {
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Other';
}

function safeSignature(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const reactCode = message.match(/minified React error #(\d+)/i)?.[1] ?? '';
  const genericCode = message.match(/\b[A-Z][A-Z0-9_]{2,40}\b/)?.[0] ?? '';
  const stack = error instanceof Error ? error.stack ?? '' : '';
  const firstPartyChunk = stack.match(/\/_next\/static\/chunks\/([^?\s:)]+)/)?.[1] ?? '';
  return [name.slice(0, 40), reactCode, genericCode, firstPartyChunk.slice(0, 100)]
    .join('|');
}

async function fingerprint(value: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(16).padStart(16, '0');
  }
}

export async function reportClientError(
  error: unknown,
  eventType: ClientErrorEventType,
): Promise<void> {
  try {
    const route = window.location.pathname.slice(0, 160) || '/';
    const signature = safeSignature(error);
    const errorFingerprint = await fingerprint(
      `${eventType}|${route}|${signature}|${currentRelease}`,
    );
    const now = Date.now();
    if ((recentlySent.get(errorFingerprint) ?? 0) > now - 30_000) return;
    recentlySent.set(errorFingerprint, now);

    const payload = JSON.stringify({
      fingerprint: errorFingerprint,
      eventType,
      route,
      browserFamily: browserFamily(navigator.userAgent),
      osFamily: osFamily(navigator.userAgent),
      release: currentRelease,
    });
    if (payload.length > 4_096) return;

    await fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // Diagnostics are best-effort and never affect the user flow.
  }
}
