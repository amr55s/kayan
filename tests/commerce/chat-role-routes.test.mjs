import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('chat inbox routes protect every durable role before loading chat data', async () => {
  const [customer, merchant, driver, admin] = await Promise.all([
    read('app/account/chat/page.tsx'),
    read('app/merchant/marketplace/chat/page.tsx'),
    read('app/driver/marketplace/chat/page.tsx'),
    read('app/admin/marketplace/chat/page.tsx'),
  ]);
  assert.match(customer, /requireAuthenticatedUser/);
  assert.match(merchant, /requireProfile\(\['merchant'\]\)/);
  assert.match(driver, /requireProfile\(\['driver'\]\)/);
  assert.match(admin, /requireAdminAal2\(\{ capability: 'chat_monitor'/);
  for (const source of [customer, merchant, driver, admin]) {
    assert.match(source, /listConversations/);
    assert.match(source, /MarketplaceChatShell/);
  }
});

test('admin monitor is capability-gated and intentionally read-only', async () => {
  const [guard, shell] = await Promise.all([
    read('lib/auth/guards.ts'),
    read('components/marketplace/chat/chat-shell.tsx'),
  ]);
  assert.match(guard, /capability\?: 'chat_monitor'/);
  assert.match(guard, /has_marketplace_admin_role/);
  assert.match(shell, /readOnly/);
  assert.match(shell, /لوحة المراقبة للقراءة فقط/);
});

test('legacy support routes authorize their thread before an internal chat redirect', async () => {
  const routes = await Promise.all([
    read('app/account/support/[id]/page.tsx'),
    read('app/merchant/marketplace/support/[id]/page.tsx'),
    read('app/admin/marketplace/support/[id]/page.tsx'),
  ]);
  for (const [index, source] of routes.entries()) {
    assert.match(source, index === 2 ? /getConversationPage/ : /getMyMarketplaceSupportThread/);
    assert.match(source, /redirect\(/);
    assert.match(source, /\/chat\/\$\{id\}/);
  }
});

test('live role layouts mount the authenticated chat inbox navigation', async () => {
  const layouts = await Promise.all([
    read('app/account/layout.tsx'),
    read('app/merchant/layout.tsx'),
    read('app/driver/layout.tsx'),
    read('app/admin/layout.tsx'),
  ]);
  for (const source of layouts) assert.match(source, /ChatInboxNavigation/);
});

test('monitor capability is distinct from support and legacy monitor lookup uses unified read access', async () => {
  const [guard, legacy, types, memberships] = await Promise.all([
    read('lib/auth/guards.ts'),
    read('app/admin/marketplace/support/[id]/page.tsx'),
    read('lib/supabase/database.types.ts'),
    read('lib/admin/membership-input.ts'),
  ]);
  assert.match(guard, /p_roles: \['chat_monitor'\]/);
  assert.doesNotMatch(guard, /\(supabase as any\)\.rpc/);
  assert.match(legacy, /getConversationPage/);
  assert.doesNotMatch(legacy, /getMyMarketplaceSupportThread/);
  assert.match(legacy, /conversation\.kind !== 'support'/);
  assert.match(legacy, /ChatServiceError/);
  assert.match(types, /"chat_monitor"/);
  assert.match(memberships, /'chat_monitor'/);
});

test('selected routes validate the id before their concurrent inbox and conversation loads', async () => {
  const routes = await Promise.all([
    read('app/account/chat/[id]/page.tsx'),
    read('app/merchant/marketplace/chat/[id]/page.tsx'),
    read('app/driver/marketplace/chat/[id]/page.tsx'),
    read('app/admin/marketplace/chat/[id]/page.tsx'),
  ]);
  for (const source of routes) {
    assert.match(source, /z\.uuid\(\)\.safeParse/);
    assert.match(source, /Promise\.all\(/);
    assert.match(source, /getConversationPage/);
  }
});

test('contextual entry stays in-app and preserves an allowlisted local return route', async () => {
  const [entry, product, order] = await Promise.all([
    read('components/marketplace/chat/chat-entry-button.tsx'),
    read('components/marketplace/product-details.tsx'),
    read('components/commerce-operations/order-detail.tsx'),
  ]);
  assert.match(entry, /chatRoute/);
  assert.match(product, /kind: 'presale'/);
  assert.match(order, /kind: 'order'/);
  assert.match(order, /chatRoute=/);
});
