# وثيقة تسليم الواجهة الأمامية لقسم العقارات — Frontend Real Estate Handoff

تاريخ التسليم: 2026-08-29
حالة الواجهة الأمامية: مكتملة ومختبرة بنسبة 100% (Frontend Complete & Fully Validated)
حالة قاعدة البيانات: في انتظار تنفيذ الـ Backend Migrations & Database Operations (Pending Backend/DB Phase)

---

## 1. ملخص ما تم تنفيذه في مرحلة الـ Frontend

1. **فصل واستقلالية تصنيف العقارات (`real_estate`)**:
   - إضافة `real_estate` كقسم مركزي مستقل في `CategoryType` و`CATEGORIES` باسم «عقارات» وشعار أيقوني (`Building`) وعنوان فرعي «إيجار وتمليك».
   - تنظيف قسم `services` بالكامل بحذف كلمة «عقارات» من `subtitle` الخاص به ليصبح («طباعة، مكتبات، خدمات»).
   - ضبط ترتيب الأقسام ليكون «عقارات» آخر قسم بعد `services` مع شبكة استجابة مرنة (9 تصنيفات).
   - عزل التوجيه: الضغط على «عقارات» يفلتر الدليل محليًا ولا يُحوّل إلى `/marketplace` (المخصص حصريًا لـ `stores`).

2. **تجربة النماذج الديناميكية حسب النشاط (`AddListingModal.tsx` & `RealEstateListingFields.tsx`)**:
   - بناء بروفايلات حقول ذكية (`ListingProfileConfig`) تُظهر لكل نشاط حقوله ذات الصلة فقط.
   - قسم العقارات يعرض: نوع العرض (`rent` / `sale`)، نوع العقار (`apartment`, `villa`, `house`, `shop`, `office`, `land`)، السعر بالجنيه المصري (`priceEgp`)، عدد الغرف (إلزامي للوحدات السكنية)، الحمامات، المساحة (`م²`)، الدور، وحالة الفرش.
   - حجب حقول الدفع الإلكتروني (`Vodafone Cash / InstaPay`)، الكوبونات، روابط جروبات واتساب، قنوات تليجرام، ولغة المنيو عن العقارات.
   - إزالة الحقول القديمة غير المنطبقة تلقائيًا عند تبديل التصنيف لمنع تسريب بيانات stale.
   - منع الفقد الصامت للبيانات عند الإغلاق العرضي (`Unsaved Changes Confirmation`) وتوفير آليات إعادة محاولة الرفع الجزئي الفاشل للصور.

3. **سياسة الصور 5–7 للعقارات (`Image Policy`)**:
   - إلزام العقارات بحد أدنى 5 صور وحد أقصى 7 صور مع إبراز شارة «صورة الغلاف» على الصورة الأولى.
   - الحفاظ على حدود باقي الأقسام (1 إلى 3 صور).
   - معالجة رفض الصورة الثامنة بلباقة دون مسح الصور المقبولة السابقة، وتحديث العداد بدقة عند الحذف والإضافة.

4. **عرض العقارات في البطاقات والتفاصيل (`PlaceCard.tsx` & `PlaceDetailsModal.tsx`)**:
   - بطاقة المكان تعرض معلومات القرار المالي والسكني: شريحة الإيجار/التمليك، نوع العقار، السعر المنسق معربًا (`formatEgpPrice`)، والغرف والمساحة.
   - تفاصيل المكان تعرض معرض صور كامل مع تمييز الغلاف، وشبكة مواصفات منظمة تخفي الحقول غير المتوفرة بدقة.
   - قنوات التواصل للعقار تقتصر على الاتصال المباشر والواتساب مع نص استفسار عقاري مخصص.
   - دعم التوافق الرجعي المحافظ (`Graceful Fallback`) للسجلات القديمة التي لا تحتوي تفاصيل إضافية دون أخطاء أو تشويه بصري.

---

## 2. قائمة الملفات المعدّلة والجديدة

