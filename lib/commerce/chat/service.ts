import 'server-only';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  chatConversationKinds,
  chatMessageKinds,
  chatRoles,
  type ChatActionState,
  type ChatConversationKind,
  type ChatConversationPage,
  type ChatConversationSummary,
  type ChatCursor,
  type ChatErrorCode,
  type ChatMessage,
  type ChatMessagePage,
  type ChatReactionInput,
  type ChatSearchInput,
  type ConversationIntent,
  type SendMessageInput,
} from './contracts';
import {
  chatSearchSchema,
  conversationIntentSchema,
  reactionSchema,
  sendMessageSchema,
} from './input';

type ChatRpcName =
  | 'open_my_marketplace_conversation'
  | 'list_my_marketplace_conversations'
  | 'get_my_marketplace_conversation_page'
  | 'search_my_marketplace_chat_messages'
  | 'send_my_marketplace_chat_message'
  | 'set_my_marketplace_chat_read_cursor'
  | 'react_to_my_marketplace_chat_message'
  | 'delete_my_marketplace_chat_message'
  | 'set_my_marketplace_chat_preferences'
  | 'block_my_marketplace_chat_counterparty';

type ChatRpcResponse = { data: unknown; error: unknown };
type ChatRpcClient = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(name: ChatRpcName, args: Record<string, unknown>): Promise<ChatRpcResponse>;
};

export type ListConversationsInput = {
  kind?: ChatConversationKind | null;
  limit?: number;
  cursor?: ChatCursor | null;
};

export type GetConversationPageInput = {
  conversationId: string;
  limit?: number;
  cursor?: ChatCursor | null;
};

export type MarkConversationReadInput = {
  conversationId: string;
  messageId: string;
};

export type DeleteMessageInput = { messageId: string };
export type SetConversationPreferencesInput = {
  conversationId: string;
  mutedUntil: string | null;
};
export type SetConversationBlockInput = {
  conversationId: string;
  userId: string;
  blocked: boolean;
};

export type ChatMessageSearchPage = {
  items: ChatMessage[];
  nextCursor: ChatCursor | null;
};

export type ChatReadCursorResult = {
  conversationId: string;
  lastReadMessageId: string;
};

export type ChatPreferencesResult = {
  conversationId: string;
  mutedUntil: string | null;
};

export type ChatBlockResult = {
  conversationId: string;
  counterpartyId: string;
  blocked: boolean;
  deliveryContinuityRequired: boolean;
  supportEscalationConversationId: string | null;
  orderSupportAvailable: boolean;
  administrationAssigned: boolean;
  safeCopy: string;
};

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const codePointBound = (max: number) => z.string().refine(
  (value) => [...value].length <= max,
  `Must contain at most ${max} Unicode characters`,
);
const chatCursorSchema = z.object({ createdAt: timestamp, id: uuid }).strict();
const chatCardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['product', 'store', 'order']), id: uuid, label: z.string().min(1).max(500) }).strict(),
  z.object({
    type: z.literal('location'),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    label: z.string().min(1).max(500),
  }).strict(),
]);
const chatAttachmentSchema = z.object({
  id: uuid,
  url: z.url(),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  alt: z.string().max(500),
}).strict();
const chatReactionSummarySchema = z.object({
  emoji: z.string().min(1).max(16),
  count: z.number().int().nonnegative(),
  reactedByMe: z.boolean(),
}).strict();
const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: uuid,
  clientMessageId: uuid.nullable(),
  conversationId: uuid,
  senderId: uuid.nullable(),
  senderRole: z.enum(chatRoles),
  kind: z.enum(chatMessageKinds),
  body: codePointBound(5_000).nullable(),
  replyToId: uuid.nullable(),
  card: chatCardSchema.nullable(),
  attachment: chatAttachmentSchema.nullable(),
  reactions: z.array(chatReactionSummarySchema).max(5),
  deleted: z.boolean(),
  createdAt: timestamp,
}).strict();
const chatConversationSummarySchema: z.ZodType<ChatConversationSummary> = z.object({
  id: uuid,
  publicCode: z.string().min(1).max(64),
  kind: z.enum(chatConversationKinds),
  status: z.enum(['open', 'waiting_customer', 'waiting_support', 'resolved', 'closed', 'paused']),
  subject: z.string().min(1).max(160),
  store: z.object({ id: uuid, name: z.string().min(1).max(180) }).strict().nullable(),
  order: z.object({ id: uuid, publicCode: z.string().min(1).max(64) }).strict().nullable(),
  counterpart: z.object({
    displayName: z.string().min(1).max(180),
    role: z.enum(chatRoles),
    avatarUrl: z.url().nullable(),
  }).strict().nullable(),
  lastMessageAt: timestamp,
  unreadCount: z.number().int().nonnegative(),
}).strict();
const chatConversationPageSchema: z.ZodType<ChatConversationPage> = z.object({
  items: z.array(chatConversationSummarySchema).max(100),
  nextCursor: chatCursorSchema.nullable(),
}).strict();
const chatMessagePageSchema: z.ZodType<ChatMessagePage> = z.object({
  conversation: chatConversationSummarySchema,
  messages: z.array(chatMessageSchema).max(100),
  nextCursor: chatCursorSchema.nullable(),
  lastReadMessageId: uuid.nullable(),
}).strict();
const chatMessageSearchPageSchema: z.ZodType<ChatMessageSearchPage> = z.object({
  items: z.array(chatMessageSchema).max(50),
  nextCursor: chatCursorSchema.nullable(),
}).strict();
const chatReadCursorResultSchema: z.ZodType<ChatReadCursorResult> = z.object({
  conversationId: uuid,
  lastReadMessageId: uuid,
}).strict();
const chatPreferencesResultSchema: z.ZodType<ChatPreferencesResult> = z.object({
  conversationId: uuid,
  mutedUntil: timestamp.nullable(),
}).strict();
const chatBlockResultSchema: z.ZodType<ChatBlockResult> = z.object({
  conversationId: uuid,
  counterpartyId: uuid,
  blocked: z.boolean(),
  deliveryContinuityRequired: z.boolean(),
  supportEscalationConversationId: uuid.nullable(),
  orderSupportAvailable: z.boolean(),
  administrationAssigned: z.boolean(),
  safeCopy: z.string().min(1).max(500),
}).strict();

