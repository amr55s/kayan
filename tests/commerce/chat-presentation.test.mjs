import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatChatTimestamp,
  formatChatDayLabel,
  groupChatMessagesByDay,
  getChatMessageA11yLabel,
  getChatMessageDirection,
  shouldAnimateChatMessage,
} from '../../lib/commerce/chat/presentation.ts';

function createDummyMessage(overrides = {}) {
  return {
    id: 'msg-1',
    clientMessageId: null,
    conversationId: 'conv-1',
    senderId: 'user-1',
    senderRole: 'customer',
    kind: 'text',
    body: 'مرحبًا، هل المنتج متوفر؟',
    replyToId: null,
    card: null,
    attachment: null,
    reactions: [],
    deleted: false,
    createdAt: '2026-08-24T10:30:00.000Z',
    revision: 1,
    ...overrides,
  };
}

test('formatChatTimestamp: formats time accurately in Arabic and English, rejects invalid timestamps', () => {
  const ts = '2026-08-24T10:30:00.000Z';

  const arabicTime = formatChatTimestamp(ts, 'ar-EG');
  assert.ok(arabicTime.includes('١٠:٣٠') || arabicTime.includes('10:30'));
  assert.ok(arabicTime.includes('ص') || arabicTime.includes('AM'));

  const englishTime = formatChatTimestamp(ts, 'en-US');
  assert.equal(englishTime, '10:30 AM');

  // Rejects invalid inputs
  assert.throws(() => formatChatTimestamp(''), /Invalid chat timestamp/);
  assert.throws(() => formatChatTimestamp('invalid-date-string'), /Invalid chat timestamp/);
  assert.throws(() => formatChatTimestamp(null), /Invalid chat timestamp/);
  assert.throws(() => formatChatTimestamp(undefined), /Invalid chat timestamp/);
  assert.throws(() => formatChatTimestamp(123456789), /Invalid chat timestamp/);
});

test('formatChatDayLabel: formats day boundaries in Arabic and English, rejects invalid timestamps', () => {
  const ts = '2026-08-24T10:30:00.000Z';

  const arabicDay = formatChatDayLabel(ts, 'ar-EG');
  assert.ok(arabicDay.includes('الاثنين') || arabicDay.includes('٢٤') || arabicDay.includes('أغسطس'));

  const englishDay = formatChatDayLabel(ts, 'en-US');
  assert.equal(englishDay, 'Monday, August 24, 2026');

  // Rejects invalid inputs
  assert.throws(() => formatChatDayLabel(''), /Invalid chat timestamp/);
  assert.throws(() => formatChatDayLabel('not-a-date'), /Invalid chat timestamp/);
});

test('groupChatMessagesByDay: groups messages chronologically, tie-breaks equal timestamps by ID, and does NOT mutate original array', () => {
  const msgDay1A = createDummyMessage({ id: 'msg-1', createdAt: '2026-08-24T10:00:00.000Z', body: 'رسالة 1' });
  const msgDay1B = createDummyMessage({ id: 'msg-2', createdAt: '2026-08-24T12:00:00.000Z', body: 'رسالة 2' });
  // Identical timestamp with msgDay1B to test ID tie-breaking
  const msgDay1C = createDummyMessage({ id: 'msg-0-tie', createdAt: '2026-08-24T12:00:00.000Z', body: 'رسالة 0 مكررة' });
  const msgDay2 = createDummyMessage({ id: 'msg-3', createdAt: '2026-08-25T09:00:00.000Z', body: 'رسالة اليوم التالي' });

  // Pass out of order to verify deterministic sorting
  const originalList = Object.freeze([msgDay2, msgDay1B, msgDay1C, msgDay1A]);
  const originalCopy = [...originalList];

  const groups = groupChatMessagesByDay(originalList, 'en-US');

  // Verify non-mutation of input array
  assert.deepEqual(originalList, originalCopy, 'Input array must not be mutated');

  assert.equal(groups.length, 2);
  assert.equal(groups[0].dateKey, '2026-08-24');
  assert.equal(groups[0].label, 'Monday, August 24, 2026');
  assert.equal(groups[0].messages.length, 3);
  // Chronological order with tie-break
  assert.equal(groups[0].messages[0].id, 'msg-1');
  assert.equal(groups[0].messages[1].id, 'msg-0-tie');
  assert.equal(groups[0].messages[2].id, 'msg-2');

  assert.equal(groups[1].dateKey, '2026-08-25');
  assert.equal(groups[1].label, 'Tuesday, August 25, 2026');
  assert.equal(groups[1].messages.length, 1);
  assert.equal(groups[1].messages[0].id, 'msg-3');

  // Rejects invalid arguments
  assert.throws(() => groupChatMessagesByDay(null), /expected messages to be an array/);
  assert.throws(() => groupChatMessagesByDay([{ ...msgDay1A, createdAt: 'bad-date' }]), /Invalid chat timestamp/);
});

