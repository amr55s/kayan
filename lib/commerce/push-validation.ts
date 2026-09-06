const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);

export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return EXACT_PUSH_HOSTS.has(hostname)
      || /^[a-z0-9-]+\.notify\.windows\.com$/u.test(hostname);
  } catch {
    return false;
  }
}
