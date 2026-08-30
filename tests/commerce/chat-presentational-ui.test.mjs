import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('ChatConnectionNotice: defines all 5 states, accessibility live regions, and retry trigger', () => {
  const code = read('components/marketplace/chat/presentational/chat-connection-notice.tsx');

  // Verify all 5 connection states are supported in type and mapping
  assert.match(code, /'connecting' \| 'online' \| 'offline' \| 'recovering' \| 'error'/);
  assert.match(code, /connecting:\s*'جارٍ الاتصال بالمحادثة…'/);
  assert.match(code, /recovering:\s*'جارٍ استعادة الاتصال بالمحادثة/);
  assert.match(code, /offline:\s*'أنت غير متصل بالإنترنت/);
  assert.match(code, /error:\s*'تعذر الاتصال بخدمة المحادثة/);

  // Verify online returns null
  assert.match(code, /if\s*\(state === 'online'\)\s*\{\s*return null;\s*\}/);

  // Verify accessibility live regions: status vs alert
  assert.match(code, /role=\{isError \? 'alert' : 'status'\}/);
  assert.match(code, /aria-live=\{isError \? 'assertive' : 'polite'\}/);
  assert.match(code, /data-state=\{state\}/);

  // Verify retry action
  assert.match(code, /aria-label="إعادة محاولة الاتصال بالمحادثة"/);
  assert.match(code, /onPress=\{onRetry\}/);
  assert.match(code, /<Button/);
  assert.doesNotMatch(code, /<button/);
});

test('ChatEmptyState: supports inboxEmpty, conversationEmpty, searchEmpty, blocked, and paused with Arabic copy', () => {
  const code = read('components/marketplace/chat/presentational/chat-empty-state.tsx');

  // Verify all 5 state variants
  assert.match(code, /'inboxEmpty'/);
  assert.match(code, /'conversationEmpty'/);
  assert.match(code, /'searchEmpty'/);
  assert.match(code, /'blocked'/);
  assert.match(code, /'paused'/);

  // Verify Arabic default titles and descriptions
  assert.match(code, /inboxEmpty:\s*\{\s*title:\s*'لا توجد محادثات حتى الآن'/);
  assert.match(code, /conversationEmpty:\s*\{\s*title:\s*'ابدأ المحادثة الآن'/);
  assert.match(code, /searchEmpty:\s*\{\s*title:\s*'لم نجد نتائج مطابقة'/);
  assert.match(code, /blocked:\s*\{\s*title:\s*'المحادثة غير متاحة'/);
  assert.match(code, /paused:\s*\{\s*title:\s*'المحادثة متوقفة مؤقتًا'/);

  // Verify accessibility attributes
  assert.match(code, /role="region"/);
  assert.match(code, /aria-label=\{displayTitle\}/);
  assert.match(code, /aria-hidden="true"/);
  assert.match(code, /<Button/);
  assert.match(code, /<Link/);
  assert.doesNotMatch(code, /<button|<a\s/);
});

test('ChatComposerStatus: supports idle, sending, failed, and retrying with live regions and retry action', () => {
  const code = read('components/marketplace/chat/presentational/chat-composer-status.tsx');

  // Verify idle returns null
  assert.match(code, /if\s*\(status === 'idle'\)\s*\{\s*return null;\s*\}/);

  // Verify sending, retrying, and failed copy
  assert.match(code, /defaultError = 'تعذر إرسال الرسالة\. يرجى إعادة المحاولة\.'/);
  assert.match(code, /defaultSending = 'جارٍ إرسال الرسالة…'/);
  assert.match(code, /defaultRetrying = 'جارٍ إعادة إرسال الرسالة…'/);

  // Verify accessibility live regions: status vs alert
  assert.match(code, /role=\{isFailed \? 'alert' : 'status'\}/);
  assert.match(code, /aria-live=\{isFailed \? 'assertive' : 'polite'\}/);
  assert.match(code, /data-status=\{status\}/);

  // Verify retry button on failure
  assert.match(code, /aria-label="إعادة إرسال الرسالة الفاشلة"/);
  assert.match(code, /onPress=\{onRetry\}/);
  assert.match(code, /<Button/);
  assert.doesNotMatch(code, /<button/);
});

test('Styles: enforces CSS logical properties, 44px mobile touch targets, and reduced-motion rules', () => {
  const css = read('components/marketplace/chat/presentational/chat-presentational.module.css');

  // CSS Logical properties
  assert.match(css, /padding-inline/);
  assert.match(css, /padding-block/);
  assert.match(css, /margin-block/);
  assert.match(css, /inline-size/);
  assert.match(css, /block-size/);

  // 44px (2.75rem) touch target minimums for mobile
  assert.match(css, /min-block-size:\s*2\.75rem/);

  // Reduced motion media query
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  assert.match(css, /animation:\s*none/);
});

test('Purity: components contain zero server-only, Supabase, database, or side-effect imports', () => {
  const files = [
    'components/marketplace/chat/presentational/chat-connection-notice.tsx',
    'components/marketplace/chat/presentational/chat-empty-state.tsx',
    'components/marketplace/chat/presentational/chat-composer-status.tsx',
  ];

  for (const file of files) {
    const code = read(file);
    assert.doesNotMatch(code, /server-only/i, `${file} must not import server-only`);
    assert.doesNotMatch(code, /supabase/i, `${file} must not import supabase`);
    assert.doesNotMatch(code, /next\/navigation/i, `${file} must not import next/navigation`);
    assert.doesNotMatch(code, /useMarketplaceChat/i, `${file} must not import chat hooks`);
    assert.doesNotMatch(code, /database/i, `${file} must not import database code`);
    assert.doesNotMatch(code, /fetch\(/i, `${file} must not make network requests`);
  }
});
