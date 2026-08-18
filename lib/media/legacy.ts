import 'server-only';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { validateListingImageUrls } from '@/lib/images/urls';

const uploadTokenSchema = z.string().regex(/^dairtak-upload:[0-9a-f-]{36}$/iu);
const uuidSchema = z.uuid();

export function legacyUploadToken(uploadId: string): string {
  return `dairtak-upload:${uuidSchema.parse(uploadId)}`;
}

export function parseLegacyUploadToken(value: string): string | null {
  if (!uploadTokenSchema.safeParse(value).success) return null;
  return uuidSchema.parse(value.slice('dairtak-upload:'.length));
}

export function splitLegacyPlaceImageReferences(values: string[], max: number) {
  if (values.length > max) {
    throw new Error(`يمكن رفع ${max} صور كحد أقصى في المرة الواحدة.`);
  }
  const uploadIds: string[] = [];
  const urls: string[] = [];
  for (const value of values) {
    const uploadId = parseLegacyUploadToken(value);
    if (uploadId) uploadIds.push(uploadId);
    else urls.push(value);
  }
  if (new Set(uploadIds).size !== uploadIds.length) {
    throw new Error('تم إرسال نفس الصورة أكثر من مرة.');
  }
  return {
    uploadIds,
    urls: validateListingImageUrls(urls, max),
  };
}

export async function claimLegacyPlaceUploads(
  uploadIds: string[],
  placeId: string,
  retainedUrls: string[] = [],
) {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc('claim_my_legacy_place_media', {
    p_upload_ids: uploadIds.map((id) => uuidSchema.parse(id)),
    p_place_id: uuidSchema.parse(placeId),
    p_retained_urls: validateListingImageUrls(retainedUrls, 15),
  });
  if (error) throw error;
  const rows = z.array(z.object({
    upload_id: z.uuid(),
    public_url: z.url(),
  })).parse(data ?? []);
  if (rows.length !== uploadIds.length) throw new Error('place_media_claim_contract_failed');
  return validateListingImageUrls(rows.map((row) => row.public_url), 15);
}

export async function enqueueSpacesDeletion(input: {
  eventKey: string;
  objectKey: string;
  staging?: boolean;
  aggregateId: string;
  aggregateType: string;
  bucket?: string;
}) {
  const admin = createAdminClient();
  const payload = input.staging
    ? { bucket: input.bucket, staging_key: input.objectKey }
    : { bucket: input.bucket, object_key: input.objectKey };
  const { error } = await (admin as any).from('marketplace_outbox').upsert({
    event_key: input.eventKey,
    topic: input.staging ? 'media.staging_delete_requested' : 'media.delete_requested',
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    payload,
  }, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw error;
}
