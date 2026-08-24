import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseChatSearchInput,
  parseConversationIntent,
  parseSendMessageForm,
} from '../../lib/commerce/chat/input.ts';

test('message input accepts one bounded payload and a UUID idempotency key', () => {
  const form = new FormData();
  form.set('conversationId', 'bf3d2637-adf4-45ac-8f11-c6576e84bf47');
  form.set('clientMessageId', '43f88cb0-b6fd-4c6a-96ca-61e04d85aff6');
  form.set('body', 'هل المنتج متاح؟');
  const parsed = parseSendMessageForm(form);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.kind, 'text');
});

test('intent permits presale store chat and order chat only', () => {
  assert.equal(parseConversationIntent({ kind: 'presale', storeId: crypto.randomUUID() }).success, true);
  assert.equal(parseConversationIntent({ kind: 'order', orderId: crypto.randomUUID() }).success, true);
  assert.equal(parseConversationIntent({ kind: 'direct', userId: crypto.randomUUID() }).success, false);
});

test('search and message bodies are bounded', () => {
  assert.equal(parseChatSearchInput({ query: 'سعر المنتج', limit: 30 }).success, true);
  assert.equal(parseChatSearchInput({ query: 'x'.repeat(201), limit: 30 }).success, false);
  const form = new FormData();
  form.set('conversationId', crypto.randomUUID());
  form.set('clientMessageId', crypto.randomUUID());
  form.set('body', 'x'.repeat(5001));
  assert.equal(parseSendMessageForm(form).success, false);
});
