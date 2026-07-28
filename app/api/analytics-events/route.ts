import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2_048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/i;

const payloadSchema = z.object({
  visitorId: z.string().uuid(),
  eventName: z.enum([
    'page_view',
    'place_open',
    'phone_click',
    'whatsapp_click',
    'group_click',
    'telegram_click',
    'map_click',
    'share_click',
    'favorite_click',
    'upvote_click',
    'search_use',
    'category_select',
    'join_open',
    'feedback_open',
    'add_listing_open',
    'driver_signup_open',
    'support_click',
  ]),
  targetType: z.enum(['site', 'place', 'category', 'feature']),
  targetKey: z.string().max(64).default(''),
  route: z.string().regex(/^\/[a-z0-9/_-]*$/i).max(120),
});

const placeEvents = new Set([
  'place_open',
  'phone_click',
  'whatsapp_click',
  'group_click',
  'telegram_click',
  'map_click',
  'share_click',
  'favorite_click',
  'upvote_click',
]);
const featureEvents = new Set([
  'search_use',
  'join_open',
  'feedback_open',
  'add_listing_open',
  'driver_signup_open',
  'support_click',
]);

function targetIsValid(payload: z.infer<typeof payloadSchema>): boolean {
  if (payload.eventName === 'page_view') {
    return payload.targetType === 'site' && payload.targetKey === '';
  }
  if (placeEvents.has(payload.eventName)) {
    return payload.targetType === 'place' && UUID_PATTERN.test(payload.targetKey);
  }
  if (payload.eventName === 'category_select') {
    return payload.targetType === 'category' && SAFE_KEY_PATTERN.test(payload.targetKey);
  }
  return (
    featureEvents.has(payload.eventName)
    && payload.targetType === 'feature'
    && SAFE_KEY_PATTERN.test(payload.targetKey)
  );
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return Response.json({ message: 'Payload too large' }, { status: 413 });
    }

    const requestUrl = new URL(request.url);
    const origin = request.headers.get('origin');
    if (origin && origin !== requestUrl.origin) {
      return Response.json({ message: 'Invalid origin' }, { status: 403 });
    }

    const rawBody = await request.text();
    if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return Response.json({ message: 'Invalid payload' }, { status: 400 });
    }
    const parsed = payloadSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success || !targetIsValid(parsed.data)) {
      return Response.json({ message: 'Invalid payload' }, { status: 400 });
    }

    const secret =
      process.env.CLIENT_ERROR_HASH_SALT
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return new Response(null, { status: 204 });

    const visitorHash = createHash('sha256')
      .update(`${parsed.data.visitorId}:${secret}`)
      .digest('hex');
    const admin = createAdminClient();
    const { error } = await (admin as any).rpc('record_site_analytics', {
      p_visitor_hash: visitorHash,
      p_event_name: parsed.data.eventName,
      p_target_type: parsed.data.targetType,
      p_target_key: parsed.data.targetKey,
      p_route: parsed.data.route,
      p_limit: 120,
    });
    if (error) {
      console.warn('Anonymous behavior analytics could not be recorded:', error);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.warn('Anonymous behavior analytics endpoint failed:', error);
    return new Response(null, { status: 204 });
  }
}