const listConversationsInputSchema = z.object({
  kind: z.enum(chatConversationKinds).nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: chatCursorSchema.nullable().optional(),
}).strict();
const getConversationPageInputSchema = z.object({
  conversationId: uuid,
  limit: z.number().int().min(1).max(100).optional(),
  cursor: chatCursorSchema.nullable().optional(),
}).strict();
const markConversationReadInputSchema = z.object({ conversationId: uuid, messageId: uuid }).strict();
const deleteMessageInputSchema = z.object({ messageId: uuid }).strict();
const setConversationPreferencesInputSchema = z.object({
  conversationId: uuid,
  mutedUntil: timestamp.nullable(),
}).strict();
const setConversationBlockInputSchema = z.object({
  conversationId: uuid,
  userId: uuid,
  blocked: z.boolean(),
}).strict();

const stableRpcErrorCodes: Readonly<Record<string, ChatErrorCode>> = {
  '28000': 'authentication_required',
  '22023': 'invalid_input',
  'P0002': 'not_found',
  '55000': 'closed',
  'P0001': 'rate_limited',
};

export class ChatServiceError extends Error {
  constructor(public readonly code: ChatErrorCode) {
    super(code);
    this.name = 'ChatServiceError';
  }
}

async function authenticatedChatClient(): Promise<ChatRpcClient> {
  let supabase: ChatRpcClient;
  try {
    supabase = await createClient() as unknown as ChatRpcClient;
  } catch {
    throw new ChatServiceError('service_unavailable');
  }

  let authResult: Awaited<ReturnType<ChatRpcClient['auth']['getUser']>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch {
    throw new ChatServiceError('service_unavailable');
  }
  const { data: { user }, error } = authResult;
  if (error) throw mapChatRpcError(error);
  if (!user) throw new ChatServiceError('authentication_required');
  return supabase;
}

function parseRpcResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ChatServiceError('service_unavailable');
  return parsed.data;
}

function parseChatMessage(value: unknown): ChatMessage {
  return chatMessageSchema.parse(value);
}

function mapChatRpcError(error: unknown): ChatServiceError {
  const parsed = z.object({ code: z.string() }).passthrough().safeParse(error);
  if (!parsed.success) return new ChatServiceError('service_unavailable');
  const code = stableRpcErrorCodes[parsed.data.code];
  return new ChatServiceError(code ?? 'service_unavailable');
}

function parseServiceInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ChatServiceError('invalid_input');
  return parsed.data;
}

async function executeRpc(call: () => Promise<ChatRpcResponse>): Promise<unknown> {
  let response: ChatRpcResponse;
  try {
    response = await call();
  } catch {
    throw new ChatServiceError('service_unavailable');
  }
  if (response.error) throw mapChatRpcError(response.error);
  return response.data;
}

export function toChatActionState(error: unknown): ChatActionState {
  return error instanceof ChatServiceError
    ? { status: 'error', code: error.code }
    : { status: 'error', code: 'service_unavailable' };
}

