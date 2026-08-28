import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import ts from 'typescript';

const workspace = fileURLToPath(new URL('../..', import.meta.url));
const taskFiles = [
  'components/marketplace/chat/chat-shell.tsx',
  'components/marketplace/chat/conversation-list.tsx',
  'components/marketplace/chat/message-list.tsx',
  'components/marketplace/chat/message-card.tsx',
  'components/marketplace/chat/message-composer.tsx',
];

const read = (path) => readFileSync(join(workspace, path), 'utf8');

function jsxName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${jsxName(node.expression)}.${node.name.text}`;
  return node.getText();
}

function jsxNodes(source, fileName) {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

function attribute(node, name) {
  return node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
}

function staticAttributeValue(node, name) {
  const item = attribute(node, name);
  return item && item.initializer && ts.isStringLiteral(item.initializer) ? item.initializer.text : null;
}

function resolveLocalModule(specifier, sourcePath) {
  const base = specifier.startsWith('@/')
    ? join(workspace, specifier.slice(2))
    : resolve(dirname(sourcePath), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')];
  return candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  }) ?? null;
}

async function importWorkspaceTsx(entry) {
  mkdirSync(join(workspace, '.next'), { recursive: true });
  const outputRoot = mkdtempSync(join(workspace, '.next', 'chat-ui-test-'));
  const staged = new Map();

  function outputPath(sourcePath) {
    const rel = relative(workspace, sourcePath).replace(/\.(?:tsx?|jsx?)$/, '.mjs');
    return join(outputRoot, rel);
  }

  function stageCss(sourcePath) {
    const target = `${outputPath(sourcePath)}.mjs`;
    if (staged.has(sourcePath)) return target;
    staged.set(sourcePath, target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'export default new Proxy({}, { get: (_target, key) => String(key) });\n');
    return target;
  }

  function stage(sourcePath) {
    if (sourcePath.endsWith('.css')) return stageCss(sourcePath);
    if (staged.has(sourcePath)) return staged.get(sourcePath);
    const target = outputPath(sourcePath);
    staged.set(sourcePath, target);
    let source = readFileSync(sourcePath, 'utf8');
    const tree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const replacements = [];
    for (const statement of tree.statements) {
      const literal = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
        ? statement.moduleSpecifier
        : null;
      if (!literal || !ts.isStringLiteral(literal)) continue;
      const specifier = literal.text;
      if (specifier === 'next/link') {
        replacements.push({ start: literal.getStart(tree) + 1, end: literal.getEnd() - 1, value: 'next/link.js' });
        continue;
      }
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const dependency = resolveLocalModule(specifier, sourcePath);
      if (!dependency) continue;
      const dependencyTarget = stage(dependency);
      let rewritten = relative(dirname(target), dependencyTarget).replaceAll('\\', '/');
      if (!rewritten.startsWith('.')) rewritten = `./${rewritten}`;
      replacements.push({ start: literal.getStart(tree) + 1, end: literal.getEnd() - 1, value: rewritten });
    }
    for (const item of replacements.sort((left, right) => right.start - left.start)) {
      source = `${source.slice(0, item.start)}${item.value}${source.slice(item.end)}`;
    }
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: sourcePath,
      reportDiagnostics: true,
    });
    const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `TypeScript transpilation failed for ${relative(workspace, sourcePath)}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, compiled.outputText);
    return target;
  }

  const target = stage(join(workspace, entry));
  try {
    return await import(`${pathToFileURL(target).href}?test=${Date.now()}`);
  } finally {
    // The imported module remains in memory after evaluation, so the staged tree is disposable.
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

function fixtureMessage(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000011',
    clientMessageId: null,
    conversationId: '10000000-0000-4000-8000-000000000001',
    senderId: '10000000-0000-4000-8000-000000000002',
    senderRole: 'merchant',
    kind: 'text',
    body: 'المنتج متاح الآن',
    replyToId: null,
    card: null,
    attachment: null,
    reactions: [],
    deleted: false,
    createdAt: '2026-08-28T10:30:00.000Z',
    revision: 1,
    status: 'sent',
    failureCode: null,
    ...overrides,
  };
}

