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
  assert.match(admin, /requireMarketplaceAdminRole\(\['support'\]/);
  for (const source of [customer, merchant, driver, admin]) {
    assert.match(source, /listConversations/);
    assert.match(source, /MarketplaceChatShell/);
  }
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
