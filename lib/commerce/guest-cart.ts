import 'server-only';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

const GUEST_CART_COOKIE = 'dairtak_guest_cart';
const GUEST_CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CART_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export type GuestCartCredential = {
  cartId: string;
  token: string;
};

export function createGuestCartToken(): string {
  return randomBytes(32).toString('base64url');
}
export function serializeGuestCartCredential(value: GuestCartCredential): string {
  if (!CART_ID_PATTERN.test(value.cartId) || !TOKEN_PATTERN.test(value.token)) {
    throw new Error('invalid_guest_cart_credential');
  }
  return `${value.cartId}.${value.token}`;
}

export function parseGuestCartCredential(
  value: string | null | undefined,
): GuestCartCredential | null {
  if (!value || value.length > 100) return null;
  const separator = value.indexOf('.');
  if (separator < 1 || value.indexOf('.', separator + 1) !== -1) return null;
  const cartId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (!CART_ID_PATTERN.test(cartId) || !TOKEN_PATTERN.test(token)) return null;
  return { cartId, token };
}

export async function readGuestCartCredential(): Promise<GuestCartCredential | null> {
  const store = await cookies();
  return parseGuestCartCredential(store.get(GUEST_CART_COOKIE)?.value);
}

export async function writeGuestCartCredential(
  credential: GuestCartCredential,
): Promise<void> {
  const store = await cookies();
  store.set(GUEST_CART_COOKIE, serializeGuestCartCredential(credential), {
    httpOnly: true,
    maxAge: GUEST_CART_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearGuestCartCredential(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_CART_COOKIE);
}
