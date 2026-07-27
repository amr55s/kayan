import 'server-only';

import { z } from 'zod';

export function validateListingImageUrls(
  urls: string[],
  max: number,
): string[] {
  if (urls.length > max) {
    throw new Error(`يمكن رفع ${max} صور كحد أقصى في المرة الواحدة.`);
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl && urls.length) {
    throw new Error('إعدادات تخزين الصور غير مكتملة.');
  }
  const allowedOrigin = projectUrl ? new URL(projectUrl).origin : '';
  const allowedPath = '/storage/v1/object/public/listing-images/';

  return urls.map((value) => {
    const url = new URL(z.url().parse(value));
    if (url.origin !== allowedOrigin || !url.pathname.startsWith(allowedPath)) {
      throw new Error('رابط صورة غير صالح.');
    }
    return url.toString();
  });
}
