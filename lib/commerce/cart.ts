import 'server-only';

import { z } from 'zod';
import type {
  MarketplaceCartStoreGroup,
  MarketplaceCartViewModel,
} from '@/components/marketplace/view-models';
import {
  clearGuestCartCredential,
  createGuestCartToken,
  readGuestCartCredential,
  writeGuestCartCredential,
  type GuestCartCredential,
} from '@/lib/commerce/guest-cart';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const uuid = z.uuid();
const databaseMoney = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d{1,14}$/u),
]);

const cartSchema = z.object({
  id: uuid,
  status: z.literal('active'),
  currency: z.literal('EGP'),
  expires_at: z.string().min(1).max(64),
  item_count: z.number().int().nonnegative().max(9_900),
  subtotal: databaseMoney,
  coupon: z.object({
    code: z.string().regex(/^[A-Z0-9_-]{3,32}$/u),
    store_id: uuid,
    discount_preview: databaseMoney,
  }).nullable(),
  items: z.array(z.object({
    id: uuid,
    variant_id: uuid,
    product_id: uuid,
    store_id: uuid,
    store: z.object({
      id: uuid,
      name: z.string().min(1).max(180),
      slug: z.string().min(1).max(180),
    }),
    product_name: z.string().min(1).max(200),
    product_slug: z.string().min(1).max(180),
    variant_name: z.string().min(1).max(160).nullable(),
    unit_price: databaseMoney,
    quantity: z.number().int().min(1).max(99),
    max_quantity: z.number().int().min(0).max(99),
    line_total: databaseMoney,
    image_url: z.url().nullable(),
    available: z.boolean(),
  })).max(100),
});

const emptyMoney = { amountMinor: 0, currency: 'EGP' } as const;

export class MarketplaceCartError extends Error {
  constructor(public readonly code: MarketplaceCartErrorCode) {
    super(code);
  }
}

export type MarketplaceCartErrorCode =
  | 'cart_item_limit_reached'
  | 'cart_not_found'
  | 'coupon_invalid'
  | 'quantity_invalid'
  | 'service_unavailable'
  | 'variant_unavailable';

