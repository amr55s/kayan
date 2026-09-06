export type OAuthOriginOptions = {
  environment?: string;
  configuredSiteUrl?: string;
  deploymentHost?: string;
  branchHost?: string;
  requestOrigin?: string | null;
};

const UNSAFE_URL_CHARACTERS = /[\\\u0000-\u0020\u007f]/u;
const VERCEL_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/u;

function platformOrigin(host: string | undefined): string | null {
  if (!host || host.length > 253 || !VERCEL_HOST.test(host)) return null;
  // Platform variables contain a hostname, not a URL, path, port or credential.
  return `https://${host}`;
}

function configuredOrigin(value: string | undefined): string {
  if (!value) throw new Error('site_url_missing');
  if (UNSAFE_URL_CHARACTERS.test(value)) throw new Error('site_url_invalid');
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== 'https:'
    && !(url.protocol === 'http:' && url.hostname === 'localhost'))) {
    throw new Error('site_url_invalid');
  }
  return url.origin;
}

/**
 * A Preview OAuth round trip must stay on the cookie's original origin. Never
 * trust arbitrary forwarded/request hosts or the possibly stale site URL there.
 * Production and local development retain their explicitly configured origin.
 */
export function resolveOAuthSiteOrigin(options: OAuthOriginOptions): string {
  if (options.environment !== 'preview') return configuredOrigin(options.configuredSiteUrl);

  const allowed = [platformOrigin(options.deploymentHost), platformOrigin(options.branchHost)]
    .filter((origin): origin is string => origin !== null);
  if (!allowed.length) throw new Error('oauth_preview_origin_unconfigured');
  if (options.requestOrigin === undefined || options.requestOrigin === null) return allowed[0];

  const value = options.requestOrigin;
  if (!value || UNSAFE_URL_CHARACTERS.test(value)) throw new Error('oauth_preview_origin_untrusted');
  let request: URL;
  try { request = new URL(value); } catch { throw new Error('oauth_preview_origin_untrusted'); }
  if (request.username || request.password || request.pathname !== '/' || request.search || request.hash
    || request.protocol !== 'https:' || !allowed.includes(request.origin)) {
    throw new Error('oauth_preview_origin_untrusted');
  }
  return request.origin;
}
