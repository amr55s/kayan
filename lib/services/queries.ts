import 'server-only';

import { createPublicClient } from '@/lib/supabase/public';
import { z } from 'zod';

export type PublicServiceListing = {
  address: string | null;
  category: string;
  description: string | null;
  id: string;
  images: string[];
  isFeatured: boolean;
  title: string;
};

const PAGE_SIZE = 24;

export type PublicDriverSummary = {
  id: string;
  name: string;
  vehicleType: string | null;
};

export async function fetchPublicServices(input: {
  category?: string;
  page: number;
  query?: string;
}): Promise<{ items: PublicServiceListing[]; pageCount: number; total: number }> {
  const supabase = createPublicClient();
  const from = (input.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = (supabase as any)
    .from('places')
    .select('id,title,category,description,address,images,is_featured', { count: 'exact' })
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (input.category && input.category !== 'all') {
    query = query.eq('category', input.category);
  }
  const normalizedQuery = input.query?.trim().slice(0, 80);
  if (normalizedQuery) {
    const escaped = normalizedQuery.replace(/[\\%_]/gu, (character) => `\\${character}`);
    query = query.ilike('title', `%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`public_services_query_failed:${error.code ?? 'unknown'}`);
  const total = typeof count === 'number' ? count : 0;

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: (data ?? []).map((row: any) => ({
      address: row.address || null,
      category: row.category,
      description: row.description || null,
      id: row.id,
      images: Array.isArray(row.images) ? row.images.slice(0, 3) : [],
      isFeatured: Boolean(row.is_featured),
      title: row.title,
    })),
  };
}

export async function fetchPublicDriverSummaries(
  limit = 4,
): Promise<PublicDriverSummary[]> {
  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const supabase = createPublicClient();
  const { data, error } = await (supabase as any).rpc('list_public_driver_summaries', {
    p_limit: safeLimit,
  });
  if (error) {
    throw new Error('public_driver_summaries_unavailable');
  }
  const parsed = z.array(z.object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
    vehicle_type: z.string().max(80).nullable(),
  })).max(safeLimit).safeParse(data);
  if (!parsed.success) throw new Error('public_driver_summaries_invalid_contract');
  return parsed.data.map((row) => ({
    id: row.id,
    name: row.name.trim() || 'كابتن توصيل',
    vehicleType: row.vehicle_type?.trim() || null,
  }));
}
