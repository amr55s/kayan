const NAVIGATION_ORIGIN = 'https://navigation.invalid';
const MAX_NEXT_LENGTH = 500;
const MAX_DECODE_PASSES = Math.floor(MAX_NEXT_LENGTH / 2) + 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_PATH = /^\/(?:$|marketplace(?:\/|$)|account(?:\/|$)|merchant(?:\/|$)|driver(?:\/|$)|admin(?:\/|$)|services(?:\/|$)|guide(?:\/|$)|share(?:\/|$))/u;

export type ChatLoginIntent =
  | { kind: 'presale'; storeId: string; productId: string | null }
  | { kind: 'order'; orderId: string };

function unsafeAfterDecoding(value: string): boolean {
  let decoded = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (decoded.includes('\\') || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(decoded)) return true;
    const path = decoded.split(/[?#]/u, 1)[0] ?? '';
    if (!path.startsWith('/') || path.startsWith('//')) return true;
    const queryAndHash = decoded.slice(path.length);
    if (
      /:\/\//u.test(queryAndHash)
      || /(?:^|[?&#=])\/\//u.test(queryAndHash)
      || /(?:^|[?&#=])(javascript|data):/iu.test(queryAndHash)
    ) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return true;
    }
  }
  // Every changing decode consumes at least one three-byte percent escape, so a
  // value capped at MAX_NEXT_LENGTH must stabilize before this bound.
  return true;
}

function normalizedNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > MAX_NEXT_LENGTH || unsafeAfterDecoding(value)) return null;
  try {
    const resolved = new URL(value, NAVIGATION_ORIGIN);
    if (resolved.origin !== NAVIGATION_ORIGIN || !ALLOWED_PATH.test(resolved.pathname)) {
      return null;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/** Accepts only allowlisted app-local destinations and rejects normalization tricks. */
export function sanitizeNextPath(
  value: string | null | undefined,
  fallback = '/marketplace',
): string {
  return normalizedNextPath(value) ?? normalizedNextPath(fallback) ?? '/marketplace';
}

export function safeNextPath(value: string | null | undefined): string {
  return sanitizeNextPath(value, '/marketplace');
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function parseChatLoginIntent(value: unknown): ChatLoginIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    input.kind === 'presale'
    && exactKeys(input, ['kind', 'storeId', 'productId'])
    && typeof input.storeId === 'string'
    && UUID.test(input.storeId)
    && (input.productId === null || (typeof input.productId === 'string' && UUID.test(input.productId)))
  ) return { kind: 'presale', storeId: input.storeId, productId: input.productId };
  if (
    input.kind === 'order'
    && exactKeys(input, ['kind', 'orderId'])
    && typeof input.orderId === 'string'
    && UUID.test(input.orderId)
  ) return { kind: 'order', orderId: input.orderId };
  return null;
}

export function chatIntentFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ChatLoginIntent | null {
  if (params.intent !== 'chat' || typeof params.kind !== 'string') return null;
  if (params.kind === 'presale') {
    return parseChatLoginIntent({
      kind: 'presale',
      storeId: typeof params.storeId === 'string' ? params.storeId : null,
      productId: typeof params.productId === 'string' ? params.productId : null,
    });
  }
  if (params.kind === 'order') {
    return parseChatLoginIntent({
      kind: 'order',
      orderId: typeof params.orderId === 'string' ? params.orderId : null,
    });
  }
  return null;
}

export function createChatLoginHref(input: {
  returnTo: string;
  intent: ChatLoginIntent;
}): string {
  const intent = parseChatLoginIntent(input.intent);
  if (!intent) throw new Error('invalid_chat_intent');
  const params = new URLSearchParams({
    next: sanitizeNextPath(input.returnTo, '/marketplace'),
    intent: 'chat',
    kind: intent.kind,
  });
  if (intent.kind === 'presale') {
    params.set('storeId', intent.storeId);
    if (intent.productId) params.set('productId', intent.productId);
  } else {
    params.set('orderId', intent.orderId);
  }
  return `/signin?${params.toString()}`;
}
