import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftSaveQueue } from '../lib/onboarding/autosave.ts';

test('autosave serializes edits made while a save is in flight', async () => {
  const calls = [];
  let release;
  const queue = createDraftSaveQueue({ version: 0, onState() {}, onSaved() {},
    async save(value, version) {
      calls.push([value, version]);
      if (version === 0) await new Promise(resolve => { release = resolve; });
      return { version: version + 1 };
    },
  });
  queue.schedule('first');
  const flush = queue.flush();
  queue.schedule('second');
  assert.equal(queue.flush(), flush);
  release();
  await flush;
  assert.deepEqual(calls, [['first', 0], ['second', 1]]);
  assert.equal(queue.isDirty(), false);
});

test('network failure retains latest data for explicit retry', async () => {
  let fail = true;
  const states = [];
  const queue = createDraftSaveQueue({ version: 4, onState: state => states.push(state), onSaved() {},
    async save(value, version) { if (fail) throw new Error('network'); return { version: version + 1 }; },
  });
  queue.schedule('unsaved');
  await assert.rejects(queue.flush(), /network/);
  assert.equal(queue.isDirty(), true);
  fail = false;
  await queue.flush();
  assert.equal(queue.getVersion(), 5);
  assert.equal(queue.isDirty(), false);
  assert.ok(states.includes('error'));
});

test('competing tab version never silently overwrites a newer database draft', async () => {
  let calls = 0;
  const queue = createDraftSaveQueue({ version: 4, onState() {}, onSaved() {},
    async save() { calls += 1; throw new Error('onboarding_version_conflict'); },
  });
  queue.schedule('stale');
  await assert.rejects(queue.flush(), /version_conflict/);
  queue.schedule('still stale');
  await assert.rejects(queue.flush(), /version_conflict/);
  assert.equal(calls, 1);
  assert.equal(queue.getVersion(), 4);
});
