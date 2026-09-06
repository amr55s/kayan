import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeDraftRecovery, canRestoreDraftRecovery, discardDraftRecovery, draftRecoveryKey, DRAFT_RECOVERY_TTL_MS, persistDraftRecovery, readDraftRecovery } from '../lib/onboarding/recovery.ts';

const scope = { userId: 'user-a', activityKind: 'store' };
const snapshot = { step: 2, data: { displayName: 'اسم مسودة', phone: '01012345678' } };
const validate = value => value?.step === 2 && typeof value?.data?.displayName === 'string' ? value : null;
function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

test('local recovery is scoped to signed-in user and activity with a 30 minute TTL', () => {
  const s = storage();
  assert.equal(persistDraftRecovery(s, scope, snapshot, 3, 1000), true);
  assert.deepEqual(readDraftRecovery(s, scope, validate, 1001)?.snapshot, snapshot);
  assert.equal(readDraftRecovery(s, { ...scope, userId: 'user-b' }, validate, 1001), null);
  assert.equal(readDraftRecovery(s, { ...scope, activityKind: 'driver' }, validate, 1001), null);
  assert.equal(readDraftRecovery(s, scope, validate, 1000 + DRAFT_RECOVERY_TTL_MS), null);
  assert.equal(s.getItem(draftRecoveryKey(scope)), null);
});

test('expired, forged, malformed and invalid recovery cannot restore', () => {
  const s = storage();
  for (const raw of ['not-json', 'null', JSON.stringify({ ...scope, format: 1, baseVersion: 2, expiresAt: 1001, snapshot: { step: 99 } }), JSON.stringify({ ...scope, userId: 'other', format: 1, baseVersion: 2, expiresAt: 1001, snapshot })]) {
    s.setItem(draftRecoveryKey(scope), raw);
    assert.equal(readDraftRecovery(s, scope, validate, 1000), null);
  }
});

test('newer DB revision is compare-only and can never be implicitly restored', () => {
  const s = storage();
  persistDraftRecovery(s, scope, snapshot, 3, 1000);
  const record = readDraftRecovery(s, scope, validate, 1001);
  assert.equal(canRestoreDraftRecovery(record, 3), true);
  assert.equal(canRestoreDraftRecovery(record, 4), false);
  assert.equal(canRestoreDraftRecovery(record, 2), false);
});

test('older in-flight save acknowledgement preserves newer local input and rebases its expected version', () => {
  const s = storage();
  const newer = { ...snapshot, data: { displayName: 'تعديل أحدث' } };
  persistDraftRecovery(s, scope, newer, 3, 1000);
  acknowledgeDraftRecovery(s, scope, snapshot, 4);
  const record = readDraftRecovery(s, scope, validate, 1001);
  assert.deepEqual(record.snapshot, newer);
  assert.equal(record.baseVersion, 4);
  acknowledgeDraftRecovery(s, scope, newer, 5);
  assert.equal(s.getItem(draftRecoveryKey(scope)), null);
});

test('discard/submit clears only this user/activity recovery; denied storage is nonfatal', () => {
  const s = storage();
  const other = { ...scope, activityKind: 'driver' };
  persistDraftRecovery(s, scope, snapshot, 1, 1000);
  persistDraftRecovery(s, other, snapshot, 1, 1000);
  discardDraftRecovery(s, scope);
  assert.equal(s.getItem(draftRecoveryKey(scope)), null);
  assert.ok(s.getItem(draftRecoveryKey(other)));
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
  assert.equal(persistDraftRecovery(denied, scope, snapshot, 0), false);
  assert.equal(readDraftRecovery(denied, scope, validate), null);
  assert.doesNotThrow(() => acknowledgeDraftRecovery(denied, scope, snapshot, 1));
  assert.doesNotThrow(() => discardDraftRecovery(denied, scope));
});

test('recovery payloads are size-bounded and cannot extend their expiry into the future', () => {
  const s = storage();
  assert.equal(persistDraftRecovery(s, scope, { data: 'x'.repeat(70_000) }, 0, 1000), false);
  assert.equal(s.getItem(draftRecoveryKey(scope)), null);
  s.setItem(draftRecoveryKey(scope), JSON.stringify({ ...scope, format: 1, baseVersion: 0, expiresAt: 1000 + DRAFT_RECOVERY_TTL_MS + 1, snapshot }));
  assert.equal(readDraftRecovery(s, scope, validate, 1000), null);
});