function fixtureConversation(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    publicCode: 'CHAT-1042',
    kind: 'presale',
    status: 'open',
    subject: 'استفسار عن منتج',
    store: { id: '10000000-0000-4000-8000-000000000003', name: 'متجر كيان' },
    order: { id: '10000000-0000-4000-8000-000000000004', publicCode: 'ORD-42' },
    counterpart: { displayName: 'متجر كيان', role: 'merchant', avatarUrl: null },
    lastMessageAt: '2026-08-28T10:30:00.000Z',
    unreadCount: 2,
    ...overrides,
  };
}

test('Task 7 components use the documented HeroUI v3 anatomy and accessible form association', () => {
  const sources = taskFiles.map((file) => ({ file, source: read(file) }));
  const nodes = sources.flatMap(({ file, source }) => jsxNodes(source, file));
  const names = nodes.map((node) => jsxName(node.tagName));

  assert.ok(names.includes('Button'), 'uses the HeroUI v3 Button component');
  assert.ok(nodes.some((node) => jsxName(node.tagName) === 'Button' && attribute(node, 'isPending')));
  assert.ok(nodes.some((node) => jsxName(node.tagName) === 'Button' && attribute(node, 'isDisabled')));
  assert.ok(names.includes('TextArea'));
  assert.ok(nodes.some((node) => jsxName(node.tagName) === 'Label' && staticAttributeValue(node, 'htmlFor') === 'chat-body'));
  assert.ok(nodes.some((node) => jsxName(node.tagName) === 'TextArea' && staticAttributeValue(node, 'id') === 'chat-body'));
  assert.ok(names.includes('Drawer.Backdrop'));
  assert.ok(names.includes('Drawer.Content'));
  assert.ok(names.includes('Drawer.Dialog'));
  assert.ok(names.includes('Drawer.Header'));
  assert.ok(names.includes('Drawer.Body'));
  assert.ok(names.includes('Drawer.Footer'));
  assert.ok(names.includes('Dropdown'));
  assert.ok(names.includes('Dropdown.Menu'));
  assert.ok(names.includes('Dropdown.Item'));
  assert.equal(names.some((name) => name.endsWith('.Root')), false, 'HeroUI v3 has no Root anatomy for these primitives');
});

test('Task 7 client boundary consumes real chat contracts and hook without server-only imports', () => {
  const combined = taskFiles.map(read).join('\n');
  assert.match(combined, /useMarketplaceChat/);
  assert.match(combined, /ChatConversationPage/);
  assert.match(combined, /ChatMessagePage/);
  assert.match(combined, /ChatOptimisticMessage/);
  assert.doesNotMatch(combined, /commerce\/chat\/(?:actions|service)/);
  assert.doesNotMatch(combined, /server-only|supabase|dangerouslySetInnerHTML/i);
  assert.doesNotMatch(combined, /https?:\/\/|mailto:|tel:/i);
});

