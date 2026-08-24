import { z } from 'zod';
import type { ChatReactionInput, ChatSearchInput, ConversationIntent, SendMessageInput } from './contracts';

const uuid = z.string().uuid();
const cursor = z.object({ createdAt: z.string().datetime(), id: uuid });
const card = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['product', 'store', 'order']), id: uuid }).strict(),
  z.object({ type: z.literal('location'), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).strict(),
]);
const kind = z.enum(['text', 'image', 'product', 'store', 'order', 'location']);
const codePointBound = (max: number) => z.string().refine((value) => [...value].length <= max, `Must contain at most ${max} Unicode characters`);
const body = codePointBound(5000);

export const sendMessageSchema = z.object({ conversationId: uuid, clientMessageId: uuid, kind, body: body.nullable(), replyToId: uuid.nullable(), card: card.nullable() }).strict().superRefine((value, context) => {
  if (value.kind === 'text' && (!value.body || value.body.trim().length === 0 || value.card !== null)) context.addIssue({ code: 'custom', message: 'Text messages require a nonblank body and no card' });
  if (value.kind === 'image' && (value.body !== null || value.card !== null)) context.addIssue({ code: 'custom', message: 'Image messages cannot include a body or card' });
  if (['product', 'store', 'order', 'location'].includes(value.kind) && (value.body !== null || value.card === null || value.card.type !== value.kind)) context.addIssue({ code: 'custom', message: 'Card messages require a matching card and no body' });
});
export function parseSendMessageForm(formData: FormData) {
  const value = (name: string) => { const item = formData.get(name); return typeof item === 'string' ? item : null; };
  const rawBody = value('body');
  const rawCard = value('card');
  let parsedCard: unknown = null;
  if (rawCard !== null) {
    try { parsedCard = JSON.parse(rawCard); } catch { parsedCard = undefined; }
  }
  return sendMessageSchema.safeParse({ conversationId: value('conversationId'), clientMessageId: value('clientMessageId'), kind: value('kind') ?? 'text', body: rawBody === null || rawBody === '' ? null : rawBody, replyToId: value('replyToId'), card: parsedCard });
}

export const conversationIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('presale'), storeId: uuid, productId: uuid.nullable().default(null) }),
  z.object({ kind: z.literal('order'), orderId: uuid }),
]) satisfies z.ZodType<ConversationIntent>;
export const parseConversationIntent = (input: unknown) => conversationIntentSchema.safeParse(input);

export const chatSearchSchema = z.object({ conversationId: uuid, query: codePointBound(200), limit: z.number().int().min(1).max(50).default(50), cursor: cursor.nullable().default(null) });
export const parseChatSearchInput = (input: unknown) => chatSearchSchema.safeParse(input) as ReturnType<typeof chatSearchSchema.safeParse>;

export const reactionSchema = z.object({ messageId: uuid, emoji: z.enum(['👍', '❤️', '✅', '🙏', '😄']), active: z.boolean() }) satisfies z.ZodType<ChatReactionInput>;
export const parseReactionInput = (input: unknown) => reactionSchema.safeParse(input);

const idInput = (name: string) => z.object({ [name]: uuid });
export const parseDeleteMessageInput = (input: unknown) => idInput('messageId').safeParse(input);
export const parseChatPreferencesInput = (input: unknown) => z.object({ muted: z.boolean(), readReceipts: z.boolean().optional(), typingIndicators: z.boolean().optional() }).safeParse(input);
export const parseChatBlockInput = (input: unknown) => z.object({ userId: uuid, blocked: z.boolean().default(true) }).safeParse(input);
export const parseChatReportInput = (input: unknown) => z.object({ messageId: uuid.nullable().optional(), conversationId: uuid.nullable().optional(), reason: z.string().trim().min(1).max(500) }).refine((value) => value.messageId !== null && value.messageId !== undefined || value.conversationId !== null && value.conversationId !== undefined).safeParse(input);

export type ParsedChatSearchInput = ChatSearchInput;
