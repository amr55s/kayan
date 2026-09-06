import { createMerchantCatalogExport } from '@/lib/commerce/merchant-excel';
import { MerchantCatalogError } from '@/lib/commerce/merchant-products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const storeId = new URL(request.url).searchParams.get('store') ?? '';
  try {
    const workbook = await createMerchantCatalogExport(storeId);
    return new Response(new Uint8Array(workbook), {
      status: 200,
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': `attachment; filename="dairtak-products-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const status = error instanceof MerchantCatalogError && error.code === 'access_denied'
      ? 403
      : error instanceof MerchantCatalogError && error.code === 'invalid_input' ? 400 : 503;
    return Response.json({ error: 'catalog_export_unavailable' }, {
      status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
