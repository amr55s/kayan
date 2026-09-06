import { z } from 'zod';

export const MAX_MEDIA_SOURCE_BYTES = 12 * 1024 * 1024;
export const MEDIA_UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const MEDIA_SESSION_TTL_MINUTES = 15;

export const supportedMediaTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const mediaPurposeSchema = z.enum(['product', 'store', 'delivery_proof']);
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;

export const createMediaUploadSchema = z.object({
  purpose: mediaPurposeSchema,
  slot: z.enum(['gallery', 'logo', 'cover', 'proof']).default('gallery'),
  merchantId: z.uuid().optional(),
  entityId: z.uuid(),
  contentType: z.enum(supportedMediaTypes),
  sizeBytes: z.number().int().min(32).max(MAX_MEDIA_SOURCE_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase()),
}).strict().superRefine((value, context) => {
  if (value.purpose === 'product' && value.slot !== 'gallery') {
    context.addIssue({ code: 'custom', path: ['slot'], message: 'invalid_product_media_slot' });
  }
  if (value.purpose === 'delivery_proof' && value.slot !== 'proof') {
    context.addIssue({ code: 'custom', path: ['slot'], message: 'invalid_delivery_proof_slot' });
  }
  if (value.purpose !== 'delivery_proof' && !value.merchantId) {
    context.addIssue({ code: 'custom', path: ['merchantId'], message: 'merchant_id_required' });
  }
});

export const finalizeMediaUploadSchema = z.object({
  sessionId: z.uuid(),
}).strict();

export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;

export const MEDIA_EXTENSION: Record<(typeof supportedMediaTypes)[number], string> = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
