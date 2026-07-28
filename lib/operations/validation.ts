import { z } from 'zod';
import {
  mapUrlSchema,
  telegramUrlSchema,
  whatsappGroupUrlSchema,
} from '../place-details.ts';

const egyptianPhone = z
  .string()
  .transform((value) => value.replace(/\D/g, '').replace(/^20/, '0'))
  .refine((value) => /^01[0125]\d{8}$/.test(value), 'رقم الهاتف المصري غير صحيح');

const money = z.coerce.number().min(0).max(9_999_999).optional().nullable();

const LISTING_CATEGORY_IDS = [
  'restaurants',
  'home_made',
  'market',
  'veggies',
  'pharmacy',
  'crafts',
  'services',
] as const;

const CATEGORY_ALIASES: Record<string, (typeof LISTING_CATEGORY_IDS)[number]> = {
  'مطاعم وكافيهات': 'restaurants',
  'صنع يدي وأكل بيتي': 'home_made',
  'سوبر ماركت': 'market',
  'خضار وفاكهة': 'veggies',
  'صيدليات وطب': 'pharmacy',
  'حرف وصيانة': 'crafts',
  'خدمات ومكاتب': 'services',
};

function normalizeListingCategory(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((LISTING_CATEGORY_IDS as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  const labelWithoutEmoji = trimmed
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
  return CATEGORY_ALIASES[labelWithoutEmoji] ?? trimmed;
}

export const listingCategorySchema = z.preprocess(
  normalizeListingCategory,
  z.enum(LISTING_CATEGORY_IDS, {
    error: 'اختر تصنيفاً صحيحاً من القائمة.',
  }),
);

export const createOrderSchema = z.object({
  branchId: z.uuid(),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: egyptianPhone,
  deliveryAddress: z.string().trim().min(5).max(600),
  deliveryArea: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(1000).optional().nullable(),
  collectionAmount: money,
  deliveryFee: money,
  directDriverId: z.uuid().optional().nullable(),
});

export const statusChangeSchema = z.object({
  orderId: z.uuid(),
  nextStatus: z.enum(['open', 'picked_up', 'delivered', 'cancelled', 'issue']),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const profileProvisionSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  phone: egyptianPhone,
  password: z.string().min(12).max(128),
  role: z.enum(['admin', 'merchant', 'driver']),
  merchantId: z.uuid().optional().nullable(),
});

export const managedUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string().trim().min(2).max(100),
  phone: egyptianPhone,
  newPassword: z.string().min(12).max(128).optional().or(z.literal('')),
  role: z.enum(['admin', 'merchant', 'driver']),
  merchantId: z.uuid().optional().nullable(),
  isActive: z.boolean(),
});

export const branchSchema = z.object({
  merchantId: z.uuid(),
  placeId: z.uuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  phone: egyptianPhone,
  address: z.string().trim().min(5).max(500),
  area: z.string().trim().min(2).max(100),
  isDefault: z.boolean().default(false),
});

export const merchantPlaceSchema = z.object({
  placeId: z.uuid(),
  title: z.string().trim().min(2).max(150),
  category: listingCategorySchema,
  phone: egyptianPhone,
  whatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
  instapayVfcash: z.string().trim().max(30).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  whatsappGroupUrl: whatsappGroupUrlSchema,
  telegramUrl: telegramUrlSchema,
  address: z.string().trim().max(500).optional().nullable(),
  mapUrl: mapUrlSchema,
  existingImages: z.array(z.url()).max(12).default([]),
});

export const driverPublicProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  whatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
  vehicleType: z.string().trim().max(60).optional().nullable(),
});

export const accountRequestSchema = z
  .object({
    kind: z.enum(['driver', 'merchant']),
    displayName: z.string().trim().min(2, 'اكتب الاسم كاملاً.').max(100),
    phone: egyptianPhone,
    password: z
      .string()
      .min(12, 'كلمة المرور يجب أن تتكون من 12 حرفاً على الأقل.')
      .max(128),
    whatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
    vehicleType: z.string().trim().max(60).optional().nullable(),
    placeMode: z.enum(['existing', 'new']).optional().nullable(),
    existingPlaceId: z.uuid().optional().nullable(),
    placeTitle: z.string().trim().max(150).optional().nullable(),
    placeCategory: listingCategorySchema.optional().nullable(),
    placeWhatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
    placePayment: z.string().trim().max(30).optional().nullable(),
    placeDescription: z.string().trim().max(2000).optional().nullable(),
    placeWhatsappGroupUrl: whatsappGroupUrlSchema,
    placeTelegramUrl: telegramUrlSchema,
    placeAddress: z.string().trim().max(500).optional().nullable(),
    placeMapUrl: mapUrlSchema,
  })
  .superRefine((value, context) => {
    if (value.kind === 'driver') return;
    if (!value.placeMode) {
      context.addIssue({
        code: 'custom',
        path: ['placeMode'],
        message: 'اختر ربط مكان موجود أو إنشاء خدمة جديدة.',
      });
      return;
    }
    if (value.placeMode === 'existing' && !value.existingPlaceId) {
      context.addIssue({
        code: 'custom',
        path: ['existingPlaceId'],
        message: 'اختر المكان المطلوب ربطه.',
      });
    }
    if (
      value.placeMode === 'new'
      && (!value.placeTitle || !value.placeCategory)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['placeTitle'],
        message: 'اكتب اسم الخدمة واختر التصنيف.',
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
