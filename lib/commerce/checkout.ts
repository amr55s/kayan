import 'server-only';

import { z } from 'zod';
import type {
  MarketplaceCheckoutViewModel,
  MarketplaceDeliveryZone,
} from '@/components/marketplace/view-models';
import {
  loadMarketplaceCartForCheckout,
  mapMarketplaceCart,
  resolveAuthenticatedMarketplaceCart,
} from '@/lib/commerce/cart';
import type { MarketplaceCheckoutInput } from '@/lib/commerce/cart-input';
import { databaseMinorToNumber } from '@/lib/commerce/money';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

const uuid = z.uuid();
const databaseMoney = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d{1,14}$/u),
]);
const deliveryMode = z.enum(['platform', 'self']);

const deliveryChoiceSchema = z.object({
  mode: deliveryMode,
  fee_piastres: databaseMoney,
  estimated_minutes_min: z.number().int().nonnegative().max(10_080).nullable(),
  estimated_minutes_max: z.number().int().nonnegative().max(10_080).nullable(),
});

const previewSchema = z.object({
  cart: z.unknown(),
  customer: z.object({
    id: uuid,
    display_name: z.string().min(1).max(120),
    email: z.email().nullable(),
    phone: z.string().max(32).nullable(),
    phone_verified: z.boolean(),
  }),
  addresses: z.array(z.object({
    id: uuid,
    zone_id: uuid,
    label: z.string().min(1).max(80),
    recipient_name: z.string().min(1).max(120),
    recipient_phone: z.string().min(1).max(32),
    address_line: z.string().min(1).max(300),
    building: z.string().max(80).nullable(),
    floor: z.string().max(40).nullable(),
    apartment: z.string().max(40).nullable(),
    landmark: z.string().max(160).nullable(),
    is_default: z.boolean(),
  })).max(50),
  stores: z.array(z.object({
    id: uuid,
    slug: z.string().min(1).max(180),
    name: z.string().min(1).max(180),
    delivery_mode: z.enum(['platform', 'self', 'flexible']),
    subtotal_piastres: databaseMoney,
  })).min(1).max(100),
  delivery_zones: z.array(z.object({
    id: uuid,
    code: z.string().min(1).max(80),
    name_ar: z.string().min(1).max(120),
    name_en: z.string().max(120).nullable(),
    aggregate_fee_piastres: databaseMoney,
    store_options: z.array(z.object({
      store_id: uuid,
      options: z.array(deliveryChoiceSchema).min(1).max(2),
    })).min(1).max(100),
  })).max(100),
  coupon: z.unknown().nullable(),
});

const checkoutResponseSchema = z.object({
  order_group_id: uuid,
  public_code: z.string().min(8).max(64),
  order_ids: z.array(uuid).min(1).max(100),
  subtotal: databaseMoney,
  discount_total: databaseMoney,
  delivery_total: databaseMoney,
  grand_total: databaseMoney,
  currency: z.literal('EGP'),
  idempotent: z.boolean(),
});

const savedAddressSchema = z.object({ id: uuid });

export class MarketplaceCheckoutError extends Error {
  constructor(public readonly code: MarketplaceCheckoutErrorCode) {
    super(code);
  }
}

export type MarketplaceCheckoutErrorCode =
  | 'authentication_required'
  | 'cart_invalid'
  | 'captcha_invalid'
  | 'captcha_unavailable'
  | 'cod_limit_reached'
  | 'delivery_unavailable'
  | 'invalid_form'
  | 'service_unavailable';

export type MarketplaceCheckoutLoad =
  | { kind: 'empty' }
  | { kind: 'claim_required' }
  | { kind: 'ready'; model: MarketplaceCheckoutViewModel };

export type MarketplaceCheckoutSuccess = {
  orderGroupId: string;
  publicCode: string;
};

type RpcError = { message?: string } | null;

function checkoutError(error: RpcError): MarketplaceCheckoutError {
  const message = error?.message ?? '';
  if (/authentication_required|customer_not_found/u.test(message)) {
    return new MarketplaceCheckoutError('authentication_required');
  }
  if (/cart_|active_cart|customer_cart|inventory|unavailable_item|insufficient/u.test(message)) {
    return new MarketplaceCheckoutError('cart_invalid');
  }
  if (/cod_open_order_limit|first_cod_order_(?:unit|amount)_limit/u.test(message)) {
    return new MarketplaceCheckoutError('cod_limit_reached');
  }
  if (/delivery_|deliver_to_zone|minimum_order|unsupported_delivery_mode/u.test(message)) {
    return new MarketplaceCheckoutError('delivery_unavailable');
  }
  return new MarketplaceCheckoutError('service_unavailable');
}

function defaultMode(
  storeMode: 'platform' | 'self' | 'flexible',
  choices: Array<{ mode: 'platform' | 'self' }>,
): 'platform' | 'self' {
  const preferred = storeMode === 'self' ? 'self' : 'platform';
  return choices.some((choice) => choice.mode === preferred)
    ? preferred
    : choices[0]!.mode;
}

