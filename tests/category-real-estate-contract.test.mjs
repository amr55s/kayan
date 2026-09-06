import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CATEGORIES } from '../lib/constants.ts';
import {
  CATEGORIES_CONFIG,
  CATEGORY_OPTIONS,
  getCategoryLabel,
  getCategoryColor,
  getListingDescriptionLabel,
  getListingImageLabel,
} from '../lib/categories.ts';
import {
  getListingProfile,
  getListingFormProfileKey,
  isRealEstateCategory,
  isRoomsFieldRequired,
  REAL_ESTATE_PROPERTY_TYPES,
  REAL_ESTATE_OFFER_TYPES,
  REAL_ESTATE_FURNISHING_OPTIONS,
} from '../lib/listings/config.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('real_estate is centralized in CATEGORIES and services does not mention real estate', () => {
  const realEstate = CATEGORIES.find((cat) => cat.id === 'real_estate');
  assert.ok(realEstate, 'real_estate category must exist in CATEGORIES');
  assert.equal(realEstate.label, 'عقارات');
  assert.equal(realEstate.subtitle, 'إيجار وتمليك');
  assert.equal(realEstate.emoji, '🏠');
  assert.ok(realEstate.icon, 'real_estate must have a valid Lucide icon component');

  const services = CATEGORIES.find((cat) => cat.id === 'services');
  assert.ok(services, 'services category must exist in CATEGORIES');
  assert.doesNotMatch(
    services.subtitle,
    /عقار|عقارات/,
    'services subtitle must not contain the word عقارات',
  );

  const constantsSource = read('lib/constants.ts');
  assert.match(constantsSource, /id:\s*'real_estate'/);
  assert.doesNotMatch(constantsSource, /subtitle:\s*['"][^'"]*عقارات[^'"]*['"][\s\S]*id:\s*'services'/);
});

test('CategoryType in types/index.ts includes real_estate and exports real estate contracts', () => {
  const typesSource = read('types/index.ts');
  assert.match(typesSource, /\|\s*'real_estate'/);
  assert.match(typesSource, /RealEstateDetailsDraft/);
  assert.match(typesSource, /RealEstatePropertyType/);
  assert.match(typesSource, /RealEstateOfferType/);
});

test('lib/categories.ts correctly integrates real_estate and delegates labels to central config', () => {
  const realEstateConfig = CATEGORIES_CONFIG.find((c) => c.id === 'real_estate');
  assert.ok(realEstateConfig, 'real_estate must be in CATEGORIES_CONFIG');
  assert.equal(realEstateConfig.label, 'عقارات');

  const realEstateOption = CATEGORY_OPTIONS.find((c) => c.id === 'real_estate');
  assert.ok(realEstateOption, 'real_estate must be in CATEGORY_OPTIONS');
  assert.match(realEstateOption.label, /عقارات/);

  assert.equal(getCategoryLabel('real_estate'), 'عقارات');
  assert.equal(getCategoryColor('real_estate'), 'primary');

  assert.equal(
    getListingDescriptionLabel('real_estate'),
    'وصف العقار ومواصفات التشطيب',
  );
  assert.equal(
    getListingImageLabel('real_estate'),
    'صور العقار',
  );
  assert.equal(
    getListingDescriptionLabel('stores'),
    'أهم المنتجات والماركات ونطاق الأسعار',
  );
  assert.equal(
    getListingImageLabel('stores'),
    'صور المنتجات والمتجر',
  );
  assert.equal(
    getListingDescriptionLabel('restaurants'),
    'قائمة المأكولات ومواعيد العمل',
  );
  assert.equal(
    getListingImageLabel('restaurants'),
    'صور المنيو والمكان',
  );
});