export async function openConversation(intent: ConversationIntent): Promise<ChatConversationSummary> {
  const input = parseServiceInput(conversationIntentSchema, intent);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('open_my_marketplace_conversation', {
    p_store_id: input.kind === 'presale' ? input.storeId : null,
    p_order_id: input.kind === 'order' ? input.orderId : null,
    p_kind: input.kind,
  }));
  return parseRpcResult(chatConversationSummarySchema, data);
}

export async function listConversations(input: ListConversationsInput = {}): Promise<ChatConversationPage> {
  const parsedInput = parseServiceInput(listConversationsInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('list_my_marketplace_conversations', {
    p_kind: parsedInput.kind ?? null,
    p_limit: parsedInput.limit ?? 30,
    p_before_created_at: parsedInput.cursor?.createdAt ?? null,
    p_before_id: parsedInput.cursor?.id ?? null,
  }));
  return parseRpcResult(chatConversationPageSchema, data);
}

export async function getConversationPage(input: GetConversationPageInput): Promise<ChatMessagePage> {
  const parsedInput = parseServiceInput(getConversationPageInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('get_my_marketplace_conversation_page', {
    p_thread_id: parsedInput.conversationId,
    p_limit: parsedInput.limit ?? 50,
    p_before_created_at: parsedInput.cursor?.createdAt ?? null,
    p_before_id: parsedInput.cursor?.id ?? null,
  }));
  return parseRpcResult(chatMessagePageSchema, data);
}

export async function searchConversationMessages(input: ChatSearchInput): Promise<ChatMessageSearchPage> {
  const parsedInput = parseServiceInput(chatSearchSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('search_my_marketplace_chat_messages', {
    p_thread_id: parsedInput.conversationId,
    p_query: parsedInput.query,
    p_limit: parsedInput.limit,
    p_before_created_at: parsedInput.cursor?.createdAt ?? null,
    p_before_id: parsedInput.cursor?.id ?? null,
  }));
  return parseRpcResult(chatMessageSearchPageSchema, data);
}

export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const parsedInput = parseServiceInput(sendMessageSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('send_my_marketplace_chat_message', {
    p_thread_id: parsedInput.conversationId,
    p_client_message_id: parsedInput.clientMessageId,
    p_kind: parsedInput.kind,
    p_body: parsedInput.body,
    p_reply_to_id: parsedInput.replyToId,
    p_card_data: parsedInput.card,
  }));
  try {
    return parseChatMessage(data);
  } catch {
    throw new ChatServiceError('service_unavailable');
  }
}

export async function markConversationRead(input: MarkConversationReadInput): Promise<ChatReadCursorResult> {
  const parsedInput = parseServiceInput(markConversationReadInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('set_my_marketplace_chat_read_cursor', {
    p_thread_id: parsedInput.conversationId,
    p_message_id: parsedInput.messageId,
  }));
  return parseRpcResult(chatReadCursorResultSchema, data);
}

export async function setReaction(input: ChatReactionInput): Promise<ChatMessage> {
  const parsedInput = parseServiceInput(reactionSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('react_to_my_marketplace_chat_message', {
    p_message_id: parsedInput.messageId,
    p_emoji: parsedInput.emoji,
    p_active: parsedInput.active,
  }));
  try {
    return parseChatMessage(data);
  } catch {
    throw new ChatServiceError('service_unavailable');
  }
}

export async function deleteMessage(input: DeleteMessageInput): Promise<ChatMessage> {
  const parsedInput = parseServiceInput(deleteMessageInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('delete_my_marketplace_chat_message', {
    p_message_id: parsedInput.messageId,
  }));
  try {
    return parseChatMessage(data);
  } catch {
    throw new ChatServiceError('service_unavailable');
  }
}

export async function setConversationPreferences(input: SetConversationPreferencesInput): Promise<ChatPreferencesResult> {
  const parsedInput = parseServiceInput(setConversationPreferencesInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('set_my_marketplace_chat_preferences', {
    p_thread_id: parsedInput.conversationId,
    p_muted_until: parsedInput.mutedUntil,
  }));
  return parseRpcResult(chatPreferencesResultSchema, data);
}

export async function setConversationBlock(input: SetConversationBlockInput): Promise<ChatBlockResult> {
  const parsedInput = parseServiceInput(setConversationBlockInputSchema, input);
  const supabase = await authenticatedChatClient();
  const data = await executeRpc(() => supabase.rpc('block_my_marketplace_chat_counterparty', {
    p_thread_id: parsedInput.conversationId,
    p_counterparty_id: parsedInput.userId,
    p_blocked: parsedInput.blocked,
  }));
  return parseRpcResult(chatBlockResultSchema, data);
}
