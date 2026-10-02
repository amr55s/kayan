import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeEgyptMobile,
  validateOnboardingBasics,
  validateOnboardingContent,
  validateOnboardingForSubmit,
} from '../lib/onboarding/step-validation.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const store = { displayName: 'عمرو خالد', phone: '01010061997', name: 'متجر', description: 'وصف', address: 'شارع النخيل' };

test('basics mirror the database submission rules', () => {
  assert.equal(validateOnboardingBasics('store', store), null);
  assert.match(validateOnboardingBasics('store', { ...store, address: 'سيسي' }), /العنوان/u);
  assert.match(validateOnboardingBasics('store', { ...store, phone: '0101006199' }), /رقم موبايل/u);
  assert.match(validateOnboardingBasics('store', { ...store, whatsapp: '123' }), /واتساب/u);
  assert.match(validateOnboardingBasics('store', { ...store, displayName: 'ع' }), /اسمك/u);
  assert.equal(validateOnboardingBasics('store', { ...store, phone: '+20 101 006 1997' }), null);
  assert.equal(normalizeEgyptMobile('+20 101 006 1997'), '01010061997');
});

test('drivers need a vehicle and existing places need a selection', () => {
  const driver = { displayName: 'كابتن', phone: '01110000000' };
  assert.match(validateOnboardingBasics('driver', driver), /وسيلة التوصيل/u);
  assert.equal(validateOnboardingBasics('driver', { ...driver, vehicleType: 'motorcycle' }), null);
  assert.match(validateOnboardingBasics('restaurant', { ...driver, placeMode: 'existing' }), /اختر مكانك/u);
  assert.equal(
    validateOnboardingBasics('restaurant', { ...driver, placeMode: 'existing', existingPlaceId: '00000000-0000-4000-8000-000000000001' }),
    null,
  );
});

test('an optional first product must be complete or postponed', () => {
  assert.equal(validateOnboardingContent('store', store), null);
  assert.match(validateOnboardingContent('store', { ...store, product: { name: '', description: '', priceEgp: '10' } }), /اسم المنتج/u);
  assert.match(validateOnboardingContent('store', { ...store, product: { name: 'منتج', description: '', priceEgp: '٥٠' } }), /سعر المنتج/u);
  assert.match(validateOnboardingContent('store', { ...store, product: { name: 'منتج', description: '', priceEgp: '0' } }), /سعر المنتج/u);
  assert.equal(validateOnboardingContent('store', { ...store, product: { name: 'منتج', description: '', priceEgp: '149.50' } }), null);
});

test('real estate needs photos, a whole-number price and rooms for homes', () => {
  const photos = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`);
  const estate = { offerType: 'rent', propertyType: 'apartment', priceEgp: '8500', rooms: '3' };
  const listing = { ...store, realEstate: estate, mediaIds: photos };
  assert.equal(validateOnboardingContent('real_estate', listing), null);
  assert.match(validateOnboardingContent('real_estate', { ...listing, mediaIds: photos.slice(0, 2) }), /3 صور أخرى/u);
  assert.match(validateOnboardingContent('real_estate', { ...listing, realEstate: { ...estate, rooms: '' } }), /عدد الغرف/u);
  assert.match(validateOnboardingContent('real_estate', { ...listing, realEstate: { ...estate, priceEgp: '8,500' } }), /السعر/u);
  assert.equal(
    validateOnboardingContent('real_estate', { ...listing, realEstate: { offerType: 'sale', propertyType: 'land', priceEgp: '900000' } }),
    null,
  );
  assert.match(validateOnboardingForSubmit('real_estate', { ...listing, address: 'x' }), /العنوان/u);
});

test('the wizard validates each step and the submit action explains refusals', () => {
  const wizard = read('components/onboarding/onboarding-wizard.tsx');
  assert.match(wizard, /validateOnboardingBasics\(kind, current\.current\.data\)/u);
  assert.match(wizard, /validateOnboardingForSubmit\(kind, current\.current\.data\)/u);
  const actions = read('lib/onboarding/actions.ts');
  assert.match(actions, /phone_already_has_account/u);
  assert.match(actions, /activity_request_exists/u);
});

test('signed-in visitors can always sign out', () => {
  const button = read('components/auth/SignOutButton.tsx');
  assert.match(button, /auth\.signOut\(\{ scope: 'local' \}\)/u);
  assert.match(read('components/layout/Header.tsx'), /<SignOutButton/u);
  assert.match(read('components/onboarding/google-identity-summary.tsx'), /<SignOutButton/u);
});