type RpcError = { code?: string; message?: string } | null;
type CartSession =
  | { kind: 'authenticated'; cartId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { kind: 'guest'; credential: GuestCartCredential }
  | { kind: 'none' };

export type MarketplaceCartLoad = {
  model: MarketplaceCartViewModel;
  needsGuestClaim: boolean;
};

function emptyCart(): MarketplaceCartViewModel {
  return {
    groups: [],
    itemCount: 0,
    subtotal: { ...emptyMoney },
    discount: { ...emptyMoney },
    estimatedDelivery: null,
    total: { ...emptyMoney },
    appliedPromoCode: null,
  };
}

function knownRpcMessage(error: RpcError): string {
  const message = error?.message ?? '';
  return [
    'cart_not_found',
    'guest_cart_not_found',
    'cart_item_not_found',
    'variant_unavailable',
    'cart_quantity_limit_reached',
    'invalid_cart_quantity',
    'cart_item_limit_reached',
    'coupon_not_found',
    'coupon_not_active',
    'coupon_not_started',
    'coupon_expired',
    'coupon_usage_limit_reached',
    'coupon_customer_limit_reached',
    'coupon_minimum_not_met',
    'coupon_not_applicable',
    'invalid_coupon_code',
  ].find((candidate) => message.includes(candidate)) ?? '';
}

function toCartError(error: RpcError): MarketplaceCartError {
  switch (knownRpcMessage(error)) {
    case 'cart_not_found':
    case 'guest_cart_not_found':
    case 'cart_item_not_found':
      return new MarketplaceCartError('cart_not_found');
    case 'variant_unavailable':
      return new MarketplaceCartError('variant_unavailable');
    case 'cart_quantity_limit_reached':
    case 'invalid_cart_quantity':
      return new MarketplaceCartError('quantity_invalid');
    case 'cart_item_limit_reached':
      return new MarketplaceCartError('cart_item_limit_reached');
    case 'coupon_not_found':
    case 'coupon_not_active':
    case 'coupon_not_started':
    case 'coupon_expired':
    case 'coupon_usage_limit_reached':
    case 'coupon_customer_limit_reached':
    case 'coupon_minimum_not_met':
    case 'coupon_not_applicable':
    case 'invalid_coupon_code':
      return new MarketplaceCartError('coupon_invalid');
    default:
      return new MarketplaceCartError('service_unavailable');
  }
}

function addSafe(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('marketplace_cart_contract_invalid');
  return total;
}

export function mapMarketplaceCart(value: unknown): MarketplaceCartViewModel {
  const parsed = cartSchema.safeParse(value);
  if (!parsed.success) throw new Error('marketplace_cart_contract_invalid');
  const cart = parsed.data;
  const groups = new Map<string, MarketplaceCartStoreGroup>();
  let itemCount = 0;
  let calculatedSubtotal = 0;

  for (const item of cart.items) {
    const unitPrice = databaseMinorToNumber(item.unit_price);
    const lineTotal = databaseMinorToNumber(item.line_total);
    if (lineTotal !== unitPrice * item.quantity) {
      throw new Error('marketplace_cart_contract_invalid');
    }
    itemCount = addSafe(itemCount, item.quantity);
    calculatedSubtotal = addSafe(calculatedSubtotal, lineTotal);
    const existing = groups.get(item.store.id) ?? {
      store: {
        id: item.store.id,
        name: item.store.name,
        slug: item.store.slug,
        isVerified: true,
      },
      lines: [],
      subtotal: { amountMinor: 0, currency: 'EGP' },
    } satisfies MarketplaceCartStoreGroup;
    existing.lines.push({
      id: item.id,
      variantId: item.variant_id,
      productId: item.product_id,
      productSlug: item.product_slug,
      productName: item.product_name,
      variantLabel: item.variant_name,
      image: item.image_url
        ? { id: `${item.product_id}:cart`, url: item.image_url, alt: item.product_name }
        : null,
      unitPrice: { amountMinor: unitPrice, currency: 'EGP' },
      quantity: item.quantity,
      maxQuantity: item.max_quantity,
      lineTotal: { amountMinor: lineTotal, currency: 'EGP' },
      isAvailable: item.available,
    });
    existing.subtotal.amountMinor = addSafe(existing.subtotal.amountMinor, lineTotal);
    groups.set(item.store.id, existing);
  }

  const subtotal = databaseMinorToNumber(cart.subtotal);
  if (itemCount !== cart.item_count || calculatedSubtotal !== subtotal) {
    throw new Error('marketplace_cart_contract_invalid');
  }
  const discount = cart.coupon
    ? databaseMinorToNumber(cart.coupon.discount_preview)
    : 0;
  if (discount > subtotal) throw new Error('marketplace_cart_contract_invalid');

  return {
    groups: [...groups.values()],
    itemCount,
    subtotal: { amountMinor: subtotal, currency: 'EGP' },
    discount: { amountMinor: discount, currency: 'EGP' },
    estimatedDelivery: null,
    total: { amountMinor: subtotal - discount, currency: 'EGP' },
    appliedPromoCode: cart.coupon?.code ?? null,
  };
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? supabase : null;
}

async function createGuestSession(): Promise<Extract<CartSession, { kind: 'guest' }>> {
  const token = createGuestCartToken();
  const admin = createAdminClient();
  const { data, error } = await (admin as any).rpc('get_or_create_guest_cart', {
    p_guest_token: token,
  });
  if (error) throw toCartError(error);
  const parsed = uuid.safeParse(data);
  if (!parsed.success) throw new MarketplaceCartError('service_unavailable');
  const credential = { cartId: parsed.data, token };
  await writeGuestCartCredential(credential);
  return { kind: 'guest', credential };
}

async function resolveCartSession(input: {
  create: boolean;
  claimGuest: boolean;
  ignorePendingGuest?: boolean;
}): Promise<{ session: CartSession; needsGuestClaim: boolean }> {
  const [supabase, guest] = await Promise.all([
    authenticatedClient(),
    readGuestCartCredential(),
  ]);

  if (supabase) {
    if (guest && !input.claimGuest && !input.ignorePendingGuest) {
      return { session: { kind: 'none' }, needsGuestClaim: true };
    }
    if (guest && input.claimGuest) {
      const { data, error } = await (supabase as any).rpc('claim_my_guest_marketplace_cart', {
        p_cart_id: guest.cartId,
        p_guest_token: guest.token,
      });
      if (!error) {
        const parsed = uuid.safeParse(data);
        if (!parsed.success) throw new MarketplaceCartError('service_unavailable');
        await clearGuestCartCredential();
        return {
          session: { kind: 'authenticated', cartId: parsed.data, supabase },
          needsGuestClaim: false,
        };
      }
      if (knownRpcMessage(error) === 'guest_cart_not_found') {
        await clearGuestCartCredential();
      } else {
        throw toCartError(error);
      }
    }
    const { data, error } = await (supabase as any).rpc('get_or_create_my_marketplace_cart');
    if (error) throw toCartError(error);
    const parsed = uuid.safeParse(data);
    if (!parsed.success) throw new MarketplaceCartError('service_unavailable');
    return {
      session: { kind: 'authenticated', cartId: parsed.data, supabase },
      needsGuestClaim: false,
    };
  }

  if (guest) return { session: { kind: 'guest', credential: guest }, needsGuestClaim: false };
  if (!input.create) return { session: { kind: 'none' }, needsGuestClaim: false };
  return { session: await createGuestSession(), needsGuestClaim: false };
}

async function cartRpc(
  session: Exclude<CartSession, { kind: 'none' }>,
  operation: 'get' | 'add' | 'update' | 'remove' | 'applyCoupon' | 'removeCoupon',
  input: { variantId?: string; quantity?: number; code?: string } = {},
): Promise<unknown> {
  if (session.kind === 'authenticated') {
    const definitions = {
      get: ['get_my_marketplace_cart', { p_cart_id: session.cartId }],
      add: ['add_my_marketplace_cart_item', { p_cart_id: session.cartId, p_variant_id: input.variantId, p_quantity: input.quantity }],
      update: ['update_my_marketplace_cart_item', { p_cart_id: session.cartId, p_variant_id: input.variantId, p_quantity: input.quantity }],
      remove: ['remove_my_marketplace_cart_item', { p_cart_id: session.cartId, p_variant_id: input.variantId }],
      applyCoupon: ['apply_my_marketplace_cart_coupon', { p_cart_id: session.cartId, p_code: input.code }],
      removeCoupon: ['remove_my_marketplace_cart_coupon', { p_cart_id: session.cartId }],
    } as const;
    const [name, args] = definitions[operation];
    const { data, error } = await (session.supabase as any).rpc(name, args);
    if (error) throw toCartError(error);
    return data;
  }

  const admin = createAdminClient();
  const common = {
    p_cart_id: session.credential.cartId,
    p_customer_id: null,
    p_guest_token: session.credential.token,
  };
  const definitions = {
    get: ['get_marketplace_cart', common],
    add: ['add_marketplace_cart_item', { ...common, p_variant_id: input.variantId, p_quantity: input.quantity }],
    update: ['update_marketplace_cart_item', { ...common, p_variant_id: input.variantId, p_quantity: input.quantity }],
    remove: ['remove_marketplace_cart_item', { ...common, p_variant_id: input.variantId }],
    applyCoupon: ['apply_marketplace_cart_coupon', { ...common, p_code: input.code }],
    removeCoupon: ['remove_marketplace_cart_coupon', common],
  } as const;
  const [name, args] = definitions[operation];
  const { data, error } = await (admin as any).rpc(name, args);
  if (error) throw toCartError(error);
  return data;
}

export async function loadMarketplaceCart(input: {
  claimGuest?: boolean;
  ignorePendingGuest?: boolean;
} = {}): Promise<MarketplaceCartLoad> {
  const resolved = await resolveCartSession({
    create: false,
    claimGuest: input.claimGuest ?? false,
    ignorePendingGuest: input.ignorePendingGuest,
  });
  if (resolved.session.kind === 'none') {
    return { model: emptyCart(), needsGuestClaim: resolved.needsGuestClaim };
  }
  try {
    return {
      model: mapMarketplaceCart(await cartRpc(resolved.session, 'get')),
      needsGuestClaim: false,
    };
  } catch (error) {
    if (error instanceof MarketplaceCartError && error.code === 'cart_not_found') {
      return { model: emptyCart(), needsGuestClaim: false };
    }
    throw error;
  }
}

async function mutateCart(
  operation: 'add' | 'update' | 'remove' | 'applyCoupon' | 'removeCoupon',
  input: { variantId?: string; quantity?: number; code?: string },
): Promise<MarketplaceCartViewModel> {
  let resolved = await resolveCartSession({ create: true, claimGuest: true });
  if (resolved.session.kind === 'none') throw new MarketplaceCartError('service_unavailable');
  try {
    const result = await cartRpc(resolved.session, operation, input);
    if (operation === 'applyCoupon' || operation === 'removeCoupon') {
      return mapMarketplaceCart(await cartRpc(resolved.session, 'get'));
    }
    return mapMarketplaceCart(result);
  } catch (error) {
    if (
      resolved.session.kind === 'guest'
      && error instanceof MarketplaceCartError
      && error.code === 'cart_not_found'
    ) {
      await clearGuestCartCredential();
      const guestSession = await createGuestSession();
      resolved = { session: guestSession, needsGuestClaim: false };
      const result = await cartRpc(guestSession, operation, input);
      if (operation === 'applyCoupon' || operation === 'removeCoupon') {
        return mapMarketplaceCart(await cartRpc(guestSession, 'get'));
      }
      return mapMarketplaceCart(result);
    }
    throw error;
  }
}

export function addMarketplaceCartItem(variantId: string, quantity: number) {
  return mutateCart('add', { variantId, quantity });
}

export function updateMarketplaceCartItem(variantId: string, quantity: number) {
  return mutateCart('update', { variantId, quantity });
}

export function removeMarketplaceCartItem(variantId: string) {
  return mutateCart('remove', { variantId });
}

export function applyMarketplaceCartCoupon(code: string) {
  return mutateCart('applyCoupon', { code });
}

export function removeMarketplaceCartCoupon() {
  return mutateCart('removeCoupon', {});
}

/** Claim and merge a pending guest cart from a Server Action or Route Handler. */
export async function claimMarketplaceGuestCart(): Promise<void> {
  await resolveCartSession({ create: false, claimGuest: true });
}

/** Resolve an authenticated cart from trusted session state for checkout RPCs. */
export async function resolveAuthenticatedMarketplaceCart(): Promise<{
  cartId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
} | null> {
  const resolved = await resolveCartSession({ create: false, claimGuest: true });
  if (resolved.session.kind !== 'authenticated') return null;
  return {
    cartId: resolved.session.cartId,
    supabase: resolved.session.supabase,
  };
}

/** Resolve and read the checkout cart with one authentication/session pass. */
export async function loadMarketplaceCartForCheckout(): Promise<{
  model: MarketplaceCartViewModel;
  needsGuestClaim: boolean;
  authenticated: {
    cartId: string;
    supabase: Awaited<ReturnType<typeof createClient>>;
  } | null;
}> {
  const resolved = await resolveCartSession({ create: false, claimGuest: false });
  if (resolved.session.kind === 'none') {
    return {
      model: emptyCart(),
      authenticated: null,
      needsGuestClaim: resolved.needsGuestClaim,
    };
  }
  try {
    const model = mapMarketplaceCart(await cartRpc(resolved.session, 'get'));
    return {
      model,
      needsGuestClaim: false,
      authenticated: resolved.session.kind === 'authenticated'
        ? { cartId: resolved.session.cartId, supabase: resolved.session.supabase }
        : null,
    };
  } catch (error) {
    if (error instanceof MarketplaceCartError && error.code === 'cart_not_found') {
      return { model: emptyCart(), authenticated: null, needsGuestClaim: false };
    }
    throw error;
  }
}