function mapPreview(value: unknown): MarketplaceCheckoutViewModel {
  const parsed = previewSchema.safeParse(value);
  if (!parsed.success) throw new MarketplaceCheckoutError('service_unavailable');
  const preview = parsed.data;
  const cart = mapMarketplaceCart(preview.cart);
  const cartGroups = new Map(cart.groups.map((group) => [group.store.id, group]));
  const stores = new Map(preview.stores.map((store) => [store.id, store]));

  if (
    stores.size !== preview.stores.length
    || stores.size !== cartGroups.size
    || [...stores.keys()].some((storeId) => !cartGroups.has(storeId))
  ) {
    throw new MarketplaceCheckoutError('service_unavailable');
  }

  const zones: MarketplaceDeliveryZone[] = preview.delivery_zones.map((zone) => {
    const seenStores = new Set<string>();
    const storeOptions = zone.store_options.map((entry) => {
      const store = stores.get(entry.store_id);
      if (!store || seenStores.has(entry.store_id)) {
        throw new MarketplaceCheckoutError('service_unavailable');
      }
      seenStores.add(entry.store_id);
      const seenModes = new Set<string>();
      const choices = entry.options.map((option) => {
        if (seenModes.has(option.mode)) throw new MarketplaceCheckoutError('service_unavailable');
        seenModes.add(option.mode);
        return {
          mode: option.mode,
          label: option.mode === 'platform' ? 'توصيل ديرتك' : 'توصيل المتجر',
          deliveryFee: {
            amountMinor: databaseMinorToNumber(option.fee_piastres),
            currency: 'EGP' as const,
          },
          estimatedMinutesMin: option.estimated_minutes_min,
          estimatedMinutesMax: option.estimated_minutes_max,
        };
      });
      choices.sort((left, right) => Number(left.mode !== defaultMode(store.delivery_mode, choices))
        - Number(right.mode !== defaultMode(store.delivery_mode, choices)));
      return { storeId: entry.store_id, choices };
    });
    if (seenStores.size !== stores.size) throw new MarketplaceCheckoutError('service_unavailable');
    const deliveryFee = storeOptions.reduce((total, option) => {
      const store = stores.get(option.storeId)!;
      const selected = option.choices.find((choice) => (
        choice.mode === defaultMode(store.delivery_mode, option.choices)
      )) ?? option.choices[0]!;
      return total + selected.deliveryFee.amountMinor;
    }, 0);
    if (!Number.isSafeInteger(deliveryFee)) throw new MarketplaceCheckoutError('service_unavailable');
    return {
      id: zone.id,
      name: zone.name_ar,
      deliveryFee: { amountMinor: deliveryFee, currency: 'EGP' },
      storeOptions,
    };
  });

  const addresses = preview.addresses.map((address) => ({
    id: address.id,
    zoneId: address.zone_id,
    label: address.label,
    recipientName: address.recipient_name,
    recipientPhone: address.recipient_phone,
    addressLine: address.address_line,
    building: address.building ?? '',
    floor: address.floor ?? '',
    apartment: address.apartment ?? '',
    landmark: address.landmark ?? '',
    isDefault: address.is_default,
  }));
  const selectedAddress = addresses.find((address) => address.isDefault && zones.some((zone) => zone.id === address.zoneId))
    ?? addresses.find((address) => zones.some((zone) => zone.id === address.zoneId))
    ?? null;

  return {
    groups: preview.stores.map((store) => ({
      storeId: store.id,
      storeName: store.name,
      itemCount: cartGroups.get(store.id)!.lines.reduce((count, line) => count + line.quantity, 0),
      subtotal: {
        amountMinor: databaseMinorToNumber(store.subtotal_piastres),
        currency: 'EGP',
      },
    })),
    subtotal: cart.subtotal,
    discount: cart.discount,
    deliveryZones: zones,
    selectedZoneId: selectedAddress?.zoneId ?? zones[0]?.id ?? null,
    requiresAuthentication: false,
    loginHref: '/signin?next=%2Fmarketplace%2Fcheckout',
    appliedPromoCode: cart.appliedPromoCode,
    customerName: selectedAddress?.recipientName ?? preview.customer.display_name,
    customerEmail: preview.customer.email ?? '',
    customerPhone: selectedAddress?.recipientPhone ?? preview.customer.phone ?? '',
    addresses,
    selectedAddressId: selectedAddress?.id ?? null,
  };
}

