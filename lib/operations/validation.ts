import { z } from 'zod';

const egyptianPhone = z
  .string()
  .transform((value) => value.replace(/\D/g, '').replace(/^20/, '0'))
  .refine((value) => /^01[0125]\d{8}$/.test(value), 'رقم الهاتف المصري غير صحيح');

const money = z.coerce.number().min(0).max(9_999_999).optional().nullable();

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
  category: z.enum([
    'restaurants',
    'home_made',
    'market',
    'veggies',
    'pharmacy',
    'crafts',
    'services',
  ]),
  phone: egyptianPhone,
  whatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
  instapayVfcash: z.string().trim().max(30).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  existingImages: z.array(z.url()).max(12).default([]),
});

export const driverPublicProfileSchema = z.object({
  whatsapp: egyptianPhone.optional().nullable().or(z.literal('')),
  vehicleType: z.string().trim().max(60).optional().nullable(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
