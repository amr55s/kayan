export const DRAFT_RECOVERY_TTL_MS = 30 * 60 * 1000;
const MAX_RECOVERY_BYTES = 64 * 1024;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RecoveryScope = { userId: string; activityKind: string };
export type DraftRecovery<T> = RecoveryScope & {
  format: 1;
  baseVersion: number;
  expiresAt: number;
  snapshot: T;
};

export function draftRecoveryKey(scope: RecoveryScope): string {
  return `dairtak:onboarding-recovery:v1:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.activityKind)}`;
}

export function persistDraftRecovery<T>(storage: StorageLike, scope: RecoveryScope, snapshot: T, baseVersion: number, now = Date.now()): boolean {
  try {
    const value: DraftRecovery<T> = { ...scope, format: 1, baseVersion, expiresAt: now + DRAFT_RECOVERY_TTL_MS, snapshot };
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_RECOVERY_BYTES) return false;
    storage.setItem(draftRecoveryKey(scope), serialized);
    return true;
  } catch { return false; }
}

export function readDraftRecovery<T>(storage: StorageLike, scope: RecoveryScope, validateSnapshot: (value: unknown) => T | null, now = Date.now()): DraftRecovery<T> | null {
  const key = draftRecoveryKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > MAX_RECOVERY_BYTES) throw new Error('oversized_recovery');
    const value = JSON.parse(raw);
    if (!value || value.format !== 1 || value.userId !== scope.userId || value.activityKind !== scope.activityKind
      || !Number.isSafeInteger(value.baseVersion) || value.baseVersion < 0
      || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + DRAFT_RECOVERY_TTL_MS) {
      throw new Error('invalid_recovery');
    }
    const snapshot = validateSnapshot(value.snapshot);
    if (!snapshot) throw new Error('invalid_snapshot');
    return { ...scope, format: 1, baseVersion: value.baseVersion, expiresAt: value.expiresAt, snapshot };
  } catch {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function discardDraftRecovery(storage: StorageLike, scope: RecoveryScope): void {
  try { storage.removeItem(draftRecoveryKey(scope)); } catch { /* Optional recovery storage. */ }
}

/** An older in-flight acknowledgement must never delete a newer edit. */
export function acknowledgeDraftRecovery<T>(storage: StorageLike, scope: RecoveryScope, acknowledged: T, nextVersion: number): void {
  try {
    const key = draftRecoveryKey(scope);
    const raw = storage.getItem(key);
    if (!raw || raw.length > MAX_RECOVERY_BYTES) return;
    const value = JSON.parse(raw);
    if (value.userId !== scope.userId || value.activityKind !== scope.activityKind || value.format !== 1) return;
    if (JSON.stringify(value.snapshot) === JSON.stringify(acknowledged)) storage.removeItem(key);
    else {
      value.baseVersion = Math.max(value.baseVersion, nextVersion);
      storage.setItem(key, JSON.stringify(value));
    }
  } catch { /* A failed recovery acknowledgement does not fail the database save. */ }
}

export function canRestoreDraftRecovery<T>(recovery: DraftRecovery<T>, databaseVersion: number): boolean {
  return recovery.baseVersion === databaseVersion;
}