export async function loadMarketplaceCheckout(): Promise<MarketplaceCheckoutLoad> {
  const cart = await loadMarketplaceCartForCheckout();
  if (cart.needsGuestClaim) return { kind: 'claim_required' };
  if (cart.model.itemCount === 0) return { kind: 'empty' };
  if (!cart.authenticated) {
    return {
      kind: 'ready',
      model: {
        groups: cart.model.groups.map((group) => ({
          storeId: group.store.id,
          storeName: group.store.name,
          itemCount: group.lines.reduce((count, line) => count + line.quantity, 0),
          subtotal: group.subtotal,
        })),
        subtotal: cart.model.subtotal,
        discount: cart.model.discount,
        deliveryZones: [],
        selectedZoneId: null,
        requiresAuthentication: true,
        loginHref: '/signin?next=%2Fmarketplace%2Fcheckout',
        appliedPromoCode: cart.model.appliedPromoCode,
        addresses: [],
        selectedAddressId: null,
      },
    };
  }

  const { data, error } = await (cart.authenticated.supabase as any).rpc(
    'preview_my_marketplace_checkout',
    { p_cart_id: cart.authenticated.cartId },
  );
  if (error) {
    const mapped = checkoutError(error);
    if (mapped.code === 'cart_invalid') return { kind: 'empty' };
    throw mapped;
  }
  const model = mapPreview(data);
  if (model.groups.length === 0) return { kind: 'empty' };
  return { kind: 'ready', model };
}

function validateSelectedDeliveryModes(
  model: MarketplaceCheckoutViewModel,
  zoneId: string,
  selected: Record<string, 'platform' | 'self'>,
): Record<string, 'platform' | 'self'> {
  const zone = model.deliveryZones.find((candidate) => candidate.id === zoneId);
  if (!zone || zone.storeOptions.length !== model.groups.length) {
    throw new MarketplaceCheckoutError('delivery_unavailable');
  }
  const result: Record<string, 'platform' | 'self'> = {};
  for (const store of zone.storeOptions) {
    const mode = selected[store.storeId] ?? store.choices[0]?.mode;
    if (!mode || !store.choices.some((choice) => choice.mode === mode)) {
      throw new MarketplaceCheckoutError('delivery_unavailable');
    }
    result[store.storeId] = mode;
  }
  if (Object.keys(selected).some((storeId) => !(storeId in result))) {
    throw new MarketplaceCheckoutError('invalid_form');
  }
  return result;
}

export async function submitMarketplaceCheckout(input: {
  form: MarketplaceCheckoutInput;
  deliveryModes: Record<string, 'platform' | 'self'>;
  remoteIp?: string | null;
}): Promise<MarketplaceCheckoutSuccess> {
  const authenticated = await resolveAuthenticatedMarketplaceCart();
  if (!authenticated) throw new MarketplaceCheckoutError('authentication_required');

  const captcha = await verifyTurnstileToken({
    token: input.form.turnstileToken,
    action: 'marketplace_checkout',
    remoteIp: input.remoteIp,
  });
  if (!captcha.ok) {
    throw new MarketplaceCheckoutError(
      captcha.code === 'invalid_token' ? 'captcha_invalid' : 'captcha_unavailable',
    );
  }

  const { data: preview, error: previewError } = await (authenticated.supabase as any).rpc(
    'preview_my_marketplace_checkout',
    { p_cart_id: authenticated.cartId },
  );
  if (previewError) throw checkoutError(previewError);
  const model = mapPreview(preview);
  const modes = validateSelectedDeliveryModes(
    model,
    input.form.deliveryZoneId,
    input.deliveryModes,
  );

  const { data: address, error: addressError } = await (authenticated.supabase as any).rpc(
    'save_my_marketplace_address',
    {
      p_zone_id: input.form.deliveryZoneId,
      p_label: 'عنوان التوصيل',
      p_recipient_name: input.form.customerName,
      p_recipient_phone: input.form.recipientPhone,
      p_address_line: input.form.addressLine,
      p_building: input.form.building,
      p_floor: input.form.floor,
      p_apartment: input.form.apartment,
      p_landmark: input.form.landmark,
      p_latitude: null,
      p_longitude: null,
      p_is_default: true,
      p_address_id: input.form.addressId,
    },
  );
  if (addressError) throw checkoutError(addressError);
  const parsedAddress = savedAddressSchema.safeParse(address);
  if (!parsedAddress.success) throw new MarketplaceCheckoutError('service_unavailable');

  const { data, error } = await (authenticated.supabase as any).rpc(
    'checkout_my_marketplace_cart',
    {
      p_cart_id: authenticated.cartId,
      p_idempotency_key: input.form.idempotencyKey,
      p_address_id: parsedAddress.data.id,
      p_delivery_modes: modes,
      p_delivery_notes: input.form.deliveryNotes,
    },
  );
  if (error) throw checkoutError(error);
  const parsed = checkoutResponseSchema.safeParse(data);
  if (!parsed.success) throw new MarketplaceCheckoutError('service_unavailable');
  return {
    orderGroupId: parsed.data.order_group_id,
    publicCode: parsed.data.public_code,
  };
}
