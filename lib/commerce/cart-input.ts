import { z } from 'zod';

const uuid = z.uuid();
const quantity = z
  .string()
  .regex(/^(?:[1-9]|[1-9]\d)$/u)
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().min(1).max(99));
const shortText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z
  .string()
  .trim()
  .max(maximum)
  .transform((value) => value || null);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export const marketplaceAddCartItemSchema = z.object({
  productId: uuid,
  variantId: uuid,
  quantity,
});

export const marketplaceUpdateCartItemSchema = z.object({
  variantId: uuid,
  quantity,
});

export const marketplaceRemoveCartItemSchema = z.object({
  variantId: uuid,
});

export const marketplaceCouponSchema = z.object({
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/u),
});

export const marketplaceCheckoutSchema = z.object({
  addressId: z.string().trim().transform((value) => value || null).pipe(uuid.nullable()),
  addressLine: shortText(300).refine((value) => value.length >= 8),
  apartment: optionalText(40),
  building: optionalText(80),
  customerName: shortText(120).refine((value) => value.length >= 2),
  deliveryNotes: optionalText(500),
  deliveryZoneId: uuid,
  floor: optionalText(40),
  idempotencyKey: uuid,
  landmark: optionalText(160),
  recipientPhone: z.string().trim().regex(/^01[0125][0-9]{8}$/u),
  turnstileToken: z.string().trim().min(1).max(2_048),
});

export function parseAddCartItemFormData(formData: FormData) {
  return marketplaceAddCartItemSchema.safeParse({
    productId: text(formData, 'productId'),
    variantId: text(formData, 'variantId'),
    quantity: text(formData, 'quantity'),
  });
}

export function parseUpdateCartItemFormData(formData: FormData) {
  return marketplaceUpdateCartItemSchema.safeParse({
    variantId: text(formData, 'variantId'),
    quantity: text(formData, 'quantity'),
  });
}

export function parseRemoveCartItemFormData(formData: FormData) {
  return marketplaceRemoveCartItemSchema.safeParse({
    variantId: text(formData, 'variantId'),
  });
}

export function parseMarketplaceCouponFormData(formData: FormData) {
  return marketplaceCouponSchema.safeParse({
    promoCode: text(formData, 'promoCode'),
  });
}

export function parseMarketplaceCheckoutFormData(formData: FormData) {
  return marketplaceCheckoutSchema.safeParse({
    addressId: text(formData, 'addressId'),
    addressLine: text(formData, 'addressLine'),
    apartment: text(formData, 'apartment'),
    building: text(formData, 'building'),
    customerName: text(formData, 'customerName'),
    deliveryNotes: text(formData, 'deliveryNotes'),
    deliveryZoneId: text(formData, 'deliveryZoneId'),
    floor: text(formData, 'floor'),
    idempotencyKey: text(formData, 'idempotencyKey'),
    landmark: text(formData, 'landmark'),
    recipientPhone: text(formData, 'recipientPhone'),
    turnstileToken: text(formData, 'cf-turnstile-response'),
  });
}

export type MarketplaceCheckoutInput = z.infer<typeof marketplaceCheckoutSchema>;
