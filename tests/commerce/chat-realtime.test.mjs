import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { createElement, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import {
  createMarketplaceChatController,
  createMarketplaceChatTransport,
  useMarketplaceChat,
} from '../../hooks/useMarketplaceChat.ts';

const IDS = {
  conversation: 'bf3d2637-adf4-45ac-8f11-c6576e84bf47',
  currentUser: 'a9a7744e-350a-42a2-91a5-9360bab935d7',
  otherUser: 'e951b6d8-47d9-466f-8943-cde73202255f',
  firstMessage: '637c28d0-b5e0-47d5-892f-90c786f0f65c',
  secondMessage: '26da9a0f-a5f4-4b41-b4bd-28c61a33f73e',
  olderMessage: '28b2720d-c071-435f-a665-2e00226ddeed',
  clientMessage: '43f88cb0-b6fd-4c6a-96ca-61e04d85aff6',
  presence: '63f60cd3-aa37-43c8-852d-692e62b2ac9a',
};

const NOW = '2026-08-24T10:00:00.000Z';

function message(overrides = {}) {
  return {
    id: IDS.firstMessage,
    clientMessageId: null,
    conversationId: IDS.conversation,
    senderId: IDS.otherUser,
    senderRole: 'merchant',
    kind: 'text',
    body: 'الطلب جاهز',
    replyToId: null,
    card: null,
    attachment: null,
    reactions: [],
    deleted: false,
    createdAt: NOW,
    revision: 1,
    ...overrides,
  };
}

function summary() {
  return {
    id: IDS.conversation,
    publicCode: 'CHAT-1',
    kind: 'order',
    status: 'open',
    subject: 'طلب #1',
    store: null,
    order: null,
    counterpart: { displayName: 'المتجر', role: 'merchant', avatarUrl: null },
    lastMessageAt: NOW,
    unreadCount: 1,
  };
}

function page(overrides = {}) {
  return {
    conversation: summary(),
    messages: [message()],
    nextCursor: null,
    lastReadMessageId: null,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

class ManualClock {
  now = Date.parse(NOW);
  #nextId = 1;
  #timers = new Map();

  setTimeout = (callback, delay) => {
    const id = this.#nextId++;
    this.#timers.set(id, { at: this.now + delay, callback });
    return id;
  };

  clearTimeout = (id) => {
    this.#timers.delete(id);
  };

  advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.#timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.#timers.delete(id);
      this.now = timer.at;
      timer.callback();
    }
    this.now = target;
  }

  get size() {
    return this.#timers.size;
  }
}

class FakeBrowserTarget extends EventTarget {
  visibilityState = 'visible';
  online = true;

  emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

class FakeChannel {
  handlers = [];
  sent = [];
  tracked = [];
  subscribeCallback = null;
  presence = {};

  on(type, filter, callback) {
    this.handlers.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.subscribeCallback = callback;
    return this;
  }

  async send(envelope) {
    this.sent.push(structuredClone(envelope));
    return 'ok';
  }

  async track(payload) {
    this.tracked.push(structuredClone(payload));
    return 'ok';
  }

  presenceState() {
    return structuredClone(this.presence);
  }

  emitStatus(status, error) {
    this.subscribeCallback?.(status, error);
  }

  emit(type, event, payload) {
    for (const handler of this.handlers) {
      if (handler.type === type && handler.filter.event === event) handler.callback(payload);
    }
  }
}

class FakeRealtimeClient {
  channelCalls = [];
  channels = [];
  removed = [];
  authCalls = [];
  realtime = {
    setAuth: async (...args) => {
      this.authCalls.push(args);
    },
  };

  channel(topic, options) {
    const channel = new FakeChannel();
    this.channelCalls.push({ topic, options: structuredClone(options) });
    this.channels.push(channel);
    return channel;
  }

  async removeChannel(channel) {
    this.removed.push(channel);
    return 'ok';
  }
}

class ReactTestNode {
  constructor(nodeType, nodeName, ownerDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, before) {
    node.parentNode = this;
    const index = this.childNodes.indexOf(before);
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  contains(node) {
    return node === this || this.childNodes.some((child) => child.contains?.(node));
  }
}

class ReactTestElement extends ReactTestNode {
  constructor(tagName, ownerDocument) {
    super(1, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.attributes = new Map();
    this.namespaceURI = 'http://www.w3.org/1999/xhtml';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent ?? '').join('');
  }

  set textContent(value) {
    this.childNodes = [new ReactTestText(String(value), this.ownerDocument)];
  }
}

class ReactTestText extends ReactTestNode {
  constructor(value, ownerDocument) {
    super(3, '#text', ownerDocument);
    this.nodeValue = value;
  }

  get textContent() {
    return this.nodeValue;
  }
}

class ReactTestDocument extends ReactTestNode {
  constructor() {
    super(9, '#document', null);
    this.defaultView = null;
    this.activeElement = null;
    this.documentElement = new ReactTestElement('html', this);
    this.body = new ReactTestElement('body', this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName) {
    return new ReactTestElement(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new ReactTestElement(tagName, this);
  }

  createTextNode(value) {
    return new ReactTestText(value, this);
  }
}

function createTransport(overrides = {}) {
  return {
    getConversationPage: async () => page(),
    sendMessage: async (input) => message({
      id: IDS.secondMessage,
      senderId: IDS.currentUser,
      senderRole: 'customer',
      clientMessageId: input.clientMessageId,
      body: input.body,
      createdAt: '2026-08-24T10:01:00.000Z',
    }),
    markConversationRead: async ({ conversationId, messageId }) => ({
      conversationId,
      lastReadMessageId: messageId,
    }),
    setReaction: async ({ messageId }) => message({
      id: messageId,
      revision: 2,
      reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
    }),
    ...overrides,
  };
}

function createHarness({ transport = createTransport(), initialPage = page(), currentUserPresence } = {}) {
  const realtimeClient = new FakeRealtimeClient();
  const browser = new FakeBrowserTarget();
  const clock = new ManualClock();
  const controller = createMarketplaceChatController(
    {
      conversationId: IDS.conversation,
      initialPage,
      currentUserId: IDS.currentUser,
      currentUserPresence,
    },
    {
      realtimeClient,
      transport,
      browser,
      document: browser,
      isOnline: () => browser.online,
      randomUUID: () => IDS.clientMessage,
      now: () => clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
  );
  return { browser, clock, controller, realtimeClient, transport };
}

test('joins only the exact private conversation topic and keeps identity only in the Presence key', async () => {
  const { controller, realtimeClient } = createHarness({
    currentUserPresence: { role: 'customer', displayName: 'العميل' },
  });
  await controller.start();
  await flush();

  assert.deepEqual(realtimeClient.channelCalls, [{
    topic: `marketplace-chat:${IDS.conversation}`,
    options: {
      config: {
        private: true,
        broadcast: { ack: true, self: false },
        presence: { key: IDS.currentUser },
      },
    },
  }]);
  assert.deepEqual(realtimeClient.authCalls, [[]], 'setAuth must use the browser client callback, not a copied token');

  const channel = realtimeClient.channels[0];
  channel.emitStatus('SUBSCRIBED');
  await flush();
  assert.equal(channel.tracked.length, 1);
  assert.deepEqual(Object.keys(channel.tracked[0]).sort(), ['displayName', 'presenceId', 'role']);
  assert.equal(JSON.stringify(channel.tracked[0]).includes(IDS.currentUser), false);
  controller.stop();
});

test('serializes subscribed, focus, online, gap, and out-of-order catch-ups without missing a queued transition', async () => {
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const calls = [];
  const transport = createTransport({
    getConversationPage(input) {
      calls.push(input);
      return [first.promise, second.promise, third.promise][calls.length - 1] ?? Promise.resolve(page());
    },
  });
  const { browser, controller, realtimeClient } = createHarness({ transport });
  await controller.start();
  const channel = realtimeClient.channels[0];

  channel.emitStatus('SUBSCRIBED');
  browser.emit('focus');
  browser.online = false;
  browser.emit('offline');
  browser.online = true;
  browser.emit('online');
  channel.emit('broadcast', 'message_changed', {
    payload: {
      action: 'message_changed',
      messageId: IDS.secondMessage,
      cursor: { createdAt: '2026-08-24T10:02:00.000Z', id: IDS.secondMessage },
      revision: 3,
    },
  });
  assert.equal(calls.length, 1, 'catch-up advancement must have one in-flight request');
  assert.equal(controller.getSnapshot().connectionState, 'recovering');

  first.resolve(page({ messages: [message()] }));
  await flush();
  assert.equal(calls.length, 2, 'events during the first request coalesce into one queued pass');
  second.resolve(page({ messages: [message({ id: IDS.secondMessage, revision: 3, createdAt: '2026-08-24T10:02:00.000Z' })] }));
  await flush();
  assert.equal(controller.getSnapshot().messages.at(-1).id, IDS.secondMessage);
  assert.equal(controller.getSnapshot().connectionState, 'online');

  channel.emit('broadcast', 'message_changed', {
    payload: {
      action: 'message_changed',
      messageId: IDS.firstMessage,
      cursor: { createdAt: '2026-08-24T09:59:00.000Z', id: IDS.firstMessage },
      revision: 4,
    },
  });
  await flush();
  assert.equal(calls.length, 3, 'an older cursor with a newer revision still catches up');
  third.resolve(page({ messages: [message({ revision: 4, body: 'نسخة محدثة' })] }));
  await flush();
  assert.equal(controller.getSnapshot().messages.find((item) => item.id === IDS.firstMessage).revision, 4);
  controller.stop();
});

test('catch-up refreshes retained confirmed messages in the older half of the 100-message window', async () => {
  const retained = Array.from({ length: 100 }, (_, index) => message({
    id: crypto.randomUUID(),
    createdAt: `2026-08-24T${String(8 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
    body: `رسالة ${index}`,
  }));
  const target = retained[20];
  let calls = 0;
  const transport = createTransport({
    getConversationPage(input) {
      calls += 1;
      if (calls === 1) return Promise.resolve(page({ messages: [] }));
      return Promise.resolve(page({ messages: input.limit === 100
        ? [message({
          ...target,
          revision: 2,
          deleted: true,
          body: null,
          card: null,
          attachment: null,
          reactions: [],
        })]
        : [] }));
    },
  });
  const { controller, realtimeClient } = createHarness({
    transport,
    initialPage: page({ messages: retained }),
  });
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.emitStatus('SUBSCRIBED');
  await flush();
  channel.emit('broadcast', 'message_changed', {
    payload: {
      action: 'message_changed',
      messageId: target.id,
      cursor: { createdAt: target.createdAt, id: target.id },
      revision: 2,
    },
  });
  await flush();

  const refreshed = controller.getSnapshot().messages.find((item) => item.id === target.id);
  assert.equal(calls, 2);
  assert.equal(refreshed.revision, 2);
  assert.equal(refreshed.deleted, true);
  assert.equal(refreshed.body, null);
  controller.stop();
});

test('cleanup removes listeners and channel, aborts stale work, clears timers, and ignores late completion', async () => {
  const request = deferred();
  let signal;
  const transport = createTransport({
    getConversationPage(input) {
      signal = input.signal;
      return request.promise;
    },
  });
  const { browser, clock, controller, realtimeClient } = createHarness({ transport });
  const snapshots = [];
  controller.subscribe(() => snapshots.push(controller.getSnapshot()));
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.emitStatus('SUBSCRIBED');
  controller.notifyTyping(true);
  assert.ok(clock.size > 0);

  controller.stop();
  assert.equal(signal.aborted, true);
  assert.deepEqual(realtimeClient.removed, [channel]);
  assert.equal(clock.size, 0);
  const countAtCleanup = snapshots.length;

  request.resolve(page({ messages: [message({ id: IDS.secondMessage })] }));
  browser.emit('focus');
  browser.emit('online');
  await flush();
  assert.equal(snapshots.length, countAtCleanup, 'late requests and detached browser listeners must not update state');
});

test('a failed catch-up keeps a safe error state instead of being overwritten as online', async () => {
  const transport = createTransport({
    getConversationPage: async () => {
      throw { code: 'rate_limited', privateDetail: 'do not expose' };
    },
  });
  const { controller, realtimeClient } = createHarness({ transport });
  await controller.start();
  realtimeClient.channels[0].emitStatus('SUBSCRIBED');
  await flush();

  assert.equal(controller.getSnapshot().connectionState, 'error');
  assert.equal(controller.getSnapshot().connectionError, 'rate_limited');
  assert.equal(JSON.stringify(controller.getSnapshot()).includes('privateDetail'), false);
  controller.stop();
});

test('a stale concurrent catch-up cannot regress a newer acknowledged read cursor', async () => {
  const request = deferred();
  const transport = createTransport({
    getConversationPage: () => request.promise,
  });
  const initialPage = page({
    messages: [
      message(),
      message({ id: IDS.secondMessage, createdAt: '2026-08-24T10:01:00.000Z' }),
    ],
  });
  const { controller, realtimeClient } = createHarness({ transport, initialPage });
  await controller.start();
  realtimeClient.channels[0].emitStatus('SUBSCRIBED');
  await controller.markRead(IDS.secondMessage);
  assert.equal(controller.getSnapshot().lastReadMessageId, IDS.secondMessage);

  request.resolve(page({
    messages: initialPage.messages,
    lastReadMessageId: IDS.firstMessage,
  }));
  await flush();
  assert.equal(controller.getSnapshot().lastReadMessageId, IDS.secondMessage);
  controller.stop();
});

test('new focus and gap triggers abort a hung catch-up and apply only the latest result', async () => {
  const first = deferred();
  const latest = deferred();
  let calls = 0;
  let firstSignal;
  const transport = createTransport({
    getConversationPage(input) {
      calls += 1;
      if (calls === 1) {
        firstSignal = input.signal;
        return first.promise;
      }
      return latest.promise;
    },
  });
  const { browser, controller, realtimeClient } = createHarness({ transport });
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.emitStatus('SUBSCRIBED');
  assert.equal(calls, 1);

  browser.emit('focus');
  channel.emit('broadcast', 'message_changed', {
    payload: {
      action: 'message_changed',
      messageId: IDS.secondMessage,
      cursor: { createdAt: '2026-08-24T10:02:00.000Z', id: IDS.secondMessage },
      revision: 2,
    },
  });
  await flush();
  assert.equal(firstSignal.aborted, true);
  assert.equal(calls, 2);

  latest.resolve(page({ messages: [message({
    id: IDS.secondMessage,
    createdAt: '2026-08-24T10:02:00.000Z',
    revision: 2,
  })] }));
  await flush();
  assert.equal(controller.getSnapshot().messages.at(-1).id, IDS.secondMessage);
  assert.equal(controller.getSnapshot().connectionState, 'online');
  controller.stop();
});

test('sanitizes Presence state and expires remote typing exactly after four seconds', async () => {
  const { clock, controller, realtimeClient } = createHarness();
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.presence = {
    [IDS.currentUser]: [{ presenceId: 'self', role: 'admin', displayName: 'نفسي' }],
    remote: [{
      presenceId: IDS.presence,
      role: 'merchant',
      displayName: ' متجر موثوق ',
      email: 'private@example.test',
      phone: '01000000000',
      userId: IDS.otherUser,
    }],
    malformed: [{ presenceId: 'not-a-uuid', role: 'owner', displayName: 'x' }],
  };
  channel.emit('presence', 'sync', {});
  channel.emit('broadcast', 'typing', {
    payload: { action: 'typing', presenceId: IDS.presence, active: true },
  });

  assert.deepEqual(controller.getSnapshot().typingUsers, [{
    presenceId: IDS.presence,
    role: 'merchant',
    displayName: 'متجر موثوق',
  }]);
  clock.advance(3_999);
  assert.equal(controller.getSnapshot().typingUsers.length, 1);
  clock.advance(1);
  assert.deepEqual(controller.getSnapshot().typingUsers, []);
  controller.stop();
});

test('ignores Presence provider failures without escaping private details', async () => {
  const { controller, realtimeClient } = createHarness();
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.presenceState = () => {
    throw new Error('private presence provider detail');
  };

  assert.doesNotThrow(() => channel.emit('presence', 'sync', {}));
  assert.deepEqual(controller.getSnapshot().typingUsers, []);
  assert.equal(JSON.stringify(controller.getSnapshot()).includes('private presence provider detail'), false);
  controller.stop();
});

test('throttles typing hints and never broadcasts bodies, cards, attachments, identity, or participant metadata', async () => {
  const { clock, controller, realtimeClient } = createHarness({
    currentUserPresence: { role: 'customer', displayName: 'العميل' },
  });
  await controller.start();
  const channel = realtimeClient.channels[0];
  channel.emitStatus('SUBSCRIBED');
  await flush();

  controller.notifyTyping(true);
  controller.notifyTyping(true);
  clock.advance(1_999);
  controller.notifyTyping(true);
  assert.equal(channel.sent.filter((item) => item.event === 'typing').length, 1);
  clock.advance(1);
  controller.notifyTyping(true);
  assert.equal(channel.sent.filter((item) => item.event === 'typing').length, 2);

  await controller.send({
    senderRole: 'customer',
    kind: 'text',
    body: 'هذه رسالة خاصة',
    replyToId: null,
    card: null,
  });
  await controller.react({ messageId: IDS.firstMessage, emoji: '👍', active: true });
  await controller.markRead(IDS.secondMessage);

  const serialized = JSON.stringify(channel.sent);
  for (const forbidden of [
    'هذه رسالة خاصة', 'body', 'card', 'attachment', IDS.currentUser,
    'displayName', 'senderRole', 'storeId', 'orderId', 'token',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `broadcast leaked ${forbidden}`);
  }
  for (const item of channel.sent) {
    assert.deepEqual(Object.keys(item).sort(), ['event', 'payload', 'type']);
    assert.equal(item.type, 'broadcast');
    assert.ok(['typing', 'message_changed', 'read_changed'].includes(item.event));
  }
  controller.stop();
});

test('optimistically sends with the exact generated client id and retry preserves it after a safe failure', async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const transport = createTransport({
    sendMessage(input) {
      calls.push(structuredClone(input));
      return calls.length === 1 ? first.promise : second.promise;
    },
  });
  const { controller } = createHarness({ transport });
  await controller.start();

  const sendPromise = controller.send({
    senderRole: 'customer',
    kind: 'text',
    body: 'أعد المحاولة',
    replyToId: null,
    card: null,
  });
  assert.equal(calls[0].clientMessageId, IDS.clientMessage);
  assert.equal(controller.getSnapshot().messages.at(-1).id, `optimistic:${IDS.clientMessage}`);
  assert.equal(controller.getSnapshot().messages.at(-1).status, 'sending');

  first.reject(new Error('secret provider failure'));
  await sendPromise;
  assert.equal(controller.getSnapshot().messages.at(-1).status, 'failed');
  assert.equal(controller.getSnapshot().messages.at(-1).failureCode, 'service_unavailable');
  assert.equal(JSON.stringify(controller.getSnapshot()).includes('secret provider failure'), false);

  const retryPromise = controller.retry(IDS.clientMessage);
  assert.equal(calls[1].clientMessageId, IDS.clientMessage);
  second.resolve(message({
    id: IDS.secondMessage,
    clientMessageId: IDS.clientMessage,
    senderId: IDS.currentUser,
    senderRole: 'customer',
    body: 'أعد المحاولة',
  }));
  await retryPromise;
  const retried = controller.getSnapshot().messages.filter((item) => item.clientMessageId === IDS.clientMessage);
  assert.equal(retried.length, 1);
  assert.equal(retried[0].id, IDS.secondMessage);
  assert.equal(retried[0].status, 'sent');
  controller.stop();
});

test('coalesces concurrent older loads and reconciles concurrent read and reaction results by authoritative revision', async () => {
  const older = deferred();
  let olderCalls = 0;
  const transport = createTransport({
    getConversationPage(input) {
      if (input.cursor) {
        olderCalls += 1;
        return older.promise;
      }
      return Promise.resolve(page());
    },
  });
  const initialPage = page({
    nextCursor: { createdAt: '2026-08-24T09:00:00.000Z', id: IDS.olderMessage },
  });
  const { controller } = createHarness({ transport, initialPage });
  await controller.start();

  const firstLoad = controller.loadOlder();
  const secondLoad = controller.loadOlder();
  assert.equal(firstLoad, secondLoad);
  assert.equal(olderCalls, 1);

  const read = controller.markRead(IDS.firstMessage);
  const reaction = controller.react({ messageId: IDS.firstMessage, emoji: '👍', active: true });
  older.resolve(page({
    messages: [message({
      id: IDS.olderMessage,
      createdAt: '2026-08-24T08:00:00.000Z',
    })],
    nextCursor: null,
  }));
  await Promise.all([firstLoad, read, reaction]);
  assert.equal(controller.getSnapshot().messages[0].id, IDS.olderMessage);
  assert.equal(controller.getSnapshot().messages.find((item) => item.id === IDS.firstMessage).revision, 2);
  assert.equal(controller.getSnapshot().lastReadMessageId, IDS.firstMessage);
  assert.equal(controller.getSnapshot().isLoadingOlder, false);
  controller.stop();
});

test('start is idempotent and strict-style mount cleanup never leaves duplicate subscriptions', async () => {
  const realtimeClient = new FakeRealtimeClient();
  const browser = new FakeBrowserTarget();
  const dependencies = {
    realtimeClient,
    transport: createTransport(),
    browser,
    document: browser,
    isOnline: () => true,
    randomUUID: () => IDS.clientMessage,
  };
  const options = {
    conversationId: IDS.conversation,
    initialPage: page(),
    currentUserId: IDS.currentUser,
  };

  const first = createMarketplaceChatController(options, dependencies);
  await first.start();
  await first.start();
  assert.equal(realtimeClient.channelCalls.length, 1);
  first.stop();
  const second = createMarketplaceChatController(options, dependencies);
  await second.start();
  assert.equal(realtimeClient.channelCalls.length, 2);
  assert.equal(realtimeClient.removed.length, 1);
  second.stop();
  assert.equal(realtimeClient.removed.length, 2);
});

test('client transport calls only participant-scoped allowlisted RPCs, applies AbortSignal, and parses authoritative DTOs', async () => {
  const calls = [];
  const fakeSupabase = {
    rpc(name, args) {
      const call = { name, args, signal: null };
      calls.push(call);
      const result = {
        abortSignal(signal) {
          call.signal = signal;
          return Promise.resolve({
            data: name === 'get_my_marketplace_conversation_page'
              ? page()
              : name === 'set_my_marketplace_chat_read_cursor'
                ? { conversationId: IDS.conversation, lastReadMessageId: IDS.firstMessage }
                : message({ id: args.p_message_id ?? IDS.secondMessage }),
            error: null,
          });
        },
      };
      return result;
    },
  };
  const transport = createMarketplaceChatTransport(fakeSupabase);
  const abortController = new AbortController();

  await transport.getConversationPage({ conversationId: IDS.conversation, limit: 50, cursor: null, signal: abortController.signal });
  await transport.sendMessage({
    conversationId: IDS.conversation,
    clientMessageId: IDS.clientMessage,
    kind: 'text',
    body: 'خاص',
    replyToId: null,
    card: null,
  }, abortController.signal);
  await transport.markConversationRead({ conversationId: IDS.conversation, messageId: IDS.firstMessage }, abortController.signal);
  await transport.setReaction({ messageId: IDS.firstMessage, emoji: '👍', active: true }, abortController.signal);

  assert.deepEqual(calls.map((call) => call.name), [
    'get_my_marketplace_conversation_page',
    'send_my_marketplace_chat_message',
    'set_my_marketplace_chat_read_cursor',
    'react_to_my_marketplace_chat_message',
  ]);
  assert.ok(calls.every((call) => call.signal === abortController.signal));
  assert.deepEqual(calls[0].args, {
    p_thread_id: IDS.conversation,
    p_limit: 50,
    p_before_created_at: null,
    p_before_id: null,
  });
  assert.equal('senderId' in calls[1].args, false);
  assert.equal('senderRole' in calls[1].args, false);
});

test('React rerender hides the previous conversation before async client initialization', async () => {
  const documentTarget = new ReactTestDocument();
  const windowTarget = {
    document: documentTarget,
    HTMLIFrameElement: ReactTestElement,
    HTMLElement: ReactTestElement,
    addEventListener() {},
    removeEventListener() {},
  };
  documentTarget.defaultView = windowTarget;
  const container = new ReactTestElement('div', documentTarget);
  const firstPage = page();
  const secondConversationId = crypto.randomUUID();
  const secondMessageId = crypto.randomUUID();
  const secondPage = page({
    conversation: { ...summary(), id: secondConversationId },
    messages: [message({ id: secondMessageId, conversationId: secondConversationId })],
  });
  const committed = [];
  function Probe({ conversationId, initialPage }) {
    const state = useMarketplaceChat({
      conversationId,
      initialPage,
      currentUserId: IDS.currentUser,
    });
    useLayoutEffect(() => {
      committed.push({ conversationId, firstMessageId: state.messages[0]?.id ?? null });
    }, [conversationId, state.messages]);
    return createElement('output', null, state.messages[0]?.id ?? 'empty');
  }

  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;
  const root = createRoot(container);
  try {
    flushSync(() => root.render(createElement(Probe, {
      conversationId: IDS.conversation,
      initialPage: firstPage,
    })));
    assert.equal(container.textContent, IDS.firstMessage);

    flushSync(() => root.render(createElement(Probe, {
      conversationId: secondConversationId,
      initialPage: secondPage,
    })));
    assert.equal(container.textContent, secondMessageId);
    assert.deepEqual(committed.slice(-1)[0], {
      conversationId: secondConversationId,
      firstMessageId: secondMessageId,
    });
  } finally {
    root.unmount();
    await flush();
    // React's event-system cleanup can run on a later task; let that task
    // observe the test DOM before restoring Node's globals.
    await new Promise((resolve) => setImmediate(resolve));
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  }
});

test('the client hook has no server-only action or service import', async () => {
  const source = await readFile(new URL('../../hooks/useMarketplaceChat.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /commerce\/chat\/(?:actions|service)/u);
  assert.doesNotMatch(source, /server-only/u);
});
