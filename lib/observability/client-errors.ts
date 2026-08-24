'use client';

export type ClientErrorEventType =
  | 'window_error'
  | 'unhandled_rejection'
  | 'react_boundary';

export type ClientErrorKind =
  | 'ReactError'
  | 'ChunkLoadError'
  | 'NetworkError'
  | 'AbortError'
  | 'TypeError'
  | 'ReferenceError'
  | 'RangeError'
  | 'SyntaxError'
  | 'Unknown';

let currentRelease = 'local';
const recentlySent = new Map<string, number>();
const recentlyObserved = new Map<string, number>();
const RUNTIME_RECOVERY_KEY = 'kayan_runtime_recovery';
const RUNTIME_RECOVERY_WINDOW = 10 * 60 * 1_000;

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

export function classifyClientError(error: unknown): ClientErrorKind {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  if (/insertBefore.*not a child|removeChild.*not a child/i.test(message)) {
    return 'ReactError';
  }
  if (/minified React error #\d+/i.test(message)) return 'ReactError';
  if (
    name === 'ChunkLoadError'
    || /chunkloaderror|loading (?:css )?chunk [\w-]+ failed|failed to fetch dynamically imported module/i.test(message)
  ) {
    return 'ChunkLoadError';
  }
  if (name === 'AbortError') return 'AbortError';
  if (/networkerror|failed to fetch|network request failed/i.test(message)) {
    return 'NetworkError';
  }
  if (name === 'TypeError') return 'TypeError';
  if (name === 'ReferenceError') return 'ReferenceError';
  if (name === 'RangeError') return 'RangeError';
  if (name === 'SyntaxError') return 'SyntaxError';
  return 'Unknown';
}

export function scheduleRuntimeRecovery(error: unknown): number | null {
  if (typeof window === 'undefined') return null;
  const kind = classifyClientError(error);
  const message = error instanceof Error ? error.message : String(error || '');
  const isRecoverable = kind === 'ChunkLoadError'
    || (kind === 'ReactError' && /insertBefore|removeChild|minified React error/i.test(message))
    || (kind === 'RangeError' && /maximum call stack/i.test(message));
  if (!isRecoverable) return null;

  try {
    const recoveryId = `${window.location.pathname}|${kind}`;
    const previous = JSON.parse(
      window.sessionStorage.getItem(RUNTIME_RECOVERY_KEY) || 'null',
    ) as { id?: string; at?: number } | null;
    const now = Date.now();
    if (
      previous?.id === recoveryId
      && typeof previous.at === 'number'
      && previous.at > now - RUNTIME_RECOVERY_WINDOW
    ) {
      return null;
    }
    window.sessionStorage.setItem(
      RUNTIME_RECOVERY_KEY,
      JSON.stringify({ id: recoveryId, at: now }),
    );
  } catch {
    return null;
  }

  return window.setTimeout(() => window.location.reload(), 350);
}

export function normalizeWindowError(
  event: Pick<ErrorEvent, 'error' | 'message'>,
): Error | null {
  if (event.error instanceof Error) {
    const message = event.error.message.trim();
    if (!message || /^(?:script )?error\.?$/i.test(message)) return null;
    return event.error;
  }
  const message = String(event.message || '').trim();
  if (!message || /^(?:script )?error\.?$/i.test(message)) return null;
  return new Error(message);
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
    const now = Date.now();
    const observationKey = `${route}|${signature}|${currentRelease}`;
    if ((recentlyObserved.get(observationKey) ?? 0) > now - 5_000) return;
    recentlyObserved.set(observationKey, now);

    const errorFingerprint = await fingerprint(
      `${eventType}|${route}|${signature}|${currentRelease}`,
    );
    if ((recentlySent.get(errorFingerprint) ?? 0) > now - 30_000) return;
    recentlySent.set(errorFingerprint, now);
    if (recentlyObserved.size > 100 || recentlySent.size > 100) {
      for (const [key, timestamp] of recentlyObserved) {
        if (timestamp <= now - 30_000) recentlyObserved.delete(key);
      }
      for (const [key, timestamp] of recentlySent) {
        if (timestamp <= now - 30_000) recentlySent.delete(key);
      }
    }

    const payload = JSON.stringify({
      fingerprint: errorFingerprint,
      eventType,
      errorKind: classifyClientError(error),
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
