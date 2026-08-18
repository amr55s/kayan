import 'server-only';

import { z } from 'zod';

export function validateListingImageUrls(
  urls: string[],
  max: number,
): string[] {
  if (urls.length > max) {
    throw new Error(`يمكن رفع ${max} صور كحد أقصى في المرة الواحدة.`);
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const spacesCdnUrl = process.env.DO_SPACES_CDN_BASE_URL?.trim();
  if (!projectUrl && !spacesCdnUrl && urls.length) {
    throw new Error('إعدادات تخزين الصور غير مكتملة.');
  }
  const legacySupabase = projectUrl
    ? {
        origin: new URL(projectUrl).origin,
        path: '/storage/v1/object/public/listing-images/',
      }
    : null;
  const spacesCdn = spacesCdnUrl
    ? (() => {
        const value = new URL(spacesCdnUrl);
        return {
          origin: value.origin,
          path: `${value.pathname.replace(/\/$/u, '')}/media/`,
        };
      })()
    : null;

  return urls.map((value) => {
    const url = new URL(z.url().parse(value));
    const isLegacySupabase = Boolean(
      legacySupabase
      && url.origin === legacySupabase.origin
      && url.pathname.startsWith(legacySupabase.path),
    );
    const isSpacesMedia = Boolean(
      spacesCdn
      && url.origin === spacesCdn.origin
      && url.pathname.startsWith(spacesCdn.path),
    );
    if (!isLegacySupabase && !isSpacesMedia) {
      throw new Error('رابط صورة غير صالح.');
    }
    return url.toString();
  });
}
