import assert from 'node:assert/strict';
import test from 'node:test';

import {
  markOptimisticFailed,
  reconcileChatPage,
  replaceOptimisticMessage,
  shouldCatchUp,
} from '../../lib/commerce/chat/reconcile.ts';

const conversationId = '00000000-0000-4000-8000-000000000001';

function message(overrides = {}) {
  return {
    id: 'server-1',
    clientMessageId: null,
    conversationId,
    senderId: 'sender-1',
    senderRole: 'customer',
    kind: 'text',
    body: 'hello',
    replyToId: null,
    card: null,
    attachment: null,
    reactions: [],
    deleted: false,
    revision: 1,
    createdAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

function optimistic(overrides = {}) {
  return message({
    id: 'optimistic:client-1',
    clientMessageId: 'client-1',
    status: 'sending',
    failureCode: null,
    ...overrides,
  });
}

test('replaces an optimistic message with its confirmation by clientMessageId', () => {
  const result = reconcileChatPage(
    [optimistic({ createdAt: '2026-08-24T10:01:00.000Z' })],
    [message({ id: 'server-1', clientMessageId: 'client-1', createdAt: '2026-08-24T10:00:00.000Z' })],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'server-1');
  assert.equal(result[0].status, 'sent');
  assert.equal(result[0].failureCode, null);
});

test('is idempotent for duplicate and out-of-order broadcasts', () => {
  const current = [message({ id: 'a', createdAt: '2026-08-24T10:00:00.000Z' })];
  const incoming = [message({ id: 'b', createdAt: '2026-08-24T10:02:00.000Z' })];
  const once = reconcileChatPage(current, incoming);
  const twice = reconcileChatPage(once, [...incoming, ...incoming]);

  assert.deepEqual(twice, [
    message({ id: 'a', createdAt: '2026-08-24T10:00:00.000Z' }),
    message({ id: 'b', createdAt: '2026-08-24T10:02:00.000Z' }),
  ].map((item) => ({ ...item, status: 'sent', failureCode: null })));
  assert.deepEqual(reconcileChatPage([], [incoming[0], current[0]]), twice);
});

test('retry confirmation collapses a failed optimistic identity and clears failure state', () => {
  const failed = markOptimisticFailed([optimistic()], 'client-1');
  assert.equal(failed[0].status, 'failed');
  assert.equal(failed[0].failureCode, 'service_unavailable');

  const confirmed = replaceOptimisticMessage(
    failed,
    message({ id: 'server-retry', clientMessageId: 'client-1' }),
  );
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].id, 'server-retry');
  assert.equal(confirmed[0].status, 'sent');
  assert.equal(confirmed[0].failureCode, null);
});

test('keeps a pending optimistic message when confirmation has no usable identity', () => {
  const pending = optimistic();
  const result = reconcileChatPage([pending], [message({ id: '', clientMessageId: null })]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, pending.id);
  assert.equal(result[0].status, 'sending');
  assert.equal(result[0].clientMessageId, pending.clientMessageId);
});

test('does not replace a pending message when a shared client ID belongs to another sender', () => {
  const pending = optimistic({ senderId: 'sender-1' });
  const confirmed = message({ id: 'server-other', clientMessageId: 'client-1', senderId: 'sender-2' });
  const result = reconcileChatPage([pending], [confirmed]);
  assert.deepEqual(result.map((item) => item.id), ['optimistic:client-1', 'server-other']);
});

test('deduplicates confirmed messages only by server ID, retaining null and shared client IDs', () => {
  const messages = [
    message({ id: 'server-a', clientMessageId: null }),
    message({ id: 'server-b', clientMessageId: null }),
    message({ id: 'server-c', clientMessageId: 'shared' }),
    message({ id: 'server-d', clientMessageId: 'shared' }),
  ];
  assert.deepEqual(reconcileChatPage([], messages).map((item) => item.id), ['server-a', 'server-b', 'server-c', 'server-d']);
});

