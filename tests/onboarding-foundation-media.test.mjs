import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
function loadRoute(options = {}) {
  const writes = []; const deletes = []; const queries = []; let inserted;
  const admin = {
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          queries.push({ table, filters });
          if (table === 'onboarding_drafts') return { data: options.missingDraft ? null : { id: draftId }, error: null };
          return { data: options.committed ? { id: inserted.id } : null, error: options.reconciliationError ? { message: 'timeout' } : null };
        },
        async insert(value) {
          inserted = value;
          if (options.insertThrows) throw new Error('transport_lost');
          return { error: options.insertError ? { message: 'insert_failed' } : null };
        },
      };
      return query;
    },
  };
  const image = {
    metadata: async () => ({ format: 'png', width: 10, height: 10 }),
    rotate() { return image; }, resize() { return image; }, webp() { return image; },
    toBuffer: async () => ({ data: Buffer.alloc(128), info: { width: 10, height: 10 } }),
  };
  const dependencies = {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: {
      user: options.anonymous ? null : { id: owner, identities: [{ provider: options.passwordOnly ? 'email' : 'google' }] },
    } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/media/spaces': {
      writePrivateMediaObject: async (value) => writes.push(value),
      deleteMediaObject: async (key) => deletes.push(key),
      getPrivateMediaBucketName: () => 'private-test',
    },
    sharp: () => image,
  };
  const source = readFileSync(new URL('../app/api/onboarding/media/route.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', output)((name) => Object.hasOwn(dependencies, name) ? dependencies[name] : nativeRequire(name), loaded, loaded.exports);
  return { POST: loaded.exports.POST, writes, deletes, queries, get inserted() { return inserted; } };
}
function request(overrides = {}) {
  return new Request('https://preview.example/api/onboarding/media', { method: 'POST',
    headers: { origin: 'https://preview.example', 'x-draft-id': draftId, 'content-type': 'image/png', ...overrides },
    body: new Uint8Array(64),
  });
}

test('private upload checks same origin, Google identity and draft ownership before writing', async () => {
  for (const [options, headers, expected] of [
    [{}, { origin: 'https://evil.example' }, 403], [{ anonymous: true }, {}, 401],
    [{ passwordOnly: true }, {}, 401], [{ missingDraft: true }, {}, 404],
  ]) {
    const route = loadRoute(options);
    assert.equal((await route.POST(request(headers))).status, expected);
    assert.equal(route.writes.length, 0);
  }
});

test('successful upload stores transcoded bytes in owner/draft namespace and registers only private metadata', async () => {
  const route = loadRoute();
  const response = await route.POST(request());
  assert.equal(response.status, 201);
  assert.equal(route.writes.length, 1);
  assert.match(route.writes[0].objectKey, new RegExp(`^onboarding/${owner}/${draftId}/`));
  assert.equal(route.inserted.owner_id, owner);
  assert.equal(route.inserted.draft_id, draftId);
  assert.equal(route.inserted.bucket, 'private-test');
  assert.equal(Object.hasOwn(route.inserted, 'public_url'), false);
  assert.deepEqual(route.queries[0].filters, [['id', draftId], ['user_id', owner], ['status', 'draft']]);
});

test('lost insert acknowledgement reconciles a committed image without deleting it', async () => {
  for (const failure of [{ insertError: true }, { insertThrows: true }]) {
    const route = loadRoute({ ...failure, committed: true });
    assert.equal((await route.POST(request())).status, 201);
    assert.equal(route.deletes.length, 0);
    assert.deepEqual(route.queries[1].filters, [['id', route.inserted.id], ['owner_id', owner], ['draft_id', draftId]]);
  }
});

test('unknown commit state retains bytes, only confirmed absent registry permits precise cleanup', async () => {
  const unknown = loadRoute({ insertError: true, reconciliationError: true });
  assert.equal((await unknown.POST(request())).status, 503);
  assert.equal(unknown.deletes.length, 0);
  const absent = loadRoute({ insertError: true });
  assert.equal((await absent.POST(request())).status, 503);
  assert.deepEqual(absent.deletes, [absent.writes[0].objectKey]);
});

test('stream length is enforced even with a false Content-Length header', async () => {
  const route = loadRoute();
  const oversized = new Request('https://preview.example/api/onboarding/media', { method: 'POST', headers: {
    origin: 'https://preview.example', 'x-draft-id': draftId, 'content-type': 'image/png', 'content-length': '10',
  }, body: new Uint8Array(3 * 1024 * 1024 + 1) });
  assert.equal((await route.POST(oversized)).status, 413);
  assert.equal(route.writes.length, 0);
});
