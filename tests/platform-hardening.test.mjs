import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('security headers cover framing, MIME confusion, transport, and external integrations', () => {
  const config = read('next.config.ts');
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ]) {
    assert.match(config, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(config, /X-Content-Type-Options['"], value: 'nosniff'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(config, /https:\/\/\*\.digitaloceanspaces\.com/);
  assert.match(config, /process\.env\.NODE_ENV === 'development'[\s\S]{0,80}'unsafe-eval'/);
});

test('Sentry captures failures without replay, default PII, HTTP bodies, or console-log shipping', () => {
  for (const file of [
    'instrumentation-client.ts',
    'sentry.server.config.ts',
    'sentry.edge.config.ts',
  ]) {
    const source = read(file);
    assert.match(source, /sendDefaultPii:\s*false/);
    assert.match(source, /httpBodies:\s*\[\]/);
    assert.doesNotMatch(source, /enableLogs:\s*true|replayIntegration|Replay/);
  }
});
