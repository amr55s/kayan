import type { ActivityKind, OnboardingDraftData } from './types';

/**
 * The same rules the database enforces on submission, checked step by step so
 * the applicant is told what to fix where they typed it instead of meeting a
 * generic failure on the last screen.
 */

const EGYPT_MOBILE = /^01[0125][0-9]{8}$/u;
const RESIDENTIAL = new Set(['apartment', 'villa', 'house', 'other']);

export function normalizeEgyptMobile(value: string | undefined): string {
  return (value ?? '').replace(/[^0-9]/gu, '').replace(/^20/u, '0');
}

function length(value: string | undefined): number {
  return (value ?? '').trim().length;
}

function integerBetween(value: string | undefined, pattern: RegExp, min: number, max: number): boolean {
  const text = (value ?? '').trim();
  if (!pattern.test(text)) return false;
  const parsed = Number(text);
  return parsed >= min && parsed <= max;
}

export function validateOnboardingBasics(kind: ActivityKind, data: OnboardingDraftData): string | null {
  if (length(data.displayName) < 2) return 'اكتب اسمك (حرفان على الأقل).';
  if (!EGYPT_MOBILE.test(normalizeEgyptMobile(data.phone))) {
    return 'اكتب رقم موبايل مصري صحيح من 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015.';
  }
  if (length(data.whatsapp) > 0 && !EGYPT_MOBILE.test(normalizeEgyptMobile(data.whatsapp))) {
    return 'رقم واتساب غير صحيح. اكتبه 11 رقمًا أو اترك الخانة فارغة.';
  }
  if (kind === 'driver') {
    return length(data.vehicleType) < 2 ? 'اختر وسيلة التوصيل.' : null;
  }
  if (data.placeMode === 'existing' && kind !== 'real_estate') {
    return data.existingPlaceId ? null : 'اختر مكانك من القائمة، أو اختر «إضافة نشاط جديد».';
  }
  if (length(data.name) < 2) return kind === 'real_estate' ? 'اكتب عنوان العرض.' : 'اكتب اسم النشاط (حرفان على الأقل).';
  if (length(data.description) < 2) return 'اكتب وصفًا قصيرًا للنشاط.';
  if (length(data.address) < 5) return 'اكتب العنوان أو المنطقة بتفصيل أكثر (5 أحرف على الأقل).';
  return null;
}

export function validateOnboardingContent(kind: ActivityKind, data: OnboardingDraftData): string | null {
  if (data.product) {
    if (length(data.product.name) < 2) return 'اكتب اسم المنتج، أو اضغط «تأجيل المنتج» لإضافته لاحقًا.';
    const price = (data.product.priceEgp ?? '').trim();
    if (!/^[0-9]{1,7}(?:\.[0-9]{1,2})?$/u.test(price) || Number(price) <= 0) {
      return 'اكتب سعر المنتج بالأرقام الإنجليزية (مثل 150 أو 149.50)، أو أجّل المنتج.';
    }
  }
  if (kind !== 'real_estate') return null;

  const estate = data.realEstate;
  const photos = data.mediaIds?.length ?? 0;
  if (!estate || !['rent', 'sale'].includes(estate.offerType)) return 'اختر نوع العرض: إيجار أو بيع.';
  if (!['apartment', 'villa', 'house', 'shop', 'office', 'land', 'other'].includes(estate.propertyType)) return 'اختر نوع العقار.';
  if (!/^[1-9][0-9]{0,8}$/u.test((estate.priceEgp ?? '').trim())) return 'اكتب السعر رقمًا صحيحًا بالأرقام الإنجليزية بدون فواصل (مثل 850000).';
  if (RESIDENTIAL.has(estate.propertyType) && length(estate.rooms) === 0) return 'اكتب عدد الغرف؛ مطلوب للوحدات السكنية.';
  if (length(estate.rooms) > 0 && !integerBetween(estate.rooms, /^[1-9][0-9]?$/u, 1, 50)) return 'عدد الغرف يجب أن يكون رقمًا من 1 إلى 50.';
  if (length(estate.bathrooms) > 0 && !integerBetween(estate.bathrooms, /^[1-9][0-9]?$/u, 1, 20)) return 'عدد الحمامات يجب أن يكون رقمًا من 1 إلى 20.';
  if (length(estate.areaSqm) > 0 && !integerBetween(estate.areaSqm, /^[1-9][0-9]{0,5}$/u, 1, 100_000)) return 'المساحة يجب أن تكون رقمًا صحيحًا بالمتر المربع بدون كسور.';
  if (length(estate.floor) > 0 && !integerBetween(estate.floor, /^[0-9]{1,3}$/u, 0, 100)) return 'الدور يجب أن يكون رقمًا من 0 إلى 100.';
  if (photos < 5) return `أضف ${5 - photos} صور أخرى؛ العقار يحتاج من 5 إلى 7 صور.`;
  return null;
}

/** First problem that would make the database refuse the submission, if any. */
export function validateOnboardingForSubmit(kind: ActivityKind, data: OnboardingDraftData): string | null {
  return validateOnboardingBasics(kind, data) ?? validateOnboardingContent(kind, data);
}