| نوع الإجراء | مسار الملف | الوصف الفني |
| :--- | :--- | :--- |
| **معدّل** | `types/index.ts` | إضافة `real_estate` إلى `CategoryType` ودمج `real_estate_details` في واجهة `Place`. |
| **معدّل** | `lib/constants.ts` | تسجيل `real_estate` في مصفوفة `CATEGORIES` وتنظيف `services.subtitle`. |
| **معدّل** | `lib/categories.ts` | تكامل `CATEGORIES_CONFIG` و`CATEGORY_OPTIONS` وعناوين الصور والوصف المخصصة. |
| **معدّل** | `lib/listings/config.ts` | تكوين البروفايلات، ثوابت العقارات، دوال التحقق من صحة المدخلات وتنسيق الأسعار بالجنيه المصري. |
| **جديد** | `components/modals/RealEstateListingFields.tsx` | مكون الحقول الخاصة بالعقارات (نوع العرض، العقار، السعر، الغرف، الفرش...). |
| **معدّل** | `components/modals/AddListingModal.tsx` | إدارة بروفايلات الإضافة، سياسة 5–7 صور، عزل وتطهير الحقول غير المنطبقة. |
| **معدّل** | `components/directory/CategoryBar.tsx` | تصميم شريط التصنيفات بنظام grid مرن متوافق مع 9 عناصر. |
| **معدّل** | `components/directory/PlaceCard.tsx` | إبراز شرائح المواصفات والسعر للعقار، وحجب الدفع الإلكتروني والكوبونات. |
| **معدّل** | `components/directory/PlaceDetailsModal.tsx` | عارض صور 5–7 مع شارة الغلاف، شبكة مواصفات العقار، وحجب قنوات المتاجر. |
| **معدّل** | `app/services/page.tsx` | دعم تصنيف `real_estate` في صفحة الخدمات والتصفية. |
| **جديد** | `tests/category-real-estate-contract.test.mjs` | اختبارات عقد فصل التصنيف واستقلاليته. |
| **جديد** | `tests/listing-form-ux.test.mjs` | اختبارات التحقق من تجربة النماذج وسياسات الصور وحجب الحقول. |
| **جديد** | `tests/real-estate-display.test.mjs` | اختبارات العرض في البطاقات والنوافذ وتنسيق الأسعار والـ fallback. |

---

## 3. Schema الـ TypeScript الدقيقة ومثال JSON المقترح

### أ. الـ TypeScript Interfaces المقترحة

```typescript
export type RealEstateOfferType = 'rent' | 'sale';

export type RealEstatePropertyType =
  | 'apartment'
  | 'villa'
  | 'house'
  | 'shop'
  | 'office'
  | 'land';

export type RealEstateFurnishing =
  | 'furnished'
  | 'semi_furnished'
  | 'unfurnished';

export interface RealEstateDetailsDraft {
  offerType: RealEstateOfferType;
  propertyType: RealEstatePropertyType;
  priceEgp: string; // يُخزن كسلسلة أرقام أو numeric(12,2) في قاعدة البيانات
  rooms?: string;
  bathrooms?: string;
  areaSqm?: string;
  floor?: string;
  furnishing?: RealEstateFurnishing;
}

export interface RealEstatePlacePayload {
  title: string;
  category: 'real_estate';
  phone: string;
  whatsapp?: string;
  address?: string;
  description?: string;
  images: string[]; // مصفوفة روابط الصور (بين 5 إلى 7 صور، الأولى هي الغلاف)
  real_estate_details: RealEstateDetailsDraft;
}
```

### ب. مثال JSON حقيقي للـ Payload

```json
{
  "title": "شقة دوبلكس فاخرة للإيجار بالحي الأول",
  "category": "real_estate",
  "phone": "01012345678",
  "whatsapp": "01012345678",
  "address": "الحي الأول، المجاورة الثانية، عمارة 45",
  "description": "شقة دوبلكس تشطيب سوبر لوكس، قريبة من مجمع الخدمات والمدارس، فيو مفتوح على حديقة.",
  "images": [
    "https://example.supabase.co/storage/v1/object/public/places/real_estate_cover_01.webp",
    "https://example.supabase.co/storage/v1/object/public/places/real_estate_living_02.webp",
    "https://example.supabase.co/storage/v1/object/public/places/real_estate_room1_03.webp",
    "https://example.supabase.co/storage/v1/object/public/places/real_estate_room2_04.webp",
    "https://example.supabase.co/storage/v1/object/public/places/real_estate_kitchen_05.webp"
  ],
  "real_estate_details": {
    "offerType": "rent",
    "propertyType": "apartment",
    "priceEgp": "8500",
    "rooms": "3",
    "bathrooms": "2",
    "areaSqm": "180",
    "floor": "3",
    "furnishing": "semi_furnished"
  }
}
```

