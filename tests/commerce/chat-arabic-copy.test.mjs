import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONNECTION_COPY,
  CHAT_EMPTY_COPY,
  CHAT_ERROR_COPY,
  CHAT_RECOVERY_COPY,
  CHAT_STATUS_COPY,
  getChatErrorMessage,
} from '../../lib/commerce/chat/copy.ts';

const expectedErrorCodes = [
  'invalid_input',
  'authentication_required',
  'not_found',
  'closed',
  'rate_limited',
  'service_unavailable',
];

test('CHAT_ERROR_COPY provides calm, non-technical Arabic copy for every valid ChatErrorCode', () => {
  for (const code of expectedErrorCodes) {
    const message = CHAT_ERROR_COPY[code];
    assert.ok(message, `Missing Arabic copy for error code: ${code}`);
    assert.ok(message.trim().length > 5, `Copy too short for code: ${code}`);

    // Must not leak internal / technical jargon
    assert.doesNotMatch(message, /token|jwt|rls|postgres|sql|database|session|500|404|403|401|pkce/i);
  }
});

test('CHAT_RECOVERY_COPY provides actionable guidance for recovery and profile setup', () => {
  assert.match(CHAT_RECOVERY_COPY.authentication_required, /انتهت جلسة الدخول/u);
  assert.match(CHAT_RECOVERY_COPY.rate_limited, /كثرة المحاولات/u);
  assert.match(CHAT_RECOVERY_COPY.service_unavailable, /تعذر فتح المحادثة بعد تسجيل الدخول/u);
  assert.match(CHAT_RECOVERY_COPY.profile_setup, /تجهيز حساب المتجر/u);
});

test('CHAT_STATUS_COPY uses consistent Arabic terminology and punctuation', () => {
  assert.equal(CHAT_STATUS_COPY.sending, 'جارٍ الإرسال…');
  assert.equal(CHAT_STATUS_COPY.sent, 'تم الإرسال');
  assert.equal(CHAT_STATUS_COPY.delivered, 'تم التسليم');
  assert.equal(CHAT_STATUS_COPY.read, 'تمت القراءة');
  assert.equal(CHAT_STATUS_COPY.failed, 'تعذر الإرسال');
  assert.equal(CHAT_STATUS_COPY.retrying, 'جارٍ إعادة المحاولة…');
  assert.equal(CHAT_STATUS_COPY.deleted, 'تم حذف هذه الرسالة');
  assert.equal(CHAT_STATUS_COPY.uploading, 'جارٍ رفع الصورة…');
});

test('CHAT_CONNECTION_COPY provides clear connectivity states', () => {
  assert.equal(CHAT_CONNECTION_COPY.connected, 'متصل');
  assert.equal(CHAT_CONNECTION_COPY.connecting, 'جارٍ الاتصال…');
  assert.equal(CHAT_CONNECTION_COPY.reconnecting, 'جارٍ استعادة الاتصال…');
  assert.equal(CHAT_CONNECTION_COPY.offline, 'غير متصل بالإنترنت');
});

test('CHAT_EMPTY_COPY provides actionable next steps', () => {
  assert.ok(CHAT_EMPTY_COPY.inboxTitle.length > 0);
  assert.ok(CHAT_EMPTY_COPY.inboxDescription.length > 0);
  assert.ok(CHAT_EMPTY_COPY.inboxAction.length > 0);
  assert.ok(CHAT_EMPTY_COPY.conversationTitle.length > 0);
  assert.ok(CHAT_EMPTY_COPY.conversationPrompt.length > 0);
});

test('getChatErrorMessage safely falls back to service_unavailable on null or unknown error codes', () => {
  assert.equal(getChatErrorMessage(null), CHAT_ERROR_COPY.service_unavailable);
  assert.equal(getChatErrorMessage(undefined), CHAT_ERROR_COPY.service_unavailable);
  assert.equal(getChatErrorMessage('unexpected_provider_crash'), CHAT_ERROR_COPY.service_unavailable);
  assert.equal(getChatErrorMessage('rate_limited'), CHAT_ERROR_COPY.rate_limited);
});