test('newer revisions win regardless of snapshot arrival order and reapplication', () => {
  const older = message({ id: 'server-revision', reactions: [{ emoji: '👍', count: 1, reactedByMe: false }], revision: 1 });
  const newer = message({ id: 'server-revision', reactions: [{ emoji: '❤️', count: 2, reactedByMe: true }], revision: 2 });
  const forward = reconcileChatPage([], [older, newer]);
  const reverse = reconcileChatPage([], [newer, older]);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(reconcileChatPage(forward, [older]), forward);
  assert.deepEqual(forward[0].reactions, newer.reactions);
});

test('rejects malformed nested message values without throwing', () => {
  const valid = message({ id: 'valid' });
  const invalid = [
    message({ id: 'bad-reaction', reactions: [{ emoji: '👍', count: -1, reactedByMe: false }] }),
    message({ id: 'bad-card', card: { type: 'product', id: 'p', label: 3 } }),
    message({ id: 'bad-attachment', attachment: { id: 'a', url: 'u', width: -1, height: 2, alt: 'x' } }),
    message({ id: 'bad-required', senderId: undefined }),
  ];
  assert.deepEqual(reconcileChatPage([], [valid, ...invalid]).map((item) => item.id), ['valid']);
});

test('prepends an older page while retaining chronological order', () => {
  const current = [message({ id: 'new', createdAt: '2026-08-24T10:02:00.000Z' })];
  const older = [message({ id: 'old', createdAt: '2026-08-24T09:58:00.000Z' })];
  assert.deepEqual(reconcileChatPage(current, older).map((item) => item.id), ['old', 'new']);
});

test('retains tombstones and replaces reactions from authoritative messages', () => {
  const current = [message({ id: 'm1', body: 'secret', reactions: [{ emoji: '👍', count: 1, reactedByMe: false }] })];
  const incoming = [message({ id: 'm1', body: null, deleted: true, reactions: [{ emoji: '❤️', count: 2, reactedByMe: true }] })];
  const result = reconcileChatPage(current, incoming);

  assert.equal(result.length, 1);
  assert.equal(result[0].deleted, true);
  assert.equal(result[0].body, null);
  assert.deepEqual(result[0].reactions, incoming[0].reactions);
});

test('uses createdAt then id for stable confirmed ordering and optimistic tie-breaks', () => {
  const sameTime = '2026-08-24T10:00:00.000Z';
  const result = reconcileChatPage(
    [optimistic({ id: 'optimistic:z', clientMessageId: 'z', createdAt: sameTime }), optimistic({ id: 'optimistic:a', clientMessageId: 'a', createdAt: sameTime })],
    [message({ id: 'z-server', clientMessageId: 'z', createdAt: sameTime }), message({ id: 'a-server', clientMessageId: 'a', createdAt: sameTime }), message({ id: 'b-server', createdAt: sameTime })],
  );

  assert.deepEqual(result.map((item) => item.id), ['a-server', 'b-server', 'z-server']);
});

