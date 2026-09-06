import type { MetadataRoute } from 'next';
import { z } from 'zod';
import { createPublicClient } from '@/lib/supabase/public';
import { absoluteSiteUrl } from '@/lib/seo/site';

const SITEMAP_PAGE_SIZE = 50_000;
const MAX_SITEMAP_FILES = 10_000;

export const revalidate = 3600;

const countSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/u).transform(Number),
]);
const rowSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(200),
  updated_at: z.iso.datetime({ offset: true }),
});

async function fetchProductCount(): Promise<number> {
  try {
    const client = createPublicClient();
    const { data, error } = await (client as any).rpc('count_marketplace_sitemap_products');
    if (error) return 0;
    const parsed = countSchema.safeParse(data);
    return parsed.success && Number.isSafeInteger(parsed.data) ? parsed.data : 0;
  } catch {
    return 0;
  }
}

async function fetchProductPage(page: number): Promise<z.infer<typeof rowSchema>[]> {
  try {
    const client = createPublicClient();
    const { data, error } = await (client as any).rpc('list_marketplace_sitemap_products', {
      p_page: page,
      p_page_size: SITEMAP_PAGE_SIZE,
    });
    if (error) return [];
    const parsed = z.array(rowSchema).max(SITEMAP_PAGE_SIZE).safeParse(data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const count = await fetchProductCount();
  const files = Math.min(MAX_SITEMAP_FILES, Math.max(1, Math.ceil(count / SITEMAP_PAGE_SIZE)));
  return Array.from({ length: files }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (!Number.isSafeInteger(id) || id < 0 || id >= MAX_SITEMAP_FILES) return [];
  const staticEntries: MetadataRoute.Sitemap = id === 0
    ? [
        { url: absoluteSiteUrl('/marketplace'), changeFrequency: 'daily', priority: 1 },
        { url: absoluteSiteUrl('/services'), changeFrequency: 'daily', priority: 0.7 },
      ]
    : [];
  const products = await fetchProductPage(id + 1);
  return [
    ...staticEntries,
    ...products.map((product) => ({
      url: absoluteSiteUrl(`/marketplace/products/${product.id}/${product.slug}`),
      lastModified: new Date(product.updated_at),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
