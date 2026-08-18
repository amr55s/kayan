const NAVIGATION_ORIGIN = 'https://navigation.invalid';

/** Accepts an app-local destination and rejects browser URL normalization tricks. */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value
    || value.length > 500
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) return '/marketplace';
  try {
    const resolved = new URL(value, NAVIGATION_ORIGIN);
    if (resolved.origin !== NAVIGATION_ORIGIN) return '/marketplace';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/marketplace';
  }
}