test('trims to 100 confirmed messages without evicting sending or failed pending messages', () => {
  const confirmed = Array.from({ length: 105 }, (_, index) => message({
    id: `server-${index}`,
    createdAt: `2026-08-24T10:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  const pending = [
    optimistic({ id: 'optimistic:sending', clientMessageId: 'sending', status: 'sending' }),
    optimistic({ id: 'optimistic:failed', clientMessageId: 'failed', status: 'failed', failureCode: 'rate_limited' }),
  ];
  const result = reconcileChatPage(pending, confirmed);

  assert.equal(result.length, 102);
  assert.deepEqual(result.filter((item) => item.status !== 'sent').map((item) => item.id), [
    'optimistic:failed',
    'optimistic:sending',
  ]);
  assert.deepEqual(result.filter((item) => item.status === 'sent').map((item) => item.id).slice(0, 2), ['server-5', 'server-6']);
});

test('never mutates message arrays or nested values', () => {
  const reactions = [{ emoji: '👍', count: 1, reactedByMe: false }];
  const current = [message({ reactions })];
  const incoming = [message({ id: 'new', reactions: [{ emoji: '❤️', count: 1, reactedByMe: true }] })];
  const before = structuredClone({ current, incoming });
  reconcileChatPage(current, incoming);
  assert.deepEqual({ current, incoming }, before);
  assert.notEqual(reconcileChatPage(current, incoming)[0].reactions, current[0].reactions);
});

test('detects cursor gaps deterministically', () => {
  assert.equal(shouldCatchUp(null, { createdAt: '2026-08-24T10:00:00.000Z', id: 'a' }), true);
  assert.equal(shouldCatchUp({ createdAt: '2026-08-24T10:00:00.000Z', id: 'a' }, { createdAt: '2026-08-24T10:00:00.000Z', id: 'a' }), false);
  assert.equal(shouldCatchUp({ createdAt: '2026-08-24T10:00:00.000Z', id: 'a' }, { createdAt: '2026-08-24T10:00:00.000Z', id: 'b' }), true);
  assert.equal(shouldCatchUp({ createdAt: '2026-08-24T10:01:00.000Z', id: 'z' }, { createdAt: '2026-08-24T10:00:00.000Z', id: 'a' }), false);
});

test('coalesces multiple optimistic messages with the same clientMessageId into one pending record', () => {
  const first = optimistic({ id: 'optimistic:client-1', clientMessageId: 'client-1', body: 'رسالة أولى' });
  const second = optimistic({ id: 'optimistic:client-1-dup', clientMessageId: 'client-1', body: 'رسالة مكررة' });
  const result = reconcileChatPage([first, second], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].clientMessageId, 'client-1');
  assert.equal(result[0].status, 'sending');
});

test('retry maintains clientMessageId, updates status to sending, and preserves drafted content', () => {
  const original = optimistic({
    id: 'optimistic:client-1',
    clientMessageId: 'client-1',
    body: 'محتوى الرسالة المراد إعادتها',
  });
  const failed = markOptimisticFailed([original], 'client-1');
  assert.equal(failed[0].status, 'failed');
  assert.equal(failed[0].body, 'محتوى الرسالة المراد إعادتها');
  assert.equal(failed[0].failureCode, 'service_unavailable');

  const retrying = optimistic({
    id: 'optimistic:client-1-retry',
    clientMessageId: 'client-1',
    body: 'محتوى الرسالة المراد إعادتها',
    status: 'sending',
  });
  // Local retry update in state:
  const inFlight = reconcileChatPage([retrying], []);
  assert.equal(inFlight.length, 1);
  assert.equal(inFlight[0].clientMessageId, 'client-1');
  assert.equal(inFlight[0].status, 'sending');
  assert.equal(inFlight[0].failureCode, null);
  assert.equal(inFlight[0].body, 'محتوى الرسالة المراد إعادتها');

  // Confirmation from server replaces the pending retry:
  const confirmed = reconcileChatPage(inFlight, [message({ id: 'server-confirmed', clientMessageId: 'client-1' })]);
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].id, 'server-confirmed');
  assert.equal(confirmed[0].status, 'sent');
  assert.equal(confirmed[0].failureCode, null);
});

test('converges to exact chronological ordering when events arrive out-of-order and interleaved with pending', () => {
  const m1 = message({ id: 'm1', createdAt: '2026-08-24T10:00:00.000Z' });
  const m2 = message({ id: 'm2', createdAt: '2026-08-24T10:02:00.000Z' });
  const m3 = message({ id: 'm3', createdAt: '2026-08-24T10:04:00.000Z' });
  const pending = optimistic({ id: 'optimistic:p1', clientMessageId: 'p1', createdAt: '2026-08-24T10:05:00.000Z' });

  // Arrival order: m3, then pending, then m1, then m2
  let state = reconcileChatPage([], [m3]);
  state = reconcileChatPage(state, [pending]);
  state = reconcileChatPage(state, [m1, m2]);

  assert.deepEqual(state.map((item) => item.id), ['m1', 'm2', 'm3', 'optimistic:p1']);
});

test('strips private body, card, and attachment from deleted messages upon arrival', () => {
  const malformedDeleted = message({
    id: 'del-1',
    deleted: true,
    body: 'محتوى حساس لا يجب ظهوره',
    card: { type: 'product', id: 'some-product-id' },
    attachment: { id: 'att-1', url: 'https://storage.example/private.jpg' },
  });
  const result = reconcileChatPage([], [malformedDeleted]);
  assert.equal(result.length, 1);
  assert.equal(result[0].deleted, true);
  assert.equal(result[0].body, null);
  assert.equal(result[0].card, null);
  assert.equal(result[0].attachment, null);
});

test('preserves complex Arabic text, diacritics, numbers, and URLs without mangling', () => {
  const arabicText = 'مَرْحَبًا! رَقْمُ الطَّلَبِ هُوَ #987654 وَالسِّعْرُ 1,250.50 ج.م على https://dairtak.com/orders/987654?lang=ar';
  const richMessage = message({ id: 'ar-1', body: arabicText });
  const result = reconcileChatPage([], [richMessage]);
  assert.equal(result.length, 1);
  assert.equal(result[0].body, arabicText);
});

test('shouldCatchUp accurately detects gaps with identical timestamps, older cursors, or missing cursors', () => {
  const t1 = '2026-08-24T10:00:00.000Z';
  const t2 = '2026-08-24T10:05:00.000Z';
  // Missing cursors
  assert.equal(shouldCatchUp(null, null), false);
  assert.equal(shouldCatchUp({ createdAt: t1, id: 'a' }, null), false);
  assert.equal(shouldCatchUp(null, { createdAt: t1, id: 'a' }), true);
  // Newer event timestamp -> gap
  assert.equal(shouldCatchUp({ createdAt: t1, id: 'a' }, { createdAt: t2, id: 'a' }), true);
  // Older event timestamp -> no gap
  assert.equal(shouldCatchUp({ createdAt: t2, id: 'a' }, { createdAt: t1, id: 'a' }), false);
  // Same timestamp, newer event id -> gap
  assert.equal(shouldCatchUp({ createdAt: t1, id: 'a' }, { createdAt: t1, id: 'b' }), true);
  // Same timestamp, older event id -> no gap
  assert.equal(shouldCatchUp({ createdAt: t1, id: 'b' }, { createdAt: t1, id: 'a' }), false);
  // Exact same cursor -> no gap
  assert.equal(shouldCatchUp({ createdAt: t1, id: 'a' }, { createdAt: t1, id: 'a' }), false);
});

test('ignores malformed, null, or non-object items gracefully without crashing', () => {
  const valid = message({ id: 'valid-1' });
  const malformedList = [
    null,
    undefined,
    'not a message',
    12345,
    {},
    { id: 'incomplete' },
    { id: 'bad-role', conversationId: 'c1', createdAt: '2026-08-24T10:00:00.000Z', senderRole: 'hacker', kind: 'text', reactions: [], deleted: false, clientMessageId: null },
    valid,
  ];
  const result = reconcileChatPage([], malformedList);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'valid-1');
});

test('reconciles a large functional window idempotently without evicting pending messages', () => {
  const current = Array.from({ length: 250 }, (_, i) => optimistic({
    id: `opt-${i}`,
    clientMessageId: `client-${i}`,
    createdAt: `2026-08-24T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
  }));
  const incoming = Array.from({ length: 250 }, (_, i) => message({
    id: `server-${i}`,
    clientMessageId: `client-${i}`,
    createdAt: `2026-08-24T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
  }));

  const result = reconcileChatPage(current, incoming);
  const reapplied = reconcileChatPage(result, incoming.toReversed());

  assert.equal(result.length, 100); // Caps confirmed window at 100
  assert.equal(result[0].status, 'sent');
  assert.deepEqual(reapplied, result);
});
