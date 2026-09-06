/** Google metadata is presentation only, never a source of permissions. */
export function googleAvatarForPresentation(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !(url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) return null;
    return url.href;
  } catch { return null; }
}

export function profileInitials(displayName: string): string {
  return displayName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('') || 'د';
}