---

## 4. جدول الحقول وقواعد التحقق (Validation Rules)

| الحقل | الحالة | القيود وقواعد الـ Validation |
| :--- | :--- | :--- |
| `title` | **إلزامي** | نص غير فارغ، الطول: 3 إلى 120 حرفًا. |
| `category` | **إلزامي** | يجب أن تكون القيمة `real_estate`. |
| `phone` | **إلزامي** | رقم هاتف مصري صحيح (11 رقمًا يبدأ بـ 010/011/012/015). |
| `whatsapp` | اختياري | رقم هاتف مصري صحيح عند توفره. |
| `address` | اختياري | نص بحد أقصى 255 حرفًا. |
| `description` | اختياري | نص وصفي بحد أقصى 1500 حرف. |
| `images` | **إلزامي** | مصفوفة تحتوي على **5 إلى 7 روابط** صور صحيحة (الصورة الأولى تعتبر الغلاف). |
| `offerType` | **إلزامي** | يجب أن يكون أحد الخيارات: `rent` أو `sale`. |
| `propertyType` | **إلزامي** | يجب أن يكون أحد الخيارات: `apartment`, `villa`, `house`, `shop`, `office`, `land`. |
| `priceEgp` | **إلزامي** | رقم موجب أكبر من 0 (بين 1 إلى 999,999,999). |
| `rooms` | **مشروط** | **إلزامي** إذا كان `propertyType` شقة أو فيلا أو منزل؛ رقم بين 1 و50. |
| `bathrooms` | اختياري | رقم بين 1 و20. |
| `areaSqm` | اختياري | رقم موجب بين 1 و100,000 متر مربع. |
| `floor` | اختياري | رقم أو نص يمثل الطابق (مثل 0 للأرضي أو 1–100). |
| `furnishing` | اختياري | خيار من: `furnished`, `semi_furnished`, `unfurnished`. |

---

## 5. جدول سياسة الصور حسب البروفايل (Image Policy Table)

| التصنيف / البروفايل | الحد الأدنى | الحد الأقصى | المتطلبات الخاصة |
| :--- | :---: | :---: | :--- |
| **العقارات (`real_estate`)** | **5** | **7** | الصورة الأولى هي صورة الغلاف الأساسية، يُلزم المستخدم برفع 5 صور على الأقل لضمان اكتمال المعاينة قبل الإرسال. |
| **المطاعم والكافيهات (`restaurants`)** | 1 | 3 | صور المنيو والواجهة. |
| **المتاجر (`stores`)** | 1 | 3 | صور المنتجات وعروض المتجر. |
| **الأعمال اليدوية والمنزلية (`home_made`)** | 1 | 3 | صور المنتجات ونماذج العمل. |
| **السوبرماركت والخضار والصيدليات** | 1 | 3 | صور الواجهة والمكان. |
| **الخدمات والحرف (`services`, `crafts`)** | 1 | 3 | صور مقر الخدمة ونماذج الأعمال. |

---

## 6. نقاط الربط المطلوبة في الـ Backend / Database

لتفعيل حفظ وتعديل ونشر العقارات في قاعدة البيانات بالكامل لاحقًا، يجب تحديث الطبقات التالية:

### أ. الـ Validation في السيرفر (`lib/operations/validation.ts`)
- تحديث الـ Schema لإضافة فئة `real_estate` ضمن الفئات المعتمدة.
- إضافة دالة `validateRealEstateDetails(details, propertyType)` للتحقق من:
  - الحد الأدنى 5 صور والأقصى 7 صور عند `category === 'real_estate'`.
  - إلزامية `offerType` و`propertyType` و`priceEgp`.
  - إلزامية `rooms` للأنواع السكنية (`apartment`, `villa`, `house`).
  - التحقق من عدم وجود مدفوعات إلكترونية أو حقول غير مطابقة للعقار.

### ب. دوال تقديم الطلبات (`lib/operations/actions.ts`)
- تحديث دالة `submitAccountRequest`:
  - استقبال حقل `real_estate_details` داخل الـ payload الممرر للطلب.
  - تخزين بيانات العقار داخل جدول `account_requests` (إما كـ JSONB عمود `metadata / real_estate_details` أو عبر حقول مخصصة).

