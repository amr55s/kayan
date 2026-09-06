export type SaveState = 'saved' | 'waiting' | 'saving' | 'error' | 'conflict';

/** Serializes saves from one tab. The database version handles competing tabs. */
export function createDraftSaveQueue<T, R extends { version: number }>(options: {
  version: number;
  save: (value: T, expectedVersion: number) => Promise<R>;
  onState: (state: SaveState) => void;
  onSaved: (result: R) => void;
}) {
  let version = options.version;
  let latest: { value: T; sequence: number } | null = null;
  let savedSequence = 0;
  let sequence = 0;
  let conflict = false;
  let running: Promise<void> | null = null;

  async function drain() {
    if (conflict) throw new Error('onboarding_version_conflict');
    while (latest && latest.sequence > savedSequence) {
      const snapshot = latest;
      options.onState('saving');
      try {
        const result = await options.save(snapshot.value, version);
        version = result.version;
        savedSequence = snapshot.sequence;
        options.onSaved(result);
      } catch (error) {
        conflict = error instanceof Error && error.message === 'onboarding_version_conflict';
        options.onState(conflict ? 'conflict' : 'error');
        throw error;
      }
    }
    options.onState('saved');
  }

  return {
    schedule(value: T) {
      latest = { value, sequence: ++sequence };
      if (!conflict) options.onState('waiting');
    },
    flush(): Promise<void> {
      if (!running) running = drain().finally(() => { running = null; });
      return running;
    },
    isDirty() { return Boolean(latest && latest.sequence > savedSequence); },
    getVersion() { return version; },
  };
}
