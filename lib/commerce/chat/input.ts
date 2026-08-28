import { z } from 'zod';
import type { ChatMessage, ChatReactionInput, ChatSearchInput, ConversationIntent, SendMessageInput } from './contracts';

const uuid = z.string().uuid();
const cursor = z.object({ createdAt: z.string().datetime(), id: uuid });
const card = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['product', 'store', 'order']), id: uuid }).strict(),
  z.object({ type: z.literal('location'), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).strict(),
]);
const kind = z.enum(['text', 'image', 'product', 'store', 'order', 'location']);
const codePointBound = (max: number) => z.string().refine((value) => [...value].length <= max, `Must contain at most ${max} Unicode characters`);
const body = codePointBound(5000);
const searchQuery = z.string().trim().refine(
  (value) => [...value].length >= 1 && [...value].length <= 200,
  'Must contain between 1 and 200 Unicode characters',
);

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

export const chatSearchSchema = z.object({ conversationId: uuid, query: searchQuery, limit: z.number().int().min(1).max(50).default(50), cursor: cursor.nullable().default(null) });
export const parseChatSearchInput = (input: unknown) => chatSearchSchema.safeParse(input) as ReturnType<typeof chatSearchSchema.safeParse>;

export const reactionSchema = z.object({ messageId: uuid, emoji: z.enum(['👍', '❤️', '✅', '🙏', '😄']), active: z.boolean() }) satisfies z.ZodType<ChatReactionInput>;
export const parseReactionInput = (input: unknown) => reactionSchema.safeParse(input);

const idInput = (name: string) => z.object({ [name]: uuid });
export const parseDeleteMessageInput = (input: unknown) => idInput('messageId').safeParse(input);
export const parseChatPreferencesInput = (input: unknown) => z.object({ muted: z.boolean(), readReceipts: z.boolean().optional(), typingIndicators: z.boolean().optional() }).safeParse(input);
export const parseChatBlockInput = (input: unknown) => z.object({ userId: uuid, blocked: z.boolean().default(true) }).safeParse(input);
export const parseChatReportInput = (input: unknown) => z.object({ messageId: uuid.nullable().optional(), conversationId: uuid.nullable().optional(), reason: z.string().trim().min(1).max(500) }).refine((value) => value.messageId !== null && value.messageId !== undefined || value.conversationId !== null && value.conversationId !== undefined).safeParse(input);

export type ParsedChatSearchInput = ChatSearchInput;

const chatOutputLabel = z.string().min(1).max(500);
const chatCardOutputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['product', 'store', 'order']), id: z.string().min(1), label: chatOutputLabel }).strict(),
  z.object({ type: z.literal('location'), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), label: chatOutputLabel }).strict(),
]);
const chatAttachmentOutputSchema = z.object({ id: z.string().min(1), url: z.string().url(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(), alt: z.string() }).strict();
const chatReactionOutputSchema = z.object({ emoji: z.string().min(1).max(16), count: z.number().int().nonnegative(), reactedByMe: z.boolean() }).strict();
/** Sole strict parser for the ChatMessage service/wire DTO. */
const chatMessageObject = z.object({
  id: z.string().min(1), clientMessageId: z.string().nullable(), conversationId: z.string().min(1), senderId: z.string().nullable(),
  senderRole: z.enum(['customer', 'merchant', 'driver', 'admin', 'system']), kind: z.enum(['text', 'image', 'product', 'store', 'order', 'location', 'system']), body: codePointBound(5000).nullable(), replyToId: z.string().nullable(),
  card: chatCardOutputSchema.nullable(), attachment: chatAttachmentOutputSchema.nullable(), reactions: z.array(chatReactionOutputSchema).max(5),
  deleted: z.boolean(), createdAt: z.string().min(1), revision: z.number().int().positive(),
}).strict();
export const chatMessageSchema: z.ZodType<ChatMessage> = chatMessageObject;

/** Reconciliation and service consume the same output acceptance contract. */
export const chatReconcileMessageSchema = chatMessageSchema;
