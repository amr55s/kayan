import 'server-only';

import { requireServerEnv } from '@/lib/env/server';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2_048;

type TurnstileResponse = {
  action?: string;
  'error-codes'?: string[];
  hostname?: string;
  success?: boolean;
};

export type TurnstileVerification =
  | { ok: true }
  | { ok: false; code: 'invalid_token' | 'verification_unavailable' };

function allowedHostnames(): Set<string> {
  const siteUrl = requireServerEnv('NEXT_PUBLIC_SITE_URL');
  try {
    const hostnames = new Set([new URL(siteUrl).hostname.toLowerCase()]);
    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) hostnames.add(new URL(`https://${vercelUrl}`).hostname.toLowerCase());
    return hostnames;
  } catch {
    throw new Error('The configured site hostname is invalid.');
  }
}

export async function verifyTurnstileToken(input: {
  token: string;
  action: string;
  remoteIp?: string | null;
}): Promise<TurnstileVerification> {
  const token = input.token.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, code: 'invalid_token' };

  const body = new URLSearchParams({
    secret: requireServerEnv('TURNSTILE_SECRET_KEY'),
    response: token,
    idempotency_key: crypto.randomUUID(),
  });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok) return { ok: false, code: 'verification_unavailable' };
    const result = await response.json() as TurnstileResponse;
    const hostname = result.hostname?.toLowerCase();
    if (
      result.success !== true
      || result.action !== input.action
      || !hostname
      || !allowedHostnames().has(hostname)
    ) {
      return { ok: false, code: 'invalid_token' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'verification_unavailable' };
  }
}
