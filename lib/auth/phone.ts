const EGYPTIAN_PHONE_PATTERN = /^01[0125]\d{8}$/;
const INTERNAL_AUTH_DOMAIN = 'users.kayanhub.app';

export function normalizeEgyptianPhone(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('0020')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('20')) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 && digits.startsWith('1')) {
    digits = `0${digits}`;
  }

  return digits;
}

export function isEgyptianPhone(value: string): boolean {
  return EGYPTIAN_PHONE_PATTERN.test(normalizeEgyptianPhone(value));
}

/**
 * Supabase phone/password sign-in requires the hosted Phone provider.
 * Use a deterministic, non-public email identity so the UI can keep phone-based
 * login without requiring an SMS provider.
 */
export function authEmailForPhone(value: string): string {
  return `${normalizeEgyptianPhone(value)}@${INTERNAL_AUTH_DOMAIN}`;
}