test('getChatMessageA11yLabel: generates informative screen-reader labels with sender, kind, time, and status in Arabic and English', () => {
  // Arabic Customer Text Sending
  const sendingMsg = createDummyMessage({
    senderRole: 'customer',
    kind: 'text',
    body: 'هل التوصيل اليوم؟',
    status: 'sending',
    createdAt: '2026-08-24T14:15:00.000Z',
  });
  const arSendingLabel = getChatMessageA11yLabel(sendingMsg, 'ar');
  assert.ok(arSendingLabel.includes('العميل'));
  assert.ok(arSendingLabel.includes('رسالة نصية'));
  assert.ok(arSendingLabel.includes('جارٍ الإرسال'));
  assert.ok(arSendingLabel.includes('هل التوصيل اليوم؟'));

  // English Failed Merchant Message
  const failedMsg = createDummyMessage({
    senderRole: 'merchant',
    kind: 'text',
    body: 'Sorry, out of stock',
    status: 'failed',
    createdAt: '2026-08-24T14:15:00.000Z',
  });
  const enFailedLabel = getChatMessageA11yLabel(failedMsg, 'en');
  assert.ok(enFailedLabel.includes('Merchant'));
  assert.ok(enFailedLabel.includes('Text message'));
  assert.ok(enFailedLabel.includes('Failed to send'));
  assert.ok(enFailedLabel.includes('Sorry, out of stock'));

  // Product Card Message
  const cardMsg = createDummyMessage({
    senderRole: 'merchant',
    kind: 'product',
    body: null,
    card: { type: 'product', id: 'prod-123', label: 'حذاء رياضي أنيق' },
    status: 'sent',
    createdAt: '2026-08-24T14:15:00.000Z',
  });
  const arCardLabel = getChatMessageA11yLabel(cardMsg, 'ar');
  assert.ok(arCardLabel.includes('بطاقة منتج'));
  assert.ok(arCardLabel.includes('حذاء رياضي أنيق'));
  assert.ok(arCardLabel.includes('تم الإرسال'));

  // Deleted Message
  const deletedMsg = createDummyMessage({
    senderRole: 'driver',
    deleted: true,
    createdAt: '2026-08-24T14:15:00.000Z',
  });
  const arDeletedLabel = getChatMessageA11yLabel(deletedMsg, 'ar');
  assert.ok(arDeletedLabel.includes('مندوب التوصيل'));
  assert.ok(arDeletedLabel.includes('رسالة محذوفة'));
  assert.equal(arDeletedLabel.includes('جارٍ الإرسال'), false);
});

test('getChatMessageDirection: resolves incoming, outgoing, and system directions accurately', () => {
  const currentUserId = 'user-me-123';

  assert.equal(
    getChatMessageDirection({ senderRole: 'system', senderId: null }, currentUserId),
    'system',
  );
  assert.equal(
    getChatMessageDirection({ senderRole: 'customer', senderId: currentUserId }, currentUserId),
    'outgoing',
  );
  assert.equal(
    getChatMessageDirection({ senderRole: 'merchant', senderId: 'user-merchant-456' }, currentUserId),
    'incoming',
  );
  assert.equal(
    getChatMessageDirection({ senderRole: 'customer', senderId: currentUserId }, null),
    'incoming',
    'When currentUserId is unknown, message defaults to incoming',
  );

  assert.throws(() => getChatMessageDirection(null, currentUserId), /expected message object/);
});

test('shouldAnimateChatMessage: guarantees false on reducedMotion or failed status, true otherwise', () => {
  // When reducedMotion is true, always false
  assert.equal(shouldAnimateChatMessage({ reducedMotion: true, status: 'sending' }), false);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: true, status: 'sent' }), false);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: true, status: 'failed' }), false);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: true, status: 'delivered' }), false);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: true }), false);

  // When reducedMotion is false:
  assert.equal(shouldAnimateChatMessage({ reducedMotion: false, status: 'sending' }), true);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: false, status: 'sent' }), true);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: false, status: undefined }), true);
  assert.equal(shouldAnimateChatMessage({ reducedMotion: false, status: 'failed' }), false);

  assert.throws(() => shouldAnimateChatMessage(null), /expected options object/);
});
