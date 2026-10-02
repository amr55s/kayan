import { NextResponse } from 'next/server';
import { marketplaceStatusLabels } from '@/components/commerce-operations/order-status';
import { getCurrentProfile } from '@/lib/auth/guards';
import { listMyMarketplaceOrders, type MarketplaceOrderSummary } from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

const MAX_ORDERS = 2_000;
const PAGE_SIZE = 100;

/** Quotes a cell and neutralises values a spreadsheet would run as a formula. */
function cell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""')}"`;
}

/** Every order the signed-in merchant can see, newest first, as an Excel-readable CSV. */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'merchant') {
    return new NextResponse('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
  }

  const orders: MarketplaceOrderSummary[] = [];
  let before: string | null = null;
  try {
    while (orders.length < MAX_ORDERS) {
      const page = await listMyMarketplaceOrders({ limit: PAGE_SIZE, before });
      orders.push(...page);
      if (page.length < PAGE_SIZE) break;
      before = page[page.length - 1]!.createdAt;
    }
  } catch {
    return new NextResponse('Service unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  const rows = [
    ['رقم الطلب', 'المتجر', 'الحالة', 'الإجمالي (جنيه)', 'تاريخ الطلب', 'آخر تحديث'].map(cell).join(','),
    ...orders.map((order) => [
      order.publicCode,
      order.storeName,
      marketplaceStatusLabels[order.status],
      (order.grandTotalMinor / 100).toFixed(2),
      order.createdAt.slice(0, 16).replace('T', ' '),
      order.updatedAt.slice(0, 16).replace('T', ' '),
    ].map(cell).join(',')),
  ];
  // The byte-order mark makes Excel read the Arabic columns as UTF-8.
  const body = `﻿${rows.join('\r\n')}\r\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="dairtak-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
