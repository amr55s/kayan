import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const migration = source(
  'supabase/migrations/20260810078000_enforce_admin_aal2.sql',
);
const wrapperMigration = source(
  'supabase/migrations/20260818174408_enforce_authenticated_admin_aal2_wrappers.sql',
);
const guards = source('lib/auth/guards.ts');
const mfaPage = source('app/admin/mfa/page.tsx');
const mfaUi = source('components/security/AdminMfaSetup.tsx');

test('marketplace admin database authorization requires AAL2 without weakening service jobs', () => {
  assert.match(migration, /create or replace function public\.is_marketplace_admin\(\)/u);
  assert.match(migration, /create or replace function public\.is_admin\(\)/u);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'[\s\S]*= 'aal2'/u);
  assert.match(migration, /auth\.jwt\(\) ->> 'role'[\s\S]*= 'service_role'/u);
  assert.match(migration, /profile\.role = 'admin'[\s\S]*profile\.is_active/u);
  assert.doesNotMatch(migration, /current_user|session_user/u);
  assert.match(
    migration,
    /revoke all on function public\.is_marketplace_admin\(\) from public, anon, authenticated, service_role/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.is_marketplace_admin\(\) to authenticated, service_role/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.is_admin\(\) from public, anon, authenticated, service_role/u,
  );
});

