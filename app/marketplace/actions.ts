'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  parseAddCartItemFormData,
  parseMarketplaceCouponFormData,
  parseMarketplaceCheckoutFormData,
  parseRemoveCartItemFormData,
  parseUpdateCartItemFormData,
} from '@/lib/commerce/cart-input';
import {
  addMarketplaceCartItem,
  applyMarketplaceCartCoupon,
  MarketplaceCartError,
  removeMarketplaceCartCoupon,
  removeMarketplaceCartItem,
  updateMarketplaceCartItem,
} from '@/lib/commerce/cart';
import {
  MarketplaceCheckoutError,
  submitMarketplaceCheckout,
} from '@/lib/commerce/checkout';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function cartErrorLocation(error: unknown): string {
  if (!(error instanceof MarketplaceCartError)) {
    return '/marketplace/cart?error=service_unavailable';
  }
  const codes: Record<MarketplaceCartError['code'], string> = {
    cart_item_limit_reached: 'item_limit',
    cart_not_found: 'cart_expired',
    coupon_invalid: 'coupon_invalid',
    quantity_invalid: 'quantity_invalid',
    service_unavailable: 'service_unavailable',
    variant_unavailable: 'variant_unavailable',
  };
  return `/marketplace/cart?error=${codes[error.code]}`;
}

function refreshCartPages() {
  revalidatePath('/marketplace/cart');
  revalidatePath('/marketplace/checkout');
  revalidatePath('/checkout');
}

export async function addMarketplaceCartItemAction(formData: FormData): Promise<void> {
  const parsed = parseAddCartItemFormData(formData);
  if (!parsed.success) redirect('/marketplace/cart?error=invalid_item');
  try {
    await addMarketplaceCartItem(parsed.data.variantId, parsed.data.quantity);
  } catch (error) {
    redirect(cartErrorLocation(error));
  }
  refreshCartPages();
  redirect('/marketplace/cart?notice=added');
}

export async function updateMarketplaceCartItemAction(formData: FormData): Promise<void> {
  const parsed = parseUpdateCartItemFormData(formData);
  if (!parsed.success) redirect('/marketplace/cart?error=quantity_invalid');
  try {
    await updateMarketplaceCartItem(parsed.data.variantId, parsed.data.quantity);
  } catch (error) {
    redirect(cartErrorLocation(error));
  }
  refreshCartPages();
  redirect('/marketplace/cart?notice=updated');
}

export async function removeMarketplaceCartItemAction(formData: FormData): Promise<void> {
  const parsed = parseRemoveCartItemFormData(formData);
  if (!parsed.success) redirect('/marketplace/cart?error=invalid_item');
  try {
    await removeMarketplaceCartItem(parsed.data.variantId);
  } catch (error) {
    redirect(cartErrorLocation(error));
  }
  refreshCartPages();
  redirect('/marketplace/cart?notice=removed');
}

export async function applyMarketplaceCartCouponAction(formData: FormData): Promise<void> {
  const parsed = parseMarketplaceCouponFormData(formData);
  if (!parsed.success) redirect('/marketplace/cart?error=coupon_invalid');
  try {
    await applyMarketplaceCartCoupon(parsed.data.promoCode);
  } catch (error) {
    redirect(cartErrorLocation(error));
  }
  refreshCartPages();
  redirect('/marketplace/cart?notice=coupon_applied');
}

export async function removeMarketplaceCartCouponAction(): Promise<void> {
  try {
    await removeMarketplaceCartCoupon();
  } catch (error) {
    redirect(cartErrorLocation(error));
  }
  refreshCartPages();
  redirect('/marketplace/cart?notice=coupon_removed');
}

function checkoutErrorLocation(error: unknown): string {
  if (!(error instanceof MarketplaceCheckoutError)) {
    return '/marketplace/checkout?error=service_unavailable';
  }
  if (error.code === 'authentication_required') {
    return '/signin?next=%2Fmarketplace%2Fcheckout';
  }
  return `/marketplace/checkout?error=${error.code}`;
}

function parseDeliveryModes(formData: FormData): Record<string, 'platform' | 'self'> | null {
  const modes: Record<string, 'platform' | 'self'> = {};
  let count = 0;
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith('deliveryMode:')) continue;
    const storeId = name.slice('deliveryMode:'.length);
    if (
      typeof value !== 'string'
      || !UUID_PATTERN.test(storeId)
      || (value !== 'platform' && value !== 'self')
      || Object.hasOwn(modes, storeId)
      || ++count > 100
    ) return null;
    modes[storeId] = value;
  }
  return modes;
}

function requestIp(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get('x-vercel-forwarded-for')
    ?? requestHeaders.get('x-forwarded-for');
  const first = forwarded?.split(',', 1)[0]?.trim() ?? '';
  return first && first.length <= 64 ? first : null;
}

export async function submitMarketplaceCheckoutAction(formData: FormData): Promise<void> {
  const parsed = parseMarketplaceCheckoutFormData(formData);
  const deliveryModes = parseDeliveryModes(formData);
  if (!parsed.success || !deliveryModes) {
    redirect('/marketplace/checkout?error=invalid_form');
  }

  let destination: string;
  try {
    const requestHeaders = await headers();
    const result = await submitMarketplaceCheckout({
      form: parsed.data,
      deliveryModes,
      remoteIp: requestIp(requestHeaders),
    });
    destination = `/marketplace/orders/${result.orderGroupId}?placed=1`;
  } catch (error) {
    destination = checkoutErrorLocation(error);
  }

  revalidatePath('/marketplace/cart');
  revalidatePath('/marketplace/checkout');
  revalidatePath('/marketplace/orders');
  redirect(destination);
}
