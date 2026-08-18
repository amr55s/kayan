import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedPushEndpoint } from '@/lib/commerce/push-validation';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;
const endpointSchema = z.string().min(20).max(2048).url()
  .refine(isAllowedPushEndpoint, 'unsupported_push_provider');
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,255}$/u),
    auth: z.string().regex(/^[A-Za-z0-9_-]{12,128}$/u),
  }).strict(),
}).strict();
const unsubscribeSchema = z.object({ endpoint: endpointSchema }).strict();

function requestOrigin(request: Request): string | null {
  const raw = request.headers.get('origin');
  if (!raw) return null;
  try {
    const origin = new URL(raw).origin;
    const requestUrlOrigin = new URL(request.url).origin;
    const configured = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : null;
    if (origin !== requestUrlOrigin && origin !== configured) return null;
    const url = new URL(origin);
    const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return url.protocol === 'https:' || loopback ? origin : null;
  } catch {
    return null;
  }
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!origin) {
    return NextResponse.json({ message: 'الطلب غير صالح.' }, { status: 403, headers: NO_STORE });
  }
  let parsed: z.infer<typeof subscriptionSchema>;
  try {
    parsed = subscriptionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: 'بيانات اشتراك الإشعارات غير صالحة.' }, { status: 400, headers: NO_STORE });
  }

  const { supabase, user } = await authenticatedClient();
  if (!user) {
    return NextResponse.json({ message: 'يجب تسجيل الدخول أولًا.' }, { status: 401, headers: NO_STORE });
  }
  const { error } = await (supabase as any).rpc('register_my_push_subscription', {
    p_endpoint: parsed.endpoint,
    p_p256dh: parsed.keys.p256dh,
    p_auth: parsed.keys.auth,
    p_app_origin: origin,
    p_user_agent: request.headers.get('user-agent')?.slice(0, 512) ?? null,
  });
  if (error) {
    if (/push_(?:registration_rate_limited|subscription_limit_reached)/u.test(error.message ?? '')) {
      return NextResponse.json(
        { message: 'تم الوصول إلى الحد الآمن لأجهزة الإشعارات. أوقف جهازًا قديمًا أو حاول لاحقًا.' },
        { status: 429, headers: { ...NO_STORE, 'retry-after': '3600' } },
      );
    }
    return NextResponse.json({ message: 'تعذر حفظ اشتراك الإشعارات.' }, { status: 422, headers: NO_STORE });
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  if (!requestOrigin(request)) {
    return NextResponse.json({ message: 'الطلب غير صالح.' }, { status: 403, headers: NO_STORE });
  }
  let parsed: z.infer<typeof unsubscribeSchema>;
  try {
    parsed = unsubscribeSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: 'بيانات اشتراك الإشعارات غير صالحة.' }, { status: 400, headers: NO_STORE });
  }
  const { supabase, user } = await authenticatedClient();
  if (!user) {
    return NextResponse.json({ message: 'يجب تسجيل الدخول أولًا.' }, { status: 401, headers: NO_STORE });
  }
  const { error } = await (supabase as any).rpc('unregister_my_push_subscription', {
    p_endpoint: parsed.endpoint,
  });
  if (error) {
    return NextResponse.json({ message: 'تعذر إيقاف اشتراك الإشعارات.' }, { status: 422, headers: NO_STORE });
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
