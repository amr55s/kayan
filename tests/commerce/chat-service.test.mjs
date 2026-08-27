import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const zod = nativeRequire('zod');
const servicePath = new URL('../../lib/commerce/chat/service.ts', import.meta.url);
const actionsPath = new URL('../../lib/commerce/chat/actions.ts', import.meta.url);
const contractsPath = new URL('../../lib/commerce/chat/contracts.ts', import.meta.url);
const inputPath = new URL('../../lib/commerce/chat/input.ts', import.meta.url);
const operations = readFileSync(new URL('../../lib/commerce/operations.ts', import.meta.url), 'utf8');
const operationActions = readFileSync(new URL('../../lib/commerce/operations-actions.ts', import.meta.url), 'utf8');

function loadTypeScriptModule(path, dependencies) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.pathname,
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (specifier) => Object.hasOwn(dependencies, specifier)
    ? dependencies[specifier]
    : nativeRequire(specifier);
  Function('require', 'module', 'exports', output)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const contracts = loadTypeScriptModule(contractsPath, {});
const input = loadTypeScriptModule(inputPath, { zod, './contracts': contracts });

function loadService(createClient) {
  return loadTypeScriptModule(servicePath, {
    'server-only': {},
    zod,
    '@/lib/supabase/server': { createClient },
    './contracts': contracts,
    './input': input,
  });
}

const IDS = {
  user: '10000000-0000-4000-8000-000000000001',
  conversation: '20000000-0000-4000-8000-000000000001',
  store: '30000000-0000-4000-8000-000000000001',
  order: '40000000-0000-4000-8000-000000000001',
  message: '50000000-0000-4000-8000-000000000001',
  clientMessage: '60000000-0000-4000-8000-000000000001',
  counterparty: '70000000-0000-4000-8000-000000000001',
};

function fakeClient({ auth = { data: { user: { id: IDS.user } }, error: null }, rpcData, rpcError = null } = {}) {
  const events = [];
  return {
    events,
    client: {
      auth: {
        async getUser() {
          events.push({ type: 'auth' });
          if (auth instanceof Error) throw auth;
          return auth;
        },
      },
      async rpc(name, args) {
        events.push({ type: 'rpc', name, args });
        return { data: rpcData, error: rpcError };
      },
    },
  };
}

const NOW = '2026-08-24T12:00:00Z';
const summary = {
  id: IDS.conversation,
  publicCode: 'CHAT-0001',
  kind: 'order',
  status: 'open',
  subject: 'Order chat',
  store: { id: IDS.store, name: 'متجر دايرتك' },
  order: { id: IDS.order, publicCode: 'ORDER-0001' },
  counterpart: { displayName: 'التاجر', role: 'merchant', avatarUrl: null },
  lastMessageAt: NOW,
  unreadCount: 0,
};
const message = {
  id: IDS.message,
  clientMessageId: IDS.clientMessage,
  conversationId: IDS.conversation,
  senderId: IDS.user,
  senderRole: 'customer',
  kind: 'text',
  body: 'هل الطلب جاهز؟',
  replyToId: null,
  card: null,
  attachment: null,
  reactions: [],
  deleted: false,
  createdAt: NOW,
};
const cursor = { createdAt: NOW, id: IDS.message };
const sendInput = {
  conversationId: IDS.conversation,
  clientMessageId: IDS.clientMessage,
  kind: 'text',
  body: 'هل الطلب جاهز؟',
  replyToId: null,
  card: null,
};

