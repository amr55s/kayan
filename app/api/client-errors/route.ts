import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const reportSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{16,64}$/),
  eventType: z.enum(['window_error', 'unhandled_rejection', 'react_boundary']),
  errorKind: z.enum([
    'ReactError',
    'ChunkLoadError',
    'NetworkError',
    'AbortError',
    'TypeError',
    'ReferenceError',
    'RangeError',
    'SyntaxError',
    'Unknown',
  ]),
  route: z.string().min(1).max(160).startsWith('/').refine(
    (value) => !value.includes('?') && !value.includes('#'),
  ),
  browserFamily: z.enum(['Samsung', 'Edge', 'Firefox', 'Chrome', 'Safari', 'Other']),
  osFamily: z.enum(['Android', 'iOS', 'Windows', 'macOS', 'Linux', 'Other']),
  release: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
});

function accepted() {
  return Response.json(
    { accepted: true },
    {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 4_096) return accepted();

    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return accepted();

    const rawBody = await request.text();
    if (rawBody.length > 4_096) return accepted();
    const parsed = reportSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return accepted();

    const requestHeaders = await headers();
    const requestIp =
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || requestHeaders.get('x-real-ip')
      || 'local';
    const salt =
      process.env.CLIENT_ERROR_HASH_SALT
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!salt) return accepted();

    const requestKey = createHash('sha256')
      .update(`${requestIp}:${parsed.data.fingerprint}:client-error:${salt}`)
      .digest('hex');
    const admin = createAdminClient();
    await (admin as any).rpc('record_client_error_v2', {
      p_request_key: requestKey,
      p_fingerprint: parsed.data.fingerprint,
      p_event_type: parsed.data.eventType,
      p_error_kind: parsed.data.errorKind,
      p_route: parsed.data.route,
      p_browser_family: parsed.data.browserFamily,
      p_os_family: parsed.data.osFamily,
      p_release: parsed.data.release,
      p_limit: 10,
    });
  } catch {
    // Reporting failure must never generate another client-facing failure.
  }
  return accepted();
}
