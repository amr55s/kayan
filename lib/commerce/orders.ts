import 'server-only';

import { z } from 'zod';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { createClient } from '@/lib/supabase/server';

const uuid = z.uuid();
const databaseMoney = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d{1,14}$/u),
]);

const orderGroupSchema = z.object({
  id: uuid,
  public_code: z.string().min(8).max(64),
  status: z.enum(['active', 'completed']),
  currency: z.literal('EGP'),
  subtotal_piastres: databaseMoney,
  discount_total_piastres: databaseMoney,
  delivery_total_piastres: databaseMoney,
  grand_total_piastres: databaseMoney,
  delivery_notes: z.string().max(500).nullable(),
  placed_at: z.string().min(1).max(64),
  orders: z.array(z.object({
    id: uuid,
    public_code: z.string().min(8).max(64),
    store_id: uuid,
    store_name: z.string().min(1).max(180),
    status: z.enum([
      'pending_confirmation', 'confirmed', 'preparing', 'ready_for_pickup',
      'out_for_delivery', 'delivery_failed', 'delivered', 'cancelled', 'rejected',
      'issue', 'return_requested', 'return_approved', 'returned',
    ]),
    payment_method: z.literal('cod'),
    payment_status: z.string().min(1).max(40),
    delivery_mode: z.enum(['platform', 'self']),
    subtotal_piastres: databaseMoney,
    discount_total_piastres: databaseMoney,
    delivery_fee_piastres: databaseMoney,
    grand_total_piastres: databaseMoney,
    created_at: z.string().min(1).max(64),
    updated_at: z.string().min(1).max(64),
    items: z.array(z.object({
      id: uuid,
      product_id: uuid,
      variant_id: uuid,
      product_name: z.string().min(1).max(200),
      variant_name: z.string().max(160).nullable(),
      image_url: z.url().nullable(),
      unit_price_piastres: databaseMoney,
      quantity: z.number().int().min(1).max(99),
      line_total_piastres: databaseMoney,
    })).min(1).max(100),
  })).min(1).max(100),
});

export type MarketplaceOrderGroup = {
  id: string;
  publicCode: string;
  status: 'active' | 'completed';
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  grandTotalMinor: number;
  deliveryNotes: string | null;
  placedAt: string;
  orders: Array<{
    id: string;
    publicCode: string;
    storeName: string;
    status: z.infer<typeof orderGroupSchema>['orders'][number]['status'];
    deliveryMode: 'platform' | 'self';
    deliveryFeeMinor: number;
    grandTotalMinor: number;
    items: Array<{
      id: string;
      productId: string;
      variantId: string;
      productName: string;
      variantName: string | null;
      imageUrl: string | null;
      unitPriceMinor: number;
      quantity: number;
      lineTotalMinor: number;
    }>;
  }>;
};

export async function fetchMyMarketplaceOrderGroup(
  orderGroupId: string,
): Promise<'authentication_required' | MarketplaceOrderGroup | null> {
  if (!uuid.safeParse(orderGroupId).success) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'authentication_required';
  const { data, error } = await (supabase as any).rpc('get_my_marketplace_order_group', {
    p_order_group_id: orderGroupId,
  });
  if (error) {
    if ((error.message ?? '').includes('order_group_not_found')) return null;
    throw new Error('marketplace_order_query_failed');
  }
  const parsed = orderGroupSchema.safeParse(data);
  if (!parsed.success) throw new Error('marketplace_order_contract_invalid');
  const value = parsed.data;
  return {
    id: value.id,
    publicCode: value.public_code,
    status: value.status,
    subtotalMinor: databaseMinorToNumber(value.subtotal_piastres),
    discountMinor: databaseMinorToNumber(value.discount_total_piastres),
    deliveryMinor: databaseMinorToNumber(value.delivery_total_piastres),
    grandTotalMinor: databaseMinorToNumber(value.grand_total_piastres),
    deliveryNotes: value.delivery_notes,
    placedAt: value.placed_at,
    orders: value.orders.map((order) => ({
      id: order.id,
      publicCode: order.public_code,
      storeName: order.store_name,
      status: order.status,
      deliveryMode: order.delivery_mode,
      deliveryFeeMinor: databaseMinorToNumber(order.delivery_fee_piastres),
      grandTotalMinor: databaseMinorToNumber(order.grand_total_piastres),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        imageUrl: item.image_url,
        unitPriceMinor: databaseMinorToNumber(item.unit_price_piastres),
        quantity: item.quantity,
        lineTotalMinor: databaseMinorToNumber(item.line_total_piastres),
      })),
    })),
  };
}
