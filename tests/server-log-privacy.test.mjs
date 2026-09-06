import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  logSafeServerFailure,
  safeServerFailureCode,
} from '../lib/observability/server-log.ts';

const root = new URL('../', import.meta.url);

async function sourceFiles(relativeDirectory) {
  const directory = new URL(`${relativeDirectory}/`, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (relativePath.startsWith('app/api/cron/')) continue;
    if (relativePath.endsWith('/catalog-image-worker.ts')) continue;
    if (entry.isDirectory()) files.push(...await sourceFiles(relativePath));
    else if (/\.(?:ts|tsx)$/u.test(entry.name)) files.push(relativePath);
  }
  return files;
}

async function activeServerSources() {
  const recursive = await Promise.all([
    sourceFiles('app/api'),
    sourceFiles('app/auth'),
    sourceFiles('lib/auth'),
    sourceFiles('lib/commerce'),
  ]);
  const exact = [
    'lib/operations/actions.ts',
    'lib/supabase/actions.ts',
    'lib/supabase/admin-actions.ts',
    'lib/supabase/queries.ts',
    'app/admin/page.tsx',
  ];
  return [...new Set([...recursive.flat(), ...exact])];
}

function consoleCalls(source) {
  const calls = [];
  const startPattern = /console\.(?:error|warn|info|log|debug)\s*\(/gu;
  for (const match of source.matchAll(startPattern)) {
    const end = source.indexOf(';', match.index);
    calls.push(source.slice(match.index, end === -1 ? source.length : end + 1));
  }
  return calls;
}

test('safe failure codes never serialize messages, PII, identifiers, or secrets', () => {
  assert.equal(
    safeServerFailureCode({
      code: '42501',
      message: 'customer 01012345678 user@example.com',
      details: 'secret database row',
    }),
    '42501',
  );
  assert.equal(safeServerFailureCode(new Error('media_size_mismatch')), 'media_size_mismatch');
  assert.equal(safeServerFailureCode(new Error('user@example.com cannot sign in')), 'unknown_error');
  assert.equal(safeServerFailureCode('01012345678'), 'unknown_error');
  assert.equal(
    safeServerFailureCode('550e8400-e29b-41d4-a716-446655440000'),
    'unknown_error',
  );
  assert.equal(
    safeServerFailureCode('a'.repeat(48)),
    'unknown_error',
  );
  assert.equal(safeServerFailureCode('sk_live_customersecret'), 'unknown_error');
  assert.equal(safeServerFailureCode('AKIAIOSFODNN7EXAMPLE'), 'unknown_error');
});

test('safe server logger emits only the approved operational envelope', () => {
  const output = [];
  const original = console.error;
  console.error = (value) => output.push(value);
  try {
    logSafeServerFailure('error', 'checkout_failed', {
      failure: new Error('customer user@example.com could not checkout'),
      requestId: 'fra1::safe-request-123',
      attempt: 2,
    });
  } finally {
    console.error = original;
  }

  assert.deepEqual(JSON.parse(output[0]), {
    level: 'error',
    event: 'checkout_failed',
    failureCode: 'unknown_error',
    requestId: 'fra1::safe-request-123',
    attempt: 2,
  });
  assert.doesNotMatch(output[0], /customer|example\.com/u);
});

test('active server console calls do not receive raw error objects or fields', async () => {
  const files = await activeServerSources();
  const rawArgument = /,\s*(?:error|err|e|exception|reason|issues|cleanupError|deleteError|infoError|removeError)\s*[),]/u;
  const rawMember = /\b(?:error|err|exception|reason|cleanupError|deleteError|infoError|removeError)\.(?:message|details|hint|stack|issues|reason)\b/u;
  const rawObjectField = /\b(?:error|failure|reason|issues|details|hint|stack)\s*:\s*(?:error|err|e|exception|reason|issues|cleanupError|deleteError|infoError|removeError)\b/u;

  for (const file of files) {
    const source = await readFile(new URL(file, root), 'utf8');
    for (const call of consoleCalls(source)) {
      assert.doesNotMatch(call, rawArgument, `${file} passes a raw error value to console`);
      assert.doesNotMatch(call, rawMember, `${file} logs a raw error member`);
      assert.doesNotMatch(call, rawObjectField, `${file} embeds a raw error value in a log object`);
    }
  }
});
