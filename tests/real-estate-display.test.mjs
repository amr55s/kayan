import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  formatEgpPrice,
  getRealEstateDetails,
  getRealEstateOfferTypeLabel,
  getRealEstatePropertyTypeLabel,
  getRealEstateFurnishingLabel,
  isRealEstateCategory,
} from '../lib/listings/config.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('formatEgpPrice formats price safely with Arabic localization and rent periodicity', () => {
  assert.equal(formatEgpPrice(''), '');
  assert.equal(formatEgpPrice(null), '');
  assert.equal(formatEgpPrice(undefined), '');
  assert.equal(formatEgpPrice('abc'), '');
  assert.equal(formatEgpPrice(-500), '');

  const rentFormatted = formatEgpPrice('2500', 'rent');
  assert.match(rentFormatted, /ج\.م \/ شهر/);
  assert.match(rentFormatted, /2|٢/);

  const saleFormatted = formatEgpPrice('1500000', 'sale');
  assert.match(saleFormatted, /ج\.م/);
  assert.doesNotMatch(saleFormatted, /شهر/);
  assert.match(saleFormatted, /1|١/);
});

test('getRealEstateDetails safely extracts details or returns null', () => {
  const realEstatePlace = {
    id: 'place-1',
    title: 'شقة للإيجار',
    category: 'real_estate',
    phone: '01000000001',
    images: ['https://example.com/1.jpg'],
    is_featured: false,
    created_at: '2026-08-29',
    real_estate_details: {
      offerType: 'rent',
      propertyType: 'apartment',
      priceEgp: '3500',
      rooms: '3',
      bathrooms: '1',
      areaSqm: '120',
      floor: '2',
      furnishing: 'unfurnished',
    },
  };

  const details = getRealEstateDetails(realEstatePlace);
  assert.ok(details, 'Should return real estate details draft');
  assert.equal(details.offerType, 'rent');
  assert.equal(details.propertyType, 'apartment');
  assert.equal(details.priceEgp, '3500');
  assert.equal(details.rooms, '3');

  // Legacy place row with no real_estate_details
  const legacyPlace = {
    id: 'place-legacy',
    title: 'مكتب عقارات قديم',
    category: 'real_estate',
    phone: '01000000002',
    images: [],
    is_featured: false,
    created_at: '2026-08-29',
  };
  assert.equal(getRealEstateDetails(legacyPlace), null, 'Legacy rows should return null gracefully');

  // Non-real estate place
  const storePlace = {
    id: 'place-store',
    title: 'متجر ملابس',
    category: 'stores',
    phone: '01000000003',
    images: [],
    is_featured: false,
    created_at: '2026-08-29',
    real_estate_details: {
      offerType: 'sale',
      propertyType: 'shop',
      priceEgp: '100000',
    },
  };
  assert.equal(getRealEstateDetails(storePlace), null, 'Non real estate category must return null');
  assert.equal(getRealEstateDetails(null), null);
  assert.equal(getRealEstateDetails(undefined), null);
});

test('Real estate label helpers return accurate localized Arabic strings', () => {
  assert.equal(getRealEstateOfferTypeLabel('rent'), 'إيجار');
  assert.equal(getRealEstateOfferTypeLabel('sale'), 'تمليك / بيع');
  assert.equal(getRealEstatePropertyTypeLabel('apartment'), 'شقة');
  assert.equal(getRealEstatePropertyTypeLabel('villa'), 'فيلا');
  assert.equal(getRealEstatePropertyTypeLabel('house'), 'منزل / بيت');
  assert.equal(getRealEstatePropertyTypeLabel('shop'), 'محل تجاري');
  assert.equal(getRealEstatePropertyTypeLabel('office'), 'مكتب / عيادة');
  assert.equal(getRealEstatePropertyTypeLabel('land'), 'أرض');
  assert.equal(getRealEstateFurnishingLabel('furnished'), 'مفروش');
  assert.equal(getRealEstateFurnishingLabel('semi_furnished'), 'نصف مفروش');
  assert.equal(getRealEstateFurnishingLabel('unfurnished'), 'غير مفروش');
  assert.equal(isRealEstateCategory('real_estate'), true);
  assert.equal(isRealEstateCategory('stores'), false);
});

test('PlaceCard component adheres to real estate UX and suppresses payment/coupons', () => {
  const cardSource = read('components/directory/PlaceCard.tsx');
  assert.match(cardSource, /isRealEstate/);
  assert.match(cardSource, /getRealEstateDetails/);
  assert.match(cardSource, /formatEgpPrice/);
  assert.match(cardSource, /\{!isRealEstate\s*&&\s*<CouponOffer/);
  assert.match(cardSource, /\{!isRealEstate\s*&&\s*place\.instapay_vfcash/);
  assert.match(cardSource, /بخصوص عقار/);
});

test('PlaceDetailsModal adheres to real estate gallery, specs grid, and privacy boundaries', () => {
  const modalSource = read('components/directory/PlaceDetailsModal.tsx');
  assert.match(modalSource, /صورة الغلاف/);
  assert.match(modalSource, /مواصفات العقار/);
  assert.match(modalSource, /نوع العرض/);
  assert.match(modalSource, /نوع العقار/);
  assert.match(modalSource, /المساحة/);
  assert.match(modalSource, /الدور \/ الطابق/);
  assert.match(modalSource, /حالة الفرش/);
  assert.match(modalSource, /const hasCommunity\s*=\s*!isRealEstate/);
  assert.match(modalSource, /\{!isRealEstate\s*&&\s*place\.instapay_vfcash/);
  assert.match(modalSource, /بخصوص عقار/);
});

test('DirectoryView filters real_estate within directory and does not redirect to marketplace', () => {
  const directorySource = read('components/directory/DirectoryView.tsx');
  assert.match(directorySource, /if\s*\(cat\s*===\s*'stores'\)\s*\{[\s\S]*router\.push\('\/marketplace'\);/);
  assert.doesNotMatch(directorySource, /cat\s*===\s*'real_estate'[\s\S]*router\.push\('\/marketplace'\);/);
});
