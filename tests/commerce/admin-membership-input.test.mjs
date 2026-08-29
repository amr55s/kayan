import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarketplaceAdminMembershipRoles } from '../../lib/admin/membership-input.ts';

test('admin membership input accepts monitor introspection role and rejects six selections before RPC', () => {
  assert.deepEqual(parseMarketplaceAdminMembershipRoles(['chat_monitor']), ['chat_monitor']);
  assert.equal(parseMarketplaceAdminMembershipRoles([
    'super_admin', 'operations', 'support', 'finance', 'catalog_reviewer', 'chat_monitor',
  ]), null);
});
