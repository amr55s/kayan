export function egpToMinor(value: unknown): number {
  if (typeof value === 'number') {
    const minor = Math.round(value * 100);
    if (!Number.isFinite(value) || !Number.isSafeInteger(minor) || value < 0) {
      throw new Error('invalid_egp_amount');
    }
    return minor;
  }

  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error('invalid_egp_amount');
  }
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('invalid_egp_amount');
  return minor;
}

export function minorToEgp(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_minor_amount');
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Convert a PostgREST bigint/piastre value without applying an EGP multiplier. */
export function databaseMinorToNumber(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_minor_amount');
    return value;
  }
  if (!/^\d{1,14}$/u.test(value)) throw new Error('invalid_minor_amount');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('invalid_minor_amount');
  return parsed;
}