test('every authenticated RPC that reaches a legacy admin fallback is AAL2-hardened', () => {
  const exposedWrappers = [
    'authorize_my_private_marketplace_media',
    'reorder_my_marketplace_media',
    'delete_my_marketplace_media',
    'submit_my_store_for_review',
    'submit_my_product_for_review',
    'moderate_store_as_admin',
    'moderate_product_as_admin',
    'assign_marketplace_delivery_driver_as_caller',
    'attach_my_marketplace_delivery_proof',
    'set_my_marketplace_order_status',
    'submit_my_cash_reconciliation_batch',
    'review_cash_reconciliation_batch_as_admin',
  ];

  for (const functionName of exposedWrappers) {
    assert.match(
      wrapperMigration,
      new RegExp(`alter function public\\.${functionName}\\([\\s\\S]*?rename to ${functionName}_base_174408`, 'u'),
      `${functionName} must not leave the prior SECURITY DEFINER body directly exposed`,
    );
    assert.match(
      wrapperMigration,
      new RegExp(`revoke all on function public\\.${functionName}_base_174408\\([\\s\\S]*?from public, anon, authenticated, service_role`, 'u'),
      `${functionName} base implementation must be private`,
    );
    assert.match(
      wrapperMigration,
      new RegExp(`create or replace function public\\.${functionName}\\(`, 'u'),
      `${functionName} hardened wrapper is missing`,
    );
  }

  assert.match(
    wrapperMigration,
    /create or replace function public\.require_marketplace_admin_fallback\([\s\S]*?public\.is_marketplace_admin\(\)[\s\S]*?profile\.role = 'admin'[\s\S]*?admin_aal2_required/u,
  );
  assert.match(
    wrapperMigration,
    /create or replace function public\.set_delivery_order_status\([\s\S]*?v_profile\.role = 'admin'[\s\S]*?not public\.is_admin\(\)/u,
  );
});

test('AAL2 fallback guards preserve explicit customer, merchant, and driver capabilities', () => {
  assert.match(
    wrapperMigration,
    /has_marketplace_store_role_without_admin\([\s\S]*?store_memberships[\s\S]*?profile\.role = 'merchant'/u,
  );
  assert.match(
    wrapperMigration,
    /set_my_marketplace_order_status\([\s\S]*?v_customer[\s\S]*?v_staff[\s\S]*?v_driver[\s\S]*?require_marketplace_admin_fallback\(v_non_admin\)/u,
  );
  assert.match(
    wrapperMigration,
    /attach_my_marketplace_delivery_proof\([\s\S]*?assignment\.driver_id = \(select auth\.uid\(\)\)[\s\S]*?require_marketplace_admin_fallback\(v_is_driver\)/u,
  );
  assert.equal(
    [...wrapperMigration.matchAll(/role = 'admin'/gu)].length,
    2,
    'raw admin-role reads are allowed only inside the central AAL2 interceptor and the guarded legacy wrapper',
  );
});

test('server guard redirects AAL1 admins to MFA and has a non-redirecting Server Action mode', () => {
  assert.match(guards, /export async function requireAdminAal2/u);
  assert.match(guards, /getAuthenticatorAssuranceLevel\(\)/u);
  assert.match(guards, /data\.currentLevel !== 'aal2'/u);
  assert.match(guards, /failureMode === 'throw'/u);
  assert.match(guards, /admin_mfa_required/u);
  assert.equal(guards.includes('/^\\/admin\\/mfa'), true);
  assert.equal(guards.includes('/^\\/admin(?:\\/|$)'), true);
  assert.match(guards, /redirect\(`\/admin\/mfa\?next=/u);
});

test('MFA route is role-gated at AAL1 and cannot redirect back into itself', () => {
  const layout = source('app/admin/layout.tsx');
  assert.match(layout, /requireProfile\(\['admin'\]\)/u);
  assert.doesNotMatch(layout, /requireAdminAal2/u);
  assert.match(mfaPage, /requireProfile\(\['admin'\]\)/u);
  assert.doesNotMatch(mfaPage, /requireAdminAal2/u);
  assert.equal(mfaPage.includes('/^\\/admin\\/mfa'), true);
  assert.equal(mfaPage.includes('/^\\/admin(?:\\/|$)'), true);
  assert.match(mfaPage, /currentLevel === 'aal2'[\s\S]*redirect\(nextPath\)/u);
});

test('every sensitive admin page has the AAL2 server guard', () => {
  for (const page of [
    'app/admin/page.tsx',
    'app/admin/marketplace/orders/page.tsx',
    'app/admin/marketplace/orders/[id]/page.tsx',
    'app/admin/marketplace/commissions/[id]/page.tsx',
    'app/admin/marketplace/reconciliations/[id]/page.tsx',
    'app/admin/marketplace/support/[id]/page.tsx',
  ]) {
    assert.match(
      source(page),
      /(?:requireAdminAal2|requireMarketplaceAdminRole)\(/u,
      `${page} is missing its AAL2 guard`,
    );
  }
});

test('admin mutations consistently use the shared AAL2 guard', () => {
  const contracts = [
    ['lib/supabase/admin-actions.ts', /requireMarketplaceAdminRole\(\['super_admin'\], \{ failureMode: 'throw' \}\)/u],
    ['lib/marketing/admin-actions.ts', /requireMarketplaceAdminRole\(\['super_admin'\], \{ failureMode: 'throw' \}\)/u],
    ['lib/operations/approval-actions.ts', /requireMarketplaceAdminRole\(\['super_admin'\], \{ failureMode: 'throw' \}\)/u],
    ['lib/operations/actions.ts', /role === 'admin'[\s\S]*requireMarketplaceAdminRole\(\['super_admin'\]/u],
    ['lib/commerce/operations-actions.ts', /moderateMarketplaceEntityAction[\s\S]*requireMarketplaceAdminRole\(\['catalog_reviewer'\]/u],
    ['lib/supabase/actions.ts', /profile\.role === 'admin'[\s\S]*requireMarketplaceAdminRole\(\['super_admin', 'catalog_reviewer'\]/u],
  ];
  for (const [file, pattern] of contracts) {
    assert.match(source(file), pattern, `${file} is missing its admin AAL2 guard`);
  }
});

test('admin MFA UI supports TOTP enrollment and verified-factor challenge only', () => {
  assert.match(mfaUi, /@heroui\/react\/button/u);
  assert.match(mfaUi, /@heroui\/react\/card/u);
  assert.match(mfaUi, /auth\.mfa\.listFactors\(\)/u);
  assert.match(mfaUi, /auth\.mfa\.enroll\(\{[\s\S]*factorType: 'totp'/u);
  assert.match(mfaUi, /auth\.mfa\.challengeAndVerify\(\{/u);
  assert.match(mfaUi, /data\.totp\[0\]/u);
  assert.doesNotMatch(mfaUi, /factorType:\s*'phone'|console\.(?:log|error|warn)/u);
  assert.doesNotMatch(mfaUi, /error\.message/u);
});
