import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../../lib/commerce/chat/service.ts', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../../lib/commerce/chat/actions.ts', import.meta.url), 'utf8');
const operations = readFileSync(new URL('../../lib/commerce/operations.ts', import.meta.url), 'utf8');
const operationActions = readFileSync(new URL('../../lib/commerce/operations-actions.ts', import.meta.url), 'utf8');

const participantScopedRpcs = [
  'open_my_marketplace_conversation',
  'list_my_marketplace_conversations',
  'get_my_marketplace_conversation_page',
  'search_my_marketplace_chat_messages',
  'send_my_marketplace_chat_message',
  'set_my_marketplace_chat_read_cursor',
  'react_to_my_marketplace_chat_message',
  'delete_my_marketplace_chat_message',
  'set_my_marketplace_chat_preferences',
  'block_my_marketplace_chat_counterparty',
];

test('the chat service authenticates before using only participant-scoped RPCs', () => {
  assert.match(service, /^import 'server-only';/u);
  assert.match(service, /auth\.getUser\(\)/u);
  assert.match(service, /if \(error\)/u);
  assert.match(service, /if \(!user\)/u);

  const calledRpcs = [...service.matchAll(/\.rpc\('([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(calledRpcs)].sort(), participantScopedRpcs.toSorted());
});

test('public chat inputs cannot forge sender identity and every RPC result is parsed', () => {
  for (const exportedFunction of [
    'openConversation',
    'listConversations',
    'getConversationPage',
    'searchConversationMessages',
    'sendMessage',
    'markConversationRead',
    'setReaction',
    'deleteMessage',
    'setConversationPreferences',
    'setConversationBlock',
  ]) {
    assert.match(service, new RegExp(`export async function ${exportedFunction}\\(`, 'u'));
  }
  assert.doesNotMatch(service, /type [^=]*Input[^=]*=[^;]*(?:senderId|senderRole)/su);
  assert.doesNotMatch(service, /p_sender_(?:id|role)/u);
  assert.match(service, /function parseChatMessage\(value: unknown\)/u);
  assert.match(service, /\.parse\(value\)/u);
  assert.equal(
    (service.match(/return (?:parseChatMessage|parseRpcResult)\(/gu) ?? []).length,
    participantScopedRpcs.length,
  );
  assert.doesNotMatch(service, /\bas any\b/u);
});

test('provider failures map only stable codes and never expose raw messages', () => {
  for (const [providerCode, publicCode] of [
    ['28000', 'authentication_required'],
    ['22023', 'invalid_input'],
    ['P0002', 'not_found'],
    ['55000', 'closed'],
    ['P0001', 'rate_limited'],
  ]) {
    assert.match(service, new RegExp(`'${providerCode}': '${publicCode}'`, 'u'));
  }
  assert.match(service, /new ChatServiceError\('service_unavailable'\)/u);
  assert.doesNotMatch(service, /error\.message/u);
  assert.doesNotMatch(actions, /error\.message/u);
});

test('server actions parse forms, return stable serializable state, and revalidate allowlisted chat routes', () => {
  assert.match(actions, /^'use server';/u);
  for (const action of [
    'openMarketplaceConversationAction',
    'sendMarketplaceChatMessageAction',
    'markMarketplaceConversationReadAction',
    'reactMarketplaceChatMessageAction',
    'deleteMarketplaceChatMessageAction',
    'setMarketplaceChatPreferencesAction',
    'setMarketplaceChatBlockAction',
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}\\(`, 'u'));
  }
  for (const parser of [
    'parseConversationIntent',
    'parseSendMessageForm',
    'parseReactionInput',
    'parseDeleteMessageInput',
    'parseChatPreferencesInput',
    'parseChatBlockInput',
  ]) {
    assert.match(actions, new RegExp(`${parser}\\(`, 'u'));
  }
  for (const route of [
    '/account/chat',
    '/merchant/marketplace/chat',
    '/driver/marketplace/chat',
    '/admin/marketplace/chat',
  ]) {
    assert.match(actions, new RegExp(`'${route}'`, 'u'));
  }
  assert.doesNotMatch(actions, /redirect\(/u);
  assert.doesNotMatch(actions, /revalidatePath\((?:field|formData\.get|input\.)/u);
});

test('legacy support exports remain available during route migration', () => {
  for (const name of ['listMyMarketplaceSupportThreads', 'getMyMarketplaceSupportThread']) {
    assert.match(operations, new RegExp(`export async function ${name}\\(`, 'u'));
  }
  for (const name of [
    'createMarketplaceSupportThreadAction',
    'replyMarketplaceSupportThreadAction',
    'closeMarketplaceSupportThreadAction',
  ]) {
    assert.match(operationActions, new RegExp(`export async function ${name}\\(`, 'u'));
  }
  assert.match(operations, /listConversations\(\{/u);
  assert.match(operations, /getConversationPage\(\{/u);
  assert.match(operationActions, /openConversation\(/u);
  assert.match(operationActions, /sendMessage\(\{/u);
  assert.doesNotMatch(operations, /authenticatedRpc\('(?:list|get)_my_marketplace_support_thread/u);
  assert.doesNotMatch(operationActions, /\.rpc\('(?:create|reply)_my_marketplace_support_thread/u);
  // Task 2 deliberately has no participant-scoped close RPC. Preserve the
  // legacy close action until Task 8 replaces the old support route.
  assert.match(operationActions, /\.rpc\('close_my_marketplace_support_thread'/u);
});

test('pagination and block escalation results use the exact Task 2 wire shapes', () => {
  for (const field of ['items', 'nextCursor', 'messages', 'lastReadMessageId']) {
    assert.match(service, new RegExp(`${field}:`, 'u'));
  }
  for (const field of [
    'conversationId',
    'counterpartyId',
    'blocked',
    'deliveryContinuityRequired',
    'supportEscalationConversationId',
    'orderSupportAvailable',
    'administrationAssigned',
    'safeCopy',
  ]) {
    assert.match(service, new RegExp(`${field}:`, 'u'));
  }
  assert.match(service, /p_before_created_at: parsedInput\.cursor\?\.createdAt \?\? null/u);
  assert.match(service, /p_before_id: parsedInput\.cursor\?\.id \?\? null/u);
  assert.match(service, /p_counterparty_id: parsedInput\.userId/u);
});
