import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAal2 } from '@/lib/auth/guards';

export class CommerceAccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    public readonly code: 'authentication_required' | 'forbidden' | 'entity_not_found',
  ) {
    super(code);
  }
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new CommerceAccessError(401, 'authentication_required');
  return user;
}

export async function requireMerchantAccess(merchantId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('id,role,merchant_id,is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_active && profile.role === 'admin') {
    await requireAdminAal2({ failureMode: 'throw' });
    return { user, merchantId, isAdmin: true };
  }
  if (profile?.is_active && profile.role === 'merchant' && profile.merchant_id === merchantId) {
    return { user, merchantId, isAdmin: false };
  }

  // Additive multi-store memberships are preferred for marketplace users. The
  // legacy profile relation remains supported while existing staff migrate.
  const { data: membership } = await (admin as any)
    .from('merchant_memberships')
    .select('merchant_id,is_active')
    .eq('user_id', user.id)
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .maybeSingle();
  if (!membership) throw new CommerceAccessError(403, 'forbidden');
  return { user, merchantId, isAdmin: false };
}

export async function requireMerchantEntity(input: {
  entityId: string;
  merchantId: string;
  purpose: 'product' | 'store';
}) {
  const access = await requireMerchantAccess(input.merchantId);
  const admin = createAdminClient();
  if (input.purpose === 'store') {
    const { data } = await (admin as any)
      .from('stores')
      .select('id,merchant_id')
      .eq('id', input.entityId)
      .eq('merchant_id', input.merchantId)
      .maybeSingle();
    if (!data) throw new CommerceAccessError(404, 'entity_not_found');
    return { ...access, storeId: data.id as string };
  }

  const { data: product } = await (admin as any)
    .from('products')
    .select('id,store_id')
    .eq('id', input.entityId)
    .maybeSingle();
  if (!product) throw new CommerceAccessError(404, 'entity_not_found');
  const { data: store } = await (admin as any)
    .from('stores')
    .select('id')
    .eq('id', product.store_id)
    .eq('merchant_id', input.merchantId)
    .maybeSingle();
  if (!store) throw new CommerceAccessError(404, 'entity_not_found');
  return { ...access, storeId: store.id as string };
}

async function requireDeliveryProofParticipant(orderId: string, mode: 'upload' | 'read') {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient() as any;
  const { data: order } = await admin
    .from('marketplace_orders')
    .select('id,store_id,customer_id,delivery_mode,status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) throw new CommerceAccessError(404, 'entity_not_found');
  if (mode === 'upload' && order.status !== 'out_for_delivery') {
    throw new CommerceAccessError(403, 'forbidden');
  }

  const { data: store } = await admin
    .from('stores')
    .select('id,merchant_id')
    .eq('id', order.store_id)
    .maybeSingle();
  if (!store) throw new CommerceAccessError(404, 'entity_not_found');

  const [{ data: profile }, { data: assignment }, { data: customer }, { data: canFulfill }] = await Promise.all([
    admin.from('profiles').select('id,role,is_active').eq('id', user.id).maybeSingle(),
    admin.from('marketplace_delivery_assignments')
      .select('driver_id,status')
      .eq('order_id', orderId)
      .maybeSingle(),
    admin.from('marketplace_customers')
      .select('id')
      .eq('id', order.customer_id)
      .eq('auth_user_id', user.id)
      .maybeSingle(),
    (await createClient() as any).rpc('can_fulfill_store', { p_store_id: store.id }),
  ]);

  const isAdmin = profile?.is_active && profile.role === 'admin';
  if (isAdmin) await requireAdminAal2({ failureMode: 'throw' });
  const isAssignedDriver = profile?.is_active
    && profile.role === 'driver'
    && order.delivery_mode === 'platform'
    && assignment?.driver_id === user.id
    && (mode === 'read' || ['assigned', 'picked_up', 'issue'].includes(assignment.status));
  const isCustomer = mode === 'read' && Boolean(customer);
  const isStoreStaff = mode === 'read' && canFulfill === true;
  if (!isAdmin && !isAssignedDriver && !isCustomer && !isStoreStaff) {
    throw new CommerceAccessError(403, 'forbidden');
  }

  return {
    user,
    merchantId: store.merchant_id as string,
    storeId: store.id as string,
    orderId: order.id as string,
  };
}

export function requireDeliveryProofAccess(orderId: string) {
  return requireDeliveryProofParticipant(orderId, 'upload');
}

export function requireDeliveryProofReadAccess(orderId: string) {
  return requireDeliveryProofParticipant(orderId, 'read');
}