### ج. جداول قاعدة البيانات المقترحة
- **الخيار المفضل والمستقر (Subtype Table / 1-to-1 Relation)**:
  - إنشاء جدول `place_real_estate` أو `real_estate_details`:
    - `place_id uuid references places(id) on delete cascade primary key`
    - `offer_type text not null check (offer_type in ('rent', 'sale'))`
    - `property_type text not null check (property_type in ('apartment', 'villa', 'house', 'shop', 'office', 'land'))`
    - `price_egp numeric(12,2) not null check (price_egp > 0)`
    - `rooms integer check (rooms >= 0)`
    - `bathrooms integer check (bathrooms >= 0)`
    - `area_sqm numeric(10,2) check (area_sqm > 0)`
    - `floor integer`
    - `furnishing text check (furnishing in ('furnished', 'semi_furnished', 'unfurnished'))`
    - `created_at timestamptz default now()`
- **الخيار البديل السريع**:
  - إضافة عمود `real_estate_details jsonb` إلى جدول `places` وجدول `account_requests`.

### د. دالة الاعتماد والترقية (`approve_account_request`)
- تحديث دالة الـ Postgres RPC `approve_account_request` لتنقل تفاصيل العقار من طلب الحساب (`account_requests`) إلى جدول الأماكن أو جدول التفاصيل العقارية المرتبط تلقائيًا عند الموافقة.

### هـ. استعلامات القراءة (`lib/supabase/queries.ts` & `lib/services/queries.ts`)
- تحديث استعلام جلب الأماكن `fetchPlaces` لعمل `left join` مع جدول تفاصيل العقارات أو استرجاع عمود `real_estate_details` وتعبئته داخل واجهة `Place`.
- التأكد من سلامة كاش الواجهة والاستجابة بدون كسر السجلات القديمة.

### و. إعادة توليد الأنواع (`lib/supabase/database.types.ts`)
- إعادة تشغيل `supabase gen types typescript` بعد تطبيق الـ Migration لتحديث الأنواع تلقائيًا.

### ز. سياسات رفع وربط الصور (`Media Claims & Limits`)
- رفع حد الصور المسموح بربطه في الـ Media Claim RPC إلى 7 صور لطلبات العقارات، مع الحفاظ على حده لـ 3 صور لباقي التصنيفات.
- فحص عناوين الصور في السيرفر للتأكد من أنها تتبع نفس النطاق المصرح به ومطابقة لقيود التخزين.

---

## 7. الاختبارات ونتائج التحقق الفني

تم إجراء تدقيق برمجي واختباري شامل:

```bash
> npm run typecheck
> tsc --noEmit
✔ TypeScript: 0 errors

> npx eslint components app lib types hooks tests
✔ ESLint: 0 errors / 0 warnings

> node --test tests/*.test.mjs
✔ Test Suites: 256 / 256 tests passed (100%)

> npm run build (Next.js Turbopack)
✔ Compiled successfully in 37.8s
✔ Generating static pages (11/11) in 432ms
✔ Build status: Clean 0 errors
```

### الاختبارات المعيارية المغطاة:
1. `tests/category-real-estate-contract.test.mjs`: استقلالية التصنيف وتنظيف قسم الخدمات وعدم التوجيه للـ marketplace.
2. `tests/listing-form-ux.test.mjs`: ظهور الحقول بحسب البروفايل، فرض حد 5–7 صور للعقار، وحجب قنوات الدفع والمجموعات.
3. `tests/real-estate-display.test.mjs`: تنسيق السعر بالجنيه المصري، تفاصيل ومواصفات العقار، وسلامة fallback البيانات القديمة.

---

## 8. القيود المعروفة (Known Constraints)

> [!IMPORTANT]
> **تنبيه فني**: تم إنجاز واجهة المستخدم الأمامية (`Frontend UI / UX / State Management / Client Validation`) بالكامل وبدقة متناهية. **ولكن** حفظ وتعديل ونشر العقارات الجديدة في قاعدة البيانات يتطلب إتمام مرحلة الـ Backend والـ Migrations الموضحة في البند (6) أعلاه، ولا تُعتبر الميزة Production-Ready لقاعدة البيانات الحية إلا بعد تطبيق تلك الـ Migrations.
