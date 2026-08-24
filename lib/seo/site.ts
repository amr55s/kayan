const PRODUCTION_SITE_URL = 'https://kayan-hazel.vercel.app';

export function getPublicSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
        url.pathname = '/';
        url.search = '';
        url.hash = '';
        return url;
      }
    } catch {
      // Metadata must remain available even when an optional URL is malformed.
    }
  }
  return new URL(PRODUCTION_SITE_URL);
}

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, getPublicSiteUrl()).toString();
}
