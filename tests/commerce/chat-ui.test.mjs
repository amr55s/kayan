import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
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
    this.scrollHeight = 600;
    this.scrollTop = 0;
    this.clientHeight = 300;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get disabled() {
    return this.attributes.has('disabled');
  }

  set disabled(value) {
    if (value) this.attributes.set('disabled', '');
    else this.attributes.delete('disabled');
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }

  get dataset() {
    const values = {};
    for (const [name, value] of this.attributes) {
      if (name.startsWith('data-')) {
        values[name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
      }
    }
    return values;
  }

  get firstElementChild() {
    return this.childNodes.find((child) => child.nodeType === 1) ?? null;
  }

  get lastElementChild() {
    return [...this.childNodes].reverse().find((child) => child.nodeType === 1) ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node.nodeType === 1) {
        if (selector === '[data-message-id]' && node.attributes.has('data-message-id')) matches.push(node);
        else if (/^[a-z]+$/i.test(selector) && node.tagName === selector.toUpperCase()) matches.push(node);
        node.childNodes.forEach(visit);
      }
    };
    this.childNodes.forEach(visit);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent ?? '').join('');
  }

  set textContent(value) {
    this.childNodes = value === '' ? [] : [new ReactTestText(String(value), this.ownerDocument)];
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
    this.visibilityState = 'visible';
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

function reactProps(node) {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps$'));
  assert.ok(key, `React props are attached to ${node.tagName}`);
  return node[key];
}

function reactAncestorProps(node, propName) {
  const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
  assert.ok(key, `React fiber is attached to ${node.tagName}`);
  let fiber = node[key];
  while (fiber) {
    if (typeof fiber.memoizedProps?.[propName] === 'function') return fiber.memoizedProps;
    fiber = fiber.return;
  }
  assert.fail(`No React ancestor exposes ${propName}`);
}

async function withMountedReact(run) {
  const documentTarget = new ReactTestDocument();
  const windowTarget = {
    document: documentTarget,
    HTMLIFrameElement: ReactTestElement,
    HTMLElement: ReactTestElement,
    SVGElement: ReactTestElement,
    Node: ReactTestNode,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '', direction: 'rtl' }),
  };
  documentTarget.defaultView = windowTarget;
  const container = new ReactTestElement('div', documentTarget);
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorCss = globalThis.CSS;
  const priorHtmlElement = globalThis.HTMLElement;
  const priorSvgElement = globalThis.SVGElement;
  const priorNode = globalThis.Node;
  const priorAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;
  globalThis.CSS = { escape: (value) => String(value) };
  globalThis.HTMLElement = ReactTestElement;
  globalThis.SVGElement = ReactTestElement;
  globalThis.Node = ReactTestNode;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(container);
  try {
    await run({ root, container, documentTarget, windowTarget });
  } finally {
    await act(async () => root.unmount());
    await flush();
    await new Promise((resolveValue) => setImmediate(resolveValue));
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
    if (priorCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = priorCss;
    if (priorHtmlElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = priorHtmlElement;
    if (priorSvgElement === undefined) delete globalThis.SVGElement;
    else globalThis.SVGElement = priorSvgElement;
    if (priorNode === undefined) delete globalThis.Node;
    else globalThis.Node = priorNode;
    if (priorAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = priorAct;
  }
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
    { [ownTwo.id]: 'delivered' },
  );

  const incomingOld = fixtureMessage({ id: '10000000-0000-4000-8000-000000000041' });
  const outgoing = fixtureMessage({ id: '10000000-0000-4000-8000-000000000042', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' });
  const incomingLatest = fixtureMessage({ id: '10000000-0000-4000-8000-000000000043' });
  const visibilityInput = {
    messages: [incomingOld, outgoing, incomingLatest],
    currentUserId: '10000000-0000-4000-8000-000000000009',
    lastReadMessageId: incomingOld.id,
    entries: [
      { messageId: outgoing.id, isIntersecting: true, intersectionRatio: 1 },
      { messageId: incomingLatest.id, isIntersecting: true, intersectionRatio: 0.8 },
    ],
  };
  assert.equal(list.selectVisibleIncomingReadTarget({ ...visibilityInput, documentVisibility: 'hidden' }), null);
  assert.equal(list.selectVisibleIncomingReadTarget({
    ...visibilityInput,
    documentVisibility: 'visible',
    entries: [{ messageId: incomingOld.id, isIntersecting: true, intersectionRatio: 1 }],
  }), null);
  assert.equal(list.selectVisibleIncomingReadTarget({ ...visibilityInput, documentVisibility: 'visible' }), incomingLatest.id);

  assert.equal(list.classifyOlderPageChange({ beforeFirstKey: 'b', beforeLastKey: 'z', afterFirstKey: 'a', afterLastKey: 'z' }), 'prepend');
  assert.equal(list.classifyOlderPageChange({ beforeFirstKey: 'b', beforeLastKey: 'z', afterFirstKey: 'b', afterLastKey: 'z' }), 'unchanged');
  assert.equal(list.classifyOlderPageChange({ beforeFirstKey: 'b', beforeLastKey: 'z', afterFirstKey: 'b', afterLastKey: 'zz' }), 'nonprepend');

  assert.deepEqual(
    await shell.runMarketplaceChatMenuAction(async () => { throw new Error('private provider failure'); }),
    { status: 'error', code: 'service_unavailable' },
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
  assert.deepEqual([...html.matchAll(/aria-live="([^"]+)"/g)].map((match) => match[1]), ['polite']);
  assert.doesNotMatch(html, /aria-live="assertive"/);

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

test('mounted composer disables editing while the submitted snapshot is pending and only send failure is polite', async () => {
  const { MessageComposer } = await importWorkspaceTsx('components/marketplace/chat/message-composer.tsx');
  const pendingSend = deferred();
  const composerRef = { current: null };
  const sent = [];
  await withMountedReact(async ({ root, container }) => {
    await act(async () => root.render(createElement(MessageComposer, {
      senderRole: 'customer',
      composerRef,
      onComposerInput: () => undefined,
      onComposerBlur: () => undefined,
      disabledReason: null,
      replyTo: null,
      failedMessage: null,
      onCancelReply: () => undefined,
      onSend: async (input) => {
        sent.push(input);
        return pendingSend.promise;
      },
      onRetry: async () => undefined,
    })));
    const textarea = container.querySelector('textarea');
    const form = container.querySelector('form');
    assert.ok(textarea && form);
    await act(async () => reactProps(textarea).onChange({ target: { value: 'رسالة أثناء الطلب' } }));
    let submitPromise;
    act(() => {
      submitPromise = reactProps(form).onSubmit({ preventDefault() {} });
    });
    await flush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body, 'رسالة أثناء الطلب');
    assert.equal(textarea.disabled, true);
    assert.equal(reactProps(textarea).disabled, true);
    await act(async () => {
      pendingSend.resolve('10000000-0000-4000-8000-000000000090');
      await submitPromise;
    });
  });

  const failedHtml = renderToStaticMarkup(createElement(MessageComposer, {
    senderRole: 'customer',
    composerRef,
    onComposerInput: () => undefined,
    onComposerBlur: () => undefined,
    disabledReason: null,
    replyTo: null,
    failedMessage: fixtureMessage({
      id: 'optimistic:failed-live',
      clientMessageId: '10000000-0000-4000-8000-000000000091',
      senderId: '10000000-0000-4000-8000-000000000009',
      senderRole: 'customer',
      status: 'failed',
      failureCode: 'service_unavailable',
    }),
    onCancelReply: () => undefined,
    onSend: async () => null,
    onRetry: async () => undefined,
  }));
  assert.deepEqual([...failedHtml.matchAll(/aria-live="([^"]+)"/g)].map((match) => match[1]), ['polite']);
  assert.doesNotMatch(failedHtml, /aria-live="assertive"/);
});

test('mounted message list advances read only for visible incoming content in a visible document', async () => {
  const { MessageList } = await importWorkspaceTsx('components/marketplace/chat/message-list.tsx');
  const incomingOld = fixtureMessage({ id: '10000000-0000-4000-8000-000000000061' });
  const outgoing = fixtureMessage({ id: '10000000-0000-4000-8000-000000000062', senderId: '10000000-0000-4000-8000-000000000009', senderRole: 'customer' });
  const incomingLatest = fixtureMessage({ id: '10000000-0000-4000-8000-000000000063' });
  const observers = [];
  const priorObserver = globalThis.IntersectionObserver;
  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      observers.push(this);
    }
    observe(element) { this.observed.push(element); }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback(entries); }
  }
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  const marked = [];
  try {
    await withMountedReact(async ({ root, documentTarget }) => {
      await act(async () => root.render(createElement(MessageList, {
        messages: [incomingOld, outgoing, incomingLatest],
        currentUserId: '10000000-0000-4000-8000-000000000009',
        firstUnreadMessageId: null,
        lastReadMessageId: incomingOld.id,
        canLoadOlder: false,
        isLoadingOlder: false,
        onLoadOlder: async () => undefined,
        onVisibleIncomingMessage: (messageId) => marked.push(messageId),
        onRetry: () => undefined,
        onReply: () => undefined,
        onReact: () => undefined,
      })));
      await flush();
      assert.equal(observers.length, 1);
      const observer = observers[0];
      const byId = new Map(observer.observed.map((element) => [element.dataset.messageId, element]));
      documentTarget.visibilityState = 'hidden';
      await act(async () => observer.emit([{ target: byId.get(incomingLatest.id), isIntersecting: true, intersectionRatio: 1 }]));
      assert.deepEqual(marked, []);
      documentTarget.visibilityState = 'visible';
      await act(async () => observer.emit([
        { target: byId.get(incomingLatest.id), isIntersecting: false, intersectionRatio: 0 },
        { target: byId.get(incomingOld.id), isIntersecting: true, intersectionRatio: 1 },
      ]));
      assert.deepEqual(marked, []);
      await act(async () => observer.emit([{ target: byId.get(incomingLatest.id), isIntersecting: true, intersectionRatio: 0.8 }]));
      assert.deepEqual(marked, [incomingLatest.id]);
    });
  } finally {
    if (priorObserver === undefined) delete globalThis.IntersectionObserver;
    else globalThis.IntersectionObserver = priorObserver;
  }
});

test('mounted empty and rejected older-page requests clear prepend bookkeeping before a later append', async () => {
  const { MessageList } = await importWorkspaceTsx('components/marketplace/chat/message-list.tsx');
  const initial = fixtureMessage({ id: '10000000-0000-4000-8000-000000000071' });
  const appended = fixtureMessage({ id: '10000000-0000-4000-8000-000000000072' });
  async function assertSettlementClearsPrepend(rejectRequest) {
    const older = deferred();
    let appendMessage = () => undefined;

    function Harness() {
      const [messages, setMessages] = useState([initial]);
      const [loading, setLoading] = useState(false);
      appendMessage = () => setMessages((current) => [...current, appended]);
      return createElement(MessageList, {
        messages,
        currentUserId: '10000000-0000-4000-8000-000000000009',
        firstUnreadMessageId: null,
        lastReadMessageId: null,
        canLoadOlder: true,
        isLoadingOlder: loading,
        onLoadOlder: async () => {
          setLoading(true);
          try {
            await older.promise;
          } finally {
            setLoading(false);
          }
        },
        onVisibleIncomingMessage: () => undefined,
        onRetry: () => undefined,
        onReply: () => undefined,
        onReact: () => undefined,
      });
    }

    await withMountedReact(async ({ root, container }) => {
      await act(async () => root.render(createElement(Harness)));
      const viewport = container.querySelectorAll('div').find((node) => reactProps(node).className === 'messageViewport');
      const loadButton = container.querySelectorAll('button').find((node) => node.textContent.includes('تحميل رسائل أقدم'));
      assert.ok(viewport && loadButton);
      viewport.scrollHeight = 700;
      viewport.clientHeight = 300;
      viewport.scrollTop = 0;
      await act(async () => reactProps(viewport).onScroll());
      await act(async () => reactAncestorProps(loadButton, 'onPress').onPress());
      await act(async () => {
        if (rejectRequest) older.reject(new Error('page unavailable'));
        else older.resolve();
        try {
          await older.promise;
        } catch {
          // The component owns this rejection path; the test only waits for settlement.
        }
        await flush();
      });
      await act(async () => appendMessage());
      assert.match(container.textContent, /رسائل جديدة — الانتقال إلى الأحدث/);
    });
  }

  await assertSettlementClearsPrepend(false);
  await assertSettlementClearsPrepend(true);
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
