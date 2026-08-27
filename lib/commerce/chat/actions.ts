'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ChatActionState } from './contracts';
import {
  parseChatBlockInput,
  parseChatPreferencesInput,
  parseConversationIntent,
  parseDeleteMessageInput,
  parseReactionInput,
  parseSendMessageForm,
} from './input';
import {
  deleteMessage,
  markConversationRead,
  openConversation,
  sendMessage,
  setConversationBlock,
  setConversationPreferences,
  setReaction,
  toChatActionState,
} from './service';

const chatRouteSchema = z.enum([
  '/account/chat',
  '/merchant/marketplace/chat',
  '/driver/marketplace/chat',
  '/admin/marketplace/chat',
]);
const conversationMessageSchema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
}).strict();
const conversationSchema = z.object({ conversationId: z.uuid() }).strict();

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function booleanField(formData: FormData, name: string): boolean | null {
  const value = field(formData, name);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseChatRoute(formData: FormData) {
  return chatRouteSchema.safeParse(field(formData, 'chatRoute') ?? '/account/chat');
}

function sent(route: z.infer<typeof chatRouteSchema>): ChatActionState {
  revalidatePath(route);
  return { status: 'sent' };
}

export async function openMarketplaceConversationAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const kind = field(formData, 'kind');
  const parsed = parseConversationIntent(kind === 'presale'
    ? { kind, storeId: field(formData, 'storeId'), productId: field(formData, 'productId') }
    : { kind, orderId: field(formData, 'orderId') });
  if (!route.success || !parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await openConversation(parsed.data);
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function sendMarketplaceChatMessageAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const parsed = parseSendMessageForm(formData);
  if (!route.success || !parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await sendMessage(parsed.data);
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function markMarketplaceConversationReadAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const parsed = conversationMessageSchema.safeParse({
    conversationId: field(formData, 'conversationId'),
    messageId: field(formData, 'messageId'),
  });
  if (!route.success || !parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await markConversationRead(parsed.data);
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function reactMarketplaceChatMessageAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const active = booleanField(formData, 'active');
  const parsed = parseReactionInput({
    messageId: field(formData, 'messageId'),
    emoji: field(formData, 'emoji'),
    active,
  });
  if (!route.success || !parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await setReaction(parsed.data);
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function deleteMarketplaceChatMessageAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const parsed = parseDeleteMessageInput({ messageId: field(formData, 'messageId') });
  if (!route.success || !parsed.success) return { status: 'error', code: 'invalid_input' };
  try {
    await deleteMessage({ messageId: parsed.data.messageId });
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function setMarketplaceChatPreferencesAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const conversation = conversationSchema.safeParse({ conversationId: field(formData, 'conversationId') });
  const muted = booleanField(formData, 'muted');
  const preferences = parseChatPreferencesInput({ muted });
  if (!route.success || !conversation.success || !preferences.success) {
    return { status: 'error', code: 'invalid_input' };
  }
  const mutedUntil = preferences.data.muted
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString()
    : null;
  try {
    await setConversationPreferences({ conversationId: conversation.data.conversationId, mutedUntil });
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}

export async function setMarketplaceChatBlockAction(
  _previous: ChatActionState,
  formData: FormData,
): Promise<ChatActionState> {
  const route = parseChatRoute(formData);
  const conversation = conversationSchema.safeParse({ conversationId: field(formData, 'conversationId') });
  const blocked = booleanField(formData, 'blocked');
  const block = parseChatBlockInput({ userId: field(formData, 'userId'), blocked });
  if (!route.success || !conversation.success || !block.success) {
    return { status: 'error', code: 'invalid_input' };
  }
  try {
    await setConversationBlock({
      conversationId: conversation.data.conversationId,
      userId: block.data.userId,
      blocked: block.data.blocked,
    });
    return sent(route.data);
  } catch (error) {
    return toChatActionState(error);
  }
}
