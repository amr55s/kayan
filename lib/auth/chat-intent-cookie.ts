import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  parseChatLoginIntent,
  sanitizeNextPath,
  type ChatLoginIntent,
} from './safe-next.ts';

const INTENT_TTL_MS = 10 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type OAuthFlowPhase = 'oauth' | 'cancelled' | 'recovery';

type SignedChatIntent = {
  version: 1;
  flowId: string;
  issuedAt: number;
  expiresAt: number;
  returnTo: string;
  intent: ChatLoginIntent | null;
  phase: OAuthFlowPhase;
};

export const chatIntentCookie = {
  name: 'dairtak_chat_intent',
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INTENT_TTL_MS / 1_000,
  },
};

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactReturnTo(value: unknown): string | null {
  return typeof value === 'string' && sanitizeNextPath(value) === value ? value : null;
}

function validatedSecret(secret: string): string {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('chat_intent_configuration_invalid');
  }
  return secret;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', validatedSecret(secret)).update(payload).digest('base64url');
}

function equalSignature(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function parseSignedPayload(value: unknown): SignedChatIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!exactKeys(input, ['version', 'flowId', 'issuedAt', 'expiresAt', 'returnTo', 'intent', 'phase'])) {
    return null;
  }
  const intent = input.intent === null ? null : parseChatLoginIntent(input.intent);
  const returnTo = exactReturnTo(input.returnTo);
  if (
    input.version !== 1
    || typeof input.flowId !== 'string'
    || !UUID.test(input.flowId)
    || typeof input.issuedAt !== 'number'
    || !Number.isSafeInteger(input.issuedAt)
    || typeof input.expiresAt !== 'number'
    || !Number.isSafeInteger(input.expiresAt)
    || !returnTo
    || (input.intent !== null && !intent)
    || (input.phase !== 'oauth' && input.phase !== 'cancelled' && input.phase !== 'recovery')
  ) return null;
  return {
    version: 1,
    flowId: input.flowId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    returnTo,
    intent,
    phase: input.phase,
  };
}

function parseAndVerify(
  value: string | null | undefined,
  input: { secret: string; now?: number },
): { status: 'valid'; payload: SignedChatIntent } | { status: 'invalid' | 'expired' } {
  validatedSecret(input.secret);
  if (!value || typeof value !== 'string') return { status: 'invalid' };
  const separator = value.indexOf('.');
  if (separator < 1 || separator !== value.lastIndexOf('.')) return { status: 'invalid' };
  const encoded = value.slice(0, separator);
  const actualSignature = value.slice(separator + 1);
  if (!equalSignature(actualSignature, signature(encoded, input.secret))) return { status: 'invalid' };
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { status: 'invalid' };
  }
  const payload = parseSignedPayload(raw);
  if (!payload) return { status: 'invalid' };
  const now = input.now ?? Date.now();
  if (
    !Number.isSafeInteger(now)
    || payload.expiresAt - payload.issuedAt !== INTENT_TTL_MS
    || payload.issuedAt > now + 30_000
    || now >= payload.expiresAt
  ) return { status: 'expired' };
  return { status: 'valid', payload };
}

function encodePayload(payload: SignedChatIntent, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function signChatIntentCookie(input: {
  secret: string;
  flowId: string;
  returnTo: string;
  intent: ChatLoginIntent | null;
  phase?: OAuthFlowPhase;
  now?: number;
}): { value: string; flowId: string } {
  const intent = input.intent === null ? null : parseChatLoginIntent(input.intent);
  const returnTo = exactReturnTo(input.returnTo);
  if ((input.intent !== null && !intent) || !returnTo || !UUID.test(input.flowId)) throw new Error('invalid_chat_intent');
  const issuedAt = input.now ?? Date.now();
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new Error('invalid_chat_intent');
  const payload: SignedChatIntent = {
    version: 1,
    flowId: input.flowId,
    issuedAt,
    expiresAt: issuedAt + INTENT_TTL_MS,
    returnTo,
    intent,
    phase: input.phase ?? 'oauth',
  };
  return { value: encodePayload(payload, input.secret), flowId: input.flowId };
}

export function inspectChatIntentCookie(
  value: string | null | undefined,
  input: { secret: string; now?: number },
):
  | { status: 'valid'; flow: Pick<SignedChatIntent, 'flowId' | 'returnTo' | 'intent' | 'phase'> }
  | { status: 'invalid' | 'expired' } {
  const result = parseAndVerify(value, input);
  if (result.status !== 'valid') return result;
  const { flowId, returnTo, intent, phase } = result.payload;
  return { status: 'valid', flow: { flowId, returnTo, intent, phase } };
}

export function transitionChatIntentCookie(
  value: string | null | undefined,
  input: {
    secret: string;
    now?: number;
    flowId: string;
    returnTo: string;
    phase: OAuthFlowPhase;
  },
): { status: 'valid'; value: string } | { status: 'invalid' | 'expired' | 'mismatch' } {
  const result = parseAndVerify(value, input);
  if (result.status !== 'valid') return result;
  const returnTo = exactReturnTo(input.returnTo);
  if (!returnTo || result.payload.flowId !== input.flowId || result.payload.returnTo !== returnTo) {
    return { status: 'mismatch' };
  }
  return {
    status: 'valid',
    value: encodePayload({ ...result.payload, phase: input.phase }, input.secret),
  };
}

export function verifyChatIntentCookie(
  value: string | null | undefined,
  input: { secret: string; flowId: string; returnTo: string; now?: number },
):
  | { status: 'valid'; intent: ChatLoginIntent | null; phase: OAuthFlowPhase }
  | { status: 'invalid' | 'expired' | 'mismatch' } {
  const result = parseAndVerify(value, input);
  if (result.status !== 'valid') return result;
  const payload = result.payload;
  const returnTo = exactReturnTo(input.returnTo);
  if (payload.flowId !== input.flowId || !returnTo || payload.returnTo !== returnTo) {
    return { status: 'mismatch' };
  }
  return { status: 'valid', intent: payload.intent, phase: payload.phase };
}
