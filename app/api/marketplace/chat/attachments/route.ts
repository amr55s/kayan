import { z } from 'zod';
import {
  beginChatAttachment, ChatMediaError, completeChatAttachment, deletePendingChatAttachment, signChatAttachmentRead,
} from '@/lib/commerce/chat/media';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function requestOrigin(request: Request): string | null {
  const raw = request.headers.get('origin');
  if (!raw) return null;
  try {
    const origin = new URL(raw).origin;
    const requestOrigin = new URL(request.url).origin;
    const configured = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : null;
    return origin === requestOrigin || origin === configured ? origin : null;
  } catch { return null; }
}

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}
function failure(error: unknown) {
  const code = error instanceof ChatMediaError ? error.code : 'service_unavailable';
  const status = code === 'authentication_required' ? 401 : code === 'not_found' ? 404 : code === 'invalid_input' || code === 'invalid_media' ? 400 : 503;
  return Response.json({ error: code }, { status, headers: NO_STORE });
}
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin'), conversationId: z.uuid(), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']), sizeBytes: z.number().int(), sha256: z.string() }).strict(),
  z.object({ action: z.literal('complete'), attachmentId: z.uuid() }).strict(),
  z.object({ action: z.literal('delete'), attachmentId: z.uuid() }).strict(),
]);

export async function POST(request: Request) {
  if (!requestOrigin(request)) return Response.json({ error: 'invalid_origin' }, { status: 403, headers: NO_STORE });
  if (!await requireAuth()) return Response.json({ error: 'authentication_required' }, { status: 401, headers: NO_STORE });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400, headers: NO_STORE });
  try {
    if (parsed.data.action === 'begin') return Response.json(await beginChatAttachment(parsed.data), { status: 201, headers: NO_STORE });
    if (parsed.data.action === 'complete') return Response.json(await completeChatAttachment(parsed.data), { headers: NO_STORE });
    await deletePendingChatAttachment(parsed.data);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  if (!requestOrigin(request)) return Response.json({ error: 'invalid_origin' }, { status: 403, headers: NO_STORE });
  if (!await requireAuth()) return Response.json({ error: 'authentication_required' }, { status: 401, headers: NO_STORE });
  const attachmentId = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
  if (!attachmentId.success) return Response.json({ error: 'invalid_input' }, { status: 400, headers: NO_STORE });
  try {
    const signed = await signChatAttachmentRead({ attachmentId: attachmentId.data });
    const response = Response.redirect(signed.url, 307);
    response.headers.set('cache-control', NO_STORE['cache-control']);
    return response;
  } catch (error) { return failure(error); }
}
