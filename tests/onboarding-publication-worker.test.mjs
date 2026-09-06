import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1); const draftId = id(2); const workspaceId = id(3); const requestId = id(4);
const bytes = Buffer.alloc(128, 23);
const checksum = createHash('sha256').update(bytes).digest('hex');
function load(relative, dependencies) {
  const output = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', output)((key) => Object.hasOwn(dependencies, key) ? dependencies[key] : nativeRequire(key), loaded, loaded.exports);
  return loaded.exports;
}

function setup(options = {}) {
  const job = { id: id(5), token: id(6), draftId, assets: Array.from({ length: options.assetCount ?? 1 }, (_, i) => ({
    id: id(10 + i), key: `onboarding/${owner}/${draftId}/${id(10 + i)}.webp`, sha256: checksum,
  })) };
  options.mutateJob?.(job);
  const reads = []; const writes = []; const calls = [];
  let suspended = Boolean(options.suspended); let stolen = false;
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'claim_onboarding_publication_job') return { data: options.noJob ? null : job, error: options.claimError ? {} : null };
      if (options.finishThrows) throw new Error('network');
      return { data: null, error: options.finishError ? {} : null };
    },
    from(table) {
      const filters = [];
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          if (table === 'onboarding_publication_jobs') {
            if (filters.some(([key, value]) => key === 'status' && value === 'complete')) {
              return { data: options.committed ? { id: job.id } : null, error: options.reconcileError ? {} : null };
            }
            return { data: { draft_id: draftId, workspace_id: workspaceId, status: 'processing',
              lease_token: stolen ? id(999) : job.token,
              lease_until: new Date(Date.now() + (options.expired ? -1000 : 120000)).toISOString(),
            }, error: null };
          }
          if (table === 'onboarding_drafts') return { data: { user_id: owner, request_id: requestId, status: 'submitted' }, error: null };
          if (table === 'activity_workspaces') return { data: suspended ? null : { id: workspaceId }, error: null };
          if (table === 'account_requests') return { data: options.requestPending ? null : { id: requestId }, error: null };
          throw new Error(`unexpected_table:${table}`);
        },
      };
      return query;
    },
  };
  const worker = load('../lib/onboarding/publication-worker.ts', {
    'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/media/spaces': {
      getPublicMediaUrl: key => `https://cdn.example/${key}`,
      readPrivateMediaObject: async (key, max) => {
        reads.push({ key, max });
        if (options.suspendDuringRead) suspended = true;
        if (options.stealLeaseDuringRead) stolen = true;
        return options.corruptLast && reads.length === job.assets.length ? Buffer.alloc(128, 99) : bytes;
      },
      writePublicMediaObject: async (value) => {
        writes.push(value);
        if (options.suspendDuringWrite) suspended = true;
        if (options.writeError) throw new Error('storage_unavailable');
      },
    },
  });
  return { ...worker, reads, writes, calls, job };
}

test('empty queue performs no storage work; failed claim is not treated as an empty queue', async () => {
  const empty = setup({ noJob: true });
  assert.deepEqual(await empty.processOnboardingPublication(), { completed: 0 });
  assert.equal(empty.reads.length + empty.writes.length, 0);
  await assert.rejects(setup({ claimError: true }).processOnboardingPublication(), /claim_failed/);
});

test('unapproved request, suspended workspace and expired lease cannot copy private bytes', async () => {
  for (const options of [{ requestPending: true }, { suspended: true }, { expired: true }]) {
    const worker = setup(options);
    await assert.rejects(worker.processOnboardingPublication());
    assert.equal(worker.reads.length, 0);
    assert.equal(worker.writes.length, 0);
  }
});

test('owner/draft/asset path binding and duplicate asset IDs fail before storage reads', async () => {
  for (const mutateJob of [
    job => { job.assets[0].key = `onboarding/${id(99)}/${draftId}/${job.assets[0].id}.webp`; },
    job => { job.assets[0].key = `onboarding/${owner}/${draftId}/${id(99)}.webp`; },
    job => { job.assets.push(job.assets[0]); },
  ]) {
    const worker = setup({ mutateJob });
    await assert.rejects(worker.processOnboardingPublication());
    assert.equal(worker.reads.length + worker.writes.length, 0);
  }
});

test('all image hashes are verified before any public copy, including later batches', async () => {
  const worker = setup({ assetCount: 4, corruptLast: true });
  await assert.rejects(worker.processOnboardingPublication(), /checksum_mismatch/);
  assert.equal(worker.reads.length, 4);
  assert.equal(worker.writes.length, 0);
});

