import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('AddListingModal integrates dynamic category profiles and RealEstateListingFields', () => {
  const modalSource = read('components/modals/AddListingModal.tsx');
  const realEstateFieldsSource = read('components/modals/RealEstateListingFields.tsx');

  // Real estate component integration
  assert.match(modalSource, /RealEstateListingFields/);
  assert.match(modalSource, /isRealEstate/);
  assert.match(modalSource, /realEstateDraft/);

  // Profile guidance banners
  assert.match(modalSource, /نموذج العقارات:/);
  assert.match(modalSource, /متجر ومنتجات:/);
  assert.match(modalSource, /مطاعم ومأكولات:/);
  assert.match(modalSource, /خدمات ومكاتب:/);

  // Dynamic submit button
  assert.match(modalSource, /isRealEstate \? 'إرسال إعلان العقار' : 'إرسال طلب الحساب'/);

  // RealEstateListingFields accessible controls
  assert.match(realEstateFieldsSource, /role="radiogroup"/);
  assert.match(realEstateFieldsSource, /inputMode="numeric"/);
  assert.match(realEstateFieldsSource, /priceEgp/);
  assert.match(realEstateFieldsSource, /isRoomsFieldRequired/);
});

test('AddListingModal enforces 5-7 images for real estate and 1-3 for standard categories', () => {
  const modalSource = read('components/modals/AddListingModal.tsx');

  // Image limits from config
  assert.match(modalSource, /minImages = profile\.imagePolicy\.min/);
  assert.match(modalSource, /maxImages = profile\.imagePolicy\.max/);
  assert.match(modalSource, /isRealEstate\s*\?\s*`يمكن رفع \${maxImages} صور كحد أقصى للعقارات/);
  assert.match(modalSource, /يجب رفع من 5 إلى 7 صور للعقار قبل إرسال الطلب/);

  // Cover image management
  assert.match(modalSource, /صورة الغلاف/);
  assert.match(modalSource, /makeCoverImage/);
  assert.match(modalSource, /اجعلها الغلاف/);
});

test('AddListingModal manages WhatsApp sync toggle and contact validation', () => {
  const modalSource = read('components/modals/AddListingModal.tsx');

  assert.match(modalSource, /whatsappSameAsPhone/);
  assert.match(modalSource, /رقم واتساب هو نفس رقم التواصل الأساسي/);
  assert.match(modalSource, /effectiveWhatsapp = whatsappSameAsPhone \? phone : whatsapp/);
});

test('AddListingModal isolates real estate payload and respects backend boundary', () => {
  const modalSource = read('components/modals/AddListingModal.tsx');

  // Clean realEstatePayload construction
  assert.match(modalSource, /realEstatePayload = isRealEstate/);
  assert.match(modalSource, /offerType: realEstateDraft\.offerType/);
  assert.match(modalSource, /propertyType: realEstateDraft\.propertyType/);
  assert.match(modalSource, /priceEgp: realEstateDraft\.priceEgp/);

  // The approved request forwards the typed payload to the server boundary.
  assert.match(modalSource, /realEstateDetails: realEstatePayload/);

  // Omission of payment & community links for real estate
  assert.match(modalSource, /profile\.features\.hasPayment/);
  assert.match(modalSource, /profile\.features\.hasCommunityLinks/);
});

test('AddListingModal resetForm and hasUnsavedChanges cover all real estate and category fields', () => {
  const modalSource = read('components/modals/AddListingModal.tsx');

  assert.match(modalSource, /setRealEstateDraft\(INITIAL_REAL_ESTATE_DRAFT\)/);
  assert.match(modalSource, /setWhatsappSameAsPhone\(true\)/);
  assert.match(modalSource, /realEstateDraft\.priceEgp/);
  assert.match(modalSource, /realEstateDraft\.rooms/);
  assert.match(modalSource, /realEstateDraft\.areaSqm/);
});
