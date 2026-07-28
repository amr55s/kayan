import assert from 'node:assert/strict';
import test from 'node:test';
import {
  placeDetailsValidators,
  validatePlaceDetails,
} from '../lib/place-details.ts';

test('accepts official WhatsApp and Telegram community URLs', () => {
  assert.equal(
    placeDetailsValidators.whatsappGroup('https://chat.whatsapp.com/AbCdEf123'),
    true,
  );
  assert.equal(
    placeDetailsValidators.whatsappGroup('https://www.whatsapp.com/channel/0029VaExample'),
    true,
  );
  assert.equal(placeDetailsValidators.telegram('https://t.me/kayan_group'), true);
  assert.equal(
    placeDetailsValidators.telegram('https://telegram.me/kayan_group'),
    true,
  );
});

test('accepts supported map providers without embedding a paid map API', () => {
  assert.equal(placeDetailsValidators.map('https://maps.app.goo.gl/example'), true);
  assert.equal(placeDetailsValidators.map('https://www.google.com/maps/place/Kayan'), true);
  assert.equal(placeDetailsValidators.map('https://maps.apple.com/?q=Kayan'), true);
  assert.equal(placeDetailsValidators.map('https://www.openstreetmap.org/#map=17/30/31'), true);
});

test('rejects unsafe protocols, lookalike hosts, credentials, and custom ports', () => {
  const invalid = [
    'javascript:alert(1)',
    'http://chat.whatsapp.com/example',
    'https://chat.whatsapp.com.evil.test/example',
    'https://t.me.evil.test/example',
    'https://www.google.com.evil.test/maps',
    'https://user:pass@maps.apple.com/?q=x',
    'https://maps.apple.com:444/?q=x',
  ];
  for (const value of invalid) {
    assert.equal(placeDetailsValidators.whatsappGroup(value), false);
    assert.equal(placeDetailsValidators.telegram(value), false);
    assert.equal(placeDetailsValidators.map(value), false);
  }
});

test('normalizes empty optional place details to null', () => {
  assert.deepEqual(
    validatePlaceDetails({
      whatsappGroupUrl: ' ',
      telegramUrl: '',
      address: '  ',
      mapUrl: null,
    }),
    {
      whatsappGroupUrl: null,
      telegramUrl: null,
      address: null,
      mapUrl: null,
    },
  );
});

test('enforces the address length limit', () => {
  assert.throws(() => validatePlaceDetails({ address: 'x'.repeat(501) }));
});
