import { z } from 'zod';
import { ACTIVITY_KINDS } from './types';

export const activityKindSchema = z.enum(ACTIVITY_KINDS);
const draftText = (max: number) => z.string().max(max);
// Drafts deliberately accept incomplete text. Submission performs activity-specific validation.
export const onboardingDraftDataSchema = z.strictObject({
  displayName: draftText(100).optional(),
  phone: draftText(20).optional(),
  whatsapp: draftText(20).optional(),
  name: draftText(150).optional(),
  description: draftText(5000).optional(),
  address: draftText(600).optional(),
  placeMode: z.enum(['new', 'existing']).optional(),
  existingPlaceId: z.union([z.uuid(), z.literal('')]).optional(),
  category: draftText(80).optional(),
  vehicleType: draftText(60).optional(),
  product: z.strictObject({ name: draftText(150), description: draftText(5000), priceEgp: draftText(20) }).optional(),
  realEstate: z.strictObject({
    offerType: draftText(20), propertyType: draftText(30), priceEgp: draftText(20),
    rooms: draftText(10).optional(), bathrooms: draftText(10).optional(), areaSqm: draftText(20).optional(),
    floor: draftText(10).optional(), furnishing: draftText(30).optional(),
  }).optional(),
  mediaIds: z.array(z.uuid()).max(7).refine((ids) => new Set(ids).size === ids.length).optional(),
});

export const saveOnboardingDraftSchema = z.strictObject({
  activityKind: activityKindSchema,
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  data: onboardingDraftDataSchema,
  expectedVersion: z.number().int().min(0).max(2147483646),
  draftId: z.uuid().optional(),
});

export const onboardingDraftSchema = z.strictObject({
  id: z.uuid(), userId: z.uuid(), activityKind: activityKindSchema,
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  version: z.number().int().positive(), status: z.enum(['draft', 'submitted']),
  data: onboardingDraftDataSchema, updatedAt: z.string().min(16).max(64),
});

export const workspaceSummarySchema = z.strictObject({
  id: z.uuid(), activityKind: activityKindSchema, name: z.string().min(1).max(150),
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'suspended']),
  membershipRole: z.enum(['owner', 'manager', 'member']),
  merchantId: z.uuid().nullable(), storeId: z.uuid().nullable(), driverProfileId: z.uuid().nullable(),
  canManage: z.boolean(),
});
