import type { MetadataRoute } from 'next';
import { absoluteSiteUrl, getPublicSiteUrl } from '@/lib/seo/site';
import { generateSitemaps } from './sitemap';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemapFiles = await generateSitemaps();
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/marketplace', '/marketplace/products/', '/services'],
      disallow: [
        '/account',
        '/admin',
        '/api',
        '/auth',
        '/driver',
        '/login',
        '/merchant',
        '/monitoring',
        '/orders',
        '/signin',
        '/marketplace/cart',
        '/marketplace/checkout',
        '/marketplace/orders',
      ],
    },
    sitemap: sitemapFiles.map(({ id }) => absoluteSiteUrl(`/sitemap/${id}.xml`)),
    host: getPublicSiteUrl().origin,
  };
}
