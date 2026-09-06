import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createPrivateMediaDownload,
  createPrivateStageUpload,
  deleteMediaObject,
  getPrivateMediaBucketName,
  headPrivateMediaObject,
  readPrivateMediaObject,
} from '@/lib/media/spaces';

export const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const CHAT_ATTACHMENT_READ_TTL_SECONDS = 60;
export const CHAT_RASTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

const uuid = z.uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/iu).transform((value) => value.toLowerCase());
const attachmentInput = z.object({
  conversationId: uuid,
  contentType: z.enum(CHAT_RASTER_MIME_TYPES),
  sizeBytes: z.number().int().min(32).max(MAX_CHAT_ATTACHMENT_BYTES),
  sha256,
}).strict();
const attachmentIdInput = z.object({ attachmentId: uuid }).strict();
const extensions: Record<(typeof CHAT_RASTER_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
};
const formatMime: Record<string, (typeof CHAT_RASTER_MIME_TYPES)[number]> = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif',
};

export class ChatMediaError extends Error {
  constructor(public readonly code: 'invalid_input' | 'authentication_required' | 'not_found' | 'invalid_media' | 'service_unavailable') {
    super(code);
    this.name = 'ChatMediaError';
  }
}

type AttachmentRecord = {
  id: string; threadId: string; ownerId: string; objectKey: string; contentType: string;
  sha256: string; byteSize: number; width: number | null; height: number | null; status: string;
};

const attachmentRecord = z.object({
  id: uuid, threadId: uuid, ownerId: uuid, objectKey: z.string().min(1).max(1024),
  contentType: z.enum(CHAT_RASTER_MIME_TYPES), sha256, byteSize: z.number().int().positive(),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  status: z.enum(['pending', 'verified', 'quarantined', 'deleted']),
}).strict();

async function authenticated() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ChatMediaError('authentication_required');
  return { supabase, user };
}

function attachmentKey(input: { conversationId: string; userId: string; sha256: string; contentType: (typeof CHAT_RASTER_MIME_TYPES)[number] }) {
  const extension = extensions[input.contentType];
  return `chat/${input.conversationId}/${input.userId}/${input.sha256}.${extension}`;
}

function parseRpcRecord(value: unknown): AttachmentRecord {
  const parsed = attachmentRecord.safeParse(value);
  if (!parsed.success) throw new ChatMediaError('service_unavailable');
  return parsed.data;
}

function mediaError(error: unknown): ChatMediaError {
  if (error instanceof ChatMediaError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
  if (code === '28000') return new ChatMediaError('authentication_required');
  if (code === 'P0002') return new ChatMediaError('not_found');
  if (code === '22023') return new ChatMediaError('invalid_input');
  return new ChatMediaError('service_unavailable');
}

export async function beginChatAttachment(input: z.input<typeof attachmentInput>) {
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success) throw new ChatMediaError('invalid_input');
  const { supabase, user } = await authenticated();
  const objectKey = attachmentKey({ ...parsed.data, userId: user.id });
  const attachmentId = randomUUID();
  const { error } = await (supabase as any).rpc('create_my_marketplace_chat_attachment', {
    p_attachment_id: attachmentId, p_thread_id: parsed.data.conversationId,
    p_object_key: objectKey, p_content_type: parsed.data.contentType,
    p_byte_size: parsed.data.sizeBytes, p_sha256: parsed.data.sha256,
  });
  if (error) throw mediaError(error);
  try {
    const signed = await createPrivateStageUpload({
      checksumSha256: parsed.data.sha256, contentType: parsed.data.contentType,
      objectKey, sizeBytes: parsed.data.sizeBytes,
    });
    return { attachmentId, expiresInSeconds: signed.expiresInSeconds, uploadUrl: signed.uploadUrl, requiredHeaders: signed.requiredHeaders };
  } catch (error) {
    await (supabase as any).rpc('discard_my_marketplace_chat_attachment', { p_attachment_id: attachmentId, p_reason: 'presign_failed' });
    throw mediaError(error);
  }
}

async function getAttachment(supabase: Awaited<ReturnType<typeof createClient>>, attachmentId: string): Promise<AttachmentRecord> {
  const { data, error } = await (supabase as any).rpc('get_my_marketplace_chat_attachment', { p_attachment_id: attachmentId });
  if (error) throw mediaError(error);
  return parseRpcRecord(data);
}

export async function completeChatAttachment(input: z.input<typeof attachmentIdInput>) {
  const parsed = attachmentIdInput.safeParse(input);
  if (!parsed.success) throw new ChatMediaError('invalid_input');
  const { supabase } = await authenticated();
  const attachment = await getAttachment(supabase, parsed.data.attachmentId);
  if (attachment.status === 'verified') return attachment;
  if (attachment.status !== 'pending') throw new ChatMediaError('invalid_media');
  try {
    const head = await headPrivateMediaObject(attachment.objectKey);
    if (!head.ContentLength || head.ContentLength > MAX_CHAT_ATTACHMENT_BYTES || head.ContentLength !== attachment.byteSize) throw new ChatMediaError('invalid_media');
    const bytes = await readPrivateMediaObject(attachment.objectKey, MAX_CHAT_ATTACHMENT_BYTES);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== attachment.sha256) throw new ChatMediaError('invalid_media');
    const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 4096 * 4096 }).metadata();
    const actualMime = metadata.format ? formatMime[metadata.format] : undefined;
    if (!actualMime || actualMime !== attachment.contentType || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
      throw new ChatMediaError('invalid_media');
    }
    const { data, error } = await (createAdminClient() as any).rpc('finalize_marketplace_chat_attachment_from_server', {
      p_attachment_id: attachment.id, p_width: metadata.width, p_height: metadata.height,
      p_actual_sha256: actualHash, p_actual_byte_size: bytes.byteLength, p_actual_content_type: actualMime,
    });
    if (error) throw mediaError(error);
    return parseRpcRecord(data);
  } catch (error) {
    await (supabase as any).rpc('discard_my_marketplace_chat_attachment', { p_attachment_id: attachment.id, p_reason: 'invalid_media' });
    await deleteMediaObject(attachment.objectKey, getPrivateMediaBucketName()).catch(() => undefined);
    throw error instanceof ChatMediaError ? error : new ChatMediaError('invalid_media');
  }
}

export async function signChatAttachmentRead(input: z.input<typeof attachmentIdInput>) {
  const parsed = attachmentIdInput.safeParse(input);
  if (!parsed.success) throw new ChatMediaError('invalid_input');
  const { supabase } = await authenticated();
  const attachment = await getAttachment(supabase, parsed.data.attachmentId);
  if (attachment.status !== 'verified') throw new ChatMediaError('not_found');
  const url = await createPrivateMediaDownload(attachment.objectKey, 60);
  return { url, expiresInSeconds: CHAT_ATTACHMENT_READ_TTL_SECONDS, contentType: attachment.contentType };
}

export async function deletePendingChatAttachment(input: z.input<typeof attachmentIdInput>) {
  const parsed = attachmentIdInput.safeParse(input);
  if (!parsed.success) throw new ChatMediaError('invalid_input');
  const { supabase } = await authenticated();
  const attachment = await getAttachment(supabase, parsed.data.attachmentId);
  const { error } = await (supabase as any).rpc('discard_my_marketplace_chat_attachment', {
    p_attachment_id: attachment.id, p_reason: 'client_cancelled',
  });
  if (error) throw mediaError(error);
  await deleteMediaObject(attachment.objectKey, getPrivateMediaBucketName()).catch(() => undefined);
}