test('suspension or lease replacement while reading prevents all public writes', async () => {
  for (const options of [{ suspendDuringRead: true }, { stealLeaseDuringRead: true }]) {
    const worker = setup(options);
    await assert.rejects(worker.processOnboardingPublication());
    assert.equal(worker.writes.length, 0);
  }
});

test('stable full-checksum keys preserve gallery order on success and retry', async () => {
  const first = setup({ assetCount: 4 }); const retry = setup({ assetCount: 4 });
  assert.deepEqual(await first.processOnboardingPublication(), { completed: 1 });
  await retry.processOnboardingPublication();
  assert.deepEqual(first.writes.map(item => item.objectKey), retry.writes.map(item => item.objectKey));
  assert.equal(first.writes[0].objectKey, `directory/onboarding/${draftId}/${id(10)}-${checksum}.webp`);
  assert.deepEqual(first.calls.at(-1).args.p_urls, first.writes.map(item => `https://cdn.example/${item.objectKey}`));
});

test('late suspension blocks directory finalization; already-public copies need external revocation policy', async () => {
  const worker = setup({ suspendDuringWrite: true });
  await assert.rejects(worker.processOnboardingPublication(), /not_approved/);
  assert.equal(worker.writes.length, 1);
  assert.equal(worker.calls.filter(call => call.name === 'finish_onboarding_publication_job').length, 0);
});

test('finish acknowledgement loss reconciles completion; unknown outcome stays retryable without cleanup', async () => {
  for (const options of [{ finishError: true }, { finishThrows: true }]) {
    const committed = setup({ ...options, committed: true });
    assert.deepEqual(await committed.processOnboardingPublication(), { completed: 1 });
    const unknown = setup({ ...options, reconcileError: true });
    await assert.rejects(unknown.processOnboardingPublication(), /complete_failed/);
  }
});

function reviewRoute(options = {}) {
  const guardCalls = []; const queries = []; const reads = [];
  const assetId = id(10);
  const asset = { owner_id: owner, draft_id: draftId, object_key: `onboarding/${owner}/${draftId}/${assetId}.webp`,
    sha256: checksum, content_type: 'image/webp', ...options.asset };
  const admin = {
    from(table) {
      const filters = [];
      const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
        not() { return query; }, async maybeSingle() {
          queries.push({ table, filters });
          if (table === 'onboarding_media_assets') return { data: asset, error: null };
          if (table === 'onboarding_drafts') return { data: options.unsent ? null : { request_id: requestId }, error: null };
          if (table === 'account_requests') return { data: { place_images: options.newUnsentImage ? [] : [`dairtak-upload:${assetId}`] }, error: null };
          throw new Error('unexpected_table');
        } };
      return query;
    },
  };
  const route = load('../app/api/onboarding/review-media/[assetId]/route.ts', {
    '@/lib/admin/marketplace-memberships': { requireMarketplaceAdminRole: async (...args) => {
      guardCalls.push(args); if (options.deny) throw new Error(options.deny);
    } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/media/spaces': { readPrivateMediaObject: async (key) => { reads.push(key); return options.corrupt ? Buffer.alloc(128, 99) : bytes; } },
  });
  return { ...route, guardCalls, queries, reads, context: { params: Promise.resolve({ assetId }) } };
}

test('review images require super-admin guard with MFA failure closed before privileged reads', async () => {
  for (const deny of ['admin_mfa_required', 'admin_role_required', 'admin_access_required']) {
    const route = reviewRoute({ deny });
    assert.equal((await route.GET(new Request('https://preview.example'), route.context)).status, 403);
    assert.deepEqual(route.guardCalls, [[['super_admin'], { failureMode: 'throw' }]]);
    assert.equal(route.queries.length + route.reads.length, 0);
  }
});

test('review route denies unsent drafts and new unsent images after rejected request', async () => {
  for (const options of [{ unsent: true }, { newUnsentImage: true }, { asset: { object_key: 'onboarding/../../private.webp' } }]) {
    const route = reviewRoute(options);
    assert.equal((await route.GET(new Request('https://preview.example'), route.context)).status, 404);
    assert.equal(route.reads.length, 0);
  }
});

test('submitted review image is integrity checked and never cacheable or cross-origin readable', async () => {
  const route = reviewRoute();
  const response = await route.GET(new Request('https://preview.example'), route.context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(route.queries[2].filters, [['id', requestId], ['auth_user_id', owner]]);
  const corrupt = reviewRoute({ corrupt: true });
  assert.equal((await corrupt.GET(new Request('https://preview.example'), corrupt.context)).status, 503);
});