const rpcCases = [
  {
    label: 'open', rpc: 'open_my_marketplace_conversation', result: summary,
    args: { p_store_id: null, p_order_id: IDS.order, p_kind: 'order' },
    invoke: (service) => service.openConversation({ kind: 'order', orderId: IDS.order }),
  },
  {
    label: 'list', rpc: 'list_my_marketplace_conversations', result: { items: [summary], nextCursor: cursor },
    args: { p_kind: 'order', p_limit: 20, p_before_created_at: NOW, p_before_id: IDS.message },
    invoke: (service) => service.listConversations({ kind: 'order', limit: 20, cursor }),
  },
  {
    label: 'page', rpc: 'get_my_marketplace_conversation_page',
    result: { conversation: summary, messages: [message], nextCursor: cursor, lastReadMessageId: IDS.message },
    args: { p_thread_id: IDS.conversation, p_limit: 25, p_before_created_at: NOW, p_before_id: IDS.message },
    invoke: (service) => service.getConversationPage({ conversationId: IDS.conversation, limit: 25, cursor }),
  },
  {
    label: 'search', rpc: 'search_my_marketplace_chat_messages', result: { items: [message], nextCursor: cursor },
    args: { p_thread_id: IDS.conversation, p_query: 'جاهز', p_limit: 10, p_before_created_at: NOW, p_before_id: IDS.message },
    invoke: (service) => service.searchConversationMessages({ conversationId: IDS.conversation, query: 'جاهز', limit: 10, cursor }),
  },
  {
    label: 'send', rpc: 'send_my_marketplace_chat_message', result: message,
    args: { p_thread_id: IDS.conversation, p_client_message_id: IDS.clientMessage, p_kind: 'text', p_body: 'هل الطلب جاهز؟', p_reply_to_id: null, p_card_data: null },
    invoke: (service) => service.sendMessage(sendInput),
  },
  {
    label: 'read', rpc: 'set_my_marketplace_chat_read_cursor',
    result: { conversationId: IDS.conversation, lastReadMessageId: IDS.message },
    args: { p_thread_id: IDS.conversation, p_message_id: IDS.message },
    invoke: (service) => service.markConversationRead({ conversationId: IDS.conversation, messageId: IDS.message }),
  },
  {
    label: 'reaction', rpc: 'react_to_my_marketplace_chat_message', result: message,
    args: { p_message_id: IDS.message, p_emoji: '👍', p_active: true },
    invoke: (service) => service.setReaction({ messageId: IDS.message, emoji: '👍', active: true }),
  },
  {
    label: 'delete', rpc: 'delete_my_marketplace_chat_message', result: message,
    args: { p_message_id: IDS.message },
    invoke: (service) => service.deleteMessage({ messageId: IDS.message }),
  },
  {
    label: 'preferences', rpc: 'set_my_marketplace_chat_preferences',
    result: { conversationId: IDS.conversation, mutedUntil: NOW },
    args: { p_thread_id: IDS.conversation, p_muted_until: NOW },
    invoke: (service) => service.setConversationPreferences({ conversationId: IDS.conversation, mutedUntil: NOW }),
  },
  {
    label: 'block', rpc: 'block_my_marketplace_chat_counterparty',
    result: {
      conversationId: IDS.conversation,
      counterpartyId: IDS.counterparty,
      blocked: true,
      deliveryContinuityRequired: true,
      supportEscalationConversationId: IDS.conversation,
      orderSupportAvailable: true,
      administrationAssigned: true,
      safeCopy: 'Direct messages are blocked. Order-support messages remain available.',
    },
    args: { p_thread_id: IDS.conversation, p_counterparty_id: IDS.counterparty, p_blocked: true },
    invoke: (service) => service.setConversationBlock({ conversationId: IDS.conversation, userId: IDS.counterparty, blocked: true }),
  },
];

test('authentication completes before every exact participant RPC and its strict parser accepts the matching DTO', async () => {
  for (const entry of rpcCases) {
    const fake = fakeClient({ rpcData: entry.result });
    const service = loadService(async () => fake.client);
    assert.deepEqual(await entry.invoke(service), entry.result, entry.label);
    assert.deepEqual(fake.events, [
      { type: 'auth' },
      { type: 'rpc', name: entry.rpc, args: entry.args },
    ], entry.label);
  }
});

test('every participant RPC rejects a malformed DTO through its bound parser', async () => {
  for (const entry of rpcCases) {
    const fake = fakeClient({ rpcData: {} });
    const service = loadService(async () => fake.client);
    await assert.rejects(entry.invoke(service), (error) => error.code === 'service_unavailable', entry.label);
  }
});

test('missing and all stable expired Supabase Auth sessions map to authentication_required without an RPC', async () => {
  const missingSessions = [
    { data: { user: null }, error: null },
    { data: { user: null }, error: { name: 'AuthSessionMissingError' } },
    { data: { user: null }, error: { code: 'session_expired', message: 'secret expiry detail' } },
    { data: { user: null }, error: { code: 'session_not_found' } },
    { data: { user: null }, error: { code: 'refresh_token_not_found' } },
    { data: { user: null }, error: { code: 'refresh_token_already_used' } },
    { data: { user: null }, error: { code: 'bad_jwt' } },
  ];
  for (const auth of missingSessions) {
    const fake = fakeClient({ auth, rpcData: summary });
    const service = loadService(async () => fake.client);
    await assert.rejects(
      service.openConversation({ kind: 'order', orderId: IDS.order }),
      (error) => error.code === 'authentication_required' && error.message === 'authentication_required',
    );
    assert.deepEqual(fake.events, [{ type: 'auth' }]);
  }
});

