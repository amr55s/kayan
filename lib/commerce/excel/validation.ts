import {
  PRODUCT_WORKBOOK_LIMITS,
  type ProductWorkbookStatus,
} from './contract.ts';

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

const HEADER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  product_key: 'product_key',
  productkey: 'product_key',
  key: 'product_key',
  كود_المنتج: 'product_key',
  معرف_المنتج: 'product_key',
  name: 'name',
  product_name: 'name',
  اسم: 'name',
  الاسم: 'name',
  اسم_المنتج: 'name',
  category: 'category',
  التصنيف: 'category',
  الفئه: 'category',
  القسم: 'category',
  brand: 'brand',
  الماركه: 'brand',
  العلامه_التجاريه: 'brand',
  description: 'description',
  الوصف: 'description',
  وصف: 'description',
  status: 'status',
  الحاله: 'status',
  sku: 'sku',
  كود_sku: 'sku',
  كود_المخزون: 'sku',
  option_1_name: 'option_1_name',
  option1_name: 'option_1_name',
  اسم_الخيار_1: 'option_1_name',
  option_1_value: 'option_1_value',
  option1_value: 'option_1_value',
  قيمه_الخيار_1: 'option_1_value',
  option_2_name: 'option_2_name',
  option2_name: 'option_2_name',
  اسم_الخيار_2: 'option_2_name',
  option_2_value: 'option_2_value',
  option2_value: 'option_2_value',
  قيمه_الخيار_2: 'option_2_value',
  price_egp: 'price_egp',
  price: 'price_egp',
  السعر: 'price_egp',
  السعر_بالجنيه: 'price_egp',
  compare_at_price_egp: 'compare_at_price_egp',
  compare_price: 'compare_at_price_egp',
  السعر_قبل_الخصم: 'compare_at_price_egp',
  stock: 'stock',
  quantity: 'stock',
  المخزون: 'stock',
  الكميه: 'stock',
  active: 'active',
  نشط: 'active',
  فعال: 'active',
  image_url: 'image_url',
  url: 'image_url',
  رابط_الصوره: 'image_url',
  الصوره: 'image_url',
  position: 'position',
  order: 'position',
  الترتيب: 'position',
  alt_text: 'alt_text',
  alt: 'alt_text',
  النص_البديل: 'alt_text',
});

export function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
}

export function normalizeArabicText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function normalizeHeader(value: unknown): string | null {
  const raw = cellText(value);
  if (!raw) return null;

  const normalized = normalizeArabicText(raw)
    .toLocaleLowerCase('en-US')
    .replace(/[\s\-./\\]+/g, '_')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return HEADER_ALIASES[normalized] ?? normalized;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return '';

  if (typeof value === 'object') {
    const candidate = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
      hyperlink?: unknown;
    };
    if (typeof candidate.text === 'string') return candidate.text.trim();
    if (Array.isArray(candidate.richText)) {
      return candidate.richText
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }
  }
  return '';
}

export function normalizeProductKey(value: unknown): string | null {
  const key = normalizeIdentifier(cellText(value), 'lower');
  if (!key || key.length > PRODUCT_WORKBOOK_LIMITS.maxIdentifierCharacters) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(key) ? key : null;
}

export function normalizeSku(value: unknown): string | null {
  const sku = normalizeIdentifier(cellText(value), 'upper');
  if (!sku || sku.length > 64) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(sku) ? sku : null;
}

function normalizeIdentifier(value: string, casing: 'lower' | 'upper'): string {
  const normalized = normalizeArabicText(normalizeArabicDigits(value))
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return casing === 'lower'
    ? normalized.toLocaleLowerCase('en-US')
    : normalized.toLocaleUpperCase('en-US');
}

export function parseEgpToPiastres(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const piastres = Math.round(value * 100);
    return Number.isSafeInteger(piastres) && Math.abs(value * 100 - piastres) < 1e-7
      ? piastres
      : null;
  }

  let normalized = normalizeArabicDigits(cellText(value))
    .replace(/ج\.?\s*م\.?|egp/gi, '')
    .replace(/\s+/g, '')
    .replace(/٬/g, ',')
    .replace(/٫/g, '.');

  if (!normalized || /[eE]/.test(normalized)) return null;
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const pieces = normalized.split(',');
    if (pieces.length === 2 && pieces[1]!.length <= 2) {
      normalized = `${pieces[0]}.${pieces[1]}`;
    } else if (pieces.slice(1).every((piece) => piece.length === 3)) {
      normalized = pieces.join('');
    } else {
      return null;
    }
  }

  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  if (match[1] === '-') return null;
  const whole = Number(match[2]);
  const fractional = Number((match[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fractional)) return null;
  const piastres = whole * 100 + fractional;
  if (!Number.isSafeInteger(piastres) || piastres > 1_000_000_000) return null;
  return piastres;
}

export function parseNonNegativeInteger(value: unknown, maximum = 1_000_000): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
  }
  const normalized = normalizeArabicDigits(cellText(value)).replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function parseWorkbookBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  const normalized = normalizeArabicText(normalizeArabicDigits(cellText(value))).toLocaleLowerCase('en-US');
  if (['1', 'true', 'yes', 'y', 'نعم', 'نشط', 'فعال'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'لا', 'غير_نشط', 'غير نشط'].includes(normalized)) return false;
  return null;
}

export function parseWorkbookStatus(value: unknown): ProductWorkbookStatus | null {
  const normalized = normalizeArabicText(cellText(value))
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, '_');
  const aliases: Record<string, ProductWorkbookStatus> = {
    draft: 'draft',
    مسوده: 'draft',
    pending_review: 'pending_review',
    pending: 'pending_review',
    قيد_المراجعه: 'pending_review',
    active: 'active',
    نشط: 'active',
    archived: 'archived',
    مؤرشف: 'archived',
  };
  return aliases[normalized] ?? null;
}

export function sanitizeSpreadsheetText(value: unknown): string {
  const cleaned = cellText(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return /^[\u0000-\u0020]*[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export function safeIssueValue(value: unknown): string | undefined {
  const text = cellText(value).replace(/[\r\n\t]+/g, ' ');
  if (!text) return undefined;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
