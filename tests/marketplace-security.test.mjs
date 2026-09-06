import assert from 'node:assert/strict';
import test from 'node:test';

import { safeNextPath } from '../lib/auth/safe-next.ts';
import {
  databaseMinorToNumber,
  egpToMinor,
  minorToEgp,
} from '../lib/commerce/money.ts';

test('OAuth continuation accepts only app-local destinations', () => {
  assert.equal(safeNextPath('/marketplace/cart?from=login'), '/marketplace/cart?from=login');
  assert.equal(safeNextPath('/marketplace/products/item#details'), '/marketplace/products/item#details');

  for (const malicious of [
    '//attacker.example/path',
    '/\\attacker.example/path',
    '\\attacker.example/path',
    'https://attacker.example/path',
    '/marketplace\u0000/checkout',
  ]) {
    assert.equal(safeNextPath(malicious), '/marketplace');
  }
});

test('OAuth continuation has a bounded input size', () => {
  assert.equal(safeNextPath(`/${'a'.repeat(600)}`), '/marketplace');
});

test('EGP values cross the database boundary without floating-point drift', () => {
  assert.equal(egpToMinor('129.05'), 12_905);
  assert.equal(egpToMinor(129.05), 12_905);
  assert.equal(minorToEgp(12_905), '129.05');
  assert.throws(() => egpToMinor('-1.00'), /invalid_egp_amount/);
  assert.throws(() => egpToMinor('1.005'), /invalid_egp_amount/);
  assert.equal(databaseMinorToNumber(12_905), 12_905);
  assert.equal(databaseMinorToNumber('12905'), 12_905);
  assert.throws(() => databaseMinorToNumber('129.05'), /invalid_minor_amount/);
});
