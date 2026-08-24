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
  const conversationId = crypto.randomUUID();
  const trimmed = parseChatSearchInput({ conversationId, query: '  سعر المنتج  ', limit: 30 });
  assert.equal(trimmed.success, true);
  assert.equal(trimmed.data.query, 'سعر المنتج');
  assert.equal(parseChatSearchInput({ conversationId, query: '', limit: 30 }).success, false);
  assert.equal(parseChatSearchInput({ conversationId, query: '   ', limit: 30 }).success, false);
  assert.equal(parseChatSearchInput({ query: 'سعر المنتج', limit: 30 }).success, false);
  assert.equal(parseChatSearchInput({ conversationId: 'not-a-uuid', query: 'سعر المنتج', limit: 30 }).success, false);
  assert.equal(parseChatSearchInput({ conversationId, query: 'x'.repeat(201), limit: 30 }).success, false);
  const form = new FormData();
  form.set('conversationId', crypto.randomUUID());
  form.set('clientMessageId', crypto.randomUUID());
  form.set('body', 'x'.repeat(5001));
  assert.equal(parseSendMessageForm(form).success, false);
});

test('message and search limits count Unicode code points', () => {
  const message = (body) => {
    const form = new FormData();
    form.set('conversationId', crypto.randomUUID());
    form.set('clientMessageId', crypto.randomUUID());
    form.set('body', body);
    return parseSendMessageForm(form).success;
  };
  assert.equal(message('😀'.repeat(5000)), true);
  assert.equal(message('😀'.repeat(5001)), false);
  assert.equal(parseChatSearchInput({ conversationId: crypto.randomUUID(), query: '😀'.repeat(200), limit: 30 }).success, true);
  assert.equal(parseChatSearchInput({ conversationId: crypto.randomUUID(), query: '😀'.repeat(201), limit: 30 }).success, false);
});

test('message cards are parsed and must match the message kind', () => {
  const form = (kind, body, card) => {
    const value = new FormData();
    value.set('conversationId', crypto.randomUUID());
    value.set('clientMessageId', crypto.randomUUID());
    value.set('kind', kind);
    if (body !== undefined && body !== null) value.set('body', body);
    if (card !== undefined) value.set('card', JSON.stringify(card));
    return parseSendMessageForm(value).success;
  };
  assert.equal(form('text', 'hello'), true);
  assert.equal(form('text', '   '), false);
  assert.equal(form('text', 'hello', { type: 'product', id: crypto.randomUUID() }), false);
  assert.equal(form('product', null, { type: 'product', id: crypto.randomUUID() }), true);
  assert.equal(form('store', null, { type: 'product', id: crypto.randomUUID() }), false);
  assert.equal(form('location', null, { type: 'location', latitude: 30, longitude: 31 }), true);
  assert.equal(form('location', null, { type: 'location', latitude: 91, longitude: 31 }), false);
  assert.equal(form('location', null, { type: 'product', id: crypto.randomUUID() }), false);
  assert.equal(form('product', null), false);
  assert.equal(form('image', null), true);
  assert.equal(form('image', 'unexpected body'), false);
  assert.equal(form('image', null, { type: 'product', id: crypto.randomUUID() }), false);
  assert.equal(form('product', 'unexpected body', { type: 'product', id: crypto.randomUUID() }), false);
  assert.equal(form('product', null, { type: 'product', id: crypto.randomUUID(), url: 'https://evil.example' }), false);
  assert.equal(form('location', null, { type: 'location', latitude: 30, longitude: 31, href: 'https://evil.example' }), false);
  assert.equal(form('system', 'client-authored system message'), false);
  assert.equal(form('product', null, '{bad json'), false);
});
