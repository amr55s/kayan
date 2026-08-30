import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('every chat role is mounted by the shared canonical DAIRTAK marketplace wrapper', async () => {
  const [wrapper, merchantShell, customer, driver, admin] = await Promise.all([
    read('components/marketplace/authenticated-marketplace-shell.tsx'),
    read('components/marketplace/merchant/merchant-marketplace-shell.tsx'),
    read('app/account/chat/layout.tsx'),
    read('app/driver/marketplace/chat/layout.tsx'),
    read('app/admin/marketplace/chat/layout.tsx'),
  ]);

  assert.match(wrapper, /MarketplaceShell/);
  assert.match(wrapper, /MarketplaceRoleShell/);
  assert.match(wrapper, /usePathname/);
  assert.match(wrapper, /activeHref/);
  assert.doesNotMatch(wrapper, /<header|<footer/);
  assert.match(merchantShell, /AuthenticatedMarketplaceShell/);
  assert.match(merchantShell, /role="merchant"/);
  assert.match(customer, /AuthenticatedMarketplaceShell[\s\S]*role="customer"/);
  assert.match(driver, /AuthenticatedMarketplaceShell[\s\S]*role="driver"/);
  assert.match(admin, /AuthenticatedMarketplaceShell[\s\S]*role="admin"/);
});

test('legacy role layouts no longer inject a parallel raw chat navigation', async () => {
  const layouts = await Promise.all([
    read('app/account/layout.tsx'),
    read('app/merchant/layout.tsx'),
    read('app/driver/layout.tsx'),
    read('app/admin/layout.tsx'),
  ]);
  for (const source of layouts) assert.doesNotMatch(source, /ChatInboxNavigation/);
});

test('canonical shell publishes HeroUI v3 semantic DAIRTAK tokens and chat consumes them', async () => {
  const [marketplaceCss, chatCss, presentationalCss] = await Promise.all([
    read('components/marketplace/marketplace.module.css'),
    read('components/marketplace/chat/chat.module.css'),
    read('components/marketplace/chat/presentational/chat-presentational.module.css'),
  ]);

  for (const token of ['--accent:', '--accent-foreground:', '--focus:', '--link:', '--field-background:']) {
    assert.match(marketplaceCss, new RegExp(token));
  }
  assert.match(chatCss, /var\(--accent\)/);
  assert.match(chatCss, /var\(--accent-foreground\)/);
  assert.match(chatCss, /var\(--focus\)/);
  assert.doesNotMatch(chatCss, /#2563eb/i);
  assert.match(presentationalCss, /var\(--accent\)/);
  assert.match(presentationalCss, /var\(--focus\)/);
  assert.doesNotMatch(presentationalCss, /#006fee|#eff6ff|#1e40af|#bfdbfe/i);
});

test('chat search and visible actions use documented HeroUI v3 primitives', async () => {
  const [shell, entry, connection, empty, composer] = await Promise.all([
    read('components/marketplace/chat/chat-shell.tsx'),
    read('components/marketplace/chat/chat-entry-button.tsx'),
    read('components/marketplace/chat/presentational/chat-connection-notice.tsx'),
    read('components/marketplace/chat/presentational/chat-empty-state.tsx'),
    read('components/marketplace/chat/presentational/chat-composer-status.tsx'),
  ]);

  assert.match(shell, /SearchField\.Group/);
  assert.match(shell, /SearchField\.Input/);
  assert.match(shell, /SearchField\.ClearButton/);
  assert.doesNotMatch(shell, /<input[\s\S]*?id="chat-search"/);
  assert.match(entry, /<Button[\s\S]*?isPending=\{isPending\}[\s\S]*?isDisabled=\{isPending\}/);
  for (const source of [connection, composer]) {
    assert.match(source, /<Button/);
    assert.match(source, /onPress=\{onRetry\}/);
    assert.doesNotMatch(source, /<button/);
  }
  assert.match(empty, /<Button/);
  assert.match(empty, /<Link/);
  assert.doesNotMatch(empty, /<button|<a\s/);
});