test('central listing profiles enforce image bounds and feature flags per domain category', () => {
  // 1. Real Estate Profile (min 5, max 7)
  const realEstateProfile = getListingProfile('real_estate');
  assert.equal(realEstateProfile.profileKey, 'real_estate');
  assert.equal(realEstateProfile.imagePolicy.min, 5);
  assert.equal(realEstateProfile.imagePolicy.max, 7);
  assert.equal(realEstateProfile.features.isRealEstate, true);
  assert.equal(realEstateProfile.features.hasPayment, false);
  assert.equal(realEstateProfile.features.hasCommunityLinks, false);
  assert.equal(isRealEstateCategory('real_estate'), true);
  assert.equal(isRealEstateCategory('services'), false);

  // 2. Store Profile (min 1, max 3)
  const storeProfile = getListingProfile('stores');
  assert.equal(storeProfile.profileKey, 'store');
  assert.equal(storeProfile.imagePolicy.min, 1);
  assert.equal(storeProfile.imagePolicy.max, 3);
  assert.equal(storeProfile.features.isStore, true);
  assert.equal(storeProfile.features.hasPayment, true);

  // 3. Restaurant Profile (min 1, max 3)
  const restaurantProfile = getListingProfile('restaurants');
  assert.equal(restaurantProfile.profileKey, 'restaurant_or_cafe');
  assert.equal(restaurantProfile.imagePolicy.min, 1);
  assert.equal(restaurantProfile.imagePolicy.max, 3);
  assert.equal(restaurantProfile.features.isRestaurantOrCafe, true);

  // 4. Home Made Profile (min 1, max 3)
  const homeMadeProfile = getListingProfile('home_made');
  assert.equal(homeMadeProfile.profileKey, 'restaurant_or_cafe');
  assert.equal(homeMadeProfile.imagePolicy.min, 1);
  assert.equal(homeMadeProfile.imagePolicy.max, 3);

  // 5. Service Profile (min 1, max 3)
  const serviceProfile = getListingProfile('services');
  assert.equal(serviceProfile.profileKey, 'library_or_service');
  assert.equal(serviceProfile.imagePolicy.min, 1);
  assert.equal(serviceProfile.imagePolicy.max, 3);
  assert.equal(serviceProfile.features.isLibraryOrService, true);

  // 6. Default Profile (min 1, max 3)
  const defaultProfile = getListingProfile('pharmacy');
  assert.equal(defaultProfile.profileKey, 'default');
  assert.equal(defaultProfile.imagePolicy.min, 1);
  assert.equal(defaultProfile.imagePolicy.max, 3);
});

test('real estate domain constraints and room requirement rules are strictly defined', () => {
  assert.equal(isRoomsFieldRequired('apartment'), true);
  assert.equal(isRoomsFieldRequired('villa'), true);
  assert.equal(isRoomsFieldRequired('house'), true);
  assert.equal(isRoomsFieldRequired('land'), false);
  assert.equal(isRoomsFieldRequired('shop'), false);
  assert.equal(isRoomsFieldRequired('office'), false);
  assert.equal(isRoomsFieldRequired('other'), true);

  assert.deepEqual(
    REAL_ESTATE_OFFER_TYPES.map((o) => o.id),
    ['rent', 'sale'],
  );
  assert.ok(REAL_ESTATE_PROPERTY_TYPES.some((p) => p.id === 'apartment'));
  assert.ok(REAL_ESTATE_PROPERTY_TYPES.some((p) => p.id === 'villa'));
  assert.ok(REAL_ESTATE_PROPERTY_TYPES.some((p) => p.id === 'land'));
  assert.ok(REAL_ESTATE_PROPERTY_TYPES.some((p) => p.id === 'shop'));
  assert.ok(REAL_ESTATE_PROPERTY_TYPES.some((p) => p.id === 'office'));
  assert.deepEqual(
    REAL_ESTATE_FURNISHING_OPTIONS.map((f) => f.id),
    ['furnished', 'semi_furnished', 'unfurnished'],
  );
});

test('/services route includes real_estate in its categories list', () => {
  const servicesPageSource = read('app/services/page.tsx');
  assert.match(servicesPageSource, /\['real_estate',\s*'عقارات'\]/);
});
