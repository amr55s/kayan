import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy PIN registration is removed by the production migration', () => {
  const migration = read(
    'supabase/migrations/202607270003_account_ownership_requests.sql',
  );
  assert.match(migration, /drop function if exists public\.register_public_driver/);
  assert.match(migration, /drop function if exists public\.renew_public_driver/);
  assert.match(migration, /drop column if exists pin_code/);
  assert.match(migration, /drop column if exists pin_code_hash/);
});

test('public account requests use reviewed Auth accounts', () => {
  const actions = read('lib/operations/actions.ts');
  const driverModal = read('components/delivery/DriverModal.tsx');
  const merchantModal = read('components/modals/AddListingModal.tsx');
  const adminManager = read('components/admin/AccountRequestManager.tsx');

  assert.match(actions, /submitAccountRequest/);
  assert.match(actions, /approveAccountRequest/);
  assert.match(actions, /consume_account_request_rate_limit/);
  assert.doesNotMatch(actions, /renewDriverWithPin|register_public_driver/);
  assert.match(driverModal, /إرسال طلب الحساب/);
  assert.match(merchantModal, /ربط مكان موجود/);
  assert.match(merchantModal, /إضافة خدمة جديدة/);
  assert.match(adminManager, /موافقة وتفعيل/);
});

test('selected category text keeps high contrast', () => {
  const categoryBar = read('components/directory/CategoryBar.tsx');
  assert.match(
    categoryBar,
    /isSelected \? 'text-white dark:text-zinc-950'/,
  );
  assert.doesNotMatch(categoryBar, /transition-all/);
});

