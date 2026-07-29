import { z } from 'zod';
import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import sharp, { type OverlayOptions } from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchPublicDrivers } from '@/lib/supabase/queries';
import {
  marketingIdeas,
  marketingCardTitle,
  marketingTemplateLabels,
  marketingUrl,
  SITE_URL,
} from '@/lib/marketing/content';
import type { Driver, MarketingTemplateKey, Place } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  type: z.enum(['site', 'place', 'driver', 'feature']).default('site'),
  id: z.string().uuid().optional(),
  template: z.enum([
    'new_place',
    'new_driver',
    'weekly_roundup',
    'merchant_invite',
    'driver_invite',
    'missing_service',
    'data_correction',
    'local_ambassadors',
    'general_site',
  ]).default('general_site'),
  ref: z.string().regex(/^[a-z0-9_-]{8,64}$/i).optional(),
  preview: z.literal('1').optional(),
});

const renderLimits = new Map<string, { startedAt: number; attempts: number }>();

function allowRender(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const agent = request.headers.get('user-agent') || '';
  const key = createHash('sha256').update(`${forwarded}:${agent}`).digest('hex').slice(0, 24);
  const now = Date.now();
  const current = renderLimits.get(key);
  if (!current || now - current.startedAt > 60_000) {
    renderLimits.set(key, { startedAt: now, attempts: 1 });
    return true;
  }
  current.attempts += 1;
  if (renderLimits.size > 1_000) {
    for (const [candidate, value] of renderLimits) {
      if (now - value.startedAt > 120_000) renderLimits.delete(candidate);
    }
  }
  return current.attempts <= 40;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function splitTitle(value: string, maxLength = 28): [string, string?] {
  if (value.length <= maxLength) return [value];
  const words = value.split(/\s+/);
  let first = '';
  while (words.length && `${first} ${words[0]}`.trim().length <= maxLength) {
    first = `${first} ${words.shift()}`.trim();
  }
  return [first || value.slice(0, maxLength), words.join(' ').slice(0, maxLength)];
}

async function safeImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const supabaseHost = (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname;
      } catch {
        return '';
      }
    })();
    const allowedHost = parsed.hostname === 'images.unsplash.com'
      || (supabaseHost && parsed.hostname === supabaseHost)
      || parsed.hostname.endsWith('.supabase.co');
    if (!allowedHost) return null;
    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(5_000),
      cache: 'force-cache',
    });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 6_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 6_000_000) return null;
    return await sharp(bytes)
      .rotate()
      .resize(920, 470, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

async function loadEntity(
  type: 'site' | 'place' | 'driver' | 'feature',
  id?: string,
): Promise<{ place?: Place; driver?: Driver; image?: string | null }> {
  if (type === 'place' && id) {
    const admin = createAdminClient();
    const { data } = await (admin as any)
      .from('places')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const place = data as Place | null;
    return place ? { place, image: place.images?.[0] } : {};
  }
  if (type === 'driver' && id) {
    const drivers = await fetchPublicDrivers();
    const driver = drivers.find((item) => item.id === id);
    return driver ? { driver } : {};
  }
  return {};
}

export async function GET(request: Request) {
  if (!allowRender(request)) {
    return Response.json(
      { message: 'Too many card requests' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }
  const requestUrl = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(requestUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ message: 'Invalid card request' }, { status: 400 });
  }

  const { type, id, template, ref, preview } = parsed.data;
  if ((type === 'place' || type === 'driver') && !id) {
    return Response.json({ message: 'Missing entity' }, { status: 400 });
  }

  const entity = await loadEntity(type, id);
  if ((type === 'place' && !entity.place) || (type === 'driver' && !entity.driver)) {
    return Response.json({ message: 'Not found' }, { status: 404 });
  }

  const templateKey = template as MarketingTemplateKey;
  const title = marketingCardTitle({
    templateKey,
    place: entity.place,
    driver: entity.driver,
  });
  const subtitle = entity.place
    ? 'مكان جديد داخل دليل كيان'
    : entity.driver
      ? `${entity.driver.vehicle_type || 'كابتن توصيل'} — تواصل مباشر`
      : marketingTemplateLabels[templateKey];
  const ideaPath = marketingIdeas.find((idea) => idea.key === templateKey)?.path || '/';
  const targetUrl = type === 'feature'
    ? (() => {
        const url = new URL(ideaPath, SITE_URL);
        if (ref) url.searchParams.set('ref', ref);
        return url.toString();
      })()
    : marketingUrl(type, id, ref);
  const [titleLineOne, titleLineTwo] = splitTitle(title);
  const qr = await QRCode.toBuffer(targetUrl, {
    type: 'png',
    width: 260,
    margin: 1,
    color: { dark: '#09090b', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
  const photo = await safeImageBuffer(entity.image);
  const photoMarkup = photo
    ? `<image x="80" y="92" width="920" height="470" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${photo.toString('base64')}" clip-path="url(#photo)"/>`
    : '';

  const svg = Buffer.from(`
    <svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#09090b"/>
          <stop offset="1" stop-color="#27272a"/>
        </linearGradient>
        <clipPath id="photo"><rect x="80" y="92" width="920" height="470" rx="42"/></clipPath>
      </defs>
      <rect width="1080" height="1080" fill="#f4f4f5"/>
      <rect x="44" y="44" width="992" height="992" rx="64" fill="white"/>
      ${photo ? '' : '<rect x="80" y="92" width="920" height="470" rx="42" fill="url(#bg)"/>'}
      ${photoMarkup}
      <rect x="80" y="92" width="920" height="470" rx="42" fill="none" stroke="#e4e4e7" stroke-width="3"/>
      <rect x="112" y="116" width="250" height="56" rx="28" fill="#09090b"/>
      <text x="237" y="153" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="700">KAYAN CITY SPOT</text>
      ${photo ? '<rect x="80" y="92" width="920" height="470" rx="42" fill="url(#shade)" opacity="0"/>' : ''}
      <g text-anchor="end" font-family="Arial, sans-serif">
        <text x="650" y="655" fill="#71717a" font-size="28" font-weight="700">${escapeXml(subtitle)}</text>
        <text x="650" y="718" fill="#09090b" font-size="47" font-weight="800">${escapeXml(titleLineOne)}</text>
        ${titleLineTwo ? `<text x="650" y="775" fill="#09090b" font-size="42" font-weight="800">${escapeXml(titleLineTwo)}</text>` : ''}
        <text x="650" y="850" fill="#3f3f46" font-size="29" font-weight="700">تواصل مباشر • بدون عمولات</text>
        <text x="650" y="906" fill="#71717a" font-size="24">امسح الكود لفتح التفاصيل والصور</text>
      </g>
      <rect x="710" y="660" width="290" height="290" rx="36" fill="#ffffff" stroke="#e4e4e7" stroke-width="3"/>
      <text x="540" y="994" text-anchor="middle" fill="#71717a" font-family="Arial, sans-serif" font-size="22">كل ما تحتاجه في مكان واحد</text>
    </svg>
  `);

  let card = sharp(svg);
  const composites: OverlayOptions[] = [
    { input: qr, left: 725, top: 675 },
  ];
  card = card.composite(composites);
  let output = card.png({ compressionLevel: 9, adaptiveFiltering: true });
  if (preview) {
    output = output.resize(540, 540);
  }
  const png = await output.toBuffer();
  const safeName = `${type}-${id || template}`.replace(/[^a-z0-9-]/gi, '');

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'content-disposition': `inline; filename="kayan-${safeName}.png"`,
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}
