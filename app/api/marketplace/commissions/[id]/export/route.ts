import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import { getCurrentProfile } from '@/lib/auth/guards';
import {
  createCommissionStatementCsv,
  createCommissionStatementWorkbook,
} from '@/lib/commerce/excel/commission-statement-workbook';
import { getMyCommissionStatement } from '@/lib/commerce/operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function privateHeaders(contentType: string, filename: string) {
  return {
    'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const format = new URL(request.url).searchParams.get('format') ?? 'xlsx';
  if (format !== 'xlsx' && format !== 'csv') {
    return Response.json({ error: 'invalid_export_format' }, {
      status: 400,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  try {
    const profile = await getCurrentProfile();
    if (!profile?.is_active || !['merchant', 'admin'].includes(profile.role)) {
      return Response.json({ error: 'commission_export_not_found' }, {
        status: 404,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    if (profile.role === 'admin') {
      try {
        await requireMarketplaceAdminRole(['finance'], { failureMode: 'throw' });
      } catch {
        return Response.json({ error: 'commission_export_not_found' }, {
          status: 404,
          headers: { 'cache-control': 'private, no-store' },
        });
      }
    }

    // This auth-bound RPC returns merchant-owned statements only. For an admin,
    // the database independently requires the finance/super_admin capability.
    const { id } = await params;
    const statement = await getMyCommissionStatement(id);
    if (!statement) {
      return Response.json({ error: 'commission_export_not_found' }, {
        status: 404,
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    const stem = `dairtak-commission-${statement.id.slice(0, 8)}-${statement.period_start}`;
    if (format === 'csv') {
      return new Response(new Uint8Array(createCommissionStatementCsv(statement)), {
        headers: privateHeaders('text/csv; charset=utf-8', `${stem}.csv`),
      });
    }
    const workbook = await createCommissionStatementWorkbook(statement);
    return new Response(new Uint8Array(workbook), {
      headers: privateHeaders(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `${stem}.xlsx`,
      ),
    });
  } catch {
    return Response.json({ error: 'commission_export_unavailable' }, {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
