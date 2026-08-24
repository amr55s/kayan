import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const storageCdnUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || process.env.DO_SPACES_CDN_BASE_URL;
const storageEndpointUrl = process.env.OBJECT_STORAGE_ENDPOINT || process.env.DO_SPACES_ENDPOINT;
const spacesCdnPattern = (() => {
  if (!storageCdnUrl) return null;
  try {
    const url = new URL(storageCdnUrl);
    return { protocol: 'https' as const, hostname: url.hostname, pathname: '/**' };
  } catch {
    return null;
  }
})();
const storageEndpointSource = (() => {
  if (!storageEndpointUrl) return null;
  try {
    const url = new URL(storageEndpointUrl);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
})();

const imageSources = [
  "'self'",
  'data:',
  'blob:',
  'https://images.unsplash.com',
  'https://*.supabase.co',
  'https://*.digitaloceanspaces.com',
  'https://*.r2.dev',
  spacesCdnPattern ? `https://${spacesCdnPattern.hostname}` : null,
].filter(Boolean).join(' ');

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', 'sharp'],
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31_536_000,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.digitaloceanspaces.com',
      },
      ...(spacesCdnPattern ? [spacesCdnPattern] : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
      {
        source: '/offline.html',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src ${imageSources}; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.digitaloceanspaces.com https://*.r2.cloudflarestorage.com${storageEndpointSource ? ` ${storageEndpointSource}` : ''} https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; font-src 'self' data:; object-src 'none';`,
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || 'city-spot-gs',
  project: process.env.SENTRY_PROJECT || 'javascript-nextjs',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