test('unknown Auth, network, and RPC provider failures are redacted as service_unavailable', async () => {
  for (const auth of [
    { data: { user: null }, error: { code: 'future_auth_error', message: 'secret auth detail' } },
    new Error('secret network detail'),
  ]) {
    const fake = fakeClient({ auth, rpcData: summary });
    const service = loadService(async () => fake.client);
    await assert.rejects(
      service.openConversation({ kind: 'order', orderId: IDS.order }),
      (error) => error.code === 'service_unavailable' && error.message === 'service_unavailable',
    );
  }
  const fake = fakeClient({ rpcData: null, rpcError: { code: 'future_database_code', message: 'secret row detail' } });
  const service = loadService(async () => fake.client);
  await assert.rejects(
    service.openConversation({ kind: 'order', orderId: IDS.order }),
    (error) => error.code === 'service_unavailable' && error.message === 'service_unavailable',
  );
});

test('public send input cannot forge sender identity', async () => {
  const fake = fakeClient({ rpcData: message });
  const service = loadService(async () => fake.client);
  await assert.rejects(
    service.sendMessage({ ...sendInput, senderId: IDS.counterparty, senderRole: 'admin' }),
    (error) => error.code === 'invalid_input',
  );
  assert.deepEqual(fake.events, []);
});

test('Server Actions revalidate only allowlisted chat routes and return JSON-serializable state', async () => {
  const revalidated = [];
  let sends = 0;
  const service = {
    async sendMessage() { sends += 1; return message; },
    toChatActionState(error) { return { status: 'error', code: error?.code ?? 'service_unavailable' }; },
  };
  const actions = loadTypeScriptModule(actionsPath, {
    'next/cache': { revalidatePath: (path) => revalidated.push(path) },
    zod,
    './contracts': contracts,
    './input': input,
    './service': service,
  });
  for (const route of ['/account/chat', '/merchant/marketplace/chat', '/driver/marketplace/chat', '/admin/marketplace/chat']) {
    const form = new FormData();
    for (const [key, value] of Object.entries(sendInput)) if (typeof value === 'string') form.set(key, value);
    form.set('chatRoute', route);
    const state = await actions.sendMarketplaceChatMessageAction({ status: 'idle' }, form);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), { status: 'sent' });
  }
  const external = new FormData();
  for (const [key, value] of Object.entries(sendInput)) if (typeof value === 'string') external.set(key, value);
  external.set('chatRoute', 'https://evil.example/chat');
  assert.deepEqual(
    await actions.sendMarketplaceChatMessageAction({ status: 'idle' }, external),
    { status: 'error', code: 'invalid_input' },
  );
  assert.deepEqual(revalidated, ['/account/chat', '/merchant/marketplace/chat', '/driver/marketplace/chat', '/admin/marketplace/chat']);
  assert.equal(sends, 4);
});

test('legacy exports keep genuine support RPC behavior until Task 8', () => {
  assert.match(operations, /authenticatedRpc\('list_my_marketplace_support_threads'/u);
  assert.match(operations, /authenticatedRpc\('get_my_marketplace_support_thread_page'/u);
  assert.doesNotMatch(operations, /listConversations\(\{/u);
  assert.doesNotMatch(operations, /getConversationPage\(\{/u);
  assert.match(operationActions, /\.rpc\('create_my_marketplace_support_thread'/u);
  assert.match(operationActions, /\.rpc\('reply_my_marketplace_support_thread'/u);
  assert.match(operationActions, /\.rpc\('close_my_marketplace_support_thread'/u);
  assert.doesNotMatch(operationActions, /crypto\.randomUUID\(\)/u);
});

test('service uses the generated typed client directly without unchecked facades', () => {
  const source = readFileSync(servicePath, 'utf8');
  assert.doesNotMatch(source, /as unknown as|\bas any\b|Record<string, unknown>|type ChatRpcClient|type ChatRpcName/u);
});
