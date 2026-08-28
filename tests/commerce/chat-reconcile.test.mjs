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
