import { z } from 'zod';

const HTTPS_PROTOCOL = 'https:';

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== HTTPS_PROTOCOL
      || url.username
      || url.password
      || url.port
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isWhatsAppCommunityUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '');
  return (
    (host === 'chat.whatsapp.com' && pathname.length > 1)
    || (
      (host === 'whatsapp.com' || host === 'www.whatsapp.com')
      && pathname.startsWith('/channel/')
      && pathname.length > '/channel/'.length
    )
  );
}

function isTelegramCommunityUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, '');
  return (
    (host === 't.me' || host === 'telegram.me')
    && pathname.length > 1
  );
}

function isSupportedMapUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (host === 'maps.app.goo.gl') return pathname.length > 1;
  if (host === 'goo.gl') return pathname.startsWith('/maps/');
  if (host === 'maps.google.com') return true;
  if (host === 'google.com' || host === 'www.google.com') {
    return pathname === '/maps' || pathname.startsWith('/maps/');
  }
  if (host === 'maps.apple.com') return true;
  return host === 'openstreetmap.org' || host === 'www.openstreetmap.org';
}

function optionalUrlSchema(
  validator: (value: string) => boolean,
  message: string,
) {
  return z
    .string()
    .trim()
    .max(500, 'الرابط طويل أكثر من اللازم.')
    .optional()
    .nullable()
    .or(z.literal(''))
    .refine((value) => !value || validator(value), message)
    .transform((value) => value?.trim() || null);
}

export const whatsappGroupUrlSchema = optionalUrlSchema(
  isWhatsAppCommunityUrl,
  'استخدم رابط جروب أو قناة WhatsApp رسمي.',
);

export const telegramUrlSchema = optionalUrlSchema(
  isTelegramCommunityUrl,
  'استخدم رابط Telegram رسمي يبدأ بـ https://t.me/.',
);

export const mapUrlSchema = optionalUrlSchema(
  isSupportedMapUrl,
  'استخدم رابط Google Maps أو Apple Maps أو OpenStreetMap.',
);

export const placeDetailsInputSchema = z.object({
  whatsappGroupUrl: whatsappGroupUrlSchema,
  telegramUrl: telegramUrlSchema,
  address: z
    .string()
    .trim()
    .max(500, 'العنوان يجب ألا يتجاوز 500 حرف.')
    .optional()
    .nullable()
    .transform((value) => value || null),
  mapUrl: mapUrlSchema,
});

export type PlaceDetailsInput = z.infer<typeof placeDetailsInputSchema>;

export function validatePlaceDetails(input: unknown): PlaceDetailsInput {
  return placeDetailsInputSchema.parse(input);
}

export const placeDetailsValidators = {
  whatsappGroup: isWhatsAppCommunityUrl,
  telegram: isTelegramCommunityUrl,
  map: isSupportedMapUrl,
};
