import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { safeNextPath } from '../lib/auth/safe-next.ts';
import { startGoogleOAuthFlow } from '../lib/auth/oauth-flow.ts';
import { inspectChatIntentCookie } from '../lib/auth/chat-intent-cookie.ts';
import { accountRequestSchema } from '../lib/operations/validation.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('onboarding is an app-local OAuth destination, not an open redirect prefix', () => {
  assert.equal(safeNextPath('/onboarding'), '/onboarding');
  assert.equal(safeNextPath('/onboarding?activity=driver'), '/onboarding?activity=driver');
  for (const value of ['/onboarding.evil.example', '//onboarding', '/onboarding/../../api/private', '/onboarding?next=https://evil.example']) {
    assert.equal(safeNextPath(value), '/marketplace');
  }
});

test('Google joining signs an unclassified onboarding return without requiring an activity', async () => {
  const secret = 'google-joining-test-secret-at-least-32-bytes';
  const now = Date.now();
  let cookie;
  let callback;
  const result = await startGoogleOAuthFlow({ next: '/onboarding' }, {
    secret, siteUrl: 'https://preview.example', now: () => now,
    randomFlowId: () => 'f2616187-4f06-422c-8690-58f442023a2c',
    readCookie: () => null, writeCookie: (value) => { cookie = value; }, deleteCookie: () => {},
    isAuthenticated: async () => false,
    startOAuth: async (url) => { callback = new URL(url); return 'https://accounts.google.com/test'; },
  });
  assert.equal(result.success, true);
  assert.equal(callback.searchParams.get('next'), '/onboarding');
  const signed = inspectChatIntentCookie(cookie, { secret, now });
  assert.equal(signed.status, 'valid');
  assert.equal(signed.flow.returnTo, '/onboarding');
  assert.equal(signed.flow.intent, null);
});

test('public joining cannot provision password users or match another driver by phone', () => {
  const actions = read('lib/operations/actions.ts');
  const submit = actions.split('export async function submitAccountRequest(')[1].split('export async function approveAccountRequest(')[0];
  assert.match(submit, /identity\.provider === 'google'/);
  assert.match(submit, /!googleUser \|\| !googleUser.email_confirmed_at/);
  assert.doesNotMatch(submit, /createUser|deleteUser|password|from\('drivers'\)/);
  assert.match(submit, /legacy_driver_id: null/);
  assert.equal(accountRequestSchema.parse({kind: 'driver', displayName: 'اسم تجريبي', phone: '01008747011', password: 'must-not-be-used'}).password, undefined);
  for (const file of ['components/delivery/DriverModal.tsx', 'components/modals/AddListingModal.tsx']) {
    assert.doesNotMatch(read(file), /type="password"|setPassword|confirmPassword/);
  }
});

test('rejecting one activity cannot delete the shared identity', () => {
  const reject = read('lib/operations/actions.ts').split('export async function rejectAccountRequest(')[1].split('export async function createMerchantBranch(')[0];
  assert.match(reject, /reject_account_request/);
  assert.doesNotMatch(reject, /deleteUser|updateUserById/);
});

test('main header shares direct Google join and has no pre-auth role picker', () => {
  const header = read('components/layout/Header.tsx');
  assert.match(header, /beginGoogleSignIn\('\/onboarding'\)/);
  assert.doesNotMatch(header, /<Modal|choose\(onOpenDriverModal\)|choose\(onOpenAddModal\)/);
  assert.match(header, /dashboardPath \?\? '\/signin'/);
});

test('legacy onboarding explicitly switches sessions instead of looping through authenticated fastpath', () => {
  const action = read('lib/auth/oauth-actions.ts').split('export async function switchToGoogleForOnboarding')[1].split('export async function beginGoogleSignIn')[0];
  assert.match(action, /auth.signOut\(\{ scope: 'local' \}\)/);
  assert.match(action, /return beginGoogleSignIn\('\/onboarding'\)/);
  assert.doesNotMatch(action, /linkIdentity|updateUserById|authEmailForPhone/);
  assert.match(read('app/onboarding/page.tsx'), /<SwitchToGoogleButton/);
  assert.match(read('components/auth/SwitchToGoogleButton.tsx'), /تسجيل الخروج والمتابعة/);
});
