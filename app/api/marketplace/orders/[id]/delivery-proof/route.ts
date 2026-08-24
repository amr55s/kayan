import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ assetId: z.uuid() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: 'order_not_found' }, { status: 404 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'invalid_delivery_proof' }, { status: 400 });
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: 'authentication_required' }, { status: 401 });
  const { data, error } = await (supabase as any).rpc('attach_my_marketplace_delivery_proof', {
    p_order_id: id, p_asset_id: body.data.assetId,
  });
  if (error) {
    const status = /not_found/u.test(error.message ?? '') ? 404 : /access|required|invalid/u.test(error.message ?? '') ? 403 : 503;
    return Response.json({ error: status === 503 ? 'delivery_proof_unavailable' : 'delivery_proof_not_allowed' }, { status });
  }
  return Response.json({ attached: true, assetId: data?.asset_id ?? body.data.assetId }, { headers: { 'cache-control': 'no-store' } });
}