test('chat decision helpers bound search, sending, previews, and scrolling', async () => {
  const shell = await importWorkspaceTsx('components/marketplace/chat/chat-shell.tsx');
  const inbox = await importWorkspaceTsx('components/marketplace/chat/conversation-list.tsx');
  const list = await importWorkspaceTsx('components/marketplace/chat/message-list.tsx');

  assert.equal(shell.normalizeChatSearchQuery('  طلب ٤٢  '), 'طلب ٤٢');
  assert.equal(shell.normalizeChatSearchQuery('   '), null);
  assert.equal(shell.normalizeChatSearchQuery('س'.repeat(201)), null);
  assert.equal(shell.canSendMarketplaceChatMessage({ status: 'open', blocked: false, connectionState: 'online' }), true);
  assert.equal(shell.canSendMarketplaceChatMessage({ status: 'paused', blocked: false, connectionState: 'online' }), false);
  assert.equal(shell.canSendMarketplaceChatMessage({ status: 'closed', blocked: false, connectionState: 'online' }), false);
  assert.equal(shell.canSendMarketplaceChatMessage({ status: 'open', blocked: true, connectionState: 'online' }), false);
  assert.equal(shell.canSendMarketplaceChatMessage({ status: 'open', blocked: false, connectionState: 'offline' }), false);
  assert.equal(inbox.safeConversationPreview('  متاح <script>alert(1)</script>  '), 'متاح <script>alert(1)</script>');
  assert.equal(inbox.safeConversationPreview('س'.repeat(181)).length, 161);
  assert.equal(list.shouldFollowNewest({ wasAtLatest: true, prepending: false }), true);
  assert.equal(list.shouldFollowNewest({ wasAtLatest: false, prepending: false }), false);
  assert.equal(list.shouldFollowNewest({ wasAtLatest: true, prepending: true }), false);
  assert.equal(list.initialViewportFollowsNewest(null), true);
  assert.equal(list.initialViewportFollowsNewest('10000000-0000-4000-8000-000000000011'), false);

  const ownOne = fixtureMessage({ id: '10000000-0000-4000-8000-000000000031', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' });
  const ownTwo = fixtureMessage({ id: '10000000-0000-4000-8000-000000000032', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' });
  assert.deepEqual(
    shell.deriveMessageDeliveryStatuses([ownOne, ownTwo], '10000000-0000-4000-8000-000000000009', ownOne.id, { [ownTwo.id]: 'delivered' }),
    { [ownOne.id]: 'read', [ownTwo.id]: 'delivered' },
  );
});

test('rendered inbox and conversation expose semantic Arabic UI without unsafe media or external contacts', async () => {
  const { MarketplaceChatShell } = await importWorkspaceTsx('components/marketplace/chat/chat-shell.tsx');
  const conversation = fixtureConversation();
  const html = renderToStaticMarkup(createElement(MarketplaceChatShell, {
    initialInbox: { items: [conversation], nextCursor: null },
    initialConversation: {
      conversation,
      messages: [
        fixtureMessage({ id: '10000000-0000-4000-8000-000000000012', kind: 'system', senderId: null, senderRole: 'system', body: 'تم ربط الطلب بالمحادثة' }),
        fixtureMessage({ id: '10000000-0000-4000-8000-000000000013', kind: 'image', body: null, attachment: { id: '10000000-0000-4000-8000-000000000099', url: 'https://attacker.invalid/private', width: 640, height: 480, alt: 'صورة المنتج' } }),
        fixtureMessage({ id: 'optimistic:retry', clientMessageId: '10000000-0000-4000-8000-000000000090', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer', status: 'failed', failureCode: 'service_unavailable', replyToId: '10000000-0000-4000-8000-000000000011' }),
      ],
      nextCursor: null,
      lastReadMessageId: '10000000-0000-4000-8000-000000000012',
    },
    currentUserId: '10000000-0000-4000-8000-000000000009',
    role: 'customer',
    basePath: '/account/chat',
    inboxPreviews: { [conversation.id]: '<b>آخر رد آمن كنص</b>' },
    deliveryStatusByMessageId: { '10000000-0000-4000-8000-000000000013': 'delivered' },
    counterpartyUserId: '10000000-0000-4000-8000-000000000002',
    isMuted: false,
    isBlocked: false,
    menuActions: {
      searchMessages: async () => ({ messages: [], nextCursor: null }),
      setMuted: async () => ({ status: 'sent' }),
      reportConversation: async () => ({ status: 'sent' }),
      setBlocked: async () => ({ status: 'sent', blocked: true, orderSupportAvailable: true, safeCopy: 'تظل رسائل دعم الطلب متاحة.' }),
    },
  }));

  assert.match(html, /dir="rtl"/);
  assert.match(html, /<nav[^>]+aria-label="صندوق المحادثات"/);
  assert.match(html, /<ol[^>]+aria-label="رسائل المحادثة"/);
  assert.match(html, /<time[^>]+dateTime="2026-08-28T10:30:00.000Z"/);
  assert.match(html, /<bdi[^>]+dir="ltr"[^>]*>ORD-42<\/bdi>/);
  assert.match(html, /&lt;b&gt;آخر رد آمن كنص&lt;\/b&gt;/);
  assert.match(html, /رسالة محذوفة|صورة مرفقة|صورة المنتج/);
  assert.match(html, /تم التسليم/);
  assert.doesNotMatch(html, /attacker\.invalid|<img|javascript:|mailto:|tel:/i);
  assert.doesNotMatch(html, /aria-live="(?:polite|assertive)"[^>]*aria-label="رسائل المحادثة"/);

  for (const [status, expected] of [['closed', 'المحادثة مغلقة'], ['paused', 'المحادثة متوقفة مؤقتًا']]) {
    const stateConversation = fixtureConversation({ status });
    const stateHtml = renderToStaticMarkup(createElement(MarketplaceChatShell, {
      initialInbox: { items: [stateConversation], nextCursor: null },
      initialConversation: { conversation: stateConversation, messages: [], nextCursor: null, lastReadMessageId: null },
      currentUserId: '10000000-0000-4000-8000-000000000009',
      role: 'customer',
      basePath: '/account/chat',
    }));
    assert.match(stateHtml, new RegExp(expected));
    assert.match(stateHtml, /<textarea[^>]+disabled/);
    assert.doesNotMatch(stateHtml, /ابدأ المحادثة الآن/);
  }
});

test('message card renders deleted, card, reaction, read, and optimistic states as plain accessible content', async () => {
  const { MessageCard } = await importWorkspaceTsx('components/marketplace/chat/message-card.tsx');
  const messages = [
    fixtureMessage({ deleted: true, body: '<script>hidden()</script>', attachment: { id: '10000000-0000-4000-8000-000000000099', url: 'https://unsafe.invalid/x', width: 1, height: 1, alt: 'خاص' } }),
    fixtureMessage({ id: '10000000-0000-4000-8000-000000000021', kind: 'product', body: null, replyToId: '10000000-0000-4000-8000-000000000010', card: { type: 'product', id: '10000000-0000-4000-8000-000000000022', label: '<em>منتج</em>' }, reactions: [{ emoji: '👍', count: 2, reactedByMe: true }] }),
    fixtureMessage({ id: '10000000-0000-4000-8000-000000000023', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' }),
    fixtureMessage({ id: 'optimistic:sending', clientMessageId: '10000000-0000-4000-8000-000000000024', status: 'sending', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' }),
    fixtureMessage({ id: 'optimistic:failed', clientMessageId: '10000000-0000-4000-8000-000000000025', status: 'failed', failureCode: 'service_unavailable', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' }),
  ];
  const html = messages.map((message, index) => renderToStaticMarkup(createElement(MessageCard, {
    message,
    currentUserId: '10000000-0000-4000-8000-000000000009',
    deliveryStatus: index === 2 ? 'read' : undefined,
    onReact: () => undefined,
    onReply: () => undefined,
    onRetry: () => undefined,
  }))).join('');

  assert.match(html, /تم حذف هذه الرسالة/);
  assert.doesNotMatch(html, /hidden\(\)|unsafe\.invalid/);
  assert.match(html, /&lt;em&gt;منتج&lt;\/em&gt;/);
  assert.match(html, /رد على رسالة سابقة/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /تمت القراءة/);
  assert.match(html, /جارٍ الإرسال/);
  assert.match(html, /تعذر الإرسال/);
  assert.match(html, /إعادة إرسال الرسالة/);
});

test('chat CSS provides responsive two-surface layout, logical RTL sizing, safe area, focus, and reduced motion', () => {
  const root = postcss.parse(read('components/marketplace/chat/chat.module.css'));
  const declarations = [];
  const rules = [];
  root.walkRules((rule) => rules.push(rule.selector));
  root.walkDecls((decl) => declarations.push({ prop: decl.prop, value: decl.value, parent: decl.parent.selector ?? decl.parent.params ?? '' }));

  assert.ok(declarations.some((item) => item.parent.includes('.shell') && item.prop === 'grid-template-columns'));
  assert.ok(declarations.some((item) => item.prop === 'padding-bottom' && item.value.includes('env(safe-area-inset-bottom)')));
  assert.ok(declarations.some((item) => ['padding-inline', 'margin-inline', 'inset-inline', 'inline-size', 'max-inline-size', 'min-block-size'].includes(item.prop)));
  assert.ok(declarations.some((item) => item.prop === 'min-block-size' && ['44px', '2.75rem'].includes(item.value)));
  assert.ok(rules.some((selector) => selector.includes(':focus-visible') || selector.includes('[data-focus-visible')));
  assert.ok(root.nodes.some((node) => node.type === 'atrule' && node.name === 'media' && node.params.includes('max-width')));
  const reduced = root.nodes.find((node) => node.type === 'atrule' && node.name === 'media' && node.params.includes('prefers-reduced-motion'));
  assert.ok(reduced, 'defines a reduced motion branch');
  const reducedCss = reduced.toString();
  assert.match(reducedCss, /transition:\s*none/);
  assert.match(reducedCss, /scroll-behavior:\s*auto/);
  const durations = declarations.flatMap((item) => [...item.value.matchAll(/(\d+)ms/g)].map((match) => Number(match[1])));
  assert.ok(durations.length > 0 && durations.every((duration) => duration >= 120 && duration <= 180));
  assert.ok(declarations.some((item) => item.prop === 'overflow-wrap' && item.value === 'anywhere'));
  assert.ok(declarations.some((item) => item.prop === 'max-inline-size' && item.value === '100%'));
});
